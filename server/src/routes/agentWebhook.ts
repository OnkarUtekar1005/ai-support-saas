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

  // Return any pending pipelines for this agent
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

  const { pipelineId, stage, claudeOutput, claudeFixSummary, filesChanged, branchName, commitHash, deployLog, error } = req.body;

  const data: any = {};
  if (claudeOutput) data.claudeOutput = claudeOutput;
  if (claudeFixSummary) data.claudeFixSummary = claudeFixSummary;
  if (filesChanged) data.filesChanged = filesChanged;
  if (branchName) data.branchName = branchName;
  if (commitHash) data.commitHash = commitHash;
  if (deployLog) data.deployLog = deployLog;

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
