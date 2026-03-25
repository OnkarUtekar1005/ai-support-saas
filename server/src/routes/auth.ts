import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { authenticate, AuthRequest } from '../middleware/auth';

export const authRoutes = Router();

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
          create: {
            email,
            passwordHash,
            name,
            role: 'SUPER_ADMIN',
          },
        },
      },
      include: { users: true },
    });

    const user = org.users[0];
    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    res.status(201).json({
      token,
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

    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug },
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
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
    if (req.user!.role !== 'ADMIN') {
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
