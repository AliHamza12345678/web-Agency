import { CloudflareWorkersAIProvider } from './adapters/cloudflare.js';
import { OpenRouterFreeProvider } from './adapters/openrouter.js';
import { OllamaLocalProvider } from './adapters/ollama.js';
import { AIOrchestrator } from './orchestrator.js';
import type { LLMProvider } from './types.js';

export * from './types.js';
export * from './adapters/cloudflare.js';
export * from './adapters/openrouter.js';
export * from './adapters/ollama.js';
export * from './orchestrator.js';

/**
 * Factory helper that instantiates and wires AI providers based on active environment variables.
 */
export function createDefaultOrchestrator(env: Record<string, string | undefined> = process.env): AIOrchestrator {
  const providers: Record<string, LLMProvider> = {};

  // 1. Cloudflare Workers AI
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    providers['cloudflare'] = new CloudflareWorkersAIProvider({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      defaultModel: env.AI_PRIMARY_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    });
  }

  // 2. OpenRouter Free Models
  if (env.OPENROUTER_API_KEY) {
    providers['openrouter'] = new OpenRouterFreeProvider({
      apiKey: env.OPENROUTER_API_KEY,
      defaultModel: env.AI_FALLBACK_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    });
  }

  // 3. Local Ollama (Always available if configured)
  providers['ollama'] = new OllamaLocalProvider({
    baseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: 'llama3.2',
  });

  const primary = env.AI_PRIMARY_PROVIDER || 'cloudflare';
  const fallback = env.AI_FALLBACK_PROVIDER || 'openrouter';

  return new AIOrchestrator({
    providers,
    primaryProviderId: providers[primary] ? primary : Object.keys(providers)[0] || 'ollama',
    fallbackProviderId: providers[fallback] ? fallback : undefined,
    aiDisabled: env.AI_DISABLED === 'true' || env.AI_DISABLED === '1',
    requestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS) || 25000,
    maxOutputTokens: Number(env.AI_MAX_OUTPUT_TOKENS) || 1024,
  });
}
