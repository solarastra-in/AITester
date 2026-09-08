import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * End-to-end proof that the SSRF fix in server/routes/projectRoutes.ts
 * actually blocks a real request through the real, authenticated route —
 * not just a unit test of the guard function in isolation (see
 * tests/ssrfGuard.test.ts for that). This is the CUJ that matters: "a
 * signed-in user tries to point a project at an internal/cloud-metadata
 * address."
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let token: string;
let stopScheduler: () => void;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-ssrf-cuj-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  stopScheduler = stop;

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);

  const loginRes = await request(app).post('/api/auth/login').send({ email: 'developer@indie.io', password: 'indie123!' });
  token = loginRes.body.token;
});

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SSRF protection on real project-creation CUJ', () => {
  it('refuses to create a project targeting the cloud metadata endpoint', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Metadata Probe', siteUrl: 'http://169.254.169.254/latest/meta-data/' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/private|internal/i);
  });

  it('refuses to create a project targeting localhost (the server\'s own admin API)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Self Probe', siteUrl: 'http://localhost/api/admin' });

    expect(res.status).toBe(400);
  });

  it('refuses to create a project targeting an internal RFC1918 address', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Internal Probe', siteUrl: 'http://10.0.0.5:8080/' });

    expect(res.status).toBe(400);
  });

  it('still allows a real, legitimate public target', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Legit Project', siteUrl: 'https://registry.npmjs.org' });

    expect(res.status).toBe(201);
    expect(res.body.siteUrl).toBe('https://registry.npmjs.org');
  });

  it('also blocks the alternate build-journey project-creation path', async () => {
    const res = await request(app)
      .post('/api/projects/build-journey')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'http://169.254.169.254/latest/meta-data/', projectName: 'Journey Metadata Probe' });

    expect(res.status).toBe(400);
  });
});
