import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { v4 as uuidv4 } from 'uuid';

export const invoiceSettingsRoutes = Router();
invoiceSettingsRoutes.use(authenticate);

// GET current org invoice settings
invoiceSettingsRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const settings = await prisma.invoiceSettings.findUnique({
    where: { organizationId: req.user!.organizationId },
  });
  res.json(settings || null);
});

// PUT (upsert) invoice settings — ADMIN only
invoiceSettingsRoutes.put('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const {
    companyName, companyAddress, companyPhone, companyEmail, companyWebsite,
    logoUrl, primaryColor, accentColor, footerText, paymentTerms, bankDetails, taxId,
  } = req.body;

  const settings = await prisma.invoiceSettings.upsert({
    where: { organizationId: req.user!.organizationId },
    update: {
      companyName, companyAddress, companyPhone, companyEmail, companyWebsite,
      logoUrl, primaryColor, accentColor, footerText, paymentTerms, bankDetails, taxId,
    },
    create: {
      id: uuidv4(),
      organizationId: req.user!.organizationId,
      companyName: companyName || req.user!.organizationId, // fallback
      companyAddress, companyPhone, companyEmail, companyWebsite,
      logoUrl, primaryColor, accentColor, footerText, paymentTerms, bankDetails, taxId,
    },
  });
  res.json(settings);
});
