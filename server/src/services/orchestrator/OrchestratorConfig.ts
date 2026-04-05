/**
 * Orchestrator configuration — reads from process.env with sensible defaults.
 */
export const config = {
  maxWorkers: parseInt(process.env.MAX_WORKERS || '5', 10),
  maxPerProject: parseInt(process.env.MAX_PER_PROJECT || '2', 10),
  claudeTimeout: parseInt(process.env.CLAUDE_TIMEOUT || '600000', 10),
  worktreeBaseDir: process.env.WORKTREE_BASE_DIR || '/tmp/orchestrator-fixes',
  githubToken: process.env.GITHUB_TOKEN || '',
  claudeCommand: process.env.CLAUDE_COMMAND || 'claude',
};
