import type { ExtractedPageContent } from '../types.js';

/**
 * Decodes common HTML entities into their character representation.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&pound;/g, '£')
    .replace(/&euro;/g, '€')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Strips script tags, navigation boilerplate, headers, footers, and extracts clean page text.
 */
export function extractPageContent(html: string, pageUrl: string): ExtractedPageContent {
  // 1. Extract Page Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch ? decodeHtmlEntities(titleMatch[1]!.trim()) : '';

  // 2. Extract Meta Description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const metaDesc = metaMatch ? decodeHtmlEntities(metaMatch[1]!.trim()) : '';

  if (!title) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    title = h1Match ? decodeHtmlEntities(h1Match[1]!.replace(/<[^>]+>/g, '').trim()) : pageUrl;
  }

  // 3. Remove non-content structural elements
  let cleanHtml = html
    .replace(/<!--[\s\S]*?-->/g, '') // comments
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');

  // 4. Extract headings
  const headings: string[] = [];
  const headingMatches = cleanHtml.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi);
  for (const match of headingMatches) {
    const hText = decodeHtmlEntities(match[2]!.replace(/<[^>]+>/g, '').trim());
    if (hText.length > 0 && !headings.includes(hText)) {
      headings.push(hText);
    }
  }

  // 5. Extract Links
  const links: string[] = [];
  const linkMatches = cleanHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi);
  for (const match of linkMatches) {
    const rawHref = match[1]!.trim();
    if (rawHref && !rawHref.startsWith('#') && !rawHref.startsWith('javascript:')) {
      try {
        const resolved = new URL(rawHref, pageUrl).toString();
        if (!links.includes(resolved)) {
          links.push(resolved);
        }
      } catch {
        // Skip malformed link
      }
    }
  }

  // 6. Convert structural tags into linebreaks
  cleanHtml = cleanHtml
    .replace(/<(?:p|div|section|article|li|tr|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '); // remove remaining HTML tags

  // 7. Decode entities and clean spacing
  const rawLines = decodeHtmlEntities(cleanHtml).split('\n');
  const cleanedLines: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed.length > 0) {
      cleanedLines.push(trimmed);
    }
  }

  let text = cleanedLines.join('\n');
  if (metaDesc && !text.includes(metaDesc)) {
    text = `${metaDesc}\n\n${text}`;
  }

  return {
    url: pageUrl,
    title,
    text,
    headings,
    links,
  };
}
