import winston from 'winston';
import { prisma } from '../../utils/prisma';
import { GeminiLogAnalyzer } from '../ai/GeminiLogAnalyzer';
import { EmailService } from '../email/EmailService';

interface ErrorLogInput {
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  stack?: string;
  source: string;
  category?: string;
  endpoint?: string;
  userId?: string;
  projectId?: string;
  organizationId?: string;
  requestData?: any;
}

// Winston logger for file/console output
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
   * Log an error to:
   * 1. Winston (file/console)
   * 2. Database (ErrorLog table)
   * 3. Gemini AI (for analysis)
   * 4. Email (admin notification)
   */
  static async logError(input: ErrorLogInput): Promise<string | null> {
    // 1. Log to winston immediately
    winstonLogger.log(input.level.toLowerCase(), input.message, {
      source: input.source,
      endpoint: input.endpoint,
      stack: input.stack,
    });

    // If no org context, just log to winston
    if (!input.organizationId) {
      return null;
    }

    try {
      // 2. Save to database
      const errorLog = await prisma.errorLog.create({
        data: {
          level: input.level,
          message: input.message,
          stack: input.stack,
          source: input.source,
          category: input.category,
          endpoint: input.endpoint,
          userId: input.userId,
          projectId: input.projectId,
          requestData: input.requestData || undefined,
          organizationId: input.organizationId,
        },
      });

      // 3. For ERROR and FATAL, trigger Gemini analysis (async, don't block)
      if (input.level === 'ERROR' || input.level === 'FATAL') {
        ErrorLogger.analyzeAndNotify(errorLog.id, input).catch((err) => {
          winstonLogger.error('Failed to analyze error with Gemini', { error: err.message });
        });
      }

      return errorLog.id;
    } catch (dbErr) {
      winstonLogger.error('Failed to save error to database', { error: (dbErr as Error).message });
      return null;
    }
  }

  /**
   * Analyze the error with Gemini AI and send email notification
   */
  private static async analyzeAndNotify(errorLogId: string, input: ErrorLogInput) {
    // Get AI analysis
    const analysis = await GeminiLogAnalyzer.analyzeError({
      message: input.message,
      stack: input.stack,
      source: input.source,
      endpoint: input.endpoint,
    });

    // Update the error log with AI analysis
    await prisma.errorLog.update({
      where: { id: errorLogId },
      data: {
        aiAnalysis: analysis.rootCause,
        aiSuggestion: analysis.suggestion,
        analyzed: true,
      },
    });

    // Send email notification to admin team
    if (input.organizationId) {
      const emailSettings = await prisma.emailSettings.findUnique({
        where: { organizationId: input.organizationId },
      });

      const shouldNotify =
        emailSettings &&
        ((input.level === 'ERROR' && emailSettings.notifyOnError) ||
          (input.level === 'FATAL' && emailSettings.notifyOnFatal));

      if (shouldNotify && emailSettings.adminEmails.length > 0) {
        await EmailService.sendErrorAlert({
          to: emailSettings.adminEmails,
          errorMessage: input.message,
          source: input.source,
          endpoint: input.endpoint,
          aiAnalysis: analysis.rootCause,
          aiSuggestion: analysis.suggestion,
          level: input.level,
          timestamp: new Date().toISOString(),
          smtpConfig: emailSettings,
        });

        await prisma.errorLog.update({
          where: { id: errorLogId },
          data: { emailSent: true },
        });
      }
    }
  }

  /**
   * Get recent error logs for an organization (admin dashboard)
   */
  static async getErrorLogs(
    organizationId: string,
    options: { page?: number; limit?: number; level?: string; analyzed?: boolean; projectId?: string; category?: string }
  ) {
    const { page = 1, limit = 50, level, analyzed, projectId, category } = options;

    const where: any = { organizationId };
    if (level) where.level = level;
    if (analyzed !== undefined) where.analyzed = analyzed;
    if (projectId) where.projectId = projectId;
    if (category) where.category = category;

    const [logs, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          project: { select: { id: true, name: true, color: true } },
        },
      }),
      prisma.errorLog.count({ where }),
    ]);

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Re-analyze a specific error log with Gemini
   */
  static async reanalyzeError(errorLogId: string) {
    const errorLog = await prisma.errorLog.findUnique({ where: { id: errorLogId } });
    if (!errorLog) throw new Error('Error log not found');

    const analysis = await GeminiLogAnalyzer.analyzeError({
      message: errorLog.message,
      stack: errorLog.stack || undefined,
      source: errorLog.source,
      endpoint: errorLog.endpoint || undefined,
    });

    return prisma.errorLog.update({
      where: { id: errorLogId },
      data: {
        aiAnalysis: analysis.rootCause,
        aiSuggestion: analysis.suggestion,
        analyzed: true,
      },
    });
  }
}
