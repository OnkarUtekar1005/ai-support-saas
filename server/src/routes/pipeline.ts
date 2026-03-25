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

// Create pipeline from error log → triggers the whole flow
pipelineRoutes.post('/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const { errorLogId, vpsAgentId } = req.body;

    // Get error log
    const errorLog = await prisma.errorLog.findFirst({
      where: { id: errorLogId, organizationId: req.user!.organizationId },
    });
    if (!errorLog) return res.status(404).json({ error: 'Error log not found' });

    // Get VPS agent
    const agent = vpsAgentId
      ? await prisma.vpsAgent.findFirst({ where: { id: vpsAgentId } })
      : await prisma.vpsAgent.findFirst({ where: { projectId: errorLog.projectId || undefined, organizationId: req.user!.organizationId } });

    // Create pipeline
    const pipeline = await prisma.pipeline.create({
      data: {
        errorLogId: errorLog.id,
        errorMessage: errorLog.message,
        errorSource: errorLog.source,
        errorStack: errorLog.stack,
        geminiAnalysis: errorLog.aiAnalysis,
        geminiSuggestion: errorLog.aiSuggestion,
        vpsAgentId: agent?.id,
        projectId: errorLog.projectId,
        organizationId: req.user!.organizationId,
        status: 'DETECTED',
      },
    });

    // Log
    await addLog(pipeline.id, 'DETECTED', 'Pipeline created from error log');

    // Build the Claude Code prompt
    const claudePrompt = buildClaudePrompt(errorLog, agent);

    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { claudePrompt, status: 'ANALYZING' },
    });
    await addLog(pipeline.id, 'ANALYZING', 'Prompt prepared for Claude Code CLI');

    // If agent is online, send command to VPS agent
    if (agent?.isOnline) {
      await addLog(pipeline.id, 'ANALYZING', `Sending to VPS agent: ${agent.name} (${agent.host})`);
      // The VPS agent polls for pending work — we just set the status
      await prisma.pipeline.update({
        where: { id: pipeline.id },
        data: { status: 'ANALYZING' },
      });
    } else {
      await addLog(pipeline.id, 'ANALYZING', 'VPS agent offline. Pipeline queued — will execute when agent comes online. You can also run the prompt manually.');
    }

    res.status(201).json(pipeline);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Approve pipeline — triggers Claude Code to apply the fix
pipelineRoutes.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!pipeline) return res.status(404).json({ error: 'Not found' });

  await prisma.pipeline.update({
    where: { id: req.params.id },
    data: { status: 'APPROVED', approvedBy: req.user!.id, approvedAt: new Date() },
  });
  await addLog(req.params.id, 'APPROVED', `Approved by ${req.user!.name}`);

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
