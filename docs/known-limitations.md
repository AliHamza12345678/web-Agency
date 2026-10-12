# Known Limitations & Free-Tier Operational Boundaries

This document provides a realistic, transparent assessment of platform limits, architectural constraints, and third-party free-tier characteristics.

---

## 1. Upstream AI Provider & Free-Tier Quotas

### 1.1 Cloudflare Workers AI
- **Daily Quota:** 10,000 Neurons/day on the free tier. This corresponds to approximately 1,000 to 2,500 conversational responses per day depending on context length.
- **Quota Reset:** Daily quotas reset at 00:00 UTC.
- **Handling:** When the daily neuron quota is reached, Cloudflare returns HTTP 429. The OpenAgent orchestrator places Cloudflare in cooldown for 60 seconds and falls back to OpenRouter.

### 1.2 OpenRouter Free Models
- **Rate Limits:** Approximately 20 requests/minute on free models (tagged with `:free`).
- **Availability:** Upstream providers hosting free models on OpenRouter occasionally rotate or decommission specific models without notice. OpenAgent defaults to widely-available community models (`meta-llama/llama-3.3-70b-instruct:free`, `qwen/qwen-2.5-7b-instruct:free`).

### 1.3 Hugging Face Serverless Embedding Inference
- **Cold Starts:** Hugging Face serverless models (`BAAI/bge-small-en-v1.5`) go to sleep when dormant. Initial crawling or indexing requests may experience a 2–4 second cold start.
- **Monthly Limit:** ~30,000 embedding API requests/month on the free tier.
- **Handling:** Pre-computed embeddings are stored permanently in PostgreSQL `document_chunks`, so returning visitors never re-trigger embedding inference for existing knowledge.

---

## 2. Database & Hosting Constraints

### 2.1 Neon Serverless PostgreSQL
- **Storage Limit:** 0.5 GB on the free tier. The automated daily retention purge (`retention_purge`) is required to keep chat logs within this threshold.
- **Compute Autosuspension:** After 5 minutes of total inactivity, Neon suspends compute. The first request after suspension experiences an approximately 500ms cold resume latency.
- **Connection Cap:** Maximum 20 pooled connections. The API connection pool is strictly capped at `max: 5` to prevent pool exhaustion.

### 2.2 Render Web Service
- **Free Instance Sleep:** Render free web services spin down after 15 minutes of zero HTTP traffic. The initial cold start takes 30–50 seconds.
- **Mitigation:** The public widget loads the floating launcher button and cached branding immediately from client memory, masking backend wake-up times.

---

## 3. Security & Perimeter Considerations

### 3.1 Browser Origin Headers
- **Defense-in-Depth, Not Cryptographic Identity:** HTTP `Origin` and `Referer` headers can be omitted or spoofed by non-browser HTTP clients (e.g. cURL, custom Python scripts).
- **Architecture:** For this reason, origin allowlisting is treated as one layer in a defense-in-depth model alongside:
  - Salted IP rate limiting.
  - Per-site conversation quotas.
  - Complete denial of administrative operations via public keys (`pk_live_...`).

### 3.2 In-Memory Caching & Distributed Clustering
- **Single-Instance Caching:** The rate limiter and public site configuration cache use in-memory sliding windows within the Node.js process.
- **Horizontal Scaling:** When scaling horizontally across multiple container replicas, configure `REDIS_URL` to synchronize rate-limit buckets and cache invalidation across nodes.

---

## 4. Client Widget & Browser Compatibility

### 4.1 Browser Support
- **Supported:** Chrome 90+, Safari 14+, Firefox 88+, Edge 90+, Mobile Safari, Chrome for Android.
- **Unsupported:** Internet Explorer 11 and legacy pre-Chromium browsers (requires standard ES2022+ and Shadow DOM Custom Elements).

### 4.2 Web Server Proxy Buffering for SSE
- When deploying behind custom reverse proxies (e.g. Nginx, Cloudflare), response buffering must be disabled for `/api/v1/chat/stream` (`X-Accel-Buffering: no`) to prevent chunk buffering before browser delivery. OpenAgent emits the appropriate headers automatically.
