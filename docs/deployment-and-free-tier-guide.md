# Production Deployment & Free-Tier Operating Guide (Phase 11)

## 1. Overview & Free-Tier-First Operating Model

OpenAgent is architected to run stably in production without requiring paid cloud subscriptions. By combining high-efficiency serverless models, managed free-tier databases with vector extensions, and an ultra-lightweight client widget, operating costs remain strictly **$0/month** within standard free limits.

```
┌────────────────────────────────────────────────────────┐
│             HOST WEBSITE (Browser Client)              │
│  <script async src="/widget.js" data-site-id="pk_live"> │
│  Lightweight Bundle: 28.24 kB raw │ 8.18 kB gzipped   │
└───────────────────────────┬────────────────────────────┘
                            │ SSE Stream (Bounded 8 turns)
                            ▼
┌────────────────────────────────────────────────────────┐
│            OPENAGENT API (Render / Fly / Docker)        │
│  - In-memory config caching (60s TTL)                  │
│  - Privacy rate limits & body capping (1MB)            │
│  - Circuit-breaker multi-provider orchestrator         │
└─────────────┬──────────────────────────┬───────────────┘
              │                          │
              ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ FREE MANAGED POSTGRESQL  │  │   FREE AI INFERENCE      │
│ Neon / Supabase Free     │  │ 1. Cloudflare Workers AI  │
│ - pgvector (768/384 dim) │  │ 2. OpenRouter Free Models│
│ - Max 5 pooled conns     │  │ 3. Hugging Face Embeddings│
└──────────────────────────┘  └──────────────────────────┘
```

---

## 2. Real-World Free-Tier Limits & Bottleneck Analysis

| Service | Free-Tier Quota & Limits | Expected Bottleneck | Platform Mitigation / Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **Cloudflare Workers AI** | **10,000 Neurons/day free** (~1,000 to 2,500 chat responses/day). | Daily neuron budget exhaustion. | When quota triggers HTTP 429, orchestrator places Cloudflare in a 60s cooldown and seamlessly falls back to OpenRouter. |
| **OpenRouter (Free Models)** | **Free models** (`llama-3.2-3b-instruct:free`, `qwen-2.5-7b-instruct:free`, `gemma-2-9b:free`). Rate limit: ~20 req/min. | Rapid visitor message bursts causing short 429 rate limits. | Circuit breaker cooldown; client streaming yields an honest degradation notice with human support handoff instead of crashing. |
| **Hugging Face Serverless** | **30,000 embedding queries/month free** (`BAAI/bge-small-en-v1.5`). | Model instance cold sleep takes 2–4 seconds on first indexing request. | In-memory chunk caching; pre-computed embeddings stored in PostgreSQL; graceful query timeout. |
| **Neon PostgreSQL** | **0.5 GB storage**, 1 project, **20 pooled connections**, autosuspends after 5 min idle. | Connection pool starvation; ~500ms cold resume latency. | App enforces bounded connection pool (`max: 5` per API instance); in-memory TTL caching on `/api/v1/site/config` eliminates redundant DB reads. |
| **Supabase PostgreSQL** | **500 MB database**, 2 active projects, **60 direct connections**, auto-pauses after 7 days inactivity. | Unused dev project hibernation. | Automated retention cleanup job prevents storage buildup beyond 500 MB; periodic heartbeat ping keeps active instances awake. |
| **Render Web Service** | **750 free instance hours/month**, spins down after 15 min idle. | 30–50s initial HTTP cold start for admin studio. | Liveness health check `/health/live` returns instantly; widget launcher displays immediately without waiting for API handshake. |

---

## 3. Configurable Usage Caps & Graceful Degradation

To ensure that a free deployment is **never silently billed** and never overwhelms free provider allowances:

1. **Per-Site Message Turn Limit (`maxMessagesPerConversation`)**:
   - Default: 50 turns.
   - When exceeded, the streaming endpoint returns:
     `"This conversation has reached the maximum message limit configured for this website. Please click the restart button or refresh the page to start a new chat."`
   - Halts model invocation immediately before token transmission.
2. **Conversation Context Bounding**:
   - The API slices historical turns to `history.slice(-8)`. Even long visitor sessions cannot send hundreds of turns into the prompt context window.
