import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';

export const authRoutes = Router();

function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: crypto.randomUUID() }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
}

function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7); // matches JWT_REFRESH_EXPIRES_IN default of 7d
  return d;
}

// Register organization + admin user
authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { orgName, email, password, name } = req.body;

    if (!orgName || !email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const passwordHash = await bcrypt.hash(password, 12);

    const org = await prisma.organization.create({
      data: {
        name: orgName,
        slug,
        users: {
          create: { email, passwordHash, name, role: 'SUPER_ADMIN' },
        },
      },
      include: { users: true },
    });

    const user = org.users[0];
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: refreshTokenExpiresAt() },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      token: accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: org.id, name: org.name, slug: org.slug },
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: refreshTokenExpiresAt() },
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug },
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh access token using HttpOnly cookie
authRoutes.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as { userId: string };
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    // Rotate: revoke old, issue new
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } }),
      prisma.refreshToken.create({
        data: { token: newRefreshToken, userId: decoded.userId, expiresAt: refreshTokenExpiresAt() },
      }),
    ]);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const accessToken = generateAccessToken(decoded.userId);
    res.json({ token: accessToken });
  } catch {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout — revoke refresh token
authRoutes.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }
    res.clearCookie('refreshToken');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
authRoutes.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { organization: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan },
  });
});

// Invite user to organization (admin only)
authRoutes.post('/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { email, name, role, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: role || 'AGENT',
        passwordHash,
        organizationId: req.user!.organizationId,
      },
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch {
    res.status(500).json({ error: 'Invite failed' });
  }
});
