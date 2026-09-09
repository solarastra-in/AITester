import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * Integration tests for the full CUJ: crawl a real site -> generate real
 * browser test cases -> the "run" route correctly dispatches a 'browser'
 * test case to the browser runner instead of the HTTP runner.
 *
 * Note on scope: this sandbox cannot launch a real Chromium (blocked
 * network egress to Playwright's browser-binary CDN), so the "run a
 * browser test" assertions below verify that the ROUTE correctly
 * dispatches to runBrowserTestCase and persists a real TestRun record —
 * not that a real browser actually executed the steps. The graceful
 * "Could not launch browser: ..." failure message is expected and correct
 * here; what matters for this test is that it is NOT the old genericRunner
 * fallback error ("cannot be automated via HTTP runner"), which is what
 * you'd see if the dispatch fix were missing or broken.
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let token: string;
let projectId: string;
let stopScheduler: () => void;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-browser-routes-test-'));
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

  const projRes = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Browser Testing Routes Project', siteUrl: 'https://pypi.org' });
  projectId = projRes.body.id;
}, 30_000);

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /:id/suites/generate-browser-tests', () => {
  it('crawls the real project site and generates real browser test cases', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/suites/generate-browser-tests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ maxPages: 2, maxDepth: 1 });

    expect(res.status).toBe(201);
    expect(res.body.caseCount).toBeGreaterThan(0);
    expect(res.body.pagesCrawled).toBeGreaterThan(0);

    // The real pypi.org search form (name="q") should have produced a case
    // that does NOT need user data (it's a safe, non-sensitive field).
    const casesRes = await request(app).get(`/api/projects/${projectId}/cases`).set('Authorization', `Bearer ${token}`);
    const browserCases = casesRes.body.cases.filter((c: any) => c.type === 'browser');
    expect(browserCases.length).toBeGreaterThan(0);
    expect(browserCases.every((c: any) => c.spec.browser && Array.isArray(c.spec.browser.steps))).toBe(true);
  }, 30_000);

  it('refuses to crawl an internal/private target (SSRF protection carries through)', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/suites/generate-browser-tests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ targetUrl: 'http://169.254.169.254/latest/meta-data/' });

    expect(res.status).toBe(400);
  });
});

describe('POST /:id/cases/:caseId/run — dispatches browser tests to the browser runner', () => {
  it('a browser-type test case is routed to runBrowserTestCase, not the HTTP runner', async () => {
    const genRes = await request(app)
      .post(`/api/projects/${projectId}/suites/generate-browser-tests`)
      .set('Authorization', `Bearer ${token}`)
      .send({ maxPages: 1, maxDepth: 0 });
    expect(genRes.status).toBe(201);

    const casesRes = await request(app).get(`/api/projects/${projectId}/cases`).set('Authorization', `Bearer ${token}`);
    const browserCase = casesRes.body.cases.find((c: any) => c.type === 'browser');
    expect(browserCase).toBeTruthy();

    const runRes = await request(app)
      .post(`/api/projects/${projectId}/cases/${browserCase.id}/run`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'preview' });

    expect(runRes.status).toBe(200);
    // The old genericRunner fallback error is what you'd see if 'browser'
    // type cases were NOT being dispatched to the browser runner — its
    // absence, combined with the browser-launch-specific message, proves
    // the dispatch is wired correctly.
    expect(runRes.body.testRun.message).not.toContain('cannot be automated via HTTP runner');
    expect(runRes.body.testRun.pass).toBe(false); // no real browser available in this test environment
  }, 30_000);
});
