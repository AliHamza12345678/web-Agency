import {
  getDb,
  sites,
  conversations,
  messages,
  documents,
  analyticsEvents,
  adminAccessLogs,
} from '@openagent/db';
import {
  NotFoundError,
  redactPii,
  type AnalyticsDashboardMetrics,
  type ConversationSummary,
  type ConversationDetail,
  type ConversationQueryFilters,
  type ConversationListResponse,
  type UnansweredQuestionRecord,
  type RetentionCleanupResult,
} from '@openagent/core';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

export class AnalyticsService {
  /**
   * 1. Persist a structured analytics event.
   */
  public static async recordEvent(params: {
    siteId: string;
    conversationId?: string;
    eventType: string;
    durationMs?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const db = getDb();
      if (!db || typeof db.insert !== 'function') return;
      const res = db.insert(analyticsEvents).values({
        siteId: params.siteId,
        conversationId: params.conversationId,
        eventType: params.eventType,
        durationMs: params.durationMs !== undefined ? Math.round(params.durationMs) : null,
        metadata: params.metadata || {},
      });
      if (res && typeof (res as any).catch === 'function') {
        await res.catch(() => {});
      }
    } catch (err) {
      // Gracefully silence analytics errors to protect primary traffic
    }
  }

  /**
   * 2. Log administrator access & compliance action.
   */
  public static async logAdminAccess(params: {
    siteId: string;
    userId?: string;
    action: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const db = getDb();
      if (!db || typeof db.insert !== 'function') return;
      const res = db.insert(adminAccessLogs).values({
        siteId: params.siteId,
        userId: params.userId || 'admin',
        action: params.action,
        details: params.details || {},
        ipAddress: params.ipAddress,
      });
      if (res && typeof (res as any).catch === 'function') {
        await res.catch(() => {});
      }
    } catch (err) {
      // Gracefully silence audit log recording errors
    }
  }

