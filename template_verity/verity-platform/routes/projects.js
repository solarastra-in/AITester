const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { parseStructuredJson, parseStructuredCsv, parseMarkdownTable } = require('../lib/specParser');
const { runTestCase } = require('../lib/genericRunner');
const { generateTestCases } = require('../lib/aiGenerate');
const { chargeCredits, CREDIT_COST_PER_RUN } = require('../lib/billing');

const router = express.Router();
router.use(requireAuth);

const PREVIEW_DAILY_CAP = Number(process.env.PREVIEW_DAILY_CAP || 15);

function loadProject(req, res, next) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId || req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const isOwner = project.owner_user_id === req.user.id;
  const isSameOrg = project.org_id && project.org_id === req.user.org_id;
  const isPlatformAdmin = req.user.role === 'platform_admin';
  if (!isOwner && !isSameOrg && !isPlatformAdmin) return res.status(403).json({ error: 'Not authorized for this project' });
  req.project = project;
  req.dataset = JSON.parse(project.dataset_json || '{}');
  next();
}

// ---- Projects ---------------------------------------------------------------
router.get('/', (req, res) => {
  const rows = req.user.org_id
    ? db.prepare('SELECT * FROM projects WHERE org_id = ? ORDER BY created_at DESC').all(req.user.org_id)
    : db.prepare('SELECT * FROM projects WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, site_url, description } = req.body;
  if (!name || !site_url) return res.status(400).json({ error: 'name and site_url are required' });
  const id = uuid();
  db.prepare('INSERT INTO projects (id, owner_user_id, org_id, name, site_url, description, dataset_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, req.user.org_id || null, name, site_url, description || '', JSON.stringify({ baseUrl: site_url, authTokens: {} }), new Date().toISOString());
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

router.get('/:id', loadProject, (req, res) => {
  const suites = db.prepare('SELECT * FROM suites WHERE project_id = ? ORDER BY created_at DESC').all(req.project.id);
  res.json({ ...req.project, suites });
});

// ---- Dataset -----------------------------------------------------------------
router.get('/:id/dataset', loadProject, (req, res) => res.json(req.dataset));

router.put('/:id/dataset', loadProject, (req, res) => {
  db.prepare('UPDATE projects SET dataset_json = ? WHERE id = ?').run(JSON.stringify(req.body), req.project.id);
  res.json(req.body);
});

router.patch('/:id/dataset', loadProject, (req, res) => {
  const { path: dottedPath, value } = req.body;
  if (!dottedPath) return res.status(400).json({ error: 'path is required' });
  const dataset = req.dataset;
  const parts = dottedPath.split('.');
  let cur = dataset;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  db.prepare('UPDATE projects SET dataset_json = ? WHERE id = ?').run(JSON.stringify(dataset), req.project.id);
  res.json(dataset);
});

// ---- Suites: upload structured / markdown / AI-generate ---------------------
function insertSuite(projectId, name, source, cases) {
  const suiteId = uuid();
  db.prepare('INSERT INTO suites (id, project_id, name, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(suiteId, projectId, name, source, new Date().toISOString());
  const insertCase = db.prepare('INSERT INTO test_cases (id, suite_id, ext_id, category, title, priority, tags, type, spec_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const c of cases) {
    insertCase.run(uuid(), suiteId, c.ext_id, c.category, c.title, c.priority, c.tags, c.type, JSON.stringify(c.spec), new Date().toISOString());
  }
  return suiteId;
}

router.post('/:id/suites/upload', loadProject, (req, res) => {
  const { name, format, content } = req.body; // format: 'json' | 'csv' | 'markdown'
  if (!content) return res.status(400).json({ error: 'content is required' });
  try {
    let cases;
    if (format === 'json') cases = parseStructuredJson(content);
    else if (format === 'csv') cases = parseStructuredCsv(content);
    else cases = parseMarkdownTable(content, name || 'Imported');
    if (!cases.length) return res.status(400).json({ error: 'No test cases could be parsed from that content.' });
    const suiteId = insertSuite(req.project.id, name || `Imported ${new Date().toLocaleDateString()}`, 'uploaded', cases);
    res.status(201).json({ suiteId, caseCount: cases.length, autoDetectedManual: cases.filter(c => c.type === 'manual').length });
  } catch (err) {
    res.status(400).json({ error: `Failed to parse upload: ${err.message}` });
  }
});

router.post('/:id/suites/generate', loadProject, async (req, res) => {
  const { name, provider, apiKey, model, description, existingPlanText } = req.body;
  try {
    const cases = await generateTestCases({
      provider: provider || 'anthropic', apiKey, model,
      siteUrl: req.project.site_url, description, existingPlanText,
    });
    if (!cases.length) return res.status(502).json({ error: 'The model returned no parseable test cases.' });
    const suiteId = insertSuite(req.project.id, name || 'AI-generated suite', 'ai_generated', cases);
    res.status(201).json({ suiteId, caseCount: cases.length });
  } catch (err) {
    res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
  }
});

router.delete('/:id/suites/:suiteId', loadProject, (req, res) => {
  db.prepare('DELETE FROM test_cases WHERE suite_id = ?').run(req.params.suiteId);
  db.prepare('DELETE FROM suites WHERE id = ? AND project_id = ?').run(req.params.suiteId, req.project.id);
  res.json({ ok: true });
});

// ---- Test cases ---------------------------------------------------------------
router.get('/:id/cases', loadProject, (req, res) => {
  const cases = db.prepare(`
    SELECT tc.*, s.name as suite_name FROM test_cases tc
    JOIN suites s ON s.id = tc.suite_id
    WHERE s.project_id = ? ORDER BY tc.created_at ASC
  `).all(req.project.id);
  const lastRuns = db.prepare(`
    SELECT tr.* FROM test_runs tr
    INNER JOIN (SELECT test_case_id, MAX(ran_at) as maxRan FROM test_runs WHERE project_id = ? GROUP BY test_case_id) latest
    ON tr.test_case_id = latest.test_case_id AND tr.ran_at = latest.maxRan
  `).all(req.project.id);
  const lastRunByCase = Object.fromEntries(lastRuns.map(r => [r.test_case_id, r]));
  res.json(cases.map(c => ({
    ...c,
    spec: JSON.parse(c.spec_json),
    tags: c.tags ? c.tags.split(',').filter(Boolean) : [],
    lastResult: lastRunByCase[c.id] ? {
      pass: !!lastRunByCase[c.id].pass, message: lastRunByCase[c.id].message,
      ranAt: lastRunByCase[c.id].ran_at, executedBy: lastRunByCase[c.id].executed_by,
      requests: lastRunByCase[c.id].requests_json ? JSON.parse(lastRunByCase[c.id].requests_json) : null,
    } : null,
  })));
});

// ---- Execution ---------------------------------------------------------------
function billingScope(req) {
  return req.project.org_id ? { orgId: req.project.org_id } : { userId: req.user.id };
}

function previewCountToday(projectId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return db.prepare("SELECT COUNT(*) n FROM test_runs WHERE project_id = ? AND executed_by = 'preview' AND ran_at > ?").get(projectId, since).n;
}

async function executeAndStore(req, res, mode) {
  const testCase = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.caseId);
  if (!testCase) return res.status(404).json({ error: 'Test case not found' });
  const normalized = { type: testCase.type, spec: JSON.parse(testCase.spec_json) };
  if (normalized.type === 'manual') return res.status(400).json({ error: 'This is a manual case — POST to manual-result instead.' });

  if (mode === 'preview') {
    const count = previewCountToday(req.project.id);
    if (count >= PREVIEW_DAILY_CAP) {
      return res.status(429).json({ error: `Free preview cap reached (${PREVIEW_DAILY_CAP}/day for this project). Use hosted execution (credits) or download the Docker package to run unlimited tests on your own infrastructure.` });
    }
  }

  let creditsCharged = 0;
  if (mode === 'hosted') {
    try {
      chargeCredits({ ...billingScope(req), amount: CREDIT_COST_PER_RUN, reason: `Hosted run: ${testCase.ext_id} (${req.project.name})` });
      creditsCharged = CREDIT_COST_PER_RUN;
    } catch (err) {
      if (err.code === 'INSUFFICIENT_CREDITS') return res.status(402).json({ error: err.message });
      throw err;
    }
  }

  let result;
  try {
    result = await runTestCase(normalized, req.dataset, req.project.site_url);
  } catch (err) {
    result = { pass: false, message: `Runner error: ${err.message}` };
  }

  db.prepare(`INSERT INTO test_runs (id, project_id, test_case_id, ran_at, pass, message, requests_json, executed_by, credits_charged, run_by_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuid(), req.project.id, testCase.id, new Date().toISOString(), result.pass ? 1 : 0, result.message,
         JSON.stringify(result.requests || result.stats || null), mode, creditsCharged, req.user.id);

  res.json({ id: testCase.id, extId: testCase.ext_id, ...result, executedBy: mode, creditsCharged });
}

router.post('/:id/cases/:caseId/run', loadProject, (req, res) => executeAndStore(req, res, 'preview'));
router.post('/:id/cases/:caseId/run-hosted', loadProject, (req, res) => executeAndStore(req, res, 'hosted'));

router.post('/:id/cases/:caseId/manual-result', loadProject, (req, res) => {
  const testCase = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.caseId);
  if (!testCase) return res.status(404).json({ error: 'Test case not found' });
  const { pass, notes } = req.body;
  db.prepare(`INSERT INTO test_runs (id, project_id, test_case_id, ran_at, pass, message, requests_json, executed_by, credits_charged, run_by_user_id)
              VALUES (?, ?, ?, ?, ?, ?, NULL, 'manual', 0, ?)`)
    .run(uuid(), req.project.id, testCase.id, new Date().toISOString(), pass ? 1 : 0, notes || '(no notes recorded)', req.user.id);
  res.json({ ok: true });
});

router.post('/:id/run-all', loadProject, async (req, res) => {
  const mode = req.body.mode === 'hosted' ? 'hosted' : 'preview';
  const cases = db.prepare(`
    SELECT tc.* FROM test_cases tc JOIN suites s ON s.id = tc.suite_id
    WHERE s.project_id = ? AND tc.type != 'manual'
  `).all(req.project.id);

  const results = [];
  for (const testCase of cases) {
    if (mode === 'preview' && previewCountToday(req.project.id) >= PREVIEW_DAILY_CAP) {
      results.push({ id: testCase.id, extId: testCase.ext_id, pass: false, message: 'Skipped — free preview daily cap reached.' });
      continue;
    }
    let creditsCharged = 0;
    if (mode === 'hosted') {
      try {
        chargeCredits({ ...billingScope(req), amount: CREDIT_COST_PER_RUN, reason: `Hosted run: ${testCase.ext_id} (${req.project.name})` });
        creditsCharged = CREDIT_COST_PER_RUN;
      } catch (err) {
        results.push({ id: testCase.id, extId: testCase.ext_id, pass: false, message: 'Skipped — insufficient credits.' });
        continue;
      }
    }
    const normalized = { type: testCase.type, spec: JSON.parse(testCase.spec_json) };
    let result;
    try {
      result = await runTestCase(normalized, req.dataset, req.project.site_url);
    } catch (err) {
      result = { pass: false, message: `Runner error: ${err.message}` };
    }
    db.prepare(`INSERT INTO test_runs (id, project_id, test_case_id, ran_at, pass, message, requests_json, executed_by, credits_charged, run_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), req.project.id, testCase.id, new Date().toISOString(), result.pass ? 1 : 0, result.message,
           JSON.stringify(result.requests || result.stats || null), mode, creditsCharged, req.user.id);
    results.push({ id: testCase.id, extId: testCase.ext_id, ...result, creditsCharged });
  }
  res.json(results);
});

// ---- Export ---------------------------------------------------------------
router.get('/:id/export', loadProject, (req, res) => {
  const cases = db.prepare(`
    SELECT tc.* FROM test_cases tc JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = ?
  `).all(req.project.id);
  const lastRuns = db.prepare(`
    SELECT tr.* FROM test_runs tr
    INNER JOIN (SELECT test_case_id, MAX(ran_at) as maxRan FROM test_runs WHERE project_id = ? GROUP BY test_case_id) latest
    ON tr.test_case_id = latest.test_case_id AND tr.ran_at = latest.maxRan
  `).all(req.project.id);
  const lastByCase = Object.fromEntries(lastRuns.map(r => [r.test_case_id, r]));

  const rows = cases.map(c => {
    const r = lastByCase[c.id];
    return {
      id: c.ext_id, category: c.category, title: c.title, priority: c.priority, type: c.type, tags: c.tags,
      verdict: r ? (r.pass ? 'PASS' : 'FAIL') : 'NOT RUN', ranAt: r ? r.ran_at : '', message: r ? r.message : '',
    };
  });

  if (req.query.format === 'csv') {
    const header = Object.keys(rows[0] || { id: '', category: '', title: '', priority: '', type: '', tags: '', verdict: '', ranAt: '', message: '' }).join(',');
    const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.project.name.replace(/\W+/g, '_')}-report.csv"`);
    return res.send(`${header}\n${body}`);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${req.project.name.replace(/\W+/g, '_')}-report.json"`);
  res.json({ project: req.project.name, siteUrl: req.project.site_url, generatedAt: new Date().toISOString(), rows });
});

module.exports = router;
