import * as archiverModule from 'archiver';
const archiver: any = (archiverModule as any).default || archiverModule;
import { Response } from 'express';
import { Project, TestCase } from './types.js';

export function buildStandalonePackage(project: Project, cases: TestCase[], res: Response) {
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'verity-test-runner';
  const rootName = `${slug}-cloud-runner`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-test-runner.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Archive build error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  archive.pipe(res);

  // 1. Standalone package.json
  const standalonePackageJson = {
    name: `${slug}-runner`,
    version: '1.0.0',
    description: `Standalone automated test runner for ${project.name}`,
    main: 'server.js',
    scripts: {
      start: 'node server.js',
      test: 'node run-cli.js',
    },
    dependencies: {
      axios: '^1.7.9',
      dotenv: '^16.4.7',
      express: '^4.21.2',
    },
  };
  archive.append(JSON.stringify(standalonePackageJson, null, 2), { name: `${rootName}/package.json` });

  // 2. Standalone Dockerfile
  const dockerfile = `# Multi-Stage production test runner for ${project.name}
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install --production --no-audit

FROM node:20-alpine AS release
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY run-cli.js ./
COPY run-cli.sh ./
RUN chmod +x run-cli.sh
COPY lib/ ./lib/
COPY public/ ./public/
COPY data/ ./data/

ENV PORT=4100
ENV NODE_ENV=production
EXPOSE 4100

VOLUME ["/app/data"]
CMD ["node", "server.js"]
`;
  archive.append(dockerfile, { name: `${rootName}/Dockerfile` });

  // 3. docker-compose.yml
  const dockerCompose = `version: '3.8'

services:
  ${slug}-runner:
    build: .
    image: ${slug}-test-runner:latest
    container_name: ${slug}-runner
    ports:
      - "4100:4100"
    environment:
      - PORT=4100
      - NODE_ENV=production
      - DATA_DIR=/app/data
    volumes:
      - verity_runner_data:/app/data
    restart: unless-stopped

volumes:
  verity_runner_data:
    driver: local
`;
  archive.append(dockerCompose, { name: `${rootName}/docker-compose.yml` });

  // 4. Standalone server.js
  const standaloneServer = `require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { runTestCase } = require('./lib/genericRunner');
const { parseStructuredJson, parseStructuredCsv, parseMarkdownTable } = require('./lib/specParser');

const app = express();
app.use(express.json({ limit: '10mb' }));
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

app.get('/api/project', (req, res) => res.json(readJson(PROJECT_FILE, { name: '${project.name}', site_url: '${project.siteUrl}' })));

app.get('/api/tests', (req, res) => {
  const tests = readJson(TESTS_FILE, []);
  const results = readJson(RESULTS_FILE, {});
  res.json(tests.map(t => ({ ...t, lastResult: results[t.id] || null })));
});

app.get('/api/dataset', (req, res) => res.json(readJson(DATASET_FILE, { baseUrl: '${project.siteUrl}', authTokens: {} })));
app.put('/api/dataset', (req, res) => { writeJson(DATASET_FILE, req.body); res.json(req.body); });

app.patch('/api/dataset', (req, res) => {
  const { path: dottedPath, value } = req.body;
  const dataset = readJson(DATASET_FILE, {});
  const parts = (dottedPath || '').split('.');
  let cur = dataset;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (parts.length) cur[parts[parts.length - 1]] = value;
  writeJson(DATASET_FILE, dataset);
  res.json(dataset);
});

async function runAndStore(testId, project, dataset) {
  const tests = readJson(TESTS_FILE, []);
  const t = tests.find(x => x.id === testId);
  if (!t) return { error: 'Test case not found', status: 404 };
  if (t.type === 'manual') return { error: 'Manual test - record manual result', status: 400 };
  let result;
  try {
    result = await runTestCase(t, dataset, project.site_url || project.siteUrl);
  } catch (err) {
    result = { pass: false, message: 'Runner error: ' + err.message };
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
  if (error) return res.status(status || 500).json({ error });
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

app.get('/api/export', (req, res) => {
  const tests = readJson(TESTS_FILE, []);
  const results = readJson(RESULTS_FILE, {});
  const rows = tests.map(t => {
    const r = results[t.id];
    return {
      id: t.id,
      category: t.category,
      title: t.title,
      priority: t.priority,
      type: t.type,
      verdict: r ? (r.pass ? 'PASS' : 'FAIL') : 'NOT RUN',
      ranAt: r ? r.ranAt : '',
      message: r ? r.message : '',
    };
  });
  if (req.query.format === 'csv') {
    const header = ['id', 'category', 'title', 'priority', 'type', 'verdict', 'ranAt', 'message'].join(',');
    const body = rows.map(r => Object.values(r).map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="test-report.csv"');
    return res.send(header + '\\n' + body);
  }
  res.json({ project: '${project.name}', siteUrl: '${project.siteUrl}', generatedAt: new Date().toISOString(), rows });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: '${slug}-test-runner' }));

const PORT = process.env.PORT || 4100;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Verity Standalone Runner running on http://localhost:' + PORT);
});
`;
  archive.append(standaloneServer, { name: `${rootName}/server.js` });

  // 5. Standalone CLI Runner (run-cli.js)
  const cliRunner = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runTestCase } = require('./lib/genericRunner');

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const project = JSON.parse(fs.readFileSync(path.join(dataDir, 'project.json'), 'utf-8'));
  const dataset = JSON.parse(fs.readFileSync(path.join(dataDir, 'dataset.json'), 'utf-8'));
  const tests = JSON.parse(fs.readFileSync(path.join(dataDir, 'tests.json'), 'utf-8'));

  console.log('====================================================');
  console.log('🚀 Running Verity Test Suite: ' + project.name);
  console.log('🎯 Target Site URL: ' + (project.site_url || project.siteUrl));
  console.log('🧪 Total Cases: ' + tests.length);
  console.log('====================================================\\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of tests) {
    if (t.type === 'manual') {
      console.log('⚠️  [' + t.id + '] ' + t.title + ' -> SKIPPED (Manual test)');
      skipped++;
      continue;
    }
    process.stdout.write('⏳ [' + t.id + '] ' + t.title + ' ... ');
    try {
      const result = await runTestCase(t, dataset, project.site_url || project.siteUrl);
      if (result.pass) {
        console.log('✅ PASS (' + result.message + ')');
        passed++;
      } else {
        console.log('❌ FAIL (' + result.message + ')');
        failed++;
      }
    } catch (err) {
      console.log('❌ ERROR (' + err.message + ')');
      failed++;
    }
  }

  console.log('\\n====================================================');
  console.log('📊 Summary: ' + passed + ' Passed | ' + failed + ' Failed | ' + skipped + ' Skipped');
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
`;
  archive.append(cliRunner, { name: `${rootName}/run-cli.js` });

  const runCliSh = `#!/bin/bash
