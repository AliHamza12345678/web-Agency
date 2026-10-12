/**
 * Privacy & Compliance: PII and Secret Redactor.
 * Automatically masks personal and sensitive credentials from transcripts and logs.
 */

// Common sensitive patterns
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{15,16}\b/g;
const API_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9_]{20,}|ghp_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g;
const BEARER_REGEX = /Bearer\s+[a-zA-Z0-9_\-.]+/gi;

/**
 * Redacts emails, phone numbers, credit card numbers, SSNs, and API keys/tokens from text.
 */
export function redactPii(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(BEARER_REGEX, 'Bearer [SECRET_REDACTED]')
    .replace(API_KEY_REGEX, '[SECRET_REDACTED]')
    .replace(CREDIT_CARD_REGEX, '[CARD_REDACTED]')
    .replace(SSN_REGEX, '[SSN_REDACTED]')
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
    .replace(PHONE_REGEX, '[PHONE_REDACTED]');
}

/**
 * Checks whether text contains likely personally identifiable information or secrets.
 */
export function containsPii(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  return (
    EMAIL_REGEX.test(text) ||
    PHONE_REGEX.test(text) ||
    SSN_REGEX.test(text) ||
    CREDIT_CARD_REGEX.test(text) ||
    API_KEY_REGEX.test(text) ||
    BEARER_REGEX.test(text)
  );
}

/**
 * Estimates token count for text using the industry standard heuristic (~4 characters per token).
 * Explicitly labeled as an estimate.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}
