import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signJwt, verifyJwt } from '../auth.js';
import { UnauthorizedError } from '../errors.js';

describe('Authentication Utilities', () => {
  describe('Password Hashing & Verification', () => {
    it('generates scrypt hash and verifies valid password successfully', async () => {
      const password = 'SuperSecurePassword#123';
      const hash = await hashPassword(password);

      expect(hash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect passwords', async () => {
      const hash = await hashPassword('CorrectPassword123');
      const isValid = await verifyPassword('WrongPassword123', hash);
      expect(isValid).toBe(false);
    });

    it('enforces minimum password length of 8 characters', async () => {
      await expect(hashPassword('short')).rejects.toThrowError(/at least 8 characters/);
    });
  });

  describe('JWT Session Tokens', () => {
    const testSecret = 'super_secret_test_key_with_at_least_32_characters!';
    const userPayload = {
      userId: 'usr_12345',
      email: 'admin@openagent.com',
      name: 'Admin User',
      isSuperAdmin: false,
    };

    it('signs and verifies a valid JWT payload', () => {
      const token = signJwt(userPayload, testSecret, 3600);
      const decoded = verifyJwt<typeof userPayload>(token, testSecret);

      expect(decoded.userId).toBe(userPayload.userId);
      expect(decoded.email).toBe(userPayload.email);
    });

    it('throws UnauthorizedError when secret is wrong', () => {
      const token = signJwt(userPayload, testSecret, 3600);
      expect(() => verifyJwt(token, 'wrong_secret_key_1234567890123456')).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when token has expired', () => {
      // Expires immediately (-10 seconds)
      const expiredToken = signJwt(userPayload, testSecret, -10);
      expect(() => verifyJwt(expiredToken, testSecret)).toThrowError(/expired/);
    });

    it('throws UnauthorizedError for malformed tokens', () => {
      expect(() => verifyJwt('not.a.valid.jwt', testSecret)).toThrow(UnauthorizedError);
    });
  });
});
