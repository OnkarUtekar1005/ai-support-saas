import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { GeminiLogAnalyzer } from '../services/ai/GeminiLogAnalyzer';
import { prisma } from '../utils/prisma';

export const errorLogRoutes = Router();
errorLogRoutes.use(authenticate);
errorLogRoutes.use(requireRole('ADMIN'));

// Get error logs with pagination and filters
errorLogRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, level, analyzed, projectId, category } = req.query;

    const result = await ErrorLogger.getErrorLogs(req.user!.organizationId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      level: level as string,
      analyzed: analyzed !== undefined ? analyzed === 'true' : undefined,
      projectId: projectId as string,
      category: category as string,
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// Get error log stats (dashboard)
errorLogRoutes.get('/stats', async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total, last24hCount, last7dCount, byLevel, unanalyzed] = await Promise.all([
    prisma.errorLog.count({ where: { organizationId: orgId } }),
    prisma.errorLog.count({ where: { organizationId: orgId, createdAt: { gte: last24h } } }),
    prisma.errorLog.count({ where: { organizationId: orgId, createdAt: { gte: last7d } } }),
    prisma.errorLog.groupBy({
      by: ['level'],
      where: { organizationId: orgId, createdAt: { gte: last7d } },
      _count: true,
    }),
    prisma.errorLog.count({ where: { organizationId: orgId, analyzed: false } }),
  ]);

  res.json({
    total,
    last24h: last24hCount,
    last7d: last7dCount,
    unanalyzed,
    byLevel: byLevel.reduce((acc, b) => ({ ...acc, [b.level]: b._count }), {}),
  });
});

// Re-analyze a specific error
errorLogRoutes.post('/:id/reanalyze', async (req: AuthRequest, res: Response) => {
  try {
    const updated = await ErrorLogger.reanalyzeError(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Trend analysis for recent errors
errorLogRoutes.post('/trend-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const { hours = 24 } = req.body;
    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    const errors = await prisma.errorLog.findMany({
      where: { organizationId: req.user!.organizationId, createdAt: { gte: since } },
      select: { message: true, source: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (errors.length === 0) {
      return res.json({ patterns: [], systemicIssues: [], recommendations: [], riskLevel: 'low' });
    }

    const analysis = await GeminiLogAnalyzer.analyzeTrend(errors);
    res.json(analysis);
  } catch {
    res.status(500).json({ error: 'Trend analysis failed' });
  }
});

// Get a single error log
errorLogRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const log = await prisma.errorLog.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!log) return res.status(404).json({ error: 'Not found' });
  res.json(log);
});