3. **Retrieval Bounding**:
   - Vector semantic search is capped to `topK: 4` with `minScore: 0.5`.
4. **Zero Credential Exposure**:
   - API keys and tokens are strictly server-side.
   - The compiled widget (`widget.js`) contains **zero** secrets, using only the unprivileged public key `pk_live_...`.

---

## 4. Performance & Bundle Metrics

Measurements verified against production build:

- **Widget JS Raw Size**: `28.24 kB`
- **Widget JS Gzipped Size**: `8.18 kB` (optimal for mobile and slow 3G networks)
- **Shadow DOM Isolation**: Enabled (100% immune to host CSS bleeding)
- **Loading Strategies Supported**:
  - `data-strategy="immediate"`: Loads immediately upon script execution.
  - `data-strategy="idle"`: Uses `requestIdleCallback` / `load` event to execute without delaying main-thread DOM paint.
  - `data-strategy="interaction"`: Waits for first visitor scroll, touch, or mouse interaction before initializing.

---

## 5. Step-by-Step Deployment Guide

### Step 5.1: Database Provisioning (Neon Free Tier)
1. Sign up at [neon.tech](https://neon.tech) and create a free project: `openagent-db`.
2. Enable the `vector` extension in the Neon SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy the pooled connection string (with `?sslmode=require`).

### Step 5.2: Environment Configuration
Create `.env.production` for your server:
```ini
# Server Configuration
NODE_ENV=production
PORT=3001
API_BASE_URL=https://api.yourdomain.com
CORS_ALLOWED_ORIGINS=https://dashboard.yourdomain.com,https://yourdomain.com

# Database (Neon Pooled URL)
DATABASE_URL=postgresql://user:password@ep-xyz-pooler.us-east-2.aws.neon.tech/openagent?sslmode=require

# Authentication & Security
JWT_SECRET=generate_with_openssl_rand_hex_32

# Free-Tier AI Providers (at least one required)
CLOUDFLARE_ACCOUNT_ID=your_cf_account_id
CLOUDFLARE_API_KEY=your_cf_api_token
# or
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key
```

### Step 5.3: Run Database Migrations
Execute schema initialization:
```bash
pnpm --filter @openagent/db run db:migrate
```

### Step 5.4: Deploy API Service (Render / Fly.io / Docker)

**Docker Deployment:**
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

### Step 5.5: Deploy Management Web Dashboard (Vercel)
1. Link the repository to [Vercel](https://vercel.com).
2. Set Root Directory to `apps/web`.
3. Set Environment Variable: `VITE_API_URL=https://api.yourdomain.com`.
4. Deploy.

---

## 6. Post-Deployment Smoke Testing & Acceptance Criteria

Run the automated smoke test script against your production endpoint:
```bash
pnpm smoke-test https://api.yourdomain.com
```

The script verifies:
1. Root operational status (`GET /`)
2. Process liveness (`GET /health/live`)
3. Dependency readiness (`GET /health/ready`)
4. Health check report (`GET /health`)
5. Widget script availability (`GET /widget.js`) with CDN cache headers
6. Security perimeter headers (`nosniff`, `SAMEORIGIN`, `HSTS`)
7. Public key validation and error formatting
8. Admin authentication barrier (HTTP 401 without Bearer JWT)
9. Payload limit enforcement (HTTP 413 on >1MB payload)

---

## 7. Rollback & Disaster Recovery Procedures

1. **Studio Configuration Rollback**:
   - If a newly published chatbot configuration introduces unwanted behavior, roll back instantly without code deployment via the Admin Studio:
     `POST /api/v1/admin/tenants/:tenantId/sites/:siteId/studio/rollback` with `{ version: targetVersion, publishImmediately: true }`.
2. **Application Release Rollback**:
   - If an API or widget release has bugs:
     - In Git: Revert to the previous release tag: `git checkout v0.9.0 && pnpm build`.
     - In Docker / Render: Re-deploy the previous image SHA from the container registry.
3. **Database Point-In-Time Restoration**:
   - Consult [`docs/database-backup-restore.md`](file:///c:/robotic-agent/docs/database-backup-restore.md) for restoring logical dumps using `pg_restore --single-transaction --clean`.
