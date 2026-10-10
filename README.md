# OpenAgent Chat

A production-oriented, multi-tenant AI conversational platform designed to be embedded into any website using a lightweight, non-intrusive JavaScript snippet. It delivers grounded, contextual, multilingual answers based strictly on tenant-scoped knowledge bases and approved tool actions.

---

## Architecture & Workspaces

The repository is organized as a clean TypeScript monorepo using `pnpm` workspaces:

- **`apps/api`**: Fastify/Hono Node.js backend providing REST and SSE streaming endpoints, request validation, structured logging, safe health checks, and graceful shutdown.
- **`packages/core`**: Centralized domain types, Zod validation schemas, structured logger with sensitive data redaction, and standardized error hierarchy.
- **`packages/db`**: PostgreSQL access layer using Drizzle ORM with `pgvector` vector embedding support, connection pooling, and automated migration runner.
- **`apps/widget`**: *(Phase 5)* Standalone embeddable custom element `<openagent-chat>` built inside an isolated Shadow DOM (< 35 KB gzipped).
- **`apps/web`**: *(Phase 6)* Multi-tenant administration dashboard.

---

## Prerequisites

- **Node.js**: `v22.x` or higher
- **Package Manager**: `pnpm` (`v11.x` or `v12.x`)
- **Database**: PostgreSQL 16+ with `pgvector` extension enabled (e.g., [Neon Serverless Postgres](https://neon.tech) free tier).

---

## Local Development Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```

Ensure the following variables are configured in `.env`:
- `DATABASE_URL`: Connection string for PostgreSQL (e.g. from Neon with `sslmode=require`).
- `JWT_SECRET`: Random string with at least 16 characters.
- `ENCRYPTION_KEY`: Random string with at least 16 characters.
- `GEMINI_API_KEY`: *(Optional in Phase 1)* Google AI Studio API key.

### 3. Generate & Run Database Migrations
Generate SQL migration files from schema definitions:
```bash
pnpm db:generate
```

Apply migrations to your PostgreSQL database:
```bash
pnpm db:migrate
```

### 4. Run the Development Server
Start the backend API server with live reloading:
```bash
pnpm dev:api
```
The API server will listen on `http://localhost:3001`.

---

## Verifying the Foundation

### Health Check Probes
- **Liveness Probe**:
  ```bash
  curl http://localhost:3001/health/live
  # Response: {"status":"ok","timestamp":"...","uptimeSeconds":42}
  ```
- **Readiness Probe** (Verifies DB connectivity with bounded timeout without leaking secrets):
  ```bash
  curl http://localhost:3001/health/ready
  # Response: {"status":"ready","timestamp":"...","checks":{"database":"healthy"}}
  ```

### Automated Testing & Strict Type-Checking
Run the complete test suite:
```bash
pnpm test
```

Run TypeScript strict composite build across all packages:
```bash
npx tsc -b
```

---

## Production Deployment

### Environment Checklist
- Set `NODE_ENV=production`.
- Ensure `JWT_SECRET` and `ENCRYPTION_KEY` are cryptographically secure 64-character tokens.
- Restrict `CORS_ALLOWED_ORIGINS` to trusted host web origins.
- Build the production bundles:
  ```bash
  pnpm build
  ```
- Start the API server:
  ```bash
  pnpm --filter @openagent/api start
  ```