  /**
   * 3. Compute real-time dashboard metrics backed by persisted events.
   */
  public static async getDashboardMetrics(
    siteId: string,
    period: 'today' | '7d' | '30d' | 'all' = '7d',
    timezone = 'UTC'
  ): Promise<AnalyticsDashboardMetrics> {
    const db = getDb();

    // Compute time filter
    let cutoffDate: Date | null = null;
    const now = new Date();
    if (period === 'today') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === '7d') {
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    let timeFilter = eq(analyticsEvents.siteId, siteId);
    if (cutoffDate) {
      timeFilter = and(timeFilter, gte(analyticsEvents.createdAt, cutoffDate)) as any;
    }

    // Fetch all events for this site in the window
    const events = await db
      .select({
        eventType: analyticsEvents.eventType,
        durationMs: analyticsEvents.durationMs,
        metadata: analyticsEvents.metadata,
        createdAt: analyticsEvents.createdAt,
      })
      .from(analyticsEvents)
      .where(timeFilter);

    let conversationsStarted = 0;
    let messagesReceived = 0;
    let messagesAnswered = 0;
    let providerErrors = 0;
    let rateLimitEvents = 0;
    let retrievalSuccessCount = 0;
    let retrievalEmptyCount = 0;
    let unansweredCount = 0;
    let lowConfidenceCount = 0;
    let positiveFeedback = 0;
    let negativeFeedback = 0;
    let humanHandoffRequests = 0;
    let approximateModelTokens = 0;
    const latencies: number[] = [];

    for (const e of events) {
      switch (e.eventType) {
        case 'conversation_started':
          conversationsStarted++;
          break;
        case 'message_received':
          messagesReceived++;
          break;
        case 'message_answered':
          messagesAnswered++;
          if (e.durationMs !== null && e.durationMs !== undefined && e.durationMs >= 0) {
            latencies.push(e.durationMs);
          }
          if (e.metadata && typeof e.metadata === 'object') {
            const meta = e.metadata as Record<string, any>;
            if (typeof meta.tokensEstimated === 'number') {
              approximateModelTokens += meta.tokensEstimated;
            }
          }
          break;
        case 'provider_error':
          providerErrors++;
          break;
        case 'provider_rate_limit':
          rateLimitEvents++;
          break;
        case 'retrieval_success':
          retrievalSuccessCount++;
          break;
        case 'retrieval_empty':
          retrievalEmptyCount++;
          break;
        case 'low_confidence_question':
          lowConfidenceCount++;
          break;
        case 'unanswered_question':
          unansweredCount++;
          break;
        case 'human_handoff_requested':
          humanHandoffRequests++;
          break;
        case 'visitor_feedback':
          if (e.metadata && (e.metadata as any).rating === 'positive') {
            positiveFeedback++;
          } else if (e.metadata && (e.metadata as any).rating === 'negative') {
            negativeFeedback++;
          }
          break;
      }
    }

    // Also factor in database conversations count if events are empty
    if (conversationsStarted === 0) {
      const [convCount] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(conversations)
        .where(
          cutoffDate
            ? and(eq(conversations.siteId, siteId), gte(conversations.createdAt, cutoffDate))
            : eq(conversations.siteId, siteId)
        );
      conversationsStarted = convCount?.count || 0;
    }

    // Calculate latency metrics
    latencies.sort((a, b) => a - b);
    const averageLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((sum, val) => sum + val, 0) / latencies.length) : null;
    const p50LatencyMs =
      latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] ?? null : null;
    const p95LatencyMs =
      latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] ?? null : null;

    // Retrieval rate
    const totalRetrievals = retrievalSuccessCount + retrievalEmptyCount;
    const retrievalSuccessRate =
      totalRetrievals > 0 ? Math.round((retrievalSuccessCount / totalRetrievals) * 100) / 100 : null;

    // Feedback satisfaction rate
    const totalFeedback = positiveFeedback + negativeFeedback;
    const satisfactionRate =
      totalFeedback > 0 ? Math.round((positiveFeedback / totalFeedback) * 100) : null;

    return {
      period,
      timezone,
      conversationsStarted,
      messagesReceived,
      messagesAnswered,
      averageLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      providerErrors,
      rateLimitEvents,
      retrievalSuccessCount,
      retrievalEmptyCount,
      retrievalSuccessRate,
      unansweredCount,
      lowConfidenceCount,
      positiveFeedback,
      negativeFeedback,
      satisfactionRate,
      humanHandoffRequests,
      approximateModelTokens: approximateModelTokens > 0 ? approximateModelTokens : null,
      measurementLabels: {
        conversationsStarted: 'measured',
        messagesReceived: 'measured',
        messagesAnswered: 'measured',
        responseLatency: latencies.length > 0 ? 'measured' : 'unavailable',
        providerErrors: 'measured',
        rateLimitEvents: 'measured',
        retrievalSuccessRate: totalRetrievals > 0 ? 'measured' : 'unavailable',
        unansweredQuestions: 'measured',
        visitorFeedback: totalFeedback > 0 ? 'measured' : 'unavailable',
        humanHandoffRequests: 'measured',
        approximateModelTokens: approximateModelTokens > 0 ? 'estimated' : 'unavailable',
      },
    };
  }

  /**
   * 4. List unanswered or low-confidence questions.
   */
  public static async getUnansweredQuestions(
    siteId: string,
    limit = 20
  ): Promise<UnansweredQuestionRecord[]> {
    const db = getDb();

    // Query low_confidence_question and unanswered_question events
    const eventRows = await db
      .select({
        id: analyticsEvents.id,
        conversationId: analyticsEvents.conversationId,
        metadata: analyticsEvents.metadata,
        createdAt: analyticsEvents.createdAt,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.siteId, siteId),
          sql`${analyticsEvents.eventType} IN ('low_confidence_question', 'unanswered_question')`
        )
      )
      .orderBy(desc(analyticsEvents.createdAt))
      .limit(limit);

    return eventRows.map((row: any) => {
      const meta = (row.metadata || {}) as Record<string, any>;
      return {
        id: row.id,
        conversationId: row.conversationId,
        query: redactPii(meta.query || 'Unanswered query'),
        reason: (meta.reason || 'no_knowledge_matches') as any,
        confidenceScore: meta.confidenceScore,
        createdAt: row.createdAt.toISOString(),
        addedToKnowledge: Boolean(meta.addedToKnowledge),
      };
    });
  }

  /**
   * 5. Convert an unanswered question into an indexed FAQ knowledge source.
   */
  public static async convertToKnowledgeFaq(params: {
    siteId: string;
    question: string;
    answer: string;
  }): Promise<{ id: string; title: string }> {
    const db = getDb();

    const [site] = await db.select().from(sites).where(eq(sites.id, params.siteId)).limit(1);
    if (!site) throw new NotFoundError('Site', params.siteId);

    const title = `FAQ: ${params.question.trim().substring(0, 80)}`;
    const content = `Q: ${params.question.trim()}\nA: ${params.answer.trim()}`;

    const [doc] = await db
      .insert(documents)
      .values({
        siteId: params.siteId,
        title,
        content,
        type: 'faq',
        status: 'ready',
        metadata: {
          generatedFromUnansweredQuestion: true,
          addedAt: new Date().toISOString(),
        },
      })
      .returning();

    if (!doc) {
      throw new Error('Failed to create FAQ knowledge document');
    }

    return {
      id: doc.id,
      title: doc.title,
    };
  }

  /**
   * 6. List and filter conversations with pagination.
   */
  public static async listConversations(
    siteId: string,
    filters: ConversationQueryFilters
  ): Promise<ConversationListResponse> {
    const db = getDb();
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 15));
    const offset = (page - 1) * limit;

    let conditions = eq(conversations.siteId, siteId);

    if (filters.feedback && filters.feedback !== 'all') {
      conditions = and(conditions, eq(conversations.feedback, filters.feedback)) as any;
    }

    if (filters.hasHandoff !== undefined) {
      conditions = and(conditions, eq(conversations.hasHandoff, filters.hasHandoff)) as any;
    }

    if (filters.isLowConfidence !== undefined) {
      conditions = and(conditions, eq(conversations.isLowConfidence, filters.isLowConfidence)) as any;
    }

    if (filters.startDate) {
      conditions = and(conditions, gte(conversations.createdAt, new Date(filters.startDate))) as any;
    }

    if (filters.endDate) {
      conditions = and(conditions, lte(conversations.createdAt, new Date(filters.endDate))) as any;
    }

    // Total count for pagination
    const [countResult] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(conversations)
      .where(conditions);
    const total = countResult?.total || 0;

    // Fetch conversation summaries
    const convRows = await db
      .select()
      .from(conversations)
      .where(conditions)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    const summaries: ConversationSummary[] = await Promise.all(
      convRows.map(async (c: any) => {
        // Fetch message count and last message preview
        const msgs = await db
          .select({
            content: messages.content,
            role: messages.role,
          })
          .from(messages)
          .where(eq(messages.conversationId, c.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        const lastSnippet = msgs[0]?.content ? redactPii(msgs[0].content).substring(0, 90) : 'No messages';

        const [msgCountResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(messages)
          .where(eq(messages.conversationId, c.id));

        return {
          id: c.id,
          siteId: c.siteId,
          visitorId: c.visitorId,
          messageCount: msgCountResult?.count || 0,
          hasHandoff: c.hasHandoff,
          isLowConfidence: c.isLowConfidence,
          feedback: c.feedback as any,
          lastMessageSnippet: lastSnippet,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      })
    );

    return {
      conversations: summaries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 7. Retrieve full transcript of a conversation with PII redaction.
   */
  public static async getConversationDetail(
    siteId: string,
    conversationId: string
  ): Promise<ConversationDetail> {
    const db = getDb();

    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.siteId, siteId)))
      .limit(1);

    if (!conv) {
      throw new NotFoundError('Conversation', conversationId);
    }

    const messageRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    return {
      id: conv.id,
      siteId: conv.siteId,
      visitorId: conv.visitorId,
      hasHandoff: conv.hasHandoff,
      isLowConfidence: conv.isLowConfidence,
      feedback: conv.feedback as any,
      messages: messageRows.map((m: any) => ({
        id: m.id,
        role: m.role as any,
        content: redactPii(m.content),
        citations: m.citations,
        latencyMs: m.latencyMs,
        tokenCountEstimate: m.tokenCountEstimate,
        isUnanswered: m.isUnanswered,
        feedback: m.feedback as any,
        feedbackComment: m.feedbackComment ? redactPii(m.feedbackComment) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  /**
   * 8. Delete an individual conversation and its messages.
   */
  public static async deleteConversation(
    siteId: string,
    conversationId: string,
    userId?: string
  ): Promise<void> {
    const db = getDb();

    const [deleted] = await db
      .delete(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.siteId, siteId)))
      .returning();

    if (!deleted) {
      throw new NotFoundError('Conversation', conversationId);
    }

    await this.logAdminAccess({
      siteId,
      userId,
      action: 'delete_conversation',
      details: { conversationId },
    });
  }

  /**
   * 9. Export conversation transcripts with PII redaction (JSON or CSV).
   */
  public static async exportConversations(params: {
    siteId: string;
    format: 'json' | 'csv';
    filters?: ConversationQueryFilters;
    userId?: string;
  }): Promise<{ data: string; contentType: string; filename: string }> {
    const convList = await this.listConversations(params.siteId, {
      ...params.filters,
      limit: 100, // Export up to 100 recent
    });

    const detailedList = await Promise.all(
      convList.conversations.map((c: any) => this.getConversationDetail(params.siteId, c.id))
    );

    await this.logAdminAccess({
      siteId: params.siteId,
      userId: params.userId,
      action: 'export_conversations',
      details: { format: params.format, count: detailedList.length },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (params.format === 'json') {
      return {
        data: JSON.stringify(detailedList, null, 2),
        contentType: 'application/json',
        filename: `conversations-${params.siteId}-${timestamp}.json`,
      };
    }

    // CSV format
    const rows = [
      ['ConversationId', 'VisitorId', 'MessageRole', 'Content', 'LatencyMs', 'TokensEstimated', 'CreatedAt'],
    ];

    for (const c of detailedList) {
      for (const m of c.messages) {
        rows.push([
          c.id,
          c.visitorId,
          m.role,
          `"${m.content.replace(/"/g, '""')}"`,
          m.latencyMs !== null && m.latencyMs !== undefined ? String(m.latencyMs) : '',
          m.tokenCountEstimate !== null && m.tokenCountEstimate !== undefined ? String(m.tokenCountEstimate) : '',
          m.createdAt,
        ]);
      }
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n');
    return {
      data: csvContent,
      contentType: 'text/csv',
      filename: `conversations-${params.siteId}-${timestamp}.csv`,
    };
  }

  /**
   * 10. Execute retention cleanup job (purges records older than retentionDays).
   */
  public static async cleanupRetention(
    siteId: string,
    userId?: string
  ): Promise<RetentionCleanupResult> {
    const db = getDb();

    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) throw new NotFoundError('Site', siteId);

    const retentionDays = site.retentionDays || 30;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // 1. Purge expired conversations (cascades to messages)
    const purgedConvs = await db
      .delete(conversations)
      .where(and(eq(conversations.siteId, siteId), lte(conversations.createdAt, cutoffDate)))
      .returning();

    // 2. Purge expired analytics events
    const purgedEvents = await db
      .delete(analyticsEvents)
      .where(and(eq(analyticsEvents.siteId, siteId), lte(analyticsEvents.createdAt, cutoffDate)))
      .returning();

    await this.logAdminAccess({
      siteId,
      userId,
      action: 'retention_purge',
      details: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        purgedConversationsCount: purgedConvs.length,
        purgedEventsCount: purgedEvents.length,
      },
    });

    return {
      siteId,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      purgedConversationsCount: purgedConvs.length,
      purgedMessagesCount: purgedConvs.length, // conservative estimate
      purgedEventsCount: purgedEvents.length,
      verifiedAt: new Date().toISOString(),
    };
  }
}
