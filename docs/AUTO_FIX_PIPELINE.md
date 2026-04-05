# CRM of Techview — Auto-Fix Pipeline

Error → Gemini Analysis → Claude Code Fix → PR → Approve → Deploy — fully automated.

---

## Two Modes of Operation

### Mode 1: Orchestrator (Automatic — NEW)

The built-in orchestrator monitors errors in real-time and auto-triggers fixes:

```
1. Error logged in your app
   └→ Saved to DB → PostgreSQL NOTIFY fires instantly

2. Orchestrator evaluates (no human action needed)
   └→ Checks: severity, dedup fingerprint, cooldown, project config
   └→ Auto-creates pipeline if rules pass

3. Claude Code analyzes (in-process, no separate agent)
   └→ Reads cached project context (minimizes tokens)
   └→ Focused prompt with stack trace file paths only
   └→ Proposes fix → status: AWAITING_APPROVAL

4. Admin reviews in CRM + gets email
   └→ Approves or Rejects

5. Claude Code applies fix (in isolated git worktree)
   └→ Creates branch: fix/auto-{id}
   └→ Runs tests → only proceeds if tests pass
   └→ Commits + pushes
   └→ Creates GitHub PR automatically

6. Pipeline status: PR_CREATED ✓
   └→ Admin merges PR when ready
```

### Mode 2: VPS Agent (Manual Trigger — Legacy)

The original flow where an admin manually clicks "Auto-Fix with Claude Code":

```
1. Error detected → Admin clicks "Auto-Fix with Claude Code"
2. VPS Agent picks up pipeline via polling
3. Claude Code analyzes + proposes fix
4. Admin approves → Agent applies fix → Deploys
```

---

## Orchestrator Setup (Recommended)

The orchestrator runs inside the server process — no separate agent needed.

### Step 1: Run Database Migration

```bash
cd server
npx prisma migrate dev --name add-orchestrator
```

This adds: `ErrorLog.fingerprint`, `Pipeline` orchestrator fields, `AutoFixConfig` model, new pipeline statuses.

### Step 2: Install PostgreSQL Triggers

```bash
cd server
npm run setup:triggers
```

This creates LISTEN/NOTIFY triggers so the orchestrator reacts instantly to new errors (no polling).

### Step 3: Install Claude Code CLI

The orchestrator spawns `claude` as a child process. It must be installed on the machine:

```bash
npm install -g @anthropic-ai/claude-code
claude login  # login with your Max plan account
```

### Step 4: Configure a Project for Auto-Fix

Via the CRM dashboard or API:

```bash
# API example (after logging in as admin)
curl -X PUT http://localhost:3001/api/orchestrator/config/{projectId} \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "projectPath": "/path/to/your/project/code",
    "gitRepoUrl": "https://github.com/your/repo",
    "autoTriggerLevel": "high",
    "testCommand": "npm test",
    "createPR": true
  }'
```

**Config options:**

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Enable auto-fix for this project |
| `projectPath` | — | Absolute path to the project code on disk |
| `autoTriggerLevel` | `"high"` | Min Gemini severity to trigger: `low`, `medium`, `high`, `critical` |
| `maxConcurrent` | `2` | Max simultaneous fixes per project |
| `cooldownMinutes` | `30` | Skip same error pattern within this window |
| `gitRepoUrl` | — | GitHub repo URL (for PR creation) |
| `gitProvider` | `"github"` | `github`, `gitlab`, `bitbucket` |
| `targetBranch` | `"main"` | Base branch for PRs |
| `testCommand` | `"npm test"` | Run after fix — pipeline fails if tests fail |
| `createPR` | `true` | Create a GitHub PR (needs `GITHUB_TOKEN` env var) |
| `autoDeployOnApprove` | `false` | Auto-deploy after admin approval |

### Step 5: Set Environment Variables

Add to `server/.env`:

```env
# Orchestrator (optional — sensible defaults)
MAX_WORKERS=5              # max concurrent Claude Code processes
MAX_PER_PROJECT=2          # max per project
GITHUB_TOKEN=ghp_xxx       # for PR creation (optional)
CLAUDE_COMMAND=claude       # claude CLI command name
WORKTREE_BASE_DIR=/tmp/orchestrator-fixes
```

