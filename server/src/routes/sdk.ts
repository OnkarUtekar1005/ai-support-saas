import { Router, Response } from 'express';
import { apiKeyAuth, SdkRequest, requirePermission } from '../middleware/apiKeyAuth';
import { prisma } from '../utils/prisma';
import { ErrorLogger } from '../services/logging/ErrorLogger';

export const sdkRoutes = Router();

// All SDK routes use API key authentication
sdkRoutes.use(apiKeyAuth);

// ─── CORS preflight for SDK endpoints ───
sdkRoutes.options('*', (_req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.sendStatus(204);
});

// ─────────────────────────────────────────
// 1. IDENTIFY — Create or update a contact
// ─────────────────────────────────────────
sdkRoutes.post('/identify', requirePermission('contacts'), async (req: SdkRequest, res: Response) => {
  try {
    const { email, firstName, lastName, phone, jobTitle, userId, properties } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Find existing contact by email in this org
    const existing = await prisma.contact.findFirst({
      where: { email, organizationId: req.apiKey!.organizationId },
    });

    let contact;
    if (existing) {
      // Update existing contact
      contact = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phone && { phone }),
          ...(jobTitle && { jobTitle }),
          ...(properties?.notes && { notes: properties.notes }),
        },
      });
    } else {
      // Create new contact
      contact = await prisma.contact.create({
        data: {
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
          email,
          phone,
          jobTitle,
          status: 'LEAD',
          source: `sdk-${req.apiKey!.platform}`,
          notes: properties?.notes,
          projectId: req.apiKey!.projectId,
          organizationId: req.apiKey!.organizationId,
        },
      });
    }

    // Track the identify event
    await prisma.sdkEvent.create({
      data: {
        type: 'contact.identify',
        data: { email, firstName, lastName, userId },
        userEmail: email,
        userId,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        pageUrl: req.body.pageUrl,
        apiKeyId: req.apiKey!.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true, contactId: contact.id, isNew: !existing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to identify contact' });
  }
});

