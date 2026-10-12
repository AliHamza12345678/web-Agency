import { describe, it, expect } from 'vitest';
import { redactPii, containsPii, estimateTokens } from '../index.js';

describe('Phase 9: PII Redaction & Token Estimation', () => {
  it('redacts email addresses accurately', () => {
    const input = 'My email is alice.smith+support@corp.example.co.uk please reach out.';
    const output = redactPii(input);
    expect(output).not.toContain('alice.smith');
    expect(output).toContain('[EMAIL_REDACTED]');
  });

  it('redacts phone numbers across multiple formats', () => {
    const inputs = [
      'Call me at 555-123-4567 tomorrow.',
      'Mobile: (800) 555-0199.',
      'International: +1 415 555 2671',
    ];

    for (const inp of inputs) {
      const redacted = redactPii(inp);
      expect(redacted).toContain('[PHONE_REDACTED]');
    }
  });

  it('redacts credit card numbers and SSNs', () => {
    const cardInput = 'Payment info: 4532-1234-5678-9012 exp 12/28';
    expect(redactPii(cardInput)).toContain('[CARD_REDACTED]');

    const ssnInput = 'My SSN identifier is 000-12-3456';
    expect(redactPii(ssnInput)).toContain('[SSN_REDACTED]');
  });

  it('redacts API keys and Bearer tokens to protect secrets', () => {
    const keyInput = 'Client sent sk-live123456789012345678901234 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const redacted = redactPii(keyInput);
    expect(redacted).not.toContain('sk-live');
    expect(redacted).toContain('[SECRET_REDACTED]');
    expect(redacted).toContain('Bearer [SECRET_REDACTED]');
  });

  it('detects when text contains PII', () => {
    expect(containsPii('Hello, how are you?')).toBe(false);
    expect(containsPii('Contact me at bob@example.com')).toBe(true);
    expect(containsPii('My number is 555-321-4321')).toBe(true);
  });

  it('estimates token count using conservative character heuristic (~4 chars/token)', () => {
    expect(estimateTokens('Hello world')).toBe(3); // 11 chars -> 3 tokens
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
  });
});
