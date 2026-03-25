import { Router, Response } from 'express';
import { apiKeyAuth, SdkRequest, requirePermission } from '../middleware/apiKeyAuth';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';
import { ErrorLogger } from '../services/logging/ErrorLogger';

export const widgetRoutes = Router();
widgetRoutes.use(apiKeyAuth);

const geminiClient = new GeminiClient();

// ─── GET CONFIG — Widget loads this on init ───
widgetRoutes.get('/config', async (req: SdkRequest, res: Response) => {
  try {
    const projectId = req.apiKey!.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'API key must be scoped to a project for widget use' });
    }

    const config = await prisma.chatbotConfig.findUnique({
      where: { projectId },
    });

    if (!config) {
      // Return defaults
      return res.json({
        botName: 'AI Support',
        welcomeMessage: 'Hi! How can I help you today?',
        placeholderText: 'Type your message...',
        primaryColor: '#3b82f6',
        position: 'bottom-right',
        avatarUrl: null,
        enableChat: true,
        enableTickets: true,
        requireEmail: false,
      });
    }

    // Only send public-safe fields (no systemPrompt / knowledgeContext)
    res.json({
      botName: config.botName,
      welcomeMessage: config.welcomeMessage,
      placeholderText: config.placeholderText,
      primaryColor: config.primaryColor,
      position: config.position,
      avatarUrl: config.avatarUrl,
      enableChat: config.enableChat,
      enableTickets: config.enableTickets,
      enableFileUpload: config.enableFileUpload,
      requireEmail: config.requireEmail,
      offlineMessage: config.offlineMessage,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ─── START SESSION ───
widgetRoutes.post('/session', async (req: SdkRequest, res: Response) => {
  try {
    const projectId = req.apiKey!.projectId;
    if (!projectId) return res.status(400).json({ error: 'API key must be scoped to a project' });

    let config = await prisma.chatbotConfig.findUnique({ where: { projectId } });

    // Auto-create default config if none exists
    if (!config) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      config = await prisma.chatbotConfig.create({
        data: {
          projectId,
          botName: 'AI Support',
          welcomeMessage: 'Hi! How can I help you today?',
          systemPrompt: `You are a helpful customer support assistant for ${project?.name || 'our product'}. Be friendly, concise, and helpful.`,
          primaryColor: project?.color || '#3b82f6',
        },
      });
    }

    const configId = config.id;

    const { email, name, visitorId, pageUrl } = req.body;

    const session = await prisma.widgetSession.create({
      data: {
        chatbotConfigId: configId,
        visitorEmail: email || null,
        visitorName: name || null,
        visitorId: visitorId || null,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        pageUrl,
      },
    });

    // Add welcome message
    const welcomeMsg = await prisma.widgetMessage.create({
      data: {
        widgetSessionId: session.id,
        role: 'assistant',
        content: config.welcomeMessage,
      },
    });

    res.json({ sessionId: session.id, messages: [welcomeMsg] });
  } catch {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ─── SEND MESSAGE — User sends, AI responds ───
widgetRoutes.post('/message', async (req: SdkRequest, res: Response) => {
  try {
    const { sessionId, content } = req.body;

    if (!sessionId || !content) {
      return res.status(400).json({ error: 'sessionId and content are required' });
    }

    // Get session + config
    const session = await prisma.widgetSession.findUnique({
      where: { id: sessionId },
      include: {
        chatbotConfig: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 20 },
      },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Save user message
    const userMsg = await prisma.widgetMessage.create({
      data: { widgetSessionId: sessionId, role: 'user', content },
    });

    // Build AI prompt from admin's config
    const config = session.chatbotConfig;
    const conversationHistory = session.messages
      .map((m) => `${m.role === 'user' ? 'User' : config.botName}: ${m.content}`)
      .join('\n');

    const systemPrompt = config.systemPrompt || 'You are a helpful support assistant.';
    const knowledgeContext = config.knowledgeContext || '';

    const prompt = `${systemPrompt}

${knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}
CONVERSATION:
${conversationHistory}
User: ${content}

${config.botName}:`;

    let aiResponse: string;
    if (config.autoReply) {
      aiResponse = await geminiClient.generateContent(prompt, false);
    } else {
      aiResponse = config.offlineMessage || 'Thanks for your message. Our team will get back to you soon.';
    }

    // Save AI response
    const aiMsg = await prisma.widgetMessage.create({
      data: { widgetSessionId: sessionId, role: 'assistant', content: aiResponse },
    });

    // Update session
    await prisma.widgetSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    // Auto-identify contact if email provided
    if (session.visitorEmail) {
      const existingContact = await prisma.contact.findFirst({
        where: { email: session.visitorEmail, organizationId: req.apiKey!.organizationId },
      });
      if (!existingContact) {
        await prisma.contact.create({
          data: {
            firstName: session.visitorName || session.visitorEmail.split('@')[0],
            lastName: '',
            email: session.visitorEmail,
            status: 'LEAD',
            source: 'chatbot',
            projectId: req.apiKey!.projectId,
            organizationId: req.apiKey!.organizationId,
          },
        });
      }
    }

    res.json({ userMessage: userMsg, aiMessage: aiMsg });
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR',
      message: (err as Error).message,
      stack: (err as Error).stack,
      source: 'widget-chat',
      organizationId: req.apiKey!.organizationId,
    });
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// ─── GET MESSAGES — Load chat history ───
widgetRoutes.get('/messages/:sessionId', async (req: SdkRequest, res: Response) => {
  const messages = await prisma.widgetMessage.findMany({
    where: { widgetSessionId: req.params.sessionId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

// ─── CREATE TICKET from widget ───
widgetRoutes.post('/ticket', requirePermission('tickets'), async (req: SdkRequest, res: Response) => {
  try {
    const { title, description, email, name, sessionId } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description required' });
    }

    // Find contact
    let contactId: string | null = null;
    if (email) {
      const contact = await prisma.contact.findFirst({
        where: { email, organizationId: req.apiKey!.organizationId },
      });
      contactId = contact?.id || null;
    }

    // Get admin user
    const admin = await prisma.user.findFirst({
      where: { organizationId: req.apiKey!.organizationId, role: 'ADMIN' },
    });
    if (!admin) return res.status(500).json({ error: 'No admin user in organization' });

    // Build description with context
    let fullDescription = description;
    if (sessionId) {
      const messages = await prisma.widgetMessage.findMany({
        where: { widgetSessionId: sessionId },
        orderBy: { createdAt: 'asc' },
      });
      if (messages.length > 0) {
        const transcript = messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n');
        fullDescription += `\n\n---\n**Chat Transcript:**\n${transcript}`;
      }
    }
    fullDescription += `\n\n---\n_Submitted via chatbot widget_${email ? `\nUser: ${name || ''} <${email}>` : ''}`;

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description: fullDescription,
        priority: 'MEDIUM',
        projectId: req.apiKey!.projectId,
        contactId,
        createdById: admin.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true, ticketId: ticket.id });
  } catch {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});
