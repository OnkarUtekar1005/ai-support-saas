import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config';

interface ErrorInput {
  message: string;
  stack?: string;
  source: string;
  endpoint?: string;
}

interface AnalysisResult {
  rootCause: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export class GeminiLogAnalyzer {
  private static getClient() {
    return new GoogleGenerativeAI(config.gemini.apiKey);
  }

  static async analyzeError(input: ErrorInput): Promise<AnalysisResult> {
    try {
      const client = this.getClient();
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are an expert DevOps and backend engineer. Analyze this application error and provide a diagnosis.

ERROR DETAILS:
- Message: ${input.message}
- Source Module: ${input.source}
- Endpoint: ${input.endpoint || 'N/A'}
- Stack Trace:
${input.stack || 'No stack trace available'}

Respond in this exact JSON format (no markdown, no code blocks):
{
  "rootCause": "Clear explanation of what caused this error and why",
  "suggestion": "Step-by-step fix recommendation with specific code or config changes",
  "severity": "low|medium|high|critical",
  "category": "database|authentication|network|validation|configuration|memory|permission|dependency|logic|unknown"
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Parse JSON from response (handle potential markdown wrapping)
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis = JSON.parse(jsonStr) as AnalysisResult;

      return analysis;
    } catch (err) {
      console.error('Gemini analysis failed:', (err as Error).message);
      return {
        rootCause: `Auto-analysis failed. Manual review needed. Error: ${input.message}`,
        suggestion: 'Check the stack trace and source module for debugging. Gemini analysis was unavailable.',
        severity: 'medium',
        category: 'unknown',
      };
    }
  }

  /**
   * Analyze a batch of recent errors to find patterns
   */
  static async analyzeTrend(errors: Array<{ message: string; source: string; createdAt: Date }>) {
    try {
      const client = this.getClient();
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const errorSummary = errors
        .map((e, i) => `${i + 1}. [${e.source}] ${e.message} (${e.createdAt.toISOString()})`)
        .join('\n');

      const prompt = `You are an expert DevOps engineer. Analyze these recent application errors and identify patterns or systemic issues.

RECENT ERRORS (${errors.length} total):
${errorSummary}

Respond in this exact JSON format (no markdown, no code blocks):
{
  "patterns": ["pattern 1 description", "pattern 2 description"],
  "systemicIssues": ["issue 1", "issue 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "riskLevel": "low|medium|high|critical"
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr);
    } catch {
      return {
        patterns: [],
        systemicIssues: ['Analysis unavailable'],
        recommendations: ['Review errors manually'],
        riskLevel: 'medium',
      };
    }
  }
}
