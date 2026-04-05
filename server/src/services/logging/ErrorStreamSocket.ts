import { Server, Socket } from 'socket.io';
import { prisma } from '../../utils/prisma';
import { ErrorLogger } from './ErrorLogger';

interface StreamSocket extends Socket {
  apiKeyId?: string;
  organizationId?: string;
  projectId?: string | null;
  apiKeyName?: string;
}

/**
 * WebSocket error stream namespace: /sdk/stream
 *
 * External apps connect via Socket.io and stream errors in real-time.
 * Auth via API key in handshake.
 *
 * Events:
 *   Client → Server:
 *     'error'         → single error object
 *     'errors:batch'  → array of error objects
 *
 *   Server → Client:
 *     'error:ack'     → { fingerprint, isNew, count }
 *     'alert'         → { type, fingerprint, message } (regression, etc.)
 */
export function setupErrorStream(io: Server): void {
  const streamNs = io.of('/sdk/stream');

  // Auth middleware — validate API key
  streamNs.use(async (socket: StreamSocket, next) => {
    try {
      const apiKey = socket.handshake.auth.apiKey as string;
      if (!apiKey) return next(new Error('apiKey required in auth'));

      const key = await prisma.apiKey.findUnique({
        where: { key: apiKey },
        select: {
          id: true,
          name: true,
          isActive: true,
          organizationId: true,
          projectId: true,
          permissions: true,
        },
      });

      if (!key || !key.isActive) return next(new Error('Invalid or inactive API key'));
      if (!key.permissions.includes('errors')) return next(new Error('API key missing "errors" permission'));

      socket.apiKeyId = key.id;
      socket.organizationId = key.organizationId;
      socket.projectId = key.projectId;
      socket.apiKeyName = key.name;

      // Update usage
      await prisma.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
      });

      next();
    } catch (err) {
      next(new Error('Auth failed: ' + (err as Error).message));
    }
  });

  streamNs.on('connection', (socket: StreamSocket) => {
    console.log(`[ErrorStream] Connected: ${socket.apiKeyName} (${socket.organizationId})`);

    // Single error
    socket.on('error', async (data: any) => {
      if (!data?.message) return;

      const fingerprint = await ErrorLogger.logError({
        level: data.level || 'ERROR',
        message: data.message,
        stack: data.stack,
        source: data.source || `ws-${socket.apiKeyName}`,
        category: data.category,
        endpoint: data.endpoint,
        userId: data.userId,
        organizationId: socket.organizationId,
        projectId: socket.projectId || data.projectId,
        language: data.language,
        framework: data.framework,
        environment: data.environment,
        hostname: data.hostname,
        metadata: data.metadata,
      });

      socket.emit('error:ack', { fingerprint, message: data.message.substring(0, 100) });
    });

    // Batch errors
    socket.on('errors:batch', async (errors: any[]) => {
      if (!Array.isArray(errors)) return;

      const results = [];
      for (const err of errors.slice(0, 50)) {
        if (!err?.message) continue;

        const fingerprint = await ErrorLogger.logError({
          level: err.level || 'ERROR',
          message: err.message,
          stack: err.stack,
          source: err.source || `ws-${socket.apiKeyName}`,
          category: err.category,
          endpoint: err.endpoint,
          organizationId: socket.organizationId,
          projectId: socket.projectId || err.projectId,
          language: err.language,
          framework: err.framework,
          environment: err.environment,
          hostname: err.hostname,
          metadata: err.metadata,
        });

        results.push({ fingerprint });
      }

      socket.emit('errors:batch:ack', { count: results.length, results });
    });

    socket.on('disconnect', () => {
      console.log(`[ErrorStream] Disconnected: ${socket.apiKeyName}`);
    });
  });
}
