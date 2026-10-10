import { describe, it, expect } from 'vitest';
import {
  tenants,
  sites,
  documents,
  documentChunks,
  conversations,
  messages,
} from '../schema/index.js';
import { getTableColumns } from 'drizzle-orm';

describe('Database Schema Definitions', () => {
  it('defines the tenants table with expected primary key and columns', () => {
    const columns = getTableColumns(tenants);
    expect(columns.id).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.email).toBeDefined();
    expect(columns.plan).toBeDefined();
  });

  it('defines the sites table with tenant foreign key and security columns', () => {
    const columns = getTableColumns(sites);
    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.publicKey).toBeDefined();
    expect(columns.allowedOrigins).toBeDefined();
    expect(columns.branding).toBeDefined();
  });

  it('defines the documents table with site foreign key', () => {
    const columns = getTableColumns(documents);
    expect(columns.id).toBeDefined();
    expect(columns.siteId).toBeDefined();
    expect(columns.title).toBeDefined();
    expect(columns.content).toBeDefined();
  });

  it('defines document_chunks table with site scoping and vector embedding', () => {
    const columns = getTableColumns(documentChunks);
    expect(columns.id).toBeDefined();
    expect(columns.siteId).toBeDefined();
    expect(columns.documentId).toBeDefined();
    expect(columns.content).toBeDefined();
    expect(columns.embedding).toBeDefined();
  });

  it('defines conversations and messages tables with site scoping', () => {
    const convCols = getTableColumns(conversations);
    expect(convCols.siteId).toBeDefined();
    expect(convCols.visitorId).toBeDefined();

    const msgCols = getTableColumns(messages);
    expect(msgCols.siteId).toBeDefined();
    expect(msgCols.conversationId).toBeDefined();
    expect(msgCols.role).toBeDefined();
    expect(msgCols.content).toBeDefined();
  });
});
