#!/usr/bin/env node

/**
 * CRM of Techview — VPS Agent
 *
 * Architecture:
 *   Node.js (thin poller) → Claude Code Orchestrator Agent → Claude Code Sub-Agents
 *
 *   1. Node.js polls the CRM heartbeat every POLL_INTERVAL seconds
 *   2. For each pending pipeline it assigns to a free worker slot, it launches
 *      a Claude Code "orchestrator" agent with the full pipeline context
 *   3. The orchestrator Claude uses the Agent tool to spawn sub-agents:
 *        - ANALYZING pipelines → analysis sub-agent (reads code, identifies root cause)
 *        - APPROVED  pipelines → fix sub-agent     (edits files, builds, restarts)
 *   4. Sub-agents report progress directly to the CRM via bash curl commands
 *
 * Setup:
 *   1. Copy this file to your VPS
 *   2. Set environment variables: AGENT_KEY and optionally CRM_URL
 *   3. Run: node agent.js
 *
 * Requirements:
 *   - Node.js 18+
 *   - Claude Code CLI installed and authenticated (`claude` command available)
 *   - Git configured on the VPS
 */

const { spawn } = require('child_process');
const https     = require('https');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────
// Only AGENT_KEY is required. Everything else comes from CRM Agent Config.
const CONFIG = {
  CRM_URL:        process.env.CRM_URL        || 'http://localhost:3001',
  AGENT_KEY:      process.env.AGENT_KEY      || '',
  POLL_INTERVAL:  parseInt(process.env.POLL_INTERVAL  || '15000'), // 15s
  MAX_WORKERS:    parseInt(process.env.MAX_WORKERS    || '2'),     // max concurrent orchestrators per project
  MODEL:          process.env.MODEL          || 'claude-haiku-4-5-20251001',
};

if (!CONFIG.AGENT_KEY) {
  console.error('ERROR: AGENT_KEY is required.');
  console.error('Get your agent key from CRM → Admin → Pipeline → Register Agent');
  process.exit(1);
}

console.log('═══════════════════════════════════════════');
console.log('  CRM of Techview — VPS Agent');
console.log('═══════════════════════════════════════════');
console.log(`  CRM URL:       ${CONFIG.CRM_URL}`);
console.log(`  Project paths: from CRM Agent Config`);
console.log(`  Max workers:   ${CONFIG.MAX_WORKERS} per project`);
console.log(`  Poll Interval: ${CONFIG.POLL_INTERVAL / 1000}s`);
console.log(`  Model:         ${CONFIG.MODEL}`);
console.log('═══════════════════════════════════════════\n');

// ─── Node.js scheduler ────────────────────────────────────────────────────────
// Manages per-project worker pools and prevents double-pickup across heartbeats.
// Actual pipeline processing is handled by Claude Code orchestrator agents.
const scheduler = {
  pools:      {},          // projectId → { active: number, queue: Pipeline[] }
  processing: new Set(),   // pipeline IDs currently owned by an orchestrator
  projectConfigs: {},
  agentConfig:    {},

  update(pendingPipelines, projectConfigs, agentConfig) {
    if (agentConfig)    this.agentConfig = agentConfig;
    if (projectConfigs) Object.assign(this.projectConfigs, projectConfigs);

    for (const pipeline of (pendingPipelines || [])) {
      if (this.processing.has(pipeline.id)) continue;

      const pid  = pipeline.projectId || 'default';
      const pool = this.pools[pid] || (this.pools[pid] = { active: 0, queue: [] });

      if (pool.queue.find(p => p.id === pipeline.id)) continue;

      if (pool.active < CONFIG.MAX_WORKERS) {
        console.log(`  [Scheduler] ✓ Assigning ${pipeline.id.slice(0,8)} → project ${pid.slice(0,8)} (worker ${pool.active + 1}/${CONFIG.MAX_WORKERS})`);
        this._launch(pid, pool, pipeline);
      } else {
        pool.queue.push(pipeline);
        console.log(`  [Scheduler] ⏳ Queued   ${pipeline.id.slice(0,8)} → project ${pid.slice(0,8)} (both workers busy, queue: ${pool.queue.length})`);
      }
    }
  },

  _launch(projectId, pool, pipeline) {
    pool.active++;
    this.processing.add(pipeline.id);
    const cfg = this.configFor(projectId);

    launchOrchestratorAgent(pipeline, cfg)
      .catch(err => console.error(`  [Scheduler] Orchestrator error: ${err.message}`))
      .finally(() => {
        pool.active--;
        this.processing.delete(pipeline.id);
        console.log(`  [Scheduler] ✔ Done     ${pipeline.id.slice(0,8)} → project ${projectId.slice(0,8)} (${pool.active}/${CONFIG.MAX_WORKERS} active, ${pool.queue.length} queued)`);
        if (pool.queue.length > 0) {
          const next = pool.queue.shift();
          console.log(`  [Scheduler] ✓ Assigning queued ${next.id.slice(0,8)} → project ${projectId.slice(0,8)}`);
          this._launch(projectId, pool, next);
        }
      });
  },

  configFor(projectId) {
    const pc = this.projectConfigs[projectId] || {};
    const ac = this.agentConfig;
    return {
      projectPath:    pc.projectPath    || ac.projectPath    || process.cwd(),
      buildCommand:   pc.buildCommand   || ac.buildCommand   || 'npm run build',
      restartCommand: pc.restartCommand || ac.restartCommand || 'pm2 restart all',
      gitRepoUrl:     pc.gitRepoUrl     || '',
      testCommand:    pc.testCommand    || '',
      gitBranch:      ac.gitBranch      || 'main',
    };
  },

  status() {
    const lines = [];
    for (const [pid, pool] of Object.entries(this.pools)) {
      if (pool.active > 0 || pool.queue.length > 0)
        lines.push(`    project ${pid.slice(0,8)}: ${pool.active}/${CONFIG.MAX_WORKERS} workers active, ${pool.queue.length} queued`);
    }
    return lines.length ? lines.join('\n') : '    idle — no active projects';
  },
};

