import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { z } from 'zod';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  estimateTokens,
  inspectAdversarialInput,
  neutralizePromptBoundaries,
  type ApiSuccessResponse,
} from '@openagent/core';
import { getDb, sites, siteIntegrations, conversations, messages as dbMessages } from '@openagent/db';
import { eq } from 'drizzle-orm';
import { createDefaultOrchestrator } from '@openagent/ai-provider';
import {
  ConversationEngine,
  type ConversationTurn,
  type SitePersonaConfig,
} from '@openagent/conversation-engine';
import { HybridRetriever, ContextSynthesizer } from '@openagent/knowledge';
import { ToolRegistry, ToolPromptFormatter } from '@openagent/tools';
import { AnalyticsService } from '../services/analytics-service.js';

export const chatRouter = new Hono();

const chatRequestSchema = z.object({
  siteId: z.string().min(1, 'Site ID / Public key is required'),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1, 'Message cannot be empty').max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['visitor', 'assistant', 'system', 'user']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

const feedbackSchema = z.object({
  siteId: z.string().min(1, 'Site ID is required'),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  rating: z.enum(['positive', 'negative']),
  comment: z.string().max(500).optional(),
});

// Lazy-initialized orchestrator & conversation engine
let orchestratorInstance: ReturnType<typeof createDefaultOrchestrator> | null = null;
let conversationEngineInstance: ConversationEngine | null = null;

function getOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = createDefaultOrchestrator();
  }
  return orchestratorInstance;
}

function getConversationEngine() {
  if (!conversationEngineInstance) {
    conversationEngineInstance = new ConversationEngine(getOrchestrator(), 6);
  }
  return conversationEngineInstance;
}

/**
 * Visitor feedback endpoint (thumbs up / down)
 */
chatRouter.post('/feedback', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { siteId, conversationId, messageId, rating, comment } = parsed.data;
  const db = getDb();

  // Resolve site
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.publicKey, siteId))
    .limit(1);

  const resolvedSiteId = site ? site.id : siteId;

  // 1. Record analytics event
  await AnalyticsService.recordEvent({
    siteId: resolvedSiteId,
    conversationId,
    eventType: 'visitor_feedback',
    metadata: {
      rating,
      comment: comment || null,
      messageId,
    },
  });

  // 2. Update database record if messageId or conversationId exists
  if (messageId) {
    try {
      const u = db
        .update(dbMessages)
        .set({
          feedback: rating,
          feedbackComment: comment || null,
        })
        .where(eq(dbMessages.id, messageId));
      if (u && typeof (u as any).catch === 'function') {
        await u.catch(() => {});
      } else {
        await u;
      }
    } catch {}
  }

  if (conversationId) {
    try {
      const u = db
        .update(conversations)
        .set({
          feedback: rating,
        })
        .where(eq(conversations.id, conversationId));
      if (u && typeof (u as any).catch === 'function') {
        await u.catch(() => {});
      } else {
        await u;
      }
    } catch {}
  }

  const response: ApiSuccessResponse<{ message: string }> = {
    success: true,
    data: { message: 'Feedback recorded successfully' },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});

/**
 * Public Streaming Multilingual Chat Endpoint (Server-Sent Events)
 */
