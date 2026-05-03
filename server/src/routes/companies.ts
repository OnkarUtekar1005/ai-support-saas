import { Router, Response } from 'express';
import { authenticate, AuthRequest, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const companyRoutes = Router();
companyRoutes.use(authenticate);

// List companies
companyRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { projectId, search } = req.query;
  const where: any = { organizationId: req.user!.organizationId };

  // Project scoping
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (allowedIds !== null) {
    where.projectId = { in: allowedIds };
  }

  if (projectId) where.projectId = projectId;
  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { domain: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { contacts: true } },
    },
  });
  res.json(companies);
});

// Get single company
companyRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const company = await prisma.company.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      contacts: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 10 },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json(company);
});

// Create
companyRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { name, domain, industry, size, phone, address, notes, projectId } = req.body;
  const company = await prisma.company.create({
    data: { name, domain, industry, size, phone, address, notes, projectId, organizationId: req.user!.organizationId },
  });
  res.status(201).json(company);
});

// Update
companyRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const data: any = {};
  for (const f of ['name', 'domain', 'industry', 'size', 'phone', 'address', 'notes', 'projectId']) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  const company = await prisma.company.update({ where: { id: req.params.id }, data });
  res.json(company);
});

// Delete
companyRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.company.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