// ─── Severity filter ──────────────────────────────────────────────────────────
// Skips non-critical errors before spinning up a Claude orchestrator.
function isCriticalError(pipeline) {
  const msg   = (pipeline.errorMessage || '').toLowerCase();
  const stack = (pipeline.errorStack   || '').toLowerCase();
  const level = (pipeline.errorLevel   || pipeline.severity || '').toLowerCase();

  if (['fatal', 'critical'].includes(level)) return { critical: true };
  if (['warning', 'warn', 'info', 'debug'].includes(level))
    return { critical: false, reason: `severity=${level}` };

  const statusMatch = msg.match(/\b([1-5]\d{2})\b/);
  if (statusMatch) {
    const code = parseInt(statusMatch[1]);
    if (code >= 400 && code < 500)
      return { critical: false, reason: `HTTP ${code} (client error)` };
    if (code >= 500) return { critical: true };
  }

  const SKIP = [
    'validationerror','validation error','validation failed',
    'unauthorizederror','unauthorized','authentication failed','invalid token',
    'notfounderror','not found','resource not found',
    'forbidden','access denied','permission denied',
    'ratelimiterror','rate limit','too many requests',
    'deprecationwarning','unique constraint',
    'badrequest','bad request','invalid input',
  ];
  for (const p of SKIP)
    if (msg.includes(p)) return { critical: false, reason: `matches skip pattern: "${p}"` };

  const CRITICAL = [
    'unhandledpromiserejection','uncaughtexception',
    'cannot read propert','is not a function','is not defined',
    'typeerror','referenceerror','syntaxerror',
    'econnrefused','enotfound','econnreset','etimedout',
    'out of memory','heap out of memory',
    'module not found','cannot find module',
    'database connection','connection refused','connection lost',
    'server crashed','process exited','fatal error',
    'failed to start','failed to connect',
    'prismaerror','prisma','sequelizeconnectionerror',
    'error: listen','address already in use',
  ];
  for (const p of CRITICAL)
    if (msg.includes(p) || stack.includes(p)) return { critical: true };

  return { critical: false, reason: 'not matched as a known critical pattern' };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function crmRequest(endpoint, method, body, retries = 3) {
  const attempt = () => new Promise((resolve, reject) => {
    const url  = new URL(CONFIG.CRM_URL + '/api/agent-webhook' + endpoint);
    const lib  = url.protocol === 'https:' ? https : http;
    const req  = lib.request({
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname + url.search,
      method:   method || 'GET',
      headers:  { 'Content-Type': 'application/json', 'x-agent-key': CONFIG.AGENT_KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  const run = (left) =>
    attempt().catch(err => {
      if (left <= 1) throw err;
      console.warn(`  CRM request failed (${err.message}), retrying in 3s...`);
      return new Promise(r => setTimeout(r, 3000)).then(() => run(left - 1));
    });

  return run(retries);
}

// ─── Run Claude Code ──────────────────────────────────────────────────────────
function runClaudeCode(prompt, cwd, model) {
  return new Promise((resolve) => {
    const args = ['--print', '--dangerously-skip-permissions', '--output-format', 'json'];
    if (model) args.push('--model', model);

    console.log(`  [Claude] Starting orchestrator (model: ${model || 'default'})`);
    console.log(`  [Claude] Working dir: ${cwd}`);
    console.log(`  [Claude] Prompt size: ${prompt.length} chars`);

    const child = spawn('claude', args, {
      cwd,
      timeout: 600000,
      env:     { ...process.env },
      shell:   true,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let raw = '', errOut = '';
    child.stdout.on('data', d => { raw    += d.toString(); });
    child.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d); });

    child.on('close', code => {
      console.log(`\n  [Claude] Exited with code: ${code}`);
      let output = raw;
      let inputTokens = 0, outputTokens = 0, costUsd = 0;
      try {
        const parsed = JSON.parse(raw.trim());
        output       = parsed.result || parsed.content || raw;
        costUsd      = parsed.total_cost_usd ?? parsed.cost_usd ?? 0;
        inputTokens  = parsed.usage?.input_tokens  ?? 0;
        outputTokens = parsed.usage?.output_tokens ?? 0;
        console.log(`  [Claude] Tokens — in: ${inputTokens}  out: ${outputTokens}  cost: $${costUsd.toFixed(4)}`);
      } catch { /* older claude — use raw output */ }

      resolve({
        success:      code === 0 || output.length > 0,
        output:       output || errOut,
        error:        code !== 0 ? (errOut || `Exit code ${code}`) : undefined,
        inputTokens, outputTokens, costUsd,
      });
    });

    child.on('error', err => {
      console.error('  [Claude] Failed to start:', err.message);
      resolve({ success: false, output: '', error: err.message, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    });
  });
}

// ─── Orchestrator prompt builder ──────────────────────────────────────────────
// Produces the prompt given to the Claude Code orchestrator agent.
// The orchestrator uses the Agent tool to spawn sub-agents that do the actual work.
function buildOrchestratorPrompt(pipeline, projectConfig) {
  const { id, status, errorMessage, errorSource, errorStack, claudeFixSummary, geminiSuggestion, geminiAnalysis } = pipeline;
  const { projectPath, buildCommand, restartCommand, gitRepoUrl, gitBranch } = projectConfig;

  // Helpers for sub-agent curl reporting
  const reportUrl  = `${CONFIG.CRM_URL}/api/agent-webhook/report`;
  const agentKey   = CONFIG.AGENT_KEY;
  const curlReport = (fields) =>
    `bash: curl -s -X POST "${reportUrl}" -H "Content-Type: application/json" -H "x-agent-key: ${agentKey}" ` +
    `-d '${JSON.stringify({ pipelineId: id, ...fields })}'`;

  // ── ANALYSIS phase ─────────────────────────────────────────────────────────
  if (status === 'ANALYZING') {
    const suggestion = geminiSuggestion || geminiAnalysis || '';

    return `You are the orchestrator agent for auto-fix pipeline ${id}.

Your task: use the Agent tool to spawn an analysis sub-agent, then wait for it to finish.

═══ SUB-AGENT INSTRUCTIONS ═══
Spawn ONE sub-agent with this exact task:

You are an analysis agent. Analyze this production error:

ERROR MESSAGE : ${errorMessage}
ERROR SOURCE  : ${errorSource || 'unknown'}
PROJECT PATH  : ${projectPath}
${errorStack  ? `\nSTACK TRACE:\n${errorStack.split('\n').slice(0, 25).join('\n')}` : ''}
${suggestion  ? `\nGEMINI SUGGESTION:\n${suggestion.substring(0, 400)}` : ''}

Steps:
1. Read the relevant source files in ${projectPath} to understand the root cause
2. Identify the exact file(s) and line number(s) where the bug lives
3. Describe the fix clearly in 2-3 sentences (do NOT edit any files yet — analysis only)
4. Report your findings to the CRM with this bash command:
   curl -s -X POST "${reportUrl}" \\
     -H "Content-Type: application/json" \\
     -H "x-agent-key: ${agentKey}" \\
     -d '{"pipelineId":"${id}","stage":"FIX_PROPOSED","claudeFixSummary":"<your analysis here — file, line, what to change and why>"}'

Do not ask for confirmation. Do not skip the curl command.
═══ END SUB-AGENT INSTRUCTIONS ═══

After the sub-agent completes, your job is done. Do not make any other tool calls.`;
  }

  // ── FIX phase ──────────────────────────────────────────────────────────────
  if (status === 'APPROVED') {
    const fixPlan     = claudeFixSummary || geminiSuggestion || '';
    const branchName  = `fix/auto-${id.substring(0, 8)}-${Date.now()}`;
    const hasGit      = !!gitRepoUrl;

    return `You are the orchestrator agent for auto-fix pipeline ${id}.

Your task: use the Agent tool to spawn a fix sub-agent, then wait for it to finish.

═══ SUB-AGENT INSTRUCTIONS ═══
Spawn ONE sub-agent with this exact task:

You are a fix agent. Apply the approved fix for this error:

ERROR MESSAGE : ${errorMessage}
ERROR SOURCE  : ${errorSource || 'unknown'}
PROJECT PATH  : ${projectPath}
${fixPlan     ? `\nAPPROVED FIX PLAN:\n${fixPlan.substring(0, 500)}` : ''}
${errorStack  ? `\nSTACK TRACE:\n${errorStack.split('\n').slice(0, 20).join('\n')}` : ''}

Steps (execute in order, do not skip any):

1. Report that you are starting:
   curl -s -X POST "${reportUrl}" \\
     -H "Content-Type: application/json" \\
     -H "x-agent-key: ${agentKey}" \\
     -d '{"pipelineId":"${id}","stage":"FIXING","claudeFixSummary":"Applying fix..."}'

${hasGit ? `2. Create a git branch:
   cd ${projectPath} && git checkout -b ${branchName}
` : `2. (No git repo configured — apply fix directly to files)
`}
3. Edit the file(s) in ${projectPath} to fix the bug. Change only the minimum code necessary.

4. Detect changed files:
   cd ${projectPath} && git diff --name-only

${hasGit ? `5. Commit the changes:
   cd ${projectPath} && git add -A && git commit -m "fix: auto-fix ${(errorSource || 'error').substring(0, 40)}"
   cd ${projectPath} && git push origin ${branchName}
` : `5. (Skipping git commit — no remote configured)
`}
6. Build the project:
   cd ${projectPath} && ${buildCommand}

7. Restart the service:
   cd ${projectPath} && ${restartCommand}

8. Report completion:
   curl -s -X POST "${reportUrl}" \\
     -H "Content-Type: application/json" \\
     -H "x-agent-key: ${agentKey}" \\
     -d '{"pipelineId":"${id}","stage":"DEPLOYED","claudeFixSummary":"<describe what files you changed and why>","branchName":"${hasGit ? branchName : ''}","filesChanged":["file1.ts","file2.ts"]}'

If any step fails, report the error:
   curl -s -X POST "${reportUrl}" \\
     -H "Content-Type: application/json" \\
     -H "x-agent-key: ${agentKey}" \\
     -d '{"pipelineId":"${id}","error":"<what failed and why>"}'

Do not ask for confirmation. Execute all steps.
═══ END SUB-AGENT INSTRUCTIONS ═══

After the sub-agent completes, your job is done. Do not make any other tool calls.`;
  }

  // Fallback — unknown status
  return `Pipeline ${id} is in status "${status}" which requires no action from the orchestrator.`;
}

// ─── Launch orchestrator ──────────────────────────────────────────────────────
async function launchOrchestratorAgent(pipeline, projectConfig) {
  console.log(`\n  [Orchestrator] Pipeline ${pipeline.id} — status: ${pipeline.status}`);
  console.log(`  [Orchestrator] Error: ${pipeline.errorMessage.substring(0, 100)}`);

  // Severity gate — skip non-critical errors before burning tokens
  const sev = isCriticalError(pipeline);
  if (!sev.critical) {
    console.log(`  [Orchestrator] SKIPPED — ${sev.reason}`);
    await crmRequest('/report', 'POST', {
      pipelineId: pipeline.id,
      stage:      'SKIPPED',
      claudeFixSummary: `Auto-fix skipped: ${sev.reason}. Only system-breaking errors are auto-fixed.`,
    }).catch(() => {});
    return;
  }

  console.log(`  [Orchestrator] CRITICAL — launching orchestrator agent`);

  const prompt = buildOrchestratorPrompt(pipeline, projectConfig);
  const result = await runClaudeCode(prompt, projectConfig.projectPath, CONFIG.MODEL);

  // Report token cost (orchestrator overhead)
  if (result.inputTokens || result.outputTokens || result.costUsd) {
    await crmRequest('/report', 'POST', {
      pipelineId:   pipeline.id,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd:      result.costUsd,
    }).catch(() => {});
  }

  if (!result.success) {
    console.error(`  [Orchestrator] Failed: ${result.error}`);
    await crmRequest('/report', 'POST', {
      pipelineId: pipeline.id,
      error:      result.error || 'Orchestrator agent failed',
    }).catch(() => {});
  }
}

// ─── Main poll loop ───────────────────────────────────────────────────────────
async function poll() {
  try {
    const response = await crmRequest('/heartbeat', 'POST', {});
    const { pendingPipelines = [], projectConfigs = {}, agentConfig = {} } = response;

    scheduler.update(pendingPipelines, projectConfigs, agentConfig);

    if (pendingPipelines.length > 0) {
      console.log(`  Heartbeat: ${pendingPipelines.length} pipeline(s) received`);
      console.log(scheduler.status());
    }
  } catch (err) {
    console.error(`  Heartbeat failed: ${err.message}`);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
console.log('Agent started. Polling for work...\n');
poll();
setInterval(poll, CONFIG.POLL_INTERVAL);
