import { pgTable, uuid, text, timestamp, integer, jsonb, index, customType } from 'drizzle-orm/pg-core';
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
// Tenants Table
// ============================================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// Sites Table
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('documents_site_id_idx').on(table.siteId),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('conversations_site_id_idx').on(table.siteId),
    index('conversations_visitor_id_idx').on(table.visitorId),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_site_id_idx').on(table.siteId),
  ]
);

// ============================================================================
// Relational Definitions
// ============================================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  sites: many(sites),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [sites.tenantId],
    references: [tenants.id],
  }),
  documents: many(documents),
  documentChunks: many(documentChunks),
  conversations: many(conversations),
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
