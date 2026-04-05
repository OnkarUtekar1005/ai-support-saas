import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole, getUserProjectIds } from '../middleware/auth';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { GeminiLogAnalyzer } from '../services/ai/GeminiLogAnalyzer';

export const errorLogRoutes = Router();
errorLogRoutes.use(authenticate);
errorLogRoutes.use(requireRole('ADMIN'));

// Get error logs — reads from in-memory buffer, not DB
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

    // Project scoping: filter logs to allowed projects
    const allowedIds = await getUserProjectIds(req.user!.id, req.user!.role);
    if (allowedIds !== null) {
      result.logs = result.logs.filter((log: any) => !log.projectId || allowedIds.includes(log.projectId));
      result.total = result.logs.length;
      result.totalPages = Math.ceil(result.total / (limit ? Number(limit) : 50));
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// Get error log stats — from in-memory counters
errorLogRoutes.get('/stats', async (req: AuthRequest, res: Response) => {
  const stats = ErrorLogger.getStats(req.user!.organizationId);
  res.json(stats);
});

// Get fingerprint summaries (grouped unique errors with counts)
errorLogRoutes.get('/fingerprints', async (req: AuthRequest, res: Response) => {
  const summaries = ErrorLogger.getFingerprintSummary(req.user!.organizationId);
  res.json(summaries);
});

// Re-analyze a specific error fingerprint with Gemini
errorLogRoutes.post('/:fingerprint/reanalyze', async (req: AuthRequest, res: Response) => {
  try {
    const updated = await ErrorLogger.reanalyzeError(req.params.fingerprint as string);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Trend analysis — reads from log files
errorLogRoutes.post('/trend-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const { hours = 24 } = req.body;

    const logEntries = await ErrorLogger.getLogEntries(req.user!.organizationId, Number(hours));

    if (logEntries.length === 0) {
      return res.json({ patterns: [], systemicIssues: [], recommendations: [], riskLevel: 'low' });
    }

    const errors = logEntries.map(e => ({
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

// Get a single error by fingerprint
errorLogRoutes.get('/:fingerprint', async (req: AuthRequest, res: Response) => {
  const { ErrorIngestionService } = await import('../services/logging/ErrorIngestionService');
  const entry = ErrorIngestionService.getInstance().getErrorByFingerprint(req.params.fingerprint as string);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});
