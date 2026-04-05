import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
// EmailService + agent webhooks are in agentWebhook.ts

export const pipelineRoutes = Router();
pipelineRoutes.use(authenticate);
pipelineRoutes.use(requireRole('ADMIN'));

// List pipelines
pipelineRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { projectId, status } = req.query;
  const where: any = { organizationId: req.user!.organizationId };
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;

  const pipelines = await prisma.pipeline.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, color: true } },
      vpsAgent: { select: { id: true, name: true, host: true, isOnline: true } },
    },
  });
  res.json(pipelines);
});

// Get single pipeline with logs
pipelineRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      project: { select: { id: true, name: true, color: true } },
      vpsAgent: { select: { id: true, name: true, host: true, isOnline: true } },
      logs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
  res.json(pipeline);
});

// Create pipeline and send to orchestrator immediately
// Works with both DB error logs (errorLogId) and in-memory errors (fingerprint)
pipelineRoutes.post('/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { errorLogId, fingerprint, errorMessage, errorStack, errorSource, projectId, geminiAnalysis, geminiSuggestion } = req.body;

    let message = errorMessage || '';
    let stack = errorStack || null;
    let source = errorSource || 'unknown';
    let pId = projectId || null;
    let analysis = geminiAnalysis || null;
    let suggestion = geminiSuggestion || null;

    // If errorLogId provided, try to read from DB (legacy path)
    if (errorLogId) {
      const errorLog = await prisma.errorLog.findFirst({
        where: { id: errorLogId, organizationId: req.user!.organizationId },
      });
      if (errorLog) {
        message = errorLog.message;
        stack = errorLog.stack;
        source = errorLog.source;
        pId = errorLog.projectId;
        analysis = errorLog.aiAnalysis;
        suggestion = errorLog.aiSuggestion;
      }
    }

    // If fingerprint provided, read from in-memory ingestion service
    if (fingerprint && !message) {
      const { ErrorIngestionService } = await import('../services/logging/ErrorIngestionService');
      const entry = ErrorIngestionService.getInstance().getFingerprintDetail(fingerprint);
      if (entry) {
        message = entry.message;
        stack = entry.stack || null;
        source = entry.source;
        pId = entry.projectId || pId;
        analysis = entry.aiAnalysis || null;
        suggestion = entry.aiSuggestion || null;
      }
    }

    if (!message) {
      return res.status(400).json({ error: 'Error details required (errorLogId, fingerprint, or errorMessage)' });
    }

    // Find AutoFixConfig for this project to get projectPath
    const autoFixConfig = pId ? await prisma.autoFixConfig.findUnique({ where: { projectId: pId } }) : null;

    // Create pipeline record
    const pipeline = await prisma.pipeline.create({
      data: {
        errorMessage: message,
        errorSource: source,
        errorStack: stack,
        geminiAnalysis: analysis,
        geminiSuggestion: suggestion,
        projectId: pId,
        organizationId: req.user!.organizationId,
        status: 'DETECTED',
        autoTriggered: false,
        priority: 5,
      },
    });

    await addLog(pipeline.id, 'DETECTED', 'Auto-fix triggered — orchestrator will analyze first');

    if (!autoFixConfig?.projectPath || !pId) {
      await addLog(pipeline.id, 'DETECTED', 'No AutoFixConfig found for this project. Configure auto-fix settings first (project path required).');
    }

    res.status(201).json(pipeline);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Approve pipeline — triggers orchestrator to apply the fix with Claude Code
pipelineRoutes.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: req.params.id as string, organizationId: req.user!.organizationId },
  });
  if (!pipeline) return res.status(404).json({ error: 'Not found' });

  await prisma.pipeline.update({
    where: { id: req.params.id as string },
    data: { status: 'APPROVED', approvedBy: req.user!.id, approvedAt: new Date() },
  });
  await addLog(req.params.id as string, 'APPROVED', `Approved by ${req.user!.name}. Orchestrator will pick up via pg NOTIFY.`);

  res.json({ ok: true });
});

