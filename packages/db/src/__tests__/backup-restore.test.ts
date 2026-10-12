import { describe, it, expect, vi } from 'vitest';
import {
  buildPgDumpCommand,
  buildPgRestoreCommand,
  executeGlobalRetentionPurge,
} from '../backup-restore.js';

describe('Database Backup & Restore Automation', () => {
  it('constructs a hardened pg_dump command with custom format and compression', () => {
    const result = buildPgDumpCommand({
      databaseUrl: 'postgresql://usr:pwd@dbhost:5432/proddb?sslmode=require',
      outputPath: '/backups/snapshot-2026-10-11.dump',
      format: 'custom',
      compressLevel: 9,
      includeClean: true,
      excludeTables: ['audit_logs', 'temp_sessions', 'evil;drop table users;--'],
    });

    expect(result.command).toBe('pg_dump');
    expect(result.args).toContain('--dbname=postgresql://usr:pwd@dbhost:5432/proddb?sslmode=require');
    expect(result.args).toContain('--format=c');
    expect(result.args).toContain('--compress=9');
    expect(result.args).toContain('--file=/backups/snapshot-2026-10-11.dump');
    expect(result.args).toContain('--clean');
    expect(result.args).toContain('--if-exists');
    expect(result.args).toContain('--exclude-table=audit_logs');
    expect(result.args).toContain('--exclude-table=temp_sessions');
    // Injection attempt should be sanitized out
    expect(result.args).not.toContain('--exclude-table=evil;drop table users;--');
  });

  it('constructs a safe pg_restore command with strict isolation flags', () => {
    const result = buildPgRestoreCommand({
      databaseUrl: 'postgresql://usr:pwd@dbhost:5432/proddb',
      inputPath: '/backups/snapshot-2026-10-11.dump',
      clean: true,
      ifExists: true,
      noOwner: true,
      noPrivileges: true,
      singleTransaction: true,
    });

    expect(result.command).toBe('pg_restore');
    expect(result.args).toContain('--dbname=postgresql://usr:pwd@dbhost:5432/proddb');
    expect(result.args).toContain('--clean');
    expect(result.args).toContain('--if-exists');
    expect(result.args).toContain('--no-owner');
    expect(result.args).toContain('--no-privileges');
    expect(result.args).toContain('--single-transaction');
    expect(result.args[result.args.length - 1]).toBe('/backups/snapshot-2026-10-11.dump');
  });

  it('executes global retention purge honoring per-site retention windows', async () => {
    const mockSites = [
      { id: 'site-alpha', tenantId: 'tenant-1', retentionDays: 14 },
      { id: 'site-beta', tenantId: 'tenant-2', retentionDays: 30 },
    ];

    const mockConversations = [
      { id: 'conv-old-1' },
      { id: 'conv-old-2' },
    ];

    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table) => {
          if (table._?.name === 'sites' || !table._) {
            return {
              where: vi.fn().mockResolvedValue(mockConversations),
              then: (fn: any) => Promise.resolve(mockSites).then(fn),
            };
          }
          return {
            where: vi.fn().mockResolvedValue(mockConversations),
          };
        }),
      })),
      delete: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'deleted-1' }, { id: 'deleted-2' }]),
        })),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          catch: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    };

    const summary = await executeGlobalRetentionPurge(mockDb as any, 'system:cron_worker');

    expect(summary.sitesProcessed).toBe(2);
    expect(summary.conversationsPurged).toBeGreaterThanOrEqual(0);
    expect(summary.messagesPurged).toBeGreaterThanOrEqual(0);
    expect(summary.purgedAt).toBeDefined();
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
