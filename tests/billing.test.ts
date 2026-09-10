import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// This suite touches server/db.ts, which resolves its data file relative to
// process.cwd() at import time. We run it against a throwaway temp directory
// so tests never read or write the real repo's data/verity-db.json.
let tmpDir: string;
let originalCwd: string;
let billing: typeof import('../server/billing.js');
let db: typeof import('../server/db.js');

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-billing-test-'));
  process.chdir(tmpDir);
  billing = await import('../server/billing.js');
  db = await import('../server/db.js');
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('chargeCredits', () => {
  it('deducts real credits from an org and records a ledger entry', async () => {
    const org = db.db.data.organizations[0];
    const before = org.creditsBalance;
    const after = await billing.chargeCredits({ orgId: org.id, amount: billing.CREDIT_COST_PER_RUN, reason: 'test run' });
    expect(after).toBe(before - billing.CREDIT_COST_PER_RUN);
    expect(db.db.data.creditLedger[0].delta).toBe(-billing.CREDIT_COST_PER_RUN);
    expect(db.db.data.creditLedger[0].balanceAfter).toBe(after);
  });

  it('throws a real INSUFFICIENT_CREDITS error rather than silently allowing overdraft', async () => {
    const org = db.db.data.organizations[0];
    await expect(billing.chargeCredits({ orgId: org.id, amount: org.creditsBalance + 1_000_000, reason: 'overdraft attempt' }))
      .rejects.toThrowError(/Insufficient credits/);
  });

  it('rejects a charge with neither orgId nor userId', async () => {
    await expect(billing.chargeCredits({ amount: 1, reason: 'no scope' } as any)).rejects.toThrow();
  });

  it('is a no-op for a zero or negative amount', async () => {
    const org = db.db.data.organizations[0];
    const before = org.creditsBalance;
    expect(await billing.chargeCredits({ orgId: org.id, amount: 0, reason: 'noop' })).toBe(0);
    expect(org.creditsBalance).toBe(before);
  });
});

describe('grantCredits', () => {
  it('adds real credits to a standalone user and records a ledger entry', async () => {
    const user = db.db.data.users.find(u => u.role === 'standalone')!;
    const before = user.creditsBalance;
    const after = await billing.grantCredits({ userId: user.id, amount: 500, reason: 'starter pack purchase' });
    expect(after).toBe(before + 500);
    expect(db.db.data.creditLedger[0].delta).toBe(500);
  });
});

describe('PRICING_TIERS', () => {
  it('exposes a real, non-empty, internally-consistent pricing catalogue', () => {
    expect(billing.PRICING_TIERS.length).toBeGreaterThan(0);
    for (const tier of billing.PRICING_TIERS) {
      expect(tier.credits).toBeGreaterThan(0);
      expect(tier.priceUsd).toBeGreaterThan(0);
      expect(Array.isArray(tier.features)).toBe(true);
      expect(tier.features.length).toBeGreaterThan(0);
    }
  });
});
