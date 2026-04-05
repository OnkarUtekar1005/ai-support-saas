import 'dotenv/config';
// Silence Prisma query logs in orchestrator
process.env.DEBUG = '';
import { OrchestratorService } from './services/orchestrator/OrchestratorService';
import { logger } from './services/orchestrator/OrchestratorLogger';
import { prisma } from './utils/prisma';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('   Orchestrator Agent — Standalone Mode');
  console.log('   Polling for pipelines to process...');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const orchestrator = OrchestratorService.getInstance();
  await orchestrator.start();

  // Track active work to avoid double-processing
  const analyzing = new Set<string>();  // pipelines being analyzed
  const fixing = new Set<string>();     // pipelines being fixed

  const poll = async () => {
    try {
      const pipelines = await prisma.pipeline.findMany({
        where: { status: { in: ['DETECTED', 'APPROVED'] } },
        select: { id: true, status: true, projectId: true, priority: true },
      });

      for (const p of pipelines) {
        if (p.status === 'DETECTED' && !analyzing.has(p.id)) {
          analyzing.add(p.id);
          logger.info(`[POLL] Pipeline ${p.id.slice(0, 8)}... → analysis`);
          orchestrator.submitToPool(p.id, p.projectId || '', p.priority)
            .finally(() => analyzing.delete(p.id));
        }

        if (p.status === 'APPROVED' && !fixing.has(p.id)) {
          fixing.add(p.id);
          logger.info(`[POLL] Pipeline ${p.id.slice(0, 8)}... → fix`);
          orchestrator.submitFix(p.id, p.projectId || '', p.priority)
            .finally(() => fixing.delete(p.id));
        }
      }
    } catch (err) {
      logger.error('Poll error:', (err as Error).message);
    }
  };

  await poll();
  const interval = setInterval(poll, 10000);
  logger.info('Orchestrator running. Polling every 10s...');

  const shutdown = async () => {
    logger.info('Shutting down...');
    clearInterval(interval);
    await orchestrator.shutdown();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
