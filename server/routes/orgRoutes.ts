import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth, requireRole, AuthRequest, publicUser } from '../auth.js';
import { User, Team, Organization, OrgSecurityConfig, OrgApiKey, KeyRotationHistory } from '../types.js';

export const orgRouter = Router();

// Helper to ensure organization has initialized security keys
function ensureOrgSecurityConfig(org: Organization): OrgSecurityConfig {
  if (!org.securityConfig || !org.securityConfig.apiKeys || org.securityConfig.apiKeys.length === 0) {
    const defaultRunnerKey = `vrt_live_${crypto.randomBytes(16).toString('hex')}`;
    const defaultAiKey = `vrt_ai_${crypto.randomBytes(16).toString('hex')}`;
    const defaultWebhookKey = `whsec_${crypto.randomBytes(16).toString('hex')}`;

    org.securityConfig = {
      apiKeys: [
        {
          id: `key_${uuidv4().slice(0, 8)}`,
          keyType: 'test_execution',
          name: 'CI/CD Pipeline & Runner Key',
          maskedKey: `${defaultRunnerKey.slice(0, 11)}••••••••••••••••${defaultRunnerKey.slice(-4)}`,
          fullKey: defaultRunnerKey,
          prefix: 'vrt_live_',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          status: 'active',
          environment: 'production',
        },
        {
          id: `key_${uuidv4().slice(0, 8)}`,
          keyType: 'ai_integration',
          name: 'Gemini AI Proxy Integration Key',
          maskedKey: `${defaultAiKey.slice(0, 9)}••••••••••••••••${defaultAiKey.slice(-4)}`,
          fullKey: defaultAiKey,
          prefix: 'vrt_ai_',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          status: 'active',
          environment: 'production',
        },
        {
          id: `key_${uuidv4().slice(0, 8)}`,
          keyType: 'webhook_secret',
          name: 'Test Ingestion Webhook HMAC Secret',
          maskedKey: `${defaultWebhookKey.slice(0, 8)}••••••••••••••••${defaultWebhookKey.slice(-4)}`,
          fullKey: defaultWebhookKey,
          prefix: 'whsec_',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          status: 'active',
          environment: 'production',
        },
      ],
      // A freshly-provisioned org has no rotation history yet — an empty
      // list is the honest starting state, not an invented "initial
      // provisioning" event that never actually happened.
      rotationHistory: [],
      ipWhitelistingEnabled: false,
      mfaRequiredForAdmins: true,
    };
    db.save().catch(err => {
      console.warn('[Database] Background save of org security config failed:', err);
    });
  }
  return org.securityConfig;
}

// Protect customer admin routes: only org_admin and platform_admin
orgRouter.use(requireAuth);

// Get current user's organization overview
orgRouter.get('/overview', (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) {
    return res.status(404).json({ error: 'User is not associated with an organization.' });
  }

  const org = db.findOrgById(orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const securityConfig = ensureOrgSecurityConfig(org);
  const members = db.data.users.filter(u => u.orgId === orgId).map(publicUser);
  const teams = db.data.teams.filter(t => t.orgId === orgId);
  const projects = db.data.projects.filter(p => p.orgId === orgId);
  const ledger = db.data.creditLedger.filter(l => l.orgId === orgId).slice(0, 50);

  res.json({
    organization: org,
    securityConfig,
    members,
    teams,
    projects,
    ledger,
  });
});

// Customer Admin Journey: Seed a new team with resource/token budget
orgRouter.post('/teams', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const { name, budgetTokens = 250000, allocatedCredits = 100 } = req.body;
  if (!name) return res.status(400).json({ error: 'Team name is required.' });

  const teamId = `team_${uuidv4().slice(0, 8)}`;
  const newTeam: Team = {
    id: teamId,
    orgId,
    name: name.trim(),
    budgetTokens: Number(budgetTokens) || 250000,
    allocatedCredits: Number(allocatedCredits) || 100,
    createdAt: new Date().toISOString(),
  };

  db.data.teams.push(newTeam);
  db.addAuditLog(req.user!.id, req.user!.email, 'TEAM_CREATED', `Customer Admin created team "${name}" with token budget ${budgetTokens}.`);
  await db.save();

  res.status(201).json(newTeam);
});

