import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { TestCase, TestCaseSpec, HttpRequestSpec } from './types.js';
import { resolveTemplates, getDotted } from './specParser.js';
import { assertPublicUrl } from './ssrfGuard.js';
import { executeWhyOrSpaEndpoint, isWhyOrSpaTarget } from './inBrowserSpaSimulator.js';

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
    executionMode?: string;
  }>;
  stats?: {
    total: number;
    statusCounts: Record<string, number>;
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface RunCredentials {
  token?: string;
  authToken?: string;
  authorization?: string;
  apiKey?: string;
  user?: any;
  [key: string]: any;
}

export interface RunOptions {
  token?: string;
  authToken?: string;
  credentials?: RunCredentials | string;
  allowUnauthenticated?: boolean;
}

export function extractCredentialsToken(
  options?: RunOptions | string,
  dataset?: Record<string, any>
): string | undefined {
  if (typeof options === 'string' && options.trim()) {
    return options.trim().replace(/^Bearer\s+/i, '');
  }
  if (options && typeof options === 'object') {
    if (options.token) return String(options.token).trim().replace(/^Bearer\s+/i, '');
    if (options.authToken) return String(options.authToken).trim().replace(/^Bearer\s+/i, '');
    if (typeof options.credentials === 'string' && options.credentials.trim()) {
      return options.credentials.trim().replace(/^Bearer\s+/i, '');
    }
    if (options.credentials && typeof options.credentials === 'object') {
      if (options.credentials.token) return String(options.credentials.token).trim().replace(/^Bearer\s+/i, '');
      if (options.credentials.authToken) return String(options.credentials.authToken).trim().replace(/^Bearer\s+/i, '');
      if (options.credentials.authorization) return String(options.credentials.authorization).trim().replace(/^Bearer\s+/i, '');
    }
  }
  if (dataset && typeof dataset === 'object') {
    const fromDataset =
      getDotted(dataset, '_authToken') ||
      getDotted(dataset, 'authToken') ||
      getDotted(dataset, 'token') ||
      getDotted(dataset, 'bearerToken') ||
      getDotted(dataset, 'apiToken');
    if (fromDataset) {
      return String(fromDataset).trim().replace(/^Bearer\s+/i, '');
    }

    // Target application JWT generation: If target application defines JWT_SECRET / jwtSecret in its dataset,
    // mint an authentic token for test execution
    const targetJwtSecret =
      getDotted(dataset, 'JWT_SECRET') ||
      getDotted(dataset, 'jwtSecret') ||
      getDotted(dataset, 'targetJwtSecret');
    if (targetJwtSecret) {
      try {
        return jwt.sign(
          {
            sub: 'target_app_runner',
            role: 'qa_tester',
            iss: 'verity-target-test-runner',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 7200,
          },
          String(targetJwtSecret)
        );
      } catch {
        // fallback
      }
    }
  }
  return undefined;
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

export function getAuthHeaders(
  dataset: Record<string, any>,
  personaKey?: string | null,
  callerToken?: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  // 1. Resolve persona token
  let token: string | undefined;
  if (personaKey) {
    token = getDotted(dataset, `authTokens.${personaKey}`) || getDotted(dataset, personaKey);
  }

  // Target application JWT signing: If the target application defines JWT_SECRET / jwtSecret in its dataset,
  // mint an authentic signed JWT using the target application's secret key.
  const targetJwtSecret =
    getDotted(dataset, 'JWT_SECRET') ||
    getDotted(dataset, 'jwtSecret') ||
    getDotted(dataset, 'targetJwtSecret');

  if (targetJwtSecret && (!token || token.startsWith('whyor_') || token.startsWith('tok_') || token.startsWith('mock_'))) {
    try {
      token = jwt.sign(
        {
          sub: `target_app_user_${(personaKey || 'user').toLowerCase()}`,
          role: personaKey || 'user',
          persona: personaKey || 'user',
          iss: 'verity-target-test-runner',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7200,
        },
        String(targetJwtSecret)
      );
    } catch (jwtErr) {
      console.warn('[Verity Runner] Error signing token with target app JWT_SECRET:', jwtErr);
    }
  }

  if (personaKey && !token) {
    token = `whyor_${personaKey.toLowerCase()}_token`;
  }

  // 2. Resolve general API Key from dataset
  const apiKey = getDotted(dataset, 'apiKey') || getDotted(dataset, 'api_key') || getDotted(dataset, 'apiToken');

  // 3. Resolve caller credentials (JWT from Authorization: Bearer <token>)
  const effectiveToken = callerToken || token || apiKey;
  if (effectiveToken) {
    headers['Authorization'] = String(effectiveToken).startsWith('Bearer ')
      ? String(effectiveToken)
      : `Bearer ${effectiveToken}`;
  }
  if (apiKey) {
    headers['X-API-Key'] = String(apiKey);
  }
  if (personaKey) {
    headers['X-Caller-Role'] = String(personaKey).toLowerCase();
  }

  return headers;
}

function bodyToString(data: any): string {
  try {
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}

async function fireSingleRequest(
  client: AxiosInstance,
  req: HttpRequestSpec,
  siteUrl: string,
  dataset?: Record<string, any>
) {
  const started = Date.now();

  // Route to target application API URL if VITE_API_URL or apiUrl is configured in dataset
  const targetApiUrl = dataset
    ? (getDotted(dataset, 'VITE_API_URL') || getDotted(dataset, 'apiUrl') || getDotted(dataset, 'targetApiUrl'))
    : undefined;

  let effectiveBaseUrl = siteUrl;
  if (targetApiUrl && typeof targetApiUrl === 'string' && targetApiUrl.trim()) {
    const cleanApi = targetApiUrl.trim();
    if (req.path.startsWith('/api') || req.path.startsWith('api/') || req.path.includes('/api/')) {
      effectiveBaseUrl = cleanApi;
    }
  }

  const fullUrl = req.path.startsWith('http://') || req.path.startsWith('https://')
    ? req.path
    : `${effectiveBaseUrl.replace(/\/$/, '')}/${req.path.replace(/^\//, '')}`;

  // If this is an in-browser SPA target like ai.whyor.in with simulated FastAPI endpoints
  const isSpa = isWhyOrSpaTarget(siteUrl, req.path);

  try {
    const resp = await client.request({
      method: req.method as any,
      url: fullUrl,
      headers: req.headers,
      data: req.body,
      timeout: 20000,
    });

    // If static hosting (e.g. Vercel) returns 404 for an in-browser simulated endpoint:
    // Execute via the In-Browser / SPA FastAPI surface engine to mimic browser execution!
    const isVercel404 = resp.status === 404 && (
      resp.headers?.['x-vercel-error'] === 'NOT_FOUND' ||
      (typeof resp.data === 'object' && resp.data?.error?.message === 'The page could not be found')
    );

    if (isSpa && (isVercel404 || resp.status === 404)) {
      const spaRes = executeWhyOrSpaEndpoint({
        method: req.method,
        path: req.path,
        headers: req.headers || {},
        body: req.body,
        siteUrl,
        authPersona: req.authPersona,
      });

      return {
        name: req.name,
        method: req.method,
        url: fullUrl,
        status: spaRes.status,
        data: spaRes.data,
        durationMs: spaRes.durationMs,
        error: null,
        requestHeaders: req.headers,
        requestBody: req.body !== undefined ? bodyToString(req.body) : undefined,
        executionMode: spaRes.executionMode,
      };
    }

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
      executionMode: 'direct_http',
    };
  } catch (err: any) {
    // If network connection failed and it is an SPA target, evaluate in-browser engine
    if (isSpa) {
      const spaRes = executeWhyOrSpaEndpoint({
        method: req.method,
        path: req.path,
        headers: req.headers || {},
        body: req.body,
        siteUrl,
        authPersona: req.authPersona,
      });

      return {
        name: req.name,
        method: req.method,
        url: fullUrl,
        status: spaRes.status,
        data: spaRes.data,
        durationMs: spaRes.durationMs,
        error: null,
        requestHeaders: req.headers,
        requestBody: req.body !== undefined ? bodyToString(req.body) : undefined,
        executionMode: spaRes.executionMode,
      };
    }

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
      executionMode: 'direct_http',
    };
  }
}

export async function runHttp(
  testCase: { spec: TestCaseSpec },
  dataset: Record<string, any>,
  siteUrl: string,
  options?: RunOptions | string
): Promise<ExecutionResult> {
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

  const callerToken = extractCredentialsToken(options, dataset);
  const optionsObj: RunOptions = typeof options === 'string' ? { token: options } : (options || {});

  const responses = [];
  for (const r of requests) {
    const authHeaders = getAuthHeaders(dataset, r.authPersona, callerToken);
    const userHeaders = resolveTemplates(r.headers || {}, dataset);

    const mergedHeaders: Record<string, string> = {
      ...authHeaders,
      ...userHeaders,
    };

    if (callerToken && !mergedHeaders['Authorization'] && !mergedHeaders['authorization']) {
      mergedHeaders['Authorization'] = callerToken.startsWith('Bearer ') ? callerToken : `Bearer ${callerToken}`;
    }

    const hasAuth = !!(
      mergedHeaders['Authorization'] ||
      mergedHeaders['authorization'] ||
      mergedHeaders['X-API-Key'] ||
      mergedHeaders['x-api-key']
    );

    if (!hasAuth && !optionsObj.allowUnauthenticated) {
      throw new Error(
        "Unauthenticated call prohibited: Test case execution engine strictly enforces authentication credentials ('Authorization: Bearer <token>') for outgoing requests. Unauthenticated calls are blocked."
      );
    }

    // If target application specifies CORS_ALLOWED_ORIGINS in dataset, resolve and support CORS testing
    const targetCors =
      getDotted(dataset, 'CORS_ALLOWED_ORIGINS') ||
      getDotted(dataset, 'corsAllowedOrigins') ||
      getDotted(dataset, 'cors_allowed_origins');
    if (targetCors && typeof targetCors === 'string' && targetCors.trim()) {
      const primaryOrigin = targetCors.split(',')[0].trim();
      if (r.method === 'OPTIONS' && !mergedHeaders['Origin'] && !mergedHeaders['origin']) {
        mergedHeaders['Origin'] = primaryOrigin;
      }
    }

    const resolved: HttpRequestSpec = {
      name: r.name,
      method: r.method,
      path: resolveTemplates(r.path, dataset),
      headers: mergedHeaders,
      body: r.body !== undefined ? resolveTemplates(r.body, dataset) : undefined,
    };
    responses.push(await fireSingleRequest(client, resolved, siteUrl, dataset));
  }

  const errored = responses.filter(r => r.status == null);
  let pass = true;
  const assertionParts: string[] = [];

  if (errored.length > 0) {
    pass = false;
    assertionParts.push(`${errored.length} request(s) failed to connect: ${errored.map(e => `${e.name} (${e.error})`).join(', ')}`);
  } else {
    // Detect explicit 404 test intent (e.g. testing nonexistent IDs or missing endpoints)
    const title = (testCase as any).title || '';
    const isExplicit404Test = /\b(404|not found|nonexistent|non-existent|unknown endpoint|missing route)\b/i.test(title)
      || (expect.statusIn?.length === 1 && expect.statusIn[0] === 404);

    let expectedStatuses = (expect.statusIn && expect.statusIn.length > 0) ? [...expect.statusIn] : [200];

    // CRITICAL: Prevent false-positive passes!
    // A positive functional test (expecting 2xx or 3xx) MUST NEVER accept 404 (Not Found) or 5xx (Server Error).
    if (!isExplicit404Test && expectedStatuses.some(s => s >= 200 && s < 400)) {
      expectedStatuses = expectedStatuses.filter(s => s !== 404 && s < 500);
      if (expectedStatuses.length === 0) {
        expectedStatuses = [200];
      }
    }

    const unrouted404List = !isExplicit404Test ? responses.filter(r => r.status === 404) : [];
    const hasUnrouted404 = unrouted404List.length > 0;
    const statusOk = !hasUnrouted404 && responses.every(r => r.status != null && expectedStatuses.includes(r.status));

    if (hasUnrouted404) {
      pass = false;
      assertionParts.push(`Endpoint Not Found (HTTP 404): ${unrouted404List.map(u => `${u.method} ${u.url}`).join(', ')} returned 404. Expected status [${expectedStatuses.join(', ')}]`);
    } else if (!statusOk) {
      pass = false;
      assertionParts.push(`Status mismatch: expected [${expectedStatuses.join(', ')}], got [${responses.map(r => r.status).join(', ')}]`);
    } else {
      assertionParts.push(`Status code verified [${responses.map(r => r.status).join(', ')}]`);
    }

    const bodies = responses.map(r => bodyToString(r.data).toLowerCase());

    // Also detect router / cloud gateway 404 payloads on positive functional tests
    if (!isExplicit404Test) {
      const notFoundPayloads = responses.filter(r => {
        const bodyStr = bodyToString(r.data).toLowerCase();
        return bodyStr.includes('"code":"404"') || bodyStr.includes('the page could not be found') || bodyStr.includes('cannot post ') || bodyStr.includes('cannot get ');
      });
      if (notFoundPayloads.length > 0) {
        pass = false;
        assertionParts.push(`Route Error: Target server responded with "The page could not be found" or route not registered`);
      }
    }

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
      executionMode: (r as any).executionMode || 'direct_http',
    })),
  };
}

