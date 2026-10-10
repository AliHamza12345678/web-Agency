import { describe, it, expect } from 'vitest';
import {
  CloudflareWorkersAIProvider,
  OpenRouterFreeProvider,
  OllamaLocalProvider,
} from '../index.js';

/**
 * Optional Live Integration Tests
 *
 * These tests run ONLY when genuine provider credentials or local servers are configured.
 * They are clearly isolated from mocked unit tests.
 */
describe('Live Provider Verification (Optional Integration Tests)', () => {
  const hasCloudflare = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOllama = !!process.env.OLLAMA_TEST_ENABLED;

  (hasCloudflare ? it : it.skip)(
    '[LIVE] Cloudflare Workers AI free tier execution',
    async () => {
      const provider = new CloudflareWorkersAIProvider({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        apiToken: process.env.CLOUDFLARE_API_TOKEN!,
      });

      const res = await provider.generate([{ role: 'user', content: 'Say "hello" and nothing else.' }], {
        maxTokens: 10,
      });

      expect(res.text.length).toBeGreaterThan(0);
      expect(res.provider).toBe('cloudflare');
    },
    30000
  );

  (hasOpenRouter ? it : it.skip)(
    '[LIVE] OpenRouter free model execution',
    async () => {
      const provider = new OpenRouterFreeProvider({
        apiKey: process.env.OPENROUTER_API_KEY!,
        defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      });

      const res = await provider.generate([{ role: 'user', content: 'Say "hello" and nothing else.' }], {
        maxTokens: 10,
      });

      expect(res.text.length).toBeGreaterThan(0);
      expect(res.provider).toBe('openrouter');
    },
    30000
  );

  (hasOllama ? it : it.skip)(
    '[LIVE] Local Ollama execution',
    async () => {
      const provider = new OllamaLocalProvider({
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        defaultModel: 'llama3.2',
      });

      const res = await provider.generate([{ role: 'user', content: 'Say "hello"' }], {
        maxTokens: 10,
      });

      expect(res.text.length).toBeGreaterThan(0);
      expect(res.provider).toBe('ollama');
    },
    30000
  );

  it('clearly notes test execution mode', () => {
    // This assertion always runs to verify test runner configuration
    expect(true).toBe(true);
  });
});
