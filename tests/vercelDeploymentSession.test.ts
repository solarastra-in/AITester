import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createApp } from '../server/app.js';
import { resolveDataDir } from '../server/db.js';

describe('Vercel Serverless & Production Deployment Reliability', () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-vercel-test-'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resolves DATA_DIR to os.tmpdir() when running under Vercel', () => {
    delete process.env.DATA_DIR;
    process.env.VERCEL = '1';
    const resolved = resolveDataDir();
    expect(resolved.startsWith(os.tmpdir())).toBe(true);
  });

  it('successfully completes /api/auth/google-session and issues a JWT token in Vercel environment', async () => {
    process.env.VERCEL = '1';
    process.env.NODE_ENV = 'production';
    process.env.DATA_DIR = path.join(tmpDir, 'data');

    const app = createApp();

    // 1. Post to /api/auth/google-session with a new Google user
    const googleUserPayload = {
      uid: 'google-uid-prod-12345',
      email: 'production.user@whyor.in',
      name: 'Production Deployer',
    };

    const res = await request(app)
      .post('/api/auth/google-session')
      .send(googleUserPayload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({
      email: 'production.user@whyor.in',
      name: 'Production Deployer',
    });

    const token = res.body.token;

    // 2. Verify subsequent authenticated request works with the minted Bearer token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('production.user@whyor.in');
  });

  it('handles existing user email reconciliation in /api/auth/google-session without 500 error', async () => {
    process.env.VERCEL = '1';
    process.env.NODE_ENV = 'production';
    process.env.DATA_DIR = path.join(tmpDir, 'data');

    const app = createApp();

    // Attempt sync with an existing seed email (e.g. admin@verity.dev)
    const res = await request(app)
      .post('/api/auth/google-session')
      .send({
        uid: 'google-admin-uid-999',
        email: 'admin@verity.dev',
        name: 'Platform Superadmin',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('admin@verity.dev');
  });
});
