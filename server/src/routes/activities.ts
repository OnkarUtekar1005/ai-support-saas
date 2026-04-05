import { Router, Response } from 'express';
import { authenticate, AuthRequest, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const activityRoutes = Router();
activityRoutes.use(authenticate);

// List activities
activityRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { projectId, contactId, dealId, companyId, status, type, assigneeId } = req.query;
  const where: any = { organizationId: req.user!.organizationId };

  // Project scoping
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (allowedIds !== null) {
    where.projectId = { in: allowedIds };
  }

  if (projectId) where.projectId = projectId;
  if (contactId) where.contactId = contactId;
  if (dealId) where.dealId = dealId;
  if (companyId) where.companyId = companyId;
  if (status) where.status = status;
  if (type) where.type = type;
  if (assigneeId) where.assigneeId = assigneeId;

  const activities = await prisma.activity.findMany({
    where,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  res.json(activities);
});

// Create activity
activityRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { type, subject, description, dueDate, contactId, companyId, dealId, assigneeId, projectId } = req.body;
  const activity = await prisma.activity.create({
    data: {
      type: type || 'TASK',
      subject,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      contactId, companyId, dealId, projectId,
      assigneeId: assigneeId || req.user!.id,
      createdById: req.user!.id,
      organizationId: req.user!.organizationId,
    },
    include: {
      contact: { select: { firstName: true, lastName: true } },
      assignee: { select: { name: true } },
      project: { select: { name: true, color: true } },
    },
  });
  res.status(201).json(activity);
});

// Update activity
activityRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const data: any = {};
  for (const f of ['type', 'subject', 'description', 'status', 'assigneeId', 'contactId', 'companyId', 'dealId', 'projectId']) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (req.body.dueDate !== undefined) data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  if (req.body.status === 'DONE') data.completedAt = new Date();
  if (req.body.status === 'TODO' || req.body.status === 'IN_PROGRESS') data.completedAt = null;

  const activity = await prisma.activity.update({ where: { id: req.params.id }, data });
  res.json(activity);
});

// Delete activity
activityRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.activity.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
