import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { UserRole } from '../types.js';
import { JWT_SECRET, AuthRequest } from '../auth.js';

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
    if (!user && payload.id) {
      user = {
        id: payload.id,
        email: payload.email || 'user@verity.dev',
        name: payload.name || 'Authenticated User',
        passwordHash: '',
        role: payload.role || 'standalone',
        creditsBalance: 100,
        createdAt: new Date().toISOString(),
      };
      db.data.users.push(user);
      db.save();
    }
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
