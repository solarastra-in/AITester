const axios = require('axios');
const { resolveTemplates } = require('./specParser');

function buildClient(baseUrl) {
  return axios.create({ baseURL: baseUrl, timeout: 20000, validateStatus: () => true });
}

function authHeader(dataset, personaKey) {
  if (!personaKey) return {};
  const token = dataset.authTokens && dataset.authTokens[personaKey];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fireRequest(client, req) {
  const started = Date.now();
  try {
    const resp = await client.request({ method: req.method, url: req.path, headers: req.headers, data: req.body, timeout: req.timeout || 20000 });
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
  const { requests, expect } = testCase.spec;
  const responses = [];
  for (const r of requests) {
    const resolved = {
      name: r.name, method: r.method,
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
    message = `${errored.length} request(s) failed to complete: ${errored.map(e => `${e.name} (${e.error})`).join(', ')}`;
  } else {
    const statusOk = responses.every(r => (expect.statusIn || [200]).includes(r.status));
    const bodies = responses.map(r => bodyToString(r.data).toLowerCase());
    const containsOk = (expect.bodyContains || []).every(needle => bodies.some(b => b.includes(needle.toLowerCase())));
    const notContainsOk = (expect.bodyNotContains || []).every(needle => bodies.every(b => !b.includes(needle.toLowerCase())));
    pass = statusOk && containsOk && notContainsOk;
    const parts = [];
    parts.push(statusOk ? `status OK (expected ${JSON.stringify(expect.statusIn)}, got ${responses.map(r => r.status).join(',')})`
                         : `status MISMATCH (expected ${JSON.stringify(expect.statusIn)}, got ${responses.map(r => r.status).join(',')})`);
    if ((expect.bodyContains || []).length) parts.push(containsOk ? 'required body text found' : `missing required body text: ${(expect.bodyContains||[]).filter(n=>!bodies.some(b=>b.includes(n.toLowerCase()))).join(', ')}`);
    if ((expect.bodyNotContains || []).length) parts.push(notContainsOk ? 'forbidden body text absent' : 'forbidden body text WAS present');
    message = parts.join('; ');
  }

  return {
    pass, message,
    requests: responses.map(r => ({ name: r.name, method: r.method, url: r.url, status: r.status, durationMs: r.durationMs, error: r.error, dataPreview: bodyToString(r.data).slice(0, 500) })),
  };
}

async function runLoad(testCase, dataset, siteUrl) {
  const client = buildClient(siteUrl);
  const { request, totalRequests, concurrency, expect } = testCase.spec;
  const durations = [];
  const statusCounts = {};
  let idx = 0;

  async function worker() {
    while (idx < totalRequests) {
      const i = idx++;
      const resolved = {
        name: `${request.name} #${i + 1}`, method: request.method,
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

  let pass = true;
  const parts = [];
  if (expect.rateLimited) {
    const got429 = (statusCounts['429'] || 0) > 0;
    pass = pass && got429;
    parts.push(got429 ? `rate limiting confirmed (${statusCounts['429']} × 429)` : 'no 429 responses seen — rate limiting not confirmed');
  }
  if (expect.maxP95Ms) {
    const ok = stats.p95 <= expect.maxP95Ms;
    pass = pass && ok;
    parts.push(`p95=${stats.p95}ms (target ≤ ${expect.maxP95Ms}ms) ${ok ? 'OK' : 'EXCEEDED'}`);
  }
  if (!parts.length) parts.push(`p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms statuses=${JSON.stringify(statusCounts)}`);

  return { pass, message: parts.join('; '), stats };
}

async function runTestCase(testCase, dataset, siteUrl) {
  if (testCase.type === 'http') {
    const r = await runHttp(testCase, dataset, siteUrl);
    return { type: 'http', ...r };
  }
  if (testCase.type === 'load') {
    const r = await runLoad(testCase, dataset, siteUrl);
    return { type: 'load', ...r };
  }
  throw new Error(`Test type "${testCase.type}" is not executable — record a manual result instead.`);
}

module.exports = { runTestCase };
