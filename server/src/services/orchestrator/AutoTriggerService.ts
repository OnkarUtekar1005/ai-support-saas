import { prisma } from '../../utils/prisma';
import { ErrorFingerprint } from './ErrorFingerprint';
import { logger } from './OrchestratorLogger';
import type { ErrorAnalyzedEvent } from './db/listener';

interface TriggerDecision {
  shouldTrigger: boolean;
  reason: string;
  isRegression: boolean;
  previousPipelineId?: string;
  priority: number;
}

const SEVERITY_LEVELS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class AutoTriggerService {
  /**
   * Evaluate whether an analyzed error should trigger an auto-fix pipeline.
   * Returns a decision with reason.
   */
  static async evaluate(event: ErrorAnalyzedEvent): Promise<TriggerDecision> {
    const noTrigger = (reason: string): TriggerDecision => ({
      shouldTrigger: false, reason, isRegression: false, priority: 0,
    });

    // Rule 1: Only ERROR or FATAL
    if (event.level !== 'ERROR' && event.level !== 'FATAL') {
      return noTrigger(`Skipped: level is ${event.level} (need ERROR or FATAL)`);
    }

    // Rule 2: Must have a project
    if (!event.projectId) {
      return noTrigger('Skipped: no projectId — cannot determine which codebase to fix');
    }

    // Rule 3: Check AutoFixConfig for this project
    const autoFixConfig = await prisma.autoFixConfig.findUnique({
      where: { projectId: event.projectId },
    });

    if (!autoFixConfig || !autoFixConfig.enabled) {
      return noTrigger('Skipped: auto-fix not enabled for this project');
    }

    // Rule 4: Check Gemini severity meets threshold
    const severity = this.extractSeverity(event.aiAnalysis);
    const minSeverity = SEVERITY_LEVELS[autoFixConfig.autoTriggerLevel] || 3;
    if (SEVERITY_LEVELS[severity] < minSeverity) {
      return noTrigger(`Skipped: severity "${severity}" below threshold "${autoFixConfig.autoTriggerLevel}"`);
    }

    // Get the full error log for fingerprinting
    const errorLog = await prisma.errorLog.findUnique({
      where: { id: event.id },
    });
    if (!errorLog) {
      return noTrigger('Skipped: error log not found');
    }

    // Generate fingerprint
    const fingerprint = ErrorFingerprint.generate({
      message: errorLog.message,
      source: errorLog.source,
      stack: errorLog.stack,
    });

    // Update the error log with fingerprint
    await prisma.errorLog.update({
      where: { id: event.id },
      data: { fingerprint },
    });

    // Rule 5: Deduplicate — check for active pipeline with same error fingerprint
    // First find errorLog IDs that share this fingerprint
    const sameFingerPrintErrors = await prisma.errorLog.findMany({
      where: { fingerprint, projectId: event.projectId },
      select: { id: true },
    });
    const sameErrorIds = sameFingerPrintErrors.map((e) => e.id);

    const activePipeline = sameErrorIds.length > 0
      ? await prisma.pipeline.findFirst({
          where: {
            projectId: event.projectId,
            errorLogId: { in: sameErrorIds },
            status: {
              in: ['DETECTED', 'QUEUED', 'ANALYZING', 'FIX_PROPOSED', 'AWAITING_APPROVAL',
                   'APPROVED', 'FIXING', 'TESTING', 'COMMITTED', 'PR_CREATED', 'DEPLOYING'],
            },
          },
        })
      : null;

    if (activePipeline) {
      return noTrigger(`Skipped: active pipeline ${activePipeline.id} already handling this error pattern`);
    }

    // Rule 6: Cooldown — check if same fingerprint was fixed recently
    const recentlyFixed = sameErrorIds.length > 0
      ? await prisma.pipeline.findFirst({
          where: {
            projectId: event.projectId,
            errorLogId: { in: sameErrorIds },
            status: { in: ['DEPLOYED', 'PR_CREATED'] },
            updatedAt: {
              gte: new Date(Date.now() - autoFixConfig.cooldownMinutes * 60 * 1000),
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    // Rule 7: Regression detection
    let isRegression = false;
    let previousPipelineId: string | undefined;

    if (recentlyFixed) {
      // Same error after a recent fix → regression
      const daysSinceFix = (Date.now() - recentlyFixed.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFix <= 7) {
        isRegression = true;
        previousPipelineId = recentlyFixed.id;
        logger.warn(`Regression detected: error matches pipeline ${recentlyFixed.id} fixed ${daysSinceFix.toFixed(1)} days ago`);
      } else {
        // Within cooldown but not regression range — skip
        return noTrigger(`Skipped: same error fixed ${Math.round(daysSinceFix * 24 * 60)}min ago (cooldown: ${autoFixConfig.cooldownMinutes}min)`);
      }
    }

    // Rule 8: Rate limit per project
    const activeCount = await prisma.pipeline.count({
      where: {
        projectId: event.projectId,
        status: {
          in: ['ANALYZING', 'FIXING', 'TESTING', 'COMMITTED', 'DEPLOYING'],
        },
      },
    });

    if (activeCount >= autoFixConfig.maxConcurrent) {
      // Will be queued, not rejected
      logger.info(`Project ${event.projectId} at max concurrent (${activeCount}/${autoFixConfig.maxConcurrent}) — will queue`);
    }

    // Calculate priority: FATAL=10, ERROR=5, regression=+3
    let priority = event.level === 'FATAL' ? 10 : 5;
    priority += SEVERITY_LEVELS[severity] || 0;
    if (isRegression) priority += 3;

    return {
      shouldTrigger: true,
      reason: isRegression
        ? `Regression: same error reappeared after pipeline ${previousPipelineId}`
        : `Auto-triggered: ${event.level} with severity "${severity}"`,
      isRegression,
      previousPipelineId,
      priority,
    };
  }

  /**
   * Create a pipeline record for the auto-triggered fix.
   */
  static async createPipeline(
    errorLogId: string,
    decision: TriggerDecision
  ): Promise<string> {
    const errorLog = await prisma.errorLog.findUnique({
      where: { id: errorLogId },
    });

    if (!errorLog) throw new Error('Error log not found');

    const pipeline = await prisma.pipeline.create({
      data: {
        errorLogId: errorLog.id,
        errorMessage: errorLog.message,
        errorSource: errorLog.source,
        errorStack: errorLog.stack,
        geminiAnalysis: errorLog.aiAnalysis,
        geminiSuggestion: errorLog.aiSuggestion,
        projectId: errorLog.projectId,
        organizationId: errorLog.organizationId,
        status: 'DETECTED',
        autoTriggered: true,
        priority: decision.priority,
        isRegression: decision.isRegression,
        previousPipelineId: decision.previousPipelineId || null,
      },
    });

    // Add log entry
    await prisma.pipelineLog.create({
      data: {
        pipelineId: pipeline.id,
        stage: 'DETECTED',
        message: `Auto-triggered: ${decision.reason}`,
      },
    });

    logger.info(`Pipeline created: ${pipeline.id} for error ${errorLogId} (priority: ${decision.priority})`);
    return pipeline.id;
  }

  /**
   * Create a pipeline from raw error data when no ErrorLog DB record exists yet.
   */
  static async createPipelineFromIngestion(
    error: {
      fingerprint: string;
      message: string;
      stack?: string;
      source: string;
      projectId: string;
      organizationId: string;
      aiAnalysis?: string;
      aiSuggestion?: string;
    },
    decision: TriggerDecision
  ): Promise<string> {
    const pipeline = await prisma.pipeline.create({
      data: {
        errorMessage: error.message,
        errorSource: error.source,
        errorStack: error.stack || null,
        geminiAnalysis: error.aiAnalysis || null,
        geminiSuggestion: error.aiSuggestion || null,
        projectId: error.projectId,
        organizationId: error.organizationId,
        status: 'DETECTED',
        autoTriggered: true,
        priority: decision.priority,
        isRegression: decision.isRegression,
        previousPipelineId: decision.previousPipelineId || null,
      },
    });

    await prisma.pipelineLog.create({
      data: {
        pipelineId: pipeline.id,
        stage: 'DETECTED',
        message: `Auto-triggered from ingestion: ${decision.reason} (fingerprint: ${error.fingerprint})`,
      },
    });

    logger.info(`Pipeline created: ${pipeline.id} for fingerprint ${error.fingerprint} (priority: ${decision.priority})`);
    return pipeline.id;
  }

  /**
   * Extract severity from Gemini analysis text.
   */
  private static extractSeverity(analysis: string): string {
    const lower = analysis.toLowerCase();
    if (lower.includes('critical')) return 'critical';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium') || lower.includes('moderate')) return 'medium';
    if (lower.includes('low') || lower.includes('minor')) return 'low';
    return 'medium'; // default
  }
}
