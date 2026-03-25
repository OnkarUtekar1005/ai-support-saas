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
const http = require('http');

// ─── Configuration (set via environment or edit here) ───
const CONFIG = {
  CRM_URL: process.env.CRM_URL || 'http://localhost:3001',
  AGENT_KEY: process.env.AGENT_KEY || '', // Get from CRM → Pipeline → Agents
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '30000'), // 30 seconds
  PROJECT_PATH: process.env.PROJECT_PATH || process.cwd(),
};

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
function crmRequest(endpoint, method, body) {
  return new Promise((resolve, reject) => {
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

// ─── Run Claude Code CLI ───
function runClaudeCode(prompt, projectPath) {
  return new Promise((resolve, reject) => {
    console.log('  Running Claude Code CLI...');
    console.log('  Working dir:', projectPath || CONFIG.PROJECT_PATH);

    console.log('  Sending prompt via stdin to: claude --print --dangerously-skip-permissions');

    const child = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
    ], {
      cwd: projectPath || CONFIG.PROJECT_PATH,
      timeout: 600000,
      env: { ...process.env },
      shell: true,
    });

    // Send prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      // Don't treat all stderr as error — claude outputs progress to stderr
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      console.log('\n  Claude Code exited with code:', code);
      if (code === 0 || output.length > 0) {
        resolve({ success: true, output: output || errorOutput });
      } else {
        resolve({ success: false, output, error: errorOutput || 'Exit code: ' + code });
      }
    });

    child.on('error', (err) => {
      console.error('  Failed to start Claude Code:', err.message);
      resolve({ success: false, output: '', error: 'Failed to start claude: ' + err.message });
    });
  });
}

// ─── Process a pipeline ───
async function processPipeline(pipeline) {
  const id = pipeline.id;
  console.log(`\n  Processing pipeline: ${id}`);
  console.log(`  Error: ${pipeline.errorMessage.substring(0, 100)}`);

  try {
    // Step 1: Analyze with Claude Code
    if (pipeline.status === 'ANALYZING') {
      console.log('\n  [1/5] Running Claude Code analysis...');

      const analysisPrompt = pipeline.claudePrompt || `
Analyze this error and tell me what the fix would be. Do NOT make changes yet.
Just explain what needs to change and why.

ERROR: ${pipeline.errorMessage}
${pipeline.errorStack ? `STACK: ${pipeline.errorStack}` : ''}
${pipeline.geminiAnalysis ? `PREVIOUS ANALYSIS: ${pipeline.geminiAnalysis}` : ''}
`;

      const result = await runClaudeCode(analysisPrompt, CONFIG.PROJECT_PATH);

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'FIX_PROPOSED',
        claudeOutput: result.output,
        claudeFixSummary: result.output.substring(0, 2000),
        error: result.success ? undefined : result.error,
      });

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

      const fixPrompt = `
Fix this error. Make the minimal change needed.

ERROR: ${pipeline.errorMessage}
${pipeline.errorStack ? `STACK: ${pipeline.errorStack}` : ''}
${pipeline.geminiAnalysis ? `ANALYSIS: ${pipeline.geminiAnalysis}` : ''}
${pipeline.geminiSuggestion ? `SUGGESTION: ${pipeline.geminiSuggestion}` : ''}
${pipeline.claudeFixSummary ? `PROPOSED FIX: ${pipeline.claudeFixSummary}` : ''}

Apply the fix now. Only change what's necessary.
`;

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'FIXING',
      });

      const fixResult = await runClaudeCode(fixPrompt, CONFIG.PROJECT_PATH);

      // Report Claude output regardless of success
      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: fixResult.success ? 'COMMITTED' : 'FAILED',
        claudeOutput: fixResult.output,
        claudeFixSummary: (fixResult.output || '').substring(0, 2000),
        error: fixResult.success ? undefined : (fixResult.error || 'Claude Code failed'),
      });

      if (!fixResult.success) {
        console.log('  Claude Code failed. See CRM for details.');
        return;
      }

      // Step 4: Try git operations (optional — skip if no git repo)
      console.log('\n  [4/5] Checking git...');

      var gitAvailable = runCommand('git status').success;
      var filesChanged = [];
      var commitHash = '';

      if (gitAvailable) {
        var diffResult = runCommand('git diff --name-only');
        filesChanged = (diffResult.output || '').split('\\n').filter(Boolean);

        if (filesChanged.length > 0) {
          runCommand('git add -A');
          var commitMsg = 'fix: auto-fix ' + pipeline.errorSource + ' — ' + pipeline.errorMessage.substring(0, 60);
          runCommand('git commit -m "' + commitMsg + '"');
          var hashResult = runCommand('git rev-parse --short HEAD');
          commitHash = hashResult.output;
          runCommand('git push origin ' + branchName);
          console.log('  Committed: ' + commitHash);
          console.log('  Files: ' + filesChanged.join(', '));
        } else {
          console.log('  No files changed by Claude Code.');
        }

        await crmRequest('/report', 'POST', {
          pipelineId: id,
          stage: 'COMMITTED',
          filesChanged: filesChanged,
          branchName: branchName,
          commitHash: commitHash,
        });
      } else {
        console.log('  No git repo found — skipping git operations.');
        await crmRequest('/report', 'POST', {
          pipelineId: id,
          stage: 'COMMITTED',
          claudeFixSummary: 'Fix applied by Claude Code (no git repo — changes applied directly)',
        });
      }

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

      await crmRequest('/report', 'POST', {
        pipelineId: id,
        stage: 'DEPLOYED',
        deployLog: deployLog.join('\\n'),
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
