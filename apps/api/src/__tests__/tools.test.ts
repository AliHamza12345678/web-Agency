import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { toolsRouter, adminToolsRouter } from '../routes/tools.js';
import { errorHandler } from '../middleware/error-handler.js';
import { signJwt } from '@openagent/core';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    publicKey: 'public_key',
    name: 'name',
    tenantId: 'tenant_id',
    allowedOrigins: 'allowed_origins',
    branding: 'branding',
  },
  siteIntegrations: {
    id: 'id',
    siteId: 'site_id',
    toolId: 'tool_id',
    enabled: 'enabled',
    requiresConfirmation: 'requires_confirmation',
    config: 'config',
  },
  toolAuditLogs: {
    id: 'id',
    siteId: 'site_id',
    toolName: 'tool_name',
    status: 'status',
    createdAt: 'created_at',
  },
  pendingConfirmations: {
    id: 'id',
    siteId: 'site_id',
    visitorId: 'visitor_id',
    toolName: 'tool_name',
    payload: 'payload',
    status: 'status',
    expiresAt: 'expires_at',
  },
  tenantMembers: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    role: 'role',
  },
  supportRequests: {
    id: 'id',
    siteId: 'site_id',
    ticketNumber: 'ticket_number',
  },
  leads: {
    id: 'id',
    siteId: 'site_id',
  },
  products: {
    id: 'id',
    siteId: 'site_id',
  },
}));

import { getDb } from '@openagent/db';

describe('Tools & Integrations API Endpoints', () => {
  let app: Hono;
  let mockSelect: any;
  let mockInsert: any;
  let mockUpdate: any;

  const validToken = signJwt(
    {
      userId: 'user_admin_1',
      email: 'admin@openagent.io',
      name: 'Admin User',
      isSuperAdmin: true,
    },
    process.env.JWT_SECRET || 'fallback_development_secret_only',
    3600
  );

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect = vi.fn();
    mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new_id', ticketNumber: 'TICK-123456' }]),
      }),
    });
    mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    (getDb as any).mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    });

    app = new Hono();
    app.route('/api/v1/tools', toolsRouter);
    app.route('/api/v1/admin/tenants', adminToolsRouter);
    app.onError(errorHandler);
  });

  describe('POST /api/v1/tools/execute', () => {
    it('executes authorized tool successfully with 200 OK', async () => {
      // Mock site lookup
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_tool_test',
                  name: 'TechStore',
                  tenantId: 'tenant_1',
                  allowedOrigins: ['https://techstore.com'],
                  branding: { contact: { supportEmail: 'support@techstore.com' } },
                },
              ]),
            }),
          }),
        })
        // Mock siteIntegrations lookup
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      const res = await app.request('/api/v1/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://techstore.com',
        },
        body: JSON.stringify({
          siteId: 'pk_live_tool_test',
          toolId: 'get_business_contact',
          parameters: { department: 'support' },
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.toolId).toBe('get_business_contact');
      expect(json.data?.email).toBe('support@techstore.com');
    });

    it('rejects execution when origin is disallowed with 403 Forbidden', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'site_1',
                publicKey: 'pk_live_tool_test',
                name: 'TechStore',
                allowedOrigins: ['https://techstore.com'],
              },
            ]),
          }),
        }),
      });

      const res = await app.request('/api/v1/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://malicious-site.com',
        },
        body: JSON.stringify({
          siteId: 'pk_live_tool_test',
          toolId: 'get_business_contact',
          parameters: {},
        }),
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('rejects disabled tool with 403 TOOL_UNAUTHORIZED', async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_tool_test',
                  name: 'TechStore',
                  allowedOrigins: [],
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { toolId: 'search_product_catalog', enabled: false },
            ]),
          }),
        });

      const res = await app.request('/api/v1/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'pk_live_tool_test',
          toolId: 'search_product_catalog',
          parameters: { query: 'shoes' },
        }),
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.error.code).toBe('TOOL_UNAUTHORIZED');
    });

    it('returns 202 and pending confirmation for consequential actions', async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_tool_test',
                  name: 'TechStore',
                  allowedOrigins: [],
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      const res = await app.request('/api/v1/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'pk_live_tool_test',
          toolId: 'create_support_request',
          parameters: {
            name: 'Alice Customer',
            email: 'alice@example.com',
            subject: 'Warranty claim',
            description: 'The product stopped turning on yesterday.',
          },
        }),
      });

      expect(res.status).toBe(202);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.pendingConfirmation).toBeDefined();
      expect(json.pendingConfirmation.token).toBeDefined();
      expect(json.error.code).toBe('CONFIRMATION_REQUIRED');
    });
  });

  describe('POST /api/v1/tools/confirm', () => {
    it('executes action upon visitor confirmation', async () => {
      // Mock site lookup
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_confirm_test',
                  name: 'TechStore',
                  allowedOrigins: [],
                },
              ]),
            }),
          }),
        })
        // Mock pending confirmation lookup
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'token_123',
                  siteId: 'site_1',
                  visitorId: 'vis_1',
                  toolName: 'create_support_request',
                  payload: {
                    name: 'Alice Customer',
                    email: 'alice@example.com',
                    subject: 'Warranty claim',
                    description: 'The product stopped turning on yesterday.',
                    priority: 'normal',
                  },
                  status: 'pending',
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                },
              ]),
            }),
          }),
        });

      const res = await app.request('/api/v1/tools/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'pk_live_confirm_test',
          confirmationToken: 'token_123',
          confirmed: true,
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data?.status).toBe('created');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('cancels action when visitor rejects confirmation', async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_confirm_test',
                  name: 'TechStore',
                  allowedOrigins: [],
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'token_123',
                  siteId: 'site_1',
                  toolName: 'create_support_request',
                  status: 'pending',
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                },
              ]),
            }),
          }),
        });

      const res = await app.request('/api/v1/tools/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: 'pk_live_confirm_test',
          confirmationToken: 'token_123',
          confirmed: false,
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.status).toBe('cancelled');
    });
  });

  describe('GET /api/v1/tools/public/status', () => {
    it('returns available public tools for the widget', async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'site_1',
                  publicKey: 'pk_live_status_test',
                  name: 'Store Bot',
                  allowedOrigins: [],
                  branding: {},
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        });

      const res = await app.request('/api/v1/tools/public/status?publicKey=pk_live_status_test');
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Admin Integrations & Audit Logs Endpoints', () => {
    it('retrieves site integration statuses for authenticated admin', async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'site_1', name: 'My Website', branding: {} },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { toolId: 'search_product_catalog', enabled: true },
            ]),
          }),
        });

      const res = await app.request('/api/v1/admin/tenants/t1/sites/site_1/integrations', {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('updates integration configuration successfully', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request('/api/v1/admin/tenants/t1/sites/site_1/integrations', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validToken}`,
        },
        body: JSON.stringify({
          toolId: 'search_product_catalog',
          enabled: true,
          requiresConfirmation: false,
          config: { currency: 'EUR' },
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('retrieves audit logs for a website', async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'log_1',
                  siteId: 'site_1',
                  toolName: 'create_support_request',
                  status: 'success',
                  executionTimeMs: 45,
                  createdAt: new Date().toISOString(),
                },
              ]),
            }),
          }),
        }),
      });

      const res = await app.request('/api/v1/admin/tenants/t1/sites/site_1/tools/audit-logs', {
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].toolName).toBe('create_support_request');
    });
  });
});
