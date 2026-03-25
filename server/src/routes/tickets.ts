import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';
import { TaskAnalyzer } from '../services/ai/TaskAnalyzer';
import { ResolutionEngine } from '../services/ai/ResolutionEngine';
import { VectorStore } from '../services/rag/VectorStore';
import { ErrorLogger } from '../services/logging/ErrorLogger';

export const ticketRoutes = Router();
ticketRoutes.use(authenticate);

const geminiClient = new GeminiClient();
const taskAnalyzer = new TaskAnalyzer(geminiClient);
const resolutionEngine = new ResolutionEngine(geminiClient);
const vectorStore = new VectorStore();

// List tickets for organization
ticketRoutes.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20', status, priority } = req.query;
    const where: any = { organizationId: req.user!.organizationId };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { createdBy: { select: { name: true, email: true } } },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ tickets, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR', message: (err as Error).message, stack: (err as Error).stack,
      source: 'tickets-list', organizationId: req.user!.organizationId, userId: req.user!.id,
    });
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Create ticket + analyze
ticketRoutes.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, priority } = req.body;

    // Create ticket
    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        priority: priority || 'MEDIUM',
        organizationId: req.user!.organizationId,
        createdById: req.user!.id,
      },
    });

    // Analyze with AI (async)
    const analysis = await taskAnalyzer.analyze(description);

    // Search knowledge base
    const similarCases = await vectorStore.search(req.user!.organizationId, description, 3);

    // Update ticket with analysis
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        issueType: analysis.issueType,
        confidence: analysis.confidence,
        analysis: analysis as any,
        priority: analysis.suggestedPriority || priority || 'MEDIUM',
        status: analysis.confidence < 0.8 ? 'WAITING_CLARIFICATION' : 'IN_PROGRESS',
      },
    });

    // If confidence is high enough, generate resolution
    let resolution = null;
    if (analysis.confidence >= 0.8) {
      resolution = await resolutionEngine.generateResolution({
        ticketText: description,
        analysis,
        similarCases,
      });

      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { resolution, status: 'RESOLVED' },
      });
    }

    res.status(201).json({
      ticket: { ...ticket, analysis, resolution },
      similarCases,
      needsClarification: analysis.confidence < 0.8,
    });
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR', message: (err as Error).message, stack: (err as Error).stack,
      source: 'tickets-create', endpoint: 'POST /api/tickets',
      organizationId: req.user!.organizationId, userId: req.user!.id,
    });
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Get single ticket
ticketRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      createdBy: { select: { name: true, email: true } },
      chatSessions: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      attachments: true,
    },
  });

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

// Update ticket status
ticketRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { status, priority } = req.body;
  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { ...(status && { status }), ...(priority && { priority }) },
  });
  res.json(ticket);
});
