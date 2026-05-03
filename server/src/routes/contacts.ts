import { Router, Response } from 'express';
import { authenticate, AuthRequest, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const contactRoutes = Router();
contactRoutes.use(authenticate);

// List contacts — cursor-based pagination
contactRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { projectId, companyId, status, search, cursor, limit = '50' } = req.query;
  const take = Math.min(Number(limit), 200);

  const where: any = { organizationId: req.user!.organizationId };

  // Project scoping
  const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
  if (allowedIds !== null) {
    where.projectId = { in: allowedIds };
  }

  if (projectId) where.projectId = projectId;
  if (companyId) where.companyId = companyId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { firstName: { contains: search as string, mode: 'insensitive' } },
      { lastName: { contains: search as string, mode: 'insensitive' } },
      { email: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  if (cursor) {
    const { createdAt, id } = JSON.parse(Buffer.from(cursor as string, 'base64').toString());
    const cursorClause = [
      { createdAt: { lt: new Date(createdAt) } },
      { createdAt: new Date(createdAt), id: { lt: id } },
    ];
    // Merge with existing OR (search) if present
    where.AND = [{ OR: cursorClause }];
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    include: {
      company: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      _count: { select: { activities: true, tickets: true } },
    },
  });

  const hasNextPage = contacts.length > take;
  if (hasNextPage) contacts.pop();

  const nextCursor = hasNextPage
    ? Buffer.from(JSON.stringify({ createdAt: contacts[contacts.length - 1].createdAt, id: contacts[contacts.length - 1].id })).toString('base64')
    : null;

  res.json({ contacts, nextCursor, hasNextPage });
});

// Get single contact with related data
contactRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const contact = await prisma.contact.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      company: true,
      project: { select: { id: true, name: true, color: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 10, include: { assignee: { select: { name: true } } } },
      tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  res.json(contact);
});

// Create contact
contactRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { firstName, lastName, email, phone, jobTitle, status, source, notes, companyId, projectId } = req.body;
  const contact = await prisma.contact.create({
    data: {
      firstName, lastName, email, phone, jobTitle,
      status: status || 'ACTIVE',
      source, notes, companyId, projectId,
      organizationId: req.user!.organizationId,
    },
    include: { company: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
  });
  res.status(201).json(contact);
});

// Update contact
contactRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const data: any = {};
  const fields = ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'status', 'source', 'notes', 'companyId', 'projectId'];
  for (const f of fields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  const contact = await prisma.contact.update({ where: { id: req.params.id }, data });
  res.json(contact);
});

// Delete contact
contactRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.contact.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
