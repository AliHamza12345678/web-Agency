import dns from 'node:dns/promises';
import { ValidationError, ForbiddenError } from '@openagent/core';

export class SSRFSecurityError extends ForbiddenError {
  constructor(message: string) {
    super(`SSRF Security Guard: ${message}`);
    this.name = 'SSRFSecurityError';
  }
}

/**
 * Checks whether an IPv4 string belongs to RFC 1918, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP treated as unsafe
  }

  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / AWS/GCP/Azure Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 & 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address string belongs to loopback, link-local, or unique local ranges.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Loopback (::1) or Unspecified (::)
  if (normalized === '::1' || normalized === '::') return true;

  // Unique Local Address (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-Local (fe80::/10 -> fe8, fe9, fea, feb)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.includes('::ffff:')) {
    const ipv4Part = normalized.split('::ffff:')[1];
    if (ipv4Part && isPrivateOrReservedIPv4(ipv4Part)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that a hostname or IP is strictly safe and not an internal destination.
 */
export async function validateHostSafety(hostname: string): Promise<string> {
  const lower = hostname.toLowerCase().trim();

  // Known blacklisted hostnames & cloud metadata services
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === 'metadata.google.internal' ||
    lower === 'instance-data'
  ) {
    throw new SSRFSecurityError(`Target host '${hostname}' is a reserved internal or cloud metadata name.`);
  }

  // If host is a direct IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
    if (isPrivateOrReservedIPv4(lower)) {
      throw new SSRFSecurityError(`Target IP '${lower}' is in a private or reserved IPv4 range.`);
    }
    return lower;
  }

  if (lower.includes(':')) {
    if (isPrivateOrReservedIPv6(lower)) {
      throw new SSRFSecurityError(`Target IP '${lower}' is in a private or reserved IPv6 range.`);
    }
    return lower;
  }

  // Resolve DNS to verify the underlying resolved IP
  try {
    const lookup = await dns.lookup(hostname);
    const resolvedIp = lookup.address;

    if (lookup.family === 4) {
      if (isPrivateOrReservedIPv4(resolvedIp)) {
        throw new SSRFSecurityError(`Resolved IP '${resolvedIp}' for host '${hostname}' is in a private network.`);
      }
    } else if (lookup.family === 6) {
      if (isPrivateOrReservedIPv6(resolvedIp)) {
        throw new SSRFSecurityError(`Resolved IPv6 '${resolvedIp}' for host '${hostname}' is in a private network.`);
      }
    }

    return resolvedIp;
  } catch (err: any) {
    if (err instanceof SSRFSecurityError) throw err;
    throw new ValidationError(`Could not resolve DNS for host '${hostname}': ${err.message}`);
  }
}

/**
 * Validates that a target URL conforms to allowed schemes, safe destinations, and domain allowlists.
 */
export async function validateUrl(rawUrl: string, allowedDomains: string[] = []): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError(`Invalid URL format: '${rawUrl}'`);
  }

  // Only HTTP and HTTPS are permitted
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFSecurityError(`Disallowed protocol '${parsed.protocol}'. Only http: and https: are allowed.`);
  }

  // Check domain allowlist if configured
  if (allowedDomains.length > 0) {
    const isDomainAllowed = allowedDomains.some((d) => {
      const cleanDomain = d.replace(/^https?:\/\//, '').split('/')[0]!.toLowerCase();
      if (cleanDomain === '*' || cleanDomain === parsed.hostname.toLowerCase()) return true;
      if (cleanDomain.startsWith('*.') && parsed.hostname.toLowerCase().endsWith(cleanDomain.slice(2))) return true;
      return false;
    });

    if (!isDomainAllowed) {
      throw new ForbiddenError(`URL host '${parsed.hostname}' is not authorized by the website domain allowlist.`);
    }
  }

  // Validate Host and resolved IP safety
  await validateHostSafety(parsed.hostname);

  return parsed;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  allowedDomains?: string[];
  maxRedirects?: number;
}

export interface SafeFetchResponse {
  url: string;
  statusCode: number;
  contentType: string;
  bodyText: string;
}

/**
 * Safe fetcher that protects against SSRF, redirects to internal IPs, response bombs, and hanging sockets.
 */
export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const maxBytes = options.maxBytes || 5 * 1024 * 1024; // 5 MB max
  const timeoutMs = options.timeoutMs || 10000; // 10s timeout
  const allowedDomains = options.allowedDomains || [];
  const maxRedirects = options.maxRedirects ?? 5;

  let currentUrl = targetUrl;
  let redirectsFollowed = 0;

  while (redirectsFollowed <= maxRedirects) {
    // 1. Re-validate URL and DNS at each redirect hop
    const validated = await validateUrl(currentUrl, allowedDomains);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(validated.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'OpenAgent-Bot/1.0 (+https://openagent.chat)',
          Accept: 'text/html,application/xhtml+xml,application/xml,text/plain,text/markdown,*/*;q=0.8',
        },
        redirect: 'manual', // Manually inspect every redirect hop
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      throw new ValidationError(`Failed to fetch '${currentUrl}': ${err.message}`);
    }

    clearTimeout(timeout);

    // 2. Handle HTTP Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      redirectsFollowed++;
      if (redirectsFollowed > maxRedirects) {
        throw new ValidationError(`Exceeded maximum redirect limit of ${maxRedirects}.`);
      }

      const location = res.headers.get('location');
      if (!location) {
        throw new ValidationError(`Redirect response from '${currentUrl}' lacked a Location header.`);
      }

      // Resolve relative redirect against current URL
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!res.ok) {
      throw new ValidationError(`HTTP error ${res.status} when fetching '${currentUrl}'`);
    }

    // 3. Content Type Inspection
    const contentType = res.headers.get('content-type') || 'text/html';
    const isAcceptedType =
      contentType.includes('text/html') ||
      contentType.includes('text/plain') ||
      contentType.includes('text/markdown') ||
      contentType.includes('application/xml') ||
      contentType.includes('text/xml') ||
      contentType.includes('application/xhtml+xml');

    if (!isAcceptedType) {
      throw new ValidationError(`Unsupported Content-Type '${contentType}'. Only HTML, XML, Markdown, and text are accepted.`);
    }

    // 4. Content Length Check
    const contentLength = Number(res.headers.get('content-length'));
    if (contentLength && contentLength > maxBytes) {
      throw new ValidationError(`Resource size (${contentLength} bytes) exceeds limit of ${maxBytes} bytes.`);
    }

    // 5. Bounded Stream Consumption
    if (!res.body) {
      return { url: currentUrl, statusCode: res.status, contentType, bodyText: '' };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.length;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new ValidationError(`Content stream exceeded maximum allowable limit of ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }

    const totalBuffer = Buffer.concat(chunks);
    const bodyText = totalBuffer.toString('utf-8');

    return {
      url: currentUrl,
      statusCode: res.status,
      contentType,
      bodyText,
    };
  }

  throw new ValidationError(`Too many redirects encountered while fetching '${targetUrl}'.`);
}
