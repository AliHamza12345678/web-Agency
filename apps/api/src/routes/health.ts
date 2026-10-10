import { Hono } from 'hono';
import { checkDatabaseHealth } from '@openagent/db';
import type { LivenessResponse, ReadinessResponse } from '@openagent/core';

export const healthRouter = new Hono();

const startTime = Date.now();

/**
 * Liveness probe: verifies process is alive and responding.
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
 * Readiness probe: checks critical dependencies (e.g. database connectivity)
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