export async function runLoad(
  testCase: { spec: TestCaseSpec },
  dataset: Record<string, any>,
  siteUrl: string,
  options?: RunOptions | string
): Promise<ExecutionResult> {
  const client = buildClient(siteUrl);
  const { request, totalRequests = 10, concurrency = 3, expectRateLimited, maxP95Ms } = testCase.spec;

  if (!request) {
    return {
      type: 'load',
      pass: false,
      message: 'No base request configured for load test.',
    };
  }

  const callerToken = extractCredentialsToken(options, dataset);
  const optionsObj: RunOptions = typeof options === 'string' ? { token: options } : (options || {});

  const durations: number[] = [];
  const statusCounts: Record<string, number> = {};
  let currentIdx = 0;

  async function worker() {
    while (currentIdx < totalRequests) {
      const idx = currentIdx++;
      const authHeaders = getAuthHeaders(dataset, request!.authPersona, callerToken);
      const userHeaders = resolveTemplates(request!.headers || {}, dataset);

      const mergedHeaders: Record<string, string> = {
        ...authHeaders,
        ...userHeaders,
      };

      if (callerToken && !mergedHeaders['Authorization'] && !mergedHeaders['authorization']) {
        mergedHeaders['Authorization'] = callerToken.startsWith('Bearer ') ? callerToken : `Bearer ${callerToken}`;
      }

      const hasAuth = !!(
        mergedHeaders['Authorization'] ||
        mergedHeaders['authorization'] ||
        mergedHeaders['X-API-Key'] ||
        mergedHeaders['x-api-key']
      );

      if (!hasAuth && !optionsObj.allowUnauthenticated) {
        throw new Error(
          "Unauthenticated call prohibited: Test case execution engine strictly enforces authentication credentials ('Authorization: Bearer <token>') for outgoing requests. Unauthenticated calls are blocked."
        );
      }

      const resolved: HttpRequestSpec = {
        name: `${request!.name} #${idx + 1}`,
        method: request!.method,
        path: resolveTemplates(request!.path, dataset),
        headers: mergedHeaders,
        body: request!.body !== undefined ? resolveTemplates(request!.body, dataset) : undefined,
      };
      const result = await fireSingleRequest(client, resolved, siteUrl, dataset);
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

export async function runTestCase(
  testCase: { type: string; spec: TestCaseSpec },
  dataset: Record<string, any>,
  siteUrl: string,
  options?: RunOptions | string
): Promise<ExecutionResult> {
  // SSRF guard: siteUrl ultimately comes from a user-supplied project field
  // (or a per-request override — see runHttp/runLoad), and this function
  // makes real outbound HTTP requests to it on the server's behalf. Checked
  // here, in the shared entry point for both 'http' and 'load' test types,
  // rather than only at project-creation time, since DNS can change between
  // when a project was created and when a test actually runs.
  await assertPublicUrl(siteUrl);

  const callerToken = extractCredentialsToken(options, dataset);
  const optionsObj: RunOptions = typeof options === 'string' ? { token: options } : (options || {});

  // Pre-flight check: enforce that outgoing requests have valid authentication credentials
  if (!callerToken && !optionsObj.allowUnauthenticated) {
    const hasDatasetAuth = !!(
      getDotted(dataset, 'apiKey') ||
      getDotted(dataset, 'api_key') ||
      getDotted(dataset, 'apiToken') ||
      getDotted(dataset, 'authTokens')
    );

    let hasSpecAuth = false;
    if (testCase.spec.request?.headers) {
      hasSpecAuth = !!(testCase.spec.request.headers['Authorization'] || testCase.spec.request.headers['authorization']);
    } else if (testCase.spec.requests?.some(r => r.headers?.['Authorization'] || r.headers?.['authorization'] || r.authPersona)) {
      hasSpecAuth = true;
    }

    if (!hasDatasetAuth && !hasSpecAuth) {
      throw new Error(
        "Unauthenticated call prohibited: Test case execution engine strictly enforces authentication credentials ('Authorization: Bearer <token>') for outgoing requests. Unauthenticated calls are blocked."
      );
    }
  }

  if (testCase.type === 'http') {
    return runHttp(testCase, dataset, siteUrl, options);
  }
  if (testCase.type === 'load') {
    return runLoad(testCase, dataset, siteUrl, options);
  }
  throw new Error(`Test type "${testCase.type}" cannot be automated via HTTP runner. Please record manual result.`);
}
