import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const upload = multer({
  dest: 'uploads/tmp',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

  // Verify project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Move file from tmp to project-specific directory
  const projectDir = path.resolve('uploads', projectId);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const destPath = path.join(projectDir, `${Date.now()}-${req.file.originalname}`);
  fs.renameSync(req.file.path, destPath);

  // Determine file type from extension
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');

  // Create ProjectDocument record
  const doc = await prisma.projectDocument.create({
    data: {
      projectId,
      organizationId: req.user!.organizationId,
      fileName: req.file.originalname,
      fileType: ext,
      filePath: destPath,
      fileSize: req.file.size,
      status: 'pending',
    },
  });

  // Kick off document processing async (don't await)
  // DocumentProcessor.process(doc.id) would be called here once implemented
  // For now, we just leave the status as 'pending'
  try {
    const { DocumentProcessor } = await import('../services/documents/DocumentProcessor');
    const processor = new DocumentProcessor();
    processor.process(doc.id).catch((err: Error) => {
      console.error(`Document processing failed for ${doc.id}:`, err.message);
    });
  } catch {
    // DocumentProcessor not yet implemented — document stays in 'pending' status
  }

  res.status(201).json(doc);
});

// List all documents for a project
documentRoutes.get('/:projectId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  // Verify project belongs to org
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
    where: {
      id: documentId,
      organizationId: req.user!.organizationId,
    },
  });

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Delete all KnowledgeEntry records linked to this document
  await prisma.knowledgeEntry.deleteMany({
    where: { documentId },
  });

  // Delete the physical file
  try {
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
  } catch (err) {
    console.error(`Failed to delete file ${doc.filePath}:`, (err as Error).message);
  }

  // Delete the document record
  await prisma.projectDocument.delete({
    where: { id: documentId },
  });

  res.json({ success: true });
});
