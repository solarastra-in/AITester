import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { User, UserRole } from './types.js';

// SECURITY: refuse to start in production without a real, operator-provided
// signing secret. The previous unconditional fallback
// ('verity-super-secure-jwt-signing-secret-2026') was a hardcoded string
// committed to source control since this repo's very first commit — anyone
// who has ever read this file could mint a valid JWT for ANY user, including
// platform_admin, against any deployment that never explicitly set
// JWT_SECRET. Because .env.example never documented this variable, that is
// the likely state of any deployment made before this fix. Rotate
// JWT_SECRET immediately in every live environment after this change ships
// — this fix stops new tokens from using the weak secret, but it cannot
// invalidate tokens that may already have been minted with it.
const isProduction = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET;

if (isProduction && !configuredSecret) {
  throw new Error(
    'JWT_SECRET environment variable is required in production. Refusing to start with an insecure default signing secret — set JWT_SECRET and redeploy.'
  );
}

if (!configuredSecret && !isProduction) {
  // eslint-disable-next-line no-console
  console.warn(
    '[SECURITY WARNING] JWT_SECRET is not set. Using an insecure development-only default signing secret. ' +
      'This is fine for local development but this process will refuse to start with NODE_ENV=production unless JWT_SECRET is set.'
  );
}

export const JWT_SECRET = configuredSecret || 'INSECURE-DEV-ONLY-DEFAULT-DO-NOT-USE-IN-PRODUCTION';

export interface AuthCredentials {
  token: string;
  user: User;
  authorization: string;
}

export interface AuthRequest extends Request {
  user?: User;
  currentUser?: User;
  token?: string;
  authToken?: string;
  credentials?: AuthCredentials;
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

/**
 * Verifies a raw bearer token and returns the resolved user, or null if the
 * token is missing/invalid/expired or the user no longer exists. Shared so
 * that other modules (e.g. the persona-switch security check in
 * authRoutes.ts) verify tokens the exact same way requireAuth does, rather
 * than each re-implementing JWT verification against a separately-resolved
 * JWT_SECRET.
 */
export function verifyBearerToken(rawToken: string | undefined | null): User | null {
  if (!rawToken) return null;
  try {
    const payload = jwt.verify(rawToken, JWT_SECRET) as { id: string; email?: string; role?: UserRole };
    let user = db.findUserById(payload.id);
    if (!user && payload.email) {
      user = db.findUserByEmail(payload.email);
    }
    return user || null;
  } catch {
    return null;
  }
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
    monthlyCreditLimit: user.monthlyCreditLimit ?? null,
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
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; role?: UserRole; email?: string; name?: string };
    let user = db.findUserById(payload.id);
    if (!user && payload.email) {
      user = db.findUserByEmail(payload.email);
    }
    // SECURITY: reject, never auto-create. requireAuth is the primary
    // authentication gate wired into nearly every protected route in the
    // app — a validly-signed token referencing a user ID that doesn't
    // exist must be rejected, not used to silently create a brand-new
    // account with a role taken directly from the token's own payload.
    // That combination (any valid signature + self-declared role) is a
    // privilege-escalation primitive, not a convenience. New users are
    // already provisioned correctly and safely elsewhere: standard
    // registration (POST /api/auth/register-standalone), organization
    // onboarding (POST /api/admin/organizations, POST /api/org/members),
    // and Google sign-in (POST /api/auth/google-session, which hardcodes
    // role: 'standalone' and only ever runs for a UID/email pair the
    // client actually authenticated with Google/Firebase) — none of them
    // need or use this fallback.
    if (!user) {
      return res.status(401).json({ error: 'User session expired or no longer exists.' });
    }
    req.user = user;
    req.currentUser = user;
    req.token = token;
    req.authToken = token;
    req.credentials = {
      token,
      user,
      authorization: `Bearer ${token}`,
    };
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

/**
 * AuthMiddleware validates JWTs from the 'Authorization: Bearer <token>' header
 * and attaches verified credentials (token, user, authorization) to the request context.
 * Downstream execution engines strictly use these credentials for outgoing requests
 * rather than performing unauthenticated calls.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || (!authHeader.startsWith('Bearer ') && authHeader !== 'Bearer')) {
    return res.status(401).json({
      error: "Authentication required. No Bearer token provided or malformed 'Authorization: Bearer <token>' header.",
      status: 401,
    });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({
      error: "Authentication required. Token in 'Authorization: Bearer <token>' header is empty.",
      status: 401,
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; role?: UserRole; email?: string; name?: string };
    let user = db.findUserById(payload.id);
    if (!user && payload.email) {
      user = db.findUserByEmail(payload.email);
    }
    // SECURITY: a validly-signed token whose user no longer exists (or
    // never existed) is REJECTED, not auto-provisioned. The previous
    // version of this function created a brand-new user record here —
    // with a role taken directly from the token's own (attacker-
    // controllable, if the token were ever forged or a stale/leaked
    // signing key reused) payload — and granted it access in the same
    // request. That's a privilege-escalation / persistent-backdoor
    // primitive, not a session-recovery convenience. If a user's account
    // was legitimately deleted, they need to register/be re-invited
    // through the real onboarding flow, not silently reappear via a
    // stale token.
    if (!user) {
      return res.status(401).json({
        error: 'User session expired or user no longer exists.',
        status: 401,
      });
    }

    req.user = user;
    req.currentUser = user;
    req.token = token;
    req.authToken = token;
    req.credentials = {
      token,
      user,
      authorization: `Bearer ${token}`,
    };

    next();
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired authentication token.',
      status: 401,
    });
  }
}

export const AuthMiddleware = authMiddleware;

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
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; role?: UserRole; email?: string; name?: string };
    user = db.findUserById(payload.id);
    if (!user && payload.email) {
      user = db.findUserByEmail(payload.email);
    }
    // SECURITY: same reasoning as requireAuth above — reject rather than
    // auto-create a user (with an attacker/self-declared role) for a
    // validly-signed token referencing a nonexistent ID.
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
  req.token = token;
  req.authToken = token;
  req.credentials = {
    token,
    user,
    authorization: `Bearer ${token}`,
  };

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
