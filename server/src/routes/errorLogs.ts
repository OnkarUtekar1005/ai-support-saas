import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole, getUserProjectIds } from '../middleware/auth';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { GeminiLogAnalyzer } from '../services/ai/GeminiLogAnalyzer';
import { prisma } from '../utils/prisma';

export const errorLogRoutes = Router();
errorLogRoutes.use(authenticate);
errorLogRoutes.use(requireRole('ADMIN'));

// List errors — DB query, supports ?date=YYYY-MM-DD for day filter (refresh button)
errorLogRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, level, analyzed, projectId, category, date } = req.query;

    const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);

    const result = await ErrorLogger.getErrorLogs(req.user!.organizationId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      level: level as string,
      analyzed: analyzed !== undefined ? analyzed === 'true' : undefined,
      projectId: (projectId as string) || (allowedIds !== null ? undefined : undefined),
      category: category as string,
      date: date as string,
    });

    // Scope to allowed projects
    if (allowedIds !== null) {
      result.logs = result.logs.filter(
        (log: any) => !log.projectId || allowedIds.includes(log.projectId)
      );
      result.total = result.logs.length;
      result.totalPages = Math.ceil(result.total / (limit ? Number(limit) : 50));
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// Stats — DB aggregation
errorLogRoutes.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await ErrorLogger.getStats(req.user!.organizationId);
    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Fingerprint summaries (grouped unique errors)
errorLogRoutes.get('/fingerprints', async (req: AuthRequest, res: Response) => {
  try {
    const summaries = await ErrorLogger.getFingerprintSummary(req.user!.organizationId);
    res.json(summaries);
  } catch {
    res.status(500).json({ error: 'Failed to fetch fingerprints' });
  }
});

// Re-analyze a specific error with Gemini
errorLogRoutes.post('/:id/reanalyze', async (req: AuthRequest, res: Response) => {
  try {
    const updated = await ErrorLogger.reanalyzeError(req.params.id as string);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Trend analysis — reads from .jsonl audit trail files
errorLogRoutes.post('/trend-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const { hours = 24 } = req.body;
    const logEntries = await ErrorLogger.getLogEntries(req.user!.organizationId, Number(hours));

    if (logEntries.length === 0) {
      return res.json({ patterns: [], systemicIssues: [], recommendations: [], riskLevel: 'low' });
    }

    const errors = logEntries.map((e) => ({
      message: e.msg,
      source: e.source,
      createdAt: new Date(e.ts),
    }));

    const analysis = await GeminiLogAnalyzer.analyzeTrend(errors);
    res.json(analysis);
  } catch {
    res.status(500).json({ error: 'Trend analysis failed' });
  }
});

// Get single error by DB id
errorLogRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const entry = await prisma.errorLog.findFirst({
      where: { id: req.params.id as string, organizationId: req.user!.organizationId },
    });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to fetch error log' });
  }
});
