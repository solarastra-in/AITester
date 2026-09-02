// ---------------------------------------------------------------------------
// Credits ledger. This is a self-contained, working accounting system:
// every grant, purchase, and spend is a signed integer delta with a reason,
// and balances are always derived from (or kept in sync with) the ledger.
//
// What's NOT wired up: an actual payment processor. `createTopUpIntent()` is
// the seam where Stripe/Paddle/Razorpay would go — call their Checkout API,
// and on the webhook confirming payment, call `grantCredits()`. Without
// real payment credentials this repo intentionally stops at that seam rather
// than faking a "payment succeeded" response.
// ---------------------------------------------------------------------------
const { v4: uuid } = require('uuid');
const db = require('./db');

const PRICE_TABLE = [
  { id: 'starter', credits: 100, priceUsd: 19, label: '100 credits' },
  { id: 'team', credits: 600, priceUsd: 99, label: '600 credits' },
  { id: 'scale', credits: 3000, priceUsd: 399, label: '3,000 credits' },
];

const CREDIT_COST_PER_RUN = 1; // 1 credit per hosted automated test execution

function balanceOf({ orgId, userId }) {
  if (orgId) {
    const row = db.prepare('SELECT credits_balance FROM organizations WHERE id = ?').get(orgId);
    return row ? row.credits_balance : 0;
  }
  const row = db.prepare('SELECT credits_balance FROM users WHERE id = ?').get(userId);
  return row ? row.credits_balance : 0;
}

function grantCredits({ orgId, userId, amount, reason }) {
  if (amount === 0) return balanceOf({ orgId, userId });
  db.prepare('INSERT INTO credit_ledger (id, org_id, user_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid(), orgId || null, userId || null, amount, reason, new Date().toISOString());
  if (orgId) {
    db.prepare('UPDATE organizations SET credits_balance = credits_balance + ? WHERE id = ?').run(amount, orgId);
  } else {
    db.prepare('UPDATE users SET credits_balance = credits_balance + ? WHERE id = ?').run(amount, userId);
  }
  return balanceOf({ orgId, userId });
}

// Throws if insufficient balance. Caller is responsible for billing scope:
// org-scoped users spend from the org balance; standalone users spend their own.
function chargeCredits({ orgId, userId, amount, reason }) {
  const bal = balanceOf({ orgId, userId });
  if (bal < amount) {
    const err = new Error(`Insufficient credits: balance ${bal}, need ${amount}`);
    err.code = 'INSUFFICIENT_CREDITS';
    throw err;
  }
  return grantCredits({ orgId, userId, amount: -amount, reason });
}

function ledgerFor({ orgId, userId }) {
  if (orgId) return db.prepare('SELECT * FROM credit_ledger WHERE org_id = ? ORDER BY created_at DESC LIMIT 200').all(orgId);
  return db.prepare('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(userId);
}

// Seam for a real payment integration. Returns a stub "intent" today.
function createTopUpIntent({ packageId, orgId, userId }) {
  const pkg = PRICE_TABLE.find(p => p.id === packageId);
  if (!pkg) throw new Error('Unknown package');
  return {
    stub: true,
    message: 'No payment gateway is configured in this deployment. A platform admin can grant these credits manually from the Admin console, or wire lib/billing.js#createTopUpIntent to Stripe/Paddle/Razorpay Checkout.',
    package: pkg,
    orgId, userId,
  };
}

module.exports = { PRICE_TABLE, CREDIT_COST_PER_RUN, balanceOf, grantCredits, chargeCredits, ledgerFor, createTopUpIntent };
