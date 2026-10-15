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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlInstance: any = null;       // postgres.Sql  (local only, for pool drain)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let neonSqlInstance: any = null;   // NeonQueryFunction (Vercel only, for health)

/**
 * Initialize the database driver. Must be awaited before calling getDb().
 *
 * On Vercel  → @neondatabase/serverless + drizzle-orm/neon-http (HTTP, no TCP)
 * Locally    → postgres + drizzle-orm/postgres-js (TCP connection pool)
 */
export async function initDb(config?: DatabaseConfig): Promise<void> {
  if (dbInstance) return; // Already initialized — idempotent

  const url = config?.url || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is missing.');

  const isVercel = !!process.env.VERCEL;

  if (isVercel) {
    // HTTP-based driver — works inside Vercel serverless functions
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    neonSqlInstance = neon(url);
    dbInstance = drizzle(neonSqlInstance, { schema });
    defaultLogger.info('Database initialized with Neon serverless HTTP driver.');
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

    sqlInstance = postgres(url, {
      max,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      ssl: ssl ? 'require' : false,
      prepare: false,
      onnotice: () => {}, // Suppress noisy PG notices
    });

    dbInstance = drizzle(sqlInstance, { schema });
    defaultLogger.info('Database initialized with postgres TCP pool.');
  }
}

/**
 * Returns the Drizzle database instance (synchronous after initDb() has been called).
 * Throws if initDb() was not awaited before first use.
 */
export function getDb(_config?: DatabaseConfig) {
  if (!dbInstance) {
    throw new Error(
      'Database not initialized. Ensure initDb() is awaited at server startup ' +
      'before any route handler is called.'
    );
  }
  return dbInstance;
}

/**
 * Executes a health check query (SELECT 1) with a strict timeout.
 * Returns true if healthy, false otherwise, never throwing.
 */
export async function checkDatabaseHealth(
  timeoutMs = 3000
): Promise<{ healthy: boolean; error?: string }> {
  try {
    const queryFn = neonSqlInstance ?? sqlInstance;
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
  if (sqlInstance) {
    try {
      defaultLogger.info('Draining database connection pool...');
      await sqlInstance.end({ timeout: 5 });
      defaultLogger.info('Database connection pool closed successfully.');
    } catch (err) {
      defaultLogger.error('Error while closing database connection pool', err);
    } finally {
      sqlInstance = null;
      dbInstance = null;
      neonSqlInstance = null;
    }
  }
}

export { schema };
