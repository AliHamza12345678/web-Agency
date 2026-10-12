import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first, then local fallback
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { createApp } from './app.js';

const app = createApp();

export default app;
