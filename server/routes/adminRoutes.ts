import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth, requireRole, AuthRequest, publicUser } from '../auth.js';
import { grantCredits, chargeCredits } from '../billing.js';
import { User, Organization } from '../types.js';

export const adminRouter = Router();

// Protect all admin endpoints with platform_admin role
adminRouter.use(requireAuth, requireRole('platform_admin'));

// Platform-wide telemetry & stats
adminRouter.get('/stats', (_req: AuthRequest, res: Response) => {
  const orgCount = db.data.organizations.length;
  const userCount = db.data.users.length;
  const employeeCount = db.data.users.filter(u => u.orgId && (u.role === 'member' || u.role === 'org_admin')).length;
  const standaloneUserCount = db.data.users.filter(u => u.role === 'standalone').length;
  const projectCount = db.data.projects.length;
  const testCasesGenerated = db.data.testCases.length;
  const browserTestCasesGenerated = db.data.testCases.filter(c => c.type === 'browser').length;
  const httpTestCasesGenerated = db.data.testCases.filter(c => c.type === 'http').length;
  const totalRuns = db.data.testRuns.length;
  const hostedRuns = db.data.testRuns.filter(r => r.executedBy === 'hosted').length;
  const passedRuns = db.data.testRuns.filter(r => r.pass).length;
  const failedRuns = totalRuns - passedRuns;
  const errorRatePercent = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 1000) / 10 : 0;
  const creditsSpent = db.data.creditLedger
    .filter(e => e.delta < 0)
    .reduce((acc, e) => acc + Math.abs(e.delta), 0);

  // Real bugs the tool has found for customers across all browser test
  // runs — a genuine "value the product has already delivered" signal for
  // renewal/expansion conversations, not a vanity metric.
  const bugsFoundTotal = db.data.testRuns.reduce((acc, r) => acc + (r.bugsFound?.length || 0), 0);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const newOrgsLast30Days = db.data.organizations.filter(o => o.createdAt >= thirtyDaysAgo).length;
  const newUsersLast30Days = db.data.users.filter(u => u.createdAt >= thirtyDaysAgo).length;

  // Per-org usage breakdown, sorted by spend — helps identify which
  // customers are getting real value (candidates for upsell/expansion)
  // versus which are barely using the product (churn risk).
  const orgUsage = db.data.organizations.map(org => {
    const spentByOrg = db.data.creditLedger
      .filter(e => e.orgId === org.id && e.delta < 0)
      .reduce((acc, e) => acc + Math.abs(e.delta), 0);
    const memberCount = db.data.users.filter(u => u.orgId === org.id).length;
    const projectCountForOrg = db.data.projects.filter(p => p.orgId === org.id).length;
    return { orgId: org.id, orgName: org.name, creditsSpent: spentByOrg, memberCount, projectCount: projectCountForOrg };
  }).sort((a, b) => b.creditsSpent - a.creditsSpent).slice(0, 10);

  res.json({
    orgCount,
    companyCount: orgCount,
    userCount,
    employeeCount,
    standaloneUserCount,
    projectCount,
    testCasesGenerated,
    browserTestCasesGenerated,
    httpTestCasesGenerated,
    totalRuns,
    hostedRuns,
    passedRuns,
    failedRuns,
    errorRatePercent,
    creditsSpent,
    bugsFoundTotal,
    newOrgsLast30Days,
    newUsersLast30Days,
    topOrgsByUsage: orgUsage,
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
  const { orgName, adminEmail, adminName, plan = 'pro', initialCredits = 1000, tokenBudget = 500000, logoUrl, contactEmail, industry } = req.body;

  if (!orgName || !adminEmail || !adminName) {
    return res.status(400).json({ error: 'Organization name, Customer Admin name, and email are required.' });
  }
  if (logoUrl) {
    try {
      const parsed = new URL(logoUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: 'logoUrl must be a valid http(s) URL to an already-hosted image.' });
    }
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
    logoUrl: logoUrl ? logoUrl.trim() : null,
    contactEmail: contactEmail ? String(contactEmail).trim().toLowerCase() : null,
    industry: industry ? String(industry).trim() : null,
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

// Update a customer organization's own details (logo, contact, industry)
// after initial onboarding — separate from credit adjustment below, which
// has its own audited endpoint.
adminRouter.put('/organizations/:id/details', (req: AuthRequest, res: Response) => {
  const org = db.findOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const { logoUrl, contactEmail, industry, name } = req.body;
  const changes: string[] = [];

  if (logoUrl !== undefined) {
    if (logoUrl) {
      try {
        const parsed = new URL(logoUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
      } catch {
        return res.status(400).json({ error: 'logoUrl must be a valid http(s) URL to an already-hosted image.' });
      }
    }
    if (org.logoUrl !== (logoUrl || null)) {
      changes.push('logo');
      org.logoUrl = logoUrl ? String(logoUrl).trim() : null;
    }
  }
  if (contactEmail !== undefined) {
    const normalized = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
    if (org.contactEmail !== normalized) {
      changes.push('contact email');
      org.contactEmail = normalized;
    }
  }
  if (industry !== undefined) {
    const normalized = industry ? String(industry).trim() : null;
    if (org.industry !== normalized) {
      changes.push('industry');
      org.industry = normalized;
    }
  }
  if (name !== undefined && name.trim() && org.name !== name.trim()) {
    changes.push(`name ${org.name} -> ${name.trim()}`);
    org.name = name.trim();
  }

  if (changes.length > 0) {
    db.addAuditLog(
      req.user!.id,
      req.user!.email,
      'CUSTOMER_ORG_DETAILS_UPDATED',
      `Updated organization "${org.name}" (${org.id}): ${changes.join(', ')}.`
    );
    db.save();
  }

  res.json({ organization: org });
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

  let newBalance: number;
  try {
    newBalance = delta > 0
      ? grantCredits({ orgId: org.id, amount: delta, reason: reason || 'Platform Superadmin Manual Credit Grant' })
      : chargeCredits({ orgId: org.id, amount: Math.abs(delta), reason: reason || 'Platform Superadmin Manual Credit Deduction' });
  } catch (err: any) {
    return res.status(err.code === 'INSUFFICIENT_CREDITS' ? 409 : 500).json({ error: err.message });
  }

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
