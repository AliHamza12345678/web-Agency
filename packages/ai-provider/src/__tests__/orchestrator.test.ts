import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIOrchestrator,
  type LLMProvider,
  type ChatMessage,
  ProviderError,
  ProviderUnavailableError,
} from '../index.js';

describe('AIOrchestrator Resilience & Circuit Breaker', () => {
  let mockPrimary: LLMProvider;
  let mockFallback: LLMProvider;

  beforeEach(() => {
    mockPrimary = {
      providerId: 'cloudflare',
      defaultModel: '@cf/meta/llama-3.1-8b-instruct',
      getCapabilities: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue({
        provider: 'cloudflare',
        healthy: true,
        lastChecked: new Date().toISOString(),
        inCooldown: false,
      }),
      generate: vi.fn(),
      generateStream: vi.fn(),
    };

    mockFallback = {
      providerId: 'openrouter',
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      getCapabilities: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue({
        provider: 'openrouter',
        healthy: true,
        lastChecked: new Date().toISOString(),
        inCooldown: false,
      }),
      generate: vi.fn(),
      generateStream: vi.fn(),
    };
  });

  it('successfully generates response using primary provider', async () => {
    (mockPrimary.generate as any).mockResolvedValue({
      text: 'Hello from Cloudflare!',
      model: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'cloudflare',
      usage: { totalTokens: 15 },
    });

    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
    });

    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const res = await orchestrator.generate(messages);

    expect(res.text).toBe('Hello from Cloudflare!');
    expect(res.provider).toBe('cloudflare');
    expect(mockPrimary.generate).toHaveBeenCalledTimes(1);
    expect(mockFallback.generate).not.toHaveBeenCalled();
  });

  it('fails over to secondary provider when primary encounters a 429 rate limit', async () => {
    (mockPrimary.generate as any).mockRejectedValue(
      new ProviderError('cloudflare', 'Daily neuron quota exceeded', 429)
    );
    (mockFallback.generate as any).mockResolvedValue({
      text: 'Hello from OpenRouter free tier!',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      provider: 'openrouter',
    });

    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
      cooldownDurationMs: 60000,
    });

    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const res = await orchestrator.generate(messages);

    expect(res.text).toBe('Hello from OpenRouter free tier!');
    expect(res.provider).toBe('openrouter');
    expect(mockPrimary.generate).toHaveBeenCalledTimes(1);
    expect(mockFallback.generate).toHaveBeenCalledTimes(1);
    // Primary should now be in cooldown
    expect(orchestrator.isProviderInCooldown('cloudflare')).toBe(true);
  });

  it('skips providers in cooldown immediately without network attempts', async () => {
    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
      cooldownDurationMs: 60000,
    });

    orchestrator.placeProviderInCooldown('cloudflare', 'Manual test cooldown');
    expect(orchestrator.isProviderInCooldown('cloudflare')).toBe(true);

    (mockFallback.generate as any).mockResolvedValue({
      text: 'Direct answer from fallback',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      provider: 'openrouter',
    });

    const res = await orchestrator.generate([{ role: 'user', content: 'Hi' }]);

    expect(res.text).toBe('Direct answer from fallback');
    // Primary was skipped directly without calling generate
    expect(mockPrimary.generate).not.toHaveBeenCalled();
    expect(mockFallback.generate).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when administrator disable switch is enabled', async () => {
    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary },
      primaryProviderId: 'cloudflare',
      aiDisabled: true,
    });

    await expect(orchestrator.generate([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      ProviderUnavailableError
    );
    expect(mockPrimary.generate).not.toHaveBeenCalled();
  });

  it('yields honest degradation message when all configured providers fail', async () => {
    (mockPrimary.generate as any).mockRejectedValue(
      new ProviderError('cloudflare', 'Rate limited', 429)
    );
    (mockFallback.generate as any).mockRejectedValue(
      new ProviderError('openrouter', 'Service unavailable', 503)
    );

    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
    });

    await expect(orchestrator.generate([{ role: 'user', content: 'Help' }])).rejects.toThrow(
      ProviderUnavailableError
    );
  });

  it('streams response and handles pre-stream failover to secondary provider', async () => {
    (mockPrimary.generateStream as any).mockImplementation(() => {
      throw new ProviderError('cloudflare', 'Quota exhausted', 429);
    });

    (mockFallback.generateStream as any).mockImplementation(async function* () {
      yield { text: 'Streamed ', done: false };
      yield { text: 'content', done: true };
    });

    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
    });

    const chunks: string[] = [];
    for await (const chunk of orchestrator.generateStream([{ role: 'user', content: 'Stream test' }])) {
      if (chunk.text) chunks.push(chunk.text);
    }

    expect(chunks.join('')).toBe('Streamed content');
    expect(orchestrator.isProviderInCooldown('cloudflare')).toBe(true);
  });

  it('handles mid-stream failure honestly without splicing incompatible tokens', async () => {
    (mockPrimary.generateStream as any).mockImplementation(async function* () {
      yield { text: 'Partial initial reply', done: false };
      throw new Error('Mid-flight TCP disconnect');
    });

    const orchestrator = new AIOrchestrator({
      providers: { cloudflare: mockPrimary, openrouter: mockFallback },
      primaryProviderId: 'cloudflare',
      fallbackProviderId: 'openrouter',
    });

    const chunks: string[] = [];
    for await (const chunk of orchestrator.generateStream([{ role: 'user', content: 'Stream test' }])) {
      if (chunk.text) chunks.push(chunk.text);
    }

    const output = chunks.join('');
    expect(output).toContain('Partial initial reply');
    expect(output).toContain('*[Connection interrupted. Please refresh or retry.]*');
    // Fallback should NOT have been called mid-stream to avoid Frankenstein hallucinations
    expect(mockFallback.generateStream).not.toHaveBeenCalled();
  });
});
