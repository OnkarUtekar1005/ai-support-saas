import { GeminiClient } from './GeminiClient';

export class ResolutionEngine {
  private client: GeminiClient;

  constructor(client: GeminiClient) {
    this.client = client;
  }

  async generateResolution(context: {
    ticketText: string;
    analysis: any;
    similarCases?: any[];
    sqlResults?: any;
    systemContext?: string;
  }): Promise<string> {
    const parts: string[] = [
      'You are a senior support engineer. Generate a comprehensive resolution for this support ticket.',
      '',
      `TICKET: ${context.ticketText}`,
      '',
      `ANALYSIS: ${JSON.stringify(context.analysis)}`,
    ];

    if (context.similarCases?.length) {
      parts.push('', 'SIMILAR PAST CASES:');
      context.similarCases.forEach((c, i) => {
        parts.push(`${i + 1}. ${c.title}: ${c.content}`);
      });
    }

    if (context.sqlResults) {
      parts.push('', `SQL QUERY RESULTS: ${JSON.stringify(context.sqlResults)}`);
    }

    if (context.systemContext) {
      parts.push('', `SYSTEM CONTEXT: ${context.systemContext}`);
    }

    parts.push(
      '',
      'Provide a resolution with:',
      '1. Root Cause (what happened and why)',
      '2. Fix Steps (clear, numbered instructions)',
      '3. Prevention (how to avoid this in the future)',
      '4. Additional Notes (if any)'
    );

    return this.client.generateContent(parts.join('\n'), false);
  }
}
