import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from '../logger.js';

describe('redactSensitiveData', () => {
  it('redacts sensitive object keys regardless of casing', () => {
    const sensitivePayload = {
      user: 'alice',
      password: 'superSecretPassword123',
      apiKey: 'xyz-api-token',
      nested: {
        DATABASE_URL: 'postgresql://postgres:secret@db:5432/db',
        gemini_api_key: 'AIzaSyExampleKey',
        publicField: 'safe data',
      },
    };

    const redacted = redactSensitiveData(sensitivePayload) as any;

    expect(redacted.user).toBe('alice');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.DATABASE_URL).toBe('[REDACTED]');
    expect(redacted.nested.gemini_api_key).toBe('[REDACTED]');
    expect(redacted.nested.publicField).toBe('safe data');
  });

  it('redacts Bearer tokens within authorization strings', () => {
    const rawString = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.header.signature';
    const redacted = redactSensitiveData(rawString);

    expect(redacted).toBe('Bearer [REDACTED]');
  });

  it('handles arrays and primitive values cleanly', () => {
    const arrayPayload = [
      { token: 'secret-token-1' },
      { name: 'regular-item' },
    ];

    const redacted = redactSensitiveData(arrayPayload) as any[];
    expect(redacted[0].token).toBe('[REDACTED]');
    expect(redacted[1].name).toBe('regular-item');
  });
});
