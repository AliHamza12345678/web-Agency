import { z } from 'zod';

// ============================================================================
// API Response Contracts
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Health Check Contracts
// ============================================================================

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'healthy' | 'unhealthy';
  };
}

// ============================================================================
// Phase 8: No-Code Studio Configuration Schemas & Types
// ============================================================================

export const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const siteStudioAssistantSchema = z.object({
  name: z.string().min(1).max(50).default('AI Assistant'),
  avatarType: z.enum(['preset', 'emoji', 'url']).default('preset'),
  avatar: z.string().max(255).default('🤖'),
});

export const siteStudioThemeSchema = z.object({
  primaryColor: z.string().regex(hexColorRegex, 'Invalid hex color').default('#4f46e5'),
  accentColor: z.string().regex(hexColorRegex, 'Invalid hex color').default('#818cf8'),
  backgroundColor: z.string().regex(hexColorRegex, 'Invalid hex color').default('#ffffff'),
  textColor: z.string().regex(hexColorRegex, 'Invalid hex color').default('#1f2937'),
  headerTextColor: z.string().regex(hexColorRegex, 'Invalid hex color').default('#ffffff'),
  typography: z.enum(['system', 'inter', 'roboto', 'outfit', 'serif']).default('inter'),
  launcherPosition: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
  panelWidth: z.number().int().min(320).max(600).default(380),
  panelHeight: z.number().int().min(400).max(900).default(600),
  borderRadius: z.number().int().min(0).max(32).default(16),
});

export const siteStudioMessagingSchema = z.object({
  welcomeMessage: z.string().min(1).max(1000).default('Hello! How can I help you today?'),
  suggestedQuestions: z.array(z.string().max(150)).max(6).default([
    'What services do you offer?',
    'How can I contact support?',
  ]),
  placeholder: z.string().min(1).max(100).default('Ask anything...'),
});

export const siteStudioLocalizationSchema = z.object({
  defaultLanguage: z.string().min(2).max(10).default('en'),
  supportedLanguages: z.array(z.string().min(2).max(10)).default(['en']),
  autoDetect: z.boolean().default(true),
});

export const siteStudioBehaviorSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'casual', 'concise', 'technical']).default('friendly'),
  responseLength: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  customInstructions: z.string().max(2000).default(''),
});

export const siteStudioKnowledgeSchema = z.object({
  scope: z.enum(['all', 'verified_only', 'strict']).default('all'),
  allowedSources: z.array(z.enum(['url', 'sitemap', 'faq', 'file', 'policy'])).default(['url', 'faq', 'policy']),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
});

export const siteStudioToolsSchema = z.object({
  allowedTools: z.array(z.string()).default([
    'search_website',
    'get_business_info',
    'search_faqs',
    'create_support_request',
    'capture_lead',
  ]),
  requireConfirmationTools: z.array(z.string()).default([
    'create_support_request',
    'capture_lead',
  ]),
});

export const siteStudioSupportSchema = z.object({
  email: z.string().email().optional().or(z.literal('')).default(''),
  phone: z.string().max(30).optional().default(''),
  hours: z.string().max(100).optional().default('Mon-Fri 9:00 AM - 5:00 PM EST'),
  escalationUrl: z.string().url().optional().or(z.literal('')).default(''),
});

export const siteStudioAvailabilitySchema = z.object({
  enabled: z.boolean().default(true),
  scheduleEnabled: z.boolean().default(false),
  timezone: z.string().default('UTC'),
  activeDays: z.array(z.string()).default(['mon', 'tue', 'wed', 'thu', 'fri']),
  activeHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM format').default('09:00'),
  activeHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM format').default('17:00'),
  outsideHoursMessage: z.string().max(500).default('We are currently outside our operating hours. Please leave a message or contact support.'),
  hideWhenOffline: z.boolean().default(false),
});

export const siteStudioRetentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).default(30),
  allowVisitorExport: z.boolean().default(true),
  enablePiiRedaction: z.boolean().default(true),
});

export const siteStudioThrottlingSchema = z.object({
  rateLimitPerMinute: z.number().int().min(5).max(120).default(20),
  maxMessagesPerSession: z.number().int().min(5).max(200).default(50),
});

export const siteStudioAnalyticsSchema = z.object({
  collectFeedback: z.boolean().default(true),
  trackAnalytics: z.boolean().default(true),
  readReceipts: z.boolean().default(false),
});

// ============================================================================
// Bonus: Per-Website Conversational Personality & Knowledge Profile Schemas
// ============================================================================

export const assistantPersonalitySchema = z.object({
  formality: z.enum(['formal', 'neutral', 'casual']).default('neutral'),
  warmth: z.enum(['high', 'balanced', 'reserved']).default('balanced'),
  verbosity: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  responseStyle: z.enum(['conversational', 'bulleted', 'step_by_step', 'direct']).default('conversational'),
});

export const assistantTopicScopeSchema = z.object({
  allowedTopics: z.array(z.string().max(100)).default([]),
  outOfScopeTopics: z.array(z.string().max(100)).default([]),
  outOfScopeMessage: z.string().max(500).default(
    "I'm specifically focused on helping with our website services and products. For other topics, please contact our team directly."
  ),
});

