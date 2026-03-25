import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { SqlConnector } from '../services/sql/SqlConnector';
import { SqlSafetyGuard } from '../services/sql/SqlSafetyGuard';
import { SqlQueryGenerator, GeneratedQuery } from '../services/ai/SqlQueryGenerator';
import { GeminiClient } from '../services/ai/GeminiClient';
import { ErrorLogger } from '../services/logging/ErrorLogger';

export const dbConnectionRoutes = Router();
dbConnectionRoutes.use(authenticate);

const connectorPool = new Map<string, SqlConnector>();
const sqlGenerator = new SqlQueryGenerator(new GeminiClient());

// List DB connections
dbConnectionRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const connections = await prisma.databaseConnection.findMany({
    where: { organizationId: req.user!.organizationId },
    select: { id: true, name: true, host: true, port: true, database: true, dbType: true, isActive: true },
  });
  res.json(connections);
});

// Add a DB connection (admin only)
dbConnectionRoutes.post('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, host, port, database, username, password, dbType } = req.body;

    // Test connection first
    const connector = new SqlConnector();
    await connector.connect({ host, port: port || 1433, database, username, password });
    const testOk = await connector.testConnection();
    await connector.disconnect();

    if (!testOk) {
      return res.status(400).json({ error: 'Could not connect to database' });
    }

    const conn = await prisma.databaseConnection.create({
      data: {
        name,
        host,
        port: port || 1433,
        database,
        username,
        passwordEnc: password, // TODO: encrypt with AES in production
        dbType: dbType || 'mssql',
        organizationId: req.user!.organizationId,
      },
    });

    res.status(201).json({ id: conn.id, name: conn.name, host: conn.host, database: conn.database });
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR', message: (err as Error).message, source: 'db-connection-create',
      organizationId: req.user!.organizationId, userId: req.user!.id,
    });
    res.status(500).json({ error: 'Failed to add connection' });
  }
});

// Execute a query
dbConnectionRoutes.post('/:id/query', async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.body;
    const connId = req.params.id;

    // Safety check
    const safety = SqlSafetyGuard.validate(query);
    if (!safety.safe) {
      return res.status(400).json({ error: `Query blocked: ${safety.reason}`, blockedKeywords: safety.blockedKeywords });
    }

    // Get or create connector
    let connector = connectorPool.get(connId);
    if (!connector) {
      const dbConn = await prisma.databaseConnection.findFirst({
        where: { id: connId, organizationId: req.user!.organizationId },
      });
      if (!dbConn) return res.status(404).json({ error: 'Connection not found' });

      connector = new SqlConnector();
      await connector.connect({
        host: dbConn.host,
        port: dbConn.port,
        database: dbConn.database,
        username: dbConn.username,
        password: dbConn.passwordEnc,
      });
      connectorPool.set(connId, connector);
    }

    const result = await connector.executeQuery(query);
    res.json(result);
  } catch (err) {
    await ErrorLogger.logError({
      level: 'ERROR', message: (err as Error).message, stack: (err as Error).stack,
      source: 'sql-query-execute', endpoint: `POST /api/db-connections/${req.params.id}/query`,
      organizationId: req.user!.organizationId, userId: req.user!.id,
    });
    res.status(500).json({ error: 'Query execution failed' });
  }
});

// Generate SQL from natural language
dbConnectionRoutes.post('/:id/generate-sql', async (req: AuthRequest, res: Response) => {
  try {
    const { request, schemaContext } = req.body;
    const generated = await sqlGenerator.generate(request, schemaContext);

    // Validate the generated query
    const safety = SqlSafetyGuard.validate(generated.query);

    res.json({ ...generated, safe: safety.safe, safetyReason: safety.reason });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate SQL' });
  }
});

// Delete connection
dbConnectionRoutes.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  const connector = connectorPool.get(req.params.id);
  if (connector) {
    await connector.disconnect();
    connectorPool.delete(req.params.id);
  }

  await prisma.databaseConnection.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
