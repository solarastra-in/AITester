import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * Real, end-to-end tests for the Super Admin -> Customer Admin -> Employee
 * onboarding journey against a real Express app + isolated temp database:
 *   1. Super Admin onboards a customer org, including a logo URL
 *   2. Customer Admin onboards an employee WITH a monthly usage limit
 *   3. That employee's usage is actually enforced — blocked once they
 *      exceed their own limit, even though the org's shared pool still
 *      has plenty of credits
 *   4. Super Admin analytics reflects all of the above with real numbers
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let stopScheduler: () => void;
let platformAdminToken: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-onboarding-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { adminRouter } = await import('../server/routes/adminRoutes.js');
  const { orgRouter } = await import('../server/routes/orgRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  stopScheduler = stop;

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/projects', projectRouter);

  const loginRes = await request(app).post('/api/auth/login').send({ email: 'admin@verity.dev', password: 'admin123!' });
  platformAdminToken = loginRes.body.token;
});

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Step 1: Super Admin onboards a customer, including a logo', () => {
  it('accepts a real logo URL and stores it on the organization', async () => {
    const res = await request(app)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        orgName: 'Onboarding Test Corp',
        adminEmail: `admin-${Date.now()}@onboardingtest.io`,
        adminName: 'New Customer Admin',
        initialCredits: 1000,
        logoUrl: 'https://example.com/logos/onboarding-test-corp.png',
        contactEmail: 'billing@onboardingtest.io',
        industry: 'Fintech',
      });

    expect(res.status).toBe(201);
    expect(res.body.organization.logoUrl).toBe('https://example.com/logos/onboarding-test-corp.png');
    expect(res.body.organization.contactEmail).toBe('billing@onboardingtest.io');
    expect(res.body.organization.industry).toBe('Fintech');
  });

  it('rejects a malformed logo URL rather than silently storing garbage', async () => {
    const res = await request(app)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        orgName: 'Bad Logo Corp',
        adminEmail: `admin-${Date.now()}@badlogo.io`,
        adminName: 'Admin',
        logoUrl: 'not-a-real-url',
      });
    expect(res.status).toBe(400);
  });

  it('Super Admin can update a customer\'s logo/details after initial onboarding', async () => {
    const create = await request(app)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ orgName: 'Update Logo Corp', adminEmail: `admin-${Date.now()}@updatelogo.io`, adminName: 'Admin' });
    const orgId = create.body.organization.id;

    const update = await request(app)
      .put(`/api/admin/organizations/${orgId}/details`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ logoUrl: 'https://example.com/new-logo.png', industry: 'Healthcare' });

    expect(update.status).toBe(200);
    expect(update.body.organization.logoUrl).toBe('https://example.com/new-logo.png');
    expect(update.body.organization.industry).toBe('Healthcare');
  });
});

describe('Steps 2-4: Customer Admin onboards an employee with usage controls, and they are enforced', () => {
  let orgAdminToken: string;
  let orgId: string;
  let employeeId: string;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ orgName: 'Usage Control Test Org', adminEmail: `admin-${Date.now()}@usagetest.io`, adminName: 'Org Admin', initialCredits: 500 });
    orgId = create.body.organization.id;
    const adminEmail = create.body.orgAdmin.email;
    const tempPassword = create.body.tempPassword;

    const login = await request(app).post('/api/auth/login').send({ email: adminEmail, password: tempPassword });
    orgAdminToken = login.body.token;
  });

  it('Customer Admin onboards an employee with an explicit monthly credit limit', async () => {
    const res = await request(app)
      .post('/api/org/members')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: `employee-${Date.now()}@usagetest.io`, name: 'Capped Employee', monthlyCreditLimit: 3 });

    expect(res.status).toBe(201);
    expect(res.body.member.monthlyCreditLimit).toBe(3);
    expect(res.body.member.role).toBe('member');
    employeeId = res.body.member.id;
  });

  it('rejects a negative monthlyCreditLimit', async () => {
    const res = await request(app)
      .post('/api/org/members')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: `bad-limit-${Date.now()}@usagetest.io`, name: 'Bad Limit', monthlyCreditLimit: -5 });
    expect(res.status).toBe(400);
  });

  it('Customer Admin can update an existing employee\'s usage limit', async () => {
    const res = await request(app)
      .put(`/api/org/members/${employeeId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ monthlyCreditLimit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.member.monthlyCreditLimit).toBe(10);

    // Reset back to the tight limit used by the enforcement test below.
    await request(app)
      .put(`/api/org/members/${employeeId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ monthlyCreditLimit: 2 });
  });

  it('REAL ENFORCEMENT: the employee is blocked once they exceed their own monthly limit, even though the org pool is far from empty', async () => {
    const { chargeCredits, UsageLimitExceededError } = await import('../server/billing.js');

    // First charge (1 credit) succeeds — within the 2-credit limit.
    const after1 = await chargeCredits({ orgId, userId: employeeId, amount: 1, reason: 'test run 1' });
    expect(after1).toBeLessThan(500); // came out of the real org pool

    // Second charge (1 more credit = 2 total) still within the limit.
    await chargeCredits({ orgId, userId: employeeId, amount: 1, reason: 'test run 2' });

    // Third charge would put this employee at 3 total this month — over
    // their 2-credit limit — even though the org has ~497 credits left.
    await expect(chargeCredits({ orgId, userId: employeeId, amount: 1, reason: 'test run 3' }))
      .rejects.toThrow(UsageLimitExceededError);
  });

  it('a DIFFERENT employee with no limit set is unaffected by the first employee\'s cap', async () => {
    const { chargeCredits, getUserMonthlyUsage } = await import('../server/billing.js');

    const seedRes = await request(app)
      .post('/api/org/members')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: `uncapped-${Date.now()}@usagetest.io`, name: 'Uncapped Employee' });
    const uncappedId = seedRes.body.member.id;
    expect(seedRes.body.member.monthlyCreditLimit).toBeNull();

    // This should succeed even though the capped employee above already hit their limit.
    await expect(chargeCredits({ orgId, userId: uncappedId, amount: 5, reason: 'uncapped run' })).resolves.not.toThrow();
    expect(getUserMonthlyUsage(uncappedId)).toBe(5);
  });

  it('the credit ledger records WHICH employee triggered an org-scoped charge (previously untracked)', async () => {
    const { db } = await import('../server/db.js');
    const entry = db.data.creditLedger.find(e => e.orgId === orgId && e.userId === employeeId);
    expect(entry).toBeTruthy();
  });
});

describe('Super Admin analytics reflect the real onboarding activity above', () => {
  it('returns real, non-fabricated counts for orgs, employees, and usage', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${platformAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.companyCount).toBeGreaterThanOrEqual(4); // seed org + the orgs created in this file
    expect(res.body.employeeCount).toBeGreaterThanOrEqual(2); // the two employees onboarded above
    expect(res.body.testCasesGenerated).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.errorRatePercent).toBe('number');
    expect(res.body.topOrgsByUsage.length).toBeGreaterThan(0);
    // The usage-control test org should show up with real spend.
    const usageOrg = res.body.topOrgsByUsage.find((o: any) => o.orgName === 'Usage Control Test Org');
    expect(usageOrg).toBeTruthy();
    expect(usageOrg.creditsSpent).toBeGreaterThanOrEqual(7); // 2 (capped) + 5 (uncapped)
  });
});
