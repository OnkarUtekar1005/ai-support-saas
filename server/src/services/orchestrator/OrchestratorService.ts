import { WorkerPool } from './WorkerPool';
import { config as orchestratorConfig } from './OrchestratorConfig';
import { logger } from './OrchestratorLogger';

/**
 * OrchestratorService — always-running Claude Code worker pool.
 *
 * Starts on server boot. Sits idle until user clicks "Auto-Fix".
 * Then spawns Claude Code CLI processes (max 5 concurrent).
 */
export class OrchestratorService {
  private workerPool: WorkerPool;
  private started = false;
  private statusInterval: NodeJS.Timeout | null = null;
  private static instance: OrchestratorService | null = null;

  private constructor() {
    this.workerPool = new WorkerPool();
  }

  static getInstance(): OrchestratorService {
    if (!this.instance) {
      this.instance = new OrchestratorService();
    }
    return this.instance;
  }

  /**
   * Start the orchestrator — called once on server boot.
   * Just initializes the worker pool. No background polling, no DB listener.
   * Sits idle until a pipeline is submitted.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    logger.info('═══════════════════════════════════════════');
    logger.info('  Orchestrator Agent — Ready');
    logger.info(`  Max Workers:    ${orchestratorConfig.maxWorkers}`);
    logger.info(`  Per Project:    ${orchestratorConfig.maxPerProject}`);
    logger.info(`  Claude CLI:     ${orchestratorConfig.claudeCommand}`);
    logger.info(`  Worktree Dir:   ${orchestratorConfig.worktreeBaseDir}`);
    logger.info('  Mode:           On-demand (waiting for "Auto-Fix" clicks)');
    logger.info('═══════════════════════════════════════════');

    // Periodic status log (only when workers are active)
    this.statusInterval = setInterval(() => {
      const status = this.workerPool.getStatus();
      if (status.activeWorkers.length > 0 || status.queuedPipelines.length > 0) {
        logger.info(`Pool: ${status.activeWorkers.length}/${orchestratorConfig.maxWorkers} active, ${status.queuedPipelines.length} queued`);
      }
    }, 15000);
  }

  /**
   * Submit a pipeline for analysis by Claude Code.
   * Called when user clicks "Auto-Fix" button.
   */
  async submitToPool(pipelineId: string, projectId: string, priority: number): Promise<void> {
    logger.info(`[Auto-Fix] Pipeline ${pipelineId} → starting Claude Code analysis`);
    await this.workerPool.submitAnalysis(pipelineId, projectId, priority);
  }

  /**
   * Submit an approved pipeline for fix application.
   * Called when admin clicks "Approve" button.
   */
  async submitFix(pipelineId: string, projectId: string, priority: number): Promise<void> {
    logger.info(`[Approve] Pipeline ${pipelineId} → starting Claude Code fix`);
    await this.workerPool.submitFix(pipelineId, projectId, priority);
  }

  getStatus() {
    return this.workerPool.getStatus();
  }

  cancelPipeline(pipelineId: string): boolean {
    return this.workerPool.cancel(pipelineId);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down orchestrator...');
    if (this.statusInterval) clearInterval(this.statusInterval);
    await this.workerPool.shutdown();
    this.started = false;
    logger.info('Orchestrator shut down.');
  }
}
