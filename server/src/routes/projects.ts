import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const projectRoutes = Router();
projectRoutes.use(authenticate);

// List projects — SUPER_ADMIN sees all, others see only their assigned projects
projectRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);

  const where: any = { organizationId: req.user!.organizationId };
  if (allowedIds !== null) {
    where.id = { in: allowedIds };
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contacts: true, deals: true, tickets: true, activities: true, members: true } },
    },
  });
  res.json(projects);
});

// Get single project with stats
projectRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { contacts: true, deals: true, tickets: true, activities: true, companies: true } },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Membership check for non-SUPER_ADMIN
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (allowedIds !== null && !allowedIds.includes(project.id)) {
    return res.status(403).json({ error: 'You do not have access to this project' });
  }

  // Pipeline summary
  const dealsByStage = await prisma.deal.groupBy({
    by: ['stage'],
    where: { projectId: req.params.id },
    _sum: { value: true },
    _count: true,
  });

  res.json({ ...project, dealsByStage });
});

// Create project
projectRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description, color } = req.body;

  // Check for duplicate name within the organization
  const existing = await prisma.project.findFirst({
    where: { name, organizationId: req.user!.organizationId },
  });
  if (existing) {
    return res.status(400).json({ error: `A project named "${name}" already exists` });
  }

  const project = await prisma.project.create({
    data: {
      name,
      description,
      color: color || '#3b82f6',
      organizationId: req.user!.organizationId,
      members: {
        create: { userId: req.user!.id, role: 'OWNER' },
      },
    },
  });
  res.status(201).json(project);
});

// Update project
projectRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, description, status, color } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(color !== undefined && { color }),
    },
  });
  res.json(project);
});

// Add member to project
projectRoutes.post('/:id/members', async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.body;
  const member = await prisma.projectMember.create({
    data: { projectId: req.params.id, userId, role: role || 'MEMBER' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(member);
});

// Remove member
projectRoutes.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  await prisma.projectMember.deleteMany({
    where: { projectId: req.params.id, userId: req.params.userId },
  });
  res.json({ success: true });
});

// Delete project — SUPER_ADMIN only, cascades all related data
projectRoutes.delete('/:id', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const projectId = req.params.id as string;
  const orgId = req.user!.organizationId;

  // Verify project belongs to this org
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Delete all related data (relations with onDelete: SetNull won't auto-cascade)
  await prisma.$transaction([
    prisma.pipelineLog.deleteMany({ where: { pipeline: { projectId } } }),
    prisma.pipeline.deleteMany({ where: { projectId } }),
    prisma.functionalResolution.deleteMany({ where: { projectId } }),
    prisma.knowledgeEntry.deleteMany({ where: { projectId } }),
    prisma.projectDocument.deleteMany({ where: { projectId } }),
    prisma.activity.deleteMany({ where: { projectId } }),
    prisma.deal.deleteMany({ where: { projectId } }),
    prisma.contact.deleteMany({ where: { projectId } }),
    prisma.company.deleteMany({ where: { projectId } }),
    prisma.ticket.deleteMany({ where: { projectId } }),
    prisma.errorLog.deleteMany({ where: { projectId } }),
    prisma.vpsAgent.deleteMany({ where: { projectId } }),
    prisma.apiKey.deleteMany({ where: { projectId } }),
    prisma.projectMember.deleteMany({ where: { projectId } }),
    prisma.autoFixConfig.deleteMany({ where: { projectId } }),
    prisma.functionalAgentConfig.deleteMany({ where: { projectId } }),
    prisma.reminderConfig.deleteMany({ where: { projectId } }),
    prisma.chatbotConfig.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  res.json({ success: true });
});
