import { toolAuditLogs } from '@openagent/db';
import { logger } from '@openagent/core';

export interface AuditLogEntry {
  siteId: string;
  conversationId?: string;
  visitorId?: string;
  toolName: string;
  status:
    | 'authorized'
    | 'unauthorized'
    | 'success'
    | 'failure'
    | 'rejected_missing_consent'
    | 'timeout'
    | 'pending_confirmation'
    | 'duplicate_submission';
  inputPayload: Record<string, any>;
  outputPayload?: Record<string, any>;
  errorMessage?: string;
  executionTimeMs: number;
  ipAddress?: string;
}

export class ToolAuditLogger {
  public static async log(db: any, entry: AuditLogEntry): Promise<void> {
    const sanitizedInput = { ...entry.inputPayload };
    for (const key of Object.keys(sanitizedInput)) {
      if (/password|secret|token|apikey|credential/i.test(key)) {
        sanitizedInput[key] = '[REDACTED]';
      }
    }

    try {
      if (db && typeof db.insert === 'function') {
        await db.insert(toolAuditLogs).values({
          siteId: entry.siteId,
          conversationId: entry.conversationId || null,
          visitorId: entry.visitorId || null,
          toolName: entry.toolName,
          status: entry.status,
          inputPayload: sanitizedInput,
          outputPayload: entry.outputPayload || {},
          errorMessage: entry.errorMessage || null,
          executionTimeMs: Math.max(0, Math.round(entry.executionTimeMs)),
          ipAddress: entry.ipAddress || null,
        });
      }
    } catch (err: any) {
      // Graceful fallback: Do not fail tool execution if audit write encounters DB issue
      if (logger && typeof logger.warn === 'function') {
        logger.warn('Failed to persist tool audit log to database', {
          toolName: entry.toolName,
          status: entry.status,
          error: err.message,
        });
      }
    }

    // Always emit structured app log
    if (logger && typeof logger.info === 'function') {
      logger.info(`[Tool Audit] ${entry.toolName} -> ${entry.status}`, {
        siteId: entry.siteId,
        toolName: entry.toolName,
        status: entry.status,
        durationMs: entry.executionTimeMs,
      });
    }
  }
}
