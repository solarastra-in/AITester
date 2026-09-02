const express = require('express');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../lib/db');
const { requireAuth, requireRole, createUser, publicUser } = require('../lib/auth');
const { grantCredits } = require('../lib/billing');

const router = express.Router();
router.use(requireAuth, requireRole('platform_admin'));

router.get('/stats', (req, res) => {
  const orgs = db.prepare('SELECT COUNT(*) n FROM organizations').get().n;
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const projects = db.prepare('SELECT COUNT(*) n FROM projects').get().n;
  const runs = db.prepare('SELECT COUNT(*) n FROM test_runs').get().n;
  const hostedRuns = db.prepare("SELECT COUNT(*) n FROM test_runs WHERE executed_by = 'platform'").get().n;
  const creditsSpent = db.prepare("SELECT COALESCE(SUM(-delta),0) n FROM credit_ledger WHERE delta < 0 AND reason LIKE 'Hosted%'").get().n;
  res.json({ orgs, users, projects, runs, hostedRuns, creditsSpent });
});

router.get('/organizations', (req, res) => {
  const orgs = db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all();
  const withCounts = orgs.map(o => ({
    ...o,
    memberCount: db.prepare('SELECT COUNT(*) n FROM users WHERE org_id = ?').get(o.id).n,
    projectCount: db.prepare('SELECT COUNT(*) n FROM projects WHERE org_id = ?').get(o.id).n,
  }));
  res.json(withCounts);
});

// Onboard a new customer org: create the org + seed its org_admin user in one step
router.post('/organizations', (req, res) => {
  const { orgName, adminEmail, adminName, initialCredits } = req.body;
  if (!orgName || !adminEmail) return res.status(400).json({ error: 'orgName and adminEmail are required' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail.toLowerCase().trim())) {
    return res.status(409).json({ error: 'A user with that admin email already exists' });
  }

  const orgId = uuid();
  const credits = Number(initialCredits || 0);
  db.prepare('INSERT INTO organizations (id, name, plan, credits_balance, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orgId, orgName, 'trial', credits, new Date().toISOString(), req.user.id);
  if (credits > 0) {
    db.prepare('INSERT INTO credit_ledger (id, org_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), orgId, credits, 'Initial allocation at onboarding', new Date().toISOString());
  }

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const adminUser = createUser({
    email: adminEmail, password: tempPassword, name: adminName, role: 'org_admin',
    org_id: orgId, must_reset_password: 1,
  });

  res.status(201).json({
    organization: db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId),
    orgAdmin: publicUser(adminUser),
    tempPassword, // shown once — no email sending is wired up in this deployment
  });
});

router.post('/organizations/:id/credits', (req, res) => {
  const { amount, reason } = req.body;
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  const newBal = grantCredits({ orgId: org.id, amount: Number(amount), reason: reason || 'Manual admin grant' });
  res.json({ orgId: org.id, credits_balance: newBal });
});

router.get('/organizations/:id', (req, res) => {
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  const members = db.prepare('SELECT id, email, name, role, must_reset_password, created_at FROM users WHERE org_id = ?').all(org.id);
  const projects = db.prepare('SELECT id, name, site_url, created_at FROM projects WHERE org_id = ?').all(org.id);
  const ledger = db.prepare('SELECT * FROM credit_ledger WHERE org_id = ? ORDER BY created_at DESC LIMIT 100').all(org.id);
  res.json({ org, members, projects, ledger });
});

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, org_id, credits_balance, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

module.exports = router;
