# CRM of Techview — Auto-Fix Pipeline

Error → Gemini Analysis → Claude Code Fix → Deploy — fully automated.

---

## How It Works

```
1. Error detected in your app
   └→ Logged in CRM with Gemini root cause analysis

2. Admin clicks "Auto-Fix with Claude Code"
   └→ Pipeline created in CRM

3. VPS Agent picks up the pipeline
   └→ Runs Claude Code CLI on the actual codebase
   └→ Claude analyzes, proposes fix

4. Admin reviews in CRM + gets email
   └→ Sees Claude's proposed changes + files affected
   └→ Clicks "Approve & Deploy" or "Reject"

5. Agent applies the fix
   └→ Creates git branch: fix/auto-abc123
   └→ Claude Code makes the changes
   └→ Commits + pushes

6. Auto-deploy
   └→ Merges to main
   └→ Runs build command
   └→ Restarts application
   └→ Pipeline status: DEPLOYED ✓
```

---

## Setup

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
| **DETECTED** | Pipeline created from error log | System |
| **ANALYZING** | Claude Code prompt prepared, sent to agent | System |
| **FIX_PROPOSED** | Claude analyzed code, proposed a fix | Claude Code |
| **AWAITING_APPROVAL** | Fix shown in CRM + email sent to admins | System |
| **APPROVED** | Admin clicked "Approve & Deploy" | Admin |
| **FIXING** | Claude Code applying changes to codebase | Claude Code |
| **TESTING** | Running tests (if configured) | Claude Code |
| **COMMITTED** | Changes committed to git branch | Agent |
| **DEPLOYING** | Merging, building, restarting | Agent |
| **DEPLOYED** | Live in production | System |
| **FAILED** | Something went wrong (see logs) | — |
| **REJECTED** | Admin rejected the proposed fix | Admin |

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
