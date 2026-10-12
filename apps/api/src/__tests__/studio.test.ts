import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { studioRouter } from '../routes/studio.js';
import { errorHandler } from '../middleware/error-handler.js';
import { signJwt, DEFAULT_STUDIO_CONFIG } from '@openagent/core';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    tenantId: 'tenant_id',
    name: 'name',
    publicKey: 'public_key',
    allowedOrigins: 'allowed_origins',
    branding: 'branding',
    draftConfiguration: 'draft_configuration',
    publishedConfiguration: 'published_configuration',
    publishedVersion: 'published_version',
    retentionDays: 'retention_days',
    updatedAt: 'updated_at',
  },
  siteConfigurationVersions: {
    id: 'id',
    siteId: 'site_id',
    version: 'version',
    configuration: 'configuration',
    isPublished: 'is_published',
    changeSummary: 'change_summary',
    createdBy: 'created_by',
    createdAt: 'created_at',
  },
  domainVerifications: {
    id: 'id',
    siteId: 'site_id',
    domain: 'domain',
    verificationToken: 'verification_token',
    verificationMethod: 'verification_method',
    status: 'status',
    verifiedAt: 'verified_at',
    lastCheckedAt: 'last_checked_at',
    errorMessage: 'error_message',
    createdAt: 'created_at',
  },
  tenantMembers: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    role: 'role',
  },
}));

import { getDb } from '@openagent/db';

