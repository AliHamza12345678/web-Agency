import {
  type LLMProvider,
  type ChatMessage,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type StreamChunk,
  type ProviderHealth,
  ProviderError,
  ProviderUnavailableError,
} from './types.js';
import { defaultLogger } from '@openagent/core';

export interface OrchestratorConfig {
  providers: Record<string, LLMProvider>;
  primaryProviderId: string;
  fallbackProviderId?: string;
  aiDisabled?: boolean;
  requestTimeoutMs?: number;
  maxOutputTokens?: number;
  cooldownDurationMs?: number;
}

export class AIOrchestrator {
  private providers: Map<string, LLMProvider> = new Map();
  private primaryProviderId: string;
  private fallbackProviderId?: string;
  private aiDisabled: boolean;
  private requestTimeoutMs: number;
  private maxOutputTokens: number;
  private cooldownDurationMs: number;

  // Track provider cooldown expiry timestamps
  private cooldowns: Map<string, number> = new Map();

  constructor(config: OrchestratorConfig) {
    for (const [id, provider] of Object.entries(config.providers)) {
      this.providers.set(id, provider);
    }

    this.primaryProviderId = config.primaryProviderId;
    this.fallbackProviderId = config.fallbackProviderId;
    this.aiDisabled = !!config.aiDisabled;
    this.requestTimeoutMs = config.requestTimeoutMs || 25000;
    this.maxOutputTokens = config.maxOutputTokens || 1024;
    this.cooldownDurationMs = config.cooldownDurationMs || 60000; // 60 seconds
  }

  public isProviderInCooldown(providerId: string): boolean {
    const expiresAt = this.cooldowns.get(providerId);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.cooldowns.delete(providerId);
      return false;
    }
    return true;
  }

  public placeProviderInCooldown(providerId: string, reason: string): void {
    const expiresAt = Date.now() + this.cooldownDurationMs;
    this.cooldowns.set(providerId, expiresAt);
    defaultLogger.warn(`[AI Orchestrator] Provider '${providerId}' placed in cooldown for ${this.cooldownDurationMs / 1000}s. Reason: ${reason}`, {
      providerId,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  public getAvailableProviders(): string[] {
    const list: string[] = [];
    if (this.primaryProviderId && this.providers.has(this.primaryProviderId)) {
      list.push(this.primaryProviderId);
    }
    if (
      this.fallbackProviderId &&
      this.fallbackProviderId !== this.primaryProviderId &&
      this.providers.has(this.fallbackProviderId)
    ) {
      list.push(this.fallbackProviderId);
    }
    return list;
  }

  public async getHealthReport(): Promise<Record<string, ProviderHealth>> {
    const report: Record<string, ProviderHealth> = {};
    for (const [id, provider] of this.providers.entries()) {
      const inCooldown = this.isProviderInCooldown(id);
      const cooldownUntil = inCooldown ? new Date(this.cooldowns.get(id)!).toISOString() : undefined;
      const health = await provider.checkHealth();
      report[id] = {
        ...health,
        inCooldown,
        cooldownUntil,
      };
    }
    return report;
  }

  /**
   * Generates completion with automatic fallback and bounded retry policy.
   */
  public async generate(
    messages: ChatMessage[],
    customOptions?: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    if (this.aiDisabled) {
      throw new ProviderUnavailableError('AI conversational services are currently disabled by administrator policy.');
    }

    const options: ChatCompletionOptions = {
      timeoutMs: this.requestTimeoutMs,
      maxTokens: this.maxOutputTokens,
      ...customOptions,
    };

    const targetProviders = this.getAvailableProviders();
    const errors: Error[] = [];

    for (const providerId of targetProviders) {
      if (this.isProviderInCooldown(providerId)) {
        defaultLogger.info(`[AI Orchestrator] Skipping '${providerId}' (currently in cooldown).`);
        continue;
      }

      const provider = this.providers.get(providerId)!;

      try {
        defaultLogger.info(`[AI Orchestrator] Invoking provider '${providerId}'...`);
        const result = await provider.generate(messages, options);
        return result;
      } catch (err: any) {
        errors.push(err);
        const isRateLimit = err instanceof ProviderError && err.isRateLimit;
        const isAuthError = err instanceof ProviderError && err.isAuthError;

        if (isRateLimit || isAuthError) {
          this.placeProviderInCooldown(providerId, err.message);
        } else {
          defaultLogger.warn(`[AI Orchestrator] Provider '${providerId}' failed: ${err.message}. Retrying or falling back...`);
        }
      }
    }

    throw new ProviderUnavailableError(
      'Our conversational assistant is currently experiencing high volume. Please try again in a few moments or contact support directly.'
    );
  }

  /**
   * Streams completion over async generator with seamless pre-stream failover.
   */
  public async *generateStream(
    messages: ChatMessage[],
    customOptions?: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    if (this.aiDisabled) {
      throw new ProviderUnavailableError('AI conversational services are currently disabled by administrator policy.');
    }

    const options: ChatCompletionOptions = {
      timeoutMs: this.requestTimeoutMs,
      maxTokens: this.maxOutputTokens,
      ...customOptions,
    };

    const targetProviders = this.getAvailableProviders();

    for (const providerId of targetProviders) {
      if (this.isProviderInCooldown(providerId)) {
        defaultLogger.info(`[AI Orchestrator] Skipping stream on '${providerId}' (in cooldown).`);
        continue;
      }

      const provider = this.providers.get(providerId)!;
      let firstChunkReceived = false;

      try {
        defaultLogger.info(`[AI Orchestrator] Initiating stream with provider '${providerId}'...`);
        const stream = provider.generateStream(messages, options);

        for await (const chunk of stream) {
          firstChunkReceived = true;
          yield chunk;
        }

        // Successfully finished stream
        return;
      } catch (err: any) {
        const isRateLimit = err instanceof ProviderError && err.isRateLimit;
        const isAuthError = err instanceof ProviderError && err.isAuthError;

        if (isRateLimit || isAuthError) {
          this.placeProviderInCooldown(providerId, err.message);
        }

        // If failure happened after partial output was already yielded to the visitor,
        // we cannot invisibly swap the stream; yield honest termination
        if (firstChunkReceived) {
          defaultLogger.error(`[AI Orchestrator] Stream broke mid-transmission on '${providerId}': ${err.message}`);
          yield { text: '\n\n*[Connection interrupted. Please refresh or retry.]*', done: true };
          return;
        }

        defaultLogger.warn(`[AI Orchestrator] Stream failed before first chunk on '${providerId}': ${err.message}. Attempting fallback...`);
      }
    }

    throw new ProviderUnavailableError(
      'Our conversational assistant is currently experiencing high volume. Please try again in a few moments or contact support directly.'
    );
  }
}
