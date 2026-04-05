import { ChildProcess } from 'child_process';
import { prisma } from '../../utils/prisma';
import { ClaudeCodeRunner } from './ClaudeCodeRunner';
import { GitService } from './GitService';
import { ProjectContextCache } from './ProjectContextCache';
import { StackTraceParser } from './StackTraceParser';
import { logger } from './OrchestratorLogger';

export type WorkerStatus = 'idle' | 'analyzing' | 'waiting_approval' | 'fixing' | 'testing' | 'committing' | 'done' | 'failed' | 'cancelled';

export interface WorkerState {
  pipelineId: string;
  projectId: string;
  status: WorkerStatus;
  startedAt: Date;
  error?: string;
}

export class AgentWorker {
  readonly pipelineId: string;
  readonly projectId: string;
  private status: WorkerStatus = 'idle';
  private claudeProcess: ChildProcess | null = null;
  private cancelled = false;
  private startedAt: Date;
  private onComplete?: (pipelineId: string) => void;

  constructor(
    pipelineId: string,
    projectId: string,
    options?: {
      onComplete?: (pipelineId: string) => void;
    }
  ) {
    this.pipelineId = pipelineId;
    this.projectId = projectId;
    this.startedAt = new Date();
    this.onComplete = options?.onComplete;
  }

  getState(): WorkerState {
    return {
      pipelineId: this.pipelineId,
      projectId: this.projectId,
      status: this.status,
      startedAt: this.startedAt,
    };
  }

  /**
   * Run the full pipeline lifecycle.
   */
  async run(): Promise<void> {
    try {
      const pipeline = await prisma.pipeline.findUnique({
        where: { id: this.pipelineId },
        include: {
          project: { include: { autoFixConfig: true } },
        },
      });

      if (!pipeline || !pipeline.project?.autoFixConfig) {
        throw new Error('Pipeline or AutoFixConfig not found');
      }

      const autoFixConfig = pipeline.project.autoFixConfig;
      const projectPath = autoFixConfig.projectPath;

      if (!projectPath) {
        throw new Error('projectPath not configured in AutoFixConfig');
      }

      // ─── Step 1: ANALYZING ───
      if (pipeline.status === 'DETECTED' || pipeline.status === 'QUEUED' || pipeline.status === 'ANALYZING') {
        await this.analyze(pipeline, projectPath);
      }

      // After analysis, the pipeline goes to AWAITING_APPROVAL.
      // The worker completes here. It will be re-spawned when APPROVED.

    } catch (err) {
      const message = (err as Error).message;
      logger.error(`Worker failed for pipeline ${this.pipelineId}: ${message}`);
      this.status = 'failed';

      await this.updatePipeline('FAILED', { rejectedReason: message });
      await this.addLog('FAILED', message);
    } finally {
      this.onComplete?.(this.pipelineId);
    }
  }

  /**
   * Resume after approval — apply the fix.
   */
  async runFix(): Promise<void> {
    try {
      const pipeline = await prisma.pipeline.findUnique({
        where: { id: this.pipelineId },
        include: {
          project: { include: { autoFixConfig: true } },
        },
      });

      if (!pipeline || !pipeline.project?.autoFixConfig) {
        throw new Error('Pipeline or AutoFixConfig not found');
      }

      const cfg = pipeline.project.autoFixConfig;
      const projectPath = cfg.projectPath;

      if (!projectPath) {
        throw new Error('projectPath not configured');
      }

      // ─── Step 2: Create worktree and apply fix ───
      await this.applyFix(pipeline, cfg, projectPath);

    } catch (err) {
      const message = (err as Error).message;
      logger.error(`Fix failed for pipeline ${this.pipelineId}: ${message}`);
      this.status = 'failed';

      await this.updatePipeline('FAILED', { rejectedReason: message });
      await this.addLog('FAILED', message);
    } finally {
      this.onComplete?.(this.pipelineId);
    }
  }

  /**
   * Cancel the worker — kills any running Claude process.
   */
  cancel(): void {
    this.cancelled = true;
    if (this.claudeProcess) {
      ClaudeCodeRunner.kill(this.claudeProcess);
      this.claudeProcess = null;
    }
    this.status = 'cancelled';
    logger.info(`Worker cancelled for pipeline ${this.pipelineId}`);
  }

