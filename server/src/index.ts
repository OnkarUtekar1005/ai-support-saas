import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { ticketRoutes } from './routes/tickets';
import { chatRoutes } from './routes/chat';
import { dbConnectionRoutes } from './routes/dbConnections';
import { errorLogRoutes } from './routes/errorLogs';
import { adminRoutes } from './routes/admin';
import { systemConfigRoutes } from './routes/systemConfig';
import { projectRoutes } from './routes/projects';
import { contactRoutes } from './routes/contacts';
import { companyRoutes } from './routes/companies';
import { dealRoutes } from './routes/deals';
import { activityRoutes } from './routes/activities';
import { sdkRoutes } from './routes/sdk';
import { apiKeyRoutes } from './routes/apiKeys';
import { sdkScriptRoutes } from './routes/sdkScript';
import { pipelineRoutes } from './routes/pipeline';
import { agentWebhookRoutes } from './routes/agentWebhook';
import { widgetScriptRoutes } from './routes/widgetScript';
import { widgetRoutes } from './routes/widget';
import { chatbotConfigRoutes } from './routes/chatbotConfig';
import { errorHandler } from './middleware/errorHandler';
import { ErrorLogger } from './services/logging/ErrorLogger';
import { setupSocketHandlers } from './controllers/socketController';
import { prisma } from './utils/prisma';

const app = express();
const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Global middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable CSP for test pages (widget injects styles/scripts)
}));
// CORS: allow CRM dashboard + any origin for SDK/widget endpoints
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (file://, mobile apps, curl)
    if (!origin) return callback(null, true);
    // Always allow the CRM dashboard
    if (origin === config.clientUrl) return callback(null, true);
    // Allow all origins for /api/sdk, /api/widget, /sdk.js, /widget.js
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/db-connections', dbConnectionRoutes);
app.use('/api/error-logs', errorLogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/system-config', systemConfigRoutes);

// CRM routes
app.use('/api/projects', projectRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/activities', activityRoutes);

// SDK routes (API key auth — for external apps)
app.use('/api/sdk', sdkRoutes);
app.use('/api/api-keys', apiKeyRoutes);
// Agent webhook MUST be registered BEFORE pipeline routes (no JWT auth)
app.use('/api/agent-webhook', agentWebhookRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/chatbot-config', chatbotConfigRoutes);
app.use('/', sdkScriptRoutes);  // serves /sdk.js
app.use('/', widgetScriptRoutes); // serves /widget.js

// Serve test website at /test
app.use('/test', express.static(path.resolve(process.cwd(), '../test-website')));

// WebSocket handlers
setupSocketHandlers(io);

// Global error handler (logs errors + sends to Gemini for analysis)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down...');
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
});

httpServer.listen(config.port, () => {
  console.log(`🚀 AI Support SaaS server running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export { io };
