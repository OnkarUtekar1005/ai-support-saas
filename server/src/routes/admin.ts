import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole, requireSuperAdmin, getUserProjectIds } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const adminRoutes = Router();
adminRoutes.use(authenticate);
adminRoutes.use(requireRole('ADMIN'));

// Get organization users (with their project assignments)
adminRoutes.get('/users', async (req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.user!.organizationId },
    select: {
      id: true, email: true, name: true, role: true, createdAt: true,
      projectMembers: {
        select: {
          role: true,
          project: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
  res.json(users);
});

// Update user role — only SUPER_ADMIN can promote to SUPER_ADMIN or ADMIN
adminRoutes.patch('/users/:id/role', async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!['SUPER_ADMIN', 'ADMIN', 'AGENT', 'VIEWER'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Only SUPER_ADMIN can assign SUPER_ADMIN role
  if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only Super Admin can promote to Super Admin' });
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
  });
  res.json({ id: user.id, role: user.role });
});

// Assign admin to project (link user as project member)
adminRoutes.post('/users/:id/projects', async (req: AuthRequest, res: Response) => {
  const { projectId, projectRole } = req.body;

  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  // Only SUPER_ADMIN can assign other admins to projects
  if (req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only Super Admin can assign users to projects' });
  }

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: req.params.id } },
    update: { role: projectRole || 'MANAGER' },
    create: {
      projectId,
      userId: req.params.id,
      role: projectRole || 'MANAGER',
    },
    include: { project: { select: { id: true, name: true, color: true } } },
  });

  res.json(member);
});

// Remove user from project
adminRoutes.delete('/users/:id/projects/:projectId', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.projectMember.deleteMany({
    where: { userId: req.params.id, projectId: req.params.projectId },
  });
  res.json({ success: true });
});

// Get/update email settings
adminRoutes.get('/email-settings', async (req: AuthRequest, res: Response) => {
  const settings = await prisma.emailSettings.findUnique({
    where: { organizationId: req.user!.organizationId },
  });
  res.json(settings || null);
});

adminRoutes.put('/email-settings', async (req: AuthRequest, res: Response) => {
  const { smtpHost, smtpPort, smtpUser, smtpPass, adminEmails, notifyOnError, notifyOnFatal, digestEnabled, digestCron } = req.body;

  const settings = await prisma.emailSettings.upsert({
    where: { organizationId: req.user!.organizationId },
    update: {
      smtpHost, smtpPort, smtpUser,
      ...(smtpPass && { smtpPassEnc: smtpPass }),
      adminEmails, notifyOnError, notifyOnFatal, digestEnabled, digestCron,
    },
    create: {
      organizationId: req.user!.organizationId,
      smtpHost, smtpPort: smtpPort || 587, smtpUser,
      smtpPassEnc: smtpPass || '',
      adminEmails: adminEmails || [],
      notifyOnError: notifyOnError ?? true,
      notifyOnFatal: notifyOnFatal ?? true,
      digestEnabled: digestEnabled ?? false,
      digestCron,
    },
  });

  res.json(settings);
});

// Dashboard — scoped by role
adminRoutes.get('/dashboard', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const allowedProjects = await getUserProjectIds(req.user!.id, req.user!.role);

  // Build ticket filter
  const ticketWhere: any = { organizationId: orgId };
  if (allowedProjects !== null) {
    ticketWhere.projectId = { in: allowedProjects };
  }

  const [userCount, ticketStats, recentTickets] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.ticket.groupBy({
      by: ['status'],
      where: ticketWhere,
      _count: true,
    }),
    prisma.ticket.findMany({
      where: ticketWhere,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, title: true, status: true, priority: true, createdAt: true,
        project: { select: { name: true, color: true } },
      },
    }),
  ]);

  res.json({
    users: userCount,
    tickets: ticketStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    recentTickets,
  });
});
