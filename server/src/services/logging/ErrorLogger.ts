import winston from 'winston';
import { ErrorIngestionService, ErrorInput, ErrorEntry, OrgStats, FingerprintSummary } from './ErrorIngestionService';
import { ErrorLogWriter } from './ErrorLogWriter';
import { GeminiLogAnalyzer } from '../ai/GeminiLogAnalyzer';

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
  language?: string;
  framework?: string;
  environment?: string;
  hostname?: string;
  metadata?: any;
}

// Winston logger for file/console output (kept for backward compat + server-side logging)
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
   * 1. Winston (file/console) — immediate
   * 2. ErrorIngestionService (structured log file + memory + Gemini dedup)
   *
   * NO database writes — errors live in log files + memory.
   */
  static async logError(input: ErrorLogInput): Promise<string | null> {
    // 1. Log to Winston immediately (server-side visibility)
    winstonLogger.log(input.level.toLowerCase(), input.message, {
      source: input.source,
      endpoint: input.endpoint,
      stack: input.stack,
    });

    // 2. Route to ErrorIngestionService (file + memory + Gemini + email)
    const ingestion = ErrorIngestionService.getInstance();
    const result = ingestion.ingest({
      level: input.level,
      message: input.message,
      stack: input.stack,
      source: input.source,
      category: input.category,
      endpoint: input.endpoint,
      userId: input.userId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      language: input.language,
      framework: input.framework,
      environment: input.environment,
      hostname: input.hostname,
      metadata: input.metadata || input.requestData,
    });

    // Return fingerprint as the "ID" (replaces the DB errorLog.id)
    return result.fingerprint;
  }

  /**
   * Get recent error logs for an organization (dashboard).
   * Reads from in-memory buffer, not DB.
   */
  static async getErrorLogs(
    organizationId: string,
    options: { page?: number; limit?: number; level?: string; analyzed?: boolean; projectId?: string; category?: string }
  ) {
    const { page = 1, limit = 50, level, category } = options;
    const ingestion = ErrorIngestionService.getInstance();

    let logs = ingestion.getRecentErrors(organizationId, 1000);

    // Apply filters
    if (level) logs = logs.filter(e => e.level === level);
    if (category) logs = logs.filter(e => e.category === category);
    if (options.projectId) logs = logs.filter(e => e.projectId === options.projectId);
    if (options.analyzed !== undefined) logs = logs.filter(e => e.analyzed === options.analyzed);

    const total = logs.length;
    const paged = logs.slice((page - 1) * limit, page * limit);

    return { logs: paged, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get error stats for dashboard.
   */
  static getStats(organizationId: string): OrgStats {
    return ErrorIngestionService.getInstance().getStats(organizationId);
  }

  /**
   * Get fingerprint summaries (grouped errors).
   */
  static getFingerprintSummary(organizationId: string): FingerprintSummary[] {
    return ErrorIngestionService.getInstance().getFingerprintSummary(organizationId);
  }

  /**
   * Re-analyze a specific fingerprint with Gemini.
   */
  static async reanalyzeError(fingerprint: string) {
    const ingestion = ErrorIngestionService.getInstance();
    const entry = ingestion.getFingerprintDetail(fingerprint);
    if (!entry) throw new Error('Error fingerprint not found');

    const analysis = await GeminiLogAnalyzer.analyzeError({
      message: entry.message,
      stack: entry.stack,
      source: entry.source,
      endpoint: entry.endpoint,
    });

    // Update in-memory cache
    entry.analyzed = true;
    entry.aiAnalysis = analysis.rootCause;
    entry.aiSuggestion = analysis.suggestion;

    return {
      fingerprint: entry.fingerprint,
      message: entry.message,
      source: entry.source,
      aiAnalysis: analysis.rootCause,
      aiSuggestion: analysis.suggestion,
      analyzed: true,
    };
  }

  /**
   * Read errors from log files for trend analysis.
   */
  static async getLogEntries(organizationId: string, hours: number) {
    return ErrorLogWriter.readRecentLogs(organizationId, hours);
  }
}