set -e
echo "Starting Verity Standalone Automated Suite..."
npm install --silent
node run-cli.js
`;
  archive.append(runCliSh, { name: `${rootName}/run-cli.sh` });

  // 6. lib/specParser.js
  const specParserJs = `const PLACEHOLDER_RE = /\\{\\{([a-zA-Z0-9_.]+)\\}\\}/g;

function get(obj, dottedPath, fallback) {
  const parts = (dottedPath || '').split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function resolveTemplates(value, dataset) {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER_RE, (_, path) => {
      const v = get(dataset, path, '');
      return v == null ? '' : String(v);
    });
  }
  if (Array.isArray(value)) return value.map(v => resolveTemplates(v, dataset));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = resolveTemplates(value[k], dataset);
    return out;
  }
  return value;
}

module.exports = { get, resolveTemplates };
`;
  archive.append(specParserJs, { name: `${rootName}/lib/specParser.js` });

  // 7. lib/genericRunner.js
  const genericRunnerJs = `const axios = require('axios');
const { resolveTemplates, get } = require('./specParser');

function buildClient(baseUrl) {
  return axios.create({ baseURL: baseUrl, timeout: 25000, validateStatus: () => true });
}

function authHeader(dataset, personaKey) {
  if (!personaKey) return {};
  const token = get(dataset, 'authTokens.' + personaKey) || get(dataset, personaKey);
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function fireRequest(client, req) {
  const started = Date.now();
  try {
    const resp = await client.request({
      method: req.method,
      url: req.path,
      headers: req.headers,
      data: req.body,
      timeout: req.timeout || 20000,
    });
    return { name: req.name, method: req.method, url: req.path, status: resp.status, data: resp.data, durationMs: Date.now() - started, error: null };
  } catch (err) {
    return { name: req.name, method: req.method, url: req.path, status: null, data: null, durationMs: Date.now() - started, error: err.code || err.message };
  }
}

function bodyToString(data) {
  try { return typeof data === 'string' ? data : JSON.stringify(data); } catch { return String(data); }
}

async function runHttp(testCase, dataset, siteUrl) {
  const client = buildClient(siteUrl);
  const spec = testCase.spec || {};
  const requests = spec.requests || [];
  const expect = spec.expect || {};
  const responses = [];

  for (const r of requests) {
    const resolved = {
      name: r.name,
      method: r.method,
      path: resolveTemplates(r.path, dataset),
      headers: { ...authHeader(dataset, r.authPersona), ...resolveTemplates(r.headers || {}, dataset) },
      body: r.body !== undefined ? resolveTemplates(r.body, dataset) : undefined,
    };
    responses.push(await fireRequest(client, resolved));
  }

  const errored = responses.filter(r => r.status == null);
  let pass, message;
  if (errored.length) {
    pass = false;
    message = errored.length + ' request(s) failed to connect: ' + errored.map(e => e.name + ' (' + e.error + ')').join(', ');
  } else {
    const expectedStatus = expect.statusIn || [200];
    const statusOk = responses.every(r => expectedStatus.includes(r.status));
    const bodies = responses.map(r => bodyToString(r.data).toLowerCase());
    const containsOk = (expect.bodyContains || []).every(needle => bodies.some(b => b.includes(needle.toLowerCase())));
    const notContainsOk = (expect.bodyNotContains || []).every(needle => bodies.every(b => !b.includes(needle.toLowerCase())));
    pass = statusOk && containsOk && notContainsOk;
    const parts = [];
    parts.push(statusOk ? 'Status OK (' + responses.map(r => r.status).join(',') + ')' : 'Status MISMATCH (expected ' + JSON.stringify(expectedStatus) + ', got ' + responses.map(r => r.status).join(',') + ')');
    if ((expect.bodyContains || []).length) parts.push(containsOk ? 'Required substrings found' : 'Missing substrings');
    message = parts.join('; ');
  }

  return {
    pass,
    message,
    requests: responses.map(r => ({
      name: r.name,
      method: r.method,
      url: r.url,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
      dataPreview: bodyToString(r.data).slice(0, 500),
    })),
  };
}

async function runLoad(testCase, dataset, siteUrl) {
  const client = buildClient(siteUrl);
  const spec = testCase.spec || {};
  const request = spec.request;
  const totalRequests = spec.totalRequests || 10;
  const concurrency = spec.concurrency || 3;
  const expect = spec.expect || {};

  const durations = [];
  const statusCounts = {};
  let idx = 0;

  async function worker() {
    while (idx < totalRequests) {
      const i = idx++;
      const resolved = {
        name: (request.name || 'Load probe') + ' #' + (i + 1),
        method: request.method || 'GET',
        path: resolveTemplates(request.path, dataset),
        headers: { ...authHeader(dataset, request.authPersona), ...resolveTemplates(request.headers || {}, dataset) },
        body: request.body !== undefined ? resolveTemplates(request.body, dataset) : undefined,
      };
      const result = await fireRequest(client, resolved);
      durations.push(result.durationMs);
      const key = result.status == null ? 'error' : String(result.status);
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  durations.sort((a, b) => a - b);
  const pct = (p) => durations.length ? durations[Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))] : 0;
  const stats = { total: totalRequests, statusCounts, p50: pct(50), p95: pct(95), p99: pct(99) };

  return {
    pass: true,
    message: 'Load test complete: p50=' + stats.p50 + 'ms, p95=' + stats.p95 + 'ms, statuses=' + JSON.stringify(statusCounts),
    stats,
  };
}

async function runTestCase(testCase, dataset, siteUrl) {
  if (testCase.type === 'http') return runHttp(testCase, dataset, siteUrl);
  if (testCase.type === 'load') return runLoad(testCase, dataset, siteUrl);
  throw new Error('Test type ' + testCase.type + ' cannot be executed automated');
}

module.exports = { runTestCase };
`;
  archive.append(genericRunnerJs, { name: `${rootName}/lib/genericRunner.js` });

  // 8. Public web interface for standalone package
  const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name} - Verity Self-Hosted Test Runner</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="app">
    <header class="navbar">
      <div class="brand">
        <span class="logo-icon">◈</span>
        <div>
          <h1 id="projName">${project.name}</h1>
          <p id="projUrl">${project.siteUrl}</p>
        </div>
      </div>
      <div class="actions">
        <button id="btnDataset" class="btn secondary">Dataset & Secrets</button>
        <button id="btnExportCsv" class="btn secondary">Export CSV</button>
        <button id="btnRunAll" class="btn primary">Run All Automated Tests</button>
      </div>
    </header>

    <div class="metrics-bar">
      <div class="metric"><span class="val pass" id="mPass">0</span><span class="lbl">Passed</span></div>
      <div class="metric"><span class="val fail" id="mFail">0</span><span class="lbl">Failed</span></div>
      <div class="metric"><span class="val pending" id="mNotRun">0</span><span class="lbl">Not Run</span></div>
      <div class="metric"><span class="val total" id="mTotal">0</span><span class="lbl">Total Cases</span></div>
    </div>

    <main class="content">
      <div id="testCards" class="test-grid"></div>
    </main>
  </div>

  <div id="datasetModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-head">
        <h3>Project Dataset (JSON)</h3>
        <button id="btnCloseModal" class="close-btn">&times;</button>
      </div>
      <p class="modal-desc">Variables available to tests via <code>{{placeholder}}</code> templates.</p>
      <textarea id="datasetText" rows="12"></textarea>
      <div class="modal-foot">
        <button id="btnSaveDataset" class="btn primary">Save Changes</button>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
`;
  archive.append(standaloneHtml, { name: `${rootName}/public/index.html` });

  const standaloneCss = `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0B0F19; color: #E2E8F0; padding: 24px; }
.app { max-width: 1200px; margin: 0 auto; }
.navbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid #1E293B; margin-bottom: 24px; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo-icon { font-size: 24px; color: #38BDF8; }
.brand h1 { font-size: 20px; font-weight: 700; color: #F8FAFC; }
.brand p { font-size: 13px; color: #94A3B8; font-family: 'JetBrains Mono', monospace; }
.actions { display: flex; gap: 10px; }
.btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; transition: 0.15s; }
.btn.primary { background: #38BDF8; color: #0F172A; }
.btn.primary:hover { background: #7DD3FC; }
.btn.secondary { background: #1E293B; color: #E2E8F0; border: 1px solid #334155; }
.btn.secondary:hover { background: #334155; }
.metrics-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.metric { background: #131B2E; border: 1px solid #1E293B; border-radius: 8px; padding: 16px; text-align: center; }
.metric .val { font-size: 28px; font-weight: 700; display: block; }
.metric .val.pass { color: #34D399; }
.metric .val.fail { color: #F87171; }
.metric .val.pending { color: #94A3B8; }
.metric .val.total { color: #38BDF8; }
.metric .lbl { font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
.test-grid { display: grid; gap: 12px; }
.test-card { background: #131B2E; border: 1px solid #1E293B; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; }
.test-info { display: flex; flex-direction: column; gap: 4px; }
.test-title { font-weight: 600; font-size: 15px; color: #F1F5F9; }
.test-meta { font-size: 12px; color: #64748B; display: flex; gap: 8px; align-items: center; }
.badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.badge.http { background: #0284C7; color: white; }
.badge.load { background: #D97706; color: white; }
.badge.manual { background: #475569; color: white; }
.badge.pass { background: #065F46; color: #34D399; }
.badge.fail { background: #7F1D1D; color: #FCA5A5; }
.modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); justify-content: center; align-items: center; }
.modal-backdrop.active { display: flex; }
.modal { background: #131B2E; border: 1px solid #1E293B; border-radius: 12px; width: 90%; max-width: 600px; padding: 24px; }
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.close-btn { background: transparent; border: none; color: #94A3B8; font-size: 24px; cursor: pointer; }
.modal-desc { font-size: 13px; color: #94A3B8; margin-bottom: 12px; }
textarea { width: 100%; background: #0B0F19; border: 1px solid #334155; border-radius: 6px; color: #38BDF8; font-family: 'JetBrains Mono', monospace; padding: 12px; font-size: 13px; resize: vertical; }
.modal-foot { display: flex; justify-content: flex-end; margin-top: 16px; }
`;
  archive.append(standaloneCss, { name: `${rootName}/public/style.css` });

  const standaloneJs = `let tests = [];
let dataset = {};

async function load() {
  const [tRes, dRes] = await Promise.all([
    fetch('/api/tests').then(r => r.json()),
    fetch('/api/dataset').then(r => r.json())
  ]);
  tests = tRes;
  dataset = dRes;
  render();
}

function render() {
  const container = document.getElementById('testCards');
  container.innerHTML = '';

  let pass = 0, fail = 0, notRun = 0;

  tests.forEach(t => {
    const card = document.createElement('div');
    card.className = 'test-card';
    const last = t.lastResult;

    if (last) {
      if (last.pass) pass++; else fail++;
    } else {
      notRun++;
    }

    const statusBadge = last
      ? '<span class="badge ' + (last.pass ? 'pass' : 'fail') + '">' + (last.pass ? 'PASS' : 'FAIL') + '</span>'
      : '<span class="badge" style="background:#334155">NOT RUN</span>';

    card.innerHTML = \`
      <div class="test-info">
        <div class="test-meta">
          <span class="badge \${t.type}">\${t.type}</span>
          <span style="font-family:'JetBrains Mono';font-weight:600">\${t.id}</span>
          <span>•</span>
          <span>\${t.category}</span>
        </div>
        <div class="test-title">\${t.title}</div>
        \${last ? '<div style="font-size:12px;color:' + (last.pass ? '#34D399':'#F87171') + '">' + (last.message || '') + '</div>' : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        \${statusBadge}
        <button class="btn secondary" onclick="runOne('\${t.id}')">Run</button>
      </div>
    \`;
    container.appendChild(card);
  });

  document.getElementById('mPass').innerText = pass;
  document.getElementById('mFail').innerText = fail;
  document.getElementById('mNotRun').innerText = notRun;
  document.getElementById('mTotal').innerText = tests.length;
}

async function runOne(id) {
  const res = await fetch('/api/tests/' + id + '/run', { method: 'POST' });
  const data = await res.json();
  const t = tests.find(x => x.id === id);
  if (t) t.lastResult = data;
  render();
}

document.getElementById('btnRunAll').addEventListener('click', async () => {
  const btn = document.getElementById('btnRunAll');
  btn.innerText = 'Running All Tests...';
  btn.disabled = true;
  await fetch('/api/tests/run-all', { method: 'POST' });
  btn.innerText = 'Run All Automated Tests';
  btn.disabled = false;
  load();
});

document.getElementById('btnExportCsv').addEventListener('click', () => {
  window.location.href = '/api/export?format=csv';
});

const modal = document.getElementById('datasetModal');
document.getElementById('btnDataset').addEventListener('click', () => {
  document.getElementById('datasetText').value = JSON.stringify(dataset, null, 2);
  modal.classList.add('active');
});
document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('btnSaveDataset').addEventListener('click', async () => {
  try {
    const updated = JSON.parse(document.getElementById('datasetText').value);
    await fetch('/api/dataset', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    dataset = updated;
    modal.classList.remove('active');
  } catch (e) {
    alert('Invalid JSON syntax in dataset editor');
  }
});

load();
`;
  archive.append(standaloneJs, { name: `${rootName}/public/app.js` });

  // 9. Deployment Manifests
  // Kubernetes deployment manifest
  const k8sManifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${slug}-runner
  labels:
    app: ${slug}-runner
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${slug}-runner
  template:
    metadata:
      labels:
        app: ${slug}-runner
    spec:
      containers:
      - name: runner
        image: ${slug}-test-runner:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 4100
        env:
        - name: PORT
          value: "4100"
        - name: NODE_ENV
          value: "production"
        resources:
          limits:
            cpu: "1000m"
            memory: "1024Mi"
          requests:
            cpu: "250m"
            memory: "256Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: ${slug}-runner-svc
spec:
  type: ClusterIP
  ports:
  - port: 4100
    targetPort: 4100
  selector:
    app: ${slug}-runner
`;
  archive.append(k8sManifest, { name: `${rootName}/k8s/deployment.yaml` });

  // GCP Cloud Run deploy script
  const gcpDeploySh = `#!/bin/bash
# Google Cloud Run Deployment Script
PROJECT_ID=\${GCP_PROJECT_ID:-\$(gcloud config get-value project)}
SERVICE_NAME="${slug}-runner"
REGION=\${GCP_REGION:-"us-central1"}

echo "Deploying \${SERVICE_NAME} to Google Cloud Run (Project: \${PROJECT_ID}, Region: \${REGION})..."
gcloud builds submit --tag gcr.io/\${PROJECT_ID}/\${SERVICE_NAME}:latest .
gcloud run deploy \${SERVICE_NAME} \\
  --image gcr.io/\${PROJECT_ID}/\${SERVICE_NAME}:latest \\
  --platform managed \\
  --region \${REGION} \\
  --port 4100 \\
  --allow-unauthenticated

echo "Deployment complete!"
`;
  archive.append(gcpDeploySh, { name: `${rootName}/cloud/deploy-gcp.sh` });

  // AWS ECS / App Runner script
  const awsDeploySh = `#!/bin/bash
# AWS ECR & App Runner / ECS Deployment Script
AWS_REGION=\${AWS_REGION:-"us-east-1"}
AWS_ACCOUNT_ID=\$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${slug}-runner"

echo "Building and pushing to AWS ECR (\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com/\${ECR_REPO})..."
aws ecr get-login-password --region \${AWS_REGION} | docker login --username AWS --password-stdin \${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com
aws ecr create-repository --repository-name \${ECR_REPO} --region \${AWS_REGION} || true

docker build -t \${ECR_REPO}:latest .
docker tag \${ECR_REPO}:latest \${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com/\${ECR_REPO}:latest
docker push \${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com/\${ECR_REPO}:latest

echo "Image pushed successfully! Deploy to ECS Fargate or AWS App Runner on Port 4100."
`;
  archive.append(awsDeploySh, { name: `${rootName}/cloud/deploy-aws.sh` });

  // Azure Container Apps script
  const azureDeploySh = `#!/bin/bash
# Azure Container Apps Deployment Script
RESOURCE_GROUP=\${AZURE_RG:-"${slug}-rg"}
CONTAINER_APP_NAME="${slug}-runner"
ACR_NAME=\${AZURE_ACR:-"${slug.replace(/-/g, '')}acr"}

echo "Building in Azure Container Registry: \${ACR_NAME}..."
az acr build --registry \${ACR_NAME} --image \${CONTAINER_APP_NAME}:latest .
az containerapp create \\
  --name \${CONTAINER_APP_NAME} \\
  --resource-group \${RESOURCE_GROUP} \\
  --image \${ACR_NAME}.azurecr.io/\${CONTAINER_APP_NAME}:latest \\
  --target-port 4100 \\
  --ingress external

echo "Azure deployment complete!"
`;
  archive.append(azureDeploySh, { name: `${rootName}/cloud/deploy-azure.sh` });

  // Terraform main.tf
  const terraformTf = `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.0"
    }
  }
}

resource "docker_image" "runner" {
  name = "${slug}-runner:latest"
  build {
    context = "."
  }
}

resource "docker_container" "runner" {
  image = docker_image.runner.image_id
  name  = "${slug}-runner-instance"
  ports {
    internal = 4100
    external = 4100
  }
  env = [
    "PORT=4100",
    "NODE_ENV=production"
  ]
}
`;
  archive.append(terraformTf, { name: `${rootName}/terraform/main.tf` });

  // 10. Comprehensive README.md
  const readmeMd = `# ${project.name} — Standalone Self-Hosted Test Runner

Exported from **Verity Automated Test Platform** on ${new Date().toLocaleDateString()}.
This package is a **100% self-contained, zero-lock-in automated test suite** targeting **${project.siteUrl}**.

---

## ⚡ Quick Start Options

### Option 1: Docker (Recommended)
\`\`\`bash
docker compose up --build -d
# Access interactive web UI at: http://localhost:4100
\`\`\`

### Option 2: Local Node.js
\`\`\`bash
npm install
npm start
# Access interactive web UI at: http://localhost:4100
\`\`\`

### Option 3: Headless CLI (CI/CD Pipelines)
\`\`\`bash
./run-cli.sh
# or: node run-cli.js
\`\`\`

---

## ☁️ Multi-Cloud Deployment Instructions

### 1. Google Cloud (Cloud Run)
Run the automated script in \`cloud/deploy-gcp.sh\` or execute:
\`\`\`bash
gcloud builds submit --tag gcr.io/<PROJECT_ID>/${slug}-runner:latest .
gcloud run deploy ${slug}-runner \\
  --image gcr.io/<PROJECT_ID>/${slug}-runner:latest \\
  --port 4100 \\
  --allow-unauthenticated
\`\`\`

### 2. AWS (ECS Fargate / App Runner)
Run \`cloud/deploy-aws.sh\` to push to Amazon ECR, then deploy as a Fargate service with port 4100.

### 3. Azure (Container Apps)
\`\`\`bash
az acr build --registry <YOUR_ACR> --image ${slug}-runner:latest .
az containerapp create --name ${slug}-runner --image <YOUR_ACR>.azurecr.io/${slug}-runner:latest --target-port 4100 --ingress external
\`\`\`

### 4. Kubernetes
\`\`\`bash
kubectl apply -f k8s/deployment.yaml
\`\`\`

---

## 📦 Package Contents
- \`data/project.json\` — Target site URL and project metadata.
- \`data/tests.json\` — Complete test cases with assertions, headers, and request schemas.
- \`data/dataset.json\` — Dynamic dataset variables (\`{{authTokens}}\`, \`{{userId}}\`, etc.).
- \`public/\` — Self-hosted responsive web dashboard.
- \`lib/\` — Engine-agnostic test executor and template resolver.
- \`run-cli.js\` — Headless test executor returning exit code 0 on success or 1 on failure.

---
© ${new Date().getFullYear()} Verity Platform. Freedom to run anywhere.
`;
  archive.append(readmeMd, { name: `${rootName}/README.md` });

  // 11. Data files
  const testsJson = cases.map(c => ({
    id: c.extId,
    category: c.category,
    title: c.title,
    priority: c.priority,
    tags: c.tags,
    type: c.type,
    spec: c.spec,
    dataFields: c.dataFields,
  }));

  archive.append(JSON.stringify({ name: project.name, site_url: project.siteUrl, description: project.description }, null, 2), { name: `${rootName}/data/project.json` });
  archive.append(JSON.stringify(testsJson, null, 2), { name: `${rootName}/data/tests.json` });
  archive.append(JSON.stringify(project.dataset || { baseUrl: project.siteUrl, authTokens: {} }, null, 2), { name: `${rootName}/data/dataset.json` });

  archive.finalize();
}
