import { describe, it, expect } from 'vitest';
import { validateEnv } from '../env.js';

describe('validateEnv', () => {
  const validMinimalEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
    JWT_SECRET: 'super_secret_jwt_key_at_least_16_chars_long',
    ENCRYPTION_KEY: 'encryption_secret_key_16_chars_min',
  };

  it('successfully parses valid environment configuration with defaults', () => {
    const env = validateEnv(validMinimalEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.DATABASE_URL).toBe(validMinimalEnv.DATABASE_URL);
    expect(env.JWT_SECRET).toBe(validMinimalEnv.JWT_SECRET);
    expect(env.ENCRYPTION_KEY).toBe(validMinimalEnv.ENCRYPTION_KEY);
    expect(env.RATE_LIMIT_PER_MINUTE_IP).toBe(30);
  });

  it('throws a descriptive error when required variables are missing', () => {
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL is required/);
  });

  it('throws an error when JWT_SECRET is too short', () => {
    const shortJwtEnv = {
      ...validMinimalEnv,
      JWT_SECRET: 'short',
    };

    expect(() => validateEnv(shortJwtEnv)).toThrowError(/JWT_SECRET must be at least 16 characters/);
  });

  it('coerces numeric variables properly', () => {
    const envWithNumbers = {
      ...validMinimalEnv,
      PORT: '8080',
      RATE_LIMIT_PER_MINUTE_IP: '50',
    };

    const env = validateEnv(envWithNumbers);
    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_PER_MINUTE_IP).toBe(50);
  });
});
