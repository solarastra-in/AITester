const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../lib/db');
const { createUser, findUserByEmail, checkPassword, issueToken, publicUser, hashPassword, requireAuth } = require('../lib/auth');

const router = express.Router();

const STANDALONE_TRIAL_CREDITS = Number(process.env.STANDALONE_TRIAL_CREDITS || 20);

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = findUserByEmail(email);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
});

// Self-serve standalone signup — no org, gets a small trial credit grant
router.post('/signup', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (findUserByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });

  const user = createUser({ email, password, name, role: 'standalone', credits_balance: STANDALONE_TRIAL_CREDITS });
  db.prepare('INSERT INTO credit_ledger (id, user_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), user.id, STANDALONE_TRIAL_CREDITS, 'Standalone signup trial grant', new Date().toISOString());

  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

// Accept an org invite -> creates a 'member' user under that org
router.get('/invite/:token', (req, res) => {
  const invite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found or already used' });
  const org = db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(invite.org_id);
  res.json({ email: invite.email, role: invite.role, org });
});

router.post('/invite/:token/accept', (req, res) => {
  const invite = db.prepare("SELECT * FROM invites WHERE token = ? AND status = 'pending'").get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found or already used' });
  const { password, name } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (findUserByEmail(invite.email)) return res.status(409).json({ error: 'An account with that email already exists' });

  const user = createUser({ email: invite.email, password, name, role: invite.role, org_id: invite.org_id });
  db.prepare("UPDATE invites SET status = 'accepted' WHERE id = ?").run(invite.id);
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  let org = null;
  if (req.user.org_id) org = db.prepare('SELECT id, name, plan, credits_balance FROM organizations WHERE id = ?').get(req.user.org_id);
  res.json({ user: publicUser(req.user), org });
});

router.post('/reset-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  db.prepare('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
