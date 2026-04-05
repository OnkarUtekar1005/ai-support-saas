import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { Octokit } from '@octokit/rest';
import { config } from './OrchestratorConfig';
import { logger } from './OrchestratorLogger';

export interface CommitInfo {
  hash: string;
  branch: string;
  filesChanged: string[];
}

export interface PRInfo {
  url: string;
  number: number;
}

export class GitService {
  private static octokit: Octokit | null = null;

  private static getOctokit(): Octokit {
    if (!this.octokit) {
      if (!config.githubToken) {
        throw new Error('GITHUB_TOKEN not configured — cannot create PRs');
      }
      this.octokit = new Octokit({ auth: config.githubToken });
    }
    return this.octokit;
  }

  /**
   * Create a git worktree for an isolated fix.
   * Returns the worktree path.
   */
  static createWorktree(repoPath: string, branchName: string): string {
    const worktreePath = `${config.worktreeBaseDir}/${branchName}`;

    // Ensure base directory exists
    mkdirSync(config.worktreeBaseDir, { recursive: true });

    // Clean up if exists from a previous failed run
    if (existsSync(worktreePath)) {
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: repoPath, encoding: 'utf-8', timeout: 15000,
        });
      } catch {
        // May fail if already removed
      }
    }

    // Create worktree with new branch
    try {
      execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
        cwd: repoPath, encoding: 'utf-8', timeout: 30000,
      });
      logger.info(`Created worktree: ${worktreePath} (branch: ${branchName})`);
    } catch (err) {
      // Branch might already exist, try checkout
      execSync(`git worktree add "${worktreePath}" -B "${branchName}"`, {
        cwd: repoPath, encoding: 'utf-8', timeout: 30000,
      });
      logger.info(`Created worktree (existing branch): ${worktreePath}`);
    }

    return worktreePath;
  }

  /**
   * Stage, commit, and push changes from a worktree.
   */
  static commitAndPush(
    worktreePath: string,
    message: string,
    branch: string
  ): CommitInfo {
    // Check for changes
    const diffOutput = execSync('git diff --name-only', {
      cwd: worktreePath, encoding: 'utf-8', timeout: 10000,
    }).trim();

    const stagedOutput = execSync('git diff --cached --name-only', {
      cwd: worktreePath, encoding: 'utf-8', timeout: 10000,
    }).trim();

    const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
      cwd: worktreePath, encoding: 'utf-8', timeout: 10000,
    }).trim();

    const allChanged = [
      ...diffOutput.split('\n'),
      ...stagedOutput.split('\n'),
      ...untrackedOutput.split('\n'),
    ].filter(Boolean);

    if (allChanged.length === 0) {
      logger.warn('No files changed — nothing to commit');
      return { hash: '', branch, filesChanged: [] };
    }

    // Stage all changes
    execSync('git add -A', {
      cwd: worktreePath, encoding: 'utf-8', timeout: 10000,
    });

    // Commit
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: worktreePath, encoding: 'utf-8', timeout: 15000,
    });

    // Get commit hash
    const hash = execSync('git rev-parse --short HEAD', {
      cwd: worktreePath, encoding: 'utf-8', timeout: 5000,
    }).trim();

    // Push
    try {
      execSync(`git push origin "${branch}"`, {
        cwd: worktreePath, encoding: 'utf-8', timeout: 60000,
      });
      logger.info(`Pushed ${hash} to origin/${branch}`);
    } catch (err) {
      logger.error(`Push failed: ${(err as Error).message}`);
      // Set upstream and retry
      execSync(`git push -u origin "${branch}"`, {
        cwd: worktreePath, encoding: 'utf-8', timeout: 60000,
      });
    }

    return { hash, branch, filesChanged: allChanged };
  }

  /**
   * Create a GitHub Pull Request.
   */
  static async createGitHubPR(
    repoUrl: string,
    branch: string,
    targetBranch: string,
    title: string,
    body: string
  ): Promise<PRInfo> {
    const octokit = this.getOctokit();
    const { owner, repo } = this.parseRepoUrl(repoUrl);

    const response = await octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head: branch,
      base: targetBranch,
    });

    logger.info(`PR created: ${response.data.html_url}`);
    return {
      url: response.data.html_url,
      number: response.data.number,
    };
  }

  /**
   * Build a PR body from pipeline data.
   */
  static buildPRBody(pipeline: {
    errorMessage: string;
    errorSource: string;
    geminiAnalysis?: string | null;
    claudeFixSummary?: string | null;
    filesChanged: string[];
    isRegression: boolean;
  }): string {
    const lines: string[] = [
      '## Auto-Fix by Orchestrator Agent',
      '',
      pipeline.isRegression ? '> **REGRESSION**: This error reappeared after a previous fix.' : '',
      '',
      '### Error',
      '```',
      `Source: ${pipeline.errorSource}`,
      pipeline.errorMessage.substring(0, 500),
      '```',
      '',
    ];

    if (pipeline.geminiAnalysis) {
      lines.push('### AI Analysis', pipeline.geminiAnalysis.substring(0, 1000), '');
    }

    if (pipeline.claudeFixSummary) {
      lines.push('### Fix Summary', pipeline.claudeFixSummary.substring(0, 2000), '');
    }

    if (pipeline.filesChanged.length > 0) {
      lines.push('### Files Changed');
      for (const file of pipeline.filesChanged) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    lines.push(
      '---',
      'Generated by [Orchestrator Agent](https://github.com/orchestrator-agent) using Claude Code CLI'
    );

    return lines.filter((l) => l !== undefined).join('\n');
  }

  /**
   * Clean up a worktree after pipeline completes.
   */
  static cleanupWorktree(repoPath: string, worktreePath: string): void {
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: repoPath, encoding: 'utf-8', timeout: 15000,
      });
      logger.info(`Cleaned up worktree: ${worktreePath}`);
    } catch (err) {
      logger.warn(`Failed to cleanup worktree: ${(err as Error).message}`);
    }
  }

  /**
   * Check if a file is currently being modified by another worktree/pipeline.
   */
  static getWorktreeFiles(repoPath: string): string[] {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: repoPath, encoding: 'utf-8', timeout: 10000,
      });
      // Parse worktree list to find active fix branches
      return output.split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.replace('worktree ', ''));
    } catch {
      return [];
    }
  }

  /**
   * Run tests in a worktree.
   */
  static runTests(worktreePath: string, testCommand: string): { success: boolean; output: string } {
    try {
      const output = execSync(testCommand, {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 120000, // 2 min for tests
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, output: output.substring(0, 5000) };
    } catch (err: any) {
      return {
        success: false,
        output: ((err.stdout || '') + '\n' + (err.stderr || '')).substring(0, 5000),
      };
    }
  }

  private static parseRepoUrl(url: string): { owner: string; repo: string } {
    // Handle: https://github.com/owner/repo or git@github.com:owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
    const match = httpsMatch || sshMatch;

    if (!match) {
      throw new Error(`Cannot parse GitHub repo URL: ${url}`);
    }

    return { owner: match[1], repo: match[2] };
  }
}
