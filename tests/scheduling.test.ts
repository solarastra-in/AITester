import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

let tmpDir: string;
let originalCwd: string;
let calculateNextRunDate: typeof import('../server/routes/projectRoutes.js')['calculateNextRunDate'];
let stopScheduler: typeof import('../server/routes/projectRoutes.js')['stopScheduler'];
let app: express.Express;
let token: string;
let projectId: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-scheduling-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter, stopScheduler: stop, calculateNextRunDate: calc } = await import('../server/routes/projectRoutes.js');
  calculateNextRunDate = calc;
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
    .send({ name: 'Scheduling Test Project', siteUrl: 'https://registry.npmjs.org' });
  projectId = projRes.body.id;

  await request(app)
    .post(`/api/projects/${projectId}/cases`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Scheduled smoke check',
      type: 'http',
      spec: { requests: [{ name: 'root', method: 'GET', path: '/' }], expect: { statusIn: [200] } },
    });
});

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('calculateNextRunDate', () => {
  it('schedules a daily run in the future', () => {
    const next = new Date(calculateNextRunDate('daily', undefined, '02:00'));
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCHours()).toBe(2);
  });

  it('schedules a weekly run on the requested day of week', () => {
    const next = new Date(calculateNextRunDate('weekly', undefined, '09:00', 3)); // Wednesday
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCDay()).toBe(3);
    expect(next.getUTCHours()).toBe(9);
  });

  it('always returns a real future timestamp, never a fixed/backdated placeholder', () => {
    for (const type of ['daily', 'weekly'] as const) {
      const next = new Date(calculateNextRunDate(type));
      expect(next.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

describe('Schedule CUJ: create -> trigger now -> real run recorded', () => {
  it('creating a schedule computes a real nextRunAt', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nightly Smoke', scheduleType: 'daily', timeOfDay: '03:00', executionMode: 'preview' });

    expect(res.status).toBe(201);
    expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('triggering a schedule now actually executes the real test case and records a run', async () => {
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Trigger Now Test', scheduleType: 'daily', timeOfDay: '03:00', executionMode: 'preview' });
    const scheduleId = createRes.body.id;

    const beforeRuns = await request(app).get(`/api/projects/${projectId}/runs`).set('Authorization', `Bearer ${token}`);
    const runsBefore = beforeRuns.body.total;

    const triggerRes = await request(app)
      .post(`/api/projects/${projectId}/schedules/${scheduleId}/trigger`)
      .set('Authorization', `Bearer ${token}`);

    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.summary.total).toBeGreaterThan(0);
    expect(triggerRes.body.runs.length).toBe(triggerRes.body.summary.total);
    // nextRunAt must advance forward, not stay static or move to the past.
    expect(new Date(triggerRes.body.schedule.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const afterRuns = await request(app).get(`/api/projects/${projectId}/runs`).set('Authorization', `Bearer ${token}`);
    expect(afterRuns.body.total).toBeGreaterThan(runsBefore);
  });

  it('returns 404 for a schedule that does not belong to the project', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/schedules/not-a-real-schedule-id/trigger`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
