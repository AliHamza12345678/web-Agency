import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';
import { defaultLogger } from '@openagent/core';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  ssl?: boolean;
}

let sqlInstance: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Initializes or returns the existing database client and pool.
 */
export function getDb(config?: DatabaseConfig) {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = config?.url || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is missing.');
  }

  const max = config?.maxConnections ?? Number(process.env.DATABASE_POOL_SIZE || 10);
  const idleTimeout = config?.idleTimeoutSeconds ?? 20;
  const connectTimeout = config?.connectTimeoutSeconds ?? 5;
  const ssl = config?.ssl ?? (process.env.DATABASE_SSL === 'true' || connectionString.includes('sslmode=require'));

  sqlInstance = postgres(connectionString, {
    max,
    idle_timeout: idleTimeout,
    connect_timeout: connectTimeout,
    ssl: ssl ? 'require' : false,
    onnotice: () => {}, // Suppress noisy PG notices
  });

  dbInstance = drizzle(sqlInstance, { schema });
  return dbInstance;
}

/**
 * Executes a health check query (SELECT 1) with a strict timeout.
 * Returns true if healthy, false otherwise, never throwing.
 */
export async function checkDatabaseHealth(timeoutMs = 3000): Promise<{ healthy: boolean; error?: string }> {
  try {
    if (!sqlInstance) {
      getDb();
    }

    if (!sqlInstance) {
      return { healthy: false, error: 'Database client not initialized' };
    }

    // Execute health check with bounded timeout
    const result = await Promise.race([
      sqlInstance`SELECT 1 AS alive`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);

    const isAlive = Array.isArray(result) && result.length > 0 && result[0]?.alive === 1;
    return { healthy: isAlive };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultLogger.warn('Database health check failed', { error: message });
    return { healthy: false, error: message };
  }
}

/**
 * Safely drains and closes the database connection pool.
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
    }
  }
}

export { schema };
