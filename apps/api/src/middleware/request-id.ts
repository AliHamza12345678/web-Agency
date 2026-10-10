import type { MiddlewareHandler } from 'hono';
import crypto from 'crypto';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incomingId = c.req.header('x-request-id');
  const requestId = incomingId && incomingId.trim().length > 0 ? incomingId.trim() : crypto.randomUUID();

  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  await next();
};
