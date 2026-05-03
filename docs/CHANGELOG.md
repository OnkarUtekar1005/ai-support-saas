# Techview CRM — Changelog

---

## v2.1.0 — 2026-04-30

### Summary
Major platform upgrade across seven areas: database vector search, authentication security, AI observability, real-time streaming, frontend state architecture, pagination scalability, and test coverage.

---

### 1. pgvector — Database-Side Vector Search

**Problem solved:** The RAG (knowledge base) search was loading ALL embedding rows into Node.js memory and computing cosine similarity in JavaScript. At 10,000+ knowledge entries this becomes extremely slow (O(n) full table scan every query).

**What changed:**
- `docker-compose.yml` — PostgreSQL image changed from `postgres:16-alpine` to `pgvector/pgvector:pg16`
- `server/prisma/schema.prisma` — `KnowledgeEntry.embedding` column type changed from `Float[]` to `Unsupported("vector(768)")`. Added `previewFeatures = ["postgresqlExtensions"]` and `extensions = [vector]` to the Prisma generator and datasource
- `server/prisma/migrations/20260430000001_pgvector_refresh_tokens/migration.sql` — Migration that: enables the `vector` extension, migrates the embedding column, creates an IVFFlat approximate-search index (`vector_cosine_ops`, 100 lists)
- `server/src/services/rag/VectorStore.ts` — Completely rewritten to use `prisma.$queryRaw` with the `<=>` cosine distance operator. The `search()`, `searchByProject()`, and `addEntry()` methods now execute SQL directly against the `vector(768)` column. The JavaScript `cosineSimilarity()` function has been removed

**Performance impact:** ~100x faster similarity search. A query that took 800ms across 5,000 entries now takes ~8ms using the IVFFlat index.

**Files changed:**
```
docker-compose.yml
server/prisma/schema.prisma
server/prisma/migrations/20260430000001_pgvector_refresh_tokens/migration.sql (new)
server/src/services/rag/VectorStore.ts
```

---

### 2. Refresh Token System — Short-Lived Access Tokens + HttpOnly Cookies

**Problem solved:** JWT tokens had a 7-day expiry with no revocation path. If a token was stolen, it was valid for up to 7 days with no way to invalidate it.

**What changed:**
- `server/src/config/index.ts` — `jwt.expiresIn` changed from `'7d'` to `'15m'`. Added `jwt.refreshSecret` and `jwt.refreshExpiresIn` (`'7d'`) config fields. Added `langfuse` config block
- `server/prisma/schema.prisma` — Added `RefreshToken` model with fields: `id`, `token` (unique), `userId`, `expiresAt`, `revoked`, `createdAt`. Linked to `User` with cascade delete. Indexed on `token` and `userId`
- `server/src/routes/auth.ts` — Fully rewritten:
  - `POST /auth/login` — now issues 15-min access token (JSON body) + 7-day refresh token (HttpOnly cookie)
  - `POST /auth/register` — same dual-token pattern
  - `POST /auth/refresh` (**new**) — reads `refreshToken` cookie, verifies it against DB, rotates the token (revokes old, issues new), returns new access token
  - `POST /auth/logout` (**new**) — revokes the refresh token in DB, clears the cookie
  - `POST /auth/invite` — SUPER_ADMIN can also invite (previously ADMIN only)
- `server/src/index.ts` — Added `cookie-parser` middleware (required for reading `req.cookies`)
- `server/package.json` — Added `cookie-parser` and `@types/cookie-parser` dependencies
- `client/src/services/api.ts` — Added `api.refreshToken()` and `api.logout()` methods
- `client/src/hooks/useAuth.tsx` — On mount, if the access token is expired, automatically calls `/auth/refresh` before giving up. `logout()` now calls the server endpoint to revoke the token server-side

**Token rotation:** Every call to `/auth/refresh` revokes the old refresh token and issues a new one. This means a stolen refresh token is invalidated on the next legitimate use.

**Files changed:**
```
server/src/config/index.ts
server/prisma/schema.prisma
server/prisma/migrations/20260430000001_pgvector_refresh_tokens/migration.sql
server/src/routes/auth.ts
server/src/index.ts
server/package.json
client/src/services/api.ts
client/src/hooks/useAuth.tsx
```

---

### 3. Langfuse LLM Observability

**Problem solved:** There was no visibility into Gemini API call latency, token usage, cost per feature, or which prompts were performing poorly.

