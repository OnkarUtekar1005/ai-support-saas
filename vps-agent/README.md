# CRM of Techview — VPS Agent

Runs on your VPS. Polls the CRM for auto-fix tasks, runs Claude Code CLI, and deploys fixes.

## Setup

1. Copy this folder to your VPS
2. Install Claude Code CLI on the VPS: `npm install -g @anthropic-ai/claude-code`
3. Login to Claude: `claude login`
4. Set environment variables:

```bash
export CRM_URL=https://your-crm-domain.com   # Your CRM URL
export AGENT_KEY=vps_abc123...                # Get from CRM → Pipeline → Register Agent
export PROJECT_PATH=/home/deploy/myapp        # Path to your application code
```

5. Run the agent:
```bash
node agent.js
```

6. For production, use PM2:
```bash
pm2 start agent.js --name techview-agent
pm2 save
```

## How It Works

```
Agent starts → polls CRM every 30s for pending pipelines
    │
    ▼
Pipeline found (status: ANALYZING)
    → Runs Claude Code CLI with error context
    → Claude analyzes codebase, proposes fix
    → Reports back to CRM (status: AWAITING_APPROVAL)
    → CRM sends email to admin
    │
    ▼
Admin approves in CRM (status: APPROVED)
    → Agent picks up approved pipeline
    → Creates git branch: fix/auto-abc123
    → Runs Claude Code CLI to apply fix
    → Commits changes
    → Pushes branch
    │
    ▼
Deploy
    → Merges to main
    → Runs build command
    → Restarts application
    → Reports DEPLOYED to CRM
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CRM_URL` | `http://localhost:3001` | Your CRM server URL |
| `AGENT_KEY` | *(required)* | Agent authentication key from CRM |
| `PROJECT_PATH` | current directory | Path to application code on VPS |
| `POLL_INTERVAL` | `30000` | Poll interval in milliseconds |
| `ANALYSIS_MODEL` | `claude-haiku-4-5-20251001` | Model used for the analysis-only step (Haiku = cheapest) |
| `FIX_MODEL` | *(Claude default)* | Model used for the fix/edit step. Leave blank to use your configured default |
| `MAX_STACK_LINES` | `25` | Max lines of stack trace sent to Claude (reduce to save tokens) |
| `MAX_GEMINI_CHARS` | `600` | Max characters of Gemini analysis included in prompts |
| `MAX_SUGGESTION_CHARS` | `300` | Max characters of Gemini suggestion included in fix prompt |
| `MAX_FIX_SUMMARY_CHARS` | `500` | Max characters of Claude's analysis summary included in fix prompt |

## Error Severity Filter

Not every logged error triggers a Claude fix. The agent runs each pipeline through a severity gate before spending any tokens. Only **system-breaking errors** proceed; everything else is marked `SKIPPED` in the CRM with a reason.

### Auto-fixed (critical)

| Signal | Examples |
|--------|---------|
| HTTP 5xx | `500 Internal Server Error`, `503 Service Unavailable` |
| Unhandled runtime errors | `UnhandledPromiseRejection`, `UncaughtException` |
| Null/undefined access | `TypeError: Cannot read properties of undefined` |
| Network/DB unreachable | `ECONNREFUSED`, `ENOTFOUND`, `connection refused` |
| App crash patterns | `fatal error`, `process exited`, `heap out of memory` |
| ORM/DB errors | `PrismaError`, `SequelizeConnectionError` |
| Module load failures | `Cannot find module`, `failed to start` |
| Explicit severity field | `severity: fatal` or `severity: critical` from CRM |

### Skipped (not auto-fixed)

| Signal | Examples |
|--------|---------|
| HTTP 4xx | `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found` |
| Validation errors | `ValidationError`, `validation failed`, `invalid input` |
| Auth errors | `authentication failed`, `invalid token`, `unauthorized` |
| Rate limiting | `RateLimitError`, `too many requests` |
| Warnings/info | `severity: warning`, `severity: info`, `DeprecationWarning` |
| Unknown errors | Default: skip (conservative — avoids wasting tokens on noise) |

> **Default is to skip.** If an error doesn't match a known critical pattern it is skipped, not fixed. This protects your daily token quota from being drained by routine noise.

### Tuning the filter

The `isCriticalError()` function is in `agent.js` (line ~109). Edit `SKIP_TYPES` and `CRITICAL_TYPES` arrays to match your application's error vocabulary.

If your CRM sends a `severity` or `errorLevel` field on the pipeline, the filter uses that first:
- `fatal` / `critical` → always fix
- `warning` / `warn` / `info` / `debug` → always skip

## Token Optimization

The agent uses several strategies to minimize Claude API token usage:

**1. Haiku for analysis, Sonnet for fixing**
The ANALYZING step (no file edits) uses `claude-haiku-4-5-20251001` by default (~20x cheaper than Sonnet). Only the APPROVED fix step uses the more capable model.

**2. Stack trace truncation**
Stack traces are trimmed to the top 25 lines (configurable via `MAX_STACK_LINES`). The tail of a stack trace almost never contains the root cause.

**3. No duplicate context in the fix prompt**
When an analysis (`claudeFixSummary`) already exists, the fix prompt contains only:
- The error message
- The 2–3 sentence fix plan from analysis

It does **not** re-include the full stack trace, Gemini analysis, or Gemini suggestion — those were already distilled into the fix plan.

**4. Gemini-first path**
If Gemini already analyzed the error, Claude's analysis prompt skips the stack trace entirely and just asks Claude to confirm which file/line to change based on Gemini's suggestion. This is the shortest possible analysis prompt.

**Typical token savings per pipeline:**
| Scenario | Before | After (est.) |
|----------|--------|--------------|
| Analysis (Gemini context exists) | ~2000 tokens (Sonnet) | ~300 tokens (Haiku) |
| Analysis (no Gemini context) | ~3000 tokens (Sonnet) | ~400 tokens (Haiku) |
| Fix (with analysis summary) | ~3000 tokens | ~800 tokens |
| Fix (no summary) | ~3000 tokens | ~1000 tokens |
