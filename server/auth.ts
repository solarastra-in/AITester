import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { User, UserRole } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'verity-super-secure-jwt-signing-secret-2026';

export interface AuthRequest extends Request {
  user?: User;
  currentUser?: User;
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
    req.currentUser = user;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/**
 * Security middleware layer on the API service to check currentUser permissions
 * before returning any test case data.
 * If a user is not authorized or logged in, returns a 403 Forbidden status.
 */
export function checkTestCaseSecurity(req: AuthRequest, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  // If user is not logged in / no token provided -> 403 Forbidden
  if (!token) {
    return res.status(403).json({
      error: 'Forbidden: Authentication required. User is not logged in or authorized to access test case data.',
      status: 403,
    });
  }

  let user: User | undefined;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; role: UserRole };
    user = db.findUserById(payload.id);
  } catch {
    return res.status(403).json({
      error: 'Forbidden: Invalid or expired authentication credentials.',
      status: 403,
    });
  }

  if (!user) {
    return res.status(403).json({
      error: 'Forbidden: User session expired or user no longer exists.',
      status: 403,
    });
  }

  req.user = user;
  req.currentUser = user;

  // Check target project permissions if a project ID is specified in params or query
  const projectId = (req.params.projectId || req.params.id || req.query.projectId) as string | undefined;
  if (projectId && projectId !== 'all') {
    const project = db.findProjectById(projectId);
    if (project) {
      const isOwner = project.ownerUserId === user.id;
      const isSameOrg = !!(project.orgId && user.orgId && project.orgId === user.orgId);
      const isSuperAdmin = user.role === 'platform_admin';

      if (!isOwner && !isSameOrg && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Forbidden: You do not have permission to view or manage test cases for this project.',
          status: 403,
        });
      }
      (req as any).project = project;
      (req as any).dataset = project.dataset || {};
    }
  }

  next();
}

export const checkTestCasePermissions = checkTestCaseSecurity;

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