chatRouter.post('/stream', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('Malformed JSON payload');
  });

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation error', parsed.error.issues);
  }

  const { siteId, message, history } = parsed.data;
  let activeConversationId = parsed.data.conversationId;
  const db = getDb();

  // 1. Resolve site by public key
  const [site] = await db
    .select({
      id: sites.id,
      name: sites.name,
      systemPrompt: sites.systemPrompt,
      allowedOrigins: sites.allowedOrigins,
      branding: sites.branding,
      publishedConfiguration: sites.publishedConfiguration,
      draftConfiguration: sites.draftConfiguration,
    })
    .from(sites)
    .where(eq(sites.publicKey, siteId))
    .limit(1);

  if (!site) {
    throw new NotFoundError('Website chatbot was not found for the provided identifier');
  }

  // 1.1 Configurable Quota & Message Caps Enforcement (Free-Tier Protection)
  const limits = ((site.publishedConfiguration as any)?.limits || {}) as {
    maxMessagesPerConversation?: number;
    maxDailyConversations?: number;
  };
  const maxMessages = limits.maxMessagesPerConversation || 50;

  if (history && history.length >= maxMessages) {
    return streamText(c, async (stream) => {
      await stream.write(
        `data: ${JSON.stringify({
          text: 'This conversation has reached the maximum message limit configured for this website. Please click the restart button or refresh the page to start a new chat.',
        })}\n\n`
      );
      await stream.write('data: [DONE]\n\n');
    });
  }

  // 2. Validate Origin against allowed origins
  const requestOrigin = c.req.header('origin');
  if (site.allowedOrigins && site.allowedOrigins.length > 0 && requestOrigin) {
    const isAllowed = site.allowedOrigins.some((allowed: string) => {
      if (allowed === '*' || allowed === requestOrigin) return true;
      try {
        const allowedHost = new URL(allowed).host;
        const reqHost = new URL(requestOrigin).host;
        return allowedHost === reqHost;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      throw new ForbiddenError(`Origin '${requestOrigin}' is not permitted to chat with this assistant`);
    }
  }

  // 3. Resolve or create persistent conversation record
  const visitorId = c.req.header('x-visitor-session') || 'v_anon';

  try {
    if (!activeConversationId && db && typeof db.insert === 'function') {
      const res = db
        .insert(conversations)
        .values({
          siteId: site.id,
          visitorId,
        });
      if (res && typeof (res as any).returning === 'function') {
        const [newConv] = await (res as any).returning();
        if (newConv) {
          activeConversationId = newConv.id;
          await AnalyticsService.recordEvent({
            siteId: site.id,
            conversationId: activeConversationId,
            eventType: 'conversation_started',
          });
        }
      }
    }
  } catch (err) {
    // If DB is offline in test or mock environment, continue gracefully
  }

  // 4. Inspect for adversarial prompt injection & neutralize prompt boundaries
  const cleanMessage = neutralizePromptBoundaries(message.trim());
  const adversarialInspection = inspectAdversarialInput(cleanMessage);

  if (adversarialInspection.isSuspicious) {
    await AnalyticsService.recordEvent({
      siteId: site.id,
      conversationId: activeConversationId,
      eventType: 'adversarial_prompt_attempt',
      metadata: {
        flags: adversarialInspection.flags,
        score: adversarialInspection.score,
      },
    });
  }

  // Record visitor message
  await AnalyticsService.recordEvent({
    siteId: site.id,
    conversationId: activeConversationId,
    eventType: 'message_received',
    metadata: {
      query: cleanMessage,
    },
  });

  try {
    if (activeConversationId && db && typeof db.insert === 'function') {
      await db.insert(dbMessages).values({
        conversationId: activeConversationId,
        siteId: site.id,
        role: 'visitor',
        content: cleanMessage,
      });
    }
  } catch {}

  // 5. Retrieve Tenant-Isolated Knowledge Chunks (RAG)
  const retriever = new HybridRetriever();
  const synthesizer = new ContextSynthesizer();

  const retrievedChunks = await retriever
    .search({
      query: cleanMessage,
      siteId: site.id,
      topK: 4,
      minScore: 0.5,
    })
    .catch(() => []);

  if (retrievedChunks.length > 0) {
    await AnalyticsService.recordEvent({
      siteId: site.id,
      conversationId: activeConversationId,
      eventType: 'retrieval_success',
      metadata: {
        count: retrievedChunks.length,
        topScore: retrievedChunks[0]?.score || 0,
      },
    });
  } else {
    await AnalyticsService.recordEvent({
      siteId: site.id,
      conversationId: activeConversationId,
      eventType: 'retrieval_empty',
      metadata: { query: message.trim() },
    });
  }

  const groundedPayload = synthesizer.synthesize(retrievedChunks);

  // 6. Check for human handoff request trigger
  const lowerMsg = message.toLowerCase();
  const isHandoffRequest =
    lowerMsg.includes('human') ||
    lowerMsg.includes('agent') ||
    lowerMsg.includes('talk to someone') ||
    lowerMsg.includes('representative') ||
    lowerMsg.includes('escalate');

  if (isHandoffRequest) {
    await AnalyticsService.recordEvent({
      siteId: site.id,
      conversationId: activeConversationId,
      eventType: 'human_handoff_requested',
      metadata: { trigger: 'visitor_keyword' },
    });
    if (activeConversationId) {
      try {
        const u = db
          .update(conversations)
          .set({ hasHandoff: true })
          .where(eq(conversations.id, activeConversationId));
        if (u && typeof (u as any).catch === 'function') {
          await u.catch(() => {});
        } else {
          await u;
        }
      } catch {}
    }
  }

  // 7. Configure Site Persona & Safe Tool-Calling Directives
  const branding = (site.branding as any) || {};

  const configuredIntegrations = await db
    .select()
    .from(siteIntegrations)
    .where(eq(siteIntegrations.siteId, site.id))
    .catch(() => []);

  const disabledTools = new Set(
    configuredIntegrations.filter((i: any) => i.enabled === false).map((i: any) => i.toolId)
  );

  const activeTools = ToolRegistry.getInstance()
    .getAll()
    .filter((t: any) => !disabledTools.has(t.id));

  const toolsPrompt = ToolPromptFormatter.formatToolsSystemPrompt(activeTools);

  const siteConfig = (site.publishedConfiguration || site.draftConfiguration || {}) as any;
  const assistantProfile = siteConfig.profile;

  const sitePersona: SitePersonaConfig = {
    siteName: site.name,
    botName: branding.botName || `${site.name} Assistant`,
    systemPrompt: site.systemPrompt || undefined,
    approvedKnowledge: groundedPayload.contextBlock || undefined,
    supportContact: branding.supportEmail || siteConfig.support?.email || 'our customer care team',
    toolsPrompt: toolsPrompt || undefined,
    profile: assistantProfile,
  };

  // Bound conversation history to last 8 turns to prevent token runaway and excessive latency
  const boundedHistory = (history || []).slice(-8);
  const formattedHistory: ConversationTurn[] = boundedHistory.map((h: any) => ({
    role: (h.role === 'assistant' ? 'assistant' : 'visitor') as 'visitor' | 'assistant',
    content: h.content,
  }));

  const conversationEngine = getConversationEngine();
  const startTime = Date.now();

  // 8. Stream response using SSE with dynamic language matching & citations
  return streamText(c, async (stream) => {
    let accumulatedText = '';
    let isAborted = false;

    stream.onAbort(() => {
      isAborted = true;
    });

    try {
      const tokenStream = conversationEngine.generateStream(
        cleanMessage,
        formattedHistory,
        sitePersona
      );

      let metadataEmitted = false;

      for await (const chunk of tokenStream) {
        if (isAborted) break;
        if (!metadataEmitted && chunk.languageInfo) {
          metadataEmitted = true;
          await stream.write(
            `data: ${JSON.stringify({
              meta: {
                conversationId: activeConversationId,
                language: chunk.languageInfo.language,
                script: chunk.languageInfo.script,
                isCodeSwitching: chunk.languageInfo.isCodeSwitching,
                citations: groundedPayload.citations,
              },
            })}\n\n`
          );
        }

        if (chunk.text) {
          accumulatedText += chunk.text;
          await stream.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      await stream.write('data: [DONE]\n\n');

      // 9. Measure Latency & Persist Assistant Turn
      const durationMs = Date.now() - startTime;
      const tokensEstimated = estimateTokens(accumulatedText);

      await AnalyticsService.recordEvent({
        siteId: site.id,
        conversationId: activeConversationId,
        eventType: 'message_answered',
        durationMs,
        metadata: {
          tokensEstimated,
          citationsCount: groundedPayload.citations.length,
        },
      });

      // Detect low-confidence answer or lack of knowledge
      const isUncertain =
        retrievedChunks.length === 0 ||
        accumulatedText.toLowerCase().includes('not enough verified information') ||
        accumulatedText.toLowerCase().includes('cannot find information');

      if (isUncertain) {
        await AnalyticsService.recordEvent({
          siteId: site.id,
          conversationId: activeConversationId,
          eventType: 'low_confidence_question',
          metadata: {
            query: message.trim(),
            reason: retrievedChunks.length === 0 ? 'no_knowledge_matches' : 'low_confidence',
          },
        });
        if (activeConversationId) {
          try {
            const u = db
              .update(conversations)
              .set({ isLowConfidence: true })
              .where(eq(conversations.id, activeConversationId));
            if (u && typeof (u as any).catch === 'function') {
              await u.catch(() => {});
            } else {
              await u;
            }
          } catch {}
        }
      }

      try {
        if (activeConversationId) {
          await db.insert(dbMessages).values({
            conversationId: activeConversationId,
            siteId: site.id,
            role: 'assistant',
            content: accumulatedText,
            citations: groundedPayload.citations,
            latencyMs: durationMs,
            tokenCountEstimate: tokensEstimated,
            isUnanswered: isUncertain,
          });
        }
      } catch {}
    } catch (err: any) {
      // Record provider failure event
      const durationMs = Date.now() - startTime;
      await AnalyticsService.recordEvent({
        siteId: site.id,
        conversationId: activeConversationId,
        eventType: err.message?.includes('rate') ? 'provider_rate_limit' : 'provider_error',
        durationMs,
        metadata: { error: err.message },
      });

      const errorMsg =
        err.message ||
        'Our conversational assistant is temporarily experiencing high volume. Please try again shortly.';
      await stream.write(`data: ${JSON.stringify({ text: `\n\n*${errorMsg}*` })}\n\n`);
      await stream.write('data: [DONE]\n\n');
    }
  });
});
