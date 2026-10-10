import dotenv from 'dotenv';
dotenv.config();

import { serve } from '@hono/node-server';
import { validateEnv, defaultLogger, type Env } from '@openagent/core';
import { closeDatabasePool, checkDatabaseHealth } from '@openagent/db';
import { createApp } from './app.js';
import type { Server } from 'http';

// 1. Strict Environment Validation at Startup
let env: Env;
try {
  env = validateEnv(process.env);
} catch (error) {
  // Console.error to ensure it is visible regardless of logger state
  console.error((error as Error).message);
  process.exit(1);
}

const app = createApp();
let serverInstance: Server | null = null;
let isShuttingDown = false;

// 2. Server Startup
async function startServer() {
  defaultLogger.info('Starting OpenAgent Chat API...', {
    env: env.NODE_ENV,
    port: env.PORT,
  });

  // Verify DB connectivity on startup (non-fatal warning if offline during initial setup)
  const dbHealth = await checkDatabaseHealth(3000);
  if (dbHealth.healthy) {
    defaultLogger.info('Database connection established and verified.');
  } else {
    defaultLogger.warn('Database connection check failed on startup. Will retry on demand.', {
      error: dbHealth.error,
    });
  }

  serverInstance = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      defaultLogger.info(`🚀 Server running on http://localhost:${info.port}`);
    }
  ) as unknown as Server;
}

// 3. Graceful Shutdown Handler
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  defaultLogger.info(`Received ${signal}. Initiating graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    defaultLogger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);

  try {
    // 1. Close HTTP server
    if (serverInstance) {
      await new Promise<void>((resolve, reject) => {
        serverInstance!.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
      defaultLogger.info('HTTP server closed.');
    }

    // 2. Drain and close database pool
    await closeDatabasePool();

    clearTimeout(shutdownTimeout);
    defaultLogger.info('Graceful shutdown completed cleanly.');
    process.exit(0);
  } catch (error) {
    defaultLogger.error('Error during shutdown', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  defaultLogger.error('Unhandled Promise Rejection', reason);
});

process.on('uncaughtException', (error: Error) => {
  defaultLogger.error('Uncaught Exception', error);
  gracefulShutdown('uncaughtException');
});

// Start the server
startServer().catch((err) => {
  defaultLogger.error('Fatal startup error', err);
  process.exit(1);
});
