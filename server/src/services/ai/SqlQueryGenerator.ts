import { GeminiClient } from './GeminiClient';

export interface GeneratedQuery {
  query: string;
  explanation: string;
  safetyCheck: string;
  tables: string[];
}

export class SqlQueryGenerator {
  private client: GeminiClient;

  constructor(client: GeminiClient) {
    this.client = client;
  }

  async generate(request: string, schemaContext?: string): Promise<GeneratedQuery> {
    const prompt = `You are a SQL expert. Generate a SAFE, READ-ONLY SQL query based on the request.

RULES:
- Only generate SELECT queries
- NEVER use DELETE, UPDATE, INSERT, DROP, TRUNCATE, ALTER, EXEC
- Use proper joins and aliases
- Limit results to 1000 rows max
- Use parameterized query style where possible

${schemaContext ? `DATABASE SCHEMA:\n${schemaContext}\n` : ''}

REQUEST: ${request}

Respond in this exact JSON format (no markdown, no code blocks):
{
  "query": "SELECT ...",
  "explanation": "What this query does",
  "safetyCheck": "Why this query is safe",
  "tables": ["table names used"]
}`;

    const response = await this.client.generateContent(prompt, false);
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  }
}
