/**
 * Security Sanitizer & Output Bounding
 * Protects against prompt injection, unconstrained memory stuffing,
 * and malicious document payload leaks.
 */

const INJECTION_PATTERNS = [
  /system\s*:/gi,
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?prior\s+instructions/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[SYSTEM\]/gi,
  /\[INSTRUCTION\]/gi,
  /<system_override>/gi,
  /you\s+are\s+now\s+in\s+developer\s+mode/gi,
  /new\s+system\s+prompt\s*:/gi,
];

/**
 * Strips prompt injection cues from tool/document outputs to prevent
 * indirect prompt injection attacks.
 */
export function sanitizeTextForModel(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_OVERRIDE_ATTEMPT]');
  }

  // Remove potential null bytes and control chars (except newline and tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Recursively bounds object output sizes and sanitizes strings.
 */
export function sanitizeAndBoundOutput<T>(data: T, maxTotalChars = 4000, maxArrayItems = 10): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    const sanitized = sanitizeTextForModel(data);
    if (sanitized.length > maxTotalChars) {
      return (sanitized.slice(0, maxTotalChars) + '... [TRUNCATED]') as unknown as T;
    }
    return sanitized as unknown as T;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    const boundedArray = data.slice(0, maxArrayItems).map((item) =>
      sanitizeAndBoundOutput(item, Math.floor(maxTotalChars / Math.max(data.length, 1)), maxArrayItems)
    );
    return boundedArray as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Do not allow sensitive credential keys to ever be emitted
      if (/password|secret|apikey|token|auth|credential/i.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeAndBoundOutput(value, Math.floor(maxTotalChars / 2), maxArrayItems);
      }
    }
    return result as T;
  }

  return data;
}
