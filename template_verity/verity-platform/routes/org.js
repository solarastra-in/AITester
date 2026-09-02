const express = require('express');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../lib/db');
const { requireAuth, requireRole, publicUser, createUser } = require('../lib/auth');
const { ledgerFor, balanceOf, PRICE_TABLE } = require('../lib/billing');

const router = express.Router();
router.use(requireAuth, requireRole('org_admin'));

function myOrg(req) {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.user.org_id);
  if (!org) throw Object.assign(new Error('No organization on this account'), { status: 400 });
  return org;
}

router.get('/', (req, res) => {
  res.json(myOrg(req));
});

router.get('/team', (req, res) => {
  const org = myOrg(req);
  const members = db.prepare('SELECT id, email, name, role, must_reset_password, created_at FROM users WHERE org_id = ?').all(org.id);
  const invites = db.prepare("SELECT id, email, role, status, created_at FROM invites WHERE org_id = ? ORDER BY created_at DESC").all(org.id);
  res.json({ members, invites });
});

// Seed a team member — creates the account directly with a temp password
// (simpler operator flow than email-token invites, though both are supported)
router.post('/team/seed', (req, res) => {
  const org = myOrg(req);
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase().trim())) {
    return res.status(409).json({ error: 'A user with that email already exists' });
  }
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const user = createUser({ email, password: tempPassword, name, role: 'member', org_id: org.id, must_reset_password: 1 });
  res.status(201).json({ user: publicUser(user), tempPassword });
});

// Token-based invite (email link flow) — for when the org admin wants the
// member to set their own password rather than receiving a temp one
router.post('/team/invite', (req, res) => {
  const org = myOrg(req);
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });
  const token = crypto.randomBytes(20).toString('hex');
  const id = uuid();
  db.prepare('INSERT INTO invites (id, org_id, email, role, token, status, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, org.id, email.toLowerCase().trim(), role || 'member', token, 'pending', new Date().toISOString(), req.user.id);
  res.status(201).json({ inviteId: id, token, acceptUrl: `/invite/${token}` });
});

router.get('/projects', (req, res) => {
  const org = myOrg(req);
  const projects = db.prepare('SELECT id, name, site_url, owner_user_id, created_at FROM projects WHERE org_id = ? ORDER BY created_at DESC').all(org.id);
  res.json(projects);
});

router.get('/billing', (req, res) => {
  const org = myOrg(req);
  res.json({ credits_balance: balanceOf({ orgId: org.id }), ledger: ledgerFor({ orgId: org.id }), priceTable: PRICE_TABLE });
});

module.exports = router;
