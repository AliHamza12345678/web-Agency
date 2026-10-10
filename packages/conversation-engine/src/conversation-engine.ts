import {
  type AIOrchestrator,
  type ChatMessage,
  type StreamChunk,
  type ChatCompletionResult,
} from '@openagent/ai-provider';
import { detectLanguageAndScript } from './language-detector.js';
import { ContextManager } from './context-manager.js';
import { MultilingualPromptBuilder } from './prompt-builder.js';
import type {
  ConversationTurn,
  SitePersonaConfig,
  LanguageDetectionResult,
  EngineGenerateOptions,
} from './types.js';

export interface ProcessedResponse {
  text: string;
  languageInfo: LanguageDetectionResult;
  model?: string;
  provider?: string;
  usage?: any;
}

export class ConversationEngine {
  private orchestrator: AIOrchestrator;
  private contextManager: ContextManager;
  private promptBuilder: MultilingualPromptBuilder;

  constructor(orchestrator: AIOrchestrator, maxRecentTurns = 6) {
    this.orchestrator = orchestrator;
    this.contextManager = new ContextManager(maxRecentTurns);
    this.promptBuilder = new MultilingualPromptBuilder();
  }

  /**
   * Prepares the full list of ChatMessages (system + bounded history + user turn).
   */
  public prepareMessages(
    userQuery: string,
    history: ConversationTurn[],
    sitePersona: SitePersonaConfig
  ): { messages: ChatMessage[]; languageInfo: LanguageDetectionResult } {
    // 1. Detect language, script, and code-switching
    const languageInfo = detectLanguageAndScript(userQuery);

    // 2. Bound and summarize dialogue history
    const { recentTurns, summary } = this.contextManager.processHistory(history);

    // 3. Compile system prompt
    const systemInstruction = this.promptBuilder.buildSystemPrompt({
      sitePersona,
      detectedLang: languageInfo,
      historySummary: summary,
      recentTurns,
      userQuery,
    });

    // 4. Assemble messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: systemInstruction },
      ...recentTurns.map((t) => ({
        role: (t.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: t.content,
      })),
      { role: 'user', content: userQuery.trim() },
    ];

    return { messages, languageInfo };
  }

  /**
   * Generates a single complete response.
   */
  public async generate(
    userQuery: string,
    history: ConversationTurn[] = [],
    sitePersona: SitePersonaConfig,
    options?: EngineGenerateOptions
  ): Promise<ProcessedResponse> {
    const { messages, languageInfo } = this.prepareMessages(userQuery, history, sitePersona);

    const result: ChatCompletionResult = await this.orchestrator.generate(messages, {
      maxTokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.6,
    });

    return {
      text: result.text,
      languageInfo,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    };
  }

  /**
   * Streams response chunks via AsyncIterable with language metadata attached.
   */
  public async *generateStream(
    userQuery: string,
    history: ConversationTurn[] = [],
    sitePersona: SitePersonaConfig,
    options?: EngineGenerateOptions
  ): AsyncIterable<StreamChunk & { languageInfo: LanguageDetectionResult }> {
    const { messages, languageInfo } = this.prepareMessages(userQuery, history, sitePersona);

    const stream = this.orchestrator.generateStream(messages, {
      maxTokens: options?.maxTokens || 1024,
      temperature: options?.temperature ?? 0.6,
    });

    for await (const chunk of stream) {
      yield {
        ...chunk,
        languageInfo,
      };
    }
  }
}
