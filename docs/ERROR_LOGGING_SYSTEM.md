# CRM of Techview — Error Logging System

Complete documentation of how errors are captured, analyzed, and acted upon.

---

## Overview

The error logging system captures errors from **any connected application**, analyzes them with **Gemini AI**, alerts the **admin team via email**, and optionally triggers the **Auto-Fix Pipeline** to have Claude Code fix and deploy the solution.

```
Your App (any platform)
     │
     │  POST /api/sdk/error + API key
     ▼
┌─────────────────────────────────────────────────┐
│              API Key Middleware                   │
│  Validates key → extracts org + project          │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              ErrorLogger.logError()              │
│                                                  │
│  1. Winston     → logs/error.log (immediate)     │
│  2. Database    → ErrorLog table (immediate)     │
│  3. Gemini AI   → root cause analysis (async)    │
│  4. Email       → admin alert with AI fix (async)│
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│         CRM Dashboard — Error Logs Page          │
│  Filter by: project, category, level, analyzed   │
│  Actions: Re-analyze, Auto-Fix with Claude Code  │
└─────────────────────────────────────────────────┘
```

---

## How Errors Enter the System

### Entry Point 1: External Apps via SDK (API Key Auth)

Any website, mobile app, or server sends errors using an API key.

**HTTP Request:**
```
POST /api/sdk/error
Headers: { x-api-key: sk_live_YOUR_KEY }
Body: {
  "message": "TypeError: Cannot read properties of null",
  "stack": "TypeError: Cannot read properties of null\n    at checkout.js:42",
  "source": "checkout-service",
  "level": "ERROR",
  "endpoint": "/api/checkout",
  "email": "user@example.com"
}
```

**What happens:**
1. `apiKeyAuth` middleware validates the API key
2. Extracts `organizationId` and `projectId` from the key
3. Checks permissions (key must have `errors` permission)
4. Checks allowed origins (for web requests)
5. Calls `ErrorLogger.logError()` with org + project context

**Code path:** `routes/sdk.ts` → `apiKeyAuth middleware` → `ErrorLogger.logError()`

### Entry Point 2: Auto-Captured Frontend Errors (SDK Script)

When you add the SDK script to a website:
```html
<script src="http://your-crm.com/sdk.js?key=sk_live_YOUR_KEY"></script>
```

The SDK automatically captures:
- `window.onerror` — all uncaught JavaScript errors
- `unhandledrejection` — unhandled Promise rejections
- Page views (optional)

No code needed — errors are sent automatically via `navigator.sendBeacon()`.

### Entry Point 3: CRM Internal Errors (JWT Auth)

When the CRM itself encounters errors in any route:

```
Express route throws error
     │
     ▼
Global errorHandler middleware catches it
     │
     ▼
ErrorLogger.logError({
  level: 'ERROR',
  message: err.message,
  stack: err.stack,
  source: 'express-middleware',
  endpoint: 'POST /api/tickets',
  userId: req.user.id,
  organizationId: req.user.organizationId
})
```

**Code path:** `middleware/errorHandler.ts` → `ErrorLogger.logError()`

### Entry Point 4: Route-Level Catch Blocks

Individual routes catch their own errors:

```typescript
// In routes/tickets.ts, chat.ts, deals.ts, etc.
try {
  // route logic
} catch (err) {
  await ErrorLogger.logError({
    level: 'ERROR',
    message: err.message,
    stack: err.stack,
    source: 'tickets-create',
    endpoint: 'POST /api/tickets',
    organizationId: req.user.organizationId,
    userId: req.user.id,
  });
  res.status(500).json({ error: 'Failed' });
}
```

---

## The ErrorLogger Pipeline

### Step 1: Winston File Logging (Immediate)

```typescript
winstonLogger.log(level, message, { source, endpoint, stack });
```

Writes to:
- `logs/error.log` — ERROR and above only
- `logs/combined.log` — all levels
- Console — in development mode only

This happens **synchronously and immediately** — even if the database is down, the error is recorded to disk.

### Step 2: Database Insert (Immediate)

```typescript
prisma.errorLog.create({
  data: {
    level,          // INFO | WARN | ERROR | FATAL
    message,        // "ECONNREFUSED: Redis cache failed"
    stack,          // full stack trace
    source,         // "CacheService" or "sdk-My Website"
    category,       // "database", "api", "auth", "network", etc.
    endpoint,       // "POST /api/tickets"
    userId,         // who triggered it (if known)
    projectId,      // which project/system (from API key)
    organizationId, // which organization
    requestData,    // sanitized request body (no passwords)
  }
})
```