export const assistantEscalationProcedureSchema = z.object({
  enabled: z.boolean().default(true),
  triggerConditions: z.array(z.string().max(150)).default([
    'Visitor explicitly asks for a human manager or support representative',
    'Complex disputes, refunds, or technical breakdowns',
    'Repeated questions unresolved after 2 attempts',
  ]),
  procedureText: z.string().max(1000).default(
    'Politely offer human support contact options and invite the visitor to leave their contact details.'
  ),
});

export const verifiedBusinessFactSchema = z.object({
  label: z.string().min(1).max(100),
  fact: z.string().min(1).max(500),
});

export const verifiedPolicySchema = z.object({
  name: z.string().min(1).max(100),
  rule: z.string().min(1).max(1000),
});

export const assistantProfileSchema = z.object({
  businessName: z.string().max(100).default(''),
  businessDescription: z.string().max(2000).default(''),
  knowledgeSources: z.array(z.enum(['url', 'sitemap', 'faq', 'file', 'policy', 'catalog', 'manual'])).default(['url', 'faq', 'policy']),
  personality: assistantPersonalitySchema.default({}),
  topicScope: assistantTopicScopeSchema.default({}),
  escalationProcedure: assistantEscalationProcedureSchema.default({}),
  verifiedFacts: z.array(verifiedBusinessFactSchema).default([]),
  verifiedPolicies: z.array(verifiedPolicySchema).default([]),
  preferredLanguages: z.array(z.string().min(2).max(10)).default(['en']),
  scriptPreference: z.enum(['auto', 'latin', 'nastaliq']).default('auto'),
  allowCodeSwitching: z.boolean().default(true),
});

export type AssistantPersonality = z.infer<typeof assistantPersonalitySchema>;
export type AssistantTopicScope = z.infer<typeof assistantTopicScopeSchema>;
export type AssistantEscalationProcedure = z.infer<typeof assistantEscalationProcedureSchema>;
export type VerifiedBusinessFact = z.infer<typeof verifiedBusinessFactSchema>;
export type VerifiedPolicy = z.infer<typeof verifiedPolicySchema>;
export type AssistantProfile = z.infer<typeof assistantProfileSchema>;

export const siteStudioConfigSchema = z.object({
  assistant: siteStudioAssistantSchema.default({}),
  theme: siteStudioThemeSchema.default({}),
  messaging: siteStudioMessagingSchema.default({}),
  localization: siteStudioLocalizationSchema.default({}),
  behavior: siteStudioBehaviorSchema.default({}),
  knowledge: siteStudioKnowledgeSchema.default({}),
  tools: siteStudioToolsSchema.default({}),
  support: siteStudioSupportSchema.default({}),
  availability: siteStudioAvailabilitySchema.default({}),
  retention: siteStudioRetentionSchema.default({}),
  throttling: siteStudioThrottlingSchema.default({}),
  analytics: siteStudioAnalyticsSchema.default({}),
  profile: assistantProfileSchema.default({}),
});

export type SiteStudioConfig = z.infer<typeof siteStudioConfigSchema>;

export const DEFAULT_STUDIO_CONFIG: SiteStudioConfig = siteStudioConfigSchema.parse({});

// Backward-compatible branding schema
export const siteBrandingSchema = z.object({
  botName: z.string().min(1).max(50).default('AI Assistant'),
  primaryColor: z.string().regex(hexColorRegex, 'Must be a valid hex color').default('#4f46e5'),
  textColor: z.string().regex(hexColorRegex, 'Must be a valid hex color').default('#ffffff'),
  logoUrl: z.string().url().optional(),
  welcomeMessage: z.string().min(1).max(500).default('Hello! How can I help you today?'),
  placeholder: z.string().min(1).max(100).default('Ask anything...'),
  position: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
});

export type SiteBranding = z.infer<typeof siteBrandingSchema>;

export const publicSiteConfigSchema = z.object({
  siteId: z.string().uuid(),
  publicKey: z.string(),
  name: z.string(),
  branding: siteBrandingSchema,
  publishedVersion: z.number().int().default(1),
  studioConfig: siteStudioConfigSchema.optional(),
});

export type PublicSiteConfig = z.infer<typeof publicSiteConfigSchema>;

// Domain Verification Schema
export const domainVerificationRequestSchema = z.object({
  domain: z.string().min(3).max(253),
  verificationMethod: z.enum(['dns_txt', 'meta_tag', 'well_known']).default('dns_txt'),
});

export type DomainVerificationRequest = z.infer<typeof domainVerificationRequestSchema>;

export interface DomainVerificationRecord {
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

export interface ConfigurationVersionRecord {
  id: string;
  siteId: string;
  version: number;
  configuration: SiteStudioConfig;
  isPublished: boolean;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface EmbedSnippetResponse {
  siteId: string;
  publicKey: string;
  scriptSnippet: string;
  webComponentSnippet: string;
  explanation: {
    publicKeyDescription: string;
    serverSecretsDescription: string;
  };
}

// ============================================================================
// Phase 9: Observability, Metrics & Conversation Management Types
// ============================================================================

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

