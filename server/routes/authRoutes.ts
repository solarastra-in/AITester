import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { generateToken, publicUser, requireAuth, AuthRequest } from '../auth.js';
import { User, UserRole } from '../types.js';

export const authRouter = Router();

// Login
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const matches = bcrypt.compareSync(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: publicUser(user),
  });
});

// Standalone self-serve signup
authRouter.post('/register-standalone', (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (db.findUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'An account with that email already exists. Please login instead.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const newUser: User = {
    id: `usr_${uuidv4().slice(0, 8)}`,
    email: normalizedEmail,
    name: name.trim(),
    passwordHash: bcrypt.hashSync(password, salt),
    role: 'standalone',
    creditsBalance: 50, // Initial free trial credits
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(newUser);

  // Initial welcome credit ledger entry
  db.data.creditLedger.unshift({
    id: uuidv4(),
    userId: newUser.id,
    delta: 50,
    reason: 'Welcome Trial Credits Allocation (Standalone Signup)',
    balanceAfter: 50,
    createdAt: new Date().toISOString(),
  });

  db.addAuditLog(newUser.id, newUser.email, 'USER_REGISTERED', `Standalone user registered with 50 initial trial credits.`);
  db.save();

  const token = generateToken(newUser);
  res.status(201).json({
    token,
    user: publicUser(newUser),
  });
});

// Current user profile
authRouter.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const org = req.user.orgId ? db.findOrgById(req.user.orgId) : null;
  res.json({
    user: publicUser(req.user),
    organization: org || null,
  });
});

// Reset password
authRouter.post('/reset-password', requireAuth, (req: AuthRequest, res: Response) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const salt = bcrypt.genSaltSync(10);
  req.user!.passwordHash = bcrypt.hashSync(newPassword, salt);
  req.user!.mustResetPassword = false;
  db.save();

  res.json({ ok: true, message: 'Password successfully updated.' });
});

// Switch persona / demo helper (allows easy testing of journeys)
authRouter.post('/switch-persona', (req: Request, res: Response) => {
  const { targetRole, email } = req.body;
  let targetUser: User | undefined;

  if (email) {
    targetUser = db.findUserByEmail(email);
  } else if (targetRole) {
    targetUser = db.data.users.find(u => u.role === targetRole);
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'Target persona user not found in seed database.' });
  }

  const token = generateToken(targetUser);
  const org = targetUser.orgId ? db.findOrgById(targetUser.orgId) : null;
  res.json({
    token,
    user: publicUser(targetUser),
    organization: org || null,
  });
});

// List all available test users for quick login
authRouter.get('/demo-personas', (_req: Request, res: Response) => {
  const personas = db.data.users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    orgId: u.orgId,
    creditsBalance: u.creditsBalance,
  }));
  res.json(personas);
});
