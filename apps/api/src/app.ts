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
import { NotFoundError } from '@openagent/core';

export function createApp() {
  const app = new Hono();

  // 1. Global Middleware
  app.use('*', requestIdMiddleware);
  app.use('*', requestLoggerMiddleware);

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
      exposeHeaders: ['x-request-id'],
      maxAge: 86400,
    })
  );

  // 3. Mount Routes
  app.route('/health', healthRouter);
  app.route('/api/v1/auth', authRouter);
  app.route('/api/v1/admin/tenants', tenantsRouter);
  app.route('/api/v1/admin/tenants', sitesRouter);
  app.route('/api/v1/site', publicSiteRouter);
  app.route('/api/v1/chat', chatRouter);

  // Serve compiled standalone widget bundle
  app.get('/widget.js', async (c) => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const widgetPath = path.resolve(__dirname, '../../../apps/widget/dist/widget.js');

    if (fs.existsSync(widgetPath)) {
      const code = fs.readFileSync(widgetPath, 'utf-8');
      c.header('Content-Type', 'application/javascript; charset=utf-8');
      c.header('Cache-Control', 'public, max-age=3600');
      c.header('Access-Control-Allow-Origin', '*');
      return c.body(code);
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
