import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { EmailService } from '../services/email/EmailService';

export const agentWebhookRoutes = Router();

// NO JWT auth — these use agent key authentication

// Agent heartbeat
agentWebhookRoutes.post('/heartbeat', async (req: Request, res: Response) => {
  const agentKey = req.headers['x-agent-key'] as string;
  if (!agentKey) return res.status(401).json({ error: 'Agent key required' });

  const agent = await prisma.vpsAgent.findUnique({ where: { agentKey } });
  if (!agent) return res.status(401).json({ error: 'Invalid agent key' });

  await prisma.vpsAgent.update({
    where: { id: agent.id },
    data: { isOnline: true, lastHeartbeat: new Date() },
  });

  // Claim any unassigned DETECTED pipelines in this org → assign to this agent and move to ANALYZING
  const unassigned = await prisma.pipeline.findMany({
    where: {
      organizationId: agent.organizationId,
      vpsAgentId: null,
      status: 'DETECTED',
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
  });

  if (unassigned.length > 0) {
    await prisma.pipeline.updateMany({
      where: { id: { in: unassigned.map((p) => p.id) } },
      data: { vpsAgentId: agent.id, status: 'ANALYZING' },
    });
  }

  // Return all pipelines assigned to this agent that need processing
  const pending = await prisma.pipeline.findMany({
    where: {
      vpsAgentId: agent.id,
      status: { in: ['ANALYZING', 'APPROVED'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  res.json({ ok: true, pendingPipelines: pending });
});

// Agent reports Claude Code output
agentWebhookRoutes.post('/report', async (req: Request, res: Response) => {
  const agentKey = req.headers['x-agent-key'] as string;
  if (!agentKey) return res.status(401).json({ error: 'Agent key required' });

  const agent = await prisma.vpsAgent.findUnique({ where: { agentKey } });
  if (!agent) return res.status(401).json({ error: 'Invalid agent key' });

  const { pipelineId, stage, claudeOutput, claudeFixSummary, filesChanged, branchName, commitHash, deployLog, error, inputTokens, outputTokens, costUsd } = req.body;

  const data: any = {};
  if (claudeOutput) data.claudeOutput = claudeOutput;
  if (claudeFixSummary) data.claudeFixSummary = claudeFixSummary;
  if (filesChanged) data.filesChanged = filesChanged;
  if (branchName) data.branchName = branchName;
  if (commitHash) data.commitHash = commitHash;
  if (deployLog) data.deployLog = deployLog;

  // Accumulate token/cost totals across all reports for this pipeline
  if (inputTokens || outputTokens || costUsd) {
    const current = await prisma.pipeline.findUnique({
      where: { id: pipelineId },
      select: { claudeInputTokens: true, claudeOutputTokens: true, claudeCostUsd: true },
    });
    data.claudeInputTokens  = (current?.claudeInputTokens  ?? 0) + (inputTokens  ?? 0);
    data.claudeOutputTokens = (current?.claudeOutputTokens ?? 0) + (outputTokens ?? 0);
    data.claudeCostUsd      = parseFloat(((current?.claudeCostUsd ?? 0) + (costUsd ?? 0)).toFixed(6));
  }

  if (error) {
    data.status = 'FAILED';
    await addLog(pipelineId, 'FAILED', error);
  } else if (stage) {
    data.status = stage;
    await addLog(pipelineId, stage, claudeFixSummary || `Stage: ${stage}`);
  }

  if (stage === 'DEPLOYED') {
    data.deployedAt = new Date();
  }

  await prisma.pipeline.update({ where: { id: pipelineId }, data });

  // If fix is proposed, send email + set awaiting approval
  if (stage === 'FIX_PROPOSED' || stage === 'AWAITING_APPROVAL') {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: pipelineId },
      include: { project: true },
    });

    if (pipeline) {
      const emailSettings = await prisma.emailSettings.findUnique({
        where: { organizationId: pipeline.organizationId },
      });

      if (emailSettings && emailSettings.adminEmails.length > 0) {
        try {
          await EmailService.sendErrorAlert({
            to: emailSettings.adminEmails,
            errorMessage: `Auto-Fix Ready: ${pipeline.errorMessage}`,
            source: pipeline.errorSource,
            aiAnalysis: `Claude Code proposes a fix:\n\n${claudeFixSummary || 'See CRM for details'}`,
            aiSuggestion: `Files changed: ${(filesChanged || []).join(', ')}\n\nApprove this fix in the CRM Pipeline page to deploy.`,
            level: 'INFO',
            timestamp: new Date().toISOString(),
            smtpConfig: emailSettings,
          });
        } catch {}
      }
    }

    await prisma.pipeline.update({
      where: { id: pipelineId },
      data: { status: 'AWAITING_APPROVAL' },
    });
  }

  res.json({ ok: true });
});

async function addLog(pipelineId: string, stage: string, message: string, data?: any) {
  await prisma.pipelineLog.create({
    data: { pipelineId, stage, message, data },
  });
}
