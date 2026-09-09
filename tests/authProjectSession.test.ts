import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { db } from '../server/db';
import { generateToken, verifyJwtPayload, JWT_SECRET } from '../server/auth';
import { isJwtExpired } from '../src/services/api';
import jwt from 'jsonwebtoken';

describe('Authentication & Project Creation Resilience', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
  });

  describe('JWT Expiry & Validation Logic', () => {
    it('detects missing or malformed tokens as expired', () => {
      expect(isJwtExpired(null)).toBe(true);
      expect(isJwtExpired(undefined)).toBe(true);
      expect(isJwtExpired('')).toBe(true);
      expect(isJwtExpired('not-a-jwt')).toBe(true);
      expect(isJwtExpired('a.b')).toBe(true);
    });

    it('identifies expired tokens accurately', () => {
      const expiredToken = jwt.sign(
        { id: 'user_123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 100 },
        JWT_SECRET
      );
      expect(isJwtExpired(expiredToken)).toBe(true);
    });

    it('identifies valid tokens within lifetime as not expired', () => {
      const validToken = jwt.sign(
        { id: 'user_123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
        JWT_SECRET
      );
      expect(isJwtExpired(validToken)).toBe(false);
    });

    it('respects leeway buffer near expiration', () => {
      // Expires in 15 seconds, default leeway is 30 seconds -> treated as expired for proactive refresh
      const nearExpiryToken = jwt.sign(
        { id: 'user_123', email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 15 },
        JWT_SECRET
      );
      expect(isJwtExpired(nearExpiryToken, 30)).toBe(true);
      expect(isJwtExpired(nearExpiryToken, 5)).toBe(false);
    });
  });

  describe('Server-Side Authentication & Project Creation Flow', () => {
    it('fails project creation with 401 when unauthenticated or token is missing', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          name: 'Target App',
          siteUrl: 'https://example.com',
          description: 'Automated test suite',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('fails project creation with 401 when token is forged or invalid', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', 'Bearer totally-invalid-token')
        .send({
          name: 'Target App',
          siteUrl: 'https://example.com',
          description: 'Automated test suite',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or expired authentication token');
    });

    it('allows Google session sync and subsequent project creation seamlessly', async () => {
      const testEmail = 'tester.session@example.com';
      const testUid = 'fb_user_' + Date.now();

      // 1. Sync session via Google Auth endpoint (client-side simulation)
      const syncRes = await request(app)
        .post('/api/auth/google-session')
        .send({
          uid: testUid,
          email: testEmail,
          name: 'Session Tester',
        });

      expect(syncRes.status).toBe(200);
      expect(syncRes.body.token).toBeDefined();
      const token = syncRes.body.token;

      // 2. Create project using the obtained Bearer token
      const createRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Session Resilience Target',
          siteUrl: 'https://example.org',
          description: 'Resilient test project',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.name).toBe('Session Resilience Target');
      expect(createRes.body.siteUrl).toBe('https://example.org');
      const projectId = createRes.body.id;

      // 3. Load project details with Bearer token
      const getRes = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(projectId);

      // 4. Load analytics with Bearer token
      const analyticsRes = await request(app)
        .get(`/api/projects/${projectId}/analytics?days=14`)
        .set('Authorization', `Bearer ${token}`);

      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.summary).toBeDefined();
    });

    it('verifies fallback dev key in verifyJwtPayload when in development mode', () => {
      const payload = { id: 'dev_user_1', email: 'dev@verity.dev', role: 'developer' as const };
      const devToken = jwt.sign(payload, 'INSECURE-DEV-ONLY-DEFAULT-DO-NOT-USE-IN-PRODUCTION', { expiresIn: '1h' });
      const verified = verifyJwtPayload(devToken);
      expect(verified.id).toBe('dev_user_1');
      expect(verified.email).toBe('dev@verity.dev');
    });
  });
});
