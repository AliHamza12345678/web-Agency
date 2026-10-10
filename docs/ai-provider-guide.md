# OpenAgent AI Inference Engine Guide

This document details the configuration, operations, credentials acquisition, and resilience architecture of the provider-independent AI inference engine (`@openagent/ai-provider`).

---

## 1. Architecture Overview

The OpenAgent inference engine isolates all conversational LLM interactions behind a provider-neutral orchestrator:

```
+-------------------------------------------------------------+
|                      OpenAgent API / Client                 |
|               (POST /api/v1/chat/stream or generate)        |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                       AIOrchestrator                        |
| - Administrator Kill-Switch (AI_DISABLED)                   |
| - Dynamic Fallback Policy (Primary -> Secondary)            |
| - Cooldown Tracking / Circuit Breaker (60s on 429 / Auth)   |
| - Honest Error Degradation (No Fake Replies)                |
+-------------------------------------------------------------+
         |                                 |                 |
         v                                 v                 v
+------------------+             +------------------+  +------------------+
| Cloudflare       |             | OpenRouter       |  | Ollama           |
| Workers AI       |             | Free Tier        |  | Local / Dev      |
| (10k Neurons/day)|             | (:free models)   |  | (100% Free)      |
+------------------+             +------------------+  +------------------+
```

### Key Principles
1. **Zero Secret Leakage**: API tokens and account IDs remain strictly server-side in environment variables and are never transmitted to browsers or the embeddable chat widget.
2. **Honest Degradation**: Under no circumstances does the engine fabricate fake assistant responses when quotas expire. It returns explicit, honest notices explaining service availability.
3. **Circuit Breaking**: When a provider encounters HTTP 429 (rate limit) or authentication rejection, it is placed in a 60-second cooldown to protect subsequent user requests from latency delays.
4. **Provider-Independence**: Switching providers or failover hierarchies requires zero changes to chatbot business logic or widget frontend code.

---

## 2. Supported Free & Zero-Cost Providers

### A. Cloudflare Workers AI (Primary Recommendation)
- **Free Quota**: 10,000 Neurons per day per Cloudflare account (~100-300 chat queries/day on 8B parameter models).
- **Default Chat Model**: `@cf/meta/llama-3.1-8b-instruct`
- **Default Embedding Model**: `@cf/baai/bge-base-en-v1.5`
- **Streaming**: Native Server-Sent Events (`stream: true`).