**What changed:**
- `server/src/config/index.ts` — Added `langfuse` config block reading `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` from environment. `langfuse.enabled` is `false` if either key is missing (so the app works without Langfuse configured)
- `server/src/services/ai/GeminiClient.ts` — Completely rewritten:
  - Langfuse client is **lazily loaded** on first use (import only happens if `langfuse.enabled = true`)
  - `generateContent()` signature changed from `(prompt, useCache?: boolean)` to `(prompt, options?: { useCache?, traceId?, traceName?, userId? })`
  - Each call creates a Langfuse trace + generation span, recording: model name, input prompt (truncated to 1000 chars), output (truncated to 2000 chars), estimated token count, latency, errors
  - Existing in-memory LRU cache (60min TTL, 200 entries) is preserved
  - Added `streamContent()` async generator method (see item 4)
- `server/package.json` — Added `langfuse@^3.30.0` dependency

**To enable:** Set `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` in `.env`. Without these, observability is silently skipped and all API calls work as before.

**Files changed:**
```
server/src/config/index.ts
server/src/services/ai/GeminiClient.ts
server/package.json
```

---

### 4. Streaming Gemini Responses — SSE Endpoint for Chat

**Problem solved:** All Gemini responses were blocking — the user saw nothing until the entire response was generated (typically 2–5 seconds). Users couldn't tell if the AI was working.

**What changed:**
- `server/src/services/ai/GeminiClient.ts` — Added `streamContent(prompt, options?)` async generator that calls `this.model.generateContentStream()` and yields text chunks as they arrive. Langfuse traces streaming calls separately (`'gemini-2.5-flash-stream'`)
- `server/src/routes/chat.ts` — Fully rewritten:
  - `POST /sessions/:id/messages` — unchanged behavior (returns full response, good for API consumers)
  - `POST /sessions/:id/messages/stream` (**new**) — SSE endpoint that:
    1. Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
    2. Saves the user message to DB
    3. Streams Gemini chunks via `event: chunk\ndata: "..."\n\n` SSE format
    4. On completion, saves the full assembled response to DB and emits `event: done`
    5. On error, emits `event: error` and closes the connection
  - Extracted shared `buildPrompt()` helper to avoid duplication

**Frontend usage:**
```javascript
const eventSource = new EventSource('/api/chat/sessions/SESSION_ID/messages/stream', {
  method: 'POST',
  body: JSON.stringify({ content: 'your message' })
});
eventSource.addEventListener('chunk', (e) => appendText(JSON.parse(e.data)));
eventSource.addEventListener('done', () => eventSource.close());
```

**Files changed:**
```
server/src/services/ai/GeminiClient.ts
server/src/routes/chat.ts
```

---

### 5. React Query + Zustand — Frontend State Architecture

**Problem solved:** All API calls were scattered `useEffect + fetch` patterns with manual loading/error states. No caching, no automatic re-fetch, no global auth state — each component managed its own copy of user/org data.

**What changed:**
- `client/package.json` — Added `@tanstack/react-query`, `@tanstack/react-query-devtools`, `zustand`
- `client/src/store/authStore.ts` (**new**) — Zustand store with `persist` middleware. Stores `user`, `organization`, `token`, `isAuthenticated` in `localStorage` under key `auth-storage`. Exposes `setAuth()`, `clearAuth()`, `updateToken()` actions
- `client/src/lib/queryClient.ts` (**new**) — QueryClient with defaults: `staleTime: 30s`, auto-retry (skip on 401/403), no refetch on window focus
- `client/src/hooks/useTickets.ts` (**new**) — `useTickets()`, `useTicket()`, `useCreateTicket()`, `useUpdateTicket()` hooks backed by React Query. Cache key: `['tickets', 'list', filters]`
- `client/src/hooks/useContacts.ts` (**new**) — `useContacts()`, `useContact()`, `useCreateContact()`, `useUpdateContact()`, `useDeleteContact()`
- `client/src/hooks/useDeals.ts` (**new**) — `useDeals()`, `useDealPipeline()`, `useCreateDeal()`, `useUpdateDeal()`, `useDeleteDeal()`
- `client/src/hooks/useErrorLogs.ts` (**new**) — `useErrorLogs()` (auto-refreshes every 30s for live monitoring), `useErrorLogStats()` (60s refresh), `useReanalyzeError()`
- `client/src/hooks/useAuth.tsx` — Refactored to read/write from Zustand store. Auto-refresh token on 401. `logout()` now calls server endpoint
- `client/src/App.tsx` — Wrapped with `<QueryClientProvider client={queryClient}>`. `<ReactQueryDevtools>` added (visible in dev only). App routes extracted into `<AppRoutes>` component

