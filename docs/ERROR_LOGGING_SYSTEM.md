# CRM of Techview — Error Logging System

**Version:** 2.1.0
**Last Updated:** 2026-04-30

Complete documentation of how errors are currently captured, analyzed, and acted upon — plus a detailed improvement plan for batch processing, noise reduction, and fix tracking.

---

## Table of Contents

1. [How the Current System Works](#1-how-the-current-system-works)
2. [Entry Points — How Errors Enter](#2-entry-points--how-errors-enter)
3. [The Ingestion Pipeline (Step by Step)](#3-the-ingestion-pipeline-step-by-step)
4. [What IS and IS NOT Stored in the Database](#4-what-is-and-is-not-stored-in-the-database)
5. [Error Deduplication — Fingerprinting](#5-error-deduplication--fingerprinting)
6. [Connecting Your Application](#6-connecting-your-application)
7. [CRM Admin Actions](#7-crm-admin-actions)
8. [Error Categories](#8-error-categories)
9. [Improvement Plan](#9-improvement-plan)
   - [9.1 Batch Processing](#91-batch-processing)
   - [9.2 Smart Noise Reduction](#92-smart-noise-reduction)
   - [9.3 Fix Tracking — Who Fixed It, When, and How](#93-fix-tracking--who-fixed-it-when-and-how)
   - [9.4 Error Lifecycle States](#94-error-lifecycle-states)
   - [9.5 Implementation Roadmap](#95-implementation-roadmap)

---

## 1. How the Current System Works

```
Your App (any platform / language)
         │
         │  POST /api/sdk/errors  (with API key)
         │  OR  window.onerror captured by SDK script
         │  OR  internal CRM route throws an exception
         ▼
┌────────────────────────────────────────────┐
│  ErrorLogger.logError()                    │
│                                            │
│  1. Winston → logs/error.log (immediate)   │
│  2. ErrorIngestionService.ingest()         │
│      ├─ SHA256 fingerprint (dedup key)     │
│      ├─ Circular buffer (memory, 2000)     │
│      ├─ Daily rotating log file (disk)     │
│      └─ Async: Gemini analysis + email     │
└────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│  CRM Dashboard — Error Logs Page           │
│  ┌──────────────────────────────────────┐  │
│  │  Reads from: in-memory buffer        │  │
│  │  Filters: level, category, project   │  │
│  │  Actions: Re-analyze, Auto-Fix       │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**Key architectural fact:** Errors are stored in **memory + log files only**. There is NO database write for error logs. The `ErrorLog` table in the Prisma schema exists but is not currently used by the main ingestion path. This means:
- Fast ingestion (no DB round-trip on every error)
- Errors survive application restarts only via log file rebuild (`rebuildFromLogs()` on startup reads today's log file back into memory)
- Memory cap: 2,000 errors in the circular buffer per server instance
- Dashboard shows data from the in-memory buffer, not from a database query

---

## 2. Entry Points — How Errors Enter

### Entry Point 1: External Apps via REST API (API Key Auth)

Any app in any language sends errors via HTTP:

```
POST /api/sdk/errors
Headers: { x-api-key: sk_live_YOUR_KEY }
Body:
{
  "level":    "ERROR",
  "message":  "TypeError: Cannot read properties of null (reading 'userId')",
  "stack":    "TypeError: Cannot read...\n    at checkout.js:42:5",
  "source":   "checkout-service",
  "endpoint": "POST /api/checkout",
  "language": "javascript",
  "framework": "express",
  "environment": "production"
}
```

**Auth flow:**
1. `apiKeyAuth` middleware reads `x-api-key` header
2. Looks up key in DB → extracts `organizationId` and `projectId`
3. Verifies key has `errors` permission and origin is allowed
4. Calls `ErrorLogger.logError()` with the extracted org/project context

### Entry Point 2: Auto-Captured Frontend Errors (SDK Script)

Add one line to any website:
```html
<script src="https://your-crm.com/sdk.js?key=sk_live_YOUR_KEY"></script>
```

The SDK automatically captures:
- `window.onerror` — all uncaught JavaScript errors
- `window.unhandledrejection` — unhandled Promise rejections
- Sends via `navigator.sendBeacon()` (non-blocking, survives page unload)

No additional code needed.

### Entry Point 3: CRM Internal Errors (JWT Auth)

When the CRM itself throws an unhandled error in a route:
```typescript
// In any route file (tickets.ts, chat.ts, deals.ts, etc.)
} catch (err) {
  await ErrorLogger.logError({
    level: 'ERROR',
    message: (err as Error).message,
    stack: (err as Error).stack,
    source: 'tickets-create',
    endpoint: 'POST /api/tickets',
    organizationId: req.user!.organizationId,
    userId: req.user!.id,
  });
  res.status(500).json({ error: 'Failed to create ticket' });
}
```

---

## 3. The Ingestion Pipeline (Step by Step)

### Step 1: Winston File Logging (Immediate, Synchronous)

```
logs/error.log      ← ERROR and FATAL level only
logs/combined.log   ← all levels (INFO, WARN, ERROR, FATAL)
Console             ← in development only
```

This happens synchronously before anything else. Even if everything else fails (memory full, Gemini down, network issue), the error is on disk.

### Step 2: Fingerprint Generation

```typescript
const fingerprint = SHA256(message + source + (first 5 lines of stack))
// Example: "a3f7b1c2d4e5..."
```

The fingerprint is the **unique identity of an error type** — not of a specific occurrence. Two different requests hitting the same null-reference bug in the same function will have the same fingerprint. This enables:
- Deduplication (count occurrences instead of creating duplicate records)
- Regression detection (same error fingerprint appearing again after a fix)

### Step 3: In-Memory Deduplication

```
Is this fingerprint already in the cache?
  YES → increment count, update lastSeen timestamp → done (no Gemini call)
  NO  → add to cache, add to circular buffer, trigger async analysis
```

The fingerprint cache is a `Map<fingerprint, FingerprintEntry>` stored in the singleton `ErrorIngestionService`. It persists for the lifetime of the server process.

### Step 4: Circular Buffer

A fixed-size circular buffer (2,000 entries) stores the recent error entries per server. When it's full, the oldest entry is dropped. This is what powers the dashboard's "Recent Errors" view.

**Limitation:** On server restart, the buffer is rebuilt by reading today's log file. Errors older than today are not loaded back.

### Step 5: Daily Rotating Log File

```
logs/errors/{organizationId}/{YYYY-MM-DD}.jsonl
```

Each line is a JSON-encoded error entry. The file rotates daily. This provides a persistent record beyond the in-memory buffer.

### Step 6: Async Gemini Analysis (only for new fingerprints, ERROR/FATAL only)

```typescript
// Fires only when isNew === true AND level is ERROR or FATAL
if (isNew && (level === 'ERROR' || level === 'FATAL')) {
  this.analyzeNewError(fp, input).catch(() => {});
}
```

Gemini receives: error message, stack trace, source, and endpoint. Returns:
```json
{
  "rootCause": "The user.id property is accessed before authentication middleware runs...",
  "suggestion": "Move the auth middleware before the route handler...",
  "category": "code"
}
```

The fingerprint cache entry is updated with the analysis. All existing buffer entries with the same fingerprint are also updated (so the dashboard shows the analysis retroactively).

### Step 7: Email Alert (conditional, async)

Fires only if:
- Level is ERROR and org has `notifyOnError = true`
- OR level is FATAL and org has `notifyOnFatal = true`
- AND org has at least one admin email configured in Email Settings

Email contains the error message, source, endpoint, timestamp, Gemini root cause, and Gemini suggested fix.

---

## 4. What IS and IS NOT Stored in the Database

| Data | Stored Where | Notes |
|------|-------------|-------|
| Error events (individual) | Log file (JSONL) + memory buffer | NOT in PostgreSQL ErrorLog table |
| Fingerprint dedup cache | In-memory Map | Rebuilt from log files on restart |
| Error stats (counts by level/source) | In-memory Map | Reset on restart |
| Gemini analysis results | In-memory (on fingerprint entry) | NOT persisted to DB |
| Email alerts sent | In-memory flag | NOT persisted to DB |
| Pipelines triggered from errors | **PostgreSQL Pipeline table** | Persisted (this IS in DB) |
| API keys for SDK auth | **PostgreSQL ApiKey table** | Persisted |

**Why no DB writes?** Speed. Writing to PostgreSQL on every error adds a DB round-trip on the critical ingestion path. The current design optimizes for throughput (high-volume error ingestion) at the cost of persistence guarantees.

---

## 5. Error Deduplication — Fingerprinting

The fingerprint is computed from:
- First 100 characters of the error message
- Source module name
- First 5 non-empty lines of the stack trace

```typescript
// From ErrorFingerprint.ts
SHA256(message.substring(0, 100) + '|' + source + '|' + stackLines.join('|'))
```

**What this catches:**
- Same null-reference error firing 1,000 times per hour → counted once, occurrence count = 1,000
- Same error from two different users → same fingerprint (same code bug)
- Same error message from different sources → different fingerprints

**What this misses:**
- Errors with dynamic IDs in the message (`"User 12345 not found"` vs `"User 67890 not found"`) → these create separate fingerprints even though they're the same bug. Consider normalizing messages before fingerprinting.

---

## 6. Connecting Your Application

### Node.js / Express

```javascript
const CRM_URL = 'https://your-crm.com/api/sdk/errors';
const API_KEY = 'sk_live_YOUR_KEY';

async function logError(level, message, options = {}) {
  try {
    await fetch(CRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ level, message, ...options }),
    });
  } catch {} // never let CRM errors affect your app
}

// Catch everything
process.on('uncaughtException', (err) => logError('FATAL', err.message, { stack: err.stack, source: 'process' }));
process.on('unhandledRejection', (reason) => logError('ERROR', String(reason), { source: 'promise' }));

// Express middleware
app.use((err, req, res, next) => {
  logError('ERROR', err.message, { stack: err.stack, source: 'express', endpoint: req.path });
  res.status(500).json({ error: 'Internal error' });
});
```

### Python / Django or Flask

```python
import requests, traceback, threading

CRM_URL = "https://your-crm.com/api/sdk/errors"
API_KEY = "sk_live_YOUR_KEY"

def log_error(level, message, source, endpoint=None, stack=None):
    def _send():
        try:
            requests.post(CRM_URL, json={
                "level": level, "message": message,
                "stack": stack or traceback.format_exc(),
                "source": source, "endpoint": endpoint
            }, headers={"x-api-key": API_KEY}, timeout=3)
        except: pass
    threading.Thread(target=_send, daemon=True).start()  # non-blocking
```

### React / Next.js Frontend

```javascript
// pages/_app.js or main.tsx
window.addEventListener('error', (event) => {
  fetch('/api/sdk/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'sk_live_YOUR_KEY' },
    body: JSON.stringify({
      level: 'ERROR',
      message: event.message,
      stack: event.error?.stack,
      source: 'react-frontend',
      endpoint: window.location.pathname,
    }),
  }).catch(() => {});
});
```

---

## 7. CRM Admin Actions

| Action | Where | What Happens |
|--------|-------|-------------|
| **View errors** | Error Logs page | Reads in-memory buffer, filtered by level/category/project |
| **Re-analyze** | Error detail → "Re-analyze" | Sends error to Gemini again, updates in-memory cache |
| **Trend Analysis** | Error Logs → "AI Trend Analysis" | Reads log files for last N hours, Gemini finds patterns |
| **Auto-Fix** | Error detail → "Auto-Fix with Claude Code" | Creates Pipeline record in DB, triggers orchestrator |

---

## 8. Error Categories

| Category | Triggers | Auto-Fix Eligible? |
|----------|----------|-------------------|
| `code` | TypeError, null ref, SyntaxError, unhandled exceptions | ✅ Yes |
| `database` | ECONNREFUSED, query timeout, constraint violation | ✅ Yes |
| `network` | ETIMEDOUT, ENOTFOUND, webhook failure | ✅ Sometimes |
| `api` | Rate limit 429, bad response from external API | ⚠️ Manual review |
| `auth` | JWT expired, invalid key, brute force | ❌ No (security) |
| `cors` | Origin blocked | ❌ No (config issue) |
| `timeout` | Request > 30s, socket handshake timeout | ⚠️ Manual review |
| `memory` | Heap OOM, allocation failure | ✅ Yes |
| `email` | SMTP failure | ❌ No (config issue) |
| `validation` | Missing required field | ❌ No (expected) |
| `frontend` | window.onerror, unhandled rejection | ✅ Yes |
| `disk` | ENOSPC | ❌ No (ops issue) |

---

## 9. Improvement Plan

The following improvements address the main gaps in the current system: noise volume, data persistence, and fix tracking. These are **not yet implemented** — this section documents the design for future development.

---

### 9.1 Batch Processing

**Current problem:** Every individual error occurrence triggers a separate write path (log file write, fingerprint cache update, potential Gemini call). In high-traffic systems this can generate thousands of identical error records per minute.

**Proposed design: Buffered Batch Flusher**

Instead of processing each error immediately, buffer incoming errors in memory and flush them in batches every 10 seconds or every 100 errors (whichever comes first):

```typescript
// New: BatchIngestionBuffer
class BatchIngestionBuffer {
  private pending: ErrorInput[] = [];
  private readonly flushIntervalMs = 10_000;
  private readonly maxBatchSize = 100;
  private timer: NodeJS.Timeout;

  constructor(private flush: (batch: ErrorInput[]) => Promise<void>) {
    this.timer = setInterval(() => this.drain(), this.flushIntervalMs);
  }

  push(error: ErrorInput): void {
    this.pending.push(error);
    if (this.pending.length >= this.maxBatchSize) this.drain();
  }

  private async drain(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.maxBatchSize);
    await this.flush(batch);
  }
}
```

**Batch flush logic:**
1. Group by fingerprint → each unique fingerprint gets one record, with `occurrenceCount = N`
2. Only trigger Gemini analysis for fingerprints not yet seen this session
3. Write the collapsed batch to the log file and DB in a single transaction

**Result:** 1,000 identical errors → 1 DB write + 1 Gemini call (instead of 1,000 writes and potentially 1,000 Gemini calls)

---

### 9.2 Smart Noise Reduction

**Current problem:** Every error, no matter how minor, goes through the same pipeline. This floods the dashboard with INFO/WARN noise and makes it hard to find the real problems.

**Proposed rules:**

| Rule | Implementation |
|------|---------------|
| **Drop INFO/WARN from permanent storage** | Only ERROR and FATAL written to log files and DB. INFO/WARN still logged to Winston (console/file) but never reach the dashboard |
| **Rate-cap per fingerprint** | If a fingerprint fires more than 50 times in 60 seconds, stop counting individual occurrences. Just update `lastSeen` and `occurrenceCount`. Only re-open the pipeline if the count crosses a configurable threshold |
| **Ignore known noisy errors** | Add an org-level blocklist: patterns/sources that are known-good and should never alert |
| **Cooldown after fix** | After a pipeline is marked DEPLOYED, suppress alerts for that fingerprint for 24 hours. If it comes back, flag as REGRESSION |

**New `ErrorFilter` service:**
```typescript
class ErrorFilter {
  shouldIngest(input: ErrorInput, fingerprintCache: Map<string, FingerprintEntry>): 'ingest' | 'count_only' | 'drop' {
    if (input.level === 'INFO' || input.level === 'WARN') return 'drop';

    const entry = fingerprintCache.get(fingerprint);
    if (entry && entry.ratePerMinute > 50) return 'count_only';
    if (this.isBlocklisted(input, orgBlocklist)) return 'drop';
    if (entry?.fixedAt && this.withinCooldown(entry.fixedAt, 24)) return 'count_only';

    return 'ingest';
  }
}
```

---

### 9.3 Fix Tracking — Who Fixed It, When, and How

**Current problem:** There is no record of who fixed an error, when it was fixed, or which pipeline resolved it. After an error is auto-fixed by Claude Code, there's no link between the error fingerprint and the pipeline that resolved it.

**Proposed schema additions to `ErrorLog` (when we persist errors to DB):**

```prisma
model ErrorLog {
  // ... existing fields ...

  // Fix tracking
  status          ErrorStatus  @default(OPEN)
  fixedAt         DateTime?
  fixedById       String?      // User who approved the fix or manually marked resolved
  fixedByPipelineId String?    // Pipeline that auto-fixed it
  fixNotes        String?      @db.Text  // Optional notes from the fixer
  resolvedVersion String?      // e.g. "v2.3.1" or git commit hash

  // Regression tracking
  isRegression    Boolean      @default(false)
  previousFixAt   DateTime?    // When the last fix happened before this regression
  regressionCount Int          @default(0)

  fixedBy       User?          @relation(fields: [fixedById], references: [id])
  fixedByPipeline Pipeline?    @relation(fields: [fixedByPipelineId], references: [id])
}

enum ErrorStatus {
  OPEN          // New, unacknowledged
  ACKNOWLEDGED  // Seen by admin, not yet being worked on
  IN_PROGRESS   // Pipeline running or someone is working on it
  FIXED         // Fix applied and verified
  WONT_FIX      // Acknowledged but intentionally not fixed (e.g. third-party issue)
  REGRESSED     // Was fixed, came back
}
```

**Fix tracking API endpoints (new):**

```
PATCH /api/error-logs/:fingerprint/acknowledge
  Body: { notes?: string }
  → Sets status: ACKNOWLEDGED, acknowledgedById, acknowledgedAt

PATCH /api/error-logs/:fingerprint/fix
  Body: { notes?: string, version?: string, pipelineId?: string }
  → Sets status: FIXED, fixedAt: NOW(), fixedById: req.user.id
  → Records fixNotes, resolvedVersion, fixedByPipelineId

PATCH /api/error-logs/:fingerprint/wont-fix
  Body: { reason: string }
  → Sets status: WONT_FIX, fixNotes: reason

GET /api/error-logs/:fingerprint/history
  → Returns: all occurrences, fix events, regression history
```

**Auto-fix integration:** When a Pipeline transitions to `DEPLOYED`, it should automatically call the error fingerprint fix endpoint:

```typescript
// In OrchestratorService, after successful deploy:
if (pipeline.errorLogFingerprint) {
  await ErrorLogger.markFixed(pipeline.errorLogFingerprint, {
    fixedByPipelineId: pipeline.id,
    fixedById: pipeline.approvedBy,
    fixNotes: `Auto-fixed by Claude Code pipeline. Commit: ${pipeline.commitHash}`,
    resolvedVersion: pipeline.commitHash,
  });
}
```

**Dashboard view — Fix History:**
```
Error: "TypeError: Cannot read properties of null (reading 'userId')"
Source: checkout-service   |   First seen: 2026-04-15 09:12

┌────────────────────────────────────────────────────────────┐
│  HISTORY                                                    │
│                                                            │
│  📅 2026-04-15 09:12  OPEN       First occurrence         │
│  👁  2026-04-15 09:45  ACKNOWLEDGED  John (Admin)          │
│  🔧 2026-04-15 10:30  IN_PROGRESS   Pipeline #abc123 started │
│  ✅ 2026-04-15 11:05  FIXED      Pipeline #abc123 deployed  │
│     Fixed by: Claude Code (approved by: John)              │
│     Commit: a3f7b1c   Branch: fix/checkout-null-userId     │
│     Notes: "Moved null check before property access"       │
│                                                            │
│  ⚠️  2026-04-22 14:20  REGRESSED  Occurrence #2            │
│  🔧 2026-04-22 14:35  IN_PROGRESS  Pipeline #def456 started │
│  ✅ 2026-04-22 15:10  FIXED      Pipeline #def456 deployed  │
└────────────────────────────────────────────────────────────┘
```

---

### 9.4 Error Lifecycle States

The full lifecycle of an error from detection to resolution:

```
Error occurs in production app
         │
         ▼
    ┌─────────┐
    │  OPEN   │ ← New fingerprint, no one has acknowledged it
    └────┬────┘
         │ Admin views it
         ▼
┌──────────────┐
│ ACKNOWLEDGED │ ← Seen, being assessed. Optional: assign to team member
└──────┬───────┘
       │ Auto-Fix clicked OR manual fix started
       ▼
┌─────────────┐
│ IN_PROGRESS │ ← Pipeline running, or dev is working on it manually
└──────┬──────┘
       │
    ┌──┴──┐
    │     │
    ▼     ▼
┌───────┐ ┌──────────┐
│ FIXED │ │ WONT_FIX │
└───┬───┘ └──────────┘
    │
    │ Same error fingerprint appears again
    ▼
┌───────────┐
│ REGRESSED │ ← Fix didn't hold. Regression count incremented.
└───────────┘
    │ Start over
    ▼
 IN_PROGRESS (new pipeline)
```

---

### 9.5 Implementation Roadmap

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 High | Persist errors to DB (end the memory-only approach) | Medium | High — enables fix tracking and history |
| 🔴 High | Fix tracking schema (`fixedAt`, `fixedById`, `fixedByPipelineId`, `status`) | Low | High — answers "who fixed what and when" |
| 🔴 High | Auto-link Pipeline→ErrorLog when pipeline deploys | Low | High — closes the loop automatically |
| 🟠 Medium | Batch flush every 10s (reduce DB writes) | Medium | High — critical for high-volume apps |
| 🟠 Medium | Smart noise filter (drop INFO/WARN, rate-cap noisy fingerprints) | Medium | High — cleaner dashboard |
| 🟠 Medium | Error acknowledge/fix/wont-fix API endpoints | Medium | Medium — enables manual workflow |
| 🟡 Low | Fix history timeline UI component | Medium | Medium — visibility |
| 🟡 Low | Message normalization before fingerprinting | Low | Medium — reduces fingerprint explosion |
| 🟡 Low | Per-org blocklist (suppress known-good noisy errors) | Low | Medium — ops quality of life |
| 🟡 Low | Cooldown suppression after fix (24h grace period) | Low | Low — reduces false alerts |

---

## Current System Summary

```
What works well ✅
─────────────────
• Fast ingestion (no DB writes on hot path)
• Deduplication via SHA256 fingerprinting
• Async Gemini analysis (non-blocking)
• Automatic email alerts for ERROR/FATAL
• Manual "Auto-Fix with Claude Code" trigger
• Real-time dashboard via in-memory buffer
• Trend analysis via log file reading

What needs improvement ⚠️
──────────────────────────
• Errors lost on server restart (memory only)
• No fix tracking (who fixed, when, which pipeline)
• No noise filtering (INFO/WARN clutter dashboard)
• No batching (one DB write per error at scale)
• No error lifecycle states (OPEN → FIXED → REGRESSED)
• Gemini analysis lost on restart (not persisted)
• No regression detection link between error and pipeline
```
