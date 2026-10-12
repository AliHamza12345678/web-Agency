import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { signJwt, redactPii, containsPii } from '@openagent/core';
import { resetRateLimitStore } from '../middleware/rate-limiter.js';
import { SafeToolExecutor, type ToolExecutionContext } from '@openagent/tools';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    tenantId: 'tenant_id',
    publicKey: 'public_key',
    name: 'name',
    systemPrompt: 'system_prompt',
    allowedOrigins: 'allowed_origins',
    branding: 'branding',
    retentionDays: 'retention_days',
  },
  tenantMembers: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    role: 'role',
  },
  conversations: {
    id: 'id',
    siteId: 'site_id',
    visitorId: 'visitor_id',
    hasHandoff: 'has_handoff',
    isLowConfidence: 'is_low_confidence',
    feedback: 'feedback',
    createdAt: 'created_at',
  },
  messages: {
    id: 'id',
    conversationId: 'conversation_id',
    siteId: 'site_id',
    role: 'role',
    content: 'content',
    createdAt: 'created_at',
  },
  analyticsEvents: {
    id: 'id',
    siteId: 'site_id',
    eventType: 'event_type',
  },
  adminAccessLogs: {
    id: 'id',
    siteId: 'site_id',
  },
  siteIntegrations: {
    id: 'id',
    siteId: 'site_id',
  },
  documents: {
    id: 'id',
    siteId: 'site_id',
  },
}));

import { getDb } from '@openagent/db';

