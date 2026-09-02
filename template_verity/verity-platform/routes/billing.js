const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { balanceOf, ledgerFor, PRICE_TABLE, createTopUpIntent } = require('../lib/billing');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const scope = req.user.org_id ? { orgId: req.user.org_id } : { userId: req.user.id };
  res.json({ credits_balance: balanceOf(scope), ledger: ledgerFor(scope), priceTable: PRICE_TABLE, scope: req.user.org_id ? 'organization' : 'personal' });
});

router.post('/topup-intent', (req, res) => {
  const { packageId } = req.body;
  try {
    const intent = createTopUpIntent({ packageId, orgId: req.user.org_id || null, userId: req.user.org_id ? null : req.user.id });
    res.json(intent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