#### How to obtain free credentials:
1. Create a free account at [Cloudflare](https://dash.cloudflare.com/sign-up).
2. Navigate to **Workers & Pages** -> **Overview** on your dashboard.
3. Locate your **Account ID** in the right-hand sidebar.
4. Go to **My Profile** -> **API Tokens** -> **Create Token**.
5. Select the **Workers AI (Read/Write)** template, or assign the `Workers AI: Read` permission.
6. Copy the generated token into `CLOUDFLARE_API_TOKEN`.

---

### B. OpenRouter Free Tier (Automated Fallback)
- **Free Quota**: OpenRouter provides zero-cost access to models designated with `:free` suffixes (subject to account-level rate limits of ~20 RPM and 200 requests/day).
- **Recommended Free Models**:
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `google/gemini-2.0-flash-exp:free`
  - `deepseek/deepseek-r1:free`
- **Streaming**: Native SSE OpenAI-compatible streaming (`choices[0].delta.content`).

#### How to obtain free credentials:
1. Sign up at [OpenRouter.ai](https://openrouter.ai).
2. Navigate to [Keys Settings](https://openrouter.ai/settings/keys).
3. Click **Create Key**, name it `OpenAgent`, and set the credit limit to `0` (enforcing zero paid usage).
4. Copy the key (`sk-or-v1-...`) into `OPENROUTER_API_KEY`.

---

### C. Local Ollama (Self-Hosted / Offline Development)
- **Free Quota**: 100% Free, local hardware execution, unlimited inference.
- **Recommended Models**:
  - Chat: `llama3.2` or `mistral`
  - Embeddings: `nomic-embed-text`
- **Streaming**: NDJSON streaming over `/api/chat`.

#### How to run locally:
1. Download and install [Ollama](https://ollama.ai).
2. Pull the required models:
   ```bash
   ollama pull llama3.2
   ollama pull nomic-embed-text
   ```
3. Set `OLLAMA_BASE_URL="http://localhost:11434"` in your `.env`.

---

## 3. Configuration & Environment Variables

Add or modify the following variables in your server `.env` file:

```env
# -----------------------------------------------------------------------------
# AI INFERENCE ENGINE & ADAPTERS
# -----------------------------------------------------------------------------

# Primary and Fallback Selection: 'cloudflare' | 'openrouter' | 'ollama'
AI_PRIMARY_PROVIDER="cloudflare"
AI_PRIMARY_MODEL="@cf/meta/llama-3.1-8b-instruct"

AI_FALLBACK_PROVIDER="openrouter"
AI_FALLBACK_MODEL="meta-llama/llama-3.3-70b-instruct:free"

# Administrator Emergency Kill-Switch ('true' to instantly disable inference)
AI_DISABLED=false

# Operational Limits
AI_REQUEST_TIMEOUT_MS=25000
AI_MAX_OUTPUT_TOKENS=1024

# Cloudflare Workers AI Credentials
CLOUDFLARE_ACCOUNT_ID="your_cloudflare_account_id"
CLOUDFLARE_API_TOKEN="your_cloudflare_workers_ai_token"

# OpenRouter Credentials
OPENROUTER_API_KEY="sk-or-v1-your_openrouter_free_key"

# Ollama Local Development URL
OLLAMA_BASE_URL="http://localhost:11434"
```

---

## 4. Failure Handling & Circuit Breaker Logic

### 1. Pre-Stream Failover
If `AI_PRIMARY_PROVIDER` fails with:
- `429 Too Many Requests` (Quota exhausted)
- `401 Unauthorized` / `403 Forbidden` (Invalid API key)
- Network timeout / connection refusal

The engine:
1. Places the primary provider into a **60-second cooldown**.
2. Immediately triggers `AI_FALLBACK_PROVIDER` without dropping the visitor's request.
3. Subsequent requests within the 60-second window bypass the failing provider directly, avoiding latency.

### 2. Mid-Stream Interruption
If a network disconnect occurs *after* tokens have already been streamed to the user's browser, the orchestrator does **not** splice in a second provider mid-sentence. Instead, it emits:
```
data: {"text":"\n\n*[Connection interrupted. Please refresh or retry.]*"}
data: [DONE]
```
This prevents hallucinated or conflicting model styles.

### 3. Exhaustion & Honest Degradation
If all configured providers fail or are in cooldown, the orchestrator throws `ProviderUnavailableError`. The streaming endpoint outputs:
```
data: {"text":"\n\n*Our conversational assistant is currently experiencing high volume. Please try again in a few moments or contact support directly.*"}
data: [DONE]
```
No dummy answers, fake AI hallucination, or dummy success payloads are ever generated.

---

## 5. Quota Monitoring & Provider Health

To inspect provider health programmatically:

```typescript
import { createDefaultOrchestrator } from '@openagent/ai-provider';

const orchestrator = createDefaultOrchestrator();
const healthReport = await orchestrator.getHealthReport();
console.log(healthReport);
```

Sample output:
```json
{
  "cloudflare": {
    "provider": "cloudflare",
    "healthy": true,
    "lastChecked": "2026-10-10T17:45:00.000Z",
    "inCooldown": false
  },
  "openrouter": {
    "provider": "openrouter",
    "healthy": false,
    "lastChecked": "2026-10-10T17:45:00.000Z",
    "error": "HTTP 429: Account free quota exceeded",
    "inCooldown": true,
    "cooldownUntil": "2026-10-10T17:46:00.000Z"
  }
}
```

---

## 6. How to Switch Providers Without Modifying Code

To switch from Cloudflare to OpenRouter or local Ollama:
1. Change `AI_PRIMARY_PROVIDER` in `.env` (e.g. `AI_PRIMARY_PROVIDER="ollama"`).
2. Set `AI_PRIMARY_MODEL="llama3.2"`.
3. Restart or reload the server.
4. The chatbot business logic, streaming SSE routes, and website widget require **zero modifications**.
