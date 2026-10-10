export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  text: string;
  usage?: TokenUsage;
  model: string;
  provider: string;
}

export interface StreamChunk {
  text: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface ModelCapabilities {
  provider: string;
  model: string;
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  maxContextTokens: number;
  isFreeTier: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  usage?: { promptTokens?: number };
}

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastChecked: string;
  error?: string;
  inCooldown: boolean;
  cooldownUntil?: string;
}

export interface LLMProvider {
  readonly providerId: string;
  readonly defaultModel: string;

  getCapabilities(model?: string): ModelCapabilities;
  checkHealth(model?: string): Promise<ProviderHealth>;
  generate(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatCompletionResult>;
  generateStream(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): AsyncIterable<StreamChunk>;
}

export interface EmbeddingProvider {
  readonly providerId: string;
  embedText(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

export class ProviderError extends Error {
  public readonly provider: string;
  public readonly statusCode?: number;
  public readonly isRateLimit: boolean;
  public readonly isAuthError: boolean;

  constructor(provider: string, message: string, statusCode?: number) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.isRateLimit = statusCode === 429;
    this.isAuthError = statusCode === 401 || statusCode === 403;
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message = 'All configured AI inference providers are temporarily unavailable or in rate-limit cooldown.') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}
