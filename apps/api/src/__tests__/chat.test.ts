import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { chatRouter } from '../routes/chat.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock DB
vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  sites: {
    id: 'id',
    publicKey: 'public_key',
    name: 'name',
    systemPrompt: 'system_prompt',
    allowedOrigins: 'allowed_origins',
    branding: 'branding',
  },
  siteIntegrations: {
    id: 'id',
    siteId: 'site_id',
    toolId: 'tool_id',
    enabled: 'enabled',
  },
}));

// Mock AI Provider
const mockGenerateStream = vi.fn();
vi.mock('@openagent/ai-provider', () => ({
  createDefaultOrchestrator: vi.fn().mockReturnValue({
    generateStream: (...args: any[]) => mockGenerateStream(...args),
  }),
}));

// Mock Knowledge Retriever
vi.mock('@openagent/knowledge', () => ({
  HybridRetriever: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue([
      {
        chunkId: 'c1',
        title: 'Store FAQ',
        content: 'Hours are 9am to 6pm.',
        score: 0.9,
      },
    ]),
  })),
  ContextSynthesizer: vi.fn().mockImplementation(() => ({
    synthesize: vi.fn().mockReturnValue({
      contextBlock: '<verified_site_knowledge>Hours are 9am to 6pm.</verified_site_knowledge>',
      citations: [{ title: 'Store FAQ', snippet: 'Hours are 9am to 6pm.' }],
      hasEvidence: true,
    }),
  })),
}));

import { getDb } from '@openagent/db';

describe('Public Streaming Chat Endpoint (POST /api/v1/chat/stream)', () => {
  let app: Hono;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect = vi.fn();
    (getDb as any).mockReturnValue({
      select: mockSelect,
    });

    app = new Hono();
    app.route('/api/v1/chat', chatRouter);
    app.onError(errorHandler);
  });

  it('rejects invalid payloads with 400 Validation Error', async () => {
    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: '' }),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown siteId with 404 Not Found', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: 'pk_live_nonexistent',
        message: 'Hello',
      }),
    });

    expect(res.status).toBe(404);
  });

  it('rejects forbidden origins with 403', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'site_1',
              publicKey: 'pk_live_secret123',
              name: 'My Protected Store',
              allowedOrigins: ['https://mystore.com'],
            },
          ]),
        }),
      }),
    });

    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://evil-attacker.com',
      },
      body: JSON.stringify({
        siteId: 'pk_live_secret123',
        message: 'Hello assistant',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('streams response successfully with SSE data format', async () => {
    const siteResult = [
      {
        id: 'site_1',
        publicKey: 'pk_live_valid',
        name: 'Online Shop',
        systemPrompt: 'You are an e-commerce assistant.',
        allowedOrigins: ['https://valid-origin.com'],
      },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const promise = Promise.resolve([]) as any;
          promise.limit = vi.fn().mockResolvedValue(siteResult);
          return promise;
        }),
      }),
    });

    mockGenerateStream.mockImplementation(async function* () {
      yield { text: 'Hello, ', done: false };
      yield { text: 'how can I help?', done: true };
    });

    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'https://valid-origin.com',
      },
      body: JSON.stringify({
        siteId: 'pk_live_valid',
        message: 'What are your store hours?',
        history: [{ role: 'visitor', content: 'Hi' }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('data: {"text":"Hello, "}');
    expect(body).toContain('data: {"text":"how can I help?"}');
    expect(body).toContain('data: [DONE]');
  });
});
