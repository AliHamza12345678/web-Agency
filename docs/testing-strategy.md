# OpenAgent Chat: Testing & Quality Assurance Strategy

## 1. Testing Philosophy
To ensure production readiness, OpenAgent Chat enforces a **Zero Mock Production / Strict Real Verification** testing approach:
- Never fabricate test outcomes.
- Unit tests run with deterministic mocks for network boundaries, while integration and E2E tests validate real database and browser lifecycle behaviors.
- Each phase of implementation has explicit, automated test criteria that must pass before progression.

---

## 2. Test Pyramid & Tooling

```
      / \
     / E2E \       Playwright: Widget embedding, Shadow DOM isolation, Admin UI
    /-------\
   / Integr. \     Hono/Supertest + PostgreSQL (Drizzle) + Real Vector Cosine Search
  /-----------\
 /    Unit     \   Vitest: Core schemas, chunking, prompt builder, rate limiting
/---------------\
```

| Level | Tool | Scope | Target Pass Rate |
|---|---|---|---|
| **Unit** | `vitest` | Schema validations (Zod), text chunkers, rate-limiting windows, SSE parser, prompt assemblers | 100% |
| **Integration** | `vitest` + Test DB | API route handlers, Drizzle ORM queries, multi-tenant isolation verification, pgvector operations | 100% |
| **E2E / Browser** | `playwright` | Widget script injection into arbitrary HTML host pages, Shadow DOM styling integrity, live chat interaction | 100% |
| **Security Audit** | Custom test suites | Cross-tenant query penetration, prompt injection fuzzing, unauthorized CORS rejection | 100% |

---

## 3. Specific Test Suites

### 3.1. Tenant Isolation Test Suite (`tests/integration/isolation.test.ts`)
Validates that tenant data leakage is physically impossible at the database and query layer:
1. Seed Tenant A with Site A and knowledge documents (`"Alpha secret internal policy"`).
2. Seed Tenant B with Site B and knowledge documents (`"Beta public information"`).
3. Execute similarity search on Site B using query `"Alpha secret"`.
4. **Assertion**: Result must return **0 records** matching Site A's documents, with zero cross-tenant contamination.
5. Attempt to read conversation ID of Site A with session token generated for Site B.
6. **Assertion**: API responds with HTTP 404 / 403.

### 3.2. Widget Isolation & Shadow DOM Suite (`tests/e2e/widget.spec.ts`)
Validates non-intrusive embedding on host sites:
1. Create a dummy HTML host page with aggressive global CSS:
   ```css
   * { font-size: 80px !important; color: hotpink !important; margin: 50px !important; }
   ```
2. Inject `<script src="/dist/widget.js" data-site-id="test-site"></script>`.
3. Launch via Playwright.
4. **Assertions**:
   - Widget bubble and window compute their own font-size and color inside the Shadow Root.
   - Host page layout is unaffected by widget presence.
   - Host `document.querySelectorAll('input')` does NOT select the widget's internal chat input.

### 3.3. Provider Abstraction & Fallback Suite (`tests/unit/provider-failover.test.ts`)
Validates multi-provider failover without fake completions:
1. Configure primary provider to simulate HTTP 429 (Rate Limit Exceeded).
2. Trigger chat generation request.
3. **Assertions**:
   - Secondary provider is engaged within < 100ms.
   - Circuit breaker marks primary provider in cooldown for 60s.
   - When all providers simulate 429, API returns an honest system busy message instead of a fake AI reply.

### 3.4. RAG Ingestion & Chunking Suite (`tests/unit/chunking.test.ts`)
Validates document processing:
1. Feed 10,000-character markdown document.
2. Verify chunks do not split in the middle of sentences or code blocks.
3. Verify chunk overlap (e.g. 50 characters) preserves contextual continuity.

---

## 4. Verification Commands

| Command | Purpose |
|---|---|
| `pnpm test` | Run all unit tests across monorepo packages |
| `pnpm test:integration` | Run integration tests against test PostgreSQL instance |
| `pnpm test:e2e` | Run Playwright browser tests for widget and dashboard |
| `pnpm lint` | Run ESLint and type checking across all packages |
| `pnpm build` | Verify zero TypeScript compiler errors and bundle size compliance |
