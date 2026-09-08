import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * Regression test for a critical, complete authentication bypass found
 * while implementing a "look up user and select persona automatically"
 * feature request: POST /api/auth/switch-persona had NO auth check at
 * all — anyone, unauthenticated, could log in as ANY real user in the
 * database just by supplying their email, no password required. A
 * companion endpoint (GET /api/auth/demo-personas) leaked every real
 * user's email/name/role/credits balance the same way, with no auth
 * check either.
 *
 * Fixed so that:
 *   - the four intentionally-public demo accounts (used by the "Switch
 *     Journey Persona" UI feature) still work for anyone, unauthenticated
 *     — that's the feature working as designed, not a bug
 *   - logging in as, or listing, any OTHER real user now requires the
 *     caller to already be authenticated as platform_admin (a standard,
 *     legitimate "admin login-as" support tool, not an open bypass)
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let platformAdminToken: string;
let newRealUserEmail: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-persona-switch-security-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@verity.dev', password: 'admin123!' });
  platformAdminToken = adminLogin.body.token;

  // A genuinely new, real user — NOT one of the four curated demo
  // accounts — to prove the fix blocks access to accounts outside that
  // allowlist, not just accounts that happen not to exist.
  newRealUserEmail = `real.customer.${Date.now()}@example.com`;
  const reg = await request(app).post('/api/auth/register-standalone').send({
    email: newRealUserEmail,
    password: 'a-real-password-123!',
    name: 'Real Customer',
  });
  expect(reg.status).toBe(201);
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/auth/switch-persona — the four public demo accounts', () => {
  it('unauthenticated: can still switch into a curated demo account (the feature working as intended)', async () => {
    const res = await request(app).post('/api/auth/switch-persona').send({ email: 'developer@indie.io' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('developer@indie.io');
  });

  it('unauthenticated: can still switch by role among the demo accounts', async () => {
    const res = await request(app).post('/api/auth/switch-persona').send({ targetRole: 'platform_admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('platform_admin');
  });
});

describe('POST /api/auth/switch-persona — real accounts outside the demo allowlist', () => {
  it('unauthenticated: REFUSES to log in as a real user outside the demo allowlist (the actual vulnerability)', async () => {
    const res = await request(app).post('/api/auth/switch-persona').send({ email: newRealUserEmail });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('authenticated as a non-admin: still refuses to switch into another real user', async () => {
    const demo = await request(app).post('/api/auth/switch-persona').send({ email: 'developer@indie.io' });
    const nonAdminToken = demo.body.token;

    const res = await request(app)
      .post('/api/auth/switch-persona')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ email: newRealUserEmail });
    expect(res.status).toBe(403);
  });

  it('authenticated as platform_admin: CAN look up and log in as any real user (legitimate admin login-as)', async () => {
    const res = await request(app)
      .post('/api/auth/switch-persona')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ email: newRealUserEmail });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(newRealUserEmail);
  });
});

describe('GET /api/auth/demo-personas — directory listing', () => {
  it('unauthenticated: only returns the curated demo accounts, not the full real user directory', async () => {
    const res = await request(app).get('/api/auth/demo-personas');
    expect(res.status).toBe(200);
    const emails = res.body.map((p: any) => p.email);
    expect(emails).toContain('developer@indie.io');
    expect(emails).not.toContain(newRealUserEmail);
  });

  it('unauthenticated: never leaks credit balances', async () => {
    const res = await request(app).get('/api/auth/demo-personas');
    for (const p of res.body) {
      expect(p.creditsBalance).toBeUndefined();
    }
  });

  it('authenticated as platform_admin: returns the full real user directory including the new account', async () => {
    const res = await request(app).get('/api/auth/demo-personas').set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    const emails = res.body.map((p: any) => p.email);
    expect(emails).toContain(newRealUserEmail);
  });
});
