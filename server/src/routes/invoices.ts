import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const invoiceRoutes = Router();
invoiceRoutes.use(authenticate);

function nextInvoiceNumber(type: string, existing: string[]): string {
  const prefix = type === 'PURCHASE_ORDER' ? 'PO' : type === 'WORK_ORDER' ? 'WO' : 'INV';
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  let seq = 1;
  const pattern = new RegExp(`^${prefix}-${ym}-(\\d+)$`);
  for (const n of existing) {
    const m = n.match(pattern);
    if (m) seq = Math.max(seq, parseInt(m[1]) + 1);
  }
  return `${prefix}-${ym}-${String(seq).padStart(4, '0')}`;
}

// List all invoices for the org (for the Invoices page)
invoiceRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const { type, status, projectId } = req.query;
  const where: any = { organizationId: req.user!.organizationId };
  if (type) where.type = type;
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, color: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
});

// Get invoice settings for PDF generation (public-ish — authenticated but no role required)
invoiceRoutes.get('/org-settings', async (req: AuthRequest, res: Response) => {
  const settings = await prisma.invoiceSettings.findUnique({
    where: { organizationId: req.user!.organizationId },
  });
  const org = await prisma.organization.findUnique({
    where: { id: req.user!.organizationId },
    select: { name: true },
  });
  res.json({ settings, orgName: org?.name });
});

// List invoices for a specific project
invoiceRoutes.get('/project/:projectId', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const invoices = await prisma.invoice.findMany({
    where: { projectId: req.params.projectId },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
});

// Create invoice for a project
invoiceRoutes.post('/project/:projectId', async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.projectId, organizationId: req.user!.organizationId },
    select: { id: true, currency: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { type, lineItems, notes, dueDate, contactId, taxRate, currency, billingName, billingEmail, billingAddress } = req.body;
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: 'lineItems array is required' });
  }

  // Calculate totals
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.qty || 1) * (item.unitPrice || 0), 0);
  const rate = parseFloat(taxRate || 0);
  const taxAmount = subtotal * (rate / 100);
  const total = subtotal + taxAmount;

  // Generate invoice number
  const existing = await prisma.invoice.findMany({
    where: { organizationId: req.user!.organizationId, type: type || 'INVOICE' },
    select: { invoiceNumber: true },
  });
  const invoiceNumber = nextInvoiceNumber(type || 'INVOICE', existing.map((i) => i.invoiceNumber));

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      projectId: req.params.projectId,
      organizationId: req.user!.organizationId,
      type: type || 'INVOICE',
      status: 'DRAFT',
      currency: currency || project.currency || 'USD',
      lineItems: lineItems,
      subtotal,
      taxRate: rate,
      taxAmount,
      total,
      notes,
      billingName: billingName || undefined,
      billingEmail: billingEmail || undefined,
      billingAddress: billingAddress || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      contactId: contactId || undefined,
      createdById: req.user!.id,
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  res.status(201).json(invoice);
});

// Get a single invoice
invoiceRoutes.get('/:id', async (req: AuthRequest, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
    include: {
      project: { select: { id: true, name: true, color: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});

// Update invoice (status, notes, dueDate, lineItems)
invoiceRoutes.patch('/:id', async (req: AuthRequest, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const { status, notes, dueDate, lineItems, taxRate, contactId, billingName, billingEmail, billingAddress } = req.body;

  let subtotal = invoice.subtotal;
  let taxAmount = invoice.taxAmount;
  let total = invoice.total;
  let rate = invoice.taxRate;

  if (lineItems) {
    subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.qty || 1) * (item.unitPrice || 0), 0);
    rate = parseFloat(taxRate ?? invoice.taxRate);
    taxAmount = subtotal * (rate / 100);
    total = subtotal + taxAmount;
  }

  const updated = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(lineItems && { lineItems, subtotal, taxRate: rate, taxAmount, total }),
      ...(contactId !== undefined && { contactId: contactId || null }),
      ...(billingName !== undefined && { billingName: billingName || null }),
      ...(billingEmail !== undefined && { billingEmail: billingEmail || null }),
      ...(billingAddress !== undefined && { billingAddress: billingAddress || null }),
    },
    include: {
      project: { select: { id: true, name: true, color: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // When invoice is marked PAID for the first time, auto-record as PAYMENT_RECEIVED in project costs
  if (status === 'PAID' && invoice.status !== 'PAID' && invoice.projectId) {
    await prisma.projectCost.create({
      data: {
        projectId: invoice.projectId,
        name: `Payment — ${invoice.invoiceNumber}`,
        type: 'PAYMENT_RECEIVED',
        amount: updated.total,
        description: `Auto-recorded from invoice ${invoice.invoiceNumber}`,
        addedById: req.user!.id,
      },
    });
  }

  res.json(updated);
});

// Delete invoice
invoiceRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
