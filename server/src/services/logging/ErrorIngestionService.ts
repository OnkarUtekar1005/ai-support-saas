import { ErrorLogWriter, ErrorLogEntry } from './ErrorLogWriter';
import { ErrorFingerprint } from '../orchestrator/ErrorFingerprint';
import { GeminiLogAnalyzer } from '../ai/GeminiLogAnalyzer';
import { EmailService } from '../email/EmailService';
import { prisma } from '../../utils/prisma';

// ─── Types ───

export interface ErrorInput {
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
}

export interface IngestResult {
  fingerprint: string;
  isNew: boolean;
  count: number;
}

interface FingerprintEntry {
  fingerprint: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  analyzed: boolean;
  aiAnalysis?: string;
  aiSuggestion?: string;
  level: string;
  message: string;
  stack?: string;
  source: string;
  category?: string;
  endpoint?: string;
  language?: string;
  framework?: string;
  orgId?: string;
  projectId?: string;
}

export interface ErrorEntry {
  fingerprint: string;
  level: string;
  message: string;
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
  timestamp: Date;
  aiAnalysis?: string;
  aiSuggestion?: string;
  analyzed: boolean;
}

export interface OrgStats {
  total: number;
  last24h: number;
  last7d: number;
  unanalyzed: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface FingerprintSummary {
  fingerprint: string;
  count: number;
  level: string;
  message: string;
  source: string;
  firstSeen: Date;
  lastSeen: Date;
  analyzed: boolean;
  aiAnalysis?: string;
}

// ─── Circular Buffer ───

class CircularBuffer<T> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.items.length >= this.maxSize) {
      this.items.shift();
    }
    this.items.push(item);
  }

  getAll(): T[] {
    return [...this.items];
  }

  filter(fn: (item: T) => boolean): T[] {
    return this.items.filter(fn);
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

// ─── Singleton ───

let instance: ErrorIngestionService | null = null;

export class ErrorIngestionService {
  private fingerprintCache: Map<string, FingerprintEntry> = new Map();
  private recentErrors: CircularBuffer<ErrorEntry> = new CircularBuffer(2000);
  private stats: Map<string, OrgStats> = new Map();
  private hourlyCounters: Map<string, { hour: number; count: number }[]> = new Map();

  static getInstance(): ErrorIngestionService {
    if (!instance) {
      instance = new ErrorIngestionService();
    }
    return instance;
  }

  /**
   * Central intake — called by all paths (HTTP, batch, WebSocket).
   * No DB write. Logs to file + updates in-memory state.
   */
  ingest(input: ErrorInput): IngestResult {
    const fp = ErrorFingerprint.generate({
      message: input.message,
      source: input.source,
      stack: input.stack,
    });

    // Check fingerprint cache
    const existing = this.fingerprintCache.get(fp);
    const isNew = !existing;

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      this.fingerprintCache.set(fp, {
        fingerprint: fp,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        analyzed: false,
        level: input.level,
        message: input.message,
        stack: input.stack,
        source: input.source,
        category: input.category,
        endpoint: input.endpoint,
        language: input.language,
        framework: input.framework,
        orgId: input.organizationId,
        projectId: input.projectId,
      });
    }

    // Write to structured log file
    const logEntry: ErrorLogEntry = {
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
      meta: input.metadata,
    };
    ErrorLogWriter.write(logEntry);

    // Update in-memory stats
    this.updateStats(input);

    // Add to recent errors buffer
    const entry: ErrorEntry = {
      fingerprint: fp,
      level: input.level,
      message: input.message,
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
      timestamp: new Date(),
      analyzed: existing?.analyzed || false,
      aiAnalysis: existing?.aiAnalysis,
      aiSuggestion: existing?.aiSuggestion,
    };
    this.recentErrors.push(entry);

    // Trigger Gemini analysis ONLY for new fingerprints of ERROR/FATAL
    if (isNew && (input.level === 'ERROR' || input.level === 'FATAL')) {
      this.analyzeNewError(fp, input).catch(() => {});
    }

    return { fingerprint: fp, isNew, count: existing ? existing.count : 1 };
  }

  /**
   * Analyze a new error fingerprint with Gemini + send email + notify orchestrator.
   */
  private async analyzeNewError(fp: string, input: ErrorInput): Promise<void> {
    try {
      const analysis = await GeminiLogAnalyzer.analyzeError({
        message: input.message,
        stack: input.stack,
        source: input.source,
        endpoint: input.endpoint,
      });

      // Update fingerprint cache with analysis
      const entry = this.fingerprintCache.get(fp);
      if (entry) {
        entry.analyzed = true;
        entry.aiAnalysis = analysis.rootCause;
        entry.aiSuggestion = analysis.suggestion;
      }

      // Update any recent errors with this fingerprint
      for (const err of this.recentErrors.filter(e => e.fingerprint === fp)) {
        err.analyzed = true;
        err.aiAnalysis = analysis.rootCause;
        err.aiSuggestion = analysis.suggestion;
      }

      // Orchestrator is on-demand only — user clicks "Auto-Fix" to trigger.
      // No automatic pipeline creation here.

      // Send email notification
      if (input.organizationId) {
        try {
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
          }
        } catch {
          // Email failure is non-critical
        }
      }
    } catch {
      // Gemini failure — mark as analyzed with fallback
      const entry = this.fingerprintCache.get(fp);
      if (entry) {
        entry.analyzed = true;
        entry.aiAnalysis = 'Analysis unavailable';
        entry.aiSuggestion = 'Manual review required';
      }
    }
  }

  // ─── Dashboard APIs ───

  getStats(orgId: string): OrgStats {
    return this.stats.get(orgId) || {
      total: 0, last24h: 0, last7d: 0, unanalyzed: 0,
      byLevel: {}, bySource: {}, byCategory: {},
    };
  }

  getRecentErrors(orgId: string, limit: number = 50): ErrorEntry[] {
    return this.recentErrors
      .filter(e => e.orgId === orgId)
      .slice(-limit)
      .reverse();
  }

  getFingerprintSummary(orgId: string): FingerprintSummary[] {
    const summaries: FingerprintSummary[] = [];
    for (const [, entry] of this.fingerprintCache) {
      if (entry.orgId !== orgId) continue;
      summaries.push({
        fingerprint: entry.fingerprint,
        count: entry.count,
        level: entry.level,
        message: entry.message,
        source: entry.source,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
        analyzed: entry.analyzed,
        aiAnalysis: entry.aiAnalysis,
      });
    }
    return summaries.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  getFingerprintDetail(fp: string): FingerprintEntry | undefined {
    return this.fingerprintCache.get(fp);
  }

  getErrorByFingerprint(fp: string): ErrorEntry | undefined {
    const entry = this.fingerprintCache.get(fp);
    if (!entry) return undefined;
    return {
      fingerprint: fp,
      level: entry.level,
      message: entry.message,
      stack: entry.stack,
      source: entry.source,
      category: entry.category,
      endpoint: entry.endpoint,
      language: entry.language,
      framework: entry.framework,
      orgId: entry.orgId,
      projectId: entry.projectId,
      timestamp: entry.lastSeen,
      analyzed: entry.analyzed,
      aiAnalysis: entry.aiAnalysis,
      aiSuggestion: entry.aiSuggestion,
    };
  }

  // ─── Stats tracking ───

  private updateStats(input: ErrorInput): void {
    if (!input.organizationId) return;

    let stats = this.stats.get(input.organizationId);
    if (!stats) {
      stats = { total: 0, last24h: 0, last7d: 0, unanalyzed: 0, byLevel: {}, bySource: {}, byCategory: {} };
      this.stats.set(input.organizationId, stats);
    }

    stats.total++;
    stats.last24h++;
    stats.last7d++;
    stats.unanalyzed++;
    stats.byLevel[input.level] = (stats.byLevel[input.level] || 0) + 1;
    stats.bySource[input.source] = (stats.bySource[input.source] || 0) + 1;
    if (input.category) {
      stats.byCategory[input.category] = (stats.byCategory[input.category] || 0) + 1;
    }
  }

  /**
   * Rebuild in-memory stats from today's log files on server restart.
   */
  async rebuildFromLogs(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Clear existing data to prevent duplication on restart
    this.recentErrors = new CircularBuffer(2000);
    this.fingerprintCache.clear();
    this.stats.clear();

    // Get all org IDs that have log directories
    try {
      const { readdirSync } = await import('fs');
      const { resolve } = await import('path');
      const baseDir = resolve(process.cwd(), 'logs/errors');
      const dirs = readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'global')
        .map(d => d.name);

      for (const orgId of dirs) {
        const entries = await ErrorLogWriter.readLogs(orgId, today);
        for (const entry of entries) {
          // Rebuild fingerprint cache and stats
          const fp = entry.fp;
          if (!this.fingerprintCache.has(fp)) {
            this.fingerprintCache.set(fp, {
              fingerprint: fp,
              count: 1,
              firstSeen: new Date(entry.ts),
              lastSeen: new Date(entry.ts),
              analyzed: false,
              level: entry.level,
              message: entry.msg,
              stack: entry.stack,
              source: entry.source,
              category: entry.category,
              orgId: entry.orgId,
              projectId: entry.projectId,
            });
          } else {
            this.fingerprintCache.get(fp)!.count++;
          }

          this.updateStats({
            level: entry.level as any,
            message: entry.msg,
            source: entry.source,
            organizationId: entry.orgId,
            category: entry.category,
          });

          this.recentErrors.push({
            fingerprint: fp,
            level: entry.level,
            message: entry.msg,
            stack: entry.stack,
            source: entry.source,
            category: entry.category,
            endpoint: entry.endpoint,
            language: entry.language,
            framework: entry.framework,
            orgId: entry.orgId,
            projectId: entry.projectId,
            timestamp: new Date(entry.ts),
            analyzed: false,
          });
        }
      }
    } catch {
      // No log directory yet — first run
    }
  }
}
