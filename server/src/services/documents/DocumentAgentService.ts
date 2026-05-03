import { prisma } from '../../utils/prisma';
import { GeminiClient } from '../ai/GeminiClient';
import { DocxGenerator, ScopeData, ProjectPlanData } from './DocxGenerator';
import path from 'path';

interface Message { role: 'assistant' | 'user'; content: string }

const QA_SYSTEM = `You are a professional project consultant gathering information to create project documentation.
Ask ONE focused question at a time. Cover: goals, stakeholders, deliverables, timeline, budget, team, tech constraints, risks.
After 6–9 questions (when you have enough info), output ONLY this JSON and nothing else: {"action":"ready_to_generate"}
Never ask about something already provided.`;

const GEN_SYSTEM = `You are a senior project consultant. Generate project documentation from the requirements and Q&A below.
Output ONLY valid JSON — no markdown, no explanation, no code fences.`;

export class DocumentAgentService {
  private gemini = new GeminiClient();
  private docxGenerator = new DocxGenerator();

  async startSession(params: {
    title: string;
    requirements: string;
    projectId: string | null;
    organizationId: string;
    createdById: string;
  }) {
    const firstQuestion = await this.nextTurn([], params.requirements);

    const messages: Message[] = [{ role: 'assistant', content: firstQuestion }];

    const session = await prisma.documentAgentSession.create({
      data: {
        title:          params.title,
        requirements:   params.requirements,
        messages:       messages as any,
        projectId:      params.projectId,
        organizationId: params.organizationId,
        createdById:    params.createdById,
      },
    });

    return { session, question: firstQuestion };
  }

  async reply(sessionId: string, organizationId: string, answer: string) {
    const session = await prisma.documentAgentSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session)                        throw new Error('Session not found');
    if (session.status === 'COMPLETED')  throw new Error('Session already completed');
    if (session.status === 'GENERATING') throw new Error('Documents are being generated');

    const messages = (session.messages as unknown as Message[]) || [];
    messages.push({ role: 'user', content: answer });

    const next = await this.nextTurn(messages, session.requirements);

    if (next.trim().startsWith('{') && next.includes('ready_to_generate')) {
      messages.push({ role: 'assistant', content: 'Perfect — I have everything I need. Generating your documents now...' });
      await prisma.documentAgentSession.update({
        where: { id: sessionId },
        data:  { messages: messages as any, status: 'GENERATING' },
      });

      this.generateDocuments(sessionId, session.requirements, messages).catch(err =>
        console.error(`[DocumentAgent] Generation failed for ${sessionId}:`, err.message)
      );

      return { done: true, generating: true, session: await this.getSession(sessionId, organizationId) };
    }

    messages.push({ role: 'assistant', content: next });
    const updated = await prisma.documentAgentSession.update({
      where: { id: sessionId },
      data:  { messages: messages as any },
    });

    return { done: false, question: next, session: updated };
  }

  async getSession(sessionId: string, organizationId: string) {
    return prisma.documentAgentSession.findFirst({
      where:   { id: sessionId, organizationId },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async listSessions(organizationId: string) {
    return prisma.documentAgentSession.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async nextTurn(messages: Message[], requirements: string): Promise<string> {
    const history = messages
      .map(m => `${m.role === 'assistant' ? 'Consultant' : 'Client'}: ${m.content}`)
      .join('\n\n');

    const prompt = `${QA_SYSTEM}

PROJECT REQUIREMENTS:
${requirements}

${history ? `CONVERSATION SO FAR:\n${history}\n` : ''}
${messages.length === 0
  ? 'Ask your first question to gather more details.'
  : 'Ask your next question, or output {"action":"ready_to_generate"} if you have enough information.'}`;

    return this.gemini.generateContent(prompt, { useCache: false });
  }

  private async generateDocuments(sessionId: string, requirements: string, messages: Message[]) {
    try {
      const qa = messages
        .map(m => `${m.role === 'assistant' ? 'Consultant' : 'Client'}: ${m.content}`)
        .join('\n\n');

      const prompt = `${GEN_SYSTEM}

PROJECT REQUIREMENTS:
${requirements}

Q&A:
${qa}

Output ONLY this JSON:
{
  "projectTitle": "string",
  "client": "string or empty string",
  "executiveSummary": "2–3 paragraph summary",
  "objectives": ["string"],
  "inScope": ["string"],
  "outOfScope": ["string"],
  "deliverables": [{"name": "string", "description": "string"}],
  "timeline": "string",
  "assumptions": ["string"],
  "risks": ["string — mitigation"],
  "budget": "string or empty string",
  "phases": [{"name": "string", "duration": "string", "tasks": ["string"], "milestone": "string or empty string"}],
  "teamRoles": [{"role": "string", "responsibilities": "string"}],
  "totalDuration": "string"
}`;

      const raw     = await this.gemini.generateContent(prompt, { useCache: false });
      const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data    = JSON.parse(jsonStr);

      const scopeData: ScopeData = {
        projectTitle:     data.projectTitle     || 'Project',
        client:           data.client,
        preparedBy:       'TechviewAI Corp',
        date:             new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        executiveSummary: data.executiveSummary  || '',
        objectives:       data.objectives        || [],
        inScope:          data.inScope           || [],
        outOfScope:       data.outOfScope        || [],
        deliverables:     data.deliverables      || [],
        timeline:         data.timeline,
        assumptions:      data.assumptions,
        risks:            data.risks,
        budget:           data.budget,
      };

      const planData: ProjectPlanData = {
        projectTitle:  data.projectTitle  || 'Project',
        phases:        data.phases        || [],
        teamRoles:     data.teamRoles,
        totalDuration: data.totalDuration,
      };

      const [scopePath, planPath] = await Promise.all([
        this.docxGenerator.generateScopeOfWork(scopeData, sessionId),
        this.docxGenerator.generateProjectPlan(planData, sessionId),
      ]);

      await prisma.documentAgentSession.update({
        where: { id: sessionId },
        data:  {
          status: 'COMPLETED',
          generatedDocs: [
            { type: 'scope_of_work', filename: path.basename(scopePath), filePath: scopePath },
            { type: 'project_plan',  filename: path.basename(planPath),  filePath: planPath  },
          ] as any,
        },
      });

      console.log(`[DocumentAgent] ✓ Documents ready for session ${sessionId}`);
    } catch (err) {
      await prisma.documentAgentSession.update({
        where: { id: sessionId },
        data:  { status: 'FAILED' },
      });
      throw err;
    }
  }
}
