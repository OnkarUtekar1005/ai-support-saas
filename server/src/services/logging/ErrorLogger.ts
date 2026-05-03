import winston from 'winston';
import { prisma } from '../../utils/prisma';
import { ErrorFingerprint } from '../orchestrator/ErrorFingerprint';
import { GeminiLogAnalyzer } from '../ai/GeminiLogAnalyzer';
import { EmailService } from '../email/EmailService';
import { ErrorLogWriter } from './ErrorLogWriter';

export interface ErrorLogInput {
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  stack?: string;
  source: string;
  category?: string;
  endpoint?: string;
  userId?: string;
  projectId?: string;
  organizationId?: string;
  language?: string;
  framework?: string;
  environment?: string;
  hostname?: string;
  metadata?: any;
  requestData?: any;
}

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.Console({ format: winston.format.simple() })]
      : []),
  ],
});

export class ErrorLogger {
  /**
   * Ingest an error:
   * 1. Winston (immediate console/file)
   * 2. Fingerprint dedup → upsert DB record
   * 3. .jsonl audit trail
   * 4. Gemini analysis (async, only for new unique errors)
   * 5. Email alert (async, only for new unique errors)
   */
  static async logError(input: ErrorLogInput): Promise<string | null> {
    // 1. Winston — fire and forget, never blocks
    winstonLogger.log(input.level.toLowerCase(), input.message, {
      source: input.source,
      endpoint: input.endpoint,
      stack: input.stack,
    });

    // 2. Fingerprint
    const fp = ErrorFingerprint.generate({
      message: input.message,
      source: input.source,
      stack: input.stack,
    });

    try {
      // 3. Upsert to DB — increment count on duplicate fingerprint
      const existing = input.organizationId
        ? await prisma.errorLog.findFirst({
            where: { fingerprint: fp, organizationId: input.organizationId },
            select: { id: true, occurrenceCount: true },
          })
        : null;

      if (existing) {
        await prisma.errorLog.update({
          where: { id: existing.id },
          data: {
            occurrenceCount: { increment: 1 },
            lastSeenAt: new Date(),
          },
        });
      } else {
        await prisma.errorLog.create({
          data: {
            level: input.level as any,
            message: input.message,
            stack: input.stack,
            source: input.source,
            category: input.category,
            endpoint: input.endpoint,
            userId: input.userId,
            projectId: input.projectId || null,
            organizationId: input.organizationId || 'global',
            language: input.language,
            framework: input.framework,
            environment: input.environment,
            hostname: input.hostname,
            metadata: input.metadata || input.requestData || undefined,
            fingerprint: fp,
          },
        });

        // Analyze + alert only on first occurrence
        if (input.level === 'ERROR' || input.level === 'FATAL') {
          ErrorLogger.analyzeAndAlert(fp, input).catch(() => {});
        }
      }

      // 4. .jsonl audit trail (always, every occurrence)
      ErrorLogWriter.write({
        ts: new Date().toISOString(),
        fp,
        level: input.level,
        msg: input.message,
        stack: input.stack,
        source: input.source,
        category: input.category,
        endpoint: input.endpoint,
        language: input.language,
        framework: input.framework,
        environment: input.environment,
        hostname: input.hostname,
        orgId: input.organizationId,
        projectId: input.projectId,
        userId: input.userId,
        meta: input.metadata || input.requestData,
      });
    } catch {
      // DB failure must never crash the caller
    }

    return fp;
  }

