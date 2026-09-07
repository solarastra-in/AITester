import { TestCase, TestCaseType, HttpRequestSpec, TestCaseSpec } from './types.js';

export const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export function getDotted(obj: any, dottedPath: string, fallback: any = ''): any {
  if (!obj) return fallback;
  const parts = dottedPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

export function setDotted(obj: any, dottedPath: string, value: any): void {
  if (!obj || typeof obj !== 'object') return;
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

export function extractPlaceholders(...inputs: any[]): string[] {
  const found = new Set<string>();
  for (const item of inputs) {
    if (!item) continue;
    const str = typeof item === 'string' ? item : JSON.stringify(item);
    const re = new RegExp(PLACEHOLDER_RE);
    let m;
    while ((m = re.exec(str)) !== null) {
      found.add(m[1]);
    }
  }
  return Array.from(found);
}

export function resolveTemplates(value: any, dataset: Record<string, any>): any {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER_RE, (_, path) => {
      const v = getDotted(dataset, path, '');
      return v == null ? '' : String(v);
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveTemplates(v, dataset));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      out[k] = resolveTemplates(value[k], dataset);
    }
    return out;
  }
  return value;
}

export interface ParsedCaseDraft {
  ext_id: string;
  category: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  tags: string;
  type: TestCaseType;
  spec: TestCaseSpec;
  dataFields: string[];
}

export function normalizeStructuredRow(row: any, index: number): ParsedCaseDraft {
  const ext_id = row.id || row.ext_id || `TC-${String(index + 1).padStart(3, '0')}`;
  const type: TestCaseType = (row.type || 'http').toLowerCase() as TestCaseType;
  const priority = (row.priority && ['High', 'Medium', 'Low'].includes(row.priority)) ? row.priority : 'Medium';
  const tags = Array.isArray(row.tags) ? row.tags.join(',') : (row.tags || 'smoke');
  const category = row.category || row.scenario || 'General API';
  const title = row.title || row.scenario || row.description || ext_id;

  if (type === 'manual') {
    const instructions = row.instructions || row.description || row.steps || 'Manually verify expected UI/API behavior.';
    return {
      ext_id,
      category,
      title,
      priority,
      tags,
      type: 'manual',
      spec: { instructions },
      dataFields: extractPlaceholders(instructions),
    };
  }

  if (type === 'load') {
    const request: HttpRequestSpec = {
      name: title,
      method: (row.method || 'GET').toUpperCase() as any,
      path: row.path || row.endpoint || '/',
      authPersona: row.auth_persona || row.authPersona || null,
      headers: row.headers || {},
      body: row.body || undefined,
    };
    const spec: TestCaseSpec = {
      request,
      totalRequests: Number(row.total_requests || row.totalRequests || 10),
      concurrency: Number(row.concurrency || 3),
      expectRateLimited: !!(row.expect_rate_limited || row.expectRateLimited),
      maxP95Ms: row.max_p95_ms ? Number(row.max_p95_ms) : 3000,
    };
    return {
      ext_id,
      category,
      title,
      priority,
      tags,
      type: 'load',
      spec,
      dataFields: extractPlaceholders(request.path, request.headers, request.body),
    };
  }

  // Default: 'http'
  const rawRequests = Array.isArray(row.requests) ? row.requests : [{
    name: title,
    method: (row.method || 'GET').toUpperCase() as any,
    path: row.path || row.endpoint || '/',
    authPersona: row.auth_persona || row.authPersona || null,
    headers: row.headers || {},
    body: row.body || undefined,
  }];

  const rawStatusIn = row.expected_status
    ? String(row.expected_status).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
    : (Array.isArray(row.expect?.statusIn) ? row.expect.statusIn : [200]);

  // Strip 404 from positive status codes (2xx/3xx) unless explicitly intended as a 404/not-found test
  const isExplicit404 = /\b(404|not found|nonexistent|non-existent)\b/i.test(title);
  let statusIn = rawStatusIn;
  if (!isExplicit404 && statusIn.some((s: number) => s >= 200 && s < 400)) {
    statusIn = statusIn.filter((s: number) => s !== 404);
    if (statusIn.length === 0) statusIn = [200];
  }

  const bodyContains = row.expected_body_contains
    ? String(row.expected_body_contains).split('|').map(s => s.trim()).filter(Boolean)
    : (row.expect?.bodyContains || []);

  const bodyNotContains = row.expected_body_not_contains
    ? String(row.expected_body_not_contains).split('|').map(s => s.trim()).filter(Boolean)
    : (row.expect?.bodyNotContains || []);

  const requests: HttpRequestSpec[] = rawRequests.map((r: any) => ({
    name: r.name || title,
    method: (r.method || 'GET').toUpperCase() as any,
    path: r.path || '/',
    authPersona: r.authPersona || r.auth_persona || null,
    headers: r.headers || {},
    body: r.body,
  }));

  const spec: TestCaseSpec = {
    requests,
    expect: {
      statusIn: statusIn.length ? statusIn : [200],
      bodyContains,
      bodyNotContains,
      headerEquals: row.expect?.headerEquals || {},
    },
  };

  return {
    ext_id,
    category,
    title,
    priority,
    tags,
    type: 'http',
    spec,
    dataFields: extractPlaceholders(...requests.map(r => r.path), ...requests.map(r => r.headers), ...requests.map(r => r.body)),
  };
}

