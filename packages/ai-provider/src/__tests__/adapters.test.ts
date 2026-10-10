import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CloudflareWorkersAIProvider,
  OpenRouterFreeProvider,
  OllamaLocalProvider,
} from '../index.js';

describe('AI Provider Adapters (Simulated / Mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('CloudflareWorkersAIProvider', () => {
    it('reports correct capabilities', () => {
      const cf = new CloudflareWorkersAIProvider({
        accountId: 'test-account-id',
        apiToken: 'test-api-token',
      });
      const caps = cf.getCapabilities();

      expect(caps.provider).toBe('cloudflare');
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsEmbeddings).toBe(true);
      expect(caps.isFreeTier).toBe(true);
    });

    it('generates completion via Cloudflare AI Run endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            response: 'Here is the response from Llama 3.1',
            usage: { total_tokens: 28 },
          },
          success: true,
        }),
      });
      globalThis.fetch = mockFetch;

      const cf = new CloudflareWorkersAIProvider({
        accountId: 'acc123',
        apiToken: 'tok456',
        defaultModel: '@cf/meta/llama-3.1-8b-instruct',
      });

      const res = await cf.generate([{ role: 'user', content: 'Explain AI' }]);

      expect(res.text).toBe('Here is the response from Llama 3.1');
      expect(res.provider).toBe('cloudflare');
      expect(res.usage?.totalTokens).toBe(28);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/meta/llama-3.1-8b-instruct',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok456',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('parses streaming SSE events from Cloudflare', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('data: {"response":"First "}\n\n'),
        encoder.encode('data: {"response":"Second"}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const cf = new CloudflareWorkersAIProvider({
        accountId: 'acc123',
        apiToken: 'tok456',
      });

      const collected: string[] = [];
      for await (const chunk of cf.generateStream([{ role: 'user', content: 'Stream this' }])) {
        if (chunk.text) collected.push(chunk.text);
      }

      expect(collected.join('')).toBe('First Second');
    });

    it('generates text embeddings for RAG', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            data: [[0.1, 0.2, -0.3, 0.4]],
          },
        }),
      });

      const cf = new CloudflareWorkersAIProvider({
        accountId: 'acc123',
        apiToken: 'tok456',
      });

      const result = await cf.embedText('Knowledge base test snippet');
      expect(result.dimensions).toBe(4);
      expect(result.embedding).toEqual([0.1, 0.2, -0.3, 0.4]);
    });

    it('converts HTTP 429 into ProviderError with isRateLimit=true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Daily allocation exhausted',
      });

      const cf = new CloudflareWorkersAIProvider({
        accountId: 'acc123',
        apiToken: 'tok456',
      });

      await expect(cf.generate([{ role: 'user', content: 'Ping' }])).rejects.toMatchObject({
        isRateLimit: true,
        statusCode: 429,
      });
    });
  });

  describe('OpenRouterFreeProvider', () => {
    it('generates completion with required headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Response from free OpenRouter model',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25,
          },
        }),
      });
      globalThis.fetch = mockFetch;

      const or = new OpenRouterFreeProvider({
        apiKey: 'sk-or-test-key',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
        siteUrl: 'https://mysite.com',
        siteName: 'MySite',
      });

      const res = await or.generate([{ role: 'user', content: 'Hello' }]);

      expect(res.text).toBe('Response from free OpenRouter model');
      expect(res.provider).toBe('openrouter');
      expect(res.usage?.totalTokens).toBe(25);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-or-test-key',
            'HTTP-Referer': 'https://mysite.com',
            'X-Title': 'MySite',
          }),
        })
      );
    });

    it('parses OpenAI SSE stream format from OpenRouter', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('data: {"choices":[{"delta":{"content":"Fast "}}]}\n\n'),
        encoder.encode('data: {"choices":[{"delta":{"content":"streaming"}}]}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
      ];

      let chunkIndex = 0;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () => {
              if (chunkIndex < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          }),
        },
      });

      const or = new OpenRouterFreeProvider({ apiKey: 'sk-or-test' });
      const collected: string[] = [];

      for await (const chunk of or.generateStream([{ role: 'user', content: 'Stream' }])) {
        if (chunk.text) collected.push(chunk.text);
      }

      expect(collected.join('')).toBe('Fast streaming');
    });
  });

  describe('OllamaLocalProvider', () => {
    it('checks health by probing /api/tags', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
      });

      const ollama = new OllamaLocalProvider({ baseUrl: 'http://localhost:11434' });
      const health = await ollama.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('ollama');
    });

    it('generates response via /api/chat', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: 'Local Ollama output' },
          prompt_eval_count: 5,
          eval_count: 10,
        }),
      });

      const ollama = new OllamaLocalProvider();
      const res = await ollama.generate([{ role: 'user', content: 'Local query' }]);

      expect(res.text).toBe('Local Ollama output');
      expect(res.usage?.totalTokens).toBe(15);
    });

    it('streams response via NDJSON from Ollama', async () => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode('{"message":{"content":"Hello "},"done":false}\n'),
        encoder.encode('{"message":{"content":"Ollama"},"done":true}\n'),
      ];

      let chunkIndex = 0;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: () => {
              if (chunkIndex < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
              }
              return Promise.resolve({ done: true, value: undefined });
            },
          }),
        },
      });

      const ollama = new OllamaLocalProvider();
      const collected: string[] = [];

      for await (const chunk of ollama.generateStream([{ role: 'user', content: 'Test' }])) {
        if (chunk.text) collected.push(chunk.text);
      }

      expect(collected.join('')).toBe('Hello Ollama');
    });
  });
});
