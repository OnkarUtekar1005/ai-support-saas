import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { EmailService } from '../services/email/EmailService';

export const projectUpdateRoutes = Router({ mergeParams: true });
projectUpdateRoutes.use(authenticate);

// List updates for a project
projectUpdateRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const updates = await prisma.projectUpdate.findMany({
    where: { projectId: req.params.projectId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(updates);
});

// Create an update (optionally email it)
projectUpdateRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true, name: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, content, sendEmail, emailAddresses } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' });

  const recipients: string[] = Array.isArray(emailAddresses)
    ? emailAddresses
    : typeof emailAddresses === 'string'
      ? emailAddresses.split(',').map((e: string) => e.trim()).filter(Boolean)
      : [];

  let emailSent = false;
  if (sendEmail && recipients.length > 0) {
    try {
      const emailSettings = await prisma.emailSettings.findUnique({
        where: { organizationId: req.user!.organizationId },
      });
      if (emailSettings) {
        await EmailService.sendProjectUpdate({
          to: recipients,
          projectName: project.name,
          updateTitle: title,
          updateContent: content,
          smtpConfig: emailSettings,
        });
        emailSent = true;
      }
    } catch {
      // non-critical — save the update even if email fails
    }
  }

  const update = await prisma.projectUpdate.create({
    data: {
      projectId: req.params.projectId,
      title,
      content,
      sentEmails: recipients,
      emailSent,
      createdById: req.user!.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.status(201).json(update);
});

// Delete an update
projectUpdateRoutes.delete('/:updateId', async (req: AuthRequest, res: Response) => {
  const update = await prisma.projectUpdate.findFirst({
    where: { id: req.params.updateId, projectId: req.params.projectId },
  });
  if (!update) return res.status(404).json({ error: 'Update not found' });

  await prisma.projectUpdate.delete({ where: { id: req.params.updateId } });
  res.json({ success: true });
});
