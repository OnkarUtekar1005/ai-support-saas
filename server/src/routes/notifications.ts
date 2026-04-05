import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);

// List user's notifications
notificationRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
notificationRoutes.get('/unread-count', async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, read: false },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark single notification as read
notificationRoutes.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { read: true },
    });
    res.json({ success: true, updated: notification.count });
  } catch {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
notificationRoutes.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    res.json({ success: true, updated: result.count });
  } catch {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});
