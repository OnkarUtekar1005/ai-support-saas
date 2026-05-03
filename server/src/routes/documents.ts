import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { notionStorage } from '../services/notion/NotionStorageService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];
    cb(null, allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt|md)$/i) !== null);
  },
});

export const documentRoutes = Router();
documentRoutes.use(authenticate);
documentRoutes.use(requireRole('ADMIN'));

// Upload a document for a project
documentRoutes.post('/:projectId/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
    select: { id: true, name: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  let filePath: string;

  if (notionStorage.isEnabled()) {
    const uploaded = await notionStorage.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    const page = await notionStorage.createPage({
      name: req.file.originalname,
      fileType: req.file.mimetype,
      notes: null,
      projectName: project.name,
      category: 'document',
      fileId: uploaded.fileId,
      fileUrl: uploaded.url,
      expiryTime: uploaded.expiryTime,
    });
    filePath = `notion:${page.pageId}`;
  } else {
    const projectDir = path.resolve('uploads', projectId);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
    filePath = path.join(projectDir, `${Date.now()}-${req.file.originalname}`);
    fs.writeFileSync(filePath, req.file.buffer);
  }

  const doc = await prisma.projectDocument.create({
    data: {
      projectId,
      organizationId: req.user!.organizationId,
      fileName: req.file.originalname,
      fileType: ext,
      filePath,
      fileSize: req.file.size,
      status: 'pending',
    },
  });

  // Kick off document processing asynchronously (DocumentProcessor handles notion: paths)
  try {
    const { DocumentProcessor } = await import('../services/documents/DocumentProcessor');
    const processor = new DocumentProcessor();
    processor.process(doc.id).catch((err: Error) => {
      console.error(`Document processing failed for ${doc.id}:`, err.message);
    });
  } catch {
    // DocumentProcessor not yet available — document stays 'pending'
  }

  res.status(201).json(doc);
});

// List all documents for a project
documentRoutes.get('/:projectId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const documents = await prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  res.json(documents);
});

// Delete a document and its knowledge entries
documentRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  const documentId = req.params.id as string;

  const doc = await prisma.projectDocument.findFirst({
    where: { id: documentId, organizationId: req.user!.organizationId },
  });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  await prisma.knowledgeEntry.deleteMany({ where: { documentId } });

  if (doc.filePath.startsWith('notion:')) {
    const pageId = doc.filePath.replace('notion:', '');
    try { await notionStorage.archivePage(pageId); } catch { /* already archived */ }
  } else {
    try {
      if (fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    } catch (err) {
      console.error(`Failed to delete file ${doc.filePath}:`, (err as Error).message);
    }
  }

  await prisma.projectDocument.delete({ where: { id: documentId } });
  res.json({ success: true });
});
