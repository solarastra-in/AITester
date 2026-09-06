import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

// Full integration test against a real Express app assembled the same way
// server.ts does (minus Vite/static serving), running against a throwaway
// temp data directory so it never touches the real repo database.
let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let token: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-analytics-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter } = await import('../server/routes/projectRoutes.js');

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);

  // Real login CUJ against the seed superadmin account created by db.ts's
  // getInitialDb() the first time this temp data dir is touched.
  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'admin@verity.dev',
    password: 'admin123!',
  });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toBeTruthy();
  token = loginRes.body.token;
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('auth CUJ', () => {
  it('rejects analytics access without a token', async () => {
    const res = await request(app).get('/api/projects/all/analytics');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/projects/all/analytics').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('analytics CUJ — zero-dummy-data regression guard', () => {
  it('returns honest zeroed metrics for a project with no runs, and never fabricates history', async () => {
    const before = await request(app)
      .get('/api/projects/all/runs')
      .set('Authorization', `Bearer ${token}`);
    const runsBeforeCount = before.body.total;

    const res = await request(app)
      .get('/api/projects/all/analytics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalRuns).toBe(runsBeforeCount);
    // The critical regression check: hitting /analytics must NOT create any
    // new test runs as a side effect (it previously injected synthetic
    // "seed_run_*" records into the database to make charts look populated).
    const after = await request(app)
      .get('/api/projects/all/runs')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.total).toBe(runsBeforeCount);
    expect(after.body.runs.some((r: any) => String(r.id).startsWith('seed_run_'))).toBe(false);

    // When there is genuinely no duration data, the endpoint must report 0,
    // never a hardcoded filler like the old "118ms" / random-jitter default.
    if (res.body.summary.totalRuns === 0) {
      expect(res.body.summary.avgDurationMs).toBe(0);
      expect(res.body.summary.passRate).toBe(0);
    }
  });

  it('calling analytics twice in a row returns identical totals (idempotent, not randomized)', async () => {
    const first = await request(app).get('/api/projects/all/analytics').set('Authorization', `Bearer ${token}`);
    const second = await request(app).get('/api/projects/all/analytics').set('Authorization', `Bearer ${token}`);
    expect(second.body.summary).toEqual(first.body.summary);
  });
});
