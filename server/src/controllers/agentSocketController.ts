import { Server, Socket } from 'socket.io';
import { prisma } from '../utils/prisma';
import { EmailService } from '../services/email/EmailService';

interface AgentSocket extends Socket {
  agentId?: string;
  organizationId?: string;
}

// Live agent socket map: agentId → socket
const agentSockets = new Map<string, AgentSocket>();

export function setupAgentSocketHandlers(io: Server) {
  const agentNs = io.of('/agent');

  agentNs.use(async (socket: AgentSocket, next) => {
    const agentKey = socket.handshake.auth?.agentKey as string | undefined;
    if (!agentKey) return next(new Error('Agent key required'));

    try {
      const agent = await prisma.vpsAgent.findUnique({ where: { agentKey } });
      if (!agent) return next(new Error('Invalid agent key'));

      socket.agentId = agent.id;
      socket.organizationId = agent.organizationId;
      next();
    } catch (err) {
      next(new Error('Auth check failed'));
    }
  });

  agentNs.on('connection', async (socket: AgentSocket) => {
    const agentId = socket.agentId!;
    console.log(`[Agent Socket] Connected: ${agentId}`);
    agentSockets.set(agentId, socket);

    await prisma.vpsAgent.update({
      where: { id: agentId },
      data: { isOnline: true, lastHeartbeat: new Date() },
    }).catch(() => {});

    // Push any pending pipelines immediately on connect
    const pending = await prisma.pipeline.findMany({
      where: { vpsAgentId: agentId, status: { in: ['ANALYZING', 'APPROVED'] } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    }).catch(() => [] as any[]);

    if (pending.length > 0) {
      socket.emit('pipeline:pending', pending);
    }

    // Agent reports progress (replaces HTTP POST /agent-webhook/report)
    socket.on('agent:report', async (data: any, ack?: (res: any) => void) => {
      try {
        await handleAgentReport(data);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    // Lightweight heartbeat ping
    socket.on('agent:ping', () => {
      prisma.vpsAgent.update({
        where: { id: agentId },
        data: { lastHeartbeat: new Date() },
      }).catch(() => {});
      socket.emit('agent:pong');
    });

    socket.on('disconnect', async () => {
      console.log(`[Agent Socket] Disconnected: ${agentId}`);
      agentSockets.delete(agentId);
      await prisma.vpsAgent.update({
        where: { id: agentId },
        data: { isOnline: false },
      }).catch(() => {});
    });
  });
}

// Push a pipeline event to a connected agent. Returns true if delivered.
export function emitToAgent(agentId: string, event: string, data: any): boolean {
  const socket = agentSockets.get(agentId);
  if (socket?.connected) {
    socket.emit(event, data);
    return true;
  }
  return false;
}

async function handleAgentReport(body: any) {
  const { pipelineId, stage, claudeOutput, claudeFixSummary, filesChanged, branchName, commitHash, deployLog, error } = body;

  const update: any = {};
  if (claudeOutput !== undefined) update.claudeOutput = claudeOutput;
  if (claudeFixSummary !== undefined) update.claudeFixSummary = claudeFixSummary;
  if (filesChanged !== undefined) update.filesChanged = filesChanged;
  if (branchName !== undefined) update.branchName = branchName;
  if (commitHash !== undefined) update.commitHash = commitHash;
  if (deployLog !== undefined) update.deployLog = deployLog;

  if (error) {
    update.status = 'FAILED';
    await addLog(pipelineId, 'FAILED', error);
  } else if (stage) {
    update.status = stage;
    await addLog(pipelineId, stage, claudeFixSummary || `Stage: ${stage}`);
  }

  if (stage === 'DEPLOYED') update.deployedAt = new Date();

  await prisma.pipeline.update({ where: { id: pipelineId }, data: update });

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
}

async function addLog(pipelineId: string, stage: string, message: string, data?: any) {
  await prisma.pipelineLog.create({
    data: { pipelineId, stage, message, data },
  });
}
