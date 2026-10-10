# OpenAgent Chat: System Architecture

## 1. Executive Summary & Architectural Goals
OpenAgent Chat is a production-oriented, multi-tenant AI conversational platform designed to be embedded into any web property via a lightweight (< 35 KB gzipped), non-intrusive JavaScript snippet. The system delivers contextual, multilingual, grounded answers derived strictly from tenant-specific knowledge bases and authorized tool actions, without hallucinating, leaking cross-tenant data, or exposing backend credentials.

### Primary Objectives
- **Strict Multi-Tenancy**: Complete logical and data isolation per Tenant (Account/Organization) and Site (Web Property).
- **Zero-Dependency Host Widget**: Shadow DOM-isolated custom element that prevents CSS bleed, avoids JavaScript namespace collisions, and executes smoothly across modern browsers.
- **Provider-Agnostic AI Engine**: Clean abstraction layer supporting free-tier providers (Google Gemini, Groq, Mistral) and enterprise providers (OpenAI, Anthropic, local Ollama) with seamless fallback.
- **Retrieval-Augmented Generation (RAG)**: Site-scoped vector embeddings and keyword search backed by PostgreSQL with `pgvector`.
- **Zero Mock Policy**: Production-ready code paths without fake chatbot responses, stubbed integrations, or simulated success states.
- **Security-First Stance**: Server-side credential isolation, allowed-origin enforcement, prompt injection hardening, and strict rate limiting.

---

## 2. System Architecture & Component Diagram

```mermaid
graph TB
    subgraph HostWebsite ["Host Website (Any Framework / Vanilla HTML)"]
        HostDOM["Host Page DOM"]
        EmbedScript["&lt;script src='.../widget.js' data-site-id='...'&gt;"]
        ShadowRoot["Shadow DOM (&lt;openagent-chat&gt;)"]
        HostDOM --> EmbedScript
        EmbedScript --> ShadowRoot
    end

    subgraph EdgeCDN ["Edge CDN / Asset Distribution"]
        WidgetBundle["widget.js (Preact/Vanilla bundle <35KB)"]
    end
    EmbedScript -.->|Fetches Bundle| WidgetBundle

    subgraph APIPlane ["OpenAgent API & Orchestration Server"]
        Gateway["API Gateway / Middleware (CORS, Rate Limit, Site Auth)"]
        PublicChatAPI["/api/v1/chat/stream (SSE)"]
        PublicConfigAPI["/api/v1/site/config"]
        AdminAPI["/api/v1/admin/* (JWT/Session Auth)"]
        IngestionAPI["/api/v1/ingestion/*"]
        
        Gateway --> PublicChatAPI
        Gateway --> PublicConfigAPI
        Gateway --> AdminAPI
        Gateway --> IngestionAPI
    end

    ShadowRoot -->|GET /site/config| PublicConfigAPI
    ShadowRoot -->|POST /chat/stream (SSE)| PublicChatAPI

    subgraph AIOrchestrator ["AI Orchestration & RAG Pipeline"]
        PromptEngine["Multilingual Context & Prompt Builder"]
        Guardrails["Input & Output Guardrails / Sanitizer"]
        ProviderAdapter["LLM Provider Abstraction Layer"]
        RAGEngine["Hybrid RAG Engine (Vector + BM25 Filter)"]

        PublicChatAPI --> Guardrails
        Guardrails --> PromptEngine
        PromptEngine --> RAGEngine
        RAGEngine --> ProviderAdapter
    end

    subgraph DataStore ["Data Storage (PostgreSQL + pgvector)"]
        TenantDB[(PostgreSQL)]
        subgraph Tables ["Isolated Schemas / Tables"]
            TenantsTbl["tenants"]
            SitesTbl["sites (allowed_origins, system_prompt, settings)"]
            DocsTbl["documents & document_chunks (site_id, embedding)"]
            ConvsTbl["conversations & messages (site_id, visitor_id)"]
        end
        TenantDB --- Tables
    end

    RAGEngine -->|Vector Search WHERE site_id = ?| DocsTbl
    PublicChatAPI -->|Persist History WHERE site_id = ?| ConvsTbl
    AdminAPI -->|Manage| SitesTbl

    subgraph ExternalProviders ["AI Service Providers (Free & Enterprise)"]
        Gemini["Google Gemini (1.5 / 2.0 Flash)"]
        Groq["Groq Cloud (Llama 3.3 70B)"]
        OpenAI["OpenAI / Custom Compatible"]
        EmbeddingAPI["Gemini Embedding / BGE / HuggingFace"]
    end

    ProviderAdapter --> Gemini
    ProviderAdapter --> Groq
    ProviderAdapter --> OpenAI
    RAGEngine --> EmbeddingAPI
```

---

## 3. Monorepo Structure & Module Boundaries

The project is organized as a lightweight, clean TypeScript monorepo using `pnpm` workspaces:

```
robotic-agent/
├── apps/
│   ├── api/                   # Core REST + SSE streaming API & ingestion server
│   │   ├── src/
│   │   │   ├── routes/        # Public chat routes & protected admin routes
│   │   │   ├── middleware/    # Origin validation, rate limiters, auth guards
│   │   │   ├── services/      # Ingestion, RAG, conversation services
│   │   │   └── server.ts      # Server bootstrap
│   │   └── package.json
│   ├── web/                   # Admin dashboard (Next.js / Vite SPA)
│   │   ├── src/               # Site management, knowledge curation, live playground
│   │   └── package.json
│   └── widget/                # Standalone embeddable chat script
│       ├── src/
│       │   ├── component/     # Shadow DOM root, chat UI, bubble trigger
│       │   ├── stream/        # SSE streaming client & markdown parser
│       │   ├── styles/        # Scoped CSS (injected into Shadow DOM)
│       │   └── index.ts       # Self-executing initialization entry
│       ├── tsup.config.ts     # Single-file bundle generator (<35KB target)
│       └── package.json
├── packages/
│   ├── core/                  # Shared domain types, constants, validation schemas (Zod)
│   ├── db/                    # Drizzle ORM schema, migrations, connection pool
│   └── ai-provider/           # LLM & Embedding provider abstractions and adapters
├── docs/                      # Architectural specifications & guides
├── .env.example
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── turbo.json (optional) / pnpm scripts
```

