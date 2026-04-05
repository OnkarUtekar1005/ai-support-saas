import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const agentConfigRoutes = Router();
agentConfigRoutes.use(authenticate);
agentConfigRoutes.use(requireRole('ADMIN'));

// Get both AutoFixConfig and FunctionalAgentConfig for a project
agentConfigRoutes.get('/:projectId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const [autoFixConfig, functionalAgentConfig] = await Promise.all([
    prisma.autoFixConfig.findUnique({ where: { projectId } }),
    prisma.functionalAgentConfig.findUnique({ where: { projectId } }),
  ]);

  res.json({
    technical: autoFixConfig || {
      enabled: false,
      autoTriggerLevel: 'high',
      maxConcurrent: 2,
      cooldownMinutes: 30,
      gitProvider: 'github',
      targetBranch: 'main',
      testCommand: 'npm test',
      createPR: true,
      autoDeployOnApprove: false,
    },
    functional: functionalAgentConfig || {
      enabled: false,
      systemPrompt: null,
      confidenceThreshold: 0.7,
      autoResolveTickets: false,
    },
  });
});

// Upsert AutoFixConfig (technical agent config)
agentConfigRoutes.put('/:projectId/technical', async (req: AuthRequest, res: Response) => {
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

// Upsert FunctionalAgentConfig
agentConfigRoutes.put('/:projectId/functional', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { enabled, systemPrompt, confidenceThreshold, autoResolveTickets } = req.body;

  const cfg = await prisma.functionalAgentConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      enabled: enabled ?? false,
      systemPrompt: systemPrompt ?? null,
      confidenceThreshold: confidenceThreshold ?? 0.7,
      autoResolveTickets: autoResolveTickets ?? false,
    },
    update: {
      enabled,
      systemPrompt,
      confidenceThreshold,
      autoResolveTickets,
    },
  });

  res.json(cfg);
});
