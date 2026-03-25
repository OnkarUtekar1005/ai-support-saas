import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const chatbotConfigRoutes = Router();
chatbotConfigRoutes.use(authenticate);
chatbotConfigRoutes.use(requireRole('ADMIN'));

// Get chatbot config for a project
chatbotConfigRoutes.get('/:projectId', async (req: AuthRequest, res: Response) => {
  const config = await prisma.chatbotConfig.findUnique({
    where: { projectId: req.params.projectId },
  });
  res.json(config || null);
});

// Create or update chatbot config
chatbotConfigRoutes.put('/:projectId', async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const {
    botName, welcomeMessage, systemPrompt, placeholderText,
    primaryColor, position, avatarUrl,
    enableChat, enableTickets, enableFileUpload,
    requireEmail, autoReply, offlineMessage,
    knowledgeContext,
  } = req.body;

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const config = await prisma.chatbotConfig.upsert({
    where: { projectId },
    update: {
      ...(botName !== undefined && { botName }),
      ...(welcomeMessage !== undefined && { welcomeMessage }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(placeholderText !== undefined && { placeholderText }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(position !== undefined && { position }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(enableChat !== undefined && { enableChat }),
      ...(enableTickets !== undefined && { enableTickets }),
      ...(enableFileUpload !== undefined && { enableFileUpload }),
      ...(requireEmail !== undefined && { requireEmail }),
      ...(autoReply !== undefined && { autoReply }),
      ...(offlineMessage !== undefined && { offlineMessage }),
      ...(knowledgeContext !== undefined && { knowledgeContext }),
    },
    create: {
      projectId,
      botName: botName || 'AI Support',
      welcomeMessage: welcomeMessage || 'Hi! How can I help you today?',
      systemPrompt: systemPrompt || `You are a helpful customer support assistant for ${project.name}. Be friendly, concise, and helpful. If you don't know the answer, suggest the user create a support ticket.`,
      placeholderText: placeholderText || 'Type your message...',
      primaryColor: primaryColor || project.color || '#3b82f6',
      position: position || 'bottom-right',
      avatarUrl,
      enableChat: enableChat ?? true,
      enableTickets: enableTickets ?? true,
      enableFileUpload: enableFileUpload ?? false,
      requireEmail: requireEmail ?? false,
      autoReply: autoReply ?? true,
      offlineMessage,
      knowledgeContext,
    },
  });

  res.json(config);
});

// Get widget sessions (conversations) for admin to view
chatbotConfigRoutes.get('/:projectId/sessions', async (req: AuthRequest, res: Response) => {
  const config = await prisma.chatbotConfig.findUnique({ where: { projectId: req.params.projectId } });
  if (!config) return res.json([]);

  const sessions = await prisma.widgetSession.findMany({
    where: { chatbotConfigId: config.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
      _count: { select: { messages: true } },
    },
  });

  res.json(sessions);
});

// Get full conversation for a session
chatbotConfigRoutes.get('/:projectId/sessions/:sessionId', async (req: AuthRequest, res: Response) => {
  const session = await prisma.widgetSession.findUnique({
    where: { id: req.params.sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});