The error is now:
- Visible in CRM → Error Logs page
- Filterable by project, category, level
- Searchable by the AI Assistant
- Available for the Auto-Fix Pipeline

### Step 3: Gemini AI Analysis (Async, Non-Blocking)

Only triggered for **ERROR** and **FATAL** levels. Runs in the background — does not slow down the error response.

```typescript
// Only for ERROR and FATAL
if (level === 'ERROR' || level === 'FATAL') {
  ErrorLogger.analyzeAndNotify(errorLogId, input);  // fire and forget
}
```

**What Gemini receives:**
```
You are an expert DevOps engineer. Analyze this error:

- Message: ECONNREFUSED: Redis cache failed at 10.0.1.50:6379
- Source: CacheService
- Endpoint: GET /api/tickets
- Stack Trace: Error: connect ECONNREFUSED 10.0.1.50:6379
    at TCPConnectWrap.afterConnect (net.js:1141:16)
    at CacheService.get (src/services/cache/CacheService.ts:45:11)

Respond in JSON: { rootCause, suggestion, severity, category }
```

**What Gemini returns:**
```json
{
  "rootCause": "Redis cache server at 10.0.1.50:6379 is unreachable. Service may be down or firewall blocking port 6379.",
  "suggestion": "1. Check Redis status: systemctl status redis\n2. Test connectivity: telnet 10.0.1.50 6379\n3. Add cache fallback for degraded mode",
  "severity": "high",
  "category": "network"
}
```

**Database updated:**
```sql
UPDATE "ErrorLog"
SET aiAnalysis = 'Redis cache server is unreachable...',
    aiSuggestion = '1. Check Redis status...',
    analyzed = true
WHERE id = 'error-uuid';
```

### Step 4: Email Alert (Async, Conditional)

Only sends if:
- Level is ERROR **and** org has `notifyOnError = true`
- OR level is FATAL **and** org has `notifyOnFatal = true`
- AND org has at least one admin email configured

```typescript
// Check email settings for this organization
const emailSettings = await prisma.emailSettings.findUnique({
  where: { organizationId }
});

const shouldNotify =
  emailSettings &&
  ((level === 'ERROR' && emailSettings.notifyOnError) ||
   (level === 'FATAL' && emailSettings.notifyOnFatal));

if (shouldNotify && emailSettings.adminEmails.length > 0) {
  await EmailService.sendErrorAlert({ ... });
}
```

**Email contains:**
- Error level badge (red for FATAL, amber for ERROR)
- Error message and source
- Endpoint that triggered it
- Timestamp
- AI Root Cause Analysis (from Gemini)
- AI Suggested Fix (from Gemini)

---

## API Key Middleware — How Authentication Works

Every external error goes through the API key middleware:

```
POST /api/sdk/error
     │
     ▼
┌─────────────────────────────────────────────┐
│ Step 1: EXTRACT KEY                          │
│ Read from: x-api-key header OR ?_key= param  │
│ If missing → 401 "API key required"          │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Step 2: LOOKUP IN DATABASE                   │
│ SELECT * FROM ApiKey WHERE key = 'sk_live_…' │
│ If not found or inactive → 401 "Invalid key" │
│                                              │
│ Found: {                                     │
│   organizationId: "acme-org-uuid",           │
│   projectId: "billing-project-uuid",         │
│   permissions: ["errors", "contacts"],       │
│   allowedOrigins: ["https://myapp.com"],     │
│   isActive: true                             │
│ }                                            │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Step 3: CHECK ORIGIN (web only)              │
│ Request from https://myapp.com?              │
│ Is it in allowedOrigins? → ✓ pass            │
│ Is it https://hacker.com? → ✗ 403 blocked    │
│ No origins configured? → allow all           │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Step 4: CHECK PERMISSION                     │
│ Route requires: "errors"                     │
│ Key has: ["errors", "contacts"] → ✓ pass     │
│ Key has: ["contacts"] only → ✗ 403 denied    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Step 5: ATTACH CONTEXT TO REQUEST            │
│ req.apiKey = {                               │
│   id, name, platform,                        │
│   organizationId,  ← WHO owns this           │
│   projectId,       ← WHICH system            │
│   permissions      ← WHAT they can do        │
│ }                                            │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│ Step 6: UPDATE USAGE STATS (non-blocking)    │
│ UPDATE ApiKey SET                            │
│   lastUsedAt = NOW(),                        │
│   usageCount = usageCount + 1                │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
              Route handler runs
         (ErrorLogger.logError() called
          with org + project from req.apiKey)
```

