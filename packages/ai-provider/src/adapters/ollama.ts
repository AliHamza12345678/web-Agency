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

export interface OllamaConfig {
  baseUrl?: string;
  defaultModel?: string;
  embeddingModel?: string;
}

export class OllamaLocalProvider implements LLMProvider, EmbeddingProvider {
  public readonly providerId = 'ollama';
  public readonly defaultModel: string;
  private baseUrl: string;
  private embeddingModel: string;

  constructor(config?: OllamaConfig) {
    this.baseUrl = (config?.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.defaultModel = config?.defaultModel || 'llama3.2';
    this.embeddingModel = config?.embeddingModel || 'nomic-embed-text';
  }

  public getCapabilities(model = this.defaultModel): ModelCapabilities {
    return {
      provider: this.providerId,
      model,
      supportsStreaming: true,
      supportsEmbeddings: true,
      maxContextTokens: 8192,
      isFreeTier: true, // 100% Free / Local
    };
  }

  public async checkHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) {
        return {
          provider: this.providerId,
          healthy: false,
          lastChecked: new Date().toISOString(),
          error: `Ollama returned HTTP ${res.status}`,
          inCooldown: false,
        };
      }
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
        error: `Could not connect to Ollama at ${this.baseUrl}: ${err.message}`,
        inCooldown: false,
      };
    }
  }

  public async generate(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const model = this.defaultModel;
    const url = `${this.baseUrl}/api/chat`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens || 1024,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderError(this.providerId, `Ollama HTTP ${response.status}`, response.status);
      }

      const json: any = await response.json();
      return {
        text: json?.message?.content || '',
        model,
        provider: this.providerId,
        usage: {
          promptTokens: json?.prompt_eval_count,
          completionTokens: json?.eval_count,
          totalTokens: (json?.prompt_eval_count || 0) + (json?.eval_count || 0),
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
    const url = `${this.baseUrl}/api/chat`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens || 1024,
          },
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      throw new ProviderError(this.providerId, err.message || 'Stream connection failed');
    }

    if (!response.ok) {
      clearTimeout(timeout);
      throw new ProviderError(this.providerId, `Ollama HTTP ${response.status}`, response.status);
    }

    if (!response.body) {
      clearTimeout(timeout);
      throw new ProviderError(this.providerId, 'No stream body returned by Ollama');
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
          if (trimmed.length > 0) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.message?.content) {
                yield { text: parsed.message.content, done: !!parsed.done };
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      }

      yield { text: '', done: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async embedText(text: string): Promise<EmbeddingResult> {
    const url = `${this.baseUrl}/api/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new ProviderError(this.providerId, `Embedding HTTP ${response.status}`, response.status);
    }

    const json: any = await response.json();
    const vec: number[] = json?.embedding || [];

    return {
      embedding: vec,
      dimensions: vec.length,
    };
  }

  public async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      results.push(await this.embedText(text));
    }
    return results;
  }
}
