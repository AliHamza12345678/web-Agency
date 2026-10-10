import {
  type LLMProvider,
  type ChatMessage,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type StreamChunk,
  type ModelCapabilities,
  type ProviderHealth,
  ProviderError,
} from '../types.js';

export interface OpenRouterConfig {
  apiKey: string;
  defaultModel?: string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterFreeProvider implements LLMProvider {
  public readonly providerId = 'openrouter';
  public readonly defaultModel: string;
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || 'meta-llama/llama-3.3-70b-instruct:free';
    this.siteUrl = config.siteUrl || 'https://openagent.chat';
    this.siteName = config.siteName || 'OpenAgent Chat';
  }

  public getCapabilities(model = this.defaultModel): ModelCapabilities {
    const isFree = model.endsWith(':free');
    return {
      provider: this.providerId,
      model,
      supportsStreaming: true,
      supportsEmbeddings: false,
      maxContextTokens: 32768,
      isFreeTier: isFree,
    };
  }

  public async checkHealth(_model = this.defaultModel): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.providerId,
        healthy: false,
        lastChecked: new Date().toISOString(),
        error: 'Missing OPENROUTER_API_KEY',
        inCooldown: false,
      };
    }

    try {
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
    const url = 'https://openrouter.ai/api/v1/chat/completions';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || 25000);
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
      const choice = json?.choices?.[0];
      const text = choice?.message?.content || '';

      return {
        text,
        model,
        provider: this.providerId,
        usage: {
          promptTokens: json?.usage?.prompt_tokens,
          completionTokens: json?.usage?.completion_tokens,
          totalTokens: json?.usage?.total_tokens,
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
    const url = 'https://openrouter.ai/api/v1/chat/completions';

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
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteName,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
      throw new ProviderError(this.providerId, 'No stream body returned by OpenRouter');
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
              const deltaContent = parsed.choices?.[0]?.delta?.content;
              if (deltaContent) {
                yield { text: deltaContent, done: false };
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      yield { text: '', done: true };
    } finally {
      clearTimeout(timeout);
    }
  }
}
