import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../auth.js';
import { PRICING_TIERS, grantCredits } from '../billing.js';

export const billingRouter = Router();
billingRouter.use(requireAuth);

// Get current billing status & credit ledger
billingRouter.get('/status', (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const org = user.orgId ? db.findOrgById(user.orgId) : null;

  let balance = 0;
  let ledger = [];

  if (org) {
    balance = org.creditsBalance;
    ledger = db.data.creditLedger.filter(l => l.orgId === org.id).slice(0, 50);
  } else {
    balance = user.creditsBalance;
    ledger = db.data.creditLedger.filter(l => l.userId === user.id).slice(0, 50);
  }

  res.json({
    accountType: org ? 'organization' : 'standalone',
    name: org ? org.name : user.name,
    creditsBalance: balance,
    pricingTiers: PRICING_TIERS,
    ledger,
  });
});

// Top-up request simulation / instant development purchase
billingRouter.post('/top-up', async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { tierId } = req.body;

  const tier = PRICING_TIERS.find(t => t.id === tierId) || PRICING_TIERS[0];
  const org = user.orgId ? db.findOrgById(user.orgId) : null;

  const target = org ? { orgId: org.id } : { userId: user.id };
  const newBalance = await grantCredits({
    ...target,
    amount: tier.credits,
    reason: `Purchased ${tier.name} (+${tier.credits} Credits for $${tier.priceUsd})`,
  });

  db.addAuditLog(
    user.id,
    user.email,
    'CREDITS_PURCHASED',
    `User purchased ${tier.name} ($${tier.priceUsd}). Added ${tier.credits} credits.`
  );

  res.json({
    ok: true,
    tier,
    creditsAdded: tier.credits,
    creditsBalance: newBalance,
    message: `Successfully loaded ${tier.credits.toLocaleString()} credits to your account!`,
  });
});
