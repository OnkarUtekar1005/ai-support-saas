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
    const hasKB = kbResults.length > 0;
    const prompt = `You are a support agent. Answer the user's issue directly and completely.
${config?.systemPrompt ? `\nPROJECT CONTEXT:\n${config.systemPrompt}\n` : ''}
${hasKB ? `\nKNOWLEDGE BASE:\n${kbContext}\n` : ''}
${pastContext ? `SIMILAR PAST RESOLUTIONS:\n${pastContext}\n` : ''}

USER'S ISSUE:
${query}

YOU MUST respond ONLY with this JSON (no markdown, no code fences, no other text):
{"rootCause":"string","stepsAnalysis":"string or null","solution":"string with numbered steps","confidence":0.0}

Rules:
- solution must give concrete numbered steps the user can follow RIGHT NOW
- If the knowledge base has steps for this, reproduce them directly — do NOT ask the user for more info
- rootCause: why this happened
- stepsAnalysis: what step was missed (or null)
- confidence: ${hasKB ? '0.7-1.0 if KB covers this, else 0.4-0.6' : '0.3-0.5 since no KB was found'}
- Never ask the user to provide more information — always give the best answer you can`;

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
