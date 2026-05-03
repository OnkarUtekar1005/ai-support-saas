#!/usr/bin/env node

/**
 * CRM of Techview — VPS Agent
 *
 * This runs on your VPS alongside your application.
 * It polls the CRM for pending auto-fix pipelines,
 * runs Claude Code CLI to analyze/fix errors,
 * and reports results back to the CRM.
 *
 * Setup:
 *   1. Copy this file to your VPS
 *   2. Set environment variables (see below)
 *   3. Run: node agent.js
 *
 * Requirements:
 *   - Node.js 18+
 *   - Claude Code CLI installed (`claude` command available)
 *   - Git configured
 */

const { execSync, spawn } = require('child_process');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ─── Configuration (set via environment or edit here) ───
const CONFIG = {
  CRM_URL:      process.env.CRM_URL      || 'http://localhost:3001',
  AGENT_KEY:    process.env.AGENT_KEY    || '',
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '30000'),
  PROJECT_PATH: process.env.PROJECT_PATH || process.cwd(),
  // Haiku for both steps — cheap, fast, sufficient for targeted single-file fixes
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'claude-haiku-4-5-20251001',
  FIX_MODEL:      process.env.FIX_MODEL      || 'claude-haiku-4-5-20251001',
};

// ─── Token budget (tune via env vars) ───
const BUDGET = {
  STACK_LINES:      parseInt(process.env.MAX_STACK_LINES      || '20'),
  GEMINI_CHARS:     parseInt(process.env.MAX_GEMINI_CHARS     || '400'),
  SUGGESTION_CHARS: parseInt(process.env.MAX_SUGGESTION_CHARS || '200'),
  FIX_SUMMARY_CHARS:parseInt(process.env.MAX_FIX_SUMMARY_CHARS|| '400'),
  SNIPPET_LINES:    parseInt(process.env.SNIPPET_LINES        || '30'), // lines of code context
};

// Trim a stack trace to its top N non-empty lines
function trimStack(stack) {
  if (!stack) return '';
  const lines = stack.split('\n').filter(l => l.trim());
  const kept = lines.slice(0, BUDGET.STACK_LINES);
  if (lines.length > BUDGET.STACK_LINES) {
    kept.push(`[+${lines.length - BUDGET.STACK_LINES} lines omitted]`);
  }
  return kept.join('\n');
}

// Hard-truncate a string to maxChars
function trunc(str, maxChars) {
  if (!str || str.length <= maxChars) return str || '';
  return str.substring(0, maxChars) + '…[truncated]';
}