  // ─── Analysis Phase ───

  private async analyze(pipeline: any, projectPath: string): Promise<void> {
    if (this.cancelled) return;

    this.status = 'analyzing';
    await this.updatePipeline('ANALYZING');
    await this.addLog('ANALYZING', 'Starting Claude Code analysis...');

    // Build focused prompt
    const projectContext = ProjectContextCache.getContext(projectPath);
    const fileContext = pipeline.errorStack
      ? StackTraceParser.buildFileContext(pipeline.errorStack)
      : 'No stack trace available — Claude should explore to find the issue.';

    const prompt = ClaudeCodeRunner.buildAnalysisPrompt(
      pipeline.errorMessage,
      pipeline.errorStack,
      pipeline.geminiAnalysis,
      projectContext,
      fileContext
    );

    // Run Claude Code
    const resultPromise = ClaudeCodeRunner.analyze(prompt, projectPath);
    this.claudeProcess = (resultPromise as any).process || null;
    const result = await resultPromise;
    this.claudeProcess = null;

    if (this.cancelled) return;

    // Save results
    await this.updatePipeline('AWAITING_APPROVAL', {
      claudeOutput: result.output,
      claudeFixSummary: result.output.substring(0, 2000),
      claudeSessionId: result.sessionId || null,
      claudePrompt: prompt,
    });

    await this.addLog('FIX_PROPOSED', result.success
      ? 'Analysis complete. Awaiting human approval.'
      : `Analysis completed with issues: ${result.error}`
    );

    this.status = 'waiting_approval';
    logger.info(`Pipeline ${this.pipelineId}: analysis done, awaiting approval`);
  }

  // ─── Fix Phase (after approval) ───

