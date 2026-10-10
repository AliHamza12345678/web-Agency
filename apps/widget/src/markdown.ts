/**
 * Ultra-safe, zero-dependency Markdown parser and XSS sanitizer for AI chatbot streaming responses.
 * Enforces strict HTML escaping prior to formatting to prevent script injection.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Parses markdown into safe, sanitized HTML without allowing XSS or malicious URI schemes.
 */
export function renderSafeMarkdown(content: string): string {
  if (!content) return '';

  // 1. Sanitize all raw HTML entities first
  let html = escapeHtml(content);

  // 2. Fenced Code Blocks: ```code```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="oa-code-block"><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline Code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="oa-inline-code">$1</code>');

  // 4. Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 5. Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 6. Safe Hyperlinks: [label](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    // Unescape &amp; in URL for validation
    const rawUrl = url.replace(/&amp;/g, '&');
    if (isValidUrl(rawUrl)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="oa-link">${label}</a>`;
    }
    // If invalid (e.g. javascript: or data:), render as plain text
    return `${label} (${url})`;
  });

  // 7. Bullet Lists: lines starting with "- " or "* "
  html = html.replace(/(?:^|\n)[-*]\s+([^\n]+)/g, '<li class="oa-list-item">$1</li>');
  html = html.replace(/(<li class="oa-list-item">[\s\S]*?<\/li>)/g, '<ul class="oa-list">$1</ul>');
  // Clean up nested ul duplicates
  html = html.replace(/<\/ul>\s*<ul class="oa-list">/g, '');

  // 8. Line breaks (preserve single enters as <br/> unless inside pre)
  html = html.replace(/\n/g, '<br/>');

  // Clean redundant <br/> tags around code blocks and lists
  html = html.replace(/<pre class="oa-code-block">([\s\S]*?)<\/pre>/g, (m) => m.replace(/<br\/>/g, '\n'));
  html = html.replace(/<br\/>\s*(<\/?(ul|li|pre))/g, '$1');
  html = html.replace(/(<\/(ul|li|pre)>)\s*<br\/>/g, '$1');

  return html;
}
