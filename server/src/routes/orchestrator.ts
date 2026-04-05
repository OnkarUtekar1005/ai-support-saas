import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const orchestratorRoutes = Router();
orchestratorRoutes.use(authenticate);
orchestratorRoutes.use(requireRole('ADMIN'));

// Get orchestrator status (active pipelines, queue depth)
orchestratorRoutes.get('/status', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;

  const [activePipelines, queuedPipelines, totalResolved, totalFailed] = await Promise.all([
    prisma.pipeline.count({
      where: {
        organizationId: orgId,
        status: { in: ['ANALYZING', 'FIXING', 'TESTING', 'COMMITTED', 'DEPLOYING'] },
      },
    }),
    prisma.pipeline.count({
      where: {
        organizationId: orgId,
        status: { in: ['DETECTED', 'QUEUED', 'QUEUED_CONFLICT'] },
      },
    }),
    prisma.pipeline.count({
      where: {
        organizationId: orgId,
        status: { in: ['DEPLOYED', 'PR_CREATED'] },
      },
    }),
    prisma.pipeline.count({
      where: {
        organizationId: orgId,
        status: { in: ['FAILED', 'TEST_FAILED'] },
      },
    }),
  ]);

  res.json({ activePipelines, queuedPipelines, totalResolved, totalFailed });
});

// Get AutoFixConfig for a project
orchestratorRoutes.get('/config/:projectId', async (req: AuthRequest, res: Response) => {
  const cfg = await prisma.autoFixConfig.findUnique({
    where: { projectId: req.params.projectId as string },
  });

  if (!cfg) {
    return res.json({
      enabled: false,
      autoTriggerLevel: 'high',
      maxConcurrent: 2,
      cooldownMinutes: 30,
      gitProvider: 'github',
      targetBranch: 'main',
      testCommand: 'npm test',
      createPR: true,
      autoDeployOnApprove: false,
    });
  }

  res.json(cfg);
});

// Create or update AutoFixConfig for a project
orchestratorRoutes.put('/config/:projectId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const {
    enabled, autoTriggerLevel, maxConcurrent, cooldownMinutes,
    gitProvider, gitTokenEnc, gitRepoUrl, targetBranch,
    testCommand, createPR, autoDeployOnApprove, projectPath,
  } = req.body;

  const cfg = await prisma.autoFixConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      enabled: enabled ?? false,
      autoTriggerLevel: autoTriggerLevel ?? 'high',
      maxConcurrent: maxConcurrent ?? 2,
      cooldownMinutes: cooldownMinutes ?? 30,
      gitProvider: gitProvider ?? 'github',
      gitTokenEnc,
      gitRepoUrl,
      targetBranch: targetBranch ?? 'main',
      testCommand: testCommand ?? 'npm test',
      createPR: createPR ?? true,
      autoDeployOnApprove: autoDeployOnApprove ?? false,
      projectPath,
    },
    update: {
      enabled, autoTriggerLevel, maxConcurrent, cooldownMinutes,
      gitProvider, gitTokenEnc, gitRepoUrl, targetBranch,
      testCommand, createPR, autoDeployOnApprove, projectPath,
    },
  });

  res.json(cfg);
});

// Get regressions for a project
orchestratorRoutes.get('/regressions/:projectId', async (req: AuthRequest, res: Response) => {
  const regressions = await prisma.pipeline.findMany({
    where: {
      projectId: req.params.projectId as string,
      organizationId: req.user!.organizationId,
      isRegression: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json(regressions);
});
