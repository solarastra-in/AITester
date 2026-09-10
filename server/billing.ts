import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import { CreditLedgerEntry } from './types.js';

export const CREDIT_COST_PER_RUN = 1;
export const PREVIEW_DAILY_CAP = 15;

export interface ChargeOptions {
  orgId?: string | null;
  userId?: string | null;
  amount: number;
  reason: string;
}

/**
 * Sums this specific user's own credit consumption within the org's shared
 * pool since the start of the current calendar month, for enforcing
 * User.monthlyCreditLimit — a per-employee usage control the org's
 * Customer Admin sets independently of the org's total balance. Only
 * counts ledger entries that recorded THIS user as the actor (orgId set
 * AND userId set to them), not the org's balance-only entries from before
 * per-user attribution was tracked, and not a standalone user's own
 * personal-account entries (userId set, orgId null) — those aren't
 * "against an org pool" at all.
 */
export function getUserMonthlyUsage(userId: string): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return db.data.creditLedger
    .filter(e => e.userId === userId && e.orgId && e.delta < 0 && e.createdAt >= monthStart)
    .reduce((sum, e) => sum + Math.abs(e.delta), 0);
}

export class UsageLimitExceededError extends Error {
  code = 'USAGE_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'UsageLimitExceededError';
  }
}

export async function chargeCredits({ orgId, userId, amount, reason }: ChargeOptions): Promise<number> {
  if (amount <= 0) return 0;

  if (orgId) {
    const org = db.findOrgById(orgId);
    if (!org) throw new Error('Organization not found for credit billing.');

    // Per-employee usage control: even if the org's shared pool has plenty
    // of credits, a specific employee's own monthly cap (set by their
    // Customer Admin when onboarding them) is enforced first — this is
    // what makes "employees use the tool based on credits provided" a
    // real, individually-scoped control rather than just "anyone in the
    // org can spend the whole pool."
    if (userId) {
      const user = db.findUserById(userId);
      if (user && typeof user.monthlyCreditLimit === 'number' && user.monthlyCreditLimit >= 0) {
        const usedThisMonth = getUserMonthlyUsage(userId);
        if (usedThisMonth + amount > user.monthlyCreditLimit) {
          throw new UsageLimitExceededError(
            `Monthly usage limit reached: ${user.name} has used ${usedThisMonth} of their ${user.monthlyCreditLimit}-credit monthly allowance. Contact your Customer Admin to raise this limit.`
          );
        }
      }
    }

    if (org.creditsBalance < amount) {
      const err: any = new Error(`Insufficient credits in organization pool. Required: ${amount}, Available: ${org.creditsBalance}`);
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }
    org.creditsBalance -= amount;
    const entry: CreditLedgerEntry = {
      id: uuidv4(),
      orgId,
      // Recorded even though the org's pool is what actually pays, so the
      // ledger can answer "which employee spent how much" — previously
      // dropped entirely, making per-employee usage impossible to see or
      // enforce.
      userId: userId || undefined,
      delta: -amount,
      reason,
      balanceAfter: org.creditsBalance,
      createdAt: new Date().toISOString(),
    };
    db.data.creditLedger.unshift(entry);
    await db.save();
    return org.creditsBalance;
  }

  if (userId) {
    const user = db.findUserById(userId);
    if (!user) throw new Error('User not found for credit billing.');
    if (user.creditsBalance < amount) {
      const err: any = new Error(`Insufficient credits in standalone account. Required: ${amount}, Available: ${user.creditsBalance}`);
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }
    user.creditsBalance -= amount;
    const entry: CreditLedgerEntry = {
      id: uuidv4(),
      userId,
      delta: -amount,
      reason,
      balanceAfter: user.creditsBalance,
      createdAt: new Date().toISOString(),
    };
    db.data.creditLedger.unshift(entry);
    await db.save();
    return user.creditsBalance;
  }

  throw new Error('Billing scope requires either orgId or userId.');
}

export async function grantCredits({ orgId, userId, amount, reason }: ChargeOptions): Promise<number> {
  if (amount <= 0) return 0;

  if (orgId) {
    const org = db.findOrgById(orgId);
    if (!org) throw new Error('Organization not found for credit grant.');
    org.creditsBalance += amount;
    const entry: CreditLedgerEntry = {
      id: uuidv4(),
      orgId,
      delta: amount,
      reason,
      balanceAfter: org.creditsBalance,
      createdAt: new Date().toISOString(),
    };
    db.data.creditLedger.unshift(entry);
    await db.save();
    return org.creditsBalance;
  }

  if (userId) {
    const user = db.findUserById(userId);
    if (!user) throw new Error('User not found for credit grant.');
    user.creditsBalance += amount;
    const entry: CreditLedgerEntry = {
      id: uuidv4(),
      userId,
      delta: amount,
      reason,
      balanceAfter: user.creditsBalance,
      createdAt: new Date().toISOString(),
    };
    db.data.creditLedger.unshift(entry);
    await db.save();
    return user.creditsBalance;
  }

  throw new Error('Billing scope requires either orgId or userId.');
}

export const PRICING_TIERS = [
  {
    id: 'starter_pack',
    name: 'Developer Starter Pack',
    credits: 500,
    priceUsd: 29,
    description: 'Perfect for standalone engineers and small prototypes.',
    features: ['500 Cloud Hosted Test Runs', 'Docker Self-Hosted Export', 'Community Support', 'CSV / JSON Test Reports'],
  },
  {
    id: 'pro_team',
    name: 'Growth & Team Pack',
    credits: 2500,
    priceUsd: 119,
    description: 'Shared credit pool for multi-seat engineering teams.',
    features: ['2,500 Cloud Hosted Runs', 'Unlimited Team Members', 'Custom Token Budgets', 'Parallel Concurrency Load Testing'],
    popular: true,
  },
  {
    id: 'enterprise_pack',
    name: 'Enterprise Scale',
    credits: 10000,
    priceUsd: 399,
    description: 'Dedicated high-concurrency cloud runners and custom integrations.',
    features: ['10,000 Cloud Hosted Runs', 'Dedicated Runner IP Pools', 'SAML SSO & Role Matrix', '24/7 SLA & Custom Manifests'],
  },
];