---

## Error Log Database Schema

```sql
ErrorLog {
  id              UUID        PRIMARY KEY
  level           ENUM        INFO | WARN | ERROR | FATAL
  message         TEXT        "ECONNREFUSED: Redis failed..."
  stack           TEXT?       full stack trace
  source          VARCHAR     "CacheService", "sdk-My Website"
  category        VARCHAR?    "database", "api", "auth", "cors", "timeout",
                              "code", "network", "email", "memory",
                              "validation", "frontend", "disk"
  endpoint        VARCHAR?    "POST /api/tickets"
  userId          VARCHAR?    user who triggered it
  projectId       UUID? ───→  Project (which system)
  requestData     JSON?       sanitized request body
  aiAnalysis      TEXT?       Gemini root cause
  aiSuggestion    TEXT?       Gemini fix suggestion
  analyzed        BOOLEAN     false → true (after Gemini)
  emailSent       BOOLEAN     true if admin was notified
  organizationId  UUID  ───→  Organization (tenant)
  createdAt       TIMESTAMP

  INDEXES:
    (organizationId, createdAt)  — paginated queries
    (level)                      — filter by severity
    (analyzed)                   — find unanalyzed errors
    (projectId)                  — filter by system
    (category)                   — filter by error type
}
```

---

## Error Categories

| Category | Examples | Typical Sources |
|----------|----------|-----------------|
| `database` | Connection pool exhausted, query timeout, constraint violation, missing table | SqlConnector, PrismaORM, PostgreSQL |
| `api` | Rate limit 429, webhook delivery failed, slow response | RateLimiter, GeminiClient, WebhookService |
| `auth` | JWT expired, invalid API key, brute force detected | AuthMiddleware, ApiKeyAuth, AuthService |
| `cors` | Origin blocked, cross-origin request denied | CorsMiddleware |
| `timeout` | Request exceeded 30s, socket handshake timeout | TimeoutMiddleware, SocketIO |
| `code` | TypeError, SyntaxError, RangeError, undefined property access | Any source file |
| `network` | ECONNREFUSED, ETIMEDOUT, DNS ENOTFOUND | CacheService, PaymentService, CurrencyService |
| `email` | SMTP auth failed, delivery throttled | EmailService |
| `memory` | Heap out of memory, allocation failed | VectorStore, any batch process |
| `validation` | Missing required field, invalid value | ValidationMiddleware |
| `frontend` | Uncaught TypeError, unhandled promise rejection (from SDK) | sdk-web, widget |
| `disk` | ENOSPC no space left on device | WinstonLogger, file uploads |

---

## Connecting Your Application

### Website / Web App — Automatic

```html
<!-- Add before </body> — errors captured automatically -->
<script src="http://your-crm.com/sdk.js?key=sk_live_YOUR_KEY"></script>
```

Captures: `window.onerror`, `unhandledrejection`, page views.

### Node.js Backend — Global Catch

```javascript
const CRM_URL = 'http://your-crm.com/api/sdk/error';
const API_KEY = 'sk_live_YOUR_KEY';

function logToCRM(level, message, stack, source, endpoint) {
  fetch(CRM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ level, message, stack, source, endpoint })
  }).catch(() => {});  // Don't let CRM errors crash your app
}

// Catch ALL uncaught errors
process.on('uncaughtException', (err) => {
  logToCRM('FATAL', err.message, err.stack, 'your-app', null);
});

process.on('unhandledRejection', (reason) => {
  logToCRM('ERROR', String(reason), reason?.stack, 'your-app', null);
});

// In Express middleware
app.use((err, req, res, next) => {
  logToCRM('ERROR', err.message, err.stack, 'express', req.method + ' ' + req.path);
  res.status(500).json({ error: 'Internal error' });
});
```

### Python Backend

```python
import requests, traceback

CRM_URL = "http://your-crm.com/api/sdk/error"
API_KEY = "sk_live_YOUR_KEY"

def log_to_crm(level, message, source, endpoint=None):
    try:
        requests.post(CRM_URL, json={
            "level": level,
            "message": message,
            "stack": traceback.format_exc(),
            "source": source,
            "endpoint": endpoint
        }, headers={"x-api-key": API_KEY}, timeout=5)
    except:
        pass  # Don't let CRM errors affect your app

# In Flask
@app.errorhandler(Exception)
def handle_error(e):
    log_to_crm("ERROR", str(e), "flask-app", request.path)
    return {"error": "Internal error"}, 500
```

### React Native / Mobile

