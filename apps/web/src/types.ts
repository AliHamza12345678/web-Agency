export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface TenantMembership {
  tenantId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  plan: string;
}

export interface SiteBranding {
  botName: string;
  primaryColor: string;
  textColor: string;
  welcomeMessage: string;
  placeholder?: string;
  logoUrl?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  systemPrompt?: string;
  branding: SiteBranding;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
  stats?: {
    docsCount: number;
    convsCount: number;
  };
}

export interface IntegrationStatus {
  toolId: string;
  name: string;
  description: string;
  category: 'content' | 'commerce' | 'support' | 'connector';
  isConsequential: boolean;
  requiresConsent: boolean;
  enabled: boolean;
  configured: boolean;
  status: 'active' | 'disabled' | 'needs_config';
  configSummary?: Record<string, any>;
}

export interface ToolAuditLog {
  id: string;
  siteId: string;
  toolName: string;
  status: string;
  inputPayload: Record<string, any>;
  outputPayload?: Record<string, any>;
  errorMessage?: string;
  executionTimeMs: number;
  ipAddress?: string;
  createdAt: string;
}

// Phase 8: Studio Configuration Interfaces
export interface SiteStudioConfig {
  assistant: {
    name: string;
    avatarType: 'preset' | 'emoji' | 'url';
    avatar: string;
  };
  theme: {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    headerTextColor: string;
    typography: 'system' | 'inter' | 'roboto' | 'outfit' | 'serif';
    launcherPosition: 'bottom-right' | 'bottom-left';
    panelWidth: number;
    panelHeight: number;
    borderRadius: number;
  };
  messaging: {
    welcomeMessage: string;
    suggestedQuestions: string[];
    placeholder: string;
  };
  localization: {
    defaultLanguage: string;
    supportedLanguages: string[];
    autoDetect: boolean;
  };
  behavior: {
    tone: 'professional' | 'friendly' | 'casual' | 'concise' | 'technical';
    responseLength: 'concise' | 'balanced' | 'detailed';
    customInstructions: string;
  };
  knowledge: {
    scope: 'all' | 'verified_only' | 'strict';
    allowedSources: ('url' | 'sitemap' | 'faq' | 'file' | 'policy')[];
    confidenceThreshold: number;
  };
  tools: {
    allowedTools: string[];
    requireConfirmationTools: string[];
  };
  support: {
    email?: string;
    phone?: string;
    hours?: string;
    escalationUrl?: string;
  };
  availability: {
    enabled: boolean;
    scheduleEnabled: boolean;
    timezone: string;
    activeDays: string[];
    activeHoursStart: string;
    activeHoursEnd: string;
    outsideHoursMessage: string;
    hideWhenOffline: boolean;
  };
  retention: {
    retentionDays: number;
    allowVisitorExport: boolean;
    enablePiiRedaction: boolean;
  };
  throttling: {
    rateLimitPerMinute: number;
    maxMessagesPerSession: number;
  };
  analytics: {
    collectFeedback: boolean;
    trackAnalytics: boolean;
    readReceipts: boolean;
  };
  profile?: AssistantProfile;
}

export interface AssistantProfile {
  businessName: string;
  businessDescription: string;
  knowledgeSources: Array<'url' | 'sitemap' | 'faq' | 'file' | 'policy' | 'catalog' | 'manual'>;
  personality: {
    formality: 'formal' | 'neutral' | 'casual';
    warmth: 'high' | 'balanced' | 'reserved';
    verbosity: 'concise' | 'balanced' | 'detailed';
    responseStyle: 'conversational' | 'bulleted' | 'step_by_step' | 'direct';
  };
  topicScope: {
    allowedTopics: string[];
    outOfScopeTopics: string[];
    outOfScopeMessage: string;
  };
  escalationProcedure: {
    enabled: boolean;
    triggerConditions: string[];
    procedureText: string;
  };
  verifiedFacts: Array<{ label: string; fact: string }>;
  verifiedPolicies: Array<{ name: string; rule: string }>;
  preferredLanguages: string[];
  scriptPreference: 'auto' | 'latin' | 'nastaliq';
  allowCodeSwitching: boolean;
}

export interface DomainVerification {
  id: string;
  siteId: string;
  domain: string;
  verificationToken: string;
  verificationMethod: 'dns_txt' | 'meta_tag' | 'well_known';
  status: 'pending' | 'verified' | 'failed';
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConfigurationVersion {
  id: string;
  siteId: string;
  version: number;
  configuration: SiteStudioConfig;
  isPublished: boolean;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface EmbedSnippetData {
  siteId: string;
  publicKey: string;
  scriptSnippet: string;
  webComponentSnippet: string;
  explanation: {
    publicKeyDescription: string;
    serverSecretsDescription: string;
  };
}

// Phase 9: Observability, Metrics & Conversation Management
export type MetricMeasurementType = 'measured' | 'estimated' | 'unavailable';

export interface AnalyticsDashboardMetrics {
  period: 'today' | '7d' | '30d' | 'all';
  timezone: string;
  conversationsStarted: number;
  messagesReceived: number;
  messagesAnswered: number;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  providerErrors: number;
  rateLimitEvents: number;
  retrievalSuccessCount: number;
  retrievalEmptyCount: number;
  retrievalSuccessRate: number | null;
  unansweredCount: number;
  lowConfidenceCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  satisfactionRate: number | null;
  humanHandoffRequests: number;
  approximateModelTokens: number | null;
  measurementLabels: {
    conversationsStarted: MetricMeasurementType;
    messagesReceived: MetricMeasurementType;
    messagesAnswered: MetricMeasurementType;
    responseLatency: MetricMeasurementType;
    providerErrors: MetricMeasurementType;
    rateLimitEvents: MetricMeasurementType;
    retrievalSuccessRate: MetricMeasurementType;
    unansweredQuestions: MetricMeasurementType;
    visitorFeedback: MetricMeasurementType;
    humanHandoffRequests: MetricMeasurementType;
    approximateModelTokens: MetricMeasurementType;
  };
}

export interface UnansweredQuestionRecord {
  id: string;
  conversationId: string | null;
  query: string;
  reason: 'no_knowledge_matches' | 'low_confidence' | 'explicit_refusal';
  confidenceScore?: number;
  createdAt: string;
  addedToKnowledge: boolean;
}

export interface ConversationSummary {
  id: string;
  siteId: string;
  visitorId: string;
  messageCount: number;
  hasHandoff: boolean;
  isLowConfidence: boolean;
  feedback: 'positive' | 'negative' | null;
  lastMessageSnippet: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetailMessage {
  id: string;
  role: 'visitor' | 'assistant' | 'system';
  content: string;
  citations?: any;
  latencyMs?: number | null;
  tokenCountEstimate?: number | null;
  isUnanswered?: boolean;
  feedback?: 'positive' | 'negative' | null;
  feedbackComment?: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  siteId: string;
  visitorId: string;
  hasHandoff: boolean;
  isLowConfidence: boolean;
  feedback: 'positive' | 'negative' | null;
  messages: ConversationDetailMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationQueryFilters {
  q?: string;
  feedback?: 'positive' | 'negative' | 'all';
  hasHandoff?: boolean;
  isLowConfidence?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RetentionCleanupResult {
  siteId: string;
  retentionDays: number;
  cutoffDate: string;
  purgedConversationsCount: number;
  purgedMessagesCount: number;
  purgedEventsCount: number;
  verifiedAt: string;
}

