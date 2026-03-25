import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

export interface SdkRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    platform: string;
    projectId: string | null;
    permissions: string[];
    organizationId: string;
  };
}

/**
 * Authenticate requests using API key (x-api-key header).
 * Used by external apps (websites, mobile, servers) instead of JWT.
 */
export const apiKeyAuth = async (req: SdkRequest, res: Response, next: NextFunction) => {
  try {
    // Accept API key from header or query param (query param for sendBeacon)
    const key = (req.headers['x-api-key'] as string) || (req.query._key as string);
    if (!key) {
      return res.status(401).json({ error: 'API key required. Set x-api-key header.' });
    }

    const apiKey = await prisma.apiKey.findUnique({ where: { key } });

    if (!apiKey || !apiKey.isActive) {
      return res.status(401).json({ error: 'Invalid or deactivated API key.' });
    }

    // Check allowed origins for web requests
    const origin = req.headers.origin || req.headers.referer;
    if (apiKey.allowedOrigins.length > 0 && origin) {
      const originHost = new URL(origin).origin;
      const allowed = apiKey.allowedOrigins.some(
        (o) => o === '*' || o === originHost || originHost.endsWith(o.replace('*', ''))
      );
      if (!allowed) {
        return res.status(403).json({ error: 'Origin not allowed for this API key.' });
      }
    }

    // Update usage stats (non-blocking)
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
    }).catch(() => {});

    req.apiKey = {
      id: apiKey.id,
      name: apiKey.name,
      platform: apiKey.platform,
      projectId: apiKey.projectId,
      permissions: apiKey.permissions,
      organizationId: apiKey.organizationId,
    };

    next();
  } catch {
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Check if the API key has a specific permission.
 */
export const requirePermission = (...perms: string[]) => {
  return (req: SdkRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // If permissions array is empty, allow all (legacy keys)
    if (req.apiKey.permissions.length === 0) return next();

    const hasPermission = perms.some((p) => req.apiKey!.permissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({ error: `API key missing required permission: ${perms.join(' or ')}` });
    }
    next();
  };
};
