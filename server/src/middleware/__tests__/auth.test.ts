import { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, isAdminRole, AuthRequest } from '../auth';

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../../utils/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    projectMember: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import jwt from 'jsonwebtoken';
import { prisma } from '../../utils/prisma';

const mockVerify = jwt.verify as jest.MockedFunction<typeof jwt.verify>;
const mockFindUnique = (prisma.user.findUnique as jest.MockedFunction<any>);

function makeRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function makeReq(authHeader?: string): AuthRequest {
  return {
    headers: { authorization: authHeader },
  } as any;
}

describe('authenticate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq();
    const res = makeRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid (jwt.verify throws)', async () => {
    mockVerify.mockImplementation(() => { throw new Error('invalid token'); });
    const req = makeReq('Bearer bad-token');
    const res = makeRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });

  it('returns 401 when user is not found in DB', async () => {
    mockVerify.mockReturnValue({ userId: 'user-123' } as any);
    mockFindUnique.mockResolvedValue(null);
    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('sets req.user and calls next() on success', async () => {
    const user = { id: 'user-1', email: 'a@b.com', name: 'Alice', role: 'AGENT', organizationId: 'org-1' };
    mockVerify.mockReturnValue({ userId: 'user-1' } as any);
    mockFindUnique.mockResolvedValue(user);
    const req = makeReq('Bearer good-token');
    const res = makeRes();
    await authenticate(req, res, next);
    expect((req as AuthRequest).user).toEqual(user);
    expect(next).toHaveBeenCalled();
  });
});

describe('requireRole middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  function makeAuthReq(role: string): AuthRequest {
    return { user: { id: '1', email: 'x', name: 'x', role, organizationId: 'org-1' }, headers: {} } as any;
  }

  it('SUPER_ADMIN bypasses all role checks', () => {
    const req = makeAuthReq('SUPER_ADMIN');
    const res = makeRes();
    requireRole('ADMIN')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes when role matches the required role', () => {
    const req = makeAuthReq('ADMIN');
    const res = makeRes();
    requireRole('ADMIN')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when role does not match', () => {
    const req = makeAuthReq('VIEWER');
    const res = makeRes();
    requireRole('ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not set on req', () => {
    const req = { headers: {} } as AuthRequest;
    const res = makeRes();
    requireRole('ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows any role in the permitted list', () => {
    const req = makeAuthReq('AGENT');
    const res = makeRes();
    requireRole('ADMIN', 'AGENT')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('isAdminRole', () => {
  it('returns true for SUPER_ADMIN', () => {
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
  });

  it('returns true for ADMIN', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
  });

  it('returns false for AGENT', () => {
    expect(isAdminRole('AGENT')).toBe(false);
  });

  it('returns false for VIEWER', () => {
    expect(isAdminRole('VIEWER')).toBe(false);
  });
});
