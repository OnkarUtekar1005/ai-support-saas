import { Router, Response } from 'express';
import { authenticate, AuthRequest, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const dealRoutes = Router();
dealRoutes.use(authenticate);

// List deals (pipeline view)
dealRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { projectId, stage, ownerId } = req.query;
  const where: any = { organizationId: req.user!.organizationId };

  // Project scoping
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (allowedIds !== null) {
    where.projectId = { in: allowedIds };
  }

  if (projectId) where.projectId = projectId;
  if (stage) where.stage = stage;
  if (ownerId) where.ownerId = ownerId;

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  res.json(deals);
});

// Pipeline summary (for board view)
dealRoutes.get('/pipeline', async (req: AuthRequest, res: Response) => {
  const { projectId } = req.query;
  const where: any = { organizationId: req.user!.organizationId };

  // Project scoping
  const pipelineAllowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (pipelineAllowedIds !== null) {
    where.projectId = { in: pipelineAllowedIds };
  }

  if (projectId) where.projectId = projectId;

  const stages = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

  const pipeline = await Promise.all(
    stages.map(async (stage) => {
      const deals = await prisma.deal.findMany({
        where: { ...where, stage: stage as any },
        orderBy: { updatedAt: 'desc' },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
          owner: { select: { name: true } },
        },
      });
      const totalValue = deals.reduce((s, d) => s + d.value, 0);
      return { stage, deals, count: deals.length, totalValue };
    })
  );

  res.json(pipeline);
});

// Get single deal
dealRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const deal = await prisma.deal.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      contact: true,
      company: true,
      owner: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true, color: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
});

// Create deal
dealRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { title, value, currency, stage, probability, expectedClose, notes, contactId, companyId, projectId } = req.body;
  const deal = await prisma.deal.create({
    data: {
      title, value: value || 0, currency: currency || 'USD',
      stage: stage || 'LEAD', probability: probability || 0,
      expectedClose: expectedClose ? new Date(expectedClose) : null,
      notes, contactId, companyId, projectId,
      ownerId: req.user!.id,
      organizationId: req.user!.organizationId,
    },
    include: {
      contact: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });
  res.status(201).json(deal);
});

// Update deal (including stage changes for drag-drop)
dealRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const data: any = {};
  for (const f of ['title', 'value', 'currency', 'stage', 'probability', 'notes', 'contactId', 'companyId', 'ownerId', 'projectId']) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (req.body.expectedClose !== undefined) data.expectedClose = req.body.expectedClose ? new Date(req.body.expectedClose) : null;
  if (req.body.stage === 'CLOSED_WON' || req.body.stage === 'CLOSED_LOST') {
    data.closedAt = new Date();
  }
  const deal = await prisma.deal.update({ where: { id: req.params.id }, data });
  res.json(deal);
});

// Delete deal
dealRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.deal.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
