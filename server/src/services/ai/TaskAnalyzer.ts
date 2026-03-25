import { GeminiClient } from './GeminiClient';

export interface TaskAnalysis {
  issueType: string;
  confidence: number;
  entities: {
    errorMessages: string[];
    modules: string[];
    systems: string[];
    users: string[];
  };
  summary: string;
  suggestedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  sqlNeeded: boolean;
}

export class TaskAnalyzer {
  private client: GeminiClient;

  constructor(client: GeminiClient) {
    this.client = client;
  }

  async analyze(ticketText: string, systemContext?: string): Promise<TaskAnalysis> {
    const prompt = `You are a senior support engineer. Analyze this support ticket and extract structured information.

${systemContext ? `SYSTEM CONTEXT:\n${systemContext}\n` : ''}

TICKET:
${ticketText}

Respond in this exact JSON format (no markdown, no code blocks):
{
  "issueType": "category of the issue",
  "confidence": 0.0-1.0,
  "entities": {
    "errorMessages": ["any error messages mentioned"],
    "modules": ["affected system modules"],
    "systems": ["affected systems/services"],
    "users": ["affected users/tenants mentioned"]
  },
  "summary": "one-line summary of the issue",
  "suggestedPriority": "LOW|MEDIUM|HIGH|CRITICAL",
  "sqlNeeded": true/false
}`;

    const response = await this.client.generateContent(prompt, false);
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  }
}
