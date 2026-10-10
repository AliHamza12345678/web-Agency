import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { z } from 'zod';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@openagent/core';
import { getDb, sites } from '@openagent/db';
import { eq } from 'drizzle-orm';
import { createDefaultOrchestrator } from '@openagent/ai-provider';
import {
  ConversationEngine,
  type ConversationTurn,
  type SitePersonaConfig,
} from '@openagent/conversation-engine';

export const chatRouter = new Hono();

const chatRequestSchema = z.object({
  siteId: z.string().min(1, 'Site ID / Public key is required'),
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
  const db = getDb();

  // 1. Resolve site by public key
  const [site] = await db
    .select({
      id: sites.id,
      name: sites.name,
      systemPrompt: sites.systemPrompt,
      allowedOrigins: sites.allowedOrigins,
      branding: sites.branding,
    })
    .from(sites)
    .where(eq(sites.publicKey, siteId))
    .limit(1);

  if (!site) {
    throw new NotFoundError('Website chatbot was not found for the provided identifier');
  }

  // 2. Validate Origin against allowed origins
  const requestOrigin = c.req.header('origin');
  if (site.allowedOrigins && site.allowedOrigins.length > 0 && requestOrigin) {
    const isAllowed = site.allowedOrigins.some((allowed) => {
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

  // 3. Configure Site Persona & Bounded Multilingual Dialogue State
  const branding = (site.branding as any) || {};
  const sitePersona: SitePersonaConfig = {
    siteName: site.name,
    botName: branding.botName || `${site.name} Assistant`,
    systemPrompt: site.systemPrompt || undefined,
    supportContact: branding.supportEmail || 'our customer care team',
  };

  const formattedHistory: ConversationTurn[] = history.map((h) => ({
    role: (h.role === 'assistant' ? 'assistant' : 'visitor') as 'visitor' | 'assistant',
    content: h.content,
  }));

  const conversationEngine = getConversationEngine();

  // 4. Stream response using SSE with dynamic language matching
  return streamText(c, async (stream) => {
    try {
      const tokenStream = conversationEngine.generateStream(
        message.trim(),
        formattedHistory,
        sitePersona
      );

      let metadataEmitted = false;

      for await (const chunk of tokenStream) {
        if (!metadataEmitted && chunk.languageInfo) {
          metadataEmitted = true;
          await stream.write(
            `data: ${JSON.stringify({
              meta: {
                language: chunk.languageInfo.language,
                script: chunk.languageInfo.script,
                isCodeSwitching: chunk.languageInfo.isCodeSwitching,
              },
            })}\n\n`
          );
        }

        if (chunk.text) {
          await stream.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      await stream.write('data: [DONE]\n\n');
    } catch (err: any) {
      const errorMsg =
        err.message || 'Our conversational assistant is temporarily experiencing high volume. Please try again shortly.';
      await stream.write(`data: ${JSON.stringify({ text: `\n\n*${errorMsg}*` })}\n\n`);
      await stream.write('data: [DONE]\n\n');
    }
  });
});
