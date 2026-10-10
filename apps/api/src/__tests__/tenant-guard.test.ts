import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requireTenantAccess } from '../middleware/auth.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock database layer
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  tenantMembers: {
    tenantId: 'tenant_id',
    userId: 'user_id',
    role: 'role',
  },
}));

import { getDb } from '@openagent/db';

describe('Tenant Authorization Guard & IDOR Defense', () => {
  let app: Hono;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect = vi.fn();
    (getDb as any).mockReturnValue({
      select: mockSelect,
    });

    app = new Hono();
    // Simulate authMiddleware attaching user
    app.use('/admin/:tenantId/*', async (c, next) => {
      const userHeader = c.req.header('x-test-user');
      if (userHeader) {
        c.set('user', JSON.parse(userHeader));
      }
      await next();
    });

    app.post('/admin/:tenantId/sites', requireTenantAccess('site:create'), (c) => {
      return c.json({ success: true, message: 'Site creation authorized' });
    });

    app.delete('/admin/:tenantId', requireTenantAccess('tenant:delete'), (c) => {
      return c.json({ success: true, message: 'Tenant deletion authorized' });
    });

    app.onError(errorHandler);
  });

  it('rejects access when user is not a member of the requested tenant (IDOR prevention)', async () => {
    // DB returns 0 memberships
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.request('/admin/tenant_foreign_org/sites', {
      method: 'POST',
      headers: {
        'x-test-user': JSON.stringify({ userId: 'attacker_user_1', isSuperAdmin: false }),
      },
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('You do not have access to this organization');
  });

  it('rejects member role when attempting owner-only actions like tenant:delete', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: 'member' }]),
        }),
      }),
    });

    const res = await app.request('/admin/my_tenant/sites', {
      method: 'POST',
      headers: {
        'x-test-user': JSON.stringify({ userId: 'regular_member_1', isSuperAdmin: false }),
      },
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('Insufficient permissions');
  });

  it('authorizes site creation for owner role', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: 'owner' }]),
        }),
      }),
    });

    const res = await app.request('/admin/my_tenant/sites', {
      method: 'POST',
      headers: {
        'x-test-user': JSON.stringify({ userId: 'org_owner_1', isSuperAdmin: false }),
      },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });

  it('allows super administrators to bypass tenant membership checks', async () => {
    const res = await app.request('/admin/any_tenant/sites', {
      method: 'POST',
      headers: {
        'x-test-user': JSON.stringify({ userId: 'platform_super_admin', isSuperAdmin: true }),
      },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
  });
});
