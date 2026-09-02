import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { User, UserRole } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'verity-super-secure-jwt-signing-secret-2026';

export interface AuthRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      teamId: user.teamId,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
    teamId: user.teamId,
    creditsBalance: user.creditsBalance,
    mustResetPassword: !!user.mustResetPassword,
    createdAt: user.createdAt,
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No Bearer token or token query provided.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; role: UserRole };
    const user = db.findUserById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User session expired or user no longer exists.' });
    }
    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role "${req.user.role}" is not authorized for this operation. Required: [${allowedRoles.join(', ')}]`,
      });
    }
    next();
  };
}
