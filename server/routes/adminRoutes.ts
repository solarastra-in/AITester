import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth, requireRole, AuthRequest, publicUser } from '../auth.js';
import { grantCredits } from '../billing.js';
import { User, Organization } from '../types.js';

export const adminRouter = Router();

// Protect all admin endpoints with platform_admin role
adminRouter.use(requireAuth, requireRole('platform_admin'));

// Platform-wide telemetry & stats
adminRouter.get('/stats', (_req: AuthRequest, res: Response) => {
  const orgCount = db.data.organizations.length;
  const userCount = db.data.users.length;
  const projectCount = db.data.projects.length;
  const totalRuns = db.data.testRuns.length;
  const hostedRuns = db.data.testRuns.filter(r => r.executedBy === 'hosted').length;
  const passedRuns = db.data.testRuns.filter(r => r.pass).length;
  const creditsSpent = db.data.creditLedger
    .filter(e => e.delta < 0)
    .reduce((acc, e) => acc + Math.abs(e.delta), 0);

  res.json({
    orgCount,
    userCount,
    projectCount,
    totalRuns,
    hostedRuns,
    passedRuns,
    creditsSpent,
  });
});

// List organizations with counts
adminRouter.get('/organizations', (_req: AuthRequest, res: Response) => {
  const orgs = db.data.organizations.map(org => {
    const members = db.data.users.filter(u => u.orgId === org.id);
    const projects = db.data.projects.filter(p => p.orgId === org.id);
    const teams = db.data.teams.filter(t => t.orgId === org.id);
    return {
      ...org,
      memberCount: members.length,
      projectCount: projects.length,
      teamCount: teams.length,
      adminUser: members.find(m => m.role === 'org_admin') ? publicUser(members.find(m => m.role === 'org_admin')!) : null,
    };
  });
  res.json(orgs);
});

// Onboard Customer Journey: Seed Customer Organization + Seed Customer Admin + Allocate Resources
adminRouter.post('/organizations', (req: AuthRequest, res: Response) => {
  const { orgName, adminEmail, adminName, plan = 'pro', initialCredits = 1000, tokenBudget = 500000 } = req.body;

  if (!orgName || !adminEmail || !adminName) {
    return res.status(400).json({ error: 'Organization name, Customer Admin name, and email are required.' });
  }

  const normalizedEmail = adminEmail.toLowerCase().trim();
  if (db.findUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'A user with that admin email address already exists.' });
  }

  const orgId = `org_${uuidv4().slice(0, 8)}`;
  const credits = Number(initialCredits) || 0;

  const newOrg: Organization = {
    id: orgId,
    name: orgName.trim(),
    plan: plan || 'pro',
    creditsBalance: credits,
    tokenBudget: Number(tokenBudget) || 500000,
    createdBy: req.user!.id,
    createdAt: new Date().toISOString(),
  };

  db.data.organizations.push(newOrg);

  // Credit ledger allocation
  if (credits > 0) {
    db.data.creditLedger.unshift({
      id: uuidv4(),
      orgId,
      delta: credits,
      reason: `Initial Onboarding Credit Allocation for ${orgName}`,
      balanceAfter: credits,
      createdAt: new Date().toISOString(),
    });
  }

  // Generate temporary password
  const tempPassword = `Verity-${crypto.randomBytes(4).toString('hex')}!`;
  const salt = bcrypt.genSaltSync(10);

  const orgAdminUser: User = {
    id: `usr_${uuidv4().slice(0, 8)}`,
    email: normalizedEmail,
    name: adminName.trim(),
    passwordHash: bcrypt.hashSync(tempPassword, salt),
    role: 'org_admin',
    orgId: orgId,
    creditsBalance: 0,
    mustResetPassword: true,
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(orgAdminUser);

  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'CUSTOMER_ORG_ONBOARDED',
    `Created customer org "${orgName}" (${orgId}), seeded Customer Admin "${adminName}" <${normalizedEmail}>, and allocated ${credits} credits.`
  );

  db.save();

  res.status(201).json({
    organization: newOrg,
    orgAdmin: publicUser(orgAdminUser),
    tempPassword, // Displayed in the UI onboarding step
  });
});

// Grant or adjust organization credits
adminRouter.post('/organizations/:id/credits', (req: AuthRequest, res: Response) => {
  const { amount, reason } = req.body;
  const org = db.findOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const delta = Number(amount);
  if (isNaN(delta) || delta === 0) {
    return res.status(400).json({ error: 'Valid non-zero amount is required.' });
  }

  const newBalance = grantCredits({
    orgId: org.id,
    amount: delta,
    reason: reason || 'Platform Superadmin Manual Credit Grant',
  });

  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'CREDITS_ADJUSTED',
    `Adjusted credits by ${delta} for org "${org.name}". New balance: ${newBalance}. Reason: ${reason || 'Admin grant'}`
  );

  res.json({ orgId: org.id, creditsBalance: newBalance });
});

// Get organization details
adminRouter.get('/organizations/:id', (req: AuthRequest, res: Response) => {
  const org = db.findOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const members = db.data.users.filter(u => u.orgId === org.id).map(publicUser);
  const projects = db.data.projects.filter(p => p.orgId === org.id);
  const teams = db.data.teams.filter(t => t.orgId === org.id);
  const ledger = db.data.creditLedger.filter(l => l.orgId === org.id);

  res.json({
    organization: org,
    members,
    projects,
    teams,
    ledger,
  });
});

// Global user management
adminRouter.get('/users', (_req: AuthRequest, res: Response) => {
  const users = db.data.users.map(u => ({
    ...publicUser(u),
    orgName: u.orgId ? db.findOrgById(u.orgId)?.name : null,
  }));
  res.json(users);
});

// System audit trail
adminRouter.get('/audit-logs', (_req: AuthRequest, res: Response) => {
  res.json(db.data.auditLogs);
});
