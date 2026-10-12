import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { signJwt } from '@openagent/core';
import { errorHandler } from '../middleware/error-handler.js';

describe('Authentication Middleware', () => {
  const testSecret = 'secure_test_jwt_secret_at_least_32_characters_long';
  process.env.JWT_SECRET = testSecret;

  const app = new Hono();
  app.use('*', authMiddleware);
  app.get('/protected', (c) => {
    const user = c.get('user');
    return c.json({ success: true, user });
  });
  app.onError(errorHandler);

  it('rejects requests with missing Authorization header with 401', async () => {
    const res = await app.request('/protected');
    expect(res.status).toBe(401);

    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(json.error.message).toContain('Missing or malformed');
  });

  it('rejects requests with non-Bearer tokens with 401', async () => {
    const res = await app.request('/protected', {
      headers: {
        authorization: 'Basic dXNlcjpwYXNz',
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with tampered JWT signatures with 401', async () => {
    const validToken = signJwt({ userId: 'u1', email: 'test@example.com', name: 'User', isSuperAdmin: false }, testSecret);
    const tamperedToken = validToken.slice(0, -5) + 'abcde';

    const res = await app.request('/protected', {
      headers: {
        authorization: `Bearer ${tamperedToken}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects expired JWT session tokens with 401', async () => {
    const expiredToken = signJwt(
      { userId: 'u1', email: 'test@example.com', name: 'User', isSuperAdmin: false },
      testSecret,
      -10
    );

    const res = await app.request('/protected', {
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.error.message).toContain('expired');
  });

  it('authenticates valid tokens and attaches user payload to context', async () => {
    const validToken = signJwt(
      { userId: 'u_123', email: 'admin@openagent.com', name: 'Admin', isSuperAdmin: false },
      testSecret,
      3600
    );

    const res = await app.request('/protected', {
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.user.userId).toBe('u_123');
    expect(json.user.email).toBe('admin@openagent.com');
  });

  describe('Registration Lockdown Controls', () => {
    it('returns allowRegistration false when ALLOW_REGISTRATION is false', async () => {
      const origEnv = process.env.ALLOW_REGISTRATION;
      process.env.ALLOW_REGISTRATION = 'false';

      const { authRouter } = await import('../routes/auth.js');
      const testApp = new Hono();
      testApp.route('/auth', authRouter);
      testApp.onError(errorHandler);

      const res = await testApp.request('/auth/config');
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.allowRegistration).toBe(false);

      process.env.ALLOW_REGISTRATION = origEnv;
    });

    it('rejects POST /auth/register with 403 Forbidden when registration is disabled', async () => {
      const origEnv = process.env.ALLOW_REGISTRATION;
      process.env.ALLOW_REGISTRATION = 'false';

      const { authRouter } = await import('../routes/auth.js');
      const testApp = new Hono();
      testApp.route('/auth', authRouter);
      testApp.onError(errorHandler);

      const res = await testApp.request('/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'intruder@example.com',
          password: 'password123',
          name: 'Intruder',
        }),
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
      expect(json.error.message).toContain('restricted');

      process.env.ALLOW_REGISTRATION = origEnv;
    });
  });
});

