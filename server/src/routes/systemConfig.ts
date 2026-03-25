import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { VectorStore } from '../services/rag/VectorStore';

export const systemConfigRoutes = Router();
systemConfigRoutes.use(authenticate);

const vectorStore = new VectorStore();

// Get all system configs for org
systemConfigRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const configs = await prisma.systemConfig.findMany({
    where: { organizationId: req.user!.organizationId },
    select: { id: true, name: true, description: true, isDefault: true, createdAt: true },
  });
  res.json(configs);
});

// Get single config
systemConfigRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const config = await prisma.systemConfig.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!config) return res.status(404).json({ error: 'Config not found' });
  res.json(config);
});

// Create system config
systemConfigRoutes.post('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { name, description, config: configData } = req.body;

  const systemConfig = await prisma.systemConfig.create({
    data: {
      name,
      description,
      config: configData,
      organizationId: req.user!.organizationId,
    },
  });

  res.status(201).json(systemConfig);
});

// Update system config
systemConfigRoutes.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const { name, description, config: configData } = req.body;

  const systemConfig = await prisma.systemConfig.update({
    where: { id: req.params.id },
    data: { name, description, config: configData },
  });

  res.json(systemConfig);
});

// Add knowledge base entries
systemConfigRoutes.post('/knowledge', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { entries } = req.body; // Array of { title, content, category }

    const count = await vectorStore.addBatch(req.user!.organizationId, entries);

    res.json({ added: count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add knowledge entries' });
  }
});

// Search knowledge base
systemConfigRoutes.post('/knowledge/search', async (req: AuthRequest, res: Response) => {
  const { query, topK } = req.body;
  const results = await vectorStore.search(req.user!.organizationId, query, topK || 5);
  res.json(results);
});
