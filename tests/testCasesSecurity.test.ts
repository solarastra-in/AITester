import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { checkTestCaseSecurity } from '../server/auth.js';
import { api, clearStoredToken } from '../src/services/api.js';

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let stopScheduler: () => void;

let indieToken = '';
let acmeAdminToken = '';
let platformAdminToken = '';
let acmeProjectId = '';

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-security-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  const { db } = await import('../server/db.js');
  stopScheduler = stop;

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);

  // Direct test-cases endpoint guarded by checkTestCaseSecurity middleware
  app.get('/api/test-cases', checkTestCaseSecurity, (req: any, res) => {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    const project = req.project || db.findProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const suites = db.data.suites.filter(s => s.projectId === project.id);
    const suiteIds = suites.map(s => s.id);
    const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));
    res.json({ cases, project });
  });

  // Login personas
  const indieRes = await request(app).post('/api/auth/login').send({
    email: 'developer@indie.io',
    password: 'indie123!',
  });
  expect(indieRes.status).toBe(200);
  indieToken = indieRes.body.token;

  const acmeRes = await request(app).post('/api/auth/login').send({
    email: 'qa.lead@acmecorp.com',
    password: 'acme123!',
  });
  expect(acmeRes.status).toBe(200);
  acmeAdminToken = acmeRes.body.token;

  const adminRes = await request(app).post('/api/auth/login').send({
    email: 'admin@verity.dev',
    password: 'admin123!',
  });
  expect(adminRes.status).toBe(200);
  platformAdminToken = adminRes.body.token;

  // Create an Acme Corp project with test cases
  const createProjRes = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${acmeAdminToken}`)
    .send({
      name: 'Acme Secret API',
      siteUrl: 'https://api.acme.corp',
      description: 'Acme internal services',
    });
  expect(createProjRes.status).toBe(201);
  acmeProjectId = createProjRes.body.id;

  // Create a test case in this project
  const createCaseRes = await request(app)
    .post(`/api/projects/${acmeProjectId}/cases`)
    .set('Authorization', `Bearer ${acmeAdminToken}`)
    .send({
      title: 'Confidential Payment Flow Test',
      type: 'api',
      severity: 'critical',
      spec: 'GET https://api.acme.corp/pay',
    });
  expect(createCaseRes.status).toBe(201);
});

afterAll(() => {
  if (stopScheduler) stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Security Middleware Layer for Test Cases', () => {
  it('returns 403 Forbidden when requesting test cases without an auth token', async () => {
    const res = await request(app).get(`/api/projects/${acmeProjectId}/cases`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it('returns 403 Forbidden when requesting test cases with an invalid token', async () => {
    const res = await request(app)
      .get(`/api/projects/${acmeProjectId}/cases`)
      .set('Authorization', 'Bearer invalid-token-xyz');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it('returns 403 Forbidden when unauthorized standalone user tries to access Acme Corp test cases', async () => {
    const res = await request(app)
      .get(`/api/projects/${acmeProjectId}/cases`)
      .set('Authorization', `Bearer ${indieToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden|denied|permission/i);
  });

  it('returns 200 OK when authorized project owner accesses test cases', async () => {
    const res = await request(app)
      .get(`/api/projects/${acmeProjectId}/cases`)
      .set('Authorization', `Bearer ${acmeAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cases).toBeDefined();
    expect(res.body.cases.length).toBeGreaterThanOrEqual(1);
    expect(res.body.cases[0].title).toBe('Confidential Payment Flow Test');
  });

  it('returns 200 OK when platform_admin accesses test cases', async () => {
    const res = await request(app)
      .get(`/api/projects/${acmeProjectId}/cases`)
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cases).toBeDefined();
    expect(res.body.cases.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 403 Forbidden on direct /api/test-cases endpoint without auth', async () => {
    const res = await request(app).get(`/api/test-cases?projectId=${acmeProjectId}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 Forbidden on direct /api/test-cases endpoint with unauthorized user', async () => {
    const res = await request(app)
      .get(`/api/test-cases?projectId=${acmeProjectId}`)
      .set('Authorization', `Bearer ${indieToken}`);
    expect(res.status).toBe(403);
  });

  it('ensures api.getTestCases rejects with 403 Forbidden if not logged in', async () => {
    // Clear any token
    clearStoredToken();
    api.setCurrentUser(null);

    await expect(api.getTestCases(acmeProjectId)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('ensures api.getTestCases rejects with 403 Forbidden if unauthorized standalone user accesses org project', async () => {
    const unauthorizedUser: any = {
      id: 'user_standalone_1',
      role: 'standalone',
      orgId: null,
      email: 'indie@developer.io',
    };
    api.setCurrentUser(unauthorizedUser);

    await expect(api.getTestCases('proj_org_acme', unauthorizedUser)).rejects.toMatchObject({
      status: 403,
    });
  });
});
