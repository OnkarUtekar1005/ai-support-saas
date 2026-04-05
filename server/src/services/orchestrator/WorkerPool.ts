import { AgentWorker, WorkerState } from './AgentWorker';
import { PriorityQueue } from './queue';
import { config } from './OrchestratorConfig';
import { logger } from './OrchestratorLogger';
import { prisma } from '../../utils/prisma';

interface QueuedPipeline {
  pipelineId: string;
  projectId: string;
  priority: number;
  type: 'analyze' | 'fix';
}

export interface PoolStatus {
  activeWorkers: WorkerState[];
  queuedPipelines: QueuedPipeline[];
  maxSlots: number;
  availableSlots: number;
}

export class WorkerPool {
  private active: Map<string, AgentWorker> = new Map(); // pipelineId → worker
  private queue: PriorityQueue<QueuedPipeline> = new PriorityQueue();

  constructor() {}

  /**
   * Submit a pipeline for analysis.
   * Starts immediately if slots available, otherwise queues.
   */
  async submitAnalysis(pipelineId: string, projectId: string, priority: number): Promise<void> {
    if (this.active.has(pipelineId)) {
      logger.warn(`Pipeline ${pipelineId} already has an active worker`);
      return;
    }

    if (this.canSpawn(projectId)) {
      await this.spawnAnalysis(pipelineId, projectId);
    } else {
      logger.info(`Pool full — queuing pipeline ${pipelineId} (priority: ${priority})`);
      this.queue.enqueue({ pipelineId, projectId, priority, type: 'analyze' }, priority);

      await prisma.pipeline.update({
        where: { id: pipelineId },
        data: { status: 'QUEUED' },
      });
    }
  }

  /**
   * Submit a pipeline for fix (after approval).
   */
  async submitFix(pipelineId: string, projectId: string, priority: number): Promise<void> {
    if (this.active.has(pipelineId)) {
      logger.warn(`Pipeline ${pipelineId} already has an active worker`);
      return;
    }

    // Check file conflicts
    const hasConflict = await this.checkFileConflict(pipelineId, projectId);
    if (hasConflict) {
      logger.info(`File conflict — queuing pipeline ${pipelineId}`);
      this.queue.enqueue({ pipelineId, projectId, priority, type: 'fix' }, priority);

      await prisma.pipeline.update({
        where: { id: pipelineId },
        data: { status: 'QUEUED_CONFLICT' },
      });
      return;
    }

    if (this.canSpawn(projectId)) {
      await this.spawnFix(pipelineId, projectId);
    } else {
      logger.info(`Pool full — queuing fix for pipeline ${pipelineId}`);
      this.queue.enqueue({ pipelineId, projectId, priority, type: 'fix' }, priority);

      await prisma.pipeline.update({
        where: { id: pipelineId },
        data: { status: 'QUEUED' },
      });
    }
  }

  /**
   * Cancel a running or queued pipeline.
   */
  cancel(pipelineId: string): boolean {
    // Check active workers
    const worker = this.active.get(pipelineId);
    if (worker) {
      worker.cancel();
      this.active.delete(pipelineId);
      this.drainQueue();
      return true;
    }

    // Check queue
    const removed = this.queue.remove((item) => item.pipelineId === pipelineId);
    return !!removed;
  }

  /**
   * Get pool status for dashboard.
   */
  getStatus(): PoolStatus {
    return {
      activeWorkers: [...this.active.values()].map((w) => w.getState()),
      queuedPipelines: this.queue.toArray(),
      maxSlots: config.maxWorkers,
      availableSlots: config.maxWorkers - this.active.size,
    };
  }

  /**
   * Gracefully shutdown all workers.
   */
  async shutdown(): Promise<void> {
    logger.info(`Shutting down worker pool (${this.active.size} active, ${this.queue.size} queued)`);

    // Cancel all active workers
    for (const [id, worker] of this.active) {
      worker.cancel();
    }
    this.active.clear();
    this.queue.clear();
  }

  // ─── Internal ───

  private canSpawn(projectId: string): boolean {
    // Global cap
    if (this.active.size >= config.maxWorkers) return false;

    // Per-project cap
    const projectCount = [...this.active.values()]
      .filter((w) => w.projectId === projectId).length;
    return projectCount < config.maxPerProject;
  }

  private async spawnAnalysis(pipelineId: string, projectId: string): Promise<void> {
    const worker = new AgentWorker(pipelineId, projectId, {
      onComplete: (id) => this.onWorkerComplete(id),
    });

    this.active.set(pipelineId, worker);
    logger.info(`Spawning analysis worker: ${pipelineId} (active: ${this.active.size}/${config.maxWorkers})`);

    // Run in background — don't await
    worker.run().catch((err) => {
      logger.error(`Worker crash: ${err.message}`);
    });
  }

  private async spawnFix(pipelineId: string, projectId: string): Promise<void> {
    const worker = new AgentWorker(pipelineId, projectId, {
      onComplete: (id) => this.onWorkerComplete(id),
    });

    this.active.set(pipelineId, worker);
    logger.info(`Spawning fix worker: ${pipelineId} (active: ${this.active.size}/${config.maxWorkers})`);

    // Run in background
    worker.runFix().catch((err) => {
      logger.error(`Fix worker crash: ${err.message}`);
    });
  }

  private onWorkerComplete(pipelineId: string): void {
    this.active.delete(pipelineId);
    logger.info(`Worker completed: ${pipelineId} (active: ${this.active.size}/${config.maxWorkers})`);
    this.drainQueue();
  }

  private drainQueue(): void {
    while (!this.queue.isEmpty() && this.active.size < config.maxWorkers) {
      const next = this.queue.peek();
      if (!next) break;

      if (!this.canSpawn(next.projectId)) {
        // Can't spawn for this project — try next in queue
        // (but for simplicity, just wait — a slot will open eventually)
        break;
      }

      this.queue.dequeue();
      logger.info(`Dequeuing pipeline ${next.pipelineId} (type: ${next.type})`);

      if (next.type === 'analyze') {
        this.spawnAnalysis(next.pipelineId, next.projectId);
      } else {
        this.spawnFix(next.pipelineId, next.projectId);
      }
    }
  }

  /**
   * Check if the pipeline's target files conflict with active workers.
   */
  private async checkFileConflict(pipelineId: string, projectId: string): Promise<boolean> {
    // Get the error's stack trace files
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: pipelineId },
    });
    if (!pipeline?.errorStack) return false;

    const { StackTraceParser } = await import('./StackTraceParser');
    const targetFiles = StackTraceParser.extractFilePaths(pipeline.errorStack);
    if (targetFiles.length === 0) return false;

    // Check if any active worker for this project is modifying the same files
    for (const [, worker] of this.active) {
      if (worker.projectId !== projectId) continue;

      const otherPipeline = await prisma.pipeline.findUnique({
        where: { id: worker.pipelineId },
      });

      if (otherPipeline?.filesChanged && otherPipeline.filesChanged.length > 0) {
        const overlap = targetFiles.some((f) =>
          otherPipeline.filesChanged.some((of) => of.includes(f) || f.includes(of))
        );
        if (overlap) return true;
      }
    }

    return false;
  }
}
