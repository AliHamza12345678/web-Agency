import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first, then local fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { createApp } from './app.js';
import { handle } from '@hono/node-server/vercel';

const app = createApp();
const nodeHandler = handle(app);

export default function handler(req: any, res?: any) {
  if (res && typeof res.writeHead === 'function') {
    return nodeHandler(req, res);
  }
  return app.fetch(req);
}

handler.fetch = app.fetch.bind(app);


