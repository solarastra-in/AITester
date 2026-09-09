import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db } from '../server/db.js';
import { AuthMiddleware, authMiddleware, AuthRequest, generateToken, JWT_SECRET } from '../server/auth.js';
import { runTestCase, runHttp, runLoad, extractCredentialsToken, getAuthHeaders } from '../server/genericRunner.js';

describe('AuthMiddleware & Runner Credential Enforcement', () => {
  describe('AuthMiddleware', () => {
    function createTestApp() {
      const app = express();
      app.use(express.json());
      app.get('/api/protected', AuthMiddleware, (req: AuthRequest, res: Response) => {
        res.json({
          ok: true,
          userId: req.user?.id,
          token: req.token,
          authToken: req.authToken,
          hasCredentials: !!req.credentials,
          authorization: req.credentials?.authorization,
        });
      });
      return app;
    }

    it('rejects requests missing the Authorization header with 401', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authorization: Bearer/i);
    });

    it('rejects requests with malformed Authorization header (not Bearer) with 401', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authorization: Bearer/i);
    });

    it('rejects requests with empty Bearer token with 401', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/empty/i);
    });

    it('rejects requests with invalid JWT token with 401', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid.token.value');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired/i);
    });

    it('accepts valid JWT and populates req.token, req.authToken, req.credentials', async () => {
      const testUser = db.data.users[0];
      const validToken = generateToken(testUser);

      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.userId).toBe(testUser.id);
      expect(res.body.token).toBe(validToken);
      expect(res.body.authToken).toBe(validToken);
      expect(res.body.hasCredentials).toBe(true);
      expect(res.body.authorization).toBe(`Bearer ${validToken}`);
    });
  });

  describe('Execution Engine Credential Enforcement', () => {
    it('extractCredentialsToken correctly extracts token from options string, object, or dataset', () => {
      expect(extractCredentialsToken('my-token')).toBe('my-token');
      expect(extractCredentialsToken('Bearer my-bearer-token')).toBe('my-bearer-token');
      expect(extractCredentialsToken({ token: 'opt-token' })).toBe('opt-token');
      expect(extractCredentialsToken({ authToken: 'auth-token' })).toBe('auth-token');
      expect(extractCredentialsToken({ credentials: { token: 'cred-token' } })).toBe('cred-token');
      expect(extractCredentialsToken(undefined, { _authToken: 'dataset-token' })).toBe('dataset-token');
    });

    it('getAuthHeaders injects Authorization: Bearer <token> from callerToken', () => {
      const headers = getAuthHeaders({}, null, 'test-jwt-token');
      expect(headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('runTestCase strictly prevents unauthenticated calls when no credentials are provided', async () => {
      const testCase = {
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Unauthenticated Request',
              method: 'GET' as const,
              path: '/api/resource',
            },
          ],
        },
      };

      await expect(
        runTestCase(testCase, {}, 'https://api.github.com')
      ).rejects.toThrow(/Unauthenticated call prohibited/i);
    });

    it('runTestCase allows execution and enforces Bearer credentials when JWT token is passed', async () => {
      const testUser = db.data.users[0];
      const token = generateToken(testUser);

      const testCase = {
        type: 'http',
        spec: {
          requests: [
            {
              name: 'Authenticated Request',
              method: 'GET' as const,
              path: '/zen',
            },
          ],
        },
      };

      // Mock axios or run with a token against a public endpoint
      // We test that options with token does NOT throw the unauthenticated error
      const outcome = await runTestCase(testCase, {}, 'https://api.github.com', { token });
      expect(outcome).toBeDefined();
      expect(outcome.type).toBe('http');
      expect(outcome.requests?.[0]?.requestHeaders?.['Authorization']).toBe(`Bearer ${token}`);
    });

    it('runHttp strictly prohibits unauthenticated calls', async () => {
      const testCase = {
        spec: {
          requests: [
            {
              name: 'Unauthenticated Request',
              method: 'GET' as const,
              path: '/api/resource',
            },
          ],
        },
      };

      await expect(
        runHttp(testCase, {}, 'https://api.github.com')
      ).rejects.toThrow(/Unauthenticated call prohibited/i);
    });

    it('runLoad strictly prohibits unauthenticated calls', async () => {
      const testCase = {
        spec: {
          totalRequests: 1,
          concurrency: 1,
          request: {
            name: 'Unauthenticated Load',
            method: 'GET' as const,
            path: '/api/resource',
          },
        },
      };

      await expect(
        runLoad(testCase, {}, 'https://api.github.com')
      ).rejects.toThrow(/Unauthenticated call prohibited/i);
    });
  });
});
