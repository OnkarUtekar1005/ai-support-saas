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
| CRM_URL | http://localhost:3001 | Your CRM server URL |
| AGENT_KEY | (required) | Agent authentication key |
| PROJECT_PATH | current directory | Path to application code |
| POLL_INTERVAL | 30000 | Poll interval in ms |
