import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * IMPORTANT: db, auth, and genericRunner are imported dynamically inside
 * beforeAll, AFTER process.chdir(tmpDir) — not as static top-level imports.
 * This file previously imported `db` statically, which meant server/db.js's
 * module-level `export const db = new Database()` read (and, on any write,
 * would have overwritten) the REAL, git-tracked data/verity-db.json instead
 * of an isolated temp directory, since static imports are evaluated before
 * any beforeAll() runs. This is the same class of bug found and fixed
 * earlier in tests/testCasesSecurity.test.ts. No test in this specific file
 * happened to trigger a db.save() before this fix, so it hadn't visibly
 * corrupted the real database yet — but it was one new test away from doing
 * so, and did not follow the isolation pattern every other test file in
 * this suite uses.
 */

let tmpDir: string;
let originalCwd: string;
let db: typeof import('../server/db.js')['db'];
let AuthMiddleware: typeof import('../server/auth.js')['AuthMiddleware'];
let requireAuth: typeof import('../server/auth.js')['requireAuth'];
let checkTestCaseSecurity: typeof import('../server/auth.js')['checkTestCaseSecurity'];
let generateToken: typeof import('../server/auth.js')['generateToken'];
let JWT_SECRET: typeof import('../server/auth.js')['JWT_SECRET'];
let runTestCase: typeof import('../server/genericRunner.js')['runTestCase'];
let runHttp: typeof import('../server/genericRunner.js')['runHttp'];
let runLoad: typeof import('../server/genericRunner.js')['runLoad'];
let extractCredentialsToken: typeof import('../server/genericRunner.js')['extractCredentialsToken'];
let getAuthHeaders: typeof import('../server/genericRunner.js')['getAuthHeaders'];

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-authmiddleware-test-'));
  process.chdir(tmpDir);

  ({ db } = await import('../server/db.js'));
  ({ AuthMiddleware, requireAuth, checkTestCaseSecurity, generateToken, JWT_SECRET } = await import('../server/auth.js'));
  ({ runTestCase, runHttp, runLoad, extractCredentialsToken, getAuthHeaders } = await import('../server/genericRunner.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/protected', (req, res, next) => AuthMiddleware(req as any, res, next), (req: any, res: Response) => {
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

describe('AuthMiddleware & Runner Credential Enforcement', () => {
  describe('AuthMiddleware', () => {
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

    it('SECURITY REGRESSION: rejects a validly-signed token for a user that does not exist, rather than auto-creating one', async () => {
      // A previous version of authMiddleware silently created a brand-new
      // user record — with a role taken directly from the token's own
      // payload — whenever a validly-signed token referenced a
      // non-existent user ID, then granted that request access
      // immediately. That's a privilege-escalation / persistent-backdoor
      // primitive: anyone able to produce a validly-signed token (e.g. via
      // a leaked/reused/default signing key) referencing an ID that
      // doesn't exist could mint themselves a fresh platform_admin
      // account just by claiming role: 'platform_admin' in the payload.
      const forgedPayload = {
        id: 'usr_does_not_exist_' + Date.now(),
        role: 'platform_admin',
        email: 'attacker@example.com',
      };
      const forgedToken = jwt.sign(forgedPayload, JWT_SECRET, { expiresIn: '1h' });

      const usersBefore = db.data.users.length;
      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired|no longer exists/i);
      // No new user must have been created as a side effect of this request.
      expect(db.data.users.length).toBe(usersBefore);
      expect(db.data.users.some(u => u.id === forgedPayload.id)).toBe(false);
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

  describe('Target-application config: TARGET_APP_JWT_SECRET / TARGET_APP_API_BASE_URL / TARGET_APP_CORS_ORIGIN', () => {
    it('signs an outgoing token for the TARGET app using TARGET_APP_JWT_SECRET, and it is verifiable with that same secret (not Verity\'s own JWT_SECRET)', () => {
      const targetSecret = 'the-target-applications-own-signing-secret';
      const headers = getAuthHeaders({ TARGET_APP_JWT_SECRET: targetSecret }, 'user');
      const token = headers['Authorization'].replace(/^Bearer\s+/, '');

      expect(() => jwt.verify(token, targetSecret)).not.toThrow();
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
    });

    it('legacy dataset key JWT_SECRET still works (backward compatibility for data saved before the rename)', () => {
      const targetSecret = 'legacy-key-still-works';
      const headers = getAuthHeaders({ JWT_SECRET: targetSecret }, 'user');
      const token = headers['Authorization'].replace(/^Bearer\s+/, '');
      expect(() => jwt.verify(token, targetSecret)).not.toThrow();
    });

    it('TARGET_APP_JWT_SECRET takes priority over the legacy JWT_SECRET key when both are present', () => {
      const newSecret = 'new-canonical-secret';
      const oldSecret = 'old-legacy-secret';
      const headers = getAuthHeaders({ TARGET_APP_JWT_SECRET: newSecret, JWT_SECRET: oldSecret }, 'user');
      const token = headers['Authorization'].replace(/^Bearer\s+/, '');
      expect(() => jwt.verify(token, newSecret)).not.toThrow();
      expect(() => jwt.verify(token, oldSecret)).toThrow();
    });

    it('a dataset-level TARGET_APP_JWT_SECRET has zero effect on Verity\'s own platform authentication', async () => {
      const testUser = db.data.users[0];
      const platformToken = generateToken(testUser);

      const app = createTestApp();
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${platformToken}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(testUser.id);
    });

    it('routes requests to TARGET_APP_API_BASE_URL when configured, taking priority over the legacy VITE_API_URL key', async () => {
      const testUser = db.data.users[0];
      const token = generateToken(testUser);
      const testCase = {
        type: 'http',
        spec: { requests: [{ name: 'req', method: 'GET' as const, path: '/api/test' }] },
      };
      const outcome = await runTestCase(
        testCase,
        { TARGET_APP_API_BASE_URL: 'https://registry.npmjs.org', VITE_API_URL: 'https://pypi.org' },
        'https://www.npmjs.com',
        { token }
      );
      expect(outcome.requests?.[0]?.url).toContain('registry.npmjs.org');
    });
  });

  describe('SECURITY REGRESSION (systemic sweep): the same auto-user-creation flaw existed in THREE separate auth functions, not just authMiddleware — requireAuth (the primary gate used across nearly every protected route) and checkTestCaseSecurity had the identical vulnerable pattern, plus an exact duplicate file (server/middleware/authMiddleware.ts, since deleted) that was never wired in but existed as a landmine', () => {
    it('requireAuth rejects a validly-signed token for a nonexistent user rather than auto-creating one — this is the most critical of the three, since requireAuth guards nearly every protected route in the app', async () => {
      const forgedPayload = { id: 'usr_forged_requireauth_' + Date.now(), role: 'platform_admin', email: 'attacker2@example.com' };
      const forgedToken = jwt.sign(forgedPayload, JWT_SECRET, { expiresIn: '1h' });

      const app = express();
      app.get('/api/protected', (req, res, next) => requireAuth(req as any, res, next), (req: any, res) => {
        res.json({ ok: true, userId: req.user?.id });
      });

      const usersBefore = db.data.users.length;
      const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(db.data.users.length).toBe(usersBefore);
      expect(db.data.users.some(u => u.id === forgedPayload.id)).toBe(false);
    });

    it('checkTestCaseSecurity rejects a validly-signed token for a nonexistent user rather than auto-creating one', async () => {
      const forgedPayload = { id: 'usr_forged_ctcs_' + Date.now(), role: 'platform_admin', email: 'attacker3@example.com' };
      const forgedToken = jwt.sign(forgedPayload, JWT_SECRET, { expiresIn: '1h' });

      const app = express();
      app.get('/api/test-cases', (req, res, next) => checkTestCaseSecurity(req as any, res, next), (req: any, res) => {
        res.json({ ok: true, userId: req.user?.id });
      });

      const usersBefore = db.data.users.length;
      const res = await request(app).get('/api/test-cases?projectId=all').set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(403);
      expect(db.data.users.length).toBe(usersBefore);
      expect(db.data.users.some(u => u.id === forgedPayload.id)).toBe(false);
    });

    it('requireAuth still works correctly for a real, existing user (not overcorrected into rejecting everyone)', async () => {
      const testUser = db.data.users[0];
      const realToken = generateToken(testUser);

      const app = express();
      app.get('/api/protected', (req, res, next) => requireAuth(req as any, res, next), (req: any, res) => {
        res.json({ ok: true, userId: req.user?.id });
      });

      const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${realToken}`);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(testUser.id);
    });
  });
});
