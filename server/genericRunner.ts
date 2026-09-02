import axios, { AxiosInstance } from 'axios';
import { TestCase, TestCaseSpec, HttpRequestSpec } from './types.js';
import { resolveTemplates, getDotted } from './specParser.js';

export interface ExecutionResult {
  pass: boolean;
  message: string;
  type: 'http' | 'load' | 'manual';
  requests?: Array<{
    name: string;
    method: string;
    url: string;
    status: number | null;
    durationMs: number;
    error: string | null;
    dataPreview?: string;
    requestBody?: string;
    requestHeaders?: Record<string, string>;
  }>;
  stats?: {
    total: number;
    statusCounts: Record<string, number>;
    p50: number;
    p95: number;
    p99: number;
  };
}

function buildClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 25000,
    validateStatus: () => true, // Don't throw on 4xx/5xx so we can assert on them
    headers: {
      'User-Agent': 'Verity-Automated-Test-Runner/1.0',
    },
  });
}

function getAuthHeaders(dataset: Record<string, any>, personaKey?: string | null): Record<string, string> {
  if (!personaKey) return {};
  const token = getDotted(dataset, `authTokens.${personaKey}`) || getDotted(dataset, personaKey);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function bodyToString(data: any): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}

async function fireSingleRequest(client: AxiosInstance, req: HttpRequestSpec, siteUrl: string) {
  const started = Date.now();
  try {
    const fullUrl = req.path.startsWith('http') ? req.path : `${siteUrl.replace(/\/$/, '')}/${req.path.replace(/^\//, '')}`;
    const resp = await client.request({
      method: req.method as any,
      url: req.path,
      headers: req.headers,
      data: req.body,
      timeout: 20000,
    });
    return {
      name: req.name,
      method: req.method,
      url: fullUrl,
      status: resp.status,
      data: resp.data,
      durationMs: Date.now() - started,
      error: null,
      requestHeaders: req.headers,
      requestBody: req.body !== undefined ? bodyToString(req.body) : undefined,
    };
  } catch (err: any) {
    const fullUrl = req.path.startsWith('http') ? req.path : `${siteUrl.replace(/\/$/, '')}/${req.path.replace(/^\//, '')}`;
    return {
      name: req.name,
      method: req.method,
      url: fullUrl,
      status: null,
      data: null,
      durationMs: Date.now() - started,
      error: err.code || err.message || 'Request connection failed',
      requestHeaders: req.headers,
      requestBody: req.body !== undefined ? bodyToString(req.body) : undefined,
    };
  }
}

export async function runHttp(testCase: { spec: TestCaseSpec }, dataset: Record<string, any>, siteUrl: string): Promise<ExecutionResult> {
  const client = buildClient(siteUrl);
  const { requests = [], expect = {} } = testCase.spec;

  if (!requests.length) {
    return {
      type: 'http',
      pass: false,
      message: 'No HTTP requests defined in test case spec.',
      requests: [],
    };
  }

  const responses = [];
  for (const r of requests) {
    const resolved: HttpRequestSpec = {
      name: r.name,
      method: r.method,
      path: resolveTemplates(r.path, dataset),
      headers: {
        ...getAuthHeaders(dataset, r.authPersona),
        ...resolveTemplates(r.headers || {}, dataset),
      },
      body: r.body !== undefined ? resolveTemplates(r.body, dataset) : undefined,
    };
    responses.push(await fireSingleRequest(client, resolved, siteUrl));
  }

  const errored = responses.filter(r => r.status == null);
  let pass = true;
  const assertionParts: string[] = [];

  if (errored.length > 0) {
    pass = false;
    assertionParts.push(`${errored.length} request(s) failed to connect: ${errored.map(e => `${e.name} (${e.error})`).join(', ')}`);
  } else {
    const expectedStatuses = expect.statusIn || [200];
    const statusOk = responses.every(r => r.status != null && expectedStatuses.includes(r.status));
    if (!statusOk) {
      pass = false;
      assertionParts.push(`Status mismatch: expected [${expectedStatuses.join(', ')}], got [${responses.map(r => r.status).join(', ')}]`);
    } else {
      assertionParts.push(`Status code verified [${responses.map(r => r.status).join(', ')}]`);
    }

    const bodies = responses.map(r => bodyToString(r.data).toLowerCase());

    if (expect.bodyContains && expect.bodyContains.length > 0) {
      const missingContains = expect.bodyContains.filter(needle => !bodies.some(b => b.includes(needle.toLowerCase())));
      if (missingContains.length > 0) {
        pass = false;
        assertionParts.push(`Missing required response substrings: ${missingContains.map(m => `"${m}"`).join(', ')}`);
      } else {
        assertionParts.push(`Found required substrings: ${expect.bodyContains.map(m => `"${m}"`).join(', ')}`);
      }
    }

    if (expect.bodyNotContains && expect.bodyNotContains.length > 0) {
      const forbiddenFound = expect.bodyNotContains.filter(needle => bodies.some(b => b.includes(needle.toLowerCase())));
      if (forbiddenFound.length > 0) {
        pass = false;
        assertionParts.push(`Forbidden strings detected in response: ${forbiddenFound.map(m => `"${m}"`).join(', ')}`);
      } else {
        assertionParts.push(`Forbidden string check passed`);
      }
    }
  }

  return {
    type: 'http',
    pass,
    message: assertionParts.join(' | '),
    requests: responses.map(r => ({
      name: r.name,
      method: r.method,
      url: r.url,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error,
      dataPreview: bodyToString(r.data).slice(0, 1000),
      requestHeaders: r.requestHeaders,
      requestBody: r.requestBody,
    })),
  };
}

