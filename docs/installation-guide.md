# OpenAgent Installation & Setup Guide

This guide walks you through setting up OpenAgent for local development and deploying to production using free-tier services.

---

## 1. System Requirements & Prerequisites

- **Node.js**: `v20.x` or `v22.x` LTS
- **Package Manager**: `pnpm` (v11.20.0 or higher)
- **Database**: PostgreSQL 16+ with the `pgvector` extension installed
  - *Recommended Free Option*: [Neon Serverless Postgres](https://neon.tech) (includes pgvector)
  - *Alternative*: [Supabase Postgres](https://supabase.com) or local Docker PostgreSQL
- **Free AI Credentials** (at least one):
  - Cloudflare Workers AI Account ID & API Token, OR
  - OpenRouter API Key (free models ending in `:free`), OR
  - Local Ollama running on `http://localhost:11434`

---

## 2. Local Development Quickstart

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/your-org/openagent-chat.git
cd openagent-chat
pnpm install
```

### Step 2: Configure Local Environment
Copy the environment template:
```bash
cp .env.example .env
```
Open `.env` and configure:
```ini
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001
WEB_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/openagent
JWT_SECRET=development_jwt_secret_minimum_16_characters
ENCRYPTION_KEY=development_encryption_key_16_chars

# AI Provider (e.g. Cloudflare or OpenRouter)
AI_PRIMARY_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### Step 3: Initialize Database & Run Migrations
Ensure PostgreSQL is running and the `vector` extension is created:
```sql
CREATE DATABASE openagent;
\c openagent;
CREATE EXTENSION IF NOT EXISTS vector;
```

Run schema migrations:
```bash
pnpm db:migrate
```

### Step 4: Build Packages & Start Dev Servers
Build all workspaces:
```bash
pnpm build
```

Start the API and Web Dashboard concurrently in two terminals:
```bash
# Terminal 1: API Server (port 3001)
pnpm dev:api

# Terminal 2: Admin Web Dashboard (port 3000)
pnpm dev:web
```

Open `http://localhost:3000` in your browser.

---

## 3. Production Deployment Guide (100% Free Tier)

### Step 1: Provision Managed Database (Neon)
1. Sign up at [neon.tech](https://neon.tech) and create a project (`openagent-prod`).
2. Run in the Neon SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy the **pooled connection string** (e.g. `postgresql://...ep-xyz-pooler...neon.tech/neondb?sslmode=require`).

### Step 2: Run Production Migrations
Execute migrations against your Neon database from your terminal:
```bash
DATABASE_URL="your-neon-pooled-url" pnpm db:migrate
```

### Step 3: Deploy API to Render / Fly.io / Docker

#### Option A: Dockerfile (Universal)
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@11.20.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.20.0
COPY --from=builder /app ./
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
```

#### Option B: Render Web Service (Free Tier)
1. Create a **New Web Service** connected to your repository on [render.com](https://render.com).
2. Set Build Command: `pnpm install && pnpm build`
3. Set Start Command: `node apps/api/dist/server.js`
4. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
   - `DATABASE_URL`: `your-neon-pooled-url`
   - `JWT_SECRET`: *(Generate with `openssl rand -hex 32`)*
   - `ENCRYPTION_KEY`: *(Generate with `openssl rand -hex 16`)*
   - `CORS_ALLOWED_ORIGINS`: `https://your-dashboard.vercel.app,https://your-website.com`
   - `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_TOKEN` (or `OPENROUTER_API_KEY`)

### Step 4: Deploy Web Management Dashboard (Vercel)
1. Import repository on [vercel.com](https://vercel.com).
2. Set Root Directory to `apps/web`.
3. Set Environment Variable: `VITE_API_URL=https://your-api.onrender.com`.
4. Deploy.

---

## 4. Embedding the Chatbot on Customer Websites

Once your site is configured in the Admin Studio (`/sites/:siteId/studio`), obtain your public site key (`pk_live_...`).

### Standard Lightweight Snippet
Paste into the `<head>` or before `</body>` of the website:
```html
<script 
  async 
  src="https://your-api.onrender.com/widget.js" 
  data-site-id="pk_live_your_site_public_key">
</script>
```

### High-Performance Lazy-Loaded Snippet (Zero-Blocking)
Defers widget initialization until the browser thread is completely idle:
```html
<script 
  async 
  src="https://your-api.onrender.com/widget.js" 
  data-site-id="pk_live_your_site_public_key" 
  data-strategy="idle">
</script>
```

### Interaction-Only Snippet (Maximum Mobile Speed)
Waits for the visitor to move mouse, touch screen, or scroll before loading:
```html
<script 
  async 
  src="https://your-api.onrender.com/widget.js" 
  data-site-id="pk_live_your_site_public_key" 
  data-strategy="interaction">
</script>
```

---

## 5. Post-Deployment Verification

Run the automated smoke test suite against your newly deployed URL:
```bash
pnpm smoke-test https://your-api.onrender.com
```

Expected output:
```
OpenAgent Production Deployment Smoke Tests
Target: https://your-api.onrender.com
[PASS] 1. Root operational status endpoint
[PASS] 2. Liveness probe (/health/live)
[PASS] 3. Readiness probe (/health/ready)
[PASS] 4. Dependency health status (/health)
[PASS] 5. Public widget bundle delivery (/widget.js)
[PASS] 6. Secure HTTP perimeter headers
[PASS] 7. Public key validation on handshake endpoint
[PASS] 8. Unauthenticated admin endpoint rejection
[PASS] 9. Request size limit (>1MB payload rejection)

Smoke Test Results: 9 Passed, 0 Failed
```
