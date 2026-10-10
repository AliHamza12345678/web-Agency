import { describe, it, expect } from 'vitest';
import { RobotsParser } from '../crawler/robots-parser.js';
import { parseSitemapXml } from '../crawler/sitemap-parser.js';

describe('Robots.txt & Sitemap Parsers', () => {
  it('respects robots.txt disallow rules for bots', () => {
    const robotsTxt = `
User-agent: *
Disallow: /admin
Disallow: /checkout/
Disallow: /private-area

User-agent: Googlebot
Disallow: /internal
    `;

    const parser = new RobotsParser(robotsTxt);
    expect(parser.isAllowed('/products/shoes')).toBe(true);
    expect(parser.isAllowed('/admin/login')).toBe(false);
    expect(parser.isAllowed('/checkout/payment')).toBe(false);
  });

  it('parses XML sitemap <loc> URLs and sub-sitemaps', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/page1</loc>
          <lastmod>2026-01-01</lastmod>
        </url>
        <url>
          <loc>https://example.com/page2</loc>
        </url>
        <url>
          <loc>https://example.com/blog-sitemap.xml</loc>
        </url>
      </urlset>
    `;

    const res = parseSitemapXml(xml);
    expect(res.urls).toContain('https://example.com/page1');
    expect(res.urls).toContain('https://example.com/page2');
    expect(res.subSitemaps).toContain('https://example.com/blog-sitemap.xml');
  });
});