export async function runLoad(testCase: { spec: TestCaseSpec }, dataset: Record<string, any>, siteUrl: string): Promise<ExecutionResult> {
  const client = buildClient(siteUrl);
  const { request, totalRequests = 10, concurrency = 3, expectRateLimited, maxP95Ms } = testCase.spec;

  if (!request) {
    return {
      type: 'load',
      pass: false,
      message: 'No base request configured for load test.',
    };
  }

  const durations: number[] = [];
  const statusCounts: Record<string, number> = {};
  let currentIdx = 0;

  async function worker() {
    while (currentIdx < totalRequests) {
      const idx = currentIdx++;
      const resolved: HttpRequestSpec = {
        name: `${request!.name} #${idx + 1}`,
        method: request!.method,
        path: resolveTemplates(request!.path, dataset),
        headers: {
          ...getAuthHeaders(dataset, request!.authPersona),
          ...resolveTemplates(request!.headers || {}, dataset),
        },
        body: request!.body !== undefined ? resolveTemplates(request!.body, dataset) : undefined,
      };
      const result = await fireSingleRequest(client, resolved, siteUrl);
      durations.push(result.durationMs);
      const key = result.status == null ? 'error' : String(result.status);
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, 10));
  await Promise.all(Array.from({ length: workerCount }, worker));

  durations.sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (!durations.length) return 0;
    const idx = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length));
    return durations[idx];
  };

  const stats = {
    total: totalRequests,
    statusCounts,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
  };

  let pass = true;
  const parts: string[] = [];

  if (expectRateLimited) {
    const got429 = (statusCounts['429'] || 0) > 0;
    if (!got429) {
      pass = false;
      parts.push('Rate limiting was expected (HTTP 429), but no 429 responses were received');
    } else {
      parts.push(`Rate limiting confirmed (${statusCounts['429']} × 429 status codes)`);
    }
  }

  if (maxP95Ms) {
    if (stats.p95 > maxP95Ms) {
      pass = false;
      parts.push(`p95 latency was ${stats.p95}ms (target was ≤ ${maxP95Ms}ms)`);
    } else {
      parts.push(`p95 latency ${stats.p95}ms within budget (≤ ${maxP95Ms}ms)`);
    }
  }

  if (!parts.length) {
    parts.push(`Completed ${totalRequests} requests: p50=${stats.p50}ms, p95=${stats.p95}ms, statuses=${JSON.stringify(statusCounts)}`);
  }

  return {
    type: 'load',
    pass,
    message: parts.join(' | '),
    stats,
  };
}

export async function runTestCase(testCase: { type: string; spec: TestCaseSpec }, dataset: Record<string, any>, siteUrl: string): Promise<ExecutionResult> {
  if (testCase.type === 'http') {
    return runHttp(testCase, dataset, siteUrl);
  }
  if (testCase.type === 'load') {
    return runLoad(testCase, dataset, siteUrl);
  }
  throw new Error(`Test type "${testCase.type}" cannot be automated via HTTP runner. Please record manual result.`);
}
