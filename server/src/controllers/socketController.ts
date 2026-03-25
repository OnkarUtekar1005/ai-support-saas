import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import { GeminiClient } from '../services/ai/GeminiClient';
import { TaskAnalyzer } from '../services/ai/TaskAnalyzer';
import { ResolutionEngine } from '../services/ai/ResolutionEngine';
import { SqlQueryGenerator } from '../services/ai/SqlQueryGenerator';
import { SqlSafetyGuard } from '../services/sql/SqlSafetyGuard';
import { VectorStore } from '../services/rag/VectorStore';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { CrmContextBuilder } from '../services/ai/CrmContextBuilder';

const geminiClient = new GeminiClient();
const taskAnalyzer = new TaskAnalyzer(geminiClient);
const resolutionEngine = new ResolutionEngine(geminiClient);
const sqlGenerator = new SqlQueryGenerator(geminiClient);
const vectorStore = new VectorStore();

interface AuthSocket extends Socket {
  userId?: string;
  organizationId?: string;
}

export function setupSocketHandlers(io: Server) {
  // Auth middleware for WebSocket
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, organizationId: true },
      });

      if (!user) return next(new Error('User not found'));

      socket.userId = user.id;
      socket.organizationId = user.organizationId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join organization room
    socket.join(`org:${socket.organizationId}`);

    // Real-time chat message
    socket.on('chat:message', async (data: { sessionId: string; content: string }) => {
      try {
        // Save user message
        await prisma.chatMessage.create({
          data: { chatSessionId: data.sessionId, role: 'user', content: data.content },
        });

        socket.emit('chat:typing', { sessionId: data.sessionId });

        // Get conversation history
        const history = await prisma.chatMessage.findMany({
          where: { chatSessionId: data.sessionId },
          orderBy: { createdAt: 'asc' },
          take: 20,
        });

        const conversationContext = history.map((m) => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content).join('\n');

        const crmContext = await CrmContextBuilder.buildContext(socket.organizationId!, data.content);

        const prompt = 'You are a senior AI support engineer with FULL access to the CRM. Use the data below to answer. Never say you cannot access the system. Search by name, not IDs.\n\nORGANIZATION DATA:\n' + crmContext + '\n\nCONVERSATION:\n' + conversationContext + '\nUser: ' + data.content + '\n\nAssistant:';

        const aiResponse = await geminiClient.generateContent(prompt, false);

        const message = await prisma.chatMessage.create({
          data: { chatSessionId: data.sessionId, role: 'assistant', content: aiResponse },
        });

        socket.emit('chat:response', { sessionId: data.sessionId, message });
      } catch (err) {
        await ErrorLogger.logError({
          level: 'ERROR', message: (err as Error).message, stack: (err as Error).stack,
          source: 'socket-chat', organizationId: socket.organizationId,
          userId: socket.userId,
        });
        socket.emit('chat:error', { error: 'Failed to process message' });
      }
    });

    // Ticket analysis via WebSocket (real-time updates)
    socket.on('ticket:analyze', async (data: { ticketId: string; description: string }) => {
      try {
        // Step 1: Analyze
        socket.emit('ticket:step', { ticketId: data.ticketId, step: 'analyzing', message: 'Analyzing ticket...' });
        const analysis = await taskAnalyzer.analyze(data.description);
        socket.emit('ticket:analysis', { ticketId: data.ticketId, analysis });

        // Step 2: Search knowledge base
        socket.emit('ticket:step', { ticketId: data.ticketId, step: 'searching', message: 'Searching knowledge base...' });
        const similarCases = await vectorStore.search(socket.organizationId!, data.description, 3);
        socket.emit('ticket:similarCases', { ticketId: data.ticketId, similarCases });

        // Step 3: Generate resolution (if confident)
        if (analysis.confidence >= 0.8) {
          socket.emit('ticket:step', { ticketId: data.ticketId, step: 'resolving', message: 'Generating resolution...' });
          const resolution = await resolutionEngine.generateResolution({
            ticketText: data.description,
            analysis,
            similarCases,
          });

          await prisma.ticket.update({
            where: { id: data.ticketId },
            data: {
              resolution, status: 'RESOLVED',
              issueType: analysis.issueType, confidence: analysis.confidence,
              analysis: analysis as any,
            },
          });

          socket.emit('ticket:resolution', { ticketId: data.ticketId, resolution });
        } else {
          socket.emit('ticket:needsClarification', {
            ticketId: data.ticketId,
            questions: ['Could you provide more details about the issue?', 'What error messages are you seeing?'],
          });
        }

        socket.emit('ticket:step', { ticketId: data.ticketId, step: 'complete', message: 'Analysis complete' });
      } catch (err) {
        await ErrorLogger.logError({
          level: 'ERROR', message: (err as Error).message, stack: (err as Error).stack,
          source: 'socket-ticket-analyze', organizationId: socket.organizationId,
          userId: socket.userId,
        });
        socket.emit('ticket:error', { ticketId: data.ticketId, error: 'Analysis failed' });
      }
    });

    // SQL query generation
    socket.on('sql:generate', async (data: { request: string; schemaContext?: string }) => {
      try {
        const generated = await sqlGenerator.generate(data.request, data.schemaContext);
        const safety = SqlSafetyGuard.validate(generated.query);
        socket.emit('sql:proposal', { ...generated, safe: safety.safe, safetyReason: safety.reason });
      } catch (err) {
        socket.emit('sql:error', { error: 'Failed to generate SQL' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}
