import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { NotificationService } from '../services/notifications/NotificationService';

export const projectRoutes = Router();
projectRoutes.use(authenticate);

// ─── Join Request routes (must be before /:id) ───────────────────────────

// Super admin: list pending join requests
projectRoutes.get('/join-requests', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const requests = await prisma.projectJoinRequest.findMany({
    where: { project: { organizationId: req.user!.organizationId }, status: 'PENDING' },
    include: {
      project: { select: { id: true, name: true, color: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(requests);
});

// Super admin: approve or reject a join request
projectRoutes.patch('/join-requests/:requestId', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const { status } = req.body; // 'APPROVED' | 'REJECTED'
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Status must be APPROVED or REJECTED' });
  }

  const request = await prisma.projectJoinRequest.findFirst({
    where: { id: req.params.requestId, project: { organizationId: req.user!.organizationId } },
    include: { project: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
  });
  if (!request) return res.status(404).json({ error: 'Request not found' });

  await prisma.projectJoinRequest.update({
    where: { id: request.id },
    data: { status, resolvedAt: new Date(), resolvedById: req.user!.id },
  });

  if (status === 'APPROVED') {
    // Add user to project members (ignore if already exists)
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: request.projectId, userId: request.userId } },
      create: { projectId: request.projectId, userId: request.userId, role: 'MEMBER' },
      update: {},
    });
  }

  // Notify the requesting user
  await NotificationService.notify({
    userId: request.userId,
    type: 'STATUS_UPDATE',
    title: status === 'APPROVED' ? `Access granted: ${request.project.name}` : `Access request declined: ${request.project.name}`,
    message: status === 'APPROVED'
      ? `You now have access to project "${request.project.name}". Welcome aboard!`
      : `Your request to join "${request.project.name}" was declined by ${req.user!.name}.`,
    link: status === 'APPROVED' ? `/projects/${request.projectId}` : '/projects',
    organizationId: req.user!.organizationId,
  }).catch(() => {});

  res.json({ success: true });
});

// ─── List projects (all in org) ───────────────────────────────────────────
projectRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

  const projects = await prisma.project.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      clientContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      _count: { select: { contacts: true, tickets: true, activities: true, members: true, costs: true, invoices: true } },
      members: { select: { userId: true, role: true } },
      joinRequests: {
        where: { userId: req.user!.id },
        select: { status: true, createdAt: true },
      },
    },
  });

  const result = projects.map((p) => {
    const isMember = isSuperAdmin || p.members.some((m) => m.userId === req.user!.id);
    const myRole = isSuperAdmin ? 'SUPER_ADMIN' : (p.members.find((m) => m.userId === req.user!.id)?.role || null);
    const myJoinRequest = p.joinRequests[0] || null;
    const { members, joinRequests, ...rest } = p;
    return { ...rest, isMember, myRole, myJoinRequest };
  });

  res.json(result);
});

// ─── Get single project ───────────────────────────────────────────────────
projectRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      clientContact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: { select: { name: true, address: true } } } },
      _count: { select: { contacts: true, tickets: true, activities: true, companies: true, members: true, costs: true, updates: true, projectAttachments: true, invoices: true } },
      joinRequests: {
        where: { userId: req.user!.id },
        select: { id: true, status: true, createdAt: true },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
  const isMember = isSuperAdmin || project.members.some((m) => m.userId === req.user!.id);
  const myRole = isSuperAdmin ? 'SUPER_ADMIN' : (project.members.find((m) => m.userId === req.user!.id)?.role || null);
  const myJoinRequest = project.joinRequests[0] || null;

  // Finance summary (only for members/admins)
  let costSummary = null;
  if (isMember) {
    costSummary = await prisma.projectCost.groupBy({
      by: ['type'],
      where: { projectId: req.params.id },
      _sum: { amount: true },
    });
  }

  const { joinRequests, ...rest } = project;
  res.json({ ...rest, isMember, myRole, myJoinRequest, costSummary });
});

