import {
  type LLMProvider,
  type EmbeddingProvider,
  type ChatMessage,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type StreamChunk,
  type ModelCapabilities,
  type ProviderHealth,
  type EmbeddingResult,
  ProviderError,
} from '../types.js';

export interface CloudflareWorkersAIConfig {
  accountId: string;
  apiToken: string;
  defaultModel?: string;
  embeddingModel?: string;
}

export class CloudflareWorkersAIProvider implements LLMProvider, EmbeddingProvider {
  public readonly providerId = 'cloudflare';
  public readonly defaultModel: string;
  private accountId: string;
  private apiToken: string;
  private embeddingModel: string;

  constructor(config: CloudflareWorkersAIConfig) {
    this.accountId = config.accountId;
    this.apiToken = config.apiToken;
    this.defaultModel = config.defaultModel || '@cf/meta/llama-3.1-8b-instruct';
    this.embeddingModel = config.embeddingModel || '@cf/baai/bge-base-en-v1.5';
  }

  public getCapabilities(model = this.defaultModel): ModelCapabilities {
    return {
      provider: this.providerId,
      model,
      supportsStreaming: true,
      supportsEmbeddings: true,
      maxContextTokens: 8192,
      isFreeTier: true, // 10,000 Neurons/day free
    };
  }

  public async checkHealth(_model = this.defaultModel): Promise<ProviderHealth> {
    if (!this.accountId || !this.apiToken) {
      return {
        provider: this.providerId,
        healthy: false,
        lastChecked: new Date().toISOString(),
        error: 'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN',
        inCooldown: false,
      };
    }

    try {
      // Lightweight single token probe
      await this.generate([{ role: 'user', content: 'ping' }], { maxTokens: 2, timeoutMs: 5000 });
      return {
        provider: this.providerId,
        healthy: true,
        lastChecked: new Date().toISOString(),
        inCooldown: false,
      };
    } catch (err: any) {
      return {
        provider: this.providerId,
        healthy: false,
        lastChecked: new Date().toISOString(),
        error: err.message,
        inCooldown: false,
      };
    }
  }

  public async generate(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const model = this.defaultModel;
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          max_tokens: options?.maxTokens || 1024,
          temperature: options?.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new ProviderError(this.providerId, `HTTP ${response.status}: ${errorText}`, response.status);
      }

      const json: any = await response.json();
      const text = json?.result?.response || '';

      return {
        text,
        model,
        provider: this.providerId,
        usage: {
          totalTokens: json?.result?.usage?.total_tokens,
        },
      };
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.providerId, err.message || 'Request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  public async *generateStream(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    const model = this.defaultModel;
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          stream: true,
          max_tokens: options?.maxTokens || 1024,
          temperature: options?.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      throw new ProviderError(this.providerId, err.message || 'Stream connection failed');
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorText = await response.text().catch(() => '');
      throw new ProviderError(this.providerId, `HTTP ${response.status}: ${errorText}`, response.status);
    }

    if (!response.body) {
      clearTimeout(timeout);
      throw new ProviderError(this.providerId, 'No stream body returned by Cloudflare Workers AI');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') {
              yield { text: '', done: true };
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.response) {
                yield { text: parsed.response, done: false };
              }
            } catch {
              // Ignore malformed partial chunks
            }
          }
        }
      }

      yield { text: '', done: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Embedding Provider implementation
  public async embedText(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    const first = results[0];
    if (!first) throw new ProviderError(this.providerId, 'Failed to generate embedding');
    return first;
  }

  public async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.embeddingModel}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: texts }),
    });

    if (!response.ok) {
      throw new ProviderError(this.providerId, `Embedding HTTP ${response.status}`, response.status);
    }

    const json: any = await response.json();
    const data = json?.result?.data;

    if (!Array.isArray(data) || data.length === 0) {
      throw new ProviderError(this.providerId, 'Malformed embedding response from Cloudflare');
    }

    return data.map((vec: number[]) => ({
      embedding: vec,
      dimensions: vec.length,
    }));
  }
}