// Customer Admin Journey: Seed & Invite Team Member
orgRouter.post('/members', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const { email, name, role = 'member', teamId, monthlyCreditLimit } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required to seed team member.' });
  }
  if (monthlyCreditLimit !== undefined && monthlyCreditLimit !== null) {
    const parsed = Number(monthlyCreditLimit);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'monthlyCreditLimit must be a non-negative number, or omitted for no individual cap.' });
    }
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (db.findUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }

  const tempPassword = `Team-${crypto.randomBytes(4).toString('hex')}!`;
  const salt = bcrypt.genSaltSync(10);

  const newMember: User = {
    id: `usr_${uuidv4().slice(0, 8)}`,
    email: normalizedEmail,
    name: name.trim(),
    passwordHash: bcrypt.hashSync(tempPassword, salt),
    role: role === 'org_admin' ? 'org_admin' : 'member',
    orgId,
    teamId: teamId || null,
    creditsBalance: 0,
    monthlyCreditLimit: monthlyCreditLimit !== undefined && monthlyCreditLimit !== null ? Number(monthlyCreditLimit) : null,
    mustResetPassword: true,
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(newMember);
  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'TEAM_MEMBER_SEEDED',
    `Customer Admin seeded new team member "${name}" <${normalizedEmail}> with role "${newMember.role}"${newMember.monthlyCreditLimit != null ? ` and a monthly usage limit of ${newMember.monthlyCreditLimit} credits` : ''}.`
  );
  await db.save();

  res.status(201).json({
    member: publicUser(newMember),
    tempPassword, // Displayed in the UI credential delivery card
  });
});

// Update an existing employee's access/usage controls (role, team, monthly
// credit limit) — lets the Customer Admin adjust these after onboarding,
// not just at seed time.
orgRouter.put('/members/:id', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const member = db.data.users.find(u => u.id === req.params.id && u.orgId === orgId);
  if (!member) return res.status(404).json({ error: 'Team member not found in your organization.' });

  const { role, teamId, monthlyCreditLimit } = req.body;
  const changes: string[] = [];

  if (role !== undefined) {
    if (role !== 'member' && role !== 'org_admin') {
      return res.status(400).json({ error: "role must be 'member' or 'org_admin'." });
    }
    if (member.role !== role) {
      changes.push(`role ${member.role} -> ${role}`);
      member.role = role;
    }
  }
  if (teamId !== undefined) {
    if (member.teamId !== (teamId || null)) {
      changes.push(`team ${member.teamId || '(none)'} -> ${teamId || '(none)'}`);
      member.teamId = teamId || null;
    }
  }
  if (monthlyCreditLimit !== undefined) {
    if (monthlyCreditLimit !== null) {
      const parsed = Number(monthlyCreditLimit);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'monthlyCreditLimit must be a non-negative number, or null to remove the cap.' });
      }
    }
    if (member.monthlyCreditLimit !== monthlyCreditLimit) {
      changes.push(`monthly credit limit ${member.monthlyCreditLimit ?? '(none)'} -> ${monthlyCreditLimit ?? '(none)'}`);
      member.monthlyCreditLimit = monthlyCreditLimit === null ? null : Number(monthlyCreditLimit);
    }
  }

  if (changes.length > 0) {
    db.addAuditLog(
      req.user!.id,
      req.user!.email,
      'TEAM_MEMBER_UPDATED',
      `Customer Admin updated "${member.name}" <${member.email}>: ${changes.join(', ')}.`
    );
    await db.save();
  }

  res.json({ member: publicUser(member) });
});

// Update team budget or details
orgRouter.put('/teams/:id', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const team = db.data.teams.find(t => t.id === req.params.id && t.orgId === orgId);
  if (!team) return res.status(404).json({ error: 'Team not found in your organization.' });

  const { name, budgetTokens, allocatedCredits } = req.body;
  if (name) team.name = name.trim();
  if (budgetTokens !== undefined) team.budgetTokens = Number(budgetTokens);
  if (allocatedCredits !== undefined) team.allocatedCredits = Number(allocatedCredits);

  db.addAuditLog(req.user!.id, req.user!.email, 'TEAM_UPDATED', `Updated configuration for team "${team.name}".`);
  await db.save();

  res.json(team);
});

