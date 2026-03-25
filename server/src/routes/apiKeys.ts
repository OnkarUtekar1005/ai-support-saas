import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import crypto from 'crypto';

export const apiKeyRoutes = Router();
apiKeyRoutes.use(authenticate);
apiKeyRoutes.use(requireRole('ADMIN'));

// Generate a secure API key
function generateApiKey(env: 'live' | 'test' = 'live'): string {
  const prefix = env === 'live' ? 'sk_live_' : 'sk_test_';
  return prefix + crypto.randomBytes(24).toString('hex');
}

// List all API keys for org
apiKeyRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: req.user!.organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, name: true, color: true } },
    },
  });

  // Mask keys for security (show first 12 + last 4 chars)
  const masked = keys.map((k) => ({
    ...k,
    key: k.key.substring(0, 12) + '...' + k.key.slice(-4),
    fullKey: undefined, // never send full key in list
  }));

  res.json(masked);
});

// Create new API key
apiKeyRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const { name, platform, projectId, allowedOrigins, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const key = generateApiKey('live');

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      key,
      platform: platform || 'web',
      projectId: projectId || null,
      allowedOrigins: allowedOrigins || [],
      permissions: permissions || ['contacts', 'tickets', 'errors', 'events'],
      organizationId: req.user!.organizationId,
    },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  // Return full key only on creation (user must save it)
  res.status(201).json({ ...apiKey, key });
});

// Update API key
apiKeyRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { name, isActive, allowedOrigins, permissions, projectId } = req.body;

  const apiKey = await prisma.apiKey.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(isActive !== undefined && { isActive }),
      ...(allowedOrigins !== undefined && { allowedOrigins }),
      ...(permissions !== undefined && { permissions }),
      ...(projectId !== undefined && { projectId: projectId || null }),
    },
  });

  res.json({ ...apiKey, key: apiKey.key.substring(0, 12) + '...' + apiKey.key.slice(-4) });
});

// Delete API key
apiKeyRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.apiKey.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// Get usage stats for an API key
apiKeyRoutes.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, last24hCount, last7dCount, byType] = await Promise.all([
    prisma.sdkEvent.count({ where: { apiKeyId: req.params.id } }),
    prisma.sdkEvent.count({ where: { apiKeyId: req.params.id, createdAt: { gte: last24h } } }),
    prisma.sdkEvent.count({ where: { apiKeyId: req.params.id, createdAt: { gte: last7d } } }),
    prisma.sdkEvent.groupBy({
      by: ['type'],
      where: { apiKeyId: req.params.id, createdAt: { gte: last7d } },
      _count: true,
    }),
  ]);

  res.json({
    total,
    last24h: last24hCount,
    last7d: last7dCount,
    byType: byType.reduce((acc, b) => ({ ...acc, [b.type]: b._count }), {}),
  });
});
