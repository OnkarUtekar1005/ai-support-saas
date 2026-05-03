import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const projectCostRoutes = Router({ mergeParams: true });
projectCostRoutes.use(authenticate);

// List all cost items for a project
projectCostRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const costs = await prisma.projectCost.findMany({
    where: { projectId: req.params.projectId },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(costs);
});

// Add a cost item
projectCostRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, type, amount, description, notes, date } = req.body;
  if (!name || amount === undefined) return res.status(400).json({ error: 'name and amount are required' });

  const cost = await prisma.projectCost.create({
    data: {
      projectId: req.params.projectId,
      name,
      type: type || 'BASE_COST',
      amount: parseFloat(amount),
      description,
      notes,
      date: date ? new Date(date) : new Date(),
      addedById: req.user!.id,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });
  res.status(201).json(cost);
});

// Update a cost item
projectCostRoutes.patch('/:costId', async (req: AuthRequest, res: Response) => {
  const cost = await prisma.projectCost.findFirst({
    where: { id: req.params.costId, projectId: req.params.projectId },
  });
  if (!cost) return res.status(404).json({ error: 'Cost item not found' });

  const { name, type, amount, description, notes, date } = req.body;
  const updated = await prisma.projectCost.update({
    where: { id: req.params.costId },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(description !== undefined && { description }),
      ...(notes !== undefined && { notes }),
      ...(date !== undefined && { date: new Date(date) }),
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });
  res.json(updated);
});

// Delete a cost item
projectCostRoutes.delete('/:costId', async (req: AuthRequest, res: Response) => {
  const cost = await prisma.projectCost.findFirst({
    where: { id: req.params.costId, projectId: req.params.projectId },
  });
  if (!cost) return res.status(404).json({ error: 'Cost item not found' });

  await prisma.projectCost.delete({ where: { id: req.params.costId } });
  res.json({ success: true });
});