// Retry failed/rejected pipeline — resets to DETECTED so orchestrator picks it up again
pipelineRoutes.post('/:id/retry', async (req: AuthRequest, res: Response) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: req.params.id as string, organizationId: req.user!.organizationId },
  });
  if (!pipeline) return res.status(404).json({ error: 'Not found' });
  if (!['FAILED', 'REJECTED', 'TEST_FAILED', 'REGRESSION'].includes(pipeline.status)) {
    return res.status(400).json({ error: `Cannot retry pipeline in ${pipeline.status} status` });
  }

  await prisma.pipeline.update({
    where: { id: req.params.id as string },
    data: { status: 'DETECTED', rejectedReason: null, approvedBy: null, approvedAt: null },
  });
  await addLog(req.params.id as string, 'DETECTED', `Retried by ${req.user!.name}. Re-queued for analysis.`);
  res.json({ ok: true });
});

// Delete pipeline and its logs
pipelineRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.pipelineLog.deleteMany({ where: { pipelineId: req.params.id as string } });
  await prisma.pipeline.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});

// Reject pipeline
pipelineRoutes.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  const { reason } = req.body;
  await prisma.pipeline.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', rejectedReason: reason || 'Rejected by admin' },
  });
  await addLog(req.params.id, 'REJECTED', reason || 'Rejected by admin');
  res.json({ ok: true });
});

// ─── VPS Agent Management ───

// List VPS agents
pipelineRoutes.get('/agents/list', async (req: AuthRequest, res: Response) => {
  const agents = await prisma.vpsAgent.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { project: { select: { id: true, name: true, color: true } } },
  });
  res.json(agents);
});

// Register a VPS agent
pipelineRoutes.post('/agents', async (req: AuthRequest, res: Response) => {
  const { name, host, projectPath, gitBranch, buildCommand, restartCommand, projectId } = req.body;

  const crypto = await import('crypto');
  const agentKey = 'vps_' + crypto.randomBytes(24).toString('hex');

  const agent = await prisma.vpsAgent.create({
    data: {
      name, host, agentKey,
      projectPath: projectPath || '/home/deploy/app',
      gitBranch: gitBranch || 'main',
      buildCommand: buildCommand || 'npm run build',
      restartCommand: restartCommand || 'pm2 restart all',
      projectId: projectId || null,
      organizationId: req.user!.organizationId,
    },
  });

  // Return full key only on creation
  res.status(201).json(agent);
});

// Delete agent
pipelineRoutes.delete('/agents/:id', async (req: AuthRequest, res: Response) => {
  await prisma.vpsAgent.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// VPS Agent webhooks moved to agentWebhook.ts (no JWT auth required)

// ─── Helpers ───

async function addLog(pipelineId: string, stage: string, message: string, data?: any) {
  await prisma.pipelineLog.create({
    data: { pipelineId, stage, message, data },
  });
}

function buildClaudePrompt(errorLog: any, agent: any): string {
  return `You are fixing a production error in the application.

ERROR DETAILS:
- Message: ${errorLog.message}
- Source: ${errorLog.source}
- Category: ${errorLog.category || 'unknown'}
${errorLog.stack ? `- Stack Trace:\n${errorLog.stack}` : ''}
${errorLog.endpoint ? `- Endpoint: ${errorLog.endpoint}` : ''}

${errorLog.aiAnalysis ? `GEMINI ANALYSIS:\n${errorLog.aiAnalysis}` : ''}
${errorLog.aiSuggestion ? `GEMINI SUGGESTION:\n${errorLog.aiSuggestion}` : ''}

INSTRUCTIONS:
1. Find the root cause of this error in the codebase
2. Apply the minimal fix required — do not refactor unrelated code
3. If tests exist, run them to verify the fix
4. Explain what you changed and why

${agent ? `PROJECT PATH: ${agent.projectPath}` : ''}
`;
}
