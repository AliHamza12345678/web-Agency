import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, index, uniqueIndex, customType } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Custom vector type for pgvector extension
 */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== 'string') return [];
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number);
  },
});

// ============================================================================
// Users Table (Authentication & Identity)
// ============================================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
  ]
);

// ============================================================================
// Tenants Table (Organizations / Workspaces)
// ============================================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// Tenant Members Table (Roles & RBAC Membership)
// ============================================================================
export const tenantMembers = pgTable(
  'tenant_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'member'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tenant_members_tenant_id_idx').on(table.tenantId),
    index('tenant_members_user_id_idx').on(table.userId),
    uniqueIndex('tenant_members_tenant_user_unique').on(table.tenantId, table.userId),
  ]
);

// ============================================================================
// Sites Table (Websites / Bots under a Tenant)
// ============================================================================
export const sites = pgTable(
  'sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull().unique(),
    name: text('name').notNull(),
    allowedOrigins: text('allowed_origins')
      .array()
      .notNull()
      .default([]),
    systemPrompt: text('system_prompt'),
    branding: jsonb('branding').notNull().default({}),
    draftConfiguration: jsonb('draft_configuration').notNull().default({}),
    publishedConfiguration: jsonb('published_configuration').notNull().default({}),
    publishedVersion: integer('published_version').notNull().default(1),
    retentionDays: integer('retention_days').notNull().default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sites_tenant_id_idx').on(table.tenantId),
    index('sites_public_key_idx').on(table.publicKey),
  ]
);

// ============================================================================
// Documents Table
// ============================================================================
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceUrl: text('source_url'),
    content: text('content').notNull(),
    type: text('type').notNull().default('url'), // 'url' | 'sitemap' | 'faq' | 'file' | 'policy'
    status: text('status').notNull().default('ready'), // 'pending' | 'processing' | 'ready' | 'failed'
    errorMessage: text('error_message'),
    contentHash: text('content_hash'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('documents_site_id_idx').on(table.siteId),
    index('documents_content_hash_idx').on(table.contentHash),
  ]
);

// ============================================================================
// Document Chunks Table (with Vector Embeddings)
// ============================================================================
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('document_chunks_site_id_idx').on(table.siteId),
    index('document_chunks_document_id_idx').on(table.documentId),
  ]
);

// ============================================================================
// Conversations Table
// ============================================================================
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    hasHandoff: boolean('has_handoff').notNull().default(false),
    isLowConfidence: boolean('is_low_confidence').notNull().default(false),
    feedback: text('feedback'), // 'positive' | 'negative'
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('conversations_site_id_idx').on(table.siteId),
    index('conversations_visitor_id_idx').on(table.visitorId),
    index('conversations_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// Messages Table
// ============================================================================
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'visitor' | 'assistant' | 'system'
    content: text('content').notNull(),
    citations: jsonb('citations'),
    latencyMs: integer('latency_ms'),
    tokenCountEstimate: integer('token_count_estimate'),
    isUnanswered: boolean('is_unanswered').notNull().default(false),
    feedback: text('feedback'), // 'positive' | 'negative'
    feedbackComment: text('feedback_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_site_id_idx').on(table.siteId),
    index('messages_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// Phase 7: Business Integrations & Safe Tool-Calling Tables
// ============================================================================

export const siteIntegrations = pgTable(
  'site_integrations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    toolId: text('tool_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    requiresConfirmation: boolean('requires_confirmation').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('site_integrations_site_id_idx').on(table.siteId),
    uniqueIndex('site_integrations_site_tool_unique').on(table.siteId, table.toolId),
  ]
);

export const toolAuditLogs = pgTable(
  'tool_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id'),
    toolName: text('tool_name').notNull(),
    status: text('status').notNull(), // 'authorized' | 'unauthorized' | 'success' | 'failure' | 'rejected_missing_consent' | 'timeout' | 'pending_confirmation'
    inputPayload: jsonb('input_payload').notNull().default({}),
    outputPayload: jsonb('output_payload').notNull().default({}),
    errorMessage: text('error_message'),
    executionTimeMs: integer('execution_time_ms').notNull().default(0),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tool_audit_logs_site_id_idx').on(table.siteId),
    index('tool_audit_logs_tool_name_idx').on(table.toolName),
    index('tool_audit_logs_created_at_idx').on(table.createdAt),
  ]
);

export const pendingConfirmations = pgTable(
  'pending_confirmations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    toolName: text('tool_name').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'), // 'pending' | 'confirmed' | 'cancelled' | 'expired'
    idempotencyKey: text('idempotency_key'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('pending_confirmations_site_id_idx').on(table.siteId),
    index('pending_confirmations_visitor_idx').on(table.visitorId),
  ]
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    interest: text('interest'),
    consentGiven: boolean('consent_given').notNull().default(false),
    consentTimestamp: timestamp('consent_timestamp', { withTimezone: true }).defaultNow().notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('leads_site_id_idx').on(table.siteId),
    index('leads_email_idx').on(table.email),
  ]
);

