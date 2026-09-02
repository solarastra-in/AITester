// ---------------------------------------------------------------------------
// Converts test cases — however they arrive — into one normalized schema:
//
//   { type: 'http'|'load'|'manual',
//     spec: {
//       requests: [{ name, method, path, authPersona, headers, body }],
//       expect: { statusIn: [...], bodyContains: [...], bodyNotContains: [...] }
//     } | { instructions } | { request, totalRequests, concurrency, expect }
//   }
//
// Three ingestion paths feed this schema:
//   1. Structured JSON/CSV upload — the person supplies the fields directly
//      (deterministic, works for ANY site since there's no guessing).
//   2. Markdown/CSV test-plan upload (e.g. exported from a QA doc) — best-
//      effort extraction of METHOD /path and expected status codes from
//      free-text Steps/Expected-Result columns via regex. Anything it can't
//      confidently extract becomes a 'manual' case rather than being dropped.
//   3. AI-generated (see aiGenerate.js) — asks an LLM to emit rows already
//      in the structured schema, so it reuses the same normalizer as (1).
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

function get(obj, dottedPath, fallback) {
  const parts = dottedPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function extractPlaceholders(...strings) {
  const found = new Set();
  for (const s of strings) {
    if (!s) continue;
    const str = typeof s === 'string' ? s : JSON.stringify(s);
    let m;
    const re = new RegExp(PLACEHOLDER_RE);
    while ((m = re.exec(str))) found.add(m[1]);
  }
  return [...found];
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

// ---- (1) Structured row -> normalized case --------------------------------
function normalizeStructuredRow(row, index) {
  const ext_id = row.id || row.ext_id || `CASE-${String(index + 1).padStart(3, '0')}`;
  const type = (row.type || 'http').toLowerCase();
  const priority = row.priority || 'Medium';
  const tags = Array.isArray(row.tags) ? row.tags.join(',') : (row.tags || '');
  const category = row.category || 'Uncategorized';
  const title = row.title || row.scenario || ext_id;

  if (type === 'manual') {
    return {
      ext_id, category, title, priority, tags, type: 'manual',
      spec: { instructions: row.instructions || row.description || row.steps || 'Manually verify.' },
      dataFields: extractPlaceholders(row.instructions),
    };
  }

  if (type === 'load') {
    const request = {
      name: title, method: (row.method || 'GET').toUpperCase(),
      path: row.path || row.endpoint || '/', authPersona: row.auth_persona || row.authPersona || null,
      headers: row.headers || {}, body: row.body || undefined,
    };
    const spec = {
      request,
      totalRequests: Number(row.total_requests || row.totalRequests || 20),
      concurrency: Number(row.concurrency || 5),
      expect: {
        rateLimited: !!(row.expect_rate_limited || row.rateLimited),
        maxP95Ms: row.max_p95_ms ? Number(row.max_p95_ms) : undefined,
      },
    };
    return {
      ext_id, category, title, priority, tags, type: 'load', spec,
      dataFields: extractPlaceholders(request.path, request.headers, request.body),
    };
  }

  // 'http' (default)
  const rawRequests = Array.isArray(row.requests) ? row.requests : [{
    name: title, method: row.method || 'GET', path: row.path || row.endpoint || '/',
    authPersona: row.auth_persona || row.authPersona || null,
    headers: row.headers || {}, body: row.body || undefined,
  }];
  const statusIn = row.expected_status
    ? String(row.expected_status).split(',').map(s => Number(s.trim())).filter(Boolean)
    : (Array.isArray(row.expect && row.expect.statusIn) ? row.expect.statusIn : [200]);
  const bodyContains = row.expected_body_contains
    ? String(row.expected_body_contains).split('|').map(s => s.trim()).filter(Boolean)
    : (row.expect && row.expect.bodyContains) || [];
  const bodyNotContains = row.expected_body_not_contains
    ? String(row.expected_body_not_contains).split('|').map(s => s.trim()).filter(Boolean)
    : (row.expect && row.expect.bodyNotContains) || [];

  const requests = rawRequests.map(r => ({
    name: r.name || title, method: (r.method || 'GET').toUpperCase(), path: r.path || '/',
    authPersona: r.authPersona || r.auth_persona || null, headers: r.headers || {}, body: r.body,
  }));

  return {
    ext_id, category, title, priority, tags, type: 'http',
    spec: { requests, expect: { statusIn, bodyContains, bodyNotContains } },
    dataFields: extractPlaceholders(...requests.map(r => r.path), ...requests.map(r => r.headers), ...requests.map(r => r.body)),
  };
}

function parseStructuredJson(rowsOrText) {
  const rows = typeof rowsOrText === 'string' ? JSON.parse(rowsOrText) : rowsOrText;
  if (!Array.isArray(rows)) throw new Error('Structured JSON upload must be an array of test-case rows.');
  return rows.map(normalizeStructuredRow);
}

function parseStructuredCsv(csvText) {
  const rows = csvToObjects(csvText);
  // headers/body/requests may arrive JSON-encoded in a CSV cell
  for (const r of rows) {
    for (const key of ['headers', 'body', 'requests', 'expect']) {
      if (r[key] && typeof r[key] === 'string') {
        try { r[key] = JSON.parse(r[key]); } catch { /* leave as string */ }
      }
    }
  }
  return rows.map(normalizeStructuredRow);
}

function csvToObjects(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = cells[i] !== undefined ? cells[i] : ''; });
    return obj;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ---- (2) Best-effort markdown test-plan table -> normalized case ----------
const METHOD_PATH_RE = /\b(GET|POST|PUT|PATCH|DELETE)\s+`?(\/[^\s`'"<>|]*)/i;
const STATUS_RE = /\b(200|201|202|204|301|302|400|401|403|404|409|422|429|500|502|503)\b/g;
const UNAUTH_RE = /\b(no auth|unauthenticated|without.*auth|no authentication|not logged in)\b/i;
const PERSONA_RE = /(?:as|Login:)\s*['"‘“]?\{\{?\s*([a-zA-Z0-9_]+?)(?:_email)?\s*\}\}?['"’”]?/i;

function parseMarkdownTable(mdText, categoryFallback = 'Imported') {
  const lines = mdText.split(/\r?\n/);
  const tableLines = lines.filter(l => l.trim().startsWith('|'));
  if (tableLines.length < 2) return [];
  const header = splitMdRow(tableLines[0]).map(h => h.toLowerCase().trim());
  const idxOf = (name) => header.findIndex(h => h.includes(name));
  const iId = idxOf('id'), iCat = idxOf('scenario') >= 0 ? idxOf('scenario') : idxOf('category');
  const iDesc = idxOf('description'), iSteps = idxOf('steps'), iData = idxOf('test data');
  const iExpected = idxOf('expected'), iPriority = idxOf('priority'), iType = idxOf('type');

  const dataRows = tableLines.slice(1).filter(l => !/^\|?\s*-+\s*\|/.test(l));
  const cases = [];
  dataRows.forEach((line, idx) => {
    const cells = splitMdRow(line);
    if (cells.length < 2) return;
    const ext_id = (iId >= 0 && cells[iId]) ? cells[iId].trim() : `IMPORTED-${String(idx + 1).padStart(3, '0')}`;
    const category = (iCat >= 0 && cells[iCat]) ? cells[iCat].trim() : categoryFallback;
    const stepsText = (iSteps >= 0 ? cells[iSteps] : '') || '';
    const dataText = (iData >= 0 ? cells[iData] : '') || '';
    const expectedText = (iExpected >= 0 ? cells[iExpected] : '') || '';
    const descText = (iDesc >= 0 ? cells[iDesc] : '') || ext_id;
    const priority = (iPriority >= 0 && cells[iPriority]) ? cells[iPriority].trim() : 'Medium';
    const declaredType = (iType >= 0 && cells[iType]) ? cells[iType].trim().toLowerCase() : '';
    const tags = [];
    if (/regression/i.test(descText)) tags.push('regression');
    if (/security/i.test(descText) || declaredType === 'security') tags.push('security');
    if (/known gap/i.test(descText)) tags.push('known-gap');

    const combined = `${stepsText} ${dataText}`;
    const methodMatch = combined.match(METHOD_PATH_RE);
    const statusMatches = [...expectedText.matchAll(STATUS_RE)].map(m => Number(m[1]));
    const isUnauth = UNAUTH_RE.test(combined) || UNAUTH_RE.test(descText);
    const personaMatch = !isUnauth && combined.match(PERSONA_RE);

    if (methodMatch) {
      const request = {
        name: descText.slice(0, 80) || ext_id,
        method: methodMatch[1].toUpperCase(),
        path: methodMatch[2],
        authPersona: isUnauth ? null : (personaMatch ? personaMatch[1] : null),
        headers: {}, body: undefined,
      };
      const spec = {
        requests: [request],
        expect: { statusIn: statusMatches.length ? statusMatches : [200], bodyContains: [], bodyNotContains: [] },
      };
      cases.push({
        ext_id, category, title: descText.slice(0, 140) || ext_id, priority, tags: tags.join(','), type: 'http', spec,
        dataFields: extractPlaceholders(request.path),
      });
    } else {
      cases.push({
        ext_id, category, title: descText.slice(0, 140) || ext_id, priority, tags: tags.join(','), type: 'manual',
        spec: { instructions: `${descText}\n\nSteps: ${stepsText}\n\nTest data: ${dataText}\n\nExpected: ${expectedText}`.trim() },
        dataFields: [],
      });
    }
  });
  return cases;
}

function splitMdRow(line) {
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  // split on unescaped pipes
  return trimmed.split(/(?<!\\)\|/).map(c => c.replace(/<br\s*\/?>/gi, ' ').trim());
}

module.exports = { get, resolveTemplates, extractPlaceholders, parseStructuredJson, parseStructuredCsv, parseMarkdownTable };