### Step 6: Start the Server

```bash
npm run dev
```

The orchestrator starts automatically with the server. You'll see in the logs:

```
═══════════════════════════════════════════
  Orchestrator Service Starting...
  Max Workers:  5
  Per Project:  2
═══════════════════════════════════════════
Orchestrator is running. Listening for errors...
```

Now any ERROR/FATAL logged to the system will be automatically evaluated and potentially trigger a Claude Code fix pipeline.

---

## VPS Agent Setup (Legacy / Remote Deployments)

For cases where the code lives on a remote VPS (not the same machine as the CRM):

### Step 1: Register a VPS Agent in CRM

1. Login as Super Admin
2. Go to **Admin → Auto-Fix → VPS Agents tab**
3. Click **Register Agent**
4. Fill in:
   - **Name**: e.g. "Production Server"
   - **Host**: your VPS IP or hostname
   - **Project Path**: where your app code lives (e.g. `/home/deploy/myapp`)
   - **Git Branch**: default branch (e.g. `main`)
   - **Build Command**: e.g. `npm run build`
   - **Restart Command**: e.g. `pm2 restart all`
   - **Project**: link to a CRM project
5. Save — you'll get an **Agent Key** (e.g. `vps_abc123...`)

### Step 2: Install Agent on Your VPS

```bash
# Copy the agent file to your VPS
scp vps-agent/agent.js user@your-vps:/home/deploy/

# SSH into VPS
ssh user@your-vps

# Make sure Claude Code is installed
npm install -g @anthropic-ai/claude-code
claude login  # login with your Max plan account

# Set environment variables
export CRM_URL=https://your-crm-domain.com
export AGENT_KEY=vps_abc123...           # from step 1
export PROJECT_PATH=/home/deploy/myapp    # your app directory

# Run the agent
node agent.js

# For production — use PM2
pm2 start agent.js --name techview-agent
pm2 save
pm2 startup  # auto-start on reboot
```

### Step 3: Test Locally (No VPS Needed)

You can test the full pipeline on your local machine:

```bash
# Terminal 1: Run your CRM
cd ai-support-saas
npm run dev

# Terminal 2: Run the agent pointing to a test project
cd vps-agent
export CRM_URL=http://localhost:3001
export AGENT_KEY=vps_YOUR_KEY         # from CRM → Auto-Fix → Agents
export PROJECT_PATH=/path/to/any/project  # any local project to test on
node agent.js
```

Then:
1. Go to CRM → Error Logs
2. Click "Auto-Fix with Claude Code" on any error
3. Watch the agent terminal — Claude Code will run
4. Go to CRM → Auto-Fix → see the pipeline progress
5. Approve when ready

---

## Pipeline Stages

| Stage | What Happens | Who Acts |
|-------|-------------|----------|
| **DETECTED** | Pipeline created (auto or manual) | System |
| **QUEUED** | Waiting for a worker slot (max 5 concurrent) | Orchestrator |
| **QUEUED_CONFLICT** | Waiting — another fix is modifying same files | Orchestrator |
| **ANALYZING** | Claude Code analyzing error (focused prompt) | Claude Code |
| **FIX_PROPOSED** | Claude analyzed code, proposed a fix | Claude Code |
| **AWAITING_APPROVAL** | Fix shown in CRM + email sent to admins | System |
| **APPROVED** | Admin clicked "Approve" | Admin |
| **FIXING** | Claude Code applying fix in isolated git worktree | Claude Code |
| **TESTING** | Running test suite — pipeline fails if tests fail | System |
| **TEST_FAILED** | Tests failed after fix — fix not applied | System |
| **COMMITTED** | Changes committed to git branch | System |
| **PR_CREATED** | GitHub PR created with full context | System |
| **DEPLOYING** | Merging, building, restarting (if auto-deploy on) | System |
| **DEPLOYED** | Live in production | System |
| **FAILED** | Something went wrong (see logs) | — |
| **REJECTED** | Admin rejected the proposed fix | Admin |
| **REGRESSION** | Same error reappeared after a previous fix | Orchestrator |