export const supportRequests = pgTable(
  'support_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    ticketNumber: text('ticket_number').notNull().unique(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    priority: text('priority').notNull().default('normal'),
    status: text('status').notNull().default('open'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('support_requests_site_id_idx').on(table.siteId),
    index('support_requests_ticket_idx').on(table.ticketNumber),
  ]
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: integer('price').notNull(), // in cents
    currency: text('currency').notNull().default('USD'),
    inStock: boolean('in_stock').notNull().default(true),
    category: text('category'),
    url: text('url'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('products_site_id_idx').on(table.siteId),
    index('products_sku_idx').on(table.sku),
  ]
);

// ============================================================================
// Phase 8: No-Code Chatbot Configuration Studio & Domain Verification Tables
// ============================================================================

export const siteConfigurationVersions = pgTable(
  'site_configuration_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    configuration: jsonb('configuration').notNull().default({}),
    isPublished: boolean('is_published').notNull().default(false),
    changeSummary: text('change_summary'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('site_config_versions_site_id_idx').on(table.siteId),
    uniqueIndex('site_config_versions_site_version_idx').on(table.siteId, table.version),
  ]
);

export const domainVerifications = pgTable(
  'domain_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    verificationToken: text('verification_token').notNull(),
    verificationMethod: text('verification_method').notNull().default('dns_txt'), // 'dns_txt' | 'meta_tag' | 'well_known'
    status: text('status').notNull().default('pending'), // 'pending' | 'verified' | 'failed'
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('domain_verifications_site_id_idx').on(table.siteId),
    index('domain_verifications_status_idx').on(table.status),
  ]
);

// ============================================================================
// Phase 9: Observability, Real-Time Analytics & Audit Access Logs
// ============================================================================

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(), // 'conversation_started' | 'message_received' | 'message_answered' | 'retrieval_success' | 'retrieval_empty' | 'low_confidence_question' | 'provider_error' | 'provider_rate_limit' | 'human_handoff_requested' | 'visitor_feedback'
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('analytics_events_site_id_idx').on(table.siteId),
    index('analytics_events_site_type_idx').on(table.siteId, table.eventType),
    index('analytics_events_created_at_idx').on(table.createdAt),
  ]
);

export const adminAccessLogs = pgTable(
  'admin_access_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    action: text('action').notNull(), // 'view_conversations' | 'export_conversations' | 'delete_conversation' | 'retention_purge'
    details: jsonb('details').notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('admin_access_logs_site_id_idx').on(table.siteId),
    index('admin_access_logs_action_idx').on(table.action),
    index('admin_access_logs_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// Relational Definitions
// ============================================================================
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(tenantMembers),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  members: many(tenantMembers),
  sites: many(sites),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantMembers.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [tenantMembers.userId],
    references: [users.id],
  }),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [sites.tenantId],
    references: [tenants.id],
  }),
  documents: many(documents),
  documentChunks: many(documentChunks),
  conversations: many(conversations),
  integrations: many(siteIntegrations),
  auditLogs: many(toolAuditLogs),
  leads: many(leads),
  supportRequests: many(supportRequests),
  products: many(products),
  configurationVersions: many(siteConfigurationVersions),
  domainVerifications: many(domainVerifications),
  analyticsEvents: many(analyticsEvents),
  adminAccessLogs: many(adminAccessLogs),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  site: one(sites, {
    fields: [analyticsEvents.siteId],
    references: [sites.id],
  }),
  conversation: one(conversations, {
    fields: [analyticsEvents.conversationId],
    references: [conversations.id],
  }),
}));

export const adminAccessLogsRelations = relations(adminAccessLogs, ({ one }) => ({
  site: one(sites, {
    fields: [adminAccessLogs.siteId],
    references: [sites.id],
  }),
}));

export const siteConfigurationVersionsRelations = relations(siteConfigurationVersions, ({ one }) => ({
  site: one(sites, {
    fields: [siteConfigurationVersions.siteId],
    references: [sites.id],
  }),
}));

export const domainVerificationsRelations = relations(domainVerifications, ({ one }) => ({
  site: one(sites, {
    fields: [domainVerifications.siteId],
    references: [sites.id],
  }),
}));

export const siteIntegrationsRelations = relations(siteIntegrations, ({ one }) => ({
  site: one(sites, {
    fields: [siteIntegrations.siteId],
    references: [sites.id],
  }),
}));

export const toolAuditLogsRelations = relations(toolAuditLogs, ({ one }) => ({
  site: one(sites, {
    fields: [toolAuditLogs.siteId],
    references: [sites.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  site: one(sites, {
    fields: [documents.siteId],
    references: [sites.id],
  }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
  site: one(sites, {
    fields: [documentChunks.siteId],
    references: [sites.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  site: one(sites, {
    fields: [conversations.siteId],
    references: [sites.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  site: one(sites, {
    fields: [messages.siteId],
    references: [sites.id],
  }),
}));
