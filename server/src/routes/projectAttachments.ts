import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { notionStorage } from '../services/notion/NotionStorageService';

// Always buffer in memory; we decide where the file goes after auth + Notion check
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const projectAttachmentRoutes = Router({ mergeParams: true });
projectAttachmentRoutes.use(authenticate);

// List attachments for a project
projectAttachmentRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const attachments = await prisma.projectAttachment.findMany({
    where: { projectId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Attach a Notion URL when the file is stored there so the frontend can link to it
  const result = attachments.map(a => ({
    ...a,
    notionUrl: a.filePath.startsWith('notion:')
      ? `https://notion.so/${a.filePath.replace('notion:', '').replace(/-/g, '')}`
      : null,
  }));

  res.json(result);
});

// Upload an attachment
projectAttachmentRoutes.post('/', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: req.user!.organizationId },
    select: { id: true, name: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

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
      notes: req.body.notes || null,
      projectName: project.name,
      category: 'attachment',
      fileId: uploaded.fileId,
      fileUrl: uploaded.url,
      expiryTime: uploaded.expiryTime,
    });
    filePath = `notion:${page.pageId}`;
  } else {
    const dir = path.resolve('uploads', 'project-attachments', projectId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, `${Date.now()}-${req.file.originalname}`);
    fs.writeFileSync(filePath, req.file.buffer);
  }

  const attachment = await prisma.projectAttachment.create({
    data: {
      projectId,
      name: req.file.originalname,
      fileType: req.file.mimetype,
      filePath,
      fileSize: req.file.size,
      notes: req.body.notes || null,
      uploadedById: req.user!.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  res.status(201).json({
    ...attachment,
    notionUrl: filePath.startsWith('notion:')
      ? `https://notion.so/${filePath.replace('notion:', '').replace(/-/g, '')}`
      : null,
  });
});

// Update attachment notes
projectAttachmentRoutes.patch('/:attachmentId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const attachmentId = req.params.attachmentId as string;
  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const updated = await prisma.projectAttachment.update({
    where: { id: attachmentId },
    data: { notes: req.body.notes },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  res.json(updated);
});

// Delete an attachment
projectAttachmentRoutes.delete('/:attachmentId', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const attachmentId = req.params.attachmentId as string;
  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  if (attachment.filePath.startsWith('notion:')) {
    const pageId = attachment.filePath.replace('notion:', '');
    try { await notionStorage.archivePage(pageId); } catch { /* already archived or not found */ }
  } else {
    try { fs.unlinkSync(attachment.filePath); } catch { /* file may already be gone */ }
  }

  await prisma.projectAttachment.delete({ where: { id: attachmentId } });
  res.json({ success: true });
});

// Serve/download an attachment
projectAttachmentRoutes.get('/:attachmentId/download', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const attachmentId = req.params.attachmentId as string;
  const attachment = await prisma.projectAttachment.findFirst({
    where: { id: attachmentId, projectId },
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  if (attachment.filePath.startsWith('notion:')) {
    const pageId = attachment.filePath.replace('notion:', '');
    const url = await notionStorage.getFileUrl(pageId);
    if (!url) return res.status(404).json({ error: 'File not available in Notion' });
    return res.redirect(url);
  }

  if (!fs.existsSync(attachment.filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }
  res.download(attachment.filePath, attachment.name);
});