// ─────────────────────────────────────────
// 2. TRACK — Track a custom event
// ─────────────────────────────────────────
sdkRoutes.post('/track', requirePermission('events'), async (req: SdkRequest, res: Response) => {
  try {
    const { event, properties, userId, email, sessionId, pageUrl } = req.body;

    if (!event) {
      return res.status(400).json({ error: 'event name is required' });
    }

    await prisma.sdkEvent.create({
      data: {
        type: 'custom',
        name: event,
        data: properties || {},
        userId,
        userEmail: email,
        sessionId,
        pageUrl,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        apiKeyId: req.apiKey!.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ─────────────────────────────────────────
// 3. ERROR — Log an error from external app
// ─────────────────────────────────────────
sdkRoutes.post('/error', requirePermission('errors'), async (req: SdkRequest, res: Response) => {
  try {
    const { message, stack, source, level, endpoint, userId, email, pageUrl, language, framework, environment, hostname, category, metadata } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Log to error monitoring system (file + memory + Gemini dedup)
    const errorId = await ErrorLogger.logError({
      level: level || 'ERROR',
      message,
      stack,
      source: source || `sdk-${req.apiKey!.name}`,
      category,
      endpoint: endpoint || pageUrl,
      userId,
      organizationId: req.apiKey!.organizationId,
      projectId: req.apiKey!.projectId || undefined,
      language,
      framework,
      environment,
      hostname,
      metadata,
    });

    // Also track as SDK event
    await prisma.sdkEvent.create({
      data: {
        type: 'error',
        name: message,
        data: { stack, source, level, endpoint },
        userId,
        userEmail: email,
        pageUrl,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        apiKeyId: req.apiKey!.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true, errorId });
  } catch {
    res.status(500).json({ error: 'Failed to log error' });
  }
});

// ─────────────────────────────────────────
// 3b. BATCH ERRORS — Log multiple errors at once
// ─────────────────────────────────────────
sdkRoutes.post('/errors/batch', requirePermission('errors'), async (req: SdkRequest, res: Response) => {
  try {
    const { errors } = req.body;

    if (!Array.isArray(errors) || errors.length === 0) {
      return res.status(400).json({ error: 'errors array is required' });
    }

    if (errors.length > 50) {
      return res.status(400).json({ error: 'Max 50 errors per batch' });
    }

    const results = [];
    for (const err of errors) {
      if (!err.message) continue;

      const fingerprint = await ErrorLogger.logError({
        level: err.level || 'ERROR',
        message: err.message,
        stack: err.stack,
        source: err.source || `sdk-${req.apiKey!.name}`,
        category: err.category,
        endpoint: err.endpoint || err.pageUrl,
        userId: err.userId,
        organizationId: req.apiKey!.organizationId,
        projectId: req.apiKey!.projectId || undefined,
        language: err.language,
        framework: err.framework,
        environment: err.environment,
        hostname: err.hostname,
        metadata: err.metadata,
      });

      results.push({ fingerprint, message: err.message.substring(0, 100) });
    }

    res.json({ ok: true, count: results.length, results });
  } catch {
    res.status(500).json({ error: 'Failed to log errors batch' });
  }
});

// ─────────────────────────────────────────
// 4. TICKET — Create a support ticket from external app
// ─────────────────────────────────────────
sdkRoutes.post('/ticket', requirePermission('tickets'), async (req: SdkRequest, res: Response) => {
  try {
    const { title, description, priority, email, userId, pageUrl, metadata } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    // Find or create contact if email provided
    let contactId: string | null = null;
    if (email) {
      const contact = await prisma.contact.findFirst({
        where: { email, organizationId: req.apiKey!.organizationId },
      });
      contactId = contact?.id || null;
    }

    // Get a default user to assign as creator (first admin in org)
    const defaultUser = await prisma.user.findFirst({
      where: { organizationId: req.apiKey!.organizationId, role: 'ADMIN' },
    });

    if (!defaultUser) {
      return res.status(500).json({ error: 'No admin user found in organization' });
    }

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description: `${description}\n\n---\n_Submitted via ${req.apiKey!.name} (${req.apiKey!.platform})_${pageUrl ? `\nPage: ${pageUrl}` : ''}${email ? `\nUser: ${email}` : ''}${metadata ? `\nMetadata: ${JSON.stringify(metadata)}` : ''}`,
        priority: priority || 'MEDIUM',
        projectId: req.apiKey!.projectId,
        contactId,
        createdById: defaultUser.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    // Track as SDK event
    await prisma.sdkEvent.create({
      data: {
        type: 'ticket.create',
        name: title,
        data: { ticketId: ticket.id, priority },
        userId,
        userEmail: email,
        pageUrl,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        apiKeyId: req.apiKey!.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true, ticketId: ticket.id });
  } catch {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// ─────────────────────────────────────────
// 5. PAGE VIEW — Track page views
// ─────────────────────────────────────────
sdkRoutes.post('/pageview', requirePermission('events'), async (req: SdkRequest, res: Response) => {
  try {
    const { url, title, referrer, sessionId, userId, email } = req.body;

    await prisma.sdkEvent.create({
      data: {
        type: 'page_view',
        name: title,
        data: { url, referrer },
        sessionId,
        userId,
        userEmail: email,
        pageUrl: url,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        apiKeyId: req.apiKey!.id,
        organizationId: req.apiKey!.organizationId,
      },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to track pageview' });
  }
});

// ─────────────────────────────────────────
// 6. EVENTS QUERY — Get events for a user/session (for admin use)
// ─────────────────────────────────────────
sdkRoutes.get('/events', async (req: SdkRequest, res: Response) => {
  const { email, userId, type, limit = '50' } = req.query;
  const where: any = { organizationId: req.apiKey!.organizationId };
  if (email) where.userEmail = email;
  if (userId) where.userId = userId;
  if (type) where.type = type;

  const events = await prisma.sdkEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
  });

  res.json(events);
});
