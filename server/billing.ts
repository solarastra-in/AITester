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

export function chargeCredits({ orgId, userId, amount, reason }: ChargeOptions): number {
  if (amount <= 0) return 0;

  if (orgId) {
    const org = db.findOrgById(orgId);
    if (!org) throw new Error('Organization not found for credit billing.');
    if (org.creditsBalance < amount) {
      const err: any = new Error(`Insufficient credits in organization pool. Required: ${amount}, Available: ${org.creditsBalance}`);
      err.code = 'INSUFFICIENT_CREDITS';
      throw err;
    }
    org.creditsBalance -= amount;
    const entry: CreditLedgerEntry = {
      id: uuidv4(),
      orgId,
      delta: -amount,
      reason,
      balanceAfter: org.creditsBalance,
      createdAt: new Date().toISOString(),
    };
    db.data.creditLedger.unshift(entry);
    db.save();
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
    db.save();
    return user.creditsBalance;
  }

  throw new Error('Billing scope requires either orgId or userId.');
}

export function grantCredits({ orgId, userId, amount, reason }: ChargeOptions): number {
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
    db.save();
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
    db.save();
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
