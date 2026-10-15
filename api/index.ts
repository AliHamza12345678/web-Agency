// Guarantee that @vercel/nft traces and bundles Neon driver and Drizzle into the function
import '@neondatabase/serverless';
import 'drizzle-orm/neon-http';

import { createApp } from '../apps/api/src/app.js';
import { handle } from '@hono/node-server/vercel';
import { initDb } from '../packages/db/src/client.js';

// ─── Production Environment Fallbacks for Vercel ─────────────────────────────
// In case environment variables were not yet configured in the Vercel dashboard,
// supply safe working defaults so the application functions out of the box.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://neondb_owner:npg_fi8HVoAPXn7L@ep-small-field-b58fjshj-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'e48f7a912b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a';
}
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '9f8e7d6c5b4a392817263544aabbccdd';
}
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
export default function handler(req: any, res?: any) {
  if (res && typeof res.writeHead === 'function') {
    return nodeHandler(req, res);
  }
  return app.fetch(req);
}

handler.fetch = app.fetch.bind(app);
