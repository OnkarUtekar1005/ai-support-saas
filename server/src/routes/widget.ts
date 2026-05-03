import { Router, Response } from 'express';
import { apiKeyAuth, SdkRequest, requirePermission } from '../middleware/apiKeyAuth';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { VectorStore, SearchResult } from '../services/rag/VectorStore';

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

    // Dynamic knowledge search from uploaded documents
    let ragContext = '';
    const projectId = req.apiKey!.projectId;
    if (projectId) {
      try {
        const vectorStore = new VectorStore();
        const hits = await vectorStore.searchByProject(req.apiKey!.organizationId, projectId, content, 4);
        if (hits.length > 0) {
          ragContext = hits.map((h: SearchResult) => h.content).join('\n\n---\n\n');
        }
      } catch {
        // RAG failure is non-fatal — fall back to static knowledge only
      }
    }

    const combinedKnowledge = [knowledgeContext, ragContext].filter(Boolean).join('\n\n');

    const prompt = `${systemPrompt}

${combinedKnowledge ? `KNOWLEDGE BASE:\n${combinedKnowledge}\n` : ''}

IMPORTANT: If the user asks to create a ticket, raise an issue, report a bug, or log a problem, respond ONLY with this exact JSON format (no other text):
{"create_ticket": true, "title": "short title of the issue", "description": "detailed description based on the conversation"}

Otherwise respond normally as a helpful assistant.

CONVERSATION:
${conversationHistory}
User: ${content}

${config.botName}:`;

    let aiResponse: string;
    let ticketCreated: any = null;

    if (config.autoReply) {
      aiResponse = await geminiClient.generateContent(prompt, false);

      // Check if AI wants to create a ticket — clean up markdown code blocks if present
      try {
        let trimmed = aiResponse.trim();
        // Strip markdown code fences: ```json ... ``` or ``` ... ```
        trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        if (trimmed.startsWith('{') && trimmed.includes('create_ticket')) {
          const parsed = JSON.parse(trimmed);
          if (parsed.create_ticket && parsed.title) {
            // Find admin user for ticket creation
            const admin = await prisma.user.findFirst({
              where: { organizationId: req.apiKey!.organizationId, role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
            });

            if (admin) {
              // Build description with chat transcript
              let fullDesc = parsed.description || content;
              const transcript = session.messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n');
              fullDesc += `\n\n---\n**Chat Transcript:**\n${transcript}\nUser: ${content}\n\n_Created via chatbot widget_`;
              if (session.visitorEmail) fullDesc += `\nUser: ${session.visitorName || ''} <${session.visitorEmail}>`;

              // Find contact
              let contactId: string | null = null;
              if (session.visitorEmail) {
                const contact = await prisma.contact.findFirst({
                  where: { email: session.visitorEmail, organizationId: req.apiKey!.organizationId },
                });
                contactId = contact?.id || null;
              }

              // Create ticket
              const ticket = await prisma.ticket.create({
                data: {
                  title: parsed.title,
                  description: fullDesc,
                  priority: 'MEDIUM',
                  projectId: req.apiKey!.projectId,
                  contactId,
                  createdById: admin.id,
                  organizationId: req.apiKey!.organizationId,
                },
              });

              ticketCreated = { id: ticket.id, title: ticket.title };

              // Run AI classification on the ticket (async, don't block chat)
              import('../services/ai/GeminiClient').then(({ GeminiClient: GC }) => {
                import('../services/ai/TaskAnalyzer').then(({ TaskAnalyzer }) => {
                  const analyzer = new TaskAnalyzer(new GC());
                  analyzer.analyze(`${parsed.title}\n\n${parsed.description}`).then((analysis) => {
                    prisma.ticket.update({
                      where: { id: ticket.id },
                      data: {
                        issueType: analysis.issueType,
                        issueCategory: analysis.issueCategory as any,
                        confidence: analysis.confidence,
                        analysis: analysis as any,
                        priority: analysis.suggestedPriority as any,
                      },
                    }).catch(() => {});
                  }).catch(() => {});
                });
              });

              aiResponse = `I've created a support ticket for you:\n\n**${parsed.title}**\n\nTicket ID: ${ticket.id.slice(0, 8)}\n\nOur team will look into this and get back to you. Is there anything else I can help with?`;
            }
          }
        }
      } catch {
        // Not a ticket JSON — normal response, continue
      }
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

    res.json({ userMessage: userMsg, aiMessage: aiMsg, ticketCreated });
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
