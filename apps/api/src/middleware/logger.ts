import type { MiddlewareHandler } from 'hono';
import { defaultLogger } from '@openagent/core';

export const requestLoggerMiddleware: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = c.get('requestId');

  await next();

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const status = c.res.status;

  defaultLogger.info(`${method} ${path} ${status} - ${durationMs}ms`, {
    requestId,
    method,
    path,
    status,
    durationMs,
  });
};
