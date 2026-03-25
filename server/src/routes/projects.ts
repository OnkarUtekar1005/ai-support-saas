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

// Delete project
projectRoutes.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
