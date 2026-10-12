import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { analyticsRouter } from '../routes/analytics.js';
import { chatRouter } from '../routes/chat.js';
import { errorHandler } from '../middleware/error-handler.js';
import { signJwt } from '@openagent/core';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    tenantId: 'tenant_id',
    name: 'name',
    publicKey: 'public_key',
    retentionDays: 'retention_days',
  },
  conversations: {
    id: 'id',
    siteId: 'site_id',
    visitorId: 'visitor_id',
    hasHandoff: 'has_handoff',
    isLowConfidence: 'is_low_confidence',
    feedback: 'feedback',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  messages: {
    id: 'id',
    conversationId: 'conversation_id',
    siteId: 'site_id',
    role: 'role',
    content: 'content',
    latencyMs: 'latency_ms',
    tokenCountEstimate: 'token_count_estimate',
    isUnanswered: 'is_unanswered',
    feedback: 'feedback',
    feedbackComment: 'feedback_comment',
    createdAt: 'created_at',
  },
  documents: {
    id: 'id',
    siteId: 'site_id',
    title: 'title',
    content: 'content',
    type: 'type',
    status: 'status',
  },
  analyticsEvents: {
    id: 'id',
    siteId: 'site_id',
    conversationId: 'conversation_id',
    eventType: 'event_type',
    durationMs: 'duration_ms',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
  adminAccessLogs: {
    id: 'id',
    siteId: 'site_id',
    userId: 'user_id',
    action: 'action',
    details: 'details',
    ipAddress: 'ip_address',
    createdAt: 'created_at',
  },
  tenantMembers: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    role: 'role',
  },
  siteIntegrations: {
    id: 'id',
    siteId: 'site_id',
  },
}));

import { getDb } from '@openagent/db';