---

## CRM Pipeline Page

### Pipelines Tab
- List of all pipelines with status progress bar
- Click to expand: error details, Gemini analysis, Claude output, files changed, git info, deploy log
- Approve/Reject buttons for pending pipelines
- Full timeline of every stage

### VPS Agents Tab
- List of registered agents with online/offline status
- Last heartbeat time
- Setup instructions with copy-paste commands
- Register new agents

---

## The Claude Code Prompt

When a pipeline is triggered, this prompt is sent to Claude Code CLI:

```
You are fixing a production error in the application.

ERROR DETAILS:
- Message: ECONNREFUSED: Redis cache failed at 10.0.1.50:6379
- Source: CacheService
- Category: network
- Stack Trace:
  Error: connect ECONNREFUSED 10.0.1.50:6379
    at TCPConnectWrap.afterConnect (net.js:1141:16)
    at CacheService.get (src/services/cache/CacheService.ts:45:11)

GEMINI ANALYSIS:
Redis cache server is unreachable. Service may be down or firewall.

GEMINI SUGGESTION:
1. Check Redis status
2. Add cache fallback for degraded mode

INSTRUCTIONS:
1. Find the root cause of this error in the codebase
2. Apply the minimal fix required — do not refactor unrelated code
3. If tests exist, run them to verify the fix
4. Explain what you changed and why

PROJECT PATH: /home/deploy/myapp
```

Claude Code then:
1. Reads the relevant source files
2. Understands the error context
3. Makes the minimal fix
4. Explains what was changed

---

## Agent Communication Protocol

The VPS agent communicates with the CRM via two webhook endpoints:

### Heartbeat (every 30 seconds)
```
POST /api/pipeline/agent-webhook/heartbeat
Headers: { x-agent-key: vps_abc123... }

Response: {
  "ok": true,
  "pendingPipelines": [
    { "id": "uuid", "status": "ANALYZING", "claudePrompt": "..." },
    { "id": "uuid", "status": "APPROVED", "claudePrompt": "..." }
  ]
}
```

### Report (after each stage)
```
POST /api/pipeline/agent-webhook/report
Headers: { x-agent-key: vps_abc123... }
Body: {
  "pipelineId": "uuid",
  "stage": "FIX_PROPOSED",
  "claudeOutput": "full output from claude CLI...",
  "claudeFixSummary": "Changed CacheService.ts to add fallback...",
  "filesChanged": ["src/services/cache/CacheService.ts"],
  "branchName": "fix/auto-abc12345",
  "commitHash": "a1b2c3d",
  "deployLog": "build output...",
  "error": null
}
```

---

## Security

- Agent keys are unique per server — one key per VPS
- Agent keys are validated on every request
- Claude Code runs with `--dangerously-skip-permissions` flag (auto-approves file edits)
- All changes go through a git branch — not directly to main
- Admin must explicitly approve before deployment
- Full audit trail in pipeline logs
- Agent can be deactivated instantly from CRM

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Agent shows "offline" | Check if agent.js is running. Verify CRM_URL and AGENT_KEY. |
| Claude Code not found | Install: `npm install -g @anthropic-ai/claude-code` then `claude login` |
| Pipeline stuck at ANALYZING | Agent may be offline. Check agent terminal for errors. |
| Claude didn't change any files | The error may not have a code-level fix, or Claude couldn't find the relevant files. |
| Deploy failed | Check the deploy log in the pipeline detail. Common: build errors, merge conflicts. |
| Git push rejected | Ensure the VPS has git push access (SSH key or token configured). |
| Orchestrator not starting | Check server logs. Common: DATABASE_URL wrong, PostgreSQL not running. |
| No auto-trigger | Ensure `AutoFixConfig.enabled = true` for the project and error severity meets `autoTriggerLevel`. |
| DB triggers not firing | Run `npm run setup:triggers` in server directory. |
| Same error not re-triggering | Fingerprint dedup — cooldown period (default 30min). Check `cooldownMinutes` in config. |
| Pipeline stuck at QUEUED | All 5 worker slots full. Wait for one to finish or increase `MAX_WORKERS`. |
| PR not created | Set `GITHUB_TOKEN` env var and `gitRepoUrl` in AutoFixConfig. |
| Tests failing after fix | Pipeline goes to TEST_FAILED. Review the `testOutput` in pipeline details. |
| REGRESSION detected | Same error reappeared after a deployed fix. Previous fix didn't hold — review both pipelines. |

