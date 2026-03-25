import { Request, Response, NextFunction } from 'express';
import { ErrorLogger } from '../services/logging/ErrorLogger';
import { AuthRequest } from './auth';

export const errorHandler = async (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const authReq = req as AuthRequest;

  // Log the error with Gemini analysis
  try {
    await ErrorLogger.logError({
      level: 'ERROR',
      message: err.message,
      stack: err.stack,
      source: 'express-middleware',
      endpoint: `${req.method} ${req.path}`,
      userId: authReq.user?.id,
      organizationId: authReq.user?.organizationId,
      requestData: {
        query: req.query,
        params: req.params,
        // Never log passwords or tokens
        body: sanitizeBody(req.body),
      },
    });
  } catch (logErr) {
    console.error('Failed to log error:', logErr);
  }

  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '***REDACTED***';
    }
  }
  return sanitized;
}
