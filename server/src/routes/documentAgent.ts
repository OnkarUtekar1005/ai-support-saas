import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { DocumentAgentService } from '../services/documents/DocumentAgentService';
import path from 'path';
import fs from 'fs';

export const documentAgentRoutes = Router();

const service = new DocumentAgentService();

// ── Public: file download (no auth — filenames are UUID-based and unguessable) ──
documentAgentRoutes.get('/download/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename as string);
  const filePath = path.join(process.cwd(), 'uploads', 'document-agent', filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(filePath).pipe(res);
});

// ── All routes below require authentication ──
documentAgentRoutes.use(authenticate);

// Start a new document generation session
documentAgentRoutes.post('/start', async (req: AuthRequest, res: Response) => {
  const { title, requirements, projectId } = req.body;
  if (!requirements?.trim()) return res.status(400).json({ error: 'requirements is required' });

  try {
    const result = await service.startSession({
      title:          (title as string) || 'New Project',
      requirements:   requirements as string,
      projectId:      (projectId as string) || null,
      organizationId: req.user!.organizationId,
      createdById:    req.user!.id,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Send an answer and get the next question (or trigger generation)
documentAgentRoutes.post('/:id/reply', async (req: AuthRequest, res: Response) => {
  const { answer } = req.body;
  if (!answer?.trim()) return res.status(400).json({ error: 'answer is required' });

  try {
    const result = await service.reply(req.params.id as string, req.user!.organizationId, answer as string);
    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    res.status(500).json({ error: msg });
  }
});

// List all sessions for this org
documentAgentRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const sessions = await service.listSessions(req.user!.organizationId);
  res.json(sessions);
});

// Get session status and messages  (keep AFTER / and specific paths to avoid shadowing)
documentAgentRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const session = await service.getSession(req.params.id as string, req.user!.organizationId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Delete a session
documentAgentRoutes.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { prisma } = await import('../utils/prisma');
  const session = await prisma.documentAgentSession.findFirst({
    where: { id: req.params.id as string, organizationId: req.user!.organizationId },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const docs = (session.generatedDocs as any[]) || [];
  for (const doc of docs) {
    if (doc.filePath && fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
  }

  await prisma.documentAgentSession.delete({ where: { id: req.params.id as string } });
  res.json({ ok: true });
});
