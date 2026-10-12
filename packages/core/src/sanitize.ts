/**
 * Security sanitization helpers for user-provided configuration strings, URLs, and domains.
 */

/**
 * Strips dangerous HTML tags, inline event handlers, and script protocols.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^ >]+/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Validates and sanitizes a URL.
 * Only HTTP and HTTPS protocols are permitted.
 * Returns null or undefined if invalid or unsafe.
 */
export function sanitizeUrl(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a domain name (e.g., 'https://Sub.Example.COM/path' -> 'sub.example.com').
 */
export function normalizeDomain(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim().toLowerCase();
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      str = new URL(str).hostname;
    } catch {
      return null;
    }
  } else {
    // Strip trailing slashes and paths if provided
    const firstPart = str.split('/')[0];
    if (!firstPart) return null;
    const hostPart = firstPart.split(':')[0];
    if (!hostPart) return null;
    str = hostPart;
  }

  // Basic domain regex validation
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  return domainRegex.test(str) ? str : null;
}
