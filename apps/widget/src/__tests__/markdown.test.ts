import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown, escapeHtml } from '../markdown.js';

describe('Safe Markdown Parser & XSS Sanitization', () => {
  describe('HTML Entity Escaping', () => {
    it('escapes dangerous HTML characters', () => {
      const raw = '<script>alert("xss")</script>&<img src="x" onerror="evil()"/>';
      const escaped = escapeHtml(raw);

      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('<img');
      expect(escaped).toContain('&lt;script&gt;');
      expect(escaped).toContain('&lt;img');
    });
  });

  describe('renderSafeMarkdown', () => {
    it('neutralizes malicious XSS payload attempts in chatbot responses', () => {
      const maliciousPayload = `Hello! <script>alert('pwned')</script> <img src=x onerror=alert(1)>`;
      const result = renderSafeMarkdown(maliciousPayload);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;script&gt;');
    });

    it('sanitizes malicious javascript: or data: URIs in markdown links', () => {
      const maliciousLink = `[Click here for free reward](javascript:stealTokens())`;
      const result = renderSafeMarkdown(maliciousLink);

      expect(result).not.toContain('<a href="javascript:');
      expect(result).toContain('Click here for free reward (javascript:stealTokens())');
    });

    it('renders valid HTTPS hyperlinks with target="_blank" and rel="noopener noreferrer"', () => {
      const validLink = `For documentation, see [our docs](https://example.com/docs).`;
      const result = renderSafeMarkdown(validLink);

      expect(result).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer" class="oa-link">our docs</a>');
    });

    it('correctly parses bold and italic text', () => {
      const text = `This is **bold text** and this is *italic text*.`;
      const result = renderSafeMarkdown(text);

      expect(result).toContain('<strong>bold text</strong>');
      expect(result).toContain('<em>italic text</em>');
    });

    it('formats fenced code blocks safely', () => {
      const codeSnippet = "Here is some code:\n```typescript\nconst x: number = 42;\nconsole.log(x);\n```";
      const result = renderSafeMarkdown(codeSnippet);

      expect(result).toContain('<pre class="oa-code-block"><code>const x: number = 42;\nconsole.log(x);</code></pre>');
    });

    it('formats bullet lists properly', () => {
      const listText = "Our features:\n- Fast streaming\n- Grounded knowledge\n- Secure tenant isolation";
      const result = renderSafeMarkdown(listText);

      expect(result).toContain('<ul class="oa-list">');
      expect(result).toContain('<li class="oa-list-item">Fast streaming</li>');
      expect(result).toContain('<li class="oa-list-item">Grounded knowledge</li>');
    });
  });
});