describe('Phase 10: Security Hardening & Adversarial Verification Suite', () => {
  let app: ReturnType<typeof createApp>;
  let mockSelect: any;
  let mockInsert: any;

  const validAdminToken = signJwt(
    {
      userId: 'user_sec_admin',
      email: 'sec@openagent.io',
      name: 'Security Admin',
      isSuperAdmin: false,
    },
    process.env.JWT_SECRET || 'fallback_development_secret_only',
    3600
  );

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();

    mockSelect = vi.fn();
    mockInsert = vi.fn().mockImplementation(() => {
      const p = Promise.resolve([]) as any;
      p.returning = vi.fn().mockResolvedValue([]);
      return {
        values: vi.fn().mockReturnValue(p),
      };
    });

    (getDb as any).mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });

    app = createApp();
  });

  describe('1. HTTP Security Headers & Defense-in-Depth', () => {
    it('serves critical defense headers (X-Content-Type-Options, HSTS, Referrer-Policy, CSP, X-Frame-Options)', async () => {
      const res = await app.request('/health/live');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    });
  });

  describe('2. Rate Limiting & Denial-of-Service Defense', () => {
    it('enforces sliding-window rate limit and returns 429 with Retry-After when threshold is breached', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'site_rate_1',
                publicKey: 'pk_live_ratelimit',
                name: 'Rate Limit Store',
                allowedOrigins: ['https://example.com'],
              },
            ]),
          }),
        }),
      });

      // The chat rate limit is configured to 60 requests per minute.
      // Send 60 requests
      for (let i = 0; i < 60; i++) {
        const r = await app.request('/api/v1/chat/feedback', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.42',
          },
          body: JSON.stringify({
            siteId: 'pk_live_ratelimit',
            rating: 'positive',
          }),
        });
        expect(r.status).toBe(200);
      }

      // The 61st request from the same IP must be rejected with 429
      const throttledRes = await app.request('/api/v1/chat/feedback', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.42',
        },
        body: JSON.stringify({
          siteId: 'pk_live_ratelimit',
          rating: 'positive',
        }),
      });

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.headers.get('Retry-After')).toBeDefined();
      const body = (await throttledRes.json()) as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.error.message).toContain('Too many requests');
    });
  });

  describe('3. Request Body Size Limits (Payload Too Large)', () => {
    it('rejects oversized JSON payloads exceeding 1MB limit with HTTP 413', async () => {
      const hugeString = 'A'.repeat(1.2 * 1024 * 1024); // 1.2 MB
      const res = await app.request('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          siteId: 'pk_live_test',
          message: hugeString,
        }),
      });

      expect(res.status).toBe(413);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('4. Privilege Boundary & Negative Authorization Checks', () => {
    it('strictly forbids accessing admin endpoints using a public site key instead of Bearer JWT', async () => {
      const res = await app.request('/api/v1/admin/tenants/ten_1/sites', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer pk_live_some_public_site_key',
        },
      });

      // Public keys are not valid JWTs; must return 401 Unauthorized
      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tampered or forged JWT tokens', async () => {
      const forgedToken = validAdminToken + 'tampered_signature_payload';
      const res = await app.request('/api/v1/admin/tenants/ten_1/sites', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${forgedToken}`,
        },
      });

      expect(res.status).toBe(401);
    });

    it('prevents IDOR: rejects tenant admin attempting to access another organization tenant', async () => {
      // Mock tenant membership check: user is NOT in 'ten_victim_org'
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // Empty membership
          }),
        }),
      });

      const res = await app.request('/api/v1/admin/tenants/ten_victim_org/sites', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validAdminToken}`,
        },
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN');
    });
  });

  describe('5. Origin Header Enforcement & Spoofing Defense', () => {
    it('rejects chat requests originating from disallowed domains', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'site_origin_1',
                publicKey: 'pk_live_origin_test',
                name: 'Origin Store',
                allowedOrigins: ['https://legitimate-store.com'],
              },
            ]),
          }),
        }),
      });

      const res = await app.request('/api/v1/chat/stream', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://malicious-phishing-attacker.com',
        },
        body: JSON.stringify({
          siteId: 'pk_live_origin_test',
          message: 'Hello',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('6. Tool Calling Server-Side Authorization Boundary', () => {
    it('ensures tools can only be invoked with strictly typed, server-validated inputs', async () => {
      const executor = new SafeToolExecutor();

      const context: ToolExecutionContext = {
        siteId: 'site_test_1',
        db: undefined as any,
        config: {} as any,
      };

      // Valid execution
      const validResult = await executor.execute({
        toolId: 'search_approved_pages',
        parameters: { query: 'shipping policy' },
        context,
      });
      expect(validResult.success).toBe(true);

      // Schema rejection on invalid input (query must be at least 2 chars)
      const invalidResult = await executor.execute({
        toolId: 'search_approved_pages',
        parameters: { query: 'x' },
        context,
      });
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error?.code).toBe('INVALID_TOOL_INPUT');
    });

    it('strictly isolates tool execution by siteId and allowed tool boundaries', async () => {
      const executor = new SafeToolExecutor();

      const context: ToolExecutionContext = {
        siteId: 'site_tenant_a',
        db: undefined as any,
        config: {} as any,
      };

      // Allowed tool passes
      const resultAllowed = await executor.execute({
        toolId: 'get_business_contact',
        parameters: { department: 'general' },
        context,
        allowedToolIds: ['get_business_contact'],
      });
      expect(resultAllowed.success).toBe(true);

      // Disabled / unconfigured tool is blocked by server
      const resultBlocked = await executor.execute({
        toolId: 'create_support_request',
        parameters: {
          name: 'Jane',
          email: 'jane@example.com',
          subject: 'Need assistance',
          message: 'My order did not arrive',
        },
        context,
        allowedToolIds: ['get_business_contact'],
      });
      expect(resultBlocked.success).toBe(false);
      expect(resultBlocked.error?.code).toBe('TOOL_UNAUTHORIZED');
    });
  });

  describe('7. Sensitive-Data Redaction & Secret Scrubbing', () => {
    it('redacts visitor credentials, emails, and phone numbers from logs and audit exports', () => {
      const sensitiveTranscript =
        'My email is john.doe@victim.org and phone is 555-123-4567. Card: 4111-2222-3333-4444. SSN: 123-45-6789. Token: Bearer secret_live_token_abc123.';

      expect(containsPii(sensitiveTranscript)).toBe(true);
      const redacted = redactPii(sensitiveTranscript);

      expect(redacted).toContain('[EMAIL_REDACTED]');
      expect(redacted).toContain('[PHONE_REDACTED]');
      expect(redacted).toContain('[CARD_REDACTED]');
      expect(redacted).toContain('[SSN_REDACTED]');
      expect(redacted).toContain('[SECRET_REDACTED]');

      expect(redacted).not.toContain('john.doe@victim.org');
      expect(redacted).not.toContain('555-123-4567');
      expect(redacted).not.toContain('4111-2222-3333-4444');
      expect(redacted).not.toContain('123-45-6789');
      expect(redacted).not.toContain('secret_live_token_abc123');
    });
  });
});
