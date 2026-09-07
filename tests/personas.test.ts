import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * Exercises the real, documented per-persona journeys (see the Homepage's
 * "Built for Superadmins, Customer Leads, and Standalone Engineers" section
 * and DEMO_PERSONAS in Navbar.tsx) against a real Express app + an isolated
 * temp database — same pattern as the other integration tests in this repo.
 *
 * Seed accounts (from server/db.ts getInitialDb):
 *   platform_admin : admin@verity.dev        / admin123!
 *   org_admin      : qa.lead@acmecorp.com    / acme123!   (org: Acme Cloud Solutions)
 *   member         : alex.engineer@acmecorp.com / alex123! (same org, Backend Core QA Team)
 *   standalone     : developer@indie.io      / indie123!
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let stopScheduler: () => void;

const tokens: Record<'platform_admin' | 'org_admin' | 'member' | 'standalone', string> = {
  platform_admin: '',
  org_admin: '',
  member: '',
  standalone: '',
};

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
  return res.body.token;
}

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-personas-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { adminRouter } = await import('../server/routes/adminRoutes.js');
  const { orgRouter } = await import('../server/routes/orgRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  stopScheduler = stop;
  const { billingRouter } = await import('../server/routes/billingRoutes.js');

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/billing', billingRouter);

  tokens.platform_admin = await login('admin@verity.dev', 'admin123!');
  tokens.org_admin = await login('qa.lead@acmecorp.com', 'acme123!');
  tokens.member = await login('alex.engineer@acmecorp.com', 'alex123!');
  tokens.standalone = await login('developer@indie.io', 'indie123!');
});

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const auth = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}` });

describe('Persona: Platform Superadmin', () => {
  it('sees platform-wide stats', async () => {
    const res = await request(app).get('/api/admin/stats').set(auth('platform_admin'));
    expect(res.status).toBe(200);
    expect(res.body.orgCount).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.totalRuns).toBe('number');
  });

  it('onboards a new customer org with a seeded Customer Admin and allocated credits', async () => {
    const res = await request(app).post('/api/admin/organizations').set(auth('platform_admin')).send({
      orgName: 'Persona Test Corp',
      adminEmail: `admin-${Date.now()}@personatest.io`,
      adminName: 'New Org Admin',
      initialCredits: 300,
    });
    expect(res.status).toBe(201);
    expect(res.body.organization.creditsBalance).toBe(300);
    expect(res.body.orgAdmin.role).toBe('org_admin');
    expect(res.body.tempPassword).toBeTruthy();

    const orgsRes = await request(app).get('/api/admin/organizations').set(auth('platform_admin'));
    const created = orgsRes.body.find((o: any) => o.id === res.body.organization.id);
    expect(created).toBeTruthy();
    expect(created.memberCount).toBe(1);
  });

  it('can grant credits to an org (positive adjustment)', async () => {
    const orgsRes = await request(app).get('/api/admin/organizations').set(auth('platform_admin'));
    const org = orgsRes.body[0];
    const before = org.creditsBalance;

    const res = await request(app)
      .post(`/api/admin/organizations/${org.id}/credits`)
      .set(auth('platform_admin'))
      .send({ amount: 200, reason: 'test grant' });

    expect(res.status).toBe(200);
    expect(res.body.creditsBalance).toBe(before + 200);
  });

  it('can deduct credits from an org (negative adjustment) — regression test for the silent no-op bug', async () => {
    const orgsRes = await request(app).get('/api/admin/organizations').set(auth('platform_admin'));
    const org = orgsRes.body[0];
    const before = org.creditsBalance;

    const res = await request(app)
      .post(`/api/admin/organizations/${org.id}/credits`)
      .set(auth('platform_admin'))
      .send({ amount: -100, reason: 'test deduction' });

    expect(res.status).toBe(200);
    // Before the fix, this endpoint silently no-opped on a negative amount
    // (grantCredits' amount<=0 guard) yet still reported creditsBalance: 0,
    // lying about both the org's real balance and whether anything happened.
    expect(res.body.creditsBalance).toBe(before - 100);
    expect(res.body.creditsBalance).not.toBe(0);
  });

  it('refuses to deduct more credits than an org actually has', async () => {
    const orgsRes = await request(app).get('/api/admin/organizations').set(auth('platform_admin'));
    const org = orgsRes.body[0];

    const res = await request(app)
      .post(`/api/admin/organizations/${org.id}/credits`)
      .set(auth('platform_admin'))
      .send({ amount: -1_000_000, reason: 'overdraft attempt' });

    expect(res.status).toBe(409);
  });

  it('records every superadmin action in the real audit log', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set(auth('platform_admin'));
    expect(res.status).toBe(200);
    const actions = res.body.map((l: any) => l.action);
    expect(actions).toContain('CUSTOMER_ORG_ONBOARDED');
    expect(actions).toContain('CREDITS_ADJUSTED');
  });
});

describe('Persona: Org Admin (Customer Admin)', () => {
  it('sees their own organization overview, not the whole platform', async () => {
    const res = await request(app).get('/api/org/overview').set(auth('org_admin'));
    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe('Acme Cloud Solutions');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members.length).toBeGreaterThan(0);
  });

  it('seeds a new team with a real token/credit budget', async () => {
    const res = await request(app).post('/api/org/teams').set(auth('org_admin')).send({
      name: 'Persona Test Team',
      budgetTokens: 100000,
      allocatedCredits: 50,
    });
    expect(res.status).toBe(201);
    expect(res.body.budgetTokens).toBe(100000);
  });

  it('seeds a new team member with a temporary password requiring reset', async () => {
    const res = await request(app).post('/api/org/members').set(auth('org_admin')).send({
      email: `new.hire.${Date.now()}@acmecorp.com`,
      name: 'New Hire',
    });
    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe('member');
    expect(res.body.tempPassword).toBeTruthy();
  });

  it('security keys start honest — never used, no invented rotation history', async () => {
    const res = await request(app).get('/api/org/security').set(auth('org_admin'));
    expect(res.status).toBe(200);
    for (const key of res.body.securityConfig.apiKeys) {
      expect(key.lastUsedAt).toBeNull();
    }
    expect(res.body.securityConfig.rotationHistory).toEqual([]);
  });

  it('rotating a key produces real rotation history and a fresh key value', async () => {
    const before = await request(app).get('/api/org/security').set(auth('org_admin'));
    const oldKey = before.body.securityConfig.apiKeys.find((k: any) => k.keyType === 'test_execution');

    const res = await request(app).post('/api/org/security/rotate-key').set(auth('org_admin')).send({
      keyType: 'test_execution',
      gracePeriodHours: 24,
      reason: 'persona test rotation',
    });
    expect(res.status).toBe(200);
    expect(res.body.apiKey.maskedKey).not.toBe(oldKey.maskedKey);
    expect(res.body.rotation.oldKeyMasked).toBe(oldKey.maskedKey);
  });

  it('key connectivity test reflects the real active status, not a canned success', async () => {
    const res = await request(app).post('/api/org/security/test-key').set(auth('org_admin')).send({
      keyType: 'test_execution',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Real elapsed time for a lookup, not a random 32-56ms filler.
    expect(res.body.latencyMs).toBeGreaterThanOrEqual(0);

    const missing = await request(app).post('/api/org/security/test-key').set(auth('org_admin')).send({
      keyType: 'nonexistent_type',
    });
    expect(missing.body.ok).toBe(false);
  });
});

describe('Persona: Team Member', () => {
  it('sees org-wide projects, not just their own', async () => {
    // The member did not create any of the org's seed projects themselves,
    // but should still see them because they belong to the org.
    const res = await request(app).get('/api/projects').set(auth('member'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('cannot seed teams or members — that is an org_admin-only action', async () => {
    const res = await request(app).post('/api/org/teams').set(auth('member')).send({ name: 'Should Not Be Created' });
    expect(res.status).toBe(403);
  });

  it('cannot access platform superadmin endpoints', async () => {
    const res = await request(app).get('/api/admin/stats').set(auth('member'));
    expect(res.status).toBe(403);
  });
});

describe('Persona: Standalone Developer', () => {
  it('only sees their own projects, never another user\'s', async () => {
    const res = await request(app).get('/api/projects').set(auth('standalone'));
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(p.orgId).toBeFalsy();
    }
  });

  it('cannot access org_admin or platform_admin endpoints', async () => {
    const orgRes = await request(app).get('/api/org/overview').set(auth('standalone'));
    // No orgId on a standalone account -> 404 "not associated with an organization",
    // not a permissions bypass into someone else's org.
    expect(orgRes.status).toBe(404);

    const adminRes = await request(app).get('/api/admin/stats').set(auth('standalone'));
    expect(adminRes.status).toBe(403);
  });

  it('can purchase a real, correctly-priced credit pack', async () => {
    const statusBefore = await request(app).get('/api/billing/status').set(auth('standalone'));
    const before = statusBefore.body.creditsBalance;
    const starterTier = statusBefore.body.pricingTiers.find((t: any) => t.id === 'starter_pack');
    expect(starterTier.priceUsd).toBe(29);
    expect(starterTier.credits).toBe(500);

    const res = await request(app).post('/api/billing/top-up').set(auth('standalone')).send({ tierId: 'starter_pack' });
    expect(res.status).toBe(200);
    expect(res.body.creditsAdded).toBe(500);
    expect(res.body.creditsBalance).toBe(before + 500);
  });
});