describe('Phase 9: Observability, Metrics & Conversation Management', () => {
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
    mockInsert = vi.fn().mockImplementation(() => {
      const p = Promise.resolve([{ id: 'new_id', title: 'FAQ: Test' }]) as any;
      p.returning = vi.fn().mockResolvedValue([{ id: 'new_id', title: 'FAQ: Test' }]);
      return {
        values: vi.fn().mockReturnValue(p),
      };
    });
    mockUpdate = vi.fn().mockImplementation(() => {
      return {
        set: vi.fn().mockImplementation(() => {
          const p = Promise.resolve([]) as any;
          p.returning = vi.fn().mockResolvedValue([]);
          return {
            where: vi.fn().mockReturnValue(p),
          };
        }),
      };
    });
    mockDelete = vi.fn().mockImplementation(() => {
      const p = Promise.resolve([{ id: 'del_1' }]) as any;
      p.returning = vi.fn().mockResolvedValue([{ id: 'del_1' }]);
      return {
        where: vi.fn().mockReturnValue(p),
      };
    });

    (getDb as any).mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    });

    app = new Hono();
    app.route('/api/v1/admin/tenants', analyticsRouter);
    app.route('/api/v1/chat', chatRouter);
    app.onError(errorHandler);
  });

  it('aggregates dashboard metrics and clearly labels measured vs estimated vs unavailable', async () => {
    const mockEvents = [
      { eventType: 'conversation_started', durationMs: null, metadata: {}, createdAt: new Date() },
      { eventType: 'message_received', durationMs: null, metadata: {}, createdAt: new Date() },
      { eventType: 'retrieval_success', durationMs: null, metadata: { count: 3 }, createdAt: new Date() },
      {
        eventType: 'message_answered',
        durationMs: 350,
        metadata: { tokensEstimated: 85, citationsCount: 2 },
        createdAt: new Date(),
      },
      {
        eventType: 'message_answered',
        durationMs: 450,
        metadata: { tokensEstimated: 120, citationsCount: 1 },
        createdAt: new Date(),
      },
      { eventType: 'visitor_feedback', durationMs: null, metadata: { rating: 'positive' }, createdAt: new Date() },
      { eventType: 'human_handoff_requested', durationMs: null, metadata: {}, createdAt: new Date() },
    ];

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockEvents),
      }),
    });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/metrics?period=7d&timezone=America/New_York`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);

    const data = json.data;
    expect(data.conversationsStarted).toBe(1);
    expect(data.messagesReceived).toBe(1);
    expect(data.messagesAnswered).toBe(2);
    expect(data.averageLatencyMs).toBe(400); // (350 + 450) / 2
    expect(data.p50LatencyMs).toBe(450);
    expect(data.positiveFeedback).toBe(1);
    expect(data.satisfactionRate).toBe(100);
    expect(data.humanHandoffRequests).toBe(1);
    expect(data.approximateModelTokens).toBe(205); // 85 + 120

    // Verify measurement labels distinguish measured from estimated from unavailable
    expect(data.measurementLabels.messagesAnswered).toBe('measured');
    expect(data.measurementLabels.responseLatency).toBe('measured');
    expect(data.measurementLabels.approximateModelTokens).toBe('estimated');
  });

  it('retrieves unanswered questions and converts one to a knowledge base FAQ', async () => {
    // 1. Get unanswered questions
    const mockUnanswered = [
      {
        id: 'evt_1',
        conversationId: 'conv_1',
        metadata: { query: 'Do you offer international shipping to Japan?', reason: 'no_knowledge_matches' },
        createdAt: new Date(),
      },
    ];

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(mockUnanswered),
          }),
        }),
      }),
    });

    const listRes = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/unanswered-questions`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as any;
    expect(listJson.success).toBe(true);
    expect(listJson.data.length).toBe(1);
    expect(listJson.data[0].query).toContain('international shipping');

    // 2. Convert to Knowledge Base FAQ
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: testSiteId, name: 'Shop' }]),
        }),
      }),
    });

    const convertRes = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/unanswered-questions/convert`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validSuperAdminToken}`,
        },
        body: JSON.stringify({
          question: 'Do you offer international shipping to Japan?',
          answer: 'Yes, we ship to Japan via FedEx International Express (3-5 business days).',
        }),
      }
    );

    expect(convertRes.status).toBe(201);
    const convertJson = (await convertRes.json()) as any;
    expect(convertJson.success).toBe(true);
    expect(convertJson.data.id).toBe('new_id');
  });

  it('lists conversations with filters, pagination, and secret redaction', async () => {
    const mockConversations = [
      {
        id: 'c_1',
        siteId: testSiteId,
        visitorId: 'v_user1',
        hasHandoff: false,
        isLowConfidence: false,
        feedback: 'positive',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Mock count query
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        }),
      })
      // Mock conversation rows
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockConversations),
              }),
            }),
          }),
        }),
      })
      // Mock last message
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ content: 'Contact me at admin@secret.com', role: 'visitor' }]),
            }),
          }),
        }),
      })
      // Mock msg count
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/conversations?page=1&limit=10&feedback=positive`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.conversations.length).toBe(1);
    expect(json.data.pagination.total).toBe(1);

    // Verify PII redaction on snippet
    expect(json.data.conversations[0].lastMessageSnippet).toContain('[EMAIL_REDACTED]');
    expect(json.data.conversations[0].lastMessageSnippet).not.toContain('admin@secret.com');
  });

  it('retrieves conversation detail and strictly redacts PII and credentials', async () => {
    const mockConv = {
      id: 'c_100',
      siteId: testSiteId,
      visitorId: 'v_100',
      hasHandoff: false,
      isLowConfidence: false,
      feedback: 'positive',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockMessages = [
      {
        id: 'm_1',
        conversationId: 'c_100',
        role: 'visitor',
        content: 'My credit card is 4111-2222-3333-4444 and phone is 555-123-4567, please refund.',
        latencyMs: null,
        tokenCountEstimate: 20,
        isUnanswered: false,
        feedback: null,
        feedbackComment: null,
        createdAt: new Date(),
      },
      {
        id: 'm_2',
        conversationId: 'c_100',
        role: 'assistant',
        content: 'I have logged your request. Our support team will follow up.',
        latencyMs: 310,
        tokenCountEstimate: 15,
        isUnanswered: false,
        feedback: 'positive',
        feedbackComment: 'Great service!',
        createdAt: new Date(),
      },
    ];

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockConv]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockMessages),
          }),
        }),
      });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/conversations/c_100`,
      {
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);

    const visitorMsg = json.data.messages[0];
    expect(visitorMsg.content).toContain('[CARD_REDACTED]');
    expect(visitorMsg.content).toContain('[PHONE_REDACTED]');
    expect(visitorMsg.content).not.toContain('4111-2222');
    expect(visitorMsg.content).not.toContain('555-123');
  });

  it('records visitor feedback via public feedback endpoint', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: testSiteId }]),
        }),
      }),
    });

    const res = await app.request('/api/v1/chat/feedback', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        siteId: testSiteId,
        conversationId: '11111111-2222-3333-4444-555555555555',
        rating: 'positive',
        comment: 'Very helpful answer!',
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Feedback recorded successfully');
  });

  it('executes retention cleanup job and reports verified deletion count', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: testSiteId, retentionDays: 14 }]),
        }),
      }),
    });

    const res = await app.request(
      `/api/v1/admin/tenants/${testTenantId}/sites/${testSiteId}/analytics/retention/cleanup`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${validSuperAdminToken}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.retentionDays).toBe(14);
    expect(json.data.purgedConversationsCount).toBeDefined();
    expect(json.data.verifiedAt).toBeDefined();
  });
});