```javascript
// Global error handler
ErrorUtils.setGlobalHandler((error) => {
  fetch('http://your-crm.com/api/sdk/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'sk_live_YOUR_KEY' },
    body: JSON.stringify({
      message: error.message,
      stack: error.stack,
      source: 'mobile-app',
      level: 'FATAL'
    })
  }).catch(() => {});
});
```

---

## CRM Admin Actions on Error Logs

### View & Filter
- Filter by **level** (INFO, WARN, ERROR, FATAL)
- Filter by **category** (database, api, auth, network, etc.)
- Filter by **project/system** (which app generated it)
- Filter by **analyzed/unanalyzed** (Gemini processed or not)

### Analyze
- Click **"Analyze with AI"** to send an unanalyzed error to Gemini
- Click **"AI Trend Analysis"** to find patterns across recent errors

### Auto-Fix
- Click **"Auto-Fix with Claude Code"** (purple button)
- Creates a Pipeline:
  1. Sends error + Gemini analysis to VPS Agent
  2. Claude Code CLI analyzes the codebase
  3. Claude proposes a fix
  4. Admin reviews and approves
  5. Claude applies the fix, commits, deploys

---

## Email Alert Format

When an ERROR or FATAL is logged (and email is configured):

```
Subject: [ERROR] CacheService: ECONNREFUSED: Redis cache failed...

┌─────────────────────────────────────┐
│  🟡 ERROR Error Alert               │
├─────────────────────────────────────┤
│                                     │
│  Error Message:                     │
│  ┌─────────────────────────────┐    │
│  │ ECONNREFUSED: Redis cache   │    │
│  │ failed at 10.0.1.50:6379    │    │
│  └─────────────────────────────┘    │
│                                     │
│  Source: CacheService               │
│  Endpoint: GET /api/tickets         │
│  Timestamp: 2026-03-22T10:30:00Z    │
│                                     │
│  ┌─ 🤖 AI Root Cause Analysis ───┐  │
│  │ Redis cache server is          │  │
│  │ unreachable. Service may be    │  │
│  │ down or firewall blocking.     │  │
│  └────────────────────────────────┘  │
│                                     │
│  ┌─ 💡 Suggested Fix ────────────┐  │
│  │ 1. Check Redis: systemctl     │  │
│  │    status redis               │  │
│  │ 2. Test: telnet 10.0.1.50     │  │
│  │    6379                       │  │
│  │ 3. Add cache fallback         │  │
│  └────────────────────────────────┘  │
│                                     │
│  AI Support SaaS — Error Monitoring │
└─────────────────────────────────────┘
```

---

## Configuration

### Email Settings (CRM → Settings → Email Alerts)

| Setting | Description |
|---------|-------------|
| SMTP Host | e.g. `smtp.gmail.com` |
| SMTP Port | e.g. `587` |
| SMTP User | Your email address |
| SMTP Password | App password (not your main password) |
| Admin Emails | List of emails to receive alerts |
| Notify on ERROR | Send email for ERROR level (recommended: ON) |
| Notify on FATAL | Send email for FATAL level (recommended: ON) |
| Daily Digest | Send summary email daily at 9am |

### API Key Settings (CRM → Integrations)

| Setting | Description |
|---------|-------------|
| Name | Label for the key (e.g. "Production Website") |
| Platform | web, ios, android, server |
| Project | Which project errors are linked to |
| Permissions | Must include `errors` for error logging |
| Allowed Origins | Restrict which domains can use this key (web only) |

---

## Auto-Fix Pipeline Integration

When an error is logged, admins can trigger the Auto-Fix Pipeline:

```
Error Logged in CRM
     │
     ▼
Admin clicks "Auto-Fix with Claude Code"
     │
     ▼
Pipeline created (status: DETECTED → ANALYZING)
     │
     ▼
VPS Agent picks up the pipeline
     │
     ▼
Claude Code CLI runs on VPS with this prompt:
  "Fix this error: [error message]
   Stack: [stack trace]
   Gemini says: [AI analysis]
   Find the root cause and apply minimal fix."
     │
     ▼
Claude analyzes codebase → proposes fix
     │
     ▼
CRM shows fix proposal (status: AWAITING_APPROVAL)
Email sent to admins with proposed changes
     │
     ▼
Admin approves in CRM
     │
     ▼
Claude Code applies fix → git commit → build → deploy
     │
     ▼
Pipeline status: DEPLOYED ✓
Error marked as fixed
```

See `AUTO_FIX_PIPELINE.md` for full pipeline documentation.