  private async applyFix(pipeline: any, cfg: any, projectPath: string): Promise<void> {
    if (this.cancelled) return;

    this.status = 'fixing';
    await this.updatePipeline('FIXING');

    // Only use worktree + git if user explicitly set a git repo URL
    const gitRepoUrl = (cfg.gitRepoUrl || '').trim();
    const useGit = gitRepoUrl.length > 0;
    let fixPath = projectPath;
    let branchName = '';

    if (useGit) {
      branchName = `fix/auto-${this.pipelineId.substring(0, 8)}-${Date.now()}`;
      await this.addLog('FIXING', `Creating worktree on branch ${branchName}...`);
      try {
        fixPath = GitService.createWorktree(projectPath, branchName);
        await this.updatePipeline('FIXING', { branchName, worktreePath: fixPath });
      } catch (err) {
        logger.warn(`Worktree failed, fixing directly: ${(err as Error).message}`);
        fixPath = projectPath;
        await this.addLog('FIXING', 'Worktree not available — applying fix directly');
      }
    } else {
      await this.addLog('FIXING', `Applying fix directly in ${projectPath}`);
    }

    try {
      if (this.cancelled) return;

      // Run Claude Code fix
      const projectContext = ProjectContextCache.getContext(projectPath);
      const fileContext = pipeline.errorStack
        ? StackTraceParser.buildFileContext(pipeline.errorStack)
        : 'No stack trace — explore to find the issue.';

      const prompt = ClaudeCodeRunner.buildFixPrompt(
        pipeline.errorMessage,
        pipeline.errorStack,
        pipeline.geminiAnalysis,
        pipeline.geminiSuggestion,
        pipeline.claudeFixSummary,
        projectContext,
        fileContext
      );

      await this.addLog('FIXING', 'Running Claude Code to apply fix...');

      const resultPromise = ClaudeCodeRunner.fix(prompt, fixPath, {
        resumeSessionId: pipeline.claudeSessionId || undefined,
      });
      this.claudeProcess = (resultPromise as any).process || null;
      const result = await resultPromise;
      this.claudeProcess = null;

      if (this.cancelled) return;

      if (!result.success) {
        throw new Error(`Claude Code fix failed: ${result.error}`);
      }

      await this.updatePipeline('FIXING', {
        claudeOutput: result.output,
        claudeFixSummary: result.output.substring(0, 2000),
      });

      // Run tests (if configured)
      if (cfg.testCommand) {
        this.status = 'testing';
        await this.updatePipeline('TESTING');
        await this.addLog('TESTING', `Running tests: ${cfg.testCommand}`);

        const testResult = GitService.runTests(fixPath, cfg.testCommand);
        await this.updatePipeline(testResult.success ? 'TESTING' : 'TEST_FAILED', {
          testOutput: testResult.output,
        });

        if (!testResult.success) {
          await this.addLog('TEST_FAILED', 'Tests failed after applying fix');
          this.status = 'failed';
          return;
        }
        await this.addLog('TESTING', 'Tests passed');
      }

      if (this.cancelled) return;

      // Git commit + PR (only if git repo URL is configured)
      if (useGit) {
        this.status = 'committing';
        await this.addLog('COMMITTED', 'Committing changes...');

        const commitMessage = `fix: auto-fix ${pipeline.errorSource} — ${pipeline.errorMessage.substring(0, 60)}`;
        const commitInfo = GitService.commitAndPush(fixPath, commitMessage, branchName);

        if (commitInfo.filesChanged.length === 0) {
          await this.addLog('COMMITTED', 'No files changed by Claude Code');
          await this.updatePipeline('COMMITTED', { filesChanged: [] });
        } else {
          await this.updatePipeline('COMMITTED', {
            filesChanged: commitInfo.filesChanged,
            commitHash: commitInfo.hash,
          });
          await this.addLog('COMMITTED', `Committed ${commitInfo.hash}: ${commitInfo.filesChanged.length} files changed`);
        }
      } else {
        // No git — just mark as committed (fix applied directly)
        await this.updatePipeline('COMMITTED', {
          claudeOutput: result.output,
          claudeFixSummary: result.output.substring(0, 2000),
        });
        await this.addLog('COMMITTED', 'Fix applied directly to project (no git configured). Review the changes in your editor.');
        this.status = 'done';
        return;
      }

      // Step 5: Create PR
      if (cfg.createPR && cfg.gitRepoUrl) {
        await this.addLog('PR_CREATED', 'Creating Pull Request...');

        const prBody = GitService.buildPRBody({
          errorMessage: pipeline.errorMessage,
          errorSource: pipeline.errorSource,
          geminiAnalysis: pipeline.geminiAnalysis,
          claudeFixSummary: pipeline.claudeFixSummary,
          filesChanged: commitInfo.filesChanged,
          isRegression: pipeline.isRegression,
        });

        const prTitle = `fix: auto-fix ${pipeline.errorSource} — ${pipeline.errorMessage.substring(0, 50)}`;

        try {
          const pr = await GitService.createGitHubPR(
            cfg.gitRepoUrl,
            branchName,
            cfg.targetBranch,
            prTitle,
            prBody
          );

          await this.updatePipeline('PR_CREATED', { prUrl: pr.url });
          await this.addLog('PR_CREATED', `PR created: ${pr.url}`);
        } catch (err) {
          logger.error(`PR creation failed: ${(err as Error).message}`);
          await this.addLog('COMMITTED', `PR creation failed: ${(err as Error).message}. Branch pushed: ${branchName}`);
          // Don't fail the pipeline — the code is pushed, just no PR
        }
      }

      // Update context cache with the fix
      if (useGit) {
        try {
          ProjectContextCache.addRecentFix(
            projectPath,
            commitInfo.filesChanged[0],
            this.pipelineId
          );
        } catch {}
      }

      this.status = 'done';
      logger.info(`Pipeline ${this.pipelineId}: fix complete!`);

    } finally {
      // Cleanup worktree (only if we created one)
      if (useGit && fixPath !== projectPath) {
        try { GitService.cleanupWorktree(projectPath, fixPath); } catch {}
      }
    }
  }

  // ─── Helpers ───

  private async updatePipeline(status: string, data?: Record<string, any>): Promise<void> {
    await prisma.pipeline.update({
      where: { id: this.pipelineId },
      data: { status: status as any, ...data },
    });
  }

  private async addLog(stage: string, message: string): Promise<void> {
    await prisma.pipelineLog.create({
      data: {
        pipelineId: this.pipelineId,
        stage,
        message,
      },
    });
  }
}