export function parseStructuredJson(content: string | any[]): ParsedCaseDraft[] {
  const rows = typeof content === 'string' ? JSON.parse(content) : content;
  if (!Array.isArray(rows)) {
    throw new Error('Structured JSON upload must be an array of test-case definitions.');
  }
  return rows.map(normalizeStructuredRow);
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

export function parseStructuredCsv(csvText: string): ParsedCaseDraft[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = cells[i] !== undefined ? cells[i] : '';
    });
    return obj;
  });

  for (const r of rows) {
    for (const key of ['headers', 'body', 'requests', 'expect']) {
      if (r[key] && typeof r[key] === 'string') {
        try {
          r[key] = JSON.parse(r[key]);
        } catch {
          // keep as string
        }
      }
    }
  }
  return rows.map(normalizeStructuredRow);
}

// Best-effort Markdown test plan table extractor
const METHOD_PATH_RE = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+`?(\/[^\s`'"<>|]*)/i;
const STATUS_RE = /\b(200|201|202|204|301|302|400|401|403|404|409|422|429|500|502|503)\b/g;
const UNAUTH_RE = /\b(no auth|unauthenticated|without.*auth|no authentication|not logged in|guest)\b/i;
const PERSONA_RE = /(?:as|Login:|persona)\s*['"‘“]?\{\{?\s*([a-zA-Z0-9_.]+?)(?:_email)?\s*\}\}?['"’”]?/i;

function splitMdRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split(/(?<!\\)\|/).map(c => c.replace(/<br\s*\/?>/gi, ' ').trim());
}

export function parseMarkdownTable(mdText: string, categoryFallback = 'Imported QA Plan'): ParsedCaseDraft[] {
  const lines = mdText.split(/\r?\n/);
  const tableLines = lines.filter(l => l.trim().startsWith('|'));
  if (tableLines.length < 2) {
    // If not a pure markdown table, search for test cases line by line or return manual case
    return [
      {
        ext_id: 'DOC-001',
        category: categoryFallback,
        title: 'Manual Test Plan Document Execution',
        priority: 'Medium',
        tags: 'manual,plan',
        type: 'manual',
        spec: { instructions: mdText },
        dataFields: extractPlaceholders(mdText),
      },
    ];
  }

  const header = splitMdRow(tableLines[0]).map(h => h.toLowerCase().trim());
  const idxOf = (name: string) => header.findIndex(h => h.includes(name));

  const iId = idxOf('id');
  const iCat = idxOf('scenario') >= 0 ? idxOf('scenario') : idxOf('category');
  const iDesc = idxOf('description');
  const iSteps = idxOf('steps');
  const iData = idxOf('test data') >= 0 ? idxOf('test data') : idxOf('data');
  const iExpected = idxOf('expected');
  const iPriority = idxOf('priority');
  const iType = idxOf('type');

  const dataRows = tableLines.slice(1).filter(l => !/^\|?\s*-+\s*\|/.test(l));
  const cases: ParsedCaseDraft[] = [];

  dataRows.forEach((line, idx) => {
    const cells = splitMdRow(line);
    if (cells.length < 2) return;

    const ext_id = (iId >= 0 && cells[iId]) ? cells[iId].trim() : `TC-${String(idx + 1).padStart(3, '0')}`;
    const category = (iCat >= 0 && cells[iCat]) ? cells[iCat].trim() : categoryFallback;
    const stepsText = (iSteps >= 0 ? cells[iSteps] : '') || '';
    const dataText = (iData >= 0 ? cells[iData] : '') || '';
    const expectedText = (iExpected >= 0 ? cells[iExpected] : '') || '';
    const descText = (iDesc >= 0 ? cells[iDesc] : '') || ext_id;
    const priorityVal = (iPriority >= 0 && cells[iPriority]) ? cells[iPriority].trim() : 'Medium';
    const priority: 'High' | 'Medium' | 'Low' = ['High', 'Medium', 'Low'].includes(priorityVal) ? priorityVal as any : 'Medium';
    const declaredType = (iType >= 0 && cells[iType]) ? cells[iType].trim().toLowerCase() : '';

    const tags: string[] = [];
    if (/regression/i.test(descText) || /regression/i.test(stepsText)) tags.push('regression');
    if (/security/i.test(descText) || declaredType === 'security') tags.push('security');
    if (/load|perf/i.test(descText) || declaredType === 'performance') tags.push('performance');

    const combined = `${stepsText} ${dataText} ${descText}`;
    const methodMatch = combined.match(METHOD_PATH_RE);
    const statusMatches = Array.from(expectedText.matchAll(STATUS_RE)).map(m => Number(m[1]));
    const isUnauth = UNAUTH_RE.test(combined);
    const personaMatch = !isUnauth ? combined.match(PERSONA_RE) : null;

    if (methodMatch) {
      const request: HttpRequestSpec = {
        name: descText.slice(0, 80) || ext_id,
        method: methodMatch[1].toUpperCase() as any,
        path: methodMatch[2],
        authPersona: isUnauth ? null : (personaMatch ? personaMatch[1] : null),
        headers: {},
        body: undefined,
      };
      const spec: TestCaseSpec = {
        requests: [request],
        expect: {
          statusIn: statusMatches.length ? statusMatches : [200],
          bodyContains: [],
          bodyNotContains: [],
        },
      };
      cases.push({
        ext_id,
        category,
        title: descText.slice(0, 140) || ext_id,
        priority,
        tags: tags.join(','),
        type: 'http',
        spec,
        dataFields: extractPlaceholders(request.path, dataText, stepsText),
      });
    } else {
      cases.push({
        ext_id,
        category,
        title: descText.slice(0, 140) || ext_id,
        priority,
        tags: tags.join(','),
        type: 'manual',
        spec: {
          instructions: `${descText}\n\nSteps:\n${stepsText}\n\nTest Data:\n${dataText}\n\nExpected:\n${expectedText}`.trim(),
        },
        dataFields: extractPlaceholders(dataText, stepsText),
      });
    }
  });

  return cases;
}