---

## Orchestrator Architecture

### How It Minimizes Claude Code Token Usage

1. **Project Context Cache** — On first run, maps the codebase structure and saves to `.orchestrator-context.json`. Subsequent runs skip exploration.

2. **Stack Trace → File Paths** — Parses error stack traces to extract exact files + line numbers. Claude Code is told to read ONLY those files.

3. **Session Reuse** — Analysis and fix phases can share a Claude Code session via `--resume`, avoiding re-reading files.

### How It Prevents Regressions

1. **Error Fingerprinting** — Each error gets a stable SHA-256 hash (ignores dynamic values like IDs and timestamps). Same logical error = same fingerprint.

2. **Regression Detection** — If a fingerprint matches a recently deployed fix (within 7 days), the new pipeline is marked as `REGRESSION` with a link to the previous fix.

3. **File Conflict Guard** — Two simultaneous fixes can't modify the same files. The second one queues as `QUEUED_CONFLICT`.

4. **Test Verification** — After Claude Code applies a fix, the configured `testCommand` runs. Pipeline only proceeds if tests pass.

### Worker Pool

- **Max 5 concurrent** Claude Code processes (configurable via `MAX_WORKERS`)
- **Max 2 per project** (configurable via `MAX_PER_PROJECT`)
- **Priority queue** — FATAL > ERROR, higher Gemini severity > lower, regressions get +3 priority
- **Overflow queues** — when all slots full, pipelines wait in QUEUED status and auto-drain

### PostgreSQL LISTEN/NOTIFY (No Polling)

Instead of polling the DB every N seconds, the orchestrator uses PostgreSQL's built-in pub/sub:

- `NOTIFY new_error` — fires when a new ErrorLog row is inserted (ERROR/FATAL only)
- `NOTIFY error_analyzed` — fires when Gemini analysis completes
- `NOTIFY pipeline_status` — fires when a pipeline status changes (e.g., admin approves)

The orchestrator listens on these channels and reacts instantly. Zero wasted queries.

### Orchestrator API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orchestrator/status` | Active/queued pipeline counts |
| `GET` | `/api/orchestrator/config/:projectId` | AutoFixConfig for a project |
| `PUT` | `/api/orchestrator/config/:projectId` | Create/update AutoFixConfig |
| `GET` | `/api/orchestrator/regressions/:projectId` | List regression pipelines |

### Files

All orchestrator code lives in `server/src/services/orchestrator/`:

```
orchestrator/
├── OrchestratorService.ts    ← singleton, started by server on boot
├── OrchestratorConfig.ts     ← reads MAX_WORKERS, GITHUB_TOKEN, etc. from env
├── OrchestratorLogger.ts     ← winston logger with [orchestrator] prefix
├── AutoTriggerService.ts     ← 8 smart rules for when to trigger
├── WorkerPool.ts             ← 5-slot pool with priority queue
├── AgentWorker.ts            ← full pipeline lifecycle per error
├── ClaudeCodeRunner.ts       ← Claude CLI wrapper with focused prompts
├── GitService.ts             ← git worktrees + commit + push + GitHub PRs
├── ProjectContextCache.ts    ← caches codebase map to minimize tokens
├── StackTraceParser.ts       ← extracts file paths from stack traces
├── ErrorFingerprint.ts       ← stable SHA-256 hash for dedup
├── queue.ts                  ← priority queue implementation
└── db/
    ├── listener.ts           ← pg LISTEN/NOTIFY client
    ├── triggers.sql          ← SQL to create NOTIFY triggers
    └── setup-triggers.ts     ← script to install triggers
```
