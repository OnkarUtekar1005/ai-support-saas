import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { mkdirSync } from 'fs';

export interface ErrorLogEntry {
  ts: string;
  fp: string;
  level: string;
  msg: string;
  stack?: string;
  source: string;
  category?: string;
  endpoint?: string;
  language?: string;
  framework?: string;
  environment?: string;
  hostname?: string;
  orgId?: string;
  projectId?: string;
  userId?: string;
  meta?: any;
}

const LOG_BASE_DIR = path.resolve(process.cwd(), 'logs/errors');

// Per-org loggers cache
const orgLoggers = new Map<string, winston.Logger>();

function getOrgLogger(orgId: string): winston.Logger {
  if (orgLoggers.has(orgId)) return orgLoggers.get(orgId)!;

  const orgDir = path.join(LOG_BASE_DIR, orgId);
  mkdirSync(orgDir, { recursive: true });

  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.printf(({ message }) => String(message)),
    transports: [
      new DailyRotateFile({
        dirname: orgDir,
        filename: '%DATE%.jsonl',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        maxSize: '50m',
      }),
    ],
  });

  orgLoggers.set(orgId, logger);
  return logger;
}

// Global logger (for errors without org context)
const globalDir = path.join(LOG_BASE_DIR, 'global');
mkdirSync(globalDir, { recursive: true });

const globalLogger = winston.createLogger({
  level: 'info',
  format: winston.format.printf(({ message }) => String(message)),
  transports: [
    new DailyRotateFile({
      dirname: globalDir,
      filename: '%DATE%.jsonl',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '50m',
    }),
  ],
});

export class ErrorLogWriter {
  /**
   * Write a structured error entry to the appropriate JSONL log file.
   */
  static write(entry: ErrorLogEntry): void {
    const line = JSON.stringify(entry);

    if (entry.orgId) {
      getOrgLogger(entry.orgId).info(line);
    } else {
      globalLogger.info(line);
    }
  }

  /**
   * Read errors from log file for a specific org + date range.
   * Used for trend analysis and dashboard on server restart.
   */
  static async readLogs(
    orgId: string,
    date: string // YYYY-MM-DD
  ): Promise<ErrorLogEntry[]> {
    const filePath = path.join(LOG_BASE_DIR, orgId, `${date}.jsonl`);
    const entries: ErrorLogEntry[] = [];

    try {
      const { readFileSync } = await import('fs');
      const content = readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File doesn't exist — no errors for this date
    }

    return entries;
  }

  /**
   * Read errors from the last N hours across all dates.
   */
  static async readRecentLogs(orgId: string, hours: number): Promise<ErrorLogEntry[]> {
    const now = new Date();
    const dates = new Set<string>();

    // Collect date strings covering the range
    for (let h = 0; h <= hours; h++) {
      const d = new Date(now.getTime() - h * 60 * 60 * 1000);
      dates.add(d.toISOString().split('T')[0]);
    }

    const allEntries: ErrorLogEntry[] = [];
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);

    for (const date of dates) {
      const entries = await this.readLogs(orgId, date);
      for (const entry of entries) {
        if (new Date(entry.ts) >= cutoff) {
          allEntries.push(entry);
        }
      }
    }

    return allEntries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }
}
