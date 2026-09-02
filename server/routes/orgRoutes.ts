import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { requireAuth, requireRole, AuthRequest, publicUser } from '../auth.js';
import { User, Team } from '../types.js';

export const orgRouter = Router();

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

  const members = db.data.users.filter(u => u.orgId === orgId).map(publicUser);
  const teams = db.data.teams.filter(t => t.orgId === orgId);
  const projects = db.data.projects.filter(p => p.orgId === orgId);
  const ledger = db.data.creditLedger.filter(l => l.orgId === orgId).slice(0, 50);

  res.json({
    organization: org,
    members,
    teams,
    projects,
    ledger,
  });
});

// Customer Admin Journey: Seed a new team with resource/token budget
orgRouter.post('/teams', requireRole('org_admin', 'platform_admin'), (req: AuthRequest, res: Response) => {
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
  db.save();

  res.status(201).json(newTeam);
});

// Customer Admin Journey: Seed & Invite Team Member
orgRouter.post('/members', requireRole('org_admin', 'platform_admin'), (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  if (!orgId) return res.status(400).json({ error: 'No organization attached to account.' });

  const { email, name, role = 'member', teamId } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required to seed team member.' });
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
    mustResetPassword: true,
    createdAt: new Date().toISOString(),
  };

  db.data.users.push(newMember);
  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'TEAM_MEMBER_SEEDED',
    `Customer Admin seeded new team member "${name}" <${normalizedEmail}> with role "${newMember.role}".`
  );
  db.save();

  res.status(201).json({
    member: publicUser(newMember),
    tempPassword, // Displayed in the UI credential delivery card
  });
});

// Update team budget or details
orgRouter.put('/teams/:id', requireRole('org_admin', 'platform_admin'), (req: AuthRequest, res: Response) => {
  const orgId = req.user!.orgId;
  const team = db.data.teams.find(t => t.id === req.params.id && t.orgId === orgId);
  if (!team) return res.status(404).json({ error: 'Team not found in your organization.' });

  const { name, budgetTokens, allocatedCredits } = req.body;
  if (name) team.name = name.trim();
  if (budgetTokens !== undefined) team.budgetTokens = Number(budgetTokens);
  if (allocatedCredits !== undefined) team.allocatedCredits = Number(allocatedCredits);

  db.addAuditLog(req.user!.id, req.user!.email, 'TEAM_UPDATED', `Updated configuration for team "${team.name}".`);
  db.save();

  res.json(team);
});
