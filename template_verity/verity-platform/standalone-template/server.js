require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { runTestCase } = require('./lib/genericRunner');
const { parseStructuredJson, parseStructuredCsv, parseMarkdownTable } = require('./lib/specParser');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TESTS_FILE = path.join(DATA_DIR, 'tests.json');
const DATASET_FILE = path.join(DATA_DIR, 'dataset.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const PROJECT_FILE = path.join(DATA_DIR, 'project.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJson(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.get('/api/project', (req, res) => res.json(readJson(PROJECT_FILE, { name: 'Untitled Project', site_url: '' })));

app.get('/api/tests', (req, res) => {
  const tests = readJson(TESTS_FILE, []);
  const results = readJson(RESULTS_FILE, {});
  res.json(tests.map(t => ({ ...t, lastResult: results[t.id] || null })));
});

app.get('/api/dataset', (req, res) => res.json(readJson(DATASET_FILE, { baseUrl: '', authTokens: {} })));
app.put('/api/dataset', (req, res) => { writeJson(DATASET_FILE, req.body); res.json(req.body); });
app.patch('/api/dataset', (req, res) => {
  const { path: dottedPath, value } = req.body;
  const dataset = readJson(DATASET_FILE, {});
  const parts = dottedPath.split('.');
  let cur = dataset;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = value;
  writeJson(DATASET_FILE, dataset);
  res.json(dataset);
});

app.post('/api/tests/upload', (req, res) => {
  const { name, format, content } = req.body;
  try {
    let cases;
    if (format === 'json') cases = parseStructuredJson(content);
    else if (format === 'csv') cases = parseStructuredCsv(content);
    else cases = parseMarkdownTable(content, name || 'Imported');
    if (!cases.length) return res.status(400).json({ error: 'No test cases parsed.' });
    const existing = readJson(TESTS_FILE, []);
    const withIds = cases.map(c => ({ id: c.ext_id, category: c.category, title: c.title, priority: c.priority, tags: c.tags ? c.tags.split(',').filter(Boolean) : [], type: c.type, spec: c.spec, dataFields: c.dataFields }));
    writeJson(TESTS_FILE, [...existing, ...withIds]);
    res.status(201).json({ added: withIds.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function runAndStore(testId, project, dataset) {
  const tests = readJson(TESTS_FILE, []);
  const t = tests.find(x => x.id === testId);
  if (!t) return { error: 'Test not found', status: 404 };
  if (t.type === 'manual') return { error: 'Manual test — use manual-result endpoint', status: 400 };
  let result;
  try {
    result = await runTestCase(t, dataset, project.site_url);
  } catch (err) {
    result = { pass: false, message: `Runner error: ${err.message}` };
  }
  const results = readJson(RESULTS_FILE, {});
  results[testId] = { ...result, ranAt: new Date().toISOString() };
  writeJson(RESULTS_FILE, results);
  return { result: results[testId] };
}

app.post('/api/tests/:id/run', async (req, res) => {
  const project = readJson(PROJECT_FILE, {});
  const dataset = readJson(DATASET_FILE, {});
  const { result, error, status } = await runAndStore(req.params.id, project, dataset);
  if (error) return res.status(status).json({ error });
  res.json({ id: req.params.id, ...result });
});

app.post('/api/tests/run-all', async (req, res) => {
  const project = readJson(PROJECT_FILE, {});
  const dataset = readJson(DATASET_FILE, {});
  const tests = readJson(TESTS_FILE, []).filter(t => t.type !== 'manual');
  const out = [];
  for (const t of tests) {
    const { result } = await runAndStore(t.id, project, dataset);
    out.push({ id: t.id, ...result });
  }
  res.json(out);
});

app.post('/api/tests/:id/manual-result', (req, res) => {
  const { pass, notes } = req.body;
  const results = readJson(RESULTS_FILE, {});
  results[req.params.id] = { type: 'manual', pass: !!pass, message: notes || '(no notes)', ranAt: new Date().toISOString() };
  writeJson(RESULTS_FILE, results);
  res.json({ ok: true });
});

app.get('/api/export', (req, res) => {
  const tests = readJson(TESTS_FILE, []);
  const results = readJson(RESULTS_FILE, {});
  const rows = tests.map(t => {
    const r = results[t.id];
    return { id: t.id, category: t.category, title: t.title, priority: t.priority, type: t.type, verdict: r ? (r.pass ? 'PASS' : 'FAIL') : 'NOT RUN', ranAt: r ? r.ranAt : '', message: r ? r.message : '' };
  });
  if (req.query.format === 'csv') {
    const header = Object.keys(rows[0] || {}).join(',');
    const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    return res.send(`${header}\n${body}`);
  }
  res.json({ generatedAt: new Date().toISOString(), rows });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => console.log(`Standalone Verity test runner listening on :${PORT}`));
