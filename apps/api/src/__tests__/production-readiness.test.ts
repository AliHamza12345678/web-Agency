import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { invalidatePublicSiteConfigCache } from '../routes/public-site.js';

vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  checkDatabaseHealth: vi.fn().mockResolvedValue({ healthy: true }),
  sites: {
    id: 'sites.id',
    tenantId: 'sites.tenant_id',
    publicKey: 'sites.public_key',
    name: 'sites.name',
    branding: 'sites.branding',
    publishedConfiguration: 'sites.published_configuration',
    publishedVersion: 'sites.published_version',
    allowedOrigins: 'sites.allowed_origins',
    systemPrompt: 'sites.system_prompt',
  },
  conversations: {
    id: 'conversations.id',
    siteId: 'conversations.site_id',
    visitorId: 'conversations.visitor_id',
  },
  messages: {
    id: 'messages.id',
    conversationId: 'messages.conversation_id',
    siteId: 'messages.site_id',
    role: 'messages.role',
    content: 'messages.content',
  },
  siteIntegrations: {
    siteId: 'site_integrations.site_id',
    toolId: 'site_integrations.tool_id',
    enabled: 'site_integrations.enabled',
  },
  analyticsEvents: {},
  adminAccessLogs: {},
}));

describe('Phase 11: Production Readiness & Reliability', () => {
  let app: ReturnType<typeof createApp>;
  const testSiteId = 'pk_live_prod_test_12345';

  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePublicSiteConfigCache();
    app = createApp();
  });

  it('exposes comprehensive /health endpoint reporting dependency and memory status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.status).toBe('healthy');
    expect(json.dependencies.database).toBe('healthy');
    expect(json.dependencies.aiProviders.status).toBeDefined();
    expect(json.memory.heapUsedMb).toBeGreaterThan(0);
    expect(json.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('exposes liveness and readiness probes for orchestrator health checks', async () => {
    const liveRes = await app.request('/health/live');
    expect(liveRes.status).toBe(200);
    const liveJson = (await liveRes.json()) as any;
    expect(liveJson.status).toBe('ok');

    const readyRes = await app.request('/health/ready');
    expect(readyRes.status).toBe(200);
    const readyJson = (await readyRes.json()) as any;
    expect(readyJson.status).toBe('ready');
  });

  it('serves widget.js with in-memory caching and immutable CDN headers', async () => {
    const res = await app.request('/widget.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('caches public site configuration in memory and sets proper HTTP caching headers', async () => {
    const { getDb } = await import('@openagent/db');
    const mockDbSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'site-uuid-1',
              publicKey: testSiteId,
              name: 'Prod Store',
              branding: { botName: 'Store Bot' },
              publishedConfiguration: { limits: { maxMessagesPerConversation: 20 } },
              publishedVersion: 2,
              allowedOrigins: ['https://example.com'],
            },
          ]),
        }),
      }),
    });
    vi.mocked(getDb).mockReturnValue({ select: mockDbSelect } as any);

    // 1st request -> hits DB
    const res1 = await app.request(`/api/v1/site/config?publicKey=${testSiteId}`, {
      headers: { Origin: 'https://example.com' },
    });
    expect(res1.status).toBe(200);
    expect(res1.headers.get('cache-control')).toContain('public, max-age=60');
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    // 2nd request -> hits in-memory cache, DB not called again
    const res2 = await app.request(`/api/v1/site/config?publicKey=${testSiteId}`, {
      headers: { Origin: 'https://example.com' },
    });
    expect(res2.status).toBe(200);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);

    // Invalidate cache
    invalidatePublicSiteConfigCache(testSiteId);

    // 3rd request -> hits DB again after invalidation
    const res3 = await app.request(`/api/v1/site/config?publicKey=${testSiteId}`, {
      headers: { Origin: 'https://example.com' },
    });
    expect(res3.status).toBe(200);
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it('enforces per-site maxMessagesPerConversation quota and gracefully halts token consumption', async () => {
    const { getDb } = await import('@openagent/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'site-uuid-1',
                name: 'Prod Store',
                publicKey: testSiteId,
                allowedOrigins: null,
                branding: {},
                publishedConfiguration: {
                  limits: {
                    maxMessagesPerConversation: 5,
                  },
                },
              },
            ]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as any);

    // History with 6 turns (exceeds quota of 5)
    const heavyHistory = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? ('visitor' as const) : ('assistant' as const),
      content: `Message ${i}`,
    }));

    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: testSiteId,
        message: 'Can I ask one more question?',
        history: heavyHistory,
      }),
    });

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).toContain('reached the maximum message limit');
  });
});
