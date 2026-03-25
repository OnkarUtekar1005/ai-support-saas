import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';
import { CrmContextBuilder } from '../services/ai/CrmContextBuilder';
import { ErrorLogger } from '../services/logging/ErrorLogger';

export const chatRoutes = Router();
chatRoutes.use(authenticate);

const geminiClient = new GeminiClient();

const SYSTEM_PROMPT = [
  'You are a senior AI support engineer assistant integrated into a CRM and support platform.',
  'You have FULL access to the organization data including tickets, error logs, contacts, deals, projects, and companies.',
  '',
  'YOUR CAPABILITIES:',
  '- View and analyze support tickets by name, status, priority',
  '- View and analyze error logs with AI root-cause analysis',
  '- Look up contacts, companies, and deals',
  '- Provide troubleshooting guidance based on ticket history and error patterns',
  '- Summarize CRM data: pipeline value, ticket stats, error trends',
  '- Help resolve issues by referencing past resolutions',
  '',
  'RULES:',
  '- Always be helpful and provide direct answers with the data provided below',
  '- When referencing tickets or errors, include relevant details',
  '- Search by name or keyword - never ask the user for IDs',
  '- Provide actionable fix suggestions for errors and tickets',
  '- USE the organization data provided below - never say you cannot access the CRM',
  '- Format responses with clear sections and bullet points',
].join('\n');

chatRoutes.post('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.body;
    const session = await prisma.chatSession.create({
      data: { userId: req.user!.id, ticketId: ticketId || null },
    });
    res.status(201).json(session);
  } catch {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

chatRoutes.get('/sessions', async (req: AuthRequest, res: Response) => {
  const sessions = await prisma.chatSession.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
      ticket: { select: { title: true, status: true } },
    },
  });
  res.json(sessions);
});

chatRoutes.get('/sessions/:id/messages', async (req: AuthRequest, res: Response) => {
  const messages = await prisma.chatMessage.findMany({
    where: { chatSessionId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

chatRoutes.post('/sessions/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;
    const sessionId = req.params.id;

    await prisma.chatMessage.create({
      data: { chatSessionId: sessionId, role: 'user', content },
    });

    const history = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const conversationContext = history
      .map((m) => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content)
      .join('\n');

    const crmContext = await CrmContextBuilder.buildContext(req.user!.organizationId, content);

    const prompt = SYSTEM_PROMPT + '\n\nORGANIZATION DATA:\n' + crmContext + '\n\nCONVERSATION:\n' + conversationContext + '\nUser: ' + content + '\n\nAssistant:';

    const aiResponse = await geminiClient.generateContent(prompt, false);

    const message = await prisma.chatMessage.create({
      data: { chatSessionId: sessionId, role: 'assistant', content: aiResponse },
    });

    res.json(message);
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR',
      message: (err as Error).message,
      stack: (err as Error).stack,
      source: 'chat-message',
      endpoint: 'POST /api/chat/sessions/' + req.params.id + '/messages',
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
    });
    res.status(500).json({ error: 'Failed to send message' });
  }
});
