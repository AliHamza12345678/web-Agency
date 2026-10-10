import { describe, it, expect } from 'vitest';
import { extractPageContent } from '../crawler/html-extractor.js';

describe('HTML Content Extractor & Sanitizer', () => {
  it('strips scripts, styles, nav, and footers while extracting clean text', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Return Policy - MyStore</title>
          <meta name="description" content="Official 30-day return policy and warranty guidelines.">
          <style>body { color: red; }</style>
          <script>console.log("analytics tracking");</script>
        </head>
        <body>
          <nav><a href="/">Home</a><a href="/catalog">Catalog</a></nav>
          <header><h1>Header Navigation</h1></header>
          <main>
            <h2>Return Policy Overview</h2>
            <p>Customers can return unworn items within <strong>30 days</strong> of purchase.</p>
            <p>All items must include the original packaging and tags &amp; receipts.</p>
          </main>
          <footer><p>&copy; 2026 MyStore Inc. All rights reserved.</p></footer>
        </body>
      </html>
    `;

    const res = extractPageContent(html, 'https://mystore.com/returns');

    expect(res.title).toBe('Return Policy - MyStore');
    expect(res.text).toContain('Official 30-day return policy');
    expect(res.text).toContain('within 30 days of purchase');
    expect(res.text).toContain('tags & receipts');

    // Verify removed tags
    expect(res.text).not.toContain('analytics tracking');
    expect(res.text).not.toContain('body { color: red; }');
    expect(res.text).not.toContain('All rights reserved');
    expect(res.headings).toContain('Return Policy Overview');
  });

  it('decodes HTML entities correctly', () => {
    const html = '<p>Price is &pound;50 &amp; shipping is free &gt; $100</p>';
    const res = extractPageContent(html, 'https://store.com');

    expect(res.text).toContain('Price is £50 & shipping is free > $100');
  });
});
