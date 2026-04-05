import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const reminderConfigRoutes = Router();
reminderConfigRoutes.use(authenticate);
reminderConfigRoutes.use(requireRole('ADMIN'));

// Get reminder config for a project (return defaults if not exists)
reminderConfigRoutes.get('/:projectId', async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.reminderConfig.findUnique({
      where: { projectId: req.params.projectId },
    });

    if (!config) {
      return res.json({
        projectId: req.params.projectId,
        enabled: false,
        overdueReminder: true,
        dueSoonHours: 24,
        statusUpdateFreq: 'daily',
        assignOnCreate: true,
      });
    }

    res.json(config);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminder config' });
  }
});

// Upsert reminder config for a project
reminderConfigRoutes.put('/:projectId', async (req: AuthRequest, res: Response) => {
  try {
    const { enabled, overdueReminder, dueSoonHours, statusUpdateFreq, assignOnCreate } = req.body;

    const config = await prisma.reminderConfig.upsert({
      where: { projectId: req.params.projectId },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(overdueReminder !== undefined && { overdueReminder }),
        ...(dueSoonHours !== undefined && { dueSoonHours }),
        ...(statusUpdateFreq !== undefined && { statusUpdateFreq }),
        ...(assignOnCreate !== undefined && { assignOnCreate }),
      },
      create: {
        projectId: req.params.projectId,
        enabled: enabled ?? false,
        overdueReminder: overdueReminder ?? true,
        dueSoonHours: dueSoonHours ?? 24,
        statusUpdateFreq: statusUpdateFreq ?? 'daily',
        assignOnCreate: assignOnCreate ?? true,
      },
    });

    res.json(config);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder config' });
  }
});