---

## 4. Multi-Tenant Data Model & Isolation Strategy

Every piece of persistent data belongs to a **Tenant** and a specific **Site**.

### Schema Design & Strict Scoping
1. **`tenants`**: Represents the billing account or parent organization.
2. **`sites`**: Represents an individual website where the widget is installed.
   - `id`: UUID (Primary Key).
   - `tenant_id`: UUID (Foreign Key to tenants).
   - `public_key`: Unique string (`pk_live_...`) for widget initialization.
   - `allowed_origins`: Array of strings (`["https://example.com", "https://*.example.com"]`).
   - `branding`: JSON (`{ primaryColor, logoUrl, botName, welcomeMessage, language }`).
   - `system_prompt`: Custom site-specific behavioral prompt.
   - `retention_days`: Integer (retention period for chat logs).
3. **`documents` & `document_chunks`**:
   - `document_chunks.site_id`: Indexed foreign key.
   - `document_chunks.embedding`: `vector(768)` or `vector(1536)` with HNSW index.
   - **Critical Isolation Rule**: Every vector similarity query **MUST** include `WHERE site_id = :siteId`. Vector indexing uses partial indexing or compound filtering so cross-tenant chunks are never searched.
4. **`conversations` & `messages`**:
   - `conversations.site_id`: Indexed foreign key.
   - `conversations.visitor_id`: Anonymized client session token (UUID stored in visitor localStorage).
   - `messages.role`: `'visitor' | 'assistant' | 'system'`.

---

## 5. Embeddable Widget Architecture

### Non-Intrusive Embedding Principles
1. **Isolated Shadow DOM**: All UI elements (chat bubble, window, messages, inputs) are rendered inside an `open` Shadow Root. This guarantees:
   - Host website CSS cannot break the chat widget styles.
   - Widget CSS cannot alter the host website layout.
2. **Self-Bootstrapping Script**:
   ```html
   <script
     src="https://cdn.openagent.chat/widget.js"
     data-site-id="site_abc123"
     defer>
   </script>
   ```
3. **Lifecycle**:
   - Script runs upon execution, reads `currentScript.getAttribute('data-site-id')`.
   - Sends `GET /api/v1/site/config?siteId=...` to load public branding and welcome strings.
   - Verifies `document.location.origin` with server response.
   - Mounts `<openagent-chat>` custom element to the host DOM.
4. **Bundle Budget**: Maximum 35 KB gzipped. Built using Preact or vanilla Web Components with zero heavy external UI libraries.

---

## 6. AI Orchestration & RAG Pipeline

### Step-by-Step Flow:
1. **Visitor Query**: Visitor sends message via SSE-enabled POST `/api/v1/chat/stream`.
2. **Origin & Rate Guard**: Middleware validates request Origin matches Site's `allowed_origins`, and visitor has not exceeded rate limits (e.g. 15 requests/min).
3. **Context Retrieval**:
   - Query is embedded using the configured embedding provider.
   - Database executes cosine similarity search filtered strictly by `site_id`:
     ```sql
     SELECT content, url, title, 1 - (embedding <=> :queryEmbedding) AS similarity
     FROM document_chunks
     WHERE site_id = :siteId
     ORDER BY embedding <=> :queryEmbedding
     LIMIT 5;
     ```
4. **Prompt Assembly**:
   - System prompt incorporates site persona, language instructions, and retrieved context chunks.
   - Enforces strict grounding: *"If the answer cannot be found in the provided site context, politely state you do not know and advise contacting site support."*
5. **Streaming Generation**:
   - Streams text tokens to the client over Server-Sent Events (SSE).
   - Emits structured metadata (citations/sources) in the final frame.
6. **Persistence**:
   - Visitor message and assistant response are asynchronously saved to `messages` under the site's conversation thread.

---

## 7. Technology Stack & Rationale

| Layer | Selected Technology | Technical Rationale |
|---|---|---|
| **Language** | TypeScript (Node 22+) | End-to-end type safety, modern syntax, single codebase across widget, backend, and core. |
| **Package Manager** | `pnpm` | Fast, deterministic disk-efficient workspace management. |
| **Backend Framework** | Hono / Fastify (Node.js) | Minimal overhead, native Web Standards support, first-class SSE streaming performance, and low cold-start latency. |
| **Database & ORM** | PostgreSQL + Drizzle ORM | Native SQL performance, lightweight migrations, built-in type-safe vector queries via `pgvector`. |
| **Database Provider (Free)** | Neon Serverless Postgres | 0.5 GB free storage, built-in `pgvector`, branching, connection pooling over HTTP/WebSockets. |
| **Widget Bundle** | Preact + Vite/tsup | React-compatible API with ~4 KB runtime footprint, fast reactivity, Shadow DOM compatibility. |
| **LLM Interface** | Standardized Provider Adapter | Decouples business logic from proprietary SDKs. Primary free drivers: Gemini 1.5/2.0 Flash & Groq. |
| **Testing** | Vitest + Playwright | Blazing fast unit tests and robust cross-browser E2E testing for Shadow DOM components. |
