import { prisma } from '../../utils/prisma';
import { GeminiClient } from '../ai/GeminiClient';
import { VectorStore } from '../rag/VectorStore';

interface FunctionalResolutionResult {
  id: string;
  rootCause: string;
  stepsAnalysis: string | null;
  solution: string;
  confidence: number;
  knowledgeSources: any[];
}

export class FunctionalAgent {
  private gemini: GeminiClient;
  private vectorStore: VectorStore;

  constructor() {
    this.gemini = new GeminiClient();
    this.vectorStore = new VectorStore();
  }

  async resolve(params: {
    query: string;
    projectId: string;
    organizationId: string;
    ticketId?: string;
    errorLogId?: string;
  }): Promise<FunctionalResolutionResult> {
    const { query, projectId, organizationId, ticketId, errorLogId } = params;

    // 1. Search project-scoped knowledge base
    const kbResults = await this.vectorStore.searchByProject(organizationId, projectId, query, 5);

    // 2. Search past resolutions for similar issues
    const pastResolutions = await prisma.functionalResolution.findMany({
      where: { projectId, feedback: { not: 'not_helpful' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { query: true, rootCause: true, solution: true, confidence: true, feedback: true },
    });

    // 3. Get functional agent config for system prompt
    const config = await prisma.functionalAgentConfig.findUnique({ where: { projectId } });

    // 4. Build context
    const kbContext = kbResults.length > 0
      ? kbResults.map((r, i) => `[KB ${i + 1}] ${r.title}\n${r.content}`).join('\n\n')
      : 'No knowledge base entries found for this project.';

    const pastContext = pastResolutions.length > 0
      ? pastResolutions.map((r, i) => `[Past ${i + 1}] Issue: ${r.query.substring(0, 200)}\nRoot Cause: ${r.rootCause.substring(0, 200)}\nSolution: ${r.solution.substring(0, 200)}`).join('\n\n')
      : '';

    // 5. Call Gemini
    const prompt = `You are a functional support agent that helps diagnose process and workflow issues.
${config?.systemPrompt ? `\nPROJECT-SPECIFIC INSTRUCTIONS:\n${config.systemPrompt}\n` : ''}

KNOWLEDGE BASE (documentation, SOPs, guides for this project):
${kbContext}

${pastContext ? `PREVIOUSLY RESOLVED SIMILAR ISSUES:\n${pastContext}\n` : ''}

USER'S ISSUE:
${query}

Analyze this issue and respond in this exact JSON format (no markdown, no code blocks):
{
  "rootCause": "Why this issue occurred — explain clearly",
  "stepsAnalysis": "What the user likely did wrong compared to the correct process described in the knowledge base. If you can't determine this, set to null",
  "solution": "Step-by-step resolution — clear numbered steps the user should follow",
  "confidence": 0.0-1.0
}

Important:
- Compare the user's described situation against the knowledge base documentation
- If the KB has relevant steps/process, identify which steps were missed or done incorrectly
- Provide actionable steps, not vague advice
- Set confidence based on how well the KB covers this scenario`;

    const response = await this.gemini.generateContent(prompt, false);
    const jsonStr = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { rootCause: response, stepsAnalysis: null, solution: response, confidence: 0.3 };
    }

    // 6. Save resolution
    const resolution = await prisma.functionalResolution.create({
      data: {
        ticketId,
        errorLogId,
        projectId,
        organizationId,
        query,
        rootCause: parsed.rootCause || 'Unable to determine',
        stepsAnalysis: parsed.stepsAnalysis || null,
        solution: parsed.solution || 'No solution generated',
        knowledgeSources: kbResults.map(r => ({ id: r.id, title: r.title, score: r.score })),
        confidence: parsed.confidence || 0,
      },
    });

    return {
      id: resolution.id,
      rootCause: resolution.rootCause,
      stepsAnalysis: resolution.stepsAnalysis,
      solution: resolution.solution,
      confidence: resolution.confidence,
      knowledgeSources: kbResults.map(r => ({ id: r.id, title: r.title, score: r.score })),
    };
  }
}
