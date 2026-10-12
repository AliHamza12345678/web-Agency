import { sql } from 'drizzle-orm';
import { defaultLogger } from '@openagent/core';
import { sites, conversations, messages, analyticsEvents, adminAccessLogs } from './schema/index.js';

export interface BackupOptions {
  databaseUrl?: string;
  outputPath: string;
  format?: 'custom' | 'directory' | 'plain' | 'tar';
  compressLevel?: number;
  excludeTables?: string[];
  includeClean?: boolean;
}

export interface RestoreOptions {
  databaseUrl?: string;
  inputPath: string;
  clean?: boolean;
  ifExists?: boolean;
  noOwner?: boolean;
  noPrivileges?: boolean;
  singleTransaction?: boolean;
}

export interface RetentionPurgeSummary {
  sitesProcessed: number;
  conversationsPurged: number;
  messagesPurged: number;
  eventsPurged: number;
  purgedAt: string;
}

/**
 * Builds a validated pg_dump command string.
 * Uses safe argument formatting and custom compressed format by default.
 */
export function buildPgDumpCommand(options: BackupOptions): { command: string; args: string[] } {
  const url = options.databaseUrl || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openagent';
  const format = options.format || 'custom';
  const compress = options.compressLevel ?? 9;

  const args: string[] = [
    `--dbname=${url}`,
    `--format=${format === 'custom' ? 'c' : format === 'directory' ? 'd' : format === 'tar' ? 't' : 'p'}`,
    `--compress=${compress}`,
    `--file=${options.outputPath}`,
  ];

  if (options.includeClean) {
    args.push('--clean');
    args.push('--if-exists');
  }

  if (options.excludeTables && options.excludeTables.length > 0) {
    for (const table of options.excludeTables) {
      // Validate table identifier characters to prevent injection
      if (/^[a-zA-Z0-9_]+$/.test(table)) {
        args.push(`--exclude-table=${table}`);
      }
    }
  }

  return {
    command: 'pg_dump',
    args,
  };
}

/**
 * Builds a validated pg_restore command string.
 */
export function buildPgRestoreCommand(options: RestoreOptions): { command: string; args: string[] } {
  const url = options.databaseUrl || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openagent';

  const args: string[] = [`--dbname=${url}`];

  if (options.clean ?? true) {
    args.push('--clean');
  }
  if (options.ifExists ?? true) {
    args.push('--if-exists');
  }
  if (options.noOwner ?? true) {
    args.push('--no-owner');
  }
  if (options.noPrivileges ?? true) {
    args.push('--no-privileges');
  }
  if (options.singleTransaction ?? true) {
    args.push('--single-transaction');
  }

  args.push(options.inputPath);

  return {
    command: 'pg_restore',
    args,
  };
}

/**
 * Executes a deterministic, cross-tenant retention policy purge.
 * Identifies expired conversations, messages, and analytics records
 * based on each site's configured `retentionDays` (or default 30 days).
 */
export async function executeGlobalRetentionPurge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  systemActorId: string = 'system:retention_worker'
): Promise<RetentionPurgeSummary> {
  const summary: RetentionPurgeSummary = {
    sitesProcessed: 0,
    conversationsPurged: 0,
    messagesPurged: 0,
    eventsPurged: 0,
    purgedAt: new Date().toISOString(),
  };

  try {
    // 1. Fetch all active sites with their retention periods
    const allSites = await db.select({
      id: sites.id,
      tenantId: sites.tenantId,
      retentionDays: sites.retentionDays,
    }).from(sites);

    summary.sitesProcessed = allSites.length;

    for (const site of allSites) {
      const retentionDays = Number(site.retentionDays) || 30;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Find expired conversations for this site
      const expiredConversations = await db.select({
        id: conversations.id,
      }).from(conversations).where(
        sql`${conversations.siteId} = ${site.id} AND ${conversations.createdAt} < ${cutoffDate}`
      );

      if (expiredConversations.length > 0) {
        const conversationIds = expiredConversations.map((c: { id: string }) => c.id);

        // Delete messages associated with expired conversations
        for (const convId of conversationIds) {
          const deletedMsgs = await db.delete(messages)
            .where(sql`${messages.conversationId} = ${convId}`)
            .returning({ id: messages.id });
          summary.messagesPurged += deletedMsgs.length;
        }

        // Delete conversations
        for (const convId of conversationIds) {
          await db.delete(conversations).where(sql`${conversations.id} = ${convId}`);
        }
        summary.conversationsPurged += conversationIds.length;
      }

      // Delete expired analytics events
      const deletedEvents = await db.delete(analyticsEvents)
        .where(sql`${analyticsEvents.siteId} = ${site.id} AND ${analyticsEvents.createdAt} < ${cutoffDate}`)
        .returning({ id: analyticsEvents.id });
      summary.eventsPurged += deletedEvents.length;

      // Record audit log for retention purge if any items were purged
      if (
        expiredConversations.length > 0 ||
        deletedEvents.length > 0
      ) {
        await db.insert(adminAccessLogs).values({
          siteId: site.id,
          userId: systemActorId,
          action: 'retention_purge',
          details: {
            retentionDays,
            cutoffDate: cutoffDate.toISOString(),
            conversationsPurged: expiredConversations.length,
            eventsPurged: deletedEvents.length,
          },
        }).catch((err: Error) => {
          defaultLogger.warn(`[Retention Purge] Failed to record audit log for site ${site.id}: ${err.message}`);
        });
      }
    }

    defaultLogger.info('[Retention Purge] Complete', { ...summary });
    return summary;
  } catch (error) {
    defaultLogger.error('[Retention Purge] Error during execution', error);
    throw error;
  }
}
