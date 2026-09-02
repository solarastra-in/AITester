import { Router, Response } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../auth.js';
import { buildStandalonePackage } from '../packageExport.js';

export const packageRouter = Router();
packageRouter.use(requireAuth);

packageRouter.get('/:projectId/download', (req: AuthRequest, res: Response) => {
  const project = db.findProjectById(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const isOwner = project.ownerUserId === req.user!.id;
  const isSameOrg = !!(project.orgId && project.orgId === req.user!.orgId);
  const isSuperAdmin = req.user!.role === 'platform_admin';

  if (!isOwner && !isSameOrg && !isSuperAdmin) {
    return res.status(403).json({ error: 'You are not authorized to download this project package.' });
  }

  const suites = db.data.suites.filter(s => s.projectId === project.id);
  const suiteIds = suites.map(s => s.id);
  const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));

  db.addAuditLog(
    req.user!.id,
    req.user!.email,
    'PACKAGE_DOWNLOADED',
    `Downloaded standalone Docker container package for project "${project.name}" (${cases.length} test cases).`
  );

  buildStandalonePackage(project, cases, res);
});
