# OpenAgent Operations & Incident Response Runbook

## 1. System Health & Observability Metrics

The OpenAgent API provides structured JSON endpoints for health monitoring, uptime tracking, and container orchestration:

| Endpoint | Purpose | Target Status | Alert Trigger |
| :--- | :--- | :--- | :--- |
| **`GET /health/live`** | Liveness probe (process responsive) | HTTP 200 `{ status: "ok" }` | 3 consecutive failures -> Restart container. |
| **`GET /health/ready`** | Readiness probe (database connectivity) | HTTP 200 `{ status: "ready" }` | HTTP 503 -> Remove from ingress router. |
| **`GET /health`** | System & dependency status report | HTTP 200 (database + AI providers) | Memory `heapUsedMb > 380MB` -> Investigate memory leak. |

---

## 2. Routine Maintenance Procedures

### 2.1 Automated Retention Purge (Nightly Job)
To maintain compliance with GDPR and preserve free-tier storage boundaries (Neon 0.5 GB quota), the retention purge job must execute daily:

```bash
# Execute programmatic cross-tenant retention cleanup
tsx packages/db/src/backup-restore.ts --action=purge
```
**What it does:**
- Identifies conversations older than each site's `retentionDays` setting (default: 30 days).
- Cascades deletion of associated messages, citations, and analytics events.
- Writes an immutable record to `admin_access_logs` with action `retention_purge`.

### 2.2 Logical Database Backups
Execute daily backups using the built-in hardened pg_dump builder:
```bash
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=c \
  --compress=9 \
  --clean \
  --if-exists \
  --file="/var/backups/openagent-$(date +%Y%m%d_%H%M%S).dump"
```
Encrypt backup dumps with AES-256-GCM and store in immutable cloud object storage (e.g. AWS S3 Glacier with Object Lock or Cloudflare R2).

### 2.3 Restoration Drills
Test recovery monthly on an isolated staging database:
```bash
pg_restore \
  --dbname="${STAGING_DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --single-transaction \
  /var/backups/latest.dump
```

---

## 3. Incident Response Runbooks

### Incident 1: Upstream AI Provider Rate Limit Storm (HTTP 429)
- **Symptom:** AI provider logs warning: `[AI Orchestrator] Provider 'cloudflare' placed in cooldown for 60s`.
- **Root Cause:** Free-tier daily Neurons or per-minute rate limits exhausted by visitor traffic spikes.
- **Immediate Action:**
  1. The AI orchestrator automatically shifts traffic to `AI_FALLBACK_PROVIDER` (e.g. OpenRouter free models).
  2. If both providers are in cooldown, the visitor receives a graceful fallback message with support email.
  3. Verify provider token quota in Cloudflare Dashboard (`dash.cloudflare.com`) or OpenRouter (`openrouter.ai/activity`).
  4. Temporarily raise per-site rate throttling in Studio (`limits.rateLimitPerMinute`) or configure an additional backup provider in `.env`.

### Incident 2: Database Connection Pool Exhaustion
- **Symptom:** `/health/ready` returns HTTP 503; logs show `Max clients reached` or `connection timeout`.
- **Root Cause:** Free-tier Neon pool saturation (>20 connections) due to unpooled connections.
- **Immediate Action:**
  1. Ensure `DATABASE_URL` uses the **pooled** connection hostname (containing `-pooler` in Neon).
  2. Verify that `DATABASE_POOL_SIZE` is capped at `5` per container instance in `.env`.
  3. Check for stuck long-running queries in PostgreSQL:
     ```sql
     SELECT pid, age(clock_timestamp(), query_start), query 
     FROM pg_stat_activity 
     WHERE state != 'idle' AND query_start < now() - interval '30 seconds';
     ```

### Incident 3: Rogue Embed Domain / Public Key Abuse
- **Symptom:** Analytics dashboard shows unauthorized website embedding your chatbot widget.
- **Root Cause:** Public site key (`pk_live_...`) copied onto an unapproved third-party domain.
- **Immediate Action:**
  1. Navigate to **Site Settings -> Allowed Domains** in the Admin Studio.
  2. Ensure domain allowlist is restricted (e.g. `['myshop.com']` rather than `['*']`).
  3. Once saved, requests from other domains will be rejected with **HTTP 403 Forbidden**.
  4. The in-memory cache automatically invalidates immediately upon publishing changes.

### Incident 4: Misconfigured Chatbot Studio Deployment
- **Symptom:** Newly published chatbot prompt or brand styling produces poor responses.
- **Immediate Action:**
  1. Open the Admin Studio -> **Version History**.
  2. Click **Rollback** to the last known stable version number.
  3. The studio immediately creates a new forward version snapshot containing the historical configuration and clears edge caches.

---

## 4. Credential Rotation Procedures

### 4.1 Rotating JWT Secret
1. Generate new 32-byte secret: `openssl rand -hex 32`.
2. Update `JWT_SECRET` in production environment variables.
3. Restart API service.
4. *Impact:* Active admin users will be prompted to re-login once their current session expires. Public widget visitors are unaffected (widget sessions use ephemeral visitor IDs, not admin JWTs).

### 4.2 Rotating AI Provider Keys
1. Generate new API token in provider dashboard (Cloudflare / OpenRouter).
2. Update `CLOUDFLARE_API_TOKEN` or `OPENROUTER_API_KEY` in environment variables.
3. Restart API service.
4. Zero downtime; orchestrator transitions to the updated key immediately.
