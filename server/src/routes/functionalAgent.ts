import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const functionalAgentRoutes = Router();
functionalAgentRoutes.use(authenticate);

// Resolve a query using the Functional Agent
functionalAgentRoutes.post('/resolve', async (req: AuthRequest, res: Response) => {
  const { ticketId, query, projectId } = req.body;

  if (!query || !projectId) {
    return res.status(400).json({ error: 'query and projectId are required' });
  }

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  try {
    const { FunctionalAgent } = await import('../services/agents/FunctionalAgent');
    const agent = new FunctionalAgent();
    const resolution = await agent.resolve({
      ticketId: ticketId || null,
      query,
      projectId,
      organizationId: req.user!.organizationId,
    });

    res.json(resolution);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('FunctionalAgent.resolve failed:', msg, (err as Error).stack);
    res.status(500).json({ error: msg });
  }
});

// List resolutions for a project
functionalAgentRoutes.get('/resolutions/:projectId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const resolutions = await prisma.functionalResolution.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(resolutions);
});

// Submit feedback for a resolution
functionalAgentRoutes.post('/resolution/:id/feedback', async (req: AuthRequest, res: Response) => {
  const resolutionId = req.params.id as string;
  const { feedback } = req.body;

  const VALID = ['helpful', 'not_helpful', 'positive', 'negative'];
  if (!feedback || !VALID.includes(feedback)) {
    return res.status(400).json({ error: 'feedback must be helpful or not_helpful' });
  }
  // Normalise to stored values
  const normFeedback = feedback === 'positive' ? 'helpful' : feedback === 'negative' ? 'not_helpful' : feedback;

  const resolution = await prisma.functionalResolution.findFirst({
    where: {
      id: resolutionId,
      organizationId: req.user!.organizationId,
    },
  });

  if (!resolution) return res.status(404).json({ error: 'Resolution not found' });

  const updated = await prisma.functionalResolution.update({
    where: { id: resolutionId },
    data: { feedback: normFeedback },
  });

  res.json(updated);
});
