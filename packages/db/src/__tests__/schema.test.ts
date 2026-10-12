import { describe, it, expect } from 'vitest';
import {
  users,
  tenants,
  tenantMembers,
  sites,
  documents,
  documentChunks,
  conversations,
  messages,
  siteIntegrations,
  toolAuditLogs,
  pendingConfirmations,
  leads,
  supportRequests,
  products,
  siteConfigurationVersions,
  domainVerifications,
  analyticsEvents,
  adminAccessLogs,
} from '../schema/index.js';
import { getTableColumns } from 'drizzle-orm';

describe('Database Schema Definitions', () => {
  it('defines the users table with secure authentication columns', () => {
    const columns = getTableColumns(users);
    expect(columns.id).toBeDefined();
    expect(columns.email).toBeDefined();
    expect(columns.passwordHash).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.isSuperAdmin).toBeDefined();
  });

  it('defines the tenant_members table with RBAC role and foreign keys', () => {
    const columns = getTableColumns(tenantMembers);
    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.userId).toBeDefined();
    expect(columns.role).toBeDefined();
  });

  it('defines the tenants table with expected primary key and columns', () => {
    const columns = getTableColumns(tenants);
    expect(columns.id).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.plan).toBeDefined();
  });

  it('defines the sites table with tenant foreign key and security columns', () => {
    const columns = getTableColumns(sites);
    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.publicKey).toBeDefined();
    expect(columns.allowedOrigins).toBeDefined();
    expect(columns.branding).toBeDefined();
    expect(columns.draftConfiguration).toBeDefined();
    expect(columns.publishedConfiguration).toBeDefined();
    expect(columns.publishedVersion).toBeDefined();
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

  it('defines Phase 7 tool integration and audit tables with safety attributes', () => {
    const intCols = getTableColumns(siteIntegrations);
    expect(intCols.id).toBeDefined();
    expect(intCols.siteId).toBeDefined();
    expect(intCols.toolId).toBeDefined();
    expect(intCols.enabled).toBeDefined();
    expect(intCols.requiresConfirmation).toBeDefined();
    expect(intCols.config).toBeDefined();

    const logCols = getTableColumns(toolAuditLogs);
    expect(logCols.id).toBeDefined();
    expect(logCols.siteId).toBeDefined();
    expect(logCols.toolName).toBeDefined();
    expect(logCols.status).toBeDefined();
    expect(logCols.inputPayload).toBeDefined();
    expect(logCols.outputPayload).toBeDefined();
    expect(logCols.executionTimeMs).toBeDefined();

    const confCols = getTableColumns(pendingConfirmations);
    expect(confCols.id).toBeDefined();
    expect(confCols.siteId).toBeDefined();
    expect(confCols.visitorId).toBeDefined();
    expect(confCols.toolName).toBeDefined();
    expect(confCols.payload).toBeDefined();
    expect(confCols.status).toBeDefined();
    expect(confCols.expiresAt).toBeDefined();

    const leadCols = getTableColumns(leads);
    expect(leadCols.id).toBeDefined();
    expect(leadCols.siteId).toBeDefined();
    expect(leadCols.name).toBeDefined();
    expect(leadCols.email).toBeDefined();
    expect(leadCols.consentGiven).toBeDefined();
    expect(leadCols.consentTimestamp).toBeDefined();

    const ticketCols = getTableColumns(supportRequests);
    expect(ticketCols.id).toBeDefined();
    expect(ticketCols.siteId).toBeDefined();
    expect(ticketCols.ticketNumber).toBeDefined();
    expect(ticketCols.priority).toBeDefined();

    const prodCols = getTableColumns(products);
    expect(prodCols.id).toBeDefined();
    expect(prodCols.siteId).toBeDefined();
    expect(prodCols.sku).toBeDefined();
    expect(prodCols.price).toBeDefined();
    expect(prodCols.inStock).toBeDefined();
  });

  it('defines Phase 8 configuration studio versioning and domain verification tables', () => {
    const verCols = getTableColumns(siteConfigurationVersions);
    expect(verCols.id).toBeDefined();
    expect(verCols.siteId).toBeDefined();
    expect(verCols.version).toBeDefined();
    expect(verCols.configuration).toBeDefined();
    expect(verCols.isPublished).toBeDefined();
    expect(verCols.changeSummary).toBeDefined();
    expect(verCols.createdBy).toBeDefined();

    const domCols = getTableColumns(domainVerifications);
    expect(domCols.id).toBeDefined();
    expect(domCols.siteId).toBeDefined();
    expect(domCols.domain).toBeDefined();
    expect(domCols.verificationToken).toBeDefined();
    expect(domCols.verificationMethod).toBeDefined();
    expect(domCols.status).toBeDefined();
  });

  it('defines Phase 9 observability, analytics_events, and admin_access_logs tables', () => {
    const convCols = getTableColumns(conversations);
    expect(convCols.hasHandoff).toBeDefined();
    expect(convCols.isLowConfidence).toBeDefined();
    expect(convCols.feedback).toBeDefined();

    const msgCols = getTableColumns(messages);
    expect(msgCols.latencyMs).toBeDefined();
    expect(msgCols.tokenCountEstimate).toBeDefined();
    expect(msgCols.isUnanswered).toBeDefined();
    expect(msgCols.feedback).toBeDefined();

    const eventCols = getTableColumns(analyticsEvents);
    expect(eventCols.id).toBeDefined();
    expect(eventCols.siteId).toBeDefined();
    expect(eventCols.eventType).toBeDefined();
    expect(eventCols.durationMs).toBeDefined();
    expect(eventCols.metadata).toBeDefined();
    expect(eventCols.createdAt).toBeDefined();

    const auditCols = getTableColumns(adminAccessLogs);
    expect(auditCols.id).toBeDefined();
    expect(auditCols.siteId).toBeDefined();
    expect(auditCols.userId).toBeDefined();
    expect(auditCols.action).toBeDefined();
    expect(auditCols.details).toBeDefined();
    expect(auditCols.createdAt).toBeDefined();
  });
});