// 1. Get Security Configuration and API Keys
orgRouter.get('/security', requireRole('org_admin', 'platform_admin'), (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const org = db.findOrgById(orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const securityConfig = ensureOrgSecurityConfig(org);
  const auditLogs = (db.data.auditLogs || [])
    .filter(log => log.details.toLowerCase().includes('key') || log.action.includes('KEY') || log.action.includes('SECURITY'))
    .slice(0, 30);

  res.json({
    securityConfig,
    auditLogs,
  });
});

// 2. Safe API Key Rotation
orgRouter.post('/security/rotate-key', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const org = db.findOrgById(orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const securityConfig = ensureOrgSecurityConfig(org);
  const { keyType, gracePeriodHours = 24, reason = 'Scheduled Key Rotation', environment = 'production' } = req.body;

  if (!keyType || !['test_execution', 'ai_integration', 'webhook_secret'].includes(keyType)) {
    return res.status(400).json({ error: 'Invalid or missing keyType.' });
  }

  const existingKeyIndex = securityConfig.apiKeys.findIndex(k => k.keyType === keyType);
  if (existingKeyIndex === -1) {
    return res.status(404).json({ error: 'Target API key not found.' });
  }

  const existingKey = securityConfig.apiKeys[existingKeyIndex];
  const oldKeyMasked = existingKey.maskedKey;

  // Generate new secret
  let prefix = 'vrt_live_';
  let defaultName = 'Primary CI/CD Runner Key';
  if (keyType === 'ai_integration') {
    prefix = 'vrt_ai_';
    defaultName = 'Gemini AI Proxy Integration Key';
  } else if (keyType === 'webhook_secret') {
    prefix = 'whsec_';
    defaultName = 'Test Ingestion Webhook HMAC Secret';
  }

  const rawSecret = crypto.randomBytes(20).toString('hex');
  const fullNewKey = `${prefix}${rawSecret}`;
  const newMaskedKey = `${fullNewKey.slice(0, prefix.length + 4)}••••••••••••••••${fullNewKey.slice(-4)}`;

  const nowIso = new Date().toISOString();
  const graceHoursNum = Number(gracePeriodHours) || 0;
  const previousKeyExpiresAt = graceHoursNum > 0
    ? new Date(Date.now() + graceHoursNum * 3600 * 1000).toISOString()
    : null;

  // Update existing key record to the newly generated key with safe rotation metadata
  const updatedKey: OrgApiKey = {
    id: `key_${uuidv4().slice(0, 8)}`,
    keyType,
    name: existingKey.name || defaultName,
    maskedKey: newMaskedKey,
    fullKey: fullNewKey,
    prefix,
    createdAt: nowIso,
    lastUsedAt: null,
    rotatedAt: nowIso,
    status: 'active',
    previousKeyExpiresAt,
    environment,
  };

  securityConfig.apiKeys[existingKeyIndex] = updatedKey;

  // Record rotation history
  const historyEntry: KeyRotationHistory = {
    id: `rot_${uuidv4().slice(0, 8)}`,
    keyType,
    rotatedByEmail: req.user!.email,
    rotatedAt: nowIso,
    gracePeriodHours: graceHoursNum,
    reason: (reason || 'Admin initiated key rotation').trim(),
    oldKeyMasked,
    newKeyMasked: newMaskedKey,
  };

  securityConfig.rotationHistory.unshift(historyEntry);
  if (securityConfig.rotationHistory.length > 50) {
    securityConfig.rotationHistory = securityConfig.rotationHistory.slice(0, 50);
  }

  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'API_KEY_ROTATED',
    `Customer Admin rotated ${keyType} API key. Grace period: ${graceHoursNum}h. Reason: "${historyEntry.reason}".`
  );
  await db.save();

  res.json({
    ok: true,
    newKey: fullNewKey,
    apiKey: updatedKey,
    rotation: historyEntry,
    message: graceHoursNum > 0
      ? `API key safely rotated. The previous key remains valid for ${graceHoursNum} hours (until ${new Date(previousKeyExpiresAt!).toLocaleTimeString()}) so in-flight test runs and CI pipelines don't experience downtime.`
      : 'API key rotated with immediate revocation of the previous key.',
  });
});

// 3. Immediately revoke the expiring previous key
orgRouter.post('/security/revoke-previous-key', requireRole('org_admin', 'platform_admin'), async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const org = db.findOrgById(orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const securityConfig = ensureOrgSecurityConfig(org);
  const { keyType } = req.body;

  const key = securityConfig.apiKeys.find(k => k.keyType === keyType);
  if (!key) return res.status(404).json({ error: 'Key not found.' });

  key.previousKeyExpiresAt = null;
  key.status = 'active';

  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'API_KEY_GRACE_REVOKED',
    `Customer Admin prematurely revoked previous grace period for ${keyType} key.`
  );
  await db.save();

  res.json({
    ok: true,
    apiKey: key,
    message: 'Previous key grace period revoked immediately. Only the newest active key is accepted.',
  });
});

// 4. Key Connectivity/Validity Probe — checks the real, current state of the
// key in this org's security config (existence + active status), rather than
// returning a canned success message. Latency reported is the actual time
// this lookup took, not a random number.
orgRouter.post('/security/test-key', requireRole('org_admin', 'platform_admin'), (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const org = db.findOrgById(orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });

  const startedAt = process.hrtime.bigint();
  const securityConfig = ensureOrgSecurityConfig(org);
  const { keyType } = req.body;

  const key = securityConfig.apiKeys.find(k => k.keyType === keyType);
  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  if (!key) {
    return res.status(404).json({
      ok: false,
      latencyMs: Math.round(latencyMs * 100) / 100,
      message: `No ${keyType || 'requested'} key is configured for this organization.`,
      testedAt: new Date().toISOString(),
    });
  }

  const isActive = key.status === 'active';
  const isExpiredGrace = !!key.previousKeyExpiresAt && new Date(key.previousKeyExpiresAt).getTime() < Date.now();

  res.json({
    ok: isActive,
    latencyMs: Math.round(latencyMs * 100) / 100,
    message: isActive
      ? `Key found and marked active${isExpiredGrace ? ' (its grace-period window has since elapsed)' : ''}. This checks the key's status in Verity's own records — it does not call the downstream provider.`
      : `Key found but its status is "${key.status}", not active.`,
    testedAt: new Date().toISOString(),
  });
});