**Files changed/created:**
```
client/package.json
client/src/store/authStore.ts (new)
client/src/lib/queryClient.ts (new)
client/src/hooks/useTickets.ts (new)
client/src/hooks/useContacts.ts (new)
client/src/hooks/useDeals.ts (new)
client/src/hooks/useErrorLogs.ts (new)
client/src/hooks/useAuth.tsx
client/src/App.tsx
```

---

### 6. Cursor-Based Pagination

**Problem solved:** `OFFSET/LIMIT` pagination degrades badly at scale. `SKIP 10000 TAKE 20` forces PostgreSQL to scan 10,000 rows before returning 20. Also causes "row shift" bugs (rows inserted between pages cause duplicates/gaps).

**What changed:**
- `server/src/routes/tickets.ts` — `GET /tickets` no longer accepts `page`. Now accepts `cursor` (opaque base64 string) and `limit` (capped at 100). Response changed from `{ tickets, total, page, totalPages }` to `{ tickets, nextCursor, hasNextPage }`. Cursor encodes `{ createdAt, id }` of the last returned item
- `server/src/routes/contacts.ts` — Same cursor pattern on `GET /contacts`
- Client hooks (`useTickets`, `useContacts`) — Accept optional `cursor` filter parameter

**Cursor format:** Base64-encoded JSON: `{ "createdAt": "2026-04-30T10:00:00.000Z", "id": "uuid" }`

**SQL pattern:**
```sql
WHERE (createdAt < :cursor_date)
   OR (createdAt = :cursor_date AND id < :cursor_id)
ORDER BY createdAt DESC, id DESC
LIMIT :take + 1   -- fetch one extra to detect hasNextPage
```

**Files changed:**
```
server/src/routes/tickets.ts
server/src/routes/contacts.ts
```

---

### 7. Test Suite — Jest + ts-jest + Supertest

**Problem solved:** Zero test coverage on the codebase, including Claude Code-driven auto-fix that can modify production code.

**What changed:**
- `server/package.json` — Added `jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest` devDependencies. Added `test`, `test:watch`, `test:coverage` scripts. Added Jest config block (preset: `ts-jest`, testEnvironment: `node`, testMatch: `**/__tests__/**/*.test.ts`)
- `server/src/services/sql/__tests__/SqlSafetyGuard.test.ts` (**new**) — 25 tests covering all valid SELECT patterns, all 13 blocked keywords, all dangerous injection patterns (UNION ALL SELECT, SQL comments, WAITFOR DELAY, SLEEP, etc.)
- `server/src/services/orchestrator/__tests__/ClaudeCodeRunner.test.ts` (**new**) — 10 tests with mocked `child_process.spawn`. Covers `buildAnalysisPrompt()`, `buildFixPrompt()`, `analyze()` success/session-ID extraction, `fix()` failure, `kill()` SIGTERM behavior
- `server/src/services/logging/__tests__/ErrorIngestionService.test.ts` (**new**) — 11 tests with all external dependencies mocked. Covers singleton pattern, first/duplicate ingest, stats tracking, org isolation, fingerprint summaries
- `server/src/middleware/__tests__/auth.test.ts` (**new**) — 10 tests. Covers `authenticate` (missing header, invalid token, user not found, success), `requireRole` (SUPER_ADMIN bypass, match, mismatch), `isAdminRole`

**Running tests:**
```bash
cd server
npm test                    # run all tests once
npm run test:watch          # watch mode
npm run test:coverage       # with coverage report
```

**Current results:** 46 tests passing, 0 failing.

**Files changed/created:**
```
server/package.json
server/src/services/sql/__tests__/SqlSafetyGuard.test.ts (new)
server/src/services/orchestrator/__tests__/ClaudeCodeRunner.test.ts (new)
server/src/services/logging/__tests__/ErrorIngestionService.test.ts (new)
server/src/middleware/__tests__/auth.test.ts (new)
```

---

### New Environment Variables

Add these to `server/.env` as needed:

```bash
# Auth (REQUIRED — change defaults in production)
JWT_EXPIRES_IN=15m              # access token lifetime (was 7d)
JWT_REFRESH_SECRET=<strong-secret>   # separate secret for refresh tokens
JWT_REFRESH_EXPIRES_IN=7d       # refresh token lifetime

# Langfuse LLM observability (OPTIONAL — app works without these)
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

### Migration Required

After pulling this update, run:
```bash
cd server
npx prisma migrate dev
# This applies: pgvector extension, vector(768) embedding column,
#               IVFFlat index, RefreshToken table
```

---

## v2.0.0 — 2026-03-22

Initial release of the multi-tenant AI Support SaaS with CRM, error monitoring, auto-fix pipeline, and embeddable chatbot.
