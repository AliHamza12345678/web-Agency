import { safeFetch } from './ssrf-guard.js';

export interface SitemapParseResult {
  urls: string[];
  subSitemaps: string[];
}

/**
 * Parses XML sitemap content and extracts <loc> URLs.
 */
export function parseSitemapXml(xmlContent: string): SitemapParseResult {
  const urls: string[] = [];
  const subSitemaps: string[] = [];

  // Match all <loc> tags
  const locMatches = xmlContent.matchAll(/<loc>([\s\S]*?)<\/loc>/gi);

  for (const match of locMatches) {
    const rawUrl = match[1]!.trim();
    if (!rawUrl) continue;

    if (rawUrl.endsWith('.xml') || rawUrl.includes('/sitemap')) {
      if (!subSitemaps.includes(rawUrl)) {
        subSitemaps.push(rawUrl);
      }
    } else {
      if (!urls.includes(rawUrl)) {
        urls.push(rawUrl);
      }
    }
  }

  return { urls, subSitemaps };
}

/**
 * Fetches and parses a remote sitemap XML with SSRF protections.
 */
export async function fetchAndParseSitemap(
  sitemapUrl: string,
  allowedDomains: string[] = [],
  maxUrls = 100
): Promise<string[]> {
  const resultUrls: string[] = [];
  const visitedSitemaps = new Set<string>();
  const queue: string[] = [sitemapUrl];

  while (queue.length > 0 && resultUrls.length < maxUrls) {
    const current = queue.shift()!;
    if (visitedSitemaps.has(current)) continue;
    visitedSitemaps.add(current);

    try {
      const response = await safeFetch(current, {
        allowedDomains,
        timeoutMs: 10000,
        maxBytes: 2 * 1024 * 1024,
      });

      const { urls, subSitemaps } = parseSitemapXml(response.bodyText);

      for (const u of urls) {
        if (!resultUrls.includes(u) && resultUrls.length < maxUrls) {
          resultUrls.push(u);
        }
      }

      for (const sub of subSitemaps) {
        if (!visitedSitemaps.has(sub) && queue.length < 10) {
          queue.push(sub);
        }
      }
    } catch {
      // Continue with remaining urls if a sub-sitemap fails
    }
  }

  return resultUrls;
}
