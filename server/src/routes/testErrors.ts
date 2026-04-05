import { Router, Request, Response } from 'express';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { prisma } from '../utils/prisma';

/**
 * Test error routes — triggers real backend errors for testing
 * the orchestrator auto-fix pipeline. No auth required (test only).
 */
export const testErrorRoutes = Router();

// Simulate: Database query error
testErrorRoutes.post('/db-error', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  try {
    // This will throw a real Prisma error — invalid table/field
    await (prisma as any).nonExistentTable.findMany();
  } catch (err) {
    const errorId = await ErrorLogger.logError({
      level: 'ERROR',
      message: (err as Error).message,
      stack: (err as Error).stack,
      source: 'DatabaseService',
      category: 'database',
      endpoint: 'POST /api/test-errors/db-error',
      projectId,
      organizationId,
    });
    res.json({ triggered: true, errorId, type: 'database', message: (err as Error).message });
  }
});

// Simulate: Null reference error (common backend bug)
testErrorRoutes.post('/null-ref', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  try {
    const user = null as any;
    user.profile.getName(); // TypeError: Cannot read properties of null
  } catch (err) {
    const errorId = await ErrorLogger.logError({
      level: 'ERROR',
      message: (err as Error).message,
      stack: (err as Error).stack,
      source: 'UserService',
      category: 'code',
      endpoint: 'GET /api/users/profile',
      projectId,
      organizationId,
    });
    res.json({ triggered: true, errorId, type: 'null-reference', message: (err as Error).message });
  }
});

// Simulate: Authentication/JWT error
testErrorRoutes.post('/auth-error', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  const err = new Error('JsonWebTokenError: invalid signature — token payload tampered');
  (err as any).stack = `JsonWebTokenError: invalid signature
    at Object.module.exports (node_modules/jsonwebtoken/verify.js:75:17)
    at AuthMiddleware.verifyToken (src/middleware/auth.ts:23:22)
    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)`;

  const errorId = await ErrorLogger.logError({
    level: 'ERROR',
    message: err.message,
    stack: err.stack,
    source: 'AuthMiddleware',
    category: 'auth',
    endpoint: 'GET /api/protected-resource',
    projectId,
    organizationId,
  });
  res.json({ triggered: true, errorId, type: 'auth', message: err.message });
});

// Simulate: External API timeout
testErrorRoutes.post('/api-timeout', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  const err = new Error('ETIMEDOUT: Stripe API request timed out after 30000ms');
  (err as any).stack = `Error: ETIMEDOUT: Stripe API request timed out after 30000ms
    at PaymentService.chargeCard (src/services/payment/PaymentService.ts:87:11)
    at OrderService.processPayment (src/services/order/OrderService.ts:134:24)
    at OrderController.checkout (src/controllers/OrderController.ts:45:18)`;

  const errorId = await ErrorLogger.logError({
    level: 'ERROR',
    message: err.message,
    stack: err.stack,
    source: 'PaymentService',
    category: 'timeout',
    endpoint: 'POST /api/orders/checkout',
    projectId,
    organizationId,
  });
  res.json({ triggered: true, errorId, type: 'api-timeout', message: err.message });
});

// Simulate: Memory/resource error (FATAL)
testErrorRoutes.post('/fatal-error', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  const err = new Error('FATAL: PostgreSQL connection pool exhausted — max 20 connections reached, all busy');
  (err as any).stack = `Error: FATAL: PostgreSQL connection pool exhausted — max 20 connections reached, all busy
    at Pool._acquireClient (node_modules/pg-pool/index.js:192:17)
    at DatabaseService.query (src/services/database/DatabaseService.ts:28:20)
    at UserRepository.findAll (src/repositories/UserRepository.ts:15:12)`;

  const errorId = await ErrorLogger.logError({
    level: 'FATAL',
    message: err.message,
    stack: err.stack,
    source: 'DatabaseService',
    category: 'database',
    endpoint: 'GET /api/users',
    projectId,
    organizationId,
  });
  res.json({ triggered: true, errorId, type: 'fatal-db', message: err.message });
});

// Simulate: Validation error
testErrorRoutes.post('/validation-error', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  const err = new Error('ValidationError: "email" must be a valid email — received "not-an-email"');
  (err as any).stack = `ValidationError: "email" must be a valid email — received "not-an-email"
    at Validator.validate (src/utils/validator.ts:34:13)
    at UserController.register (src/controllers/UserController.ts:22:18)
    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)`;

  const errorId = await ErrorLogger.logError({
    level: 'WARN',
    message: err.message,
    stack: err.stack,
    source: 'Validator',
    category: 'validation',
    endpoint: 'POST /api/auth/register',
    projectId,
    organizationId,
  });
  res.json({ triggered: true, errorId, type: 'validation', message: err.message });
});

// Simulate: Unhandled promise rejection
testErrorRoutes.post('/unhandled-rejection', async (req: Request, res: Response) => {
  const { projectId, organizationId } = req.body;
  const err = new Error('UnhandledPromiseRejection: Redis ECONNREFUSED 127.0.0.1:6379 — cache service unavailable');
  (err as any).stack = `Error: UnhandledPromiseRejection: Redis ECONNREFUSED 127.0.0.1:6379
    at CacheService.get (src/services/cache/CacheService.ts:45:11)
    at SessionManager.getSession (src/services/session/SessionManager.ts:18:26)
    at AuthMiddleware.validateSession (src/middleware/auth.ts:56:14)`;

  const errorId = await ErrorLogger.logError({
    level: 'ERROR',
    message: err.message,
    stack: err.stack,
    source: 'CacheService',
    category: 'network',
    endpoint: 'GET /api/session/validate',
    projectId,
    organizationId,
  });
  res.json({ triggered: true, errorId, type: 'cache-error', message: err.message });
});

// Get test context (projects + orgs for the test page dropdown)
testErrorRoutes.get('/context', async (_req: Request, res: Response) => {
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        projects: { select: { id: true, name: true } },
      },
    });
    res.json(orgs);
  } catch {
    res.json([]);
  }
});
