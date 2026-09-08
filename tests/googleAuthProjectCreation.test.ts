import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let stopScheduler: () => void;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-google-auth-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  stopScheduler = stop;

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);
});

afterAll(() => {
  if (stopScheduler) stopScheduler();
  process.chdir(originalCwd);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup
  }
});

describe('Google Auth and Project Creation Integration', () => {
  it('rejects unauthenticated project creation with 401 and descriptive message', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Unauthenticated Test Project',
        siteUrl: 'https://example.com',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authentication required');
    expect(res.body.error).toContain('No Bearer token');
  });

  it('provisions Google session and issues valid JWT token', async () => {
    const googleUser = {
      uid: 'google_uid_test_12345',
      email: 'tester.google@example.com',
      name: 'Google QA Engineer',
    };

    const res = await request(app)
      .post('/api/auth/google-session')
      .send(googleUser);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(googleUser.email);
    expect(res.body.user.name).toBe(googleUser.name);
    expect(res.body.user.creditsBalance).toBeGreaterThanOrEqual(100);

    const token = res.body.token;

    // Use the issued token to create a project
    const projectRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Google User Project',
        siteUrl: 'https://example.com',
        description: 'Automated test suite created by Google user',
      });

    expect(projectRes.status).toBe(201);
    expect(projectRes.body.id).toBeDefined();
    expect(projectRes.body.name).toBe('Google User Project');
    expect(projectRes.body.siteUrl).toBe('https://example.com');
    expect(projectRes.body.ownerUserId).toBe(googleUser.uid);
  });

  it('supports updating existing Google user profile on subsequent sessions', async () => {
    const googleUser = {
      uid: 'google_uid_test_12345',
      email: 'tester.google@example.com',
      name: 'Google QA Lead Engineer',
    };

    const res = await request(app)
      .post('/api/auth/google-session')
      .send(googleUser);

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Google QA Lead Engineer');

    // Token should still allow accessing /api/projects
    const token = res.body.token;
    const listRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(1);
  });
});
