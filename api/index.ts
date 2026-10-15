import { createApp } from '../apps/api/src/app.js';
import { handle } from '@hono/node-server/vercel';
import { initDb } from '../packages/db/src/client.js';

// ─── Fix for FUNCTION_INVOCATION_FAILED on Vercel ────────────────────────────
// The standard `postgres` package uses TCP sockets which are blocked inside
// Vercel serverless functions. initDb() detects the VERCEL environment variable
// and switches to @neondatabase/serverless (HTTP-based) automatically.
// Top-level await is valid here because this file is an ESM module.
await initDb();
// ─────────────────────────────────────────────────────────────────────────────

const app = createApp();

export default handle(app);
