import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { tenantsRouter } from './routes/tenants.js';
import { sitesRouter } from './routes/sites.js';
import { publicSiteRouter } from './routes/public-site.js';
import { chatRouter } from './routes/chat.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { toolsRouter, adminToolsRouter } from './routes/tools.js';
import { studioRouter } from './routes/studio.js';
import { analyticsRouter } from './routes/analytics.js';
import { NotFoundError } from '@openagent/core';

import { securityHeadersMiddleware } from './middleware/security-headers.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { bodyLimit } from 'hono/body-limit';

export function createApp() {
  const app = new Hono();

  // 1. Global Security & Tracing Middleware
  app.use('*', securityHeadersMiddleware);
  app.use('*', requestIdMiddleware);
  app.use('*', requestLoggerMiddleware);

  // Request size limit (1MB max payload to mitigate DOS memory exhaustion)
  app.use(
    '*',
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            success: false,
            error: {
              code: 'PAYLOAD_TOO_LARGE',
              message: 'Request payload exceeds maximum allowed size limit of 1MB',
            },
            meta: {
              timestamp: new Date().toISOString(),
            },
          },
          413
        ),
    })
  );

  // Rate Limiting (sliding-window per anonymous IP hash & site)
  app.use(
    '/api/v1/auth/*',
    rateLimiter({ windowMs: 60 * 1000, maxRequests: 20, keyPrefix: 'auth_ip' })
  );
  app.use(
    '/api/v1/chat/*',
    rateLimiter({ windowMs: 60 * 1000, maxRequests: 60, keyPrefix: 'chat_ip' })
  );
  app.use(
    '/api/v1/site/*',
    rateLimiter({ windowMs: 60 * 1000, maxRequests: 120, keyPrefix: 'site_ip' })
  );

  // 2. CORS configuration
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((s: string) => s.trim());

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return allowedOrigins[0] || '*';
        return allowedOrigins.includes(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-visitor-session'],
      exposeHeaders: ['x-request-id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
      maxAge: 86400,
    })
  );

  // 3. Mount Routes
  app.route('/health', healthRouter);
  app.route('/api/v1/auth', authRouter);
  app.route('/api/v1/admin/tenants', tenantsRouter);
  app.route('/api/v1/admin/tenants', sitesRouter);
  app.route('/api/v1/admin/tenants', knowledgeRouter);
  app.route('/api/v1/admin/tenants', adminToolsRouter);
  app.route('/api/v1/admin/tenants', studioRouter);
  app.route('/api/v1/admin/tenants', analyticsRouter);
  app.route('/api/v1/site', publicSiteRouter);
  app.route('/api/v1/chat', chatRouter);
  app.route('/api/v1/tools', toolsRouter);

  // Serve compiled standalone widget bundle with in-memory caching & immutable CDN headers
  let cachedWidgetBundle: string | null = null;

  app.get('/widget.js', async (c) => {
    if (cachedWidgetBundle) {
      c.header('Content-Type', 'application/javascript; charset=utf-8');
      c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      c.header('Access-Control-Allow-Origin', '*');
      return c.body(cachedWidgetBundle);
    }

    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const widgetPath = path.resolve(__dirname, '../../../apps/widget/dist/widget.js');

    if (fs.existsSync(widgetPath)) {
      cachedWidgetBundle = fs.readFileSync(widgetPath, 'utf-8');
      c.header('Content-Type', 'application/javascript; charset=utf-8');
      c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      c.header('Access-Control-Allow-Origin', '*');
      return c.body(cachedWidgetBundle);
    }

    throw new NotFoundError('widget.js build asset was not found');
  });

  // Root welcome / status
  app.get('/', (c) => {
    return c.json({
      name: 'OpenAgent Chat API',
      status: 'operational',
      version: '0.1.0',
    });
  });

  // 4. Not Found Handler
  app.notFound((c) => {
    throw new NotFoundError(`Route ${c.req.method} ${c.req.path}`);
  });

  // 5. Centralized Error Handler
  app.onError(errorHandler);

  return app;
}
