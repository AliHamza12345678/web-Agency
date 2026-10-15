// Guarantee that @vercel/nft traces and bundles Neon driver and Drizzle into the function
import '@neondatabase/serverless';
import 'drizzle-orm/neon-http';

import { createApp } from '../apps/api/src/app.js';
import { handle } from '@hono/node-server/vercel';
import { initDb } from '@openagent/db';

// ─── Environment Configuration Defaults ─────────────────────────────────────
if (!process.env.ALLOW_REGISTRATION) {
  process.env.ALLOW_REGISTRATION = 'true';
}

// ─── Resilient Database Initialization ───────────────────────────────────────
let dbInitPromise: Promise<void> | null = null;
let dbInitError: Error | null = null;

async function ensureDb(): Promise<void> {
  if (dbInitError) {
    // Reset error so retry can happen on subsequent request
    dbInitError = null;
    dbInitPromise = null;
  }
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        await initDb();
      } catch (err: any) {
        dbInitError = err;
        dbInitPromise = null;
        console.error('[OpenAgent API] DB initialization failed:', err);
        throw err;
      }
    })();
  }
  return dbInitPromise;
}

// Warm up DB connection in background without blocking module load
ensureDb().catch((err) => {
  console.warn('[OpenAgent API] Background DB warmup notice:', err?.message || err);
});

// Create Hono application instance
const app = createApp();

// Safety middleware: ensure database is ready only for endpoints that need it
app.use('*', async (c, next) => {
  const path = c.req.path;

  // Endpoints that do NOT touch the database (public config, health, static widget, root)
  if (
    path.endsWith('/config') ||
    path === '/health' ||
    path === '/api/health' ||
    path === '/' ||
    path === '/widget.js'
  ) {
    return next();
  }

  // Routes requiring DB: ensure connection or return clear diagnostic JSON
  try {
    await ensureDb();
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message:
            err?.message ||
            'Unable to connect to PostgreSQL. Please check DATABASE_URL in Vercel Project Settings.',
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      500
    );
  }

  return next();
});

const nodeHandler = handle(app);

// Dual-compatible handler supporting both Node.js serverless and web fetch runtimes
export default async function handler(req: any, res?: any) {
  // If Vercel rewrote the request URL to /api, restore the original client URL from headers
  let pathStr = '';
  if (req && req.headers) {
    const matchedPath =
      req.headers['x-matched-path'] ||
      req.headers['x-forwarded-uri'] ||
      req.headers['x-original-uri'];

    if (matchedPath && (req.url === '/api' || req.url === '/api/')) {
      req.url = matchedPath;
    }
    pathStr = req.url || '';
  } else if (req && typeof req.url === 'string') {
    pathStr = req.url;
  }

  // Ensure database is initialized before any route that requires DB is called
  if (!pathStr.includes('/config') && !pathStr.includes('/health') && pathStr !== '/' && !pathStr.includes('/widget.js')) {
    await ensureDb();
  }

  if (res && typeof res.writeHead === 'function') {
    return nodeHandler(req, res);
  }
  return app.fetch(req);
}

handler.fetch = async (req: Request, ...args: any[]) => {
  const url = new URL(req.url);
  if (!url.pathname.includes('/config') && !url.pathname.includes('/health') && url.pathname !== '/' && !url.pathname.includes('/widget.js')) {
    await ensureDb();
  }
  return app.fetch(req, ...args);
};