describe('Phase 8: No-Code Studio API Endpoints', () => {
  let app: Hono;
  let mockSelect: any;
  let mockInsert: any;
  let mockUpdate: any;
  let mockDelete: any;

  const validSuperAdminToken = signJwt(
    {
      userId: 'user_admin_1',
      email: 'admin@openagent.io',
      name: 'Super Admin',
      isSuperAdmin: true,
    },
    process.env.JWT_SECRET || 'fallback_development_secret_only',
    3600
  );

  const testTenantId = 'ten_123';
  const testSiteId = 'site_456';

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect = vi.fn();
    mockInsert = vi.fn();
    mockUpdate = vi.fn();
    mockDelete = vi.fn();

    (getDb as any).mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    });

    app = new Hono();
    app.route('/api/v1/admin/tenants', studioRouter);
    app.onError(errorHandler);
  });

  it('retrieves studio configuration with draft, published, and version status', async () => {
    const mockSite = {
      id: testSiteId,
      tenantId: testTenantId,
      name: 'Store Bot',
      publicKey: 'pk_live_test123',
      publishedVersion: 1,
      draftConfiguration: {
        ...DEFAULT_STUDIO_CONFIG,
        assistant: { name: 'Custom Bot', avatarType: 'preset', avatar: '🤖' },
      },
      publishedConfiguration: DEFAULT_STUDIO_CONFIG,
    };

    const mockVersions = [
      {
        id: 'ver_1',
        siteId: testSiteId,
        version: 1,
        configuration: DEFAULT_STUDIO_CONFIG,
        isPublished: true,
        changeSummary: 'Initial setup',
        createdBy: 'admin@openagent.io',
      },
    ];

    // First call is for site, second call is for versions
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSite]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockVersions),
            }),
          }),
        }),
      });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/configuration`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.siteId).toBe(testSiteId);
    expect(json.data.isDirty).toBe(true);
    expect(json.data.draftConfiguration.assistant.name).toBe('Custom Bot');
    expect(json.data.versions.length).toBe(1);
  });

  it('saves and sanitizes draft configuration', async () => {
    const mockSite = {
      id: testSiteId,
      tenantId: testTenantId,
      name: 'Store Bot',
      publishedConfiguration: DEFAULT_STUDIO_CONFIG,
    };

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockSite]),
        }),
      }),
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: testSiteId,
              updatedAt: new Date(),
            },
          ]),
        }),
      }),
    });

    const draftPayload = {
      ...DEFAULT_STUDIO_CONFIG,
      assistant: {
        name: 'SafeBot<script>alert(1)</script>',
        avatarType: 'emoji',
        avatar: '🚀',
      },
      theme: {
        ...DEFAULT_STUDIO_CONFIG.theme,
        primaryColor: '#6366f1',
      },
    };

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/draft`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify(draftPayload),
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    // Verified sanitization stripped <script>alert(1)</script>
    expect(json.data.draftConfiguration.assistant.name).toBe('SafeBot');
  });

  it('rejects invalid draft configuration with malformed hex colors', async () => {
    const invalidPayload = {
      ...DEFAULT_STUDIO_CONFIG,
      theme: {
        ...DEFAULT_STUDIO_CONFIG.theme,
        primaryColor: 'invalid-red',
      },
    };

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/draft`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify(invalidPayload),
      }
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('publishes draft configuration, increments version, and records audit version snapshot', async () => {
    const mockSite = {
      id: testSiteId,
      tenantId: testTenantId,
      name: 'Store Bot',
      publishedVersion: 1,
      draftConfiguration: {
        ...DEFAULT_STUDIO_CONFIG,
        assistant: { name: 'PublishedBot', avatarType: 'preset', avatar: '🤖' },
      },
    };

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockSite]),
        }),
      }),
    });

    const mockCreatedVersion = {
      id: 'ver_2',
      siteId: testSiteId,
      version: 2,
      configuration: mockSite.draftConfiguration,
      isPublished: true,
      changeSummary: 'New branding update',
      createdBy: 'admin@openagent.io',
    };

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockCreatedVersion]),
      }),
    });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              ...mockSite,
              publishedVersion: 2,
              publishedConfiguration: mockSite.draftConfiguration,
            },
          ]),
        }),
      }),
    });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/publish`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify({
          changeSummary: 'New branding update',
        }),
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.version).toBe(2);
    expect(json.data.publishedConfiguration.assistant.name).toBe('PublishedBot');
    expect(json.data.versionRecord.version).toBe(2);
  });

  it('rolls back draft configuration to a specified historical snapshot', async () => {
    const mockSite = {
      id: testSiteId,
      tenantId: testTenantId,
      publishedVersion: 2,
    };

    const targetHistoricalVersion = {
      id: 'ver_1',
      siteId: testSiteId,
      version: 1,
      configuration: {
        ...DEFAULT_STUDIO_CONFIG,
        assistant: { name: 'V1 Bot', avatarType: 'preset', avatar: '🤖' },
      },
    };

    // First call for site, second call for target historical version
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockSite]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([targetHistoricalVersion]),
          }),
        }),
      });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/rollback`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify({
          version: 1,
          publishImmediately: false,
        }),
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.restoredVersion).toBe(1);
    expect(json.data.draftConfiguration.assistant.name).toBe('V1 Bot');
  });

  it('generates copyable embed snippet with public identifier vs server secret explanations', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: testSiteId,
              name: 'My Store',
              publicKey: 'pk_live_abc123xyz789',
            },
          ]),
        }),
      }),
    });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/embed`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.scriptSnippet).toContain('data-site-id="pk_live_abc123xyz789"');
    expect(json.data.webComponentSnippet).toContain('<openagent-chat');
    expect(json.data.explanation.publicKeyDescription).toContain('safe to expose');
    expect(json.data.explanation.serverSecretsDescription).toContain('NEVER be exposed');
  });

  it('initiates and verifies domain challenge whitelisting the origin into allowedOrigins', async () => {
    // 1. Initiate domain verification
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: testSiteId,
              tenantId: testTenantId,
            },
          ]),
        }),
      }),
    });

    const createdVerification = {
      id: 'verif_100',
      siteId: testSiteId,
      domain: 'shop.example.com',
      verificationToken: 'openagent-verify-abc123456789',
      verificationMethod: 'dns_txt',
      status: 'pending',
    };

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdVerification]),
      }),
    });

    const initiateRes = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/domains`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify({
          domain: 'https://SHOP.EXAMPLE.COM/cart',
          verificationMethod: 'dns_txt',
        }),
      }
    );

    expect(initiateRes.status).toBe(201);
    const initJson = (await initiateRes.json()) as any;
    expect(initJson.success).toBe(true);
    expect(initJson.data.verification.domain).toBe('shop.example.com');
    expect(initJson.data.instructions.dns_txt.value).toMatch(/^openagent-verify-[a-f0-9]{32}$/);

    // 2. Check / verify domain challenge
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([createdVerification]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: testSiteId,
                allowedOrigins: ['https://existing.com'],
              },
            ]),
          }),
        }),
      });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              ...createdVerification,
              status: 'verified',
              verifiedAt: new Date(),
            },
          ]),
        }),
      }),
    });

    const checkRes = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/studio/domains/verif_100/check`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(checkRes.status).toBe(200);
    const checkJson = (await checkRes.json()) as any;
    expect(checkJson.success).toBe(true);
    expect(checkJson.data.status).toBe('verified');
  });
});