  private static async analyzeAndAlert(fp: string, input: ErrorLogInput): Promise<void> {
    try {
      const analysis = await GeminiLogAnalyzer.analyzeError({
        message: input.message,
        stack: input.stack,
        source: input.source,
        endpoint: input.endpoint,
      });

      // Persist analysis back to DB
      const record = input.organizationId
        ? await prisma.errorLog.findFirst({
            where: { fingerprint: fp, organizationId: input.organizationId },
            select: { id: true },
          })
        : null;

      if (record) {
        await prisma.errorLog.update({
          where: { id: record.id },
          data: {
            analyzed: true,
            aiAnalysis: analysis.rootCause,
            aiSuggestion: analysis.suggestion,
          },
        });
      }

      // Email alert
      if (input.organizationId) {
        const emailSettings = await prisma.emailSettings.findUnique({
          where: { organizationId: input.organizationId },
        });

        const shouldNotify =
          emailSettings &&
          ((input.level === 'ERROR' && emailSettings.notifyOnError) ||
            (input.level === 'FATAL' && emailSettings.notifyOnFatal));

        if (shouldNotify && emailSettings!.adminEmails.length > 0) {
          await EmailService.sendErrorAlert({
            to: emailSettings!.adminEmails,
            errorMessage: input.message,
            source: input.source,
            endpoint: input.endpoint,
            aiAnalysis: analysis.rootCause,
            aiSuggestion: analysis.suggestion,
            level: input.level,
            timestamp: new Date().toISOString(),
            smtpConfig: emailSettings!,
          });

          if (input.organizationId && record) {
            await prisma.errorLog.update({
              where: { id: record.id },
              data: { emailSent: true },
            });
          }
        }
      }
    } catch {
      // Gemini/email failure is non-critical
    }
  }

  // ─── Dashboard reads — all from DB ───

  static async getErrorLogs(
    organizationId: string,
    options: {
      page?: number;
      limit?: number;
      level?: string;
      analyzed?: boolean;
      projectId?: string;
      category?: string;
      date?: string; // YYYY-MM-DD — filter by day
    }
  ) {
    const { page = 1, limit = 50, level, analyzed, projectId, category, date } = options;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (level) where.level = level;
    if (analyzed !== undefined) where.analyzed = analyzed;
    if (projectId) where.projectId = projectId;
    if (category) where.category = category;
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      where.lastSeenAt = { gte: start, lte: end };
    }

    const [logs, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.errorLog.count({ where }),
    ]);

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  static async getStats(organizationId: string) {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, count24h, count7d, unanalyzed, byLevel, bySource, byCategory] =
      await Promise.all([
        prisma.errorLog.count({ where: { organizationId } }),
        prisma.errorLog.count({ where: { organizationId, lastSeenAt: { gte: last24h } } }),
        prisma.errorLog.count({ where: { organizationId, lastSeenAt: { gte: last7d } } }),
        prisma.errorLog.count({ where: { organizationId, analyzed: false } }),
        prisma.errorLog.groupBy({ by: ['level'], where: { organizationId }, _count: true }),
        prisma.errorLog.groupBy({ by: ['source'], where: { organizationId }, _count: true }),
        prisma.errorLog.groupBy({
          by: ['category'],
          where: { organizationId, category: { not: null } },
          _count: true,
        }),
      ]);

    return {
      total,
      last24h: count24h,
      last7d: count7d,
      unanalyzed,
      byLevel: Object.fromEntries(byLevel.map((r) => [r.level, r._count])),
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r._count])),
      byCategory: Object.fromEntries(byCategory.map((r) => [r.category!, r._count])),
    };
  }

  static async getFingerprintSummary(organizationId: string) {
    const logs = await prisma.errorLog.findMany({
      where: { organizationId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        fingerprint: true,
        level: true,
        message: true,
        source: true,
        occurrenceCount: true,
        createdAt: true,
        lastSeenAt: true,
        analyzed: true,
        aiAnalysis: true,
      },
    });
    return logs;
  }

  static async reanalyzeError(id: string) {
    const entry = await prisma.errorLog.findUnique({ where: { id } });
    if (!entry) throw new Error('Error log not found');

    const analysis = await GeminiLogAnalyzer.analyzeError({
      message: entry.message,
      stack: entry.stack ?? undefined,
      source: entry.source,
      endpoint: entry.endpoint ?? undefined,
    });

    return prisma.errorLog.update({
      where: { id },
      data: {
        analyzed: true,
        aiAnalysis: analysis.rootCause,
        aiSuggestion: analysis.suggestion,
      },
    });
  }

  static async getLogEntries(organizationId: string, hours: number) {
    return ErrorLogWriter.readRecentLogs(organizationId, hours);
  }
}