// Extract the first project-relative file:line from a Node.js stack trace.
// e.g. "at handler (/home/app/src/routes/gallery.ts:45:12)" → { file: 'src/routes/gallery.ts', line: 45 }
function extractFileFromStack(stack) {
  if (!stack) return null;
  const base = CONFIG.PROJECT_PATH.replace(/\\/g, '/').replace(/\/$/, '');
  for (const raw of stack.split('\n')) {
    const line = raw.replace(/\\/g, '/');
    // Matches: (absolute/path/file.ext:LINE:COL) or (absolute/path/file.ext:LINE)
    const m = line.match(/\((.+?\.(?:ts|js|py|rb|go|java|cs|php|rs)):(\d+)(?::\d+)?\)/);
    if (!m) continue;
    const abs = m[1];
    if (abs.startsWith(base)) {
      return { file: abs.slice(base.length).replace(/^\//, ''), line: parseInt(m[2]) };
    }
  }
  return null;
}

// Read BUDGET.SNIPPET_LINES lines around targetLine from a project file.
// Marks the error line with >>>. Returns null if file unreadable.
function readFileSnippet(relFile, targetLine) {
  try {
    const abs = path.join(CONFIG.PROJECT_PATH, relFile);
    const lines = fs.readFileSync(abs, 'utf-8').split('\n');
    const half  = Math.floor(BUDGET.SNIPPET_LINES / 2);
    const start = Math.max(0, targetLine - half - 1);
    const end   = Math.min(lines.length, targetLine + half);
    return lines.slice(start, end)
      .map((l, i) => {
        const n = start + i + 1;
        return `${n === targetLine ? '>>>' : '   '} ${String(n).padStart(4)} ${l}`;
      })
      .join('\n');
  } catch {
    return null;
  }
}

if (!CONFIG.AGENT_KEY) {
  console.error('ERROR: AGENT_KEY is required. Set it via environment variable or edit agent.js');
  console.error('Get your agent key from CRM → Admin → Pipeline → Register Agent');
  process.exit(1);
}

console.log('═══════════════════════════════════════════');
console.log('  CRM of Techview — VPS Agent');
console.log('═══════════════════════════════════════════');
console.log(`  CRM URL:      ${CONFIG.CRM_URL}`);
console.log(`  Project Path: ${CONFIG.PROJECT_PATH}`);
console.log(`  Poll Interval: ${CONFIG.POLL_INTERVAL / 1000}s`);
console.log('═══════════════════════════════════════════\n');

// ─── HTTP helper ───
function crmRequest(endpoint, method, body, retries = 3) {
  const attempt = () => new Promise((resolve, reject) => {
    const url = new URL(CONFIG.CRM_URL + '/api/agent-webhook' + endpoint);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-key': CONFIG.AGENT_KEY,
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  const run = (attemptsLeft) =>
    attempt().catch((err) => {
      if (attemptsLeft <= 1) throw err;
      console.warn(`  CRM request failed (${err.message}), retrying in 3s...`);
      return new Promise((r) => setTimeout(r, 3000)).then(() => run(attemptsLeft - 1));
    });

  return run(retries);
}

// ─── Run a shell command and capture output ───
function runCommand(cmd, cwd) {
  try {
    const output = execSync(cmd, {
      cwd: cwd || CONFIG.PROJECT_PATH,
      encoding: 'utf-8',
      timeout: 300000, // 5 min
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    return {
      success: false,
      output: (err.stdout || '') + '\n' + (err.stderr || ''),
      error: err.message,
    };
  }
}

// ─── Error severity filter ───
// Returns { critical: true } for system-breaking errors that warrant auto-fix.
// Returns { critical: false, reason } for errors to skip (noise, user errors, etc.)
function isCriticalError(pipeline) {
  const msg   = (pipeline.errorMessage || '').toLowerCase();
  const stack = (pipeline.errorStack   || '').toLowerCase();
  const src   = (pipeline.errorSource  || '').toLowerCase();
  const level = (pipeline.errorLevel   || pipeline.severity || '').toLowerCase();

  // ── 1. Explicit severity field (if CRM sends it) ──────────────────────────
  if (['fatal', 'critical'].includes(level)) return { critical: true };
  if (['warning', 'warn', 'info', 'debug'].includes(level)) {
    return { critical: false, reason: `severity=${level}` };
  }

  // ── 2. HTTP status codes — only 5xx warrants a fix ───────────────────────
  const statusMatch = msg.match(/\b([1-5]\d{2})\b/) || src.match(/\b([1-5]\d{2})\b/);
  if (statusMatch) {
    const code = parseInt(statusMatch[1]);
    if (code >= 400 && code < 500) {
      return { critical: false, reason: `HTTP ${code} (client error — not a code bug)` };
    }
    if (code >= 500) return { critical: true };
  }

  // ── 3. Non-critical error type keywords ──────────────────────────────────
  const SKIP_TYPES = [
    'validationerror', 'validation error', 'validation failed',
    'unauthorizederror', 'unauthorized', 'authentication failed', 'invalid token',
    'notfounderror', 'not found', 'resource not found', 'route not found',
    'forbidden', 'access denied', 'permission denied',
    'ratelimiterror', 'rate limit', 'too many requests',
    'deprecationwarning', 'deprecation warning',
    'sequelizeuniqueconstranterror', 'unique constraint',
    'badrequest', 'bad request', 'invalid input', 'invalid request',
  ];
  for (const pattern of SKIP_TYPES) {
    if (msg.includes(pattern)) {
      return { critical: false, reason: `matches non-critical pattern: "${pattern}"` };
    }
  }

  // ── 4. Critical error type keywords ─────────────────────────────────────
  const CRITICAL_TYPES = [
    'unhandledpromiserejection', 'uncaughtexception',
    'cannot read propert', 'cannot read properties',  // NullPointerException equiv
    'is not a function', 'is not defined',
    'typeerror', 'referenceerror', 'syntaxerror',
    'econnrefused', 'enotfound', 'econnreset', 'etimedout',  // network/DB unreachable
    'out of memory', 'heap out of memory', 'javascript heap',
    'module not found', "cannot find module",
    'database connection', 'connection refused', 'connection lost',
    'server crashed', 'process exited', 'fatal error',
    'failed to start', 'failed to connect',
    'prismaerror', 'prisma', 'sequelizeconnectionerror',
    'error: listen', 'address already in use',
  ];
  for (const pattern of CRITICAL_TYPES) {
    if (msg.includes(pattern) || stack.includes(pattern)) {
      return { critical: true };
    }
  }

  // ── 5. Default: skip unknown errors (conservative — avoids wasting tokens) ─
  return { critical: false, reason: 'not matched as a known critical pattern — skipped by default' };
}

// ─── Run Claude Code CLI ───
// Pass model='' to use the default configured model
function runClaudeCode(prompt, projectPath, model) {
  return new Promise((resolve) => {
    const args = ['--print', '--dangerously-skip-permissions', '--output-format', 'json'];
    if (model) args.push('--model', model);

    console.log('  Running Claude Code CLI...');
    console.log('  Working dir:', projectPath || CONFIG.PROJECT_PATH);
    console.log('  Model:', model || '(default)');
    console.log(`  Prompt size: ${prompt.length} chars`);

    const child = spawn('claude', args, {
      cwd: projectPath || CONFIG.PROJECT_PATH,
      timeout: 600000,
      env: { ...process.env },
      shell: true,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let raw = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => { raw += data.toString(); });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      console.log('\n  Claude Code exited with code:', code);

      // Parse JSON output to extract text + token usage
      let output = raw;
      let inputTokens = 0, outputTokens = 0, costUsd = 0;

      try {
        const parsed = JSON.parse(raw.trim());
        output = parsed.result || parsed.content || raw;
        costUsd      = parsed.total_cost_usd ?? parsed.cost_usd ?? 0;
        inputTokens  = parsed.usage?.input_tokens  ?? 0;
        outputTokens = parsed.usage?.output_tokens ?? 0;
        console.log(`  Tokens — in: ${inputTokens}  out: ${outputTokens}  cost: $${costUsd.toFixed(4)}`);
      } catch {
        // Not JSON (older claude version) — use raw output, no cost data
        process.stdout.write(raw);
      }

      if (code === 0 || output.length > 0) {
        resolve({ success: true, output: output || errorOutput, inputTokens, outputTokens, costUsd });
      } else {
        resolve({ success: false, output, error: errorOutput || 'Exit code: ' + code, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      }
    });

    child.on('error', (err) => {
      console.error('  Failed to start Claude Code:', err.message);
      resolve({ success: false, output: '', error: 'Failed to start claude: ' + err.message, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    });
  });
}

// ─── Process a pipeline ───
async function processPipeline(pipeline) {
  const id = pipeline.id;
  console.log(`\n  Processing pipeline: ${id}`);
  console.log(`  Error: ${pipeline.errorMessage.substring(0, 100)}`);

  // ── Severity gate: skip non-critical errors ───────────────────────────────
  const severity = isCriticalError(pipeline);
  if (!severity.critical) {
    console.log(`  [SKIPPED] Not a critical/system-breaking error.`);
    console.log(`  Reason: ${severity.reason}`);
    await crmRequest('/report', 'POST', {
      pipelineId: id,
      stage: 'SKIPPED',
      claudeFixSummary: `Auto-fix skipped: ${severity.reason}. Only system-breaking errors are auto-fixed.`,
    }).catch(() => {});
    return;
  }
  console.log(`  [CRITICAL] Proceeding with auto-fix.`);

  // Accumulate tokens/cost across all Claude calls for this pipeline
  let totalInputTokens = 0, totalOutputTokens = 0, totalCostUsd = 0;

  try {
    // Step 1: Analyze
    if (pipeline.status === 'ANALYZING') {
      console.log('\n  [1/5] Analyzing...');

      const fileHint = extractFileFromStack(pipeline.errorStack);
      const snippet  = fileHint ? readFileSnippet(fileHint.file, fileHint.line) : null;
      const hasGemini = !!(pipeline.geminiSuggestion || pipeline.geminiAnalysis);

      if (snippet && fileHint) {
        // ── Fast path: we have the exact file + code ─────────────────────────
        // Skip a separate analysis call entirely — go straight to AWAITING_APPROVAL
        // with a description built from what we already know.
        console.log(`  File identified: ${fileHint.file}:${fileHint.line} — skipping analysis call`);
        const summary =
          `File: ${fileHint.file} line ${fileHint.line}\n` +
          `Error: ${pipeline.errorMessage}\n` +
          (hasGemini ? `Suggestion: ${trunc(pipeline.geminiSuggestion || pipeline.geminiAnalysis, BUDGET.GEMINI_CHARS)}` : '');

        await crmRequest('/report', 'POST', {
          pipelineId: id,
          stage: 'FIX_PROPOSED',
          claudeOutput: summary,
          claudeFixSummary: summary,
        });
      } else {
        // ── Slow path: need Claude to locate the file ─────────────────────────
        const analysisPrompt = pipeline.claudePrompt || (hasGemini
          ? `Error in ${pipeline.errorSource || 'app'}:\nERROR: ${pipeline.errorMessage}\nGEMINI FIX: ${trunc(pipeline.geminiSuggestion || pipeline.geminiAnalysis, BUDGET.GEMINI_CHARS)}\n\nIdentify the exact file and line to change. Give a 1-sentence fix plan. Do NOT edit files.`
          : `Error in ${pipeline.errorSource || 'app'}:\nERROR: ${pipeline.errorMessage}\nSTACK:\n${trimStack(pipeline.errorStack)}\n\nFind the root cause file and line, describe the fix in 2 sentences. Do NOT edit files.`
        );

        const result = await runClaudeCode(analysisPrompt, CONFIG.PROJECT_PATH, CONFIG.ANALYSIS_MODEL);
        totalInputTokens  += result.inputTokens  || 0;
        totalOutputTokens += result.outputTokens || 0;
        totalCostUsd      += result.costUsd      || 0;

        await crmRequest('/report', 'POST', {
          pipelineId: id,
          stage: 'FIX_PROPOSED',
          claudeOutput: result.output,
          claudeFixSummary: result.output.substring(0, 2000),
          error: result.success ? undefined : result.error,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
        });
      }

      console.log('  Analysis complete. Waiting for approval...');
    }

    // Step 2: Apply fix (only if APPROVED)
    if (pipeline.status === 'APPROVED') {
      console.log('\n  [2/5] Creating fix branch...');

      // Create a new branch
      const branchName = `fix/auto-${id.substring(0, 8)}-${Date.now()}`;
      const branchResult = runCommand(`git checkout -b ${branchName}`);
      if (!branchResult.success) {
        // If branch exists, just checkout
        runCommand(`git checkout -B ${branchName}`);
      }

      console.log(`  Branch: ${branchName}`);

      // Step 3: Apply the fix with Claude Code
      console.log('\n  [3/5] Applying fix with Claude Code...');

      // Build the tightest possible fix prompt — include the code snippet if we have it
      // so Claude edits the file directly without any search tool calls.
      const fileHint = extractFileFromStack(pipeline.errorStack);
      const snippet  = fileHint ? readFileSnippet(fileHint.file, fileHint.line) : null;

      let fixPrompt;
      if (snippet && fileHint) {
        fixPrompt =
          `Fix the bug in ${fileHint.file} (>>> marks line ${fileHint.line}):\n` +
          `ERROR: ${pipeline.errorMessage}\n` +
          (pipeline.claudeFixSummary ? `FIX PLAN: ${trunc(pipeline.claudeFixSummary, BUDGET.FIX_SUMMARY_CHARS)}\n` : '') +
          `\nCODE:\n\`\`\`\n${snippet}\n\`\`\`\n\n` +
          `Edit ${fileHint.file} to fix the bug. Change only the minimum needed.`;
      } else if (pipeline.claudeFixSummary) {
        fixPrompt =
          `Fix this error with minimal changes:\n` +
          `ERROR: ${pipeline.errorMessage}\n` +
          `FIX PLAN: ${trunc(pipeline.claudeFixSummary, BUDGET.FIX_SUMMARY_CHARS)}\n\n` +
          `Apply the fix now. Edit only what's necessary.`;
      } else {
        fixPrompt =
          `Fix this error:\nERROR: ${pipeline.errorMessage}\n` +
          `${trimStack(pipeline.errorStack) ? `STACK:\n${trimStack(pipeline.errorStack)}\n` : ''}` +
          `${pipeline.geminiSuggestion ? `SUGGESTION: ${trunc(pipeline.geminiSuggestion, BUDGET.SUGGESTION_CHARS)}\n` : ''}` +
          `Apply the minimal fix now.`;
      }

      await crmRequest('/report', 'POST', { pipelineId: id, stage: 'FIXING' });

      const fixResult = await runClaudeCode(fixPrompt, CONFIG.PROJECT_PATH, CONFIG.FIX_MODEL);
      totalInputTokens  += fixResult.inputTokens  || 0;
      totalOutputTokens += fixResult.outputTokens || 0;
      totalCostUsd      += fixResult.costUsd      || 0;

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: fixResult.success ? 'COMMITTED' : 'FAILED',
        claudeOutput: fixResult.output,
        claudeFixSummary: (fixResult.output || '').substring(0, 2000),
        error: fixResult.success ? undefined : (fixResult.error || 'Claude Code failed'),
        inputTokens: fixResult.inputTokens,
        outputTokens: fixResult.outputTokens,
        costUsd: fixResult.costUsd,
      });

      if (!fixResult.success) {
        console.log('  Claude Code failed. See CRM for details.');
        return;
      }

      // Step 4: Git commit + push — only if a remote repo is configured on the pipeline
      console.log('\n  [4/5] Git...');

      var filesChanged = [];
      var commitHash = '';
      var branchNameUsed = '';
      var gitRepoUrl = pipeline.gitRepoUrl || '';

      // Always detect which files Claude changed (for reporting)
      var diffResult = runCommand('git diff --name-only');
      filesChanged = (diffResult.output || '').split('\n').filter(Boolean);
      console.log('  Files changed by Claude: ' + (filesChanged.length > 0 ? filesChanged.join(', ') : 'none'));

      if (gitRepoUrl) {
        // Git configured — commit to a branch and push
        branchNameUsed = branchName;
        if (filesChanged.length > 0) {
          runCommand('git add ' + filesChanged.map(f => '"' + f + '"').join(' '));
          var commitMsg = 'fix: auto-fix ' + pipeline.errorSource + ' — ' + pipeline.errorMessage.substring(0, 60);
          runCommand('git commit -m "' + commitMsg + '"');
          var hashResult = runCommand('git rev-parse --short HEAD');
          commitHash = hashResult.output;
          runCommand('git push origin ' + branchNameUsed);
          console.log('  Committed & pushed: ' + commitHash);
        } else {
          console.log('  No files changed.');
        }
      } else {
        // No git config — fix is applied directly to files, no commit needed
        console.log('  No git repo configured — fix applied directly to files.');
      }

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'COMMITTED',
        filesChanged,
        branchName: branchNameUsed,
        commitHash,
        claudeFixSummary: gitRepoUrl
          ? (commitHash ? `Committed ${filesChanged.length} file(s) to ${branchNameUsed}` : 'No files changed')
          : `Fix applied directly to ${filesChanged.length} file(s) — no git commit (not configured)`,
      });

      // Step 5: Deploy
      console.log('\n  [5/5] Deploying...');

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'DEPLOYING',
      });

      // Try build and restart (skip if commands don't exist)
      var deployLog = [];
      var buildResult = runCommand(pipeline.buildCommand || 'npm run build');
      deployLog.push('BUILD: ' + (buildResult.success ? 'OK' : 'skipped'));

      var restartResult = runCommand(pipeline.restartCommand || 'pm2 restart all');
      deployLog.push('RESTART: ' + (restartResult.success ? 'OK' : 'skipped'));

      console.log(`\n  ── Total cost for this pipeline ──`);
      console.log(`     Input tokens : ${totalInputTokens}`);
      console.log(`     Output tokens: ${totalOutputTokens}`);
      console.log(`     Cost (USD)   : $${totalCostUsd.toFixed(4)}`);

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'DEPLOYED',
        deployLog: deployLog.join('\\n'),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd: totalCostUsd,
      });

      console.log('  Pipeline complete!');
    }

  } catch (err) {
    console.error(`  Pipeline error: ${err.message}`);
    await crmRequest('/report', 'POST', {
      pipelineId: id,
      error: err.message,
    }).catch(() => {});
  }
}

// ─── Main poll loop ───
async function poll() {
  try {
    const response = await crmRequest('/heartbeat', 'POST', {});

    if (response.pendingPipelines && response.pendingPipelines.length > 0) {
      console.log(`  ${response.pendingPipelines.length} pending pipeline(s) found`);

      for (const pipeline of response.pendingPipelines) {
        await processPipeline(pipeline);
      }
    }
  } catch (err) {
    console.error(`  Heartbeat failed: ${err.message}`);
  }
}

// ─── Start ───
console.log('Agent started. Polling for work...\n');
poll(); // Initial poll
setInterval(poll, CONFIG.POLL_INTERVAL);
