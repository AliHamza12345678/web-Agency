/**
 * Ultra-safe, zero-dependency Markdown parser and XSS sanitizer for AI chatbot streaming responses.
 * Enforces strict HTML escaping prior to formatting to prevent script injection.
 */
export declare function escapeHtml(str: string): string;
export declare function isValidUrl(url: string): boolean;
/**
 * Parses markdown into safe, sanitized HTML without allowing XSS or malicious URI schemes.
 */
export declare function renderSafeMarkdown(content: string): string;
//# sourceMappingURL=markdown.d.ts.map