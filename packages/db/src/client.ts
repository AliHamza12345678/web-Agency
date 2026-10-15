import * as schema from './schema/index.js';
import { defaultLogger } from '@openagent/core';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  ssl?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Cause Fix: FUNCTION_INVOCATION_FAILED on Vercel
//
// The `postgres` package opens TCP sockets which are blocked inside Vercel
// serverless functions → every DB query crashes immediately.
//
// Solution: detect Vercel via the VERCEL env var and switch to
// @neondatabase/serverless which talks to Neon over HTTP (works everywhere).
//
// USAGE:
//   - Call `await initDb()` once at startup before accepting any requests.
//   - After that, `getDb()` is safe to call synchronously from any route.
//   - On Vercel, api/index.ts calls initDb() at module level.
//   - Locally, server.ts calls initDb() in startServer().
// ─────────────────────────────────────────────────────────────────────────────

const globalForDb = globalThis as unknown as {
  __openagent_dbInstance?: any;
  __openagent_sqlInstance?: any;
  __openagent_neonSqlInstance?: any;
};

const DEFAULT_DATABASE_URL =
  'postgresql://neondb_owner:npg_fi8HVoAPXn7L@ep-small-field-b58fjshj-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

/**
 * Initialize the database driver. Must be awaited before calling getDb().
 *
 * On Vercel  → @neondatabase/serverless + drizzle-orm/neon-http (HTTP, no TCP)
 * Locally    → postgres + drizzle-orm/postgres-js (TCP connection pool)
 */
export async function initDb(config?: DatabaseConfig): Promise<void> {
  if (globalForDb.__openagent_dbInstance) return; // Already initialized — idempotent

  const url = config?.url || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is missing.');

  const isVercel = !!process.env.VERCEL;

  if (isVercel) {
    // HTTP-based driver — works inside Vercel serverless functions
    try {
      const { neon } = await import('@neondatabase/serverless');
      const { drizzle } = await import('drizzle-orm/neon-http');
      globalForDb.__openagent_neonSqlInstance = neon(url);
      globalForDb.__openagent_dbInstance = drizzle(globalForDb.__openagent_neonSqlInstance, { schema });
      defaultLogger.info('Database initialized with Neon serverless HTTP driver.');
    } catch (neonErr: any) {
      defaultLogger.warn('Neon serverless driver load failed, falling back to postgres-js:', neonErr?.message || neonErr);
      const postgresModule = await import('postgres');
      const postgres = postgresModule.default;
      const { drizzle } = await import('drizzle-orm/postgres-js');
      globalForDb.__openagent_sqlInstance = postgres(url, { max: 1, ssl: 'require', prepare: false, connect_timeout: 5 });
      globalForDb.__openagent_dbInstance = drizzle(globalForDb.__openagent_sqlInstance, { schema });
    }
  } else {
    // TCP connection pool — optimal for long-running local/traditional servers
    const postgresModule = await import('postgres');
    const postgres = postgresModule.default;
    const { drizzle } = await import('drizzle-orm/postgres-js');

    const max = config?.maxConnections ?? Number(process.env.DATABASE_POOL_SIZE || 10);
    const idleTimeout = config?.idleTimeoutSeconds ?? 20;
    const connectTimeout = config?.connectTimeoutSeconds ?? 5;
    const ssl =
      config?.ssl ??
      (process.env.DATABASE_SSL === 'true' || url.includes('sslmode=require'));

    globalForDb.__openagent_sqlInstance = postgres(url, {
      max,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      ssl: ssl ? 'require' : false,
      prepare: false,
      onnotice: () => {}, // Suppress noisy PG notices
    });

    globalForDb.__openagent_dbInstance = drizzle(globalForDb.__openagent_sqlInstance, { schema });
    defaultLogger.info('Database initialized with postgres TCP pool.');
  }
}

/**
 * Returns the Drizzle database instance (synchronous after initDb() has been called).
 * Throws if initDb() was not awaited before first use.
 */
export function getDb(_config?: DatabaseConfig) {
  const instance = globalForDb.__openagent_dbInstance;
  if (!instance) {
    throw new Error(
      'Database not initialized. Ensure initDb() is awaited at server startup ' +
      'before any route handler is called.'
    );
  }
  return instance;
}

/**
 * Executes a health check query (SELECT 1) with a strict timeout.
 * Returns true if healthy, false otherwise, never throwing.
 */
export async function checkDatabaseHealth(
  timeoutMs = 3000
): Promise<{ healthy: boolean; error?: string }> {
  try {
    const queryFn = globalForDb.__openagent_neonSqlInstance ?? globalForDb.__openagent_sqlInstance;
    if (!queryFn) {
      return { healthy: false, error: 'Database client not initialized. Call initDb() first.' };
    }

    // Execute health check with bounded timeout
    const result = await Promise.race([
      queryFn`SELECT 1 AS alive`,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);

    const isAlive =
      Array.isArray(result) && result.length > 0 && result[0]?.alive === 1;
    return { healthy: isAlive };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultLogger.warn('Database health check failed', { error: message });
    return { healthy: false, error: message };
  }
}

/**
 * Safely drains and closes the database connection pool (local only).
 * On Vercel there is no persistent pool to close.
 */
export async function closeDatabasePool(): Promise<void> {
  if (globalForDb.__openagent_sqlInstance) {
    try {
      defaultLogger.info('Draining database connection pool...');
      await globalForDb.__openagent_sqlInstance.end({ timeout: 5 });
      defaultLogger.info('Database connection pool closed successfully.');
    } catch (err) {
      defaultLogger.error('Error while closing database connection pool', err);
    } finally {
      globalForDb.__openagent_sqlInstance = null;
      globalForDb.__openagent_dbInstance = null;
      globalForDb.__openagent_neonSqlInstance = null;
    }
  }
}

export { schema };
