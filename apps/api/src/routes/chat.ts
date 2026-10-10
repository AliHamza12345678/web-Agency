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
import { createDefaultOrchestrator, type ChatMessage } from '@openagent/ai-provider';

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

// Lazy-initialized orchestrator
let orchestratorInstance: ReturnType<typeof createDefaultOrchestrator> | null = null;
function getOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = createDefaultOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * Public Streaming Chat Endpoint (Server-Sent Events)
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

  // 1. Resolve site by public key or UUID
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

  // 3. Assemble prompt context
  const defaultPrompt =
    'You are a friendly, concise, and helpful website assistant. Always answer grounded in the site context. If unsure, politely refer the visitor to site contact.';
  const systemInstruction = site.systemPrompt ? site.systemPrompt.trim() : defaultPrompt;

  const messages: ChatMessage[] = [
    { role: 'system', content: `${systemInstruction}\n\nImportant: Always reply in the same language as the visitor's query.` },
    ...history.slice(-6).map((h) => ({
      role: (h.role === 'visitor' ? 'user' : h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message.trim() },
  ];

  const orchestrator = getOrchestrator();

  // 4. Stream response using SSE
  return streamText(c, async (stream) => {
    try {
      const tokenStream = orchestrator.generateStream(messages);

      for await (const chunk of tokenStream) {
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
