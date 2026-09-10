import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { generateToken, publicUser, requireAuth, verifyBearerToken, isSuperAdminEmail, AuthRequest } from '../auth.js';
import { User, UserRole } from '../types.js';

export const authRouter = Router();

// Login
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = db.findUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const matches = bcrypt.compareSync(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // If super admin email, guarantee platform_admin
  if (isSuperAdminEmail(normalizedEmail) && user.role !== 'platform_admin') {
    user.role = 'platform_admin';
    if ((user.creditsBalance ?? 0) < 9999) {
      user.creditsBalance = 9999;
    }
    db.save().catch(console.error);
  }

  const token = generateToken(user);
  const org = user.orgId ? db.findOrgById(user.orgId) : null;
  res.json({
    token,
    user: publicUser(user),
    organization: org || null,
  });
});

// Standalone self-serve signup
authRouter.post('/register-standalone', async (req: Request, res: Response) => {
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
  await db.save();

  const token = generateToken(newUser);
  res.status(201).json({
    token,
    user: publicUser(newUser),
  });
});

// Google / Firebase Auth session sync: provisions or updates the user and mints a valid backend JWT session token
authRouter.post('/google-session', async (req: Request, res: Response) => {
  try {
    const { uid, email, name } = req.body || {};
    if (!uid || !email) {
      return res.status(400).json({ error: 'UID and email are required for Google session sync.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const isSuperAdmin = isSuperAdminEmail(normalizedEmail);
    const is3peAdmin = normalizedEmail === 'nsns0021@gmail.com';

    let user = db.findUserById(uid);

    if (!user) {
      user = db.findUserByEmail(normalizedEmail);
    }

    // Look for any existing seeded org record for this email (e.g. seeded by Customer Admin or Superadmin)
    const seededOrgUser = db.data.users.find(u => u.email?.toLowerCase().trim() === normalizedEmail && u.orgId);

    if (user) {
      if (name) {
        user.name = String(name).trim();
      }
      user.email = normalizedEmail;

      // Automatically promote solarastra.in@gmail.com or admin@verity.dev to Super Admin
      if (isSuperAdmin) {
        user.role = 'platform_admin';
        if ((user.creditsBalance ?? 0) < 9999) {
          user.creditsBalance = 9999;
        }
      } else if (is3peAdmin) {
        // Customer Admin seeded for 3PE
        user.role = 'org_admin';
        user.orgId = 'org_3pe';
        user.teamId = 'team_3pe_core';
        if (!user.name || user.name === 'Google Developer') {
          user.name = name ? String(name).trim() : 'Customer Admin (3PE)';
        }
        if ((user.creditsBalance ?? 0) < 500) {
          user.creditsBalance = 1000;
        }
      } else if (seededOrgUser && (!user.orgId || user.role === 'standalone')) {
        // Merge seeded customer organization membership onto Google account
        user.role = seededOrgUser.role;
        user.orgId = seededOrgUser.orgId;
        user.teamId = seededOrgUser.teamId;
        if (seededOrgUser.monthlyCreditLimit !== undefined) {
          user.monthlyCreditLimit = seededOrgUser.monthlyCreditLimit;
        }
      }

      // If user was found by email with a legacy ID, map to Google UID if no conflict
      if (user.id !== uid && !db.findUserById(uid)) {
        user.id = uid;
      }
      await db.save();
    } else {
      // Determine role automatically based on email identity:
      // - solarastra.in@gmail.com -> Super Admin (platform_admin) with full 9999 credits
      // - nsns0021@gmail.com -> Customer Admin (org_admin) of 3PE
      // - Seeded org member -> Inherit seeded role and organization
      // - Un-onboarded Google user -> Standalone developer with 100 free trial credits
      let assignedRole: UserRole = isSuperAdmin ? 'platform_admin' : 'standalone';
      let assignedOrgId: string | undefined = undefined;
      let assignedTeamId: string | undefined = undefined;
      let initialCredits = isSuperAdmin ? 9999 : 100;
      let assignedName = name ? String(name).trim() : (isSuperAdmin ? 'Super Admin (Solarastra)' : 'Google Developer');

      if (is3peAdmin) {
        assignedRole = 'org_admin';
        assignedOrgId = 'org_3pe';
        assignedTeamId = 'team_3pe_core';
        initialCredits = 1000;
        assignedName = name ? String(name).trim() : 'Customer Admin (3PE)';
      } else if (seededOrgUser) {
        assignedRole = seededOrgUser.role;
        assignedOrgId = seededOrgUser.orgId;
        assignedTeamId = seededOrgUser.teamId;
        initialCredits = seededOrgUser.creditsBalance ?? 500;
        assignedName = name ? String(name).trim() : (seededOrgUser.name || 'Organization Member');
      }

      user = {
        id: uid,
        email: normalizedEmail,
        name: assignedName,
        passwordHash: '', // Authenticated via Google OAuth / Firebase
        role: assignedRole,
        orgId: assignedOrgId,
        teamId: assignedTeamId,
        creditsBalance: initialCredits,
        createdAt: new Date().toISOString(),
      };
      db.data.users.push(user);

      db.data.creditLedger.unshift({
        id: uuidv4(),
        userId: user.id,
        orgId: assignedOrgId,
        delta: initialCredits,
        reason: isSuperAdmin
          ? 'Super Admin System Credits Allocation (Google Sign-In)'
          : is3peAdmin
          ? '3PE Customer Admin Onboarding Allocation (Google Sign-In)'
          : 'Welcome Cloud Credits Allocation (Google Sign-In)',
        balanceAfter: initialCredits,
        createdAt: new Date().toISOString(),
      });

      db.addAuditLog(user.id, user.email, 'GOOGLE_AUTH_LOGIN', `User signed in with Google identity automatically recognized as ${assignedRole} in organization ${assignedOrgId || 'none'}.`);
      await db.save();
    }

    const token = generateToken(user);
    const org = user.orgId ? db.findOrgById(user.orgId) : null;
    return res.json({
      token,
      user: publicUser(user),
      organization: org || null,
    });
  } catch (err: any) {
    console.error('Error in /api/auth/google-session:', err);
    return res.status(500).json({ error: err.message || 'Failed to establish Google session' });
  }
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
authRouter.post('/reset-password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const salt = bcrypt.genSaltSync(10);
  req.user!.passwordHash = bcrypt.hashSync(newPassword, salt);
  req.user!.mustResetPassword = false;
  await db.save();

  res.json({ ok: true, message: 'Password successfully updated.' });
});

// Switch persona / demo helper (allows easy testing of journeys)
// The public "Switch Journey Persona" demo feature only works for these
// specific, intentionally-public demo accounts when the caller is not
// already authenticated as platform_admin — see the security note on
// switch-persona below for why this allowlist exists.
const DEMO_PERSONA_EMAILS = new Set([
  'solarastra.in@gmail.com',
  'admin@verity.dev',
  'qa.lead@acmecorp.com',
  'nsns0021@gmail.com',
  'alex.engineer@acmecorp.com',
  'developer@indie.io',
]);

function getRequesterIfPlatformAdmin(req: Request): User | null {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const user = verifyBearerToken(token);
  return user && user.role === 'platform_admin' ? user : null;
}

// SECURITY: this endpoint previously let ANYONE, unauthenticated, log in as
// ANY real user in the database just by supplying their email — a complete
// authentication bypass (no password check at all). Now:
//   - a caller already authenticated as platform_admin can look up and log
//     in as any real user (a standard, legitimate "admin login-as" support
//     tool), or
//   - anyone else (including a guest) can only switch into the small,
//     intentionally-public DEMO_PERSONA_EMAILS accounts used for the
//     product-tour "Switch Journey Persona" feature.
authRouter.post('/switch-persona', (req: Request, res: Response) => {
  const { targetRole, email } = req.body;
  const requestingAdmin = getRequesterIfPlatformAdmin(req);

  let targetUser: User | undefined;
  if (email) {
    if (!requestingAdmin && !DEMO_PERSONA_EMAILS.has(String(email).toLowerCase())) {
      return res.status(403).json({ error: 'This account cannot be accessed via persona switching.' });
    }
    targetUser = db.findUserByEmail(email);
  } else if (targetRole) {
    targetUser = db.data.users.find(u => u.role === targetRole && (requestingAdmin || DEMO_PERSONA_EMAILS.has(u.email.toLowerCase())));
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'Target persona user not found.' });
  }

  const token = generateToken(targetUser);
  const org = targetUser.orgId ? db.findOrgById(targetUser.orgId) : null;
  res.json({
    token,
    user: publicUser(targetUser),
    organization: org || null,
  });
});

// List available personas for the "Switch Journey Persona" UI.
// SECURITY: this previously returned every real user's email, name, role,
// org, and credit balance with no auth check at all — a full user directory
// leak. Now returns only the curated public demo accounts unless the
// caller is already authenticated as platform_admin, in which case it
// returns the real directory (for the admin "look up any user" flow).
authRouter.get('/demo-personas', (req: Request, res: Response) => {
  const requestingAdmin = getRequesterIfPlatformAdmin(req);
  const source = requestingAdmin
    ? db.data.users
    : db.data.users.filter(u => DEMO_PERSONA_EMAILS.has(u.email.toLowerCase()));

  const personas = source.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    orgId: u.orgId,
    creditsBalance: requestingAdmin ? u.creditsBalance : undefined,
  }));
  res.json(personas);
});
