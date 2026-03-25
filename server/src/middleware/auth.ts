import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Role hierarchy: SUPER_ADMIN > ADMIN > AGENT > VIEWER
 * SUPER_ADMIN can do everything
 * ADMIN can manage their assigned projects
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    // SUPER_ADMIN can always pass
    if (req.user.role === 'SUPER_ADMIN') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Only SUPER_ADMIN can access
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
};

/**
 * Check if user is SUPER_ADMIN or ADMIN
 */
export function isAdminRole(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/**
 * For project-scoped data: SUPER_ADMIN sees all, ADMIN sees only their projects.
 * Returns an array of project IDs the user can access, or null (meaning all).
 */
export async function getUserProjectIds(userId: string, role: string): Promise<string[] | null> {
  // SUPER_ADMIN sees everything
  if (role === 'SUPER_ADMIN') return null;

  // ADMIN sees only projects they are members of
  if (role === 'ADMIN') {
    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    return memberships.map((m) => m.projectId);
  }

  // AGENT/VIEWER — same as ADMIN (project-scoped)
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}
