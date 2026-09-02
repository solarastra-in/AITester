const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

const TEMPLATE_DIR = path.join(__dirname, '..', 'standalone-template');

router.get('/:projectId/download', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const isOwner = project.owner_user_id === req.user.id;
  const isSameOrg = project.org_id && project.org_id === req.user.org_id;
  const isPlatformAdmin = req.user.role === 'platform_admin';
  if (!isOwner && !isSameOrg && !isPlatformAdmin) return res.status(403).json({ error: 'Not authorized for this project' });

  const cases = db.prepare(`
    SELECT tc.* FROM test_cases tc JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = ? ORDER BY tc.created_at ASC
  `).all(project.id);
  const testsJson = cases.map(c => ({
    id: c.ext_id, category: c.category, title: c.title, priority: c.priority,
    tags: c.tags ? c.tags.split(',').filter(Boolean) : [], type: c.type, spec: JSON.parse(c.spec_json),
  }));
  const dataset = JSON.parse(project.dataset_json || '{}');
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'verity-runner';

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-test-runner.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);

  const rootName = `${slug}-test-runner`;

  for (const f of ['package.json', 'Dockerfile', 'docker-compose.yml', 'server.js']) {
    archive.file(path.join(TEMPLATE_DIR, f), { name: `${rootName}/${f}` });
  }
  archive.directory(path.join(TEMPLATE_DIR, 'lib'), `${rootName}/lib`);
  archive.directory(path.join(TEMPLATE_DIR, 'public'), `${rootName}/public`);

  const readmeTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'README.md'), 'utf-8');
  const readme = readmeTemplate
    .replace(/\{\{PROJECT_NAME\}\}/g, project.name)
    .replace(/\{\{SITE_URL\}\}/g, project.site_url)
    .replace(/\{\{EXPORT_DATE\}\}/g, new Date().toISOString().slice(0, 10))
    .replace(/\{\{SLUG\}\}/g, slug);
  archive.append(readme, { name: `${rootName}/README.md` });

  archive.append(JSON.stringify({ name: project.name, site_url: project.site_url }, null, 2), { name: `${rootName}/data/project.json` });
  archive.append(JSON.stringify(testsJson, null, 2), { name: `${rootName}/data/tests.json` });
  archive.append(JSON.stringify(dataset, null, 2), { name: `${rootName}/data/dataset.json` });

  archive.finalize();
});

module.exports = router;