// ─── Submit join request ───────────────────────────────────────────────────
projectRoutes.post('/:id/join-request', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    select: { id: true, name: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Already a member?
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: req.user!.id } },
  });
  if (existing) return res.status(400).json({ error: 'Already a member of this project' });

  // Create or update join request
  const request = await prisma.projectJoinRequest.upsert({
    where: { projectId_userId: { projectId: project.id, userId: req.user!.id } },
    create: {
      projectId: project.id,
      userId: req.user!.id,
      message: req.body.message || null,
      status: 'PENDING',
    },
    update: { status: 'PENDING', message: req.body.message || null, resolvedAt: null, resolvedById: null },
  });

  // Notify all SUPER_ADMINs
  const admins = await prisma.user.findMany({
    where: { organizationId: req.user!.organizationId, role: 'SUPER_ADMIN' },
    select: { id: true },
  });
  await Promise.all(admins.map((admin) =>
    NotificationService.notify({
      userId: admin.id,
      type: 'TASK_ASSIGNED',
      title: 'Project access request',
      message: `${req.user!.name} has requested access to project "${project.name}".`,
      link: '/projects',
      organizationId: req.user!.organizationId,
    }).catch(() => {})
  ));

  res.status(201).json(request);
});

// ─── Create project ───────────────────────────────────────────────────────
projectRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description, color, totalBudget, currency, deadline, clientContactId } = req.body;

  const existing = await prisma.project.findFirst({
    where: { name, organizationId: req.user!.organizationId },
  });
  if (existing) return res.status(400).json({ error: `A project named "${name}" already exists` });

  const project = await prisma.project.create({
    data: {
      name,
      description,
      color: color || '#3b82f6',
      organizationId: req.user!.organizationId,
      totalBudget: totalBudget ? parseFloat(totalBudget) : undefined,
      currency: currency || 'USD',
      deadline: deadline ? new Date(deadline) : undefined,
      clientContactId: clientContactId || undefined,
      members: { create: { userId: req.user!.id, role: 'OWNER' } },
    },
  });
  res.status(201).json({ ...project, isMember: true, myRole: 'OWNER', myJoinRequest: null });
});

// ─── Update project ───────────────────────────────────────────────────────
projectRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, description, status, color, totalBudget, currency, deadline, clientContactId } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(color !== undefined && { color }),
      ...(totalBudget !== undefined && { totalBudget: totalBudget === '' ? null : parseFloat(totalBudget) }),
      ...(currency !== undefined && { currency }),
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      ...(clientContactId !== undefined && { clientContactId: clientContactId || null }),
    },
    include: {
      clientContact: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  res.json(project);
});

// ─── Members ──────────────────────────────────────────────────────────────
projectRoutes.post('/:id/members', async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.body;
  const member = await prisma.projectMember.create({
    data: { projectId: req.params.id, userId, role: role || 'MEMBER' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.status(201).json(member);
});

projectRoutes.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  await prisma.projectMember.deleteMany({
    where: { projectId: req.params.id, userId: req.params.userId },
  });
  res.json({ success: true });
});

// ─── Delete project (SUPER_ADMIN only) ───────────────────────────────────
projectRoutes.delete('/:id', requireRole('SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  const projectId = req.params.id as string;
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: req.user!.organizationId } });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  await prisma.$transaction([
    prisma.projectJoinRequest.deleteMany({ where: { projectId } }),
    prisma.pipelineLog.deleteMany({ where: { pipeline: { projectId } } }),
    prisma.pipeline.deleteMany({ where: { projectId } }),
    prisma.functionalResolution.deleteMany({ where: { projectId } }),
    prisma.knowledgeEntry.deleteMany({ where: { projectId } }),
    prisma.projectDocument.deleteMany({ where: { projectId } }),
    prisma.invoice.deleteMany({ where: { projectId } }),
    prisma.projectCost.deleteMany({ where: { projectId } }),
    prisma.projectAttachment.deleteMany({ where: { projectId } }),
    prisma.projectUpdate.deleteMany({ where: { projectId } }),
    prisma.activity.deleteMany({ where: { projectId } }),
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
