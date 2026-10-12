import { Hono } from 'hono';
import { checkDatabaseHealth } from '@openagent/db';
import type { LivenessResponse, ReadinessResponse } from '@openagent/core';
import { createDefaultOrchestrator } from '@openagent/ai-provider';

export const healthRouter = new Hono();

const startTime = Date.now();
let cachedOrchestrator: ReturnType<typeof createDefaultOrchestrator> | null = null;

function getHealthOrchestrator() {
  if (!cachedOrchestrator) {
    try {
      cachedOrchestrator = createDefaultOrchestrator();
    } catch {
      cachedOrchestrator = null;
    }
  }
  return cachedOrchestrator;
}

/**
 * 1. Root health summary: checks critical dependencies, uptime, and system resources.
 */
healthRouter.get('/', async (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const dbHealth = await checkDatabaseHealth(3000);

  const orchestrator = getHealthOrchestrator();
  const availableProviders = orchestrator ? orchestrator.getAvailableProviders() : [];

  const mem = process.memoryUsage();
  const memoryMetrics = {
    rssMb: Math.round(mem.rss / (1024 * 1024)),
    heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
    heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
  };

  const isHealthy = dbHealth.healthy;

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      dependencies: {
        database: dbHealth.healthy ? 'healthy' : 'unhealthy',
        aiProviders: {
          status: availableProviders.length > 0 ? 'operational' : 'offline',
          availableProviders,
        },
      },
      memory: memoryMetrics,
      version: '0.1.0',
    },
    isHealthy ? 200 : 503
  );
});

/**
 * 2. Liveness probe: verifies process is alive and responding.
 */
healthRouter.get('/live', (c) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const response: LivenessResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
  };
  return c.json(response, 200);
});

/**
 * 3. Readiness probe: checks critical dependencies (e.g. database connectivity)
 * with bounded timeout. Strictly avoids exposing internal secrets or hostnames.
 */
healthRouter.get('/ready', async (c) => {
  const dbHealth = await checkDatabaseHealth(3000);

  const response: ReadinessResponse = {
    status: dbHealth.healthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealth.healthy ? 'healthy' : 'unhealthy',
    },
  };

  const statusCode = dbHealth.healthy ? 200 : 503;
  return c.json(response, statusCode as any);
});
