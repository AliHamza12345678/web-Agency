export type DetectedLanguage =
  | 'en'
  | 'ur'
  | 'roman-ur'
  | 'hi'
  | 'hinglish'
  | 'ar'
  | 'es'
  | 'fr'
  | 'other';

export type DetectedScript =
  | 'latin'
  | 'arabic'
  | 'devanagari'
  | 'cyrillic'
  | 'cjk'
  | 'other';

export interface LanguageDetectionResult {
  language: DetectedLanguage;
  script: DetectedScript;
  confidence: number;
  isCodeSwitching: boolean;
  codeSwitchLanguages: DetectedLanguage[];
  explicitSwitchRequested: boolean;
  requestedLanguage?: DetectedLanguage;
  requestedScript?: DetectedScript;
  explanation: string;
}

export interface ConversationTurn {
  role: 'visitor' | 'assistant' | 'system' | 'user';
  content: string;
  language?: DetectedLanguage;
  script?: DetectedScript;
  timestamp?: string;
}

export interface ConversationSummary {
  keyPreferences: string[];
  verifiedFacts: string[];
  unresolvedQuestions: string[];
  currentTopic?: string;
}

export interface BoundedHistoryResult {
  recentTurns: ConversationTurn[];
  summary?: ConversationSummary;
  omittedTurnCount: number;
}

import type { AssistantProfile } from '@openagent/core';

export interface SitePersonaConfig {
  siteName: string;
  botName?: string;
  systemPrompt?: string;
  approvedKnowledge?: string;
  supportContact?: string;
  toolsPrompt?: string;
  profile?: AssistantProfile;
}

export interface MultilingualPromptOptions {
  sitePersona: SitePersonaConfig;
  detectedLang: LanguageDetectionResult;
  historySummary?: ConversationSummary;
  recentTurns: ConversationTurn[];
  userQuery: string;
}

export interface EngineGenerateOptions {
  maxHistoryTurns?: number;
  maxTokens?: number;
  temperature?: number;
}
