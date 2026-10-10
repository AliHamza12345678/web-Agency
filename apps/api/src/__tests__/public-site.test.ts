import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { publicSiteRouter } from '../routes/public-site.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    publicKey: 'public_key',
    name: 'name',
    branding: 'branding',
    allowedOrigins: 'allowed_origins',
  },
}));

import { getDb } from '@openagent/db';

describe('Public Widget Config Endpoint & Origin Enforcement', () => {
  let app: Hono;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect = vi.fn();
    (getDb as any).mockReturnValue({
      select: mockSelect,
    });

    app = new Hono();
    app.route('/api/v1/site', publicSiteRouter);
    app.onError(errorHandler);
  });

  it('rejects requests missing valid public key with 400', async () => {
    const res = await app.request('/api/v1/site/config?publicKey=invalid_key');
    expect(res.status).toBe(400);

    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects requests from disallowed origins with 403', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 's_123',
              publicKey: 'pk_live_abcdef1234567890',
              name: 'My Store',
              branding: { botName: 'StoreBot' },
              allowedOrigins: ['https://mystore.com'],
            },
          ]),
        }),
      }),
    });

    const res = await app.request('/api/v1/site/config?publicKey=pk_live_abcdef1234567890', {
      headers: {
        origin: 'https://malicious-website.com',
      },
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('not permitted to embed');
  });

  it('allows requests from whitelisted origins and delivers public branding only', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 's_123',
              publicKey: 'pk_live_abcdef1234567890',
              name: 'My Store',
              branding: { botName: 'StoreBot', primaryColor: '#4f46e5' },
              allowedOrigins: ['https://mystore.com'],
            },
          ]),
        }),
      }),
    });

    const res = await app.request('/api/v1/site/config?publicKey=pk_live_abcdef1234567890', {
      headers: {
        origin: 'https://mystore.com',
      },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.siteId).toBe('s_123');
    expect(json.data.name).toBe('My Store');
    expect(json.data.branding.botName).toBe('StoreBot');

    // Ensure zero private tenant/system prompt leaked
    expect(json.data.systemPrompt).toBeUndefined();
    expect(json.data.tenantId).toBeUndefined();
  });
});
