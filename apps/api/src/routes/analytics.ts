import { Hono } from 'hono';
import { z } from 'zod';
import {
  ValidationError,
  type ApiSuccessResponse,
  type AnalyticsDashboardMetrics,
  type UnansweredQuestionRecord,
  type ConversationListResponse,
  type ConversationDetail,
  type RetentionCleanupResult,
} from '@openagent/core';
import { getDb, adminAccessLogs } from '@openagent/db';
import { eq, desc } from 'drizzle-orm';
import { authMiddleware, requireTenantAccess } from '../middleware/auth.js';
import { AnalyticsService } from '../services/analytics-service.js';

export const analyticsRouter = new Hono();

analyticsRouter.use('*', authMiddleware);

/**
 * 1. Get real-time dashboard metrics (distinguishes measured vs estimated).
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/metrics', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const period = (c.req.query('period') as any) || '7d';
  const timezone = c.req.query('timezone') || 'UTC';

  const metrics = await AnalyticsService.getDashboardMetrics(siteId, period, timezone);

  const response: ApiSuccessResponse<AnalyticsDashboardMetrics> = {
    success: true,
    data: metrics,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 2. List unanswered or low-confidence questions for feedback loop.
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/unanswered-questions', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const limit = Number(c.req.query('limit')) || 25;

  const questions = await AnalyticsService.getUnansweredQuestions(siteId, limit);

  const response: ApiSuccessResponse<UnansweredQuestionRecord[]> = {
    success: true,
    data: questions,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 3. Convert an unanswered question directly into a knowledge base FAQ document.
 */
analyticsRouter.post('/:tenantId/sites/:siteId/analytics/unanswered-questions/convert', requireTenantAccess('site:update'), async (c) => {
  const siteId = c.req.param('siteId');
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const schema = z.object({
    question: z.string().min(3).max(500),
    answer: z.string().min(3).max(4000),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Question and Answer are required', parsed.error.issues);
  }

  const result = await AnalyticsService.convertToKnowledgeFaq({
    siteId,
    question: parsed.data.question,
    answer: parsed.data.answer,
  });

  const response: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 201);
});

/**
 * 4. List and filter conversations (pagination, search, feedback, handoff).
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/conversations', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const user = c.get('user');

  const q = c.req.query('q');
  const feedback = c.req.query('feedback') as any;
  const hasHandoff = c.req.query('hasHandoff') !== undefined ? c.req.query('hasHandoff') === 'true' : undefined;
  const isLowConfidence = c.req.query('isLowConfidence') !== undefined ? c.req.query('isLowConfidence') === 'true' : undefined;
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const page = Number(c.req.query('page')) || 1;
  const limit = Number(c.req.query('limit')) || 15;

  const result = await AnalyticsService.listConversations(siteId, {
    q,
    feedback,
    hasHandoff,
    isLowConfidence,
    startDate,
    endDate,
    page,
    limit,
  });

  // Log admin view access
  await AnalyticsService.logAdminAccess({
    siteId,
    userId: user?.userId,
    action: 'view_conversations',
    details: { page, limit },
    ipAddress: c.req.header('x-forwarded-for') || '127.0.0.1',
  });

  const response: ApiSuccessResponse<ConversationListResponse> = {
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 5. Retrieve conversation transcript (subject to PII redaction and audit logging).
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/conversations/:conversationId', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const conversationId = c.req.param('conversationId');

  const detail = await AnalyticsService.getConversationDetail(siteId, conversationId);

  const response: ApiSuccessResponse<ConversationDetail> = {
    success: true,
    data: detail,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 6. Delete conversation and its messages.
 */
analyticsRouter.delete('/:tenantId/sites/:siteId/analytics/conversations/:conversationId', requireTenantAccess('site:delete'), async (c) => {
  const siteId = c.req.param('siteId');
  const conversationId = c.req.param('conversationId');
  const user = c.get('user');

  await AnalyticsService.deleteConversation(siteId, conversationId, user?.userId);

  const response: ApiSuccessResponse<{ message: string }> = {
    success: true,
    data: { message: `Conversation ${conversationId} deleted successfully` },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 7. Export conversation transcripts (JSON or CSV) with audit logging.
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/conversations-export', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const user = c.get('user');
  const format = (c.req.query('format') as 'json' | 'csv') || 'json';

  const exportResult = await AnalyticsService.exportConversations({
    siteId,
    format,
    userId: user?.userId,
  });

  c.header('Content-Type', exportResult.contentType);
  c.header('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
  return c.body(exportResult.data);
});

/**
 * 8. Retention policy cleanup job (purges records older than retentionDays).
 */
analyticsRouter.post('/:tenantId/sites/:siteId/analytics/retention/cleanup', requireTenantAccess('site:update'), async (c) => {
  const siteId = c.req.param('siteId');
  const user = c.get('user');

  const result = await AnalyticsService.cleanupRetention(siteId, user?.userId);

  const response: ApiSuccessResponse<RetentionCleanupResult> = {
    success: true,
    data: result,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * 9. View admin compliance & access logs.
 */
analyticsRouter.get('/:tenantId/sites/:siteId/analytics/audit-logs', requireTenantAccess('site:read'), async (c) => {
  const siteId = c.req.param('siteId');
  const db = getDb();

  const logs = await db
    .select()
    .from(adminAccessLogs)
    .where(eq(adminAccessLogs.siteId, siteId))
    .orderBy(desc(adminAccessLogs.createdAt))
    .limit(50);

  const response: ApiSuccessResponse<typeof logs> = {
    success: true,
    data: logs,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
