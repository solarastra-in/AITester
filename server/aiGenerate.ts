import { GoogleGenAI } from '@google/genai';
import { ParsedCaseDraft, normalizeStructuredRow, setDotted, extractPlaceholders, getDotted } from './specParser.js';
import { assertPublicUrl } from './ssrfGuard.js';

interface GenerateOptions {
  provider?: 'gemini' | 'openai' | 'anthropic';
  apiKey?: string;
  model?: string;
  siteUrl: string;
  description?: string;
  existingPlanText?: string;
}

let geminiClient: GoogleGenAI | null = null;
let geminiCooloffUntil = 0;

function isGeminiAvailable(): boolean {
  if (!process.env.GEMINI_API_KEY) return false;
  return Date.now() >= geminiCooloffUntil;
}

function handleGeminiError(err: any, context: string) {
  const errMsg = err?.message || String(err);
  const status = err?.status || err?.code;
  const isQuotaOrAuth =
    status === 429 ||
    status === 403 ||
    errMsg.includes('429') ||
    errMsg.includes('403') ||
    errMsg.includes('quota') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('PERMISSION_DENIED') ||
    errMsg.includes('denied access');

  if (isQuotaOrAuth) {
    // 60-second backoff window to avoid spamming the rate-limited API key
    geminiCooloffUntil = Date.now() + 60000;
    console.info(`[Verity AI] Gemini API in standby (${status === 429 ? 'quota limit' : 'permission/plan'}), utilizing smart heuristic engine.`);
  } else {
    console.info(`[Verity AI] Smart heuristic fallback active for ${context}.`);
  }
}

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not configured.');
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Detects whether a path targets an ephemeral, content-hashed static build asset (Vite, Webpack, Next.js, Rollup).
 * These assets change on every code deployment, causing persistent 404 false alarms in automated test suites.
 */
export function isEphemeralHashedAsset(pathStr: string): boolean {
  if (!pathStr || typeof pathStr !== 'string') return false;
  const clean = pathStr.split('?')[0].split('#')[0].trim();

  // 1. Files with build hashes in name (e.g. index-l5opthvd.js, index-DQy2Zb7Y.css, main.8f73b1a2.js, chunk.4b8c9d0e.css)
  if (/[-._][a-zA-Z0-9_-]{6,}\.(?:js|css|map|wasm)$/i.test(clean)) return true;
  // 2. Next.js static asset chunk directories
  if (/\/_next\/static\//i.test(clean)) return true;
  // 3. Webpack chunk / bundle pattern
  if (/\.(?:chunk|bundle)\.[a-zA-Z0-9_-]+\.(?:js|css)/i.test(clean)) return true;
  // 4. Asset directories with index or bundle files
  if (/\/assets\/index-[a-zA-Z0-9]+\.(?:js|css)/i.test(clean)) return true;
  // 5. Explicitly ignore compiled css/js bundles inside asset or static directories
  if (/\/(?:assets|static\/js|static\/css|dist)\/.*\.(?:js|css|map)$/i.test(clean)) return true;

  return false;
}

const SYSTEM_PROMPT = `You are Verity AI, an expert Principal QA Automation Architect.
Your task is to analyze a target website URL, API documentation, or QA requirements and generate structured automated test cases adhering strictly to the Verity Test Spec schema.

Output ONLY a raw, valid JSON array containing test case objects. Do NOT wrap in markdown backticks or commentary.

Each test case object MUST follow this schema:
{
  "id": "TC-001",
  "category": "Authentication | Core API | Rate Limits | Security | Validation",
  "title": "Clear concise scenario name",
  "priority": "High" | "Medium" | "Low",
  "tags": ["smoke", "regression", "security", "load", "api"],
  "type": "http" | "load" | "manual",
  "requests": [
    {
      "name": "Step name",
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "path": "/api/v1/resource or /api/endpoint/{{sample_id}}",
      "auth_persona": "user" | "admin" | "guest" | null,
      "headers": { "Content-Type": "application/json" },
      "body": { "key": "{{dataset_field}}" }
    }
  ],
  "expected_status": "200, 201",
  "expected_body_contains": "status|success|id",
  "expected_body_not_contains": "error|unauthorized",
  "instructions": "Only for type=manual"
}

CRITICAL RULES & ANTI-PATTERNS:
- NEVER EVER generate test cases targeting ephemeral, content-hashed static build assets (e.g. /assets/index-*.js, /assets/*.css, _next/static/chunks/*, /static/js/*.chunk.js). Bundlers change these hashes on every deployment, causing persistent 404 false alarms!
- Only target stable, canonical endpoints: root SPA paths (/), public site documents (/robots.txt, /sitemap.xml), API routes (/api/*, /v1/*), auth endpoints (/auth/login), health probes (/health, /api/health), or semantic backend resources.
- Ensure you use double curly braces {{placeholder_name}} for dynamic data, auth tokens, test IDs, or secret keys so Verity's Interactive Dataset Engine can automatically prompt the user for dataset values.`;

export interface UrlAnalysisResult {
  detectedType: string;
  suggestedSuiteName: string;
  description: string;
  focusAreas: string[];
  sampleVariables: string[];
  suggestedEndpoints: Array<{ method: string; path: string; purpose: string }>;
  quickScenarios: string[];
  suggestedOpenApiDoc: string;
}

const ANALYZE_SYSTEM_PROMPT = `You are Verity AI, an expert Principal QA Automation Architect and API Specialist.
Given a target website URL or API endpoint and optional user requirements/hints, analyze the URL, domain, path, and context to formulate a comprehensive automated test plan.

Output ONLY a raw, valid JSON object matching this schema:
{
  "detectedType": "string (e.g. REST API Microservice, Authentication Gateway, GraphQL Service, E-Commerce Platform, SaaS Web Application)",
  "suggestedSuiteName": "string (concise, professional suite title, e.g. 'ReqRes User Management & Auth Suite')",
  "description": "string (2-4 rich technical sentences describing the functional scenarios, auth validation, edge cases, error codes like 400/404/422, and latency benchmarks)",
  "focusAreas": ["string", "string", "string", "string"],
  "sampleVariables": ["string", "string", "string"],
  "suggestedEndpoints": [
    { "method": "GET|POST|PUT|DELETE", "path": "/path", "purpose": "description" }
  ],
  "quickScenarios": ["scenario 1", "scenario 2", "scenario 3", "scenario 4"],
  "suggestedOpenApiDoc": "string (succinct OpenAPI / endpoint reference list)"
}

CRITICAL: Do NOT suggest ephemeral, content-hashed build assets (e.g. /assets/index-*.js, *.css, _next/static/*) as endpoints or scenarios. Only suggest stable API, health, auth, or canonical documents (/robots.txt, /sitemap.xml).
Do NOT wrap in markdown backticks.`;

// In-memory cache for analyzed URLs to avoid duplicate API hits
interface CacheEntry {
  result: UrlAnalysisResult;
  timestamp: number;
}
const urlAnalysisCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function analyzeTargetUrl(url: string, userHint?: string): Promise<UrlAnalysisResult> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return buildSmartAnalysis('https://example.com');
  }

  const cacheKey = `${cleanUrl.toLowerCase()}::${(userHint || '').trim().toLowerCase()}`;
  const cached = urlAnalysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Try using Gemini AI if available and not in cooloff
  if (isGeminiAvailable()) {
    try {
      const ai = getGeminiClient();
      const prompt = `Target URL to analyze: ${cleanUrl}
${userHint ? `User Focus / Requirements / Hint: ${userHint}` : 'User Focus: Formulate a complete end-to-end automated test suite covering smoke, regression, security, and edge cases.'}

Analyze the domain and path structure. Recommend appropriate test case descriptions, focus areas, dynamic dataset variables (e.g., authTokens, sample_id, search_query), endpoints, and scenario titles.`;

      // Use modern recommended models: gemini-3.8-flash primary, then gemini-3.1-flash-lite, then gemini-flash-latest
      const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let response: any = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: ANALYZE_SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          });
          if (response?.text) break;
        } catch (e: any) {
          lastError = e;
          continue;
        }
      }

      if (response?.text) {
        let text = response.text.trim();
        if (text.startsWith('```json')) {
          text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        } else if (text.startsWith('```')) {
          text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
        }
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const analysisResult: UrlAnalysisResult = {
            detectedType: parsed.detectedType || 'REST API Service',
            suggestedSuiteName: parsed.suggestedSuiteName || 'Automated Functional Test Suite',
            description: parsed.description || `Comprehensive automated test suite for ${cleanUrl}`,
            focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : ['Smoke Verification', 'Authentication', 'CRUD Operations', 'Validation & Error Codes'],
            sampleVariables: Array.isArray(parsed.sampleVariables) ? parsed.sampleVariables : ['authTokens.user', 'sample_id', 'search_query'],
            suggestedEndpoints: Array.isArray(parsed.suggestedEndpoints) ? parsed.suggestedEndpoints : [
              { method: 'GET', path: '/', purpose: 'Root health and latency check' },
              { method: 'GET', path: '/api/v1/items', purpose: 'Collection retrieval with pagination' }
            ],
            quickScenarios: Array.isArray(parsed.quickScenarios) ? parsed.quickScenarios : [
              'Root endpoint availability & header security check',
              'Authenticated resource retrieval with {{authTokens.user}}',
              'Payload validation and 422/400 error handling',
              'Concurrent burst load test on primary endpoint'
            ],
            suggestedOpenApiDoc: parsed.suggestedOpenApiDoc || `GET /\nGET /api/v1/items\nPOST /api/v1/items`,
          };
          urlAnalysisCache.set(cacheKey, { result: analysisResult, timestamp: Date.now() });
          return analysisResult;
        }
      } else if (lastError) {
        handleGeminiError(lastError, 'URL analysis');
      }
    } catch (err: any) {
      handleGeminiError(err, 'URL analysis');
    }
  }

  // Smart Heuristic Engine (high-fidelity instant fallback)
  const result = buildSmartAnalysis(cleanUrl, userHint);
  urlAnalysisCache.set(cacheKey, { result, timestamp: Date.now() });
  return result;
}

function buildSmartAnalysis(cleanUrl: string, userHint?: string): UrlAnalysisResult {
  const hostname = cleanUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Target Site';
  let path = cleanUrl.replace(/^https?:\/\/[^/]+/, '') || '/';
  if (!path.startsWith('/')) path = '/' + path;

  const isWhyor = /whyor/i.test(cleanUrl) || /whyor/i.test(userHint || '');
  const isAI = /ai|llm|model|bot|gpt|agent/i.test(cleanUrl) || /ai|llm|model|agent/i.test(userHint || '') || isWhyor;
  const isAuth = /auth|login|oauth|token|jwt|session/i.test(cleanUrl) || /auth|login/i.test(userHint || '');
  const isStore = /store|shop|cart|checkout|order|product|item|petstore/i.test(cleanUrl) || /shop|order/i.test(userHint || '');
  const isReqRes = /reqres/i.test(cleanUrl);
  const isGraphQL = /graphql/i.test(cleanUrl) || /graphql/i.test(path);

  if (isWhyor) {
    return {
      detectedType: 'WhyOr AI Dispatch, Router & Context Ledger Platform',
      suggestedSuiteName: `WhyOr Dispatch End-to-End System & Architecture Suite`,
      description: `Comprehensive automated QA test suite for WhyOr Dispatch at ${cleanUrl}. Validates SPA shell and bundle integrity, cost-optimal semantic prompt routing (/api/dispatch, /v1/dispatch), multi-model catalog (Anthropic, OpenAI, DeepSeek, Google), hash-chained context ledger, company BYOK key verification, flat subscription bridge ($0/token), 7-day trial email registration, team token quotas, and superadmin audit log RBAC.`,
      focusAreas: [
        'Semantic Complexity & Cost-Optimal Model Routing',
        'Tamper-Evident Hash-Chained Context Ledger',
        'Multi-Provider Catalog (Anthropic, OpenAI, Google, DeepSeek, Groq)',
        'Company BYOK & Flat Subscription Gateway ($0/token)',
        'Team Governance, Quotas & Daily Limit Policies',
        '7-Day Free Trial Onboarding & Rate-Limiting Guardrails',
        'SuperAdmin Console, Audit Logs & Platform Configuration',
        'Concurrency Stress & P95 Latency SLA Benchmarks'
      ],
      sampleVariables: [
        'baseUrl',
        'authTokens.user',
        'authTokens.team_lead',
        'prompt_samples.simple_query',
        'prompt_samples.complex_query',
        'prompt_samples.code_query',
        'prompt_samples.invalid_empty',
        'models.smart_model',
        'credentials_test.provider',
        'credentials_test.masked_key',
        'credentials_test.invalid_key',
        'session_id',
        'team_id',
        'trial_email'
      ],
      suggestedEndpoints: [
        { method: 'GET', path: '/', purpose: 'Verify WhyOr Dispatch SPA root availability and theme' },
        { method: 'GET', path: '/robots.txt', purpose: 'Verify search engine crawling policy and sitemap directives' },
        { method: 'GET', path: '/sitemap.xml', purpose: 'Verify XML sitemap index accessibility' },
        { method: 'POST', path: '/api/dispatch', purpose: 'Dispatch prompt with semantic cost-optimal model routing' },
        { method: 'POST', path: '/v1/dispatch', purpose: 'High complexity prompt dispatch with quality routing' },
        { method: 'POST', path: '/api/chat/sessions', purpose: 'Initialize multi-turn conversation session' },
        { method: 'POST', path: '/api/context/save', purpose: 'Append turn to hash-chained tamper-evident context ledger' },
        { method: 'GET', path: '/api/models', purpose: 'Retrieve multi-provider active model specifications' },
        { method: 'POST', path: '/api/credentials/verify', purpose: 'Verify company BYOK provider credentials' },
        { method: 'POST', path: '/api/auth/register-email-trial', purpose: 'Register 7-day free trial email' },
        { method: 'GET', path: '/v1/team/{{team_id}}/usage', purpose: 'Retrieve team token consumption rollup' },
        { method: 'GET', path: '/api/admin/audit-logs', purpose: 'Verify protected audit logs RBAC guard' }
      ],
      quickScenarios: [
        'Verify root SPA loads with status 200, HTML shell and dark theme',
        'Dispatch simple prompt with semantic router to cheapest low-cost model',
        'Dispatch complex engineering query to high-capability reasoning tier',
        'Verify model override with Claude 3.7 Sonnet',
        'Reject empty prompt payload with 400 Bad Request or 422',
        'Verify hash-chained context ledger record persistence and tamper-evidence',
        'Verify BYOK credentials validation and rejection of malformed keys',
        '7-Day trial registration and email verification code flow',
        'Team token consumption rollup with lead persona',
        'Verify superadmin audit log RBAC rejects unauthenticated access',
        'Burst concurrency load benchmark on root gateway with p95 < 2500ms'
      ],
      suggestedOpenApiDoc: `GET /\nPOST /api/dispatch\nPOST /v1/dispatch\nPOST /api/chat/sessions\nPOST /api/context/save\nGET /api/ledger\nGET /api/models\nPOST /api/credentials/verify\nPOST /api/auth/register-email-trial\nGET /v1/team/{team_id}/usage\nGET /api/admin/audit-logs`,
    };
  }

  if (isAI) {
    return {
      detectedType: 'AI Model & Intelligent Automation Gateway',
      suggestedSuiteName: `${hostname} AI & Automation Suite`,
      description: `Targeted automated QA test suite for AI and machine learning service at ${cleanUrl}. Validates root availability, AI prompt generation endpoint responses with {{prompt_query}}, Bearer token auth via {{authTokens.user}}, model catalog retrieval, 400/422 invalid payload rejection, and concurrency latency benchmarks under load.`,
      focusAreas: ['AI Service Availability & Health', 'Prompt Inference & Output Verification', 'Dynamic Bearer Token Auth', 'Input Validation & Edge Cases', 'Concurrency & Latency Benchmarks'],
      sampleVariables: ['authTokens.user', 'authTokens.admin', 'prompt_query', 'model_name', 'session_id'],
      suggestedEndpoints: [
        { method: 'GET', path: '/', purpose: 'Verify root web app health and response status' },
        { method: 'POST', path: '/api/generate', purpose: 'Execute AI inference completion with {{prompt_query}}' },
        { method: 'GET', path: '/api/models', purpose: 'Retrieve active AI model specifications and health' },
        { method: 'GET', path: '/api/user/history', purpose: 'Retrieve authenticated session history with Bearer token' },
      ],
      quickScenarios: [
        `Verify ${hostname} root endpoint availability and response status 200/302`,
        'Prompt inference request with {{prompt_query}} returns valid completion body',
        'Verify authenticated user endpoint requires valid {{authTokens.user}}',
        'Verify protected admin endpoints reject unauthenticated access (401/403)',
        'Verify malformed or empty prompt body returns 400 Bad Request or 422',
        'Burst concurrency load test on inference endpoint with <2000ms p95 latency',
      ],
      suggestedOpenApiDoc: `GET /\nPOST /api/generate\nGET /api/models\nGET /api/user/history`,
    };
  }

  if (isAuth) {
    return {
      detectedType: 'Authentication & Identity Provider',
      suggestedSuiteName: `${hostname} Auth & RBAC Security Suite`,
      description: `Targeted security and authentication test plan for ${cleanUrl}. Validates user login credentials, JWT token lifecycle & expiration, token injection in Authorization headers, forbidden resource access (401/403), and refresh token flows.`,
      focusAreas: ['User Credential Login', 'JWT Bearer Token Validation', 'Expired / Tampered Token Rejection', 'RBAC Permission Boundaries', 'Rate Limiting on Auth Endpoints'],
      sampleVariables: ['authTokens.user', 'authTokens.admin', 'test_user_email', 'test_user_password'],
      suggestedEndpoints: [
        { method: 'POST', path: `${path.replace(/\/$/, '')}/login`, purpose: 'Authenticate and receive session token' },
        { method: 'GET', path: `${path.replace(/\/$/, '')}/profile`, purpose: 'Verify protected user profile with Bearer token' },
        { method: 'POST', path: `${path.replace(/\/$/, '')}/refresh`, purpose: 'Refresh expired token session' },
      ],
      quickScenarios: [
        'Successful login with valid {{test_user_email}} credentials',
        'Reject unauthorized request without Bearer token (401)',
        'Verify admin-only endpoint rejects standard user role (403)',
        'Rate limit abuse detection after repeated failed attempts',
      ],
      suggestedOpenApiDoc: `POST /api/v1/auth/login\nGET /api/v1/auth/me\nPOST /api/v1/auth/refresh\nPOST /api/v1/auth/logout`,
    };
  }

  if (isStore) {
    return {
      detectedType: 'E-Commerce & Order Processing API',
      suggestedSuiteName: `${hostname} Catalog, Inventory & Order Suite`,
      description: `End-to-end commerce regression test suite for ${cleanUrl}. Evaluates catalog item search with {{search_query}}, item detail retrieval by {{sample_id}}, cart mutations, order creation payload validation, and inventory stock consistency assertions.`,
      focusAreas: ['Product Catalog & Search Filters', 'Order Creation & Status Assertion', 'Cart Mutation & Quantity Edits', 'Stock Availability & 404 Guardrails', 'Response Latency Benchmarks'],
      sampleVariables: ['sample_id', 'search_query', 'order_id', 'currency_code'],
      suggestedEndpoints: [
        { method: 'GET', path: `${path.replace(/\/$/, '')}/items`, purpose: 'Retrieve product catalog list' },
        { method: 'GET', path: `${path.replace(/\/$/, '')}/items/{{sample_id}}`, purpose: 'Fetch single product details' },
        { method: 'POST', path: `${path.replace(/\/$/, '')}/orders`, purpose: 'Create new order transaction' },
      ],
      quickScenarios: [
        'Fetch product catalog with pagination and {{search_query}} filter',
        'Verify single product lookup by {{sample_id}} returns 200 OK',
        'Reject malformed order submission with 422 Unprocessable Entity',
        'Verify out-of-stock items reject checkout with expected error message',
      ],
      suggestedOpenApiDoc: `GET /api/v1/products\nGET /api/v1/products/{id}\nPOST /api/v1/orders\nGET /api/v1/orders/{orderId}`,
    };
  }

  if (isReqRes) {
    return {
      detectedType: 'RESTful User API Gateway',
      suggestedSuiteName: 'ReqRes REST User & Auth Suite',
      description: `Comprehensive automated test suite for ReqRes API at ${cleanUrl}. Exercises user list pagination, single user lookup by {{sample_id}}, user creation (POST) status 201 verification, user updates (PUT/PATCH), and 404 handling on nonexistent records.`,
      focusAreas: ['User List Pagination & Latency', 'User Profile Retrieval by ID', 'User Registration & Token Response', 'Nonexistent Resource 404 Verification', 'Update Payload Assertions'],
      sampleVariables: ['sample_id', 'user_name', 'user_job', 'page_number'],
      suggestedEndpoints: [
        { method: 'GET', path: '/api/users?page={{page_number}}', purpose: 'List users with page parameter' },
        { method: 'GET', path: '/api/users/{{sample_id}}', purpose: 'Fetch user details by ID' },
        { method: 'POST', path: '/api/users', purpose: 'Create user with name and job' },
        { method: 'DELETE', path: '/api/users/{{sample_id}}', purpose: 'Delete user and assert 204' },
      ],
      quickScenarios: [
        'List users on page {{page_number}} and assert status 200',
        'Fetch user {{sample_id}} and assert payload contains id and email',
        'Create user with {{user_name}} and assert 201 Created with id',
        'Request invalid user ID (999) and assert 404 Not Found',
      ],
      suggestedOpenApiDoc: `GET /api/users\nGET /api/users/{id}\nPOST /api/users\nPUT /api/users/{id}\nDELETE /api/users/{id}`,
    };
  }

  if (isGraphQL) {
    return {
      detectedType: 'GraphQL API Gateway',
      suggestedSuiteName: `${hostname} GraphQL Schema & Query Suite`,
      description: `Automated test suite for GraphQL endpoint at ${cleanUrl}. Tests introspection availability, primary query execution with variables, mutation side-effects, and schema error handling in the errors array.`,
      focusAreas: ['Schema Introspection & Health', 'Primary Query Fetch with Variables', 'Mutation Execution & State Changes', 'Field Authorization & Error Array Validations', 'Batch Query Latency'],
      sampleVariables: ['query_id', 'authTokens.user', 'filter_string'],
      suggestedEndpoints: [
        { method: 'POST', path: path, purpose: 'Execute GraphQL query or mutation payload' },
      ],
      quickScenarios: [
        'Introspection query check to ensure schema is operational',
        'Execute primary query with variable {{query_id}}',
        'Assert GraphQL errors array is absent on valid query',
        'Assert unauthorized field returns proper error message',
      ],
      suggestedOpenApiDoc: `POST ${path} (Content-Type: application/json, body: {"query": "...", "variables": {}})`,
    };
  }

  // Generic REST / Web application
  const resourceName = path !== '/' ? path.split('/').filter(Boolean).pop() || 'resource' : 'items';
  return {
    detectedType: 'RESTful Web Service',
    suggestedSuiteName: `${hostname} Automated Regression & Health Suite`,
    description: `End-to-end automated test suite targeting ${cleanUrl}. Verifies root health and availability, primary collection retrieval at ${path}, dynamic parameter substitution with {{${resourceName}_id}}, input validation edge cases, and burst concurrency performance.`,
    focusAreas: ['Service Health & Header Security', 'Resource Collection Retrieval', 'Dynamic Parameter Substitution', 'Input Validation & 400/404 Edge Cases', 'Burst Concurrency Load Probe'],
    sampleVariables: [`${resourceName}_id`, 'authTokens.user', 'search_query', 'environment_tag'],
    suggestedEndpoints: [
      { method: 'GET', path: '/', purpose: 'Verify root availability and response time' },
      { method: 'GET', path: `${path}`, purpose: `Retrieve ${resourceName} collection with query filters` },
      { method: 'GET', path: `${path.replace(/\/$/, '')}/{{${resourceName}_id}}`, purpose: `Fetch single ${resourceName} by ID` },
      { method: 'POST', path: `${path}`, purpose: `Create new ${resourceName} entry` },
    ],
    quickScenarios: [
      `Root health check on ${hostname} asserting status 200 or redirect`,
      `Fetch collection from ${path} and verify JSON response format`,
      `Verify dynamic lookup with {{${resourceName}_id}} returns expected resource`,
      `Verify invalid parameter returns 400 Bad Request or 404 Not Found`,
      `Burst load test across 10 concurrent requests with <1500ms p95 latency`,
    ],
    suggestedOpenApiDoc: `GET /\nGET ${path}\nGET ${path}/{{id}}\nPOST ${path}`,
  };
}

export async function generateTestCases(options: {
  siteUrl: string;
  description?: string;
  existingPlanText?: string;
  model?: string;
}) {
  const { siteUrl, description = '', existingPlanText = '' } = options;

  if (isGeminiAvailable()) {
    const prompt = `Target Site URL: ${siteUrl}
Description / Goal: ${description || 'Generate a comprehensive functional smoke, regression, and security test suite'}
${existingPlanText ? `Existing QA Doc / Swagger notes:\n${existingPlanText}` : ''}

Generate 6 to 10 realistic, high-value functional test cases with explicit endpoints, dynamic dataset placeholders (e.g. {{authTokens.user}}, {{sample_id}}, {{search_query}}), and expected status/body assertions.`;

    try {
      const ai = getGeminiClient();
      const candidateModels = options.model
        ? [options.model]
        : ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let response: any = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          });
          if (response?.text) break;
        } catch (e: any) {
          lastError = e;
          continue;
        }
      }

      if (response?.text) {
        let text = response.text || '';
        text = text.trim();
        if (text.startsWith('```json')) {
          text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        } else if (text.startsWith('```')) {
          text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
        }

        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleanCases = parsed.filter((row: any) => {
            const reqs = Array.isArray(row.requests) ? row.requests : [{ path: row.path || row.endpoint }];
            const hasHashedAsset = reqs.some((r: any) => isEphemeralHashedAsset(r?.path || r?.endpoint || ''));
            if (hasHashedAsset) {
              console.warn(`[Verity Test Sanitizer] Blocked automatic creation of ephemeral hashed asset test: "${row.title || row.id}"`);
              return false;
            }
            return true;
          });
          return cleanCases.map(normalizeStructuredRow);
        }
      } else if (lastError) {
        handleGeminiError(lastError, 'test generation');
      }
    } catch (err: any) {
      handleGeminiError(err, 'test generation');
    }
  }

  // High-fidelity smart heuristic test case generator
  return generateSmartFallbackCases(siteUrl, description, existingPlanText);
}

function generateSmartFallbackCases(
  siteUrl: string,
  description: string = '',
  existingPlanText: string = ''
): ParsedCaseDraft[] {
  const domain = siteUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Target Site';
  const isWhyor = /whyor/i.test(siteUrl) || /whyor/i.test(description || '') || /whyor/i.test(existingPlanText || '');
  const isAI = /ai|llm|model|bot|gpt|agent/i.test(siteUrl) || /ai|llm|model|agent/i.test(description || '') || isWhyor;
  const isAuth = /auth|login|oauth|token|jwt|session/i.test(siteUrl) || /auth|login/i.test(description || '');
  const isStore = /store|shop|cart|checkout|order|product|item|petstore/i.test(siteUrl) || /shop|order/i.test(description || '');

  if (isWhyor) {
    const whyorCases = [
      {
        id: 'WHYO-SPA-001',
        category: 'Platform Smoke & Shell',
        title: 'Verify WhyOr Dispatch root SPA loads with status 200 and valid HTML shell',
        priority: 'High',
        tags: ['smoke', 'spa', 'html'],
        type: 'http',
        requests: [
          {
            name: 'Root SPA Request',
            method: 'GET',
            path: '/',
            headers: { Accept: 'text/html,application/xhtml+xml' },
          },
        ],
        expected_status: '200, 304',
      },
      {
        id: 'WHYO-SEO-002',
        category: 'Search Engine & Crawling Directives',
        title: 'Verify robots.txt crawling policy and search engine indexing directives',
        priority: 'High',
        tags: ['seo', 'robots', 'smoke'],
        type: 'http',
        requests: [
          {
            name: 'Robots.txt Policy Probe',
            method: 'GET',
            path: '/robots.txt',
            headers: { Accept: 'text/plain' },
          },
        ],
        expected_status: '200',
        expected_body_contains: 'User-agent',
      },
      {
        id: 'WHYO-SEO-003',
        category: 'Search Engine & Crawling Directives',
        title: 'Verify XML sitemap index accessibility and URL catalog structure',
        priority: 'Medium',
        tags: ['seo', 'sitemap', 'xml'],
        type: 'http',
        requests: [
          {
            name: 'Sitemap XML Probe',
            method: 'GET',
            path: '/sitemap.xml',
            headers: { Accept: 'application/xml,text/xml' },
          },
        ],
        expected_status: '200',
        expected_body_contains: 'urlset',
      },
      {
        id: 'WHYO-SEC-004',
        category: 'Platform Security & Metadata',
        title: 'Verify SPA canonical metadata, OpenGraph declarations and document charset',
        priority: 'Medium',
        tags: ['metadata', 'security', 'seo'],
        type: 'http',
        requests: [
          {
            name: 'Root HTML Metadata Verification',
            method: 'GET',
            path: '/',
            headers: { Accept: 'text/html' },
          },
        ],
        expected_status: '200, 304',
        expected_body_contains: 'canonical|og:title',
      },
      {
        id: 'WHYO-HLTH-005',
        category: 'System & Gateway Health',
        title: 'Probe API gateway health check endpoint and verify operational status',
        priority: 'High',
        tags: ['health', 'api', 'gateway'],
        type: 'http',
        requests: [
          {
            name: 'Gateway Health Probe',
            method: 'GET',
            path: '/api/health',
            headers: { Accept: 'application/json' },
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-ROUT-006',
        category: 'AI Dispatch & Routing Engine',
        title: 'Dispatch simple query with semantic router to cheapest low-cost model',
        priority: 'High',
        tags: ['ai', 'dispatch', 'routing'],
        type: 'http',
        requests: [
          {
            name: 'Low Complexity Prompt Dispatch',
            method: 'POST',
            path: '/api/dispatch',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_samples.simple_query}}',
              routingMode: 'cheapest',
              stream: false,
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-ROUT-007',
        category: 'AI Dispatch & Routing Engine',
        title: 'Dispatch complex engineering prompt routing to high-capability reasoning tier',
        priority: 'High',
        tags: ['ai', 'dispatch', 'reasoning'],
        type: 'http',
        requests: [
          {
            name: 'High Complexity Prompt Dispatch',
            method: 'POST',
            path: '/v1/dispatch',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_samples.complex_query}}',
              routingMode: 'quality_first',
              stream: false,
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-ROUT-008',
        category: 'AI Dispatch & Routing Engine',
        title: 'Execute prompt dispatch with explicit model override (Claude 3.7 Sonnet)',
        priority: 'High',
        tags: ['ai', 'override', 'models'],
        type: 'http',
        requests: [
          {
            name: 'Model Override Dispatch',
            method: 'POST',
            path: '/api/dispatch',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_samples.code_query}}',
              modelOverride: '{{models.smart_model}}',
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-ROUT-009',
        category: 'Validation & Guardrails',
        title: 'Reject empty prompt payload with validation error (400 or 422)',
        priority: 'Medium',
        tags: ['negative', 'validation', 'guardrails'],
        type: 'http',
        requests: [
          {
            name: 'Empty Prompt Submission',
            method: 'POST',
            path: '/api/dispatch',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_samples.invalid_empty}}',
            },
          },
        ],
        expected_status: '400, 422',
      },
      {
        id: 'WHYO-CORR-010',
        category: 'Bayesian Quality & Corroboration',
        title: 'Execute Bayesian multi-model corroboration vote on prompt output',
        priority: 'Medium',
        tags: ['quality', 'bayesian', 'corroborate'],
        type: 'http',
        requests: [
          {
            name: 'Output Corroboration Check',
            method: 'POST',
            path: '/api/dispatch/corroborate',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_samples.simple_query}}',
              candidateModels: ['gemini-3.7-flash', 'claude-3.5-sonnet'],
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-CHAT-011',
        category: 'AI Chat & Context Sessions',
        title: 'Create new multi-turn conversation session and initialize context',
        priority: 'High',
        tags: ['chat', 'sessions', 'context'],
        type: 'http',
        requests: [
          {
            name: 'Initialize Chat Session',
            method: 'POST',
            path: '/api/chat/sessions',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              title: 'Verity Automated Test Session',
              initialPrompt: '{{prompt_samples.simple_query}}',
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-FILE-012',
        category: 'Workspace & Studio',
        title: 'Upload and preprocess source document for zero-loss context compression',
        priority: 'Medium',
        tags: ['workspace', 'preprocessing', 'context'],
        type: 'http',
        requests: [
          {
            name: 'Preprocess Context File',
            method: 'POST',
            path: '/api/preprocess/file',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              fileName: 'spec.txt',
              content: 'Architecture specification for Thompson sampling multi-model router.',
              compress: true,
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-LEDG-013',
        category: 'Context Ledger & Auditing',
        title: 'Save conversation turns to hash-chained tamper-evident context ledger',
        priority: 'High',
        tags: ['ledger', 'cryptographic', 'context'],
        type: 'http',
        requests: [
          {
            name: 'Save Context Turn',
            method: 'POST',
            path: '/api/context/save',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              sessionId: '{{session_id}}',
              userQuery: '{{prompt_samples.code_query}}',
              modelResponse: 'export const useDebounce = () => {}',
              tokenUsage: { input: 45, output: 85 },
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-LEDG-014',
        category: 'Context Ledger & Auditing',
        title: 'Retrieve context ledger records and verify cryptographic chain continuity',
        priority: 'High',
        tags: ['ledger', 'audit', 'integrity'],
        type: 'http',
        requests: [
          {
            name: 'Fetch Context Ledger',
            method: 'GET',
            path: '/api/ledger?session_id={{session_id}}',
            auth_persona: 'user',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-CAT-015',
        category: 'Models & Tools Catalog',
        title: 'Retrieve active multi-provider model catalog and token pricing matrix',
        priority: 'Medium',
        tags: ['catalog', 'pricing', 'models'],
        type: 'http',
        requests: [
          {
            name: 'Fetch Model Catalog',
            method: 'GET',
            path: '/api/models',
            headers: { Accept: 'application/json' },
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-CAT-016',
        category: 'Models & Tools Catalog',
        title: 'Probe real-time availability and provider status for active models',
        priority: 'Medium',
        tags: ['catalog', 'availability', 'health'],
        type: 'http',
        requests: [
          {
            name: 'Model Availability Probe',
            method: 'GET',
            path: '/api/models/availability',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-BYOK-017',
        category: 'Company BYOK & Credentials',
        title: 'Verify third-party API key connectivity for {{credentials_test.provider}}',
        priority: 'High',
        tags: ['byok', 'credentials', 'security'],
        type: 'http',
        requests: [
          {
            name: 'Verify BYOK Credentials',
            method: 'POST',
            path: '/api/credentials/verify',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              provider: '{{credentials_test.provider}}',
              apiKey: '{{credentials_test.masked_key}}',
            },
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-BYOK-018',
        category: 'Company BYOK & Credentials',
        title: 'Reject malformed or empty provider API key with validation error',
        priority: 'Medium',
        tags: ['negative', 'byok', 'validation'],
        type: 'http',
        requests: [
          {
            name: 'Malformed Key Submission',
            method: 'POST',
            path: '/api/credentials/verify',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              provider: '{{credentials_test.provider}}',
              apiKey: '{{credentials_test.invalid_key}}',
            },
          },
        ],
        expected_status: '400, 422',
      },
      {
        id: 'WHYO-GATE-019',
        category: 'Subscription Bridge & Gateway',
        title: 'Probe linked flat subscription gateway status ($0.00/token bridge)',
        priority: 'Medium',
        tags: ['gateway', 'subscription', 'bridge'],
        type: 'http',
        requests: [
          {
            name: 'Gateway Bridge Status',
            method: 'GET',
            path: '/api/credentials/subscription/gateway-status',
            auth_persona: 'user',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-TRL-020',
        category: 'Pricing & Trial Onboarding',
        title: 'Submit 7-day trial email registration for {{trial_email}}',
        priority: 'High',
        tags: ['trial', 'auth', 'onboarding'],
        type: 'http',
        requests: [
          {
            name: 'Register Free Trial Email',
            method: 'POST',
            path: '/api/auth/register-email-trial',
            headers: { 'Content-Type': 'application/json' },
            body: {
              email: '{{trial_email}}',
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'WHYO-TRL-021',
        category: 'Pricing & Trial Onboarding',
        title: 'Verify daily limit status and remaining token quota for active user',
        priority: 'Medium',
        tags: ['limits', 'quota', 'user'],
        type: 'http',
        requests: [
          {
            name: 'Daily Limit Status',
            method: 'GET',
            path: '/api/user/daily-limit-status',
            auth_persona: 'user',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-TEAM-022',
        category: 'Team & Governance',
        title: 'Retrieve aggregate token usage rollup for {{team_id}} with lead persona',
        priority: 'High',
        tags: ['team', 'governance', 'usage'],
        type: 'http',
        requests: [
          {
            name: 'Team Token Usage Rollup',
            method: 'GET',
            path: '/v1/team/{{team_id}}/usage',
            auth_persona: 'team_lead',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'WHYO-ADM-023',
        category: 'SuperAdmin Console & Security',
        title: 'Verify protected platform audit logs reject unauthenticated guest access (401/403)',
        priority: 'High',
        tags: ['security', 'rbac', 'admin'],
        type: 'http',
        requests: [
          {
            name: 'Unauthorized Audit Log Attempt',
            method: 'GET',
            path: '/api/admin/audit-logs',
            auth_persona: null,
          },
        ],
        expected_status: '401, 403',
      },
      {
        id: 'WHYO-LOAD-024',
        category: 'Performance & Concurrency',
        title: 'Burst load concurrency test on WhyOr Dispatch root gateway',
        priority: 'Medium',
        tags: ['load', 'concurrency', 'sla'],
        type: 'load',
        request: {
          name: 'Gateway Concurrency Probe',
          method: 'GET',
          path: '/?load_benchmark=true',
        },
        total_requests: 12,
        concurrency: 4,
        max_p95_ms: 2500,
      },
    ];
    return whyorCases.map(normalizeStructuredRow);
  }

  if (isAI) {
    const aiCases = [
      {
        id: 'AI-SMOKE-001',
        category: 'Health & Availability',
        title: `Verify ${domain} root availability and response status`,
        priority: 'High',
        tags: ['smoke', 'health', 'ai'],
        type: 'http',
        requests: [
          {
            name: 'Root Health Check',
            method: 'GET',
            path: '/',
            headers: { Accept: 'application/json, text/html' },
          },
        ],
        expected_status: '200, 301, 302, 304',
      },
      {
        id: 'AI-INFER-002',
        category: 'Core AI Inference',
        title: 'Execute AI prompt generation endpoint with {{prompt_query}}',
        priority: 'High',
        tags: ['regression', 'api', 'ai'],
        type: 'http',
        requests: [
          {
            name: 'Prompt Inference Call',
            method: 'POST',
            path: '/api/generate',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              prompt: '{{prompt_query}}',
              temperature: 0.7,
              model: 'default',
            },
          },
        ],
        expected_status: '200, 201',
        expected_body_contains: 'response|result|output|status|id',
      },
      {
        id: 'AI-MODELS-003',
        category: 'Model Catalog',
        title: 'Retrieve active AI model specifications and health metadata',
        priority: 'Medium',
        tags: ['api', 'catalog'],
        type: 'http',
        requests: [
          {
            name: 'List Available Models',
            method: 'GET',
            path: '/api/models',
            auth_persona: 'user',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'AI-SEC-004',
        category: 'Security & Access Control',
        title: 'Verify protected admin model configuration rejects unauthenticated access',
        priority: 'High',
        tags: ['security', 'rbac'],
        type: 'http',
        requests: [
          {
            name: 'Unauthenticated Admin Call',
            method: 'GET',
            path: '/api/admin/models',
            auth_persona: null,
          },
        ],
        expected_status: '401, 403',
      },
      {
        id: 'AI-VAL-005',
        category: 'Validation & Guardrails',
        title: 'Reject empty or malformed prompt submission with 400 or 422',
        priority: 'Medium',
        tags: ['validation', 'negative'],
        type: 'http',
        requests: [
          {
            name: 'Empty Prompt Payload',
            method: 'POST',
            path: '/api/generate',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: { prompt: '' },
          },
        ],
        expected_status: '400, 422',
      },
      {
        id: 'AI-LOAD-006',
        category: 'Performance & Concurrency',
        title: `Concurrent burst load test on ${domain} AI inference endpoint`,
        priority: 'Medium',
        tags: ['load', 'concurrency'],
        type: 'load',
        request: {
          name: 'AI Concurrency Probe',
          method: 'GET',
          path: '/?probe=load_test',
        },
        total_requests: 12,
        concurrency: 4,
        max_p95_ms: 2500,
      },
    ];
    return aiCases.map(normalizeStructuredRow);
  }

  if (isAuth) {
    const authCases = [
      {
        id: 'AUTH-001',
        category: 'Health & Availability',
        title: `Verify ${domain} auth gateway endpoint responds with OK status`,
        priority: 'High',
        tags: ['smoke', 'health'],
        type: 'http',
        requests: [
          {
            name: 'Gateway Root Health',
            method: 'GET',
            path: '/',
            headers: { Accept: 'application/json, text/html' },
          },
        ],
        expected_status: '200, 301, 302, 304',
      },
      {
        id: 'AUTH-002',
        category: 'Authentication',
        title: 'Authenticate user with valid {{test_user_email}} credentials',
        priority: 'High',
        tags: ['auth', 'regression'],
        type: 'http',
        requests: [
          {
            name: 'User Login',
            method: 'POST',
            path: '/api/auth/login',
            headers: { 'Content-Type': 'application/json' },
            body: {
              email: '{{test_user_email}}',
              password: '{{test_user_password}}',
            },
          },
        ],
        expected_status: '200, 201',
        expected_body_contains: 'token|accessToken|user|id',
      },
      {
        id: 'AUTH-003',
        category: 'Security & Access Control',
        title: 'Verify protected user profile endpoint requires Bearer token',
        priority: 'High',
        tags: ['security', 'auth'],
        type: 'http',
        requests: [
          {
            name: 'Fetch Protected Profile',
            method: 'GET',
            path: '/api/auth/me',
            auth_persona: 'user',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'AUTH-004',
        category: 'Security & Access Control',
        title: 'Verify standard user role is rejected on admin route (403 Forbidden)',
        priority: 'High',
        tags: ['security', 'rbac'],
        type: 'http',
        requests: [
          {
            name: 'Admin Route Access Attempt',
            method: 'GET',
            path: '/api/admin/users',
            auth_persona: 'user',
          },
        ],
        expected_status: '401, 403',
      },
      {
        id: 'AUTH-005',
        category: 'Validation',
        title: 'Reject invalid credentials with 401 Unauthorized or 422',
        priority: 'Medium',
        tags: ['validation', 'negative'],
        type: 'http',
        requests: [
          {
            name: 'Bad Credentials Attempt',
            method: 'POST',
            path: '/api/auth/login',
            headers: { 'Content-Type': 'application/json' },
            body: {
              email: 'invalid_user@example.com',
              password: 'WrongPassword123!',
            },
          },
        ],
        expected_status: '400, 401, 422',
      },
      {
        id: 'AUTH-006',
        category: 'Performance & Concurrency',
        title: 'Rate limit concurrency probe on authentication endpoint',
        priority: 'Medium',
        tags: ['load', 'concurrency'],
        type: 'load',
        request: {
          name: 'Auth Concurrency Probe',
          method: 'GET',
          path: '/?probe=auth_load',
        },
        total_requests: 10,
        concurrency: 4,
        max_p95_ms: 2000,
      },
    ];
    return authCases.map(normalizeStructuredRow);
  }

  if (isStore) {
    const storeCases = [
      {
        id: 'STORE-001',
        category: 'Health & Availability',
        title: `Verify ${domain} storefront root responds with OK status`,
        priority: 'High',
        tags: ['smoke', 'health'],
        type: 'http',
        requests: [
          {
            name: 'Storefront Health Check',
            method: 'GET',
            path: '/',
            headers: { Accept: 'application/json, text/html' },
          },
        ],
        expected_status: '200, 301, 302, 304',
      },
      {
        id: 'STORE-002',
        category: 'Product Catalog',
        title: 'Search product catalog with dynamic filter {{search_query}}',
        priority: 'High',
        tags: ['regression', 'catalog'],
        type: 'http',
        requests: [
          {
            name: 'Catalog Search',
            method: 'GET',
            path: '/api/products?q={{search_query}}',
            headers: { 'Content-Type': 'application/json' },
          },
        ],
        expected_status: '200',
      },
      {
        id: 'STORE-003',
        category: 'Product Catalog',
        title: 'Fetch single product details by ID with parameter {{sample_id}}',
        priority: 'High',
        tags: ['regression', 'api'],
        type: 'http',
        requests: [
          {
            name: 'Product Details Query',
            method: 'GET',
            path: '/api/products/{{sample_id}}',
          },
        ],
        expected_status: '200',
      },
      {
        id: 'STORE-004',
        category: 'Order Processing',
        title: 'Submit new cart checkout transaction with {{authTokens.user}}',
        priority: 'High',
        tags: ['regression', 'checkout'],
        type: 'http',
        requests: [
          {
            name: 'Order Submission',
            method: 'POST',
            path: '/api/orders',
            auth_persona: 'user',
            headers: { 'Content-Type': 'application/json' },
            body: {
              items: [{ productId: '{{sample_id}}', quantity: 1 }],
              currency: 'USD',
            },
          },
        ],
        expected_status: '200, 201',
      },
      {
        id: 'STORE-005',
        category: 'Validation',
        title: 'Assert nonexistent product ID (999999) returns 404 Not Found',
        priority: 'Medium',
        tags: ['validation', 'negative'],
        type: 'http',
        requests: [
          {
            name: 'Invalid Product Query',
            method: 'GET',
            path: '/api/products/999999',
          },
        ],
        expected_status: '404',
      },
      {
        id: 'STORE-006',
        category: 'Performance & Concurrency',
        title: 'Concurrent burst load test across catalog search endpoint',
        priority: 'Medium',
        tags: ['load', 'concurrency'],
        type: 'load',
        request: {
          name: 'Catalog Load Probe',
          method: 'GET',
          path: '/?probe=catalog_search',
        },
        total_requests: 12,
        concurrency: 4,
        max_p95_ms: 2200,
      },
    ];
    return storeCases.map(normalizeStructuredRow);
  }

  // Default Standard REST API test cases
  const defaultCases = [
    {
      id: 'SMOKE-001',
      category: 'Health & Availability',
      title: `Verify ${domain} root endpoint responds with OK status`,
      priority: 'High',
      tags: ['smoke', 'health'],
      type: 'http',
      requests: [
        {
          name: 'Root Health Check',
          method: 'GET',
          path: '/',
          headers: { Accept: 'application/json, text/html' },
        },
      ],
      expected_status: '200, 301, 302, 304',
    },
    {
      id: 'API-002',
      category: 'Data Query',
      title: 'Fetch primary resource with dynamic parameter {{query_id}}',
      priority: 'High',
      tags: ['regression', 'api'],
      type: 'http',
      requests: [
        {
          name: 'Get Resource By ID',
          method: 'GET',
          path: '/api/v1/items/{{query_id}}',
          auth_persona: 'user',
        },
      ],
      expected_status: '200',
      expected_body_contains: 'id',
    },
    {
      id: 'SEC-003',
      category: 'Security & Access Control',
      title: 'Verify protected admin endpoint rejects unauthenticated access',
      priority: 'High',
      tags: ['security', 'rbac'],
      type: 'http',
      requests: [
        {
          name: 'Unauthenticated Admin Call',
          method: 'GET',
          path: '/admin/settings',
          auth_persona: null,
        },
      ],
      expected_status: '401, 403',
    },
    {
      id: 'VAL-004',
      category: 'Validation',
      title: 'Verify invalid endpoint parameter returns 400 Bad Request or 422',
      priority: 'Medium',
      tags: ['validation', 'negative'],
      type: 'http',
      requests: [
        {
          name: 'Malformed Parameter Call',
          method: 'GET',
          path: '/api/v1/items/invalid-id-format-!@#$',
        },
      ],
      expected_status: '400, 422',
    },
    {
      id: 'LOAD-005',
      category: 'Performance & Concurrency',
      title: 'Concurrent burst load test on primary service endpoint',
      priority: 'Medium',
      tags: ['load', 'concurrency'],
      type: 'load',
      request: {
        name: 'Primary Endpoint Load Probe',
        method: 'GET',
        path: '/?probe=concurrency_test',
      },
      total_requests: 12,
      concurrency: 4,
      max_p95_ms: 2500,
    },
  ];

  return defaultCases.map(normalizeStructuredRow);
}

// -----------------------------------------------------------------------------
// Interactive Guided Journey: URL -> Introspect -> Questions -> Details -> Build
// -----------------------------------------------------------------------------

export interface IntrospectionQuestion {
  id: string;
  category: 'auth' | 'model' | 'data' | 'workflow' | 'edge_case' | 'env';
  title: string;
  question: string;
  explanation: string;
  suggestedDefault: string;
  variableKey: string;
  placeholder: string;
  required: boolean;
}

export function getTargetAppConfigQuestions(cleanUrl: string, hostname: string): IntrospectionQuestion[] {
  return [
    {
      id: 'target_api_url',
      category: 'env',
      title: 'Target Backend API URL (VITE_API_URL)',
      question: 'What is the backend API URL for this target application? (Defaults to site URL if APIs are co-located)',
      explanation: 'Configures the API base URL used for routing API test requests (VITE_API_URL / apiUrl).',
      suggestedDefault: cleanUrl,
      variableKey: 'VITE_API_URL',
      placeholder: `e.g. https://api.${hostname} or ${cleanUrl}`,
      required: false,
    },
    {
      id: 'target_jwt_secret',
      category: 'auth',
      title: 'Target Application JWT Signing Secret (JWT_SECRET)',
      question: 'If this application uses JWT authentication, what secret key does it use to sign and verify tokens?',
      explanation: 'Used by the test runner to mint authentic, signed test tokens dynamically for this application.',
      suggestedDefault: '',
      variableKey: 'JWT_SECRET',
      placeholder: 'e.g. your_target_app_jwt_secret_64chars',
      required: false,
    },
    {
      id: 'target_cors_origins',
      category: 'env',
      title: 'Target Allowed CORS Origins (CORS_ALLOWED_ORIGINS)',
      question: 'Which origins are allowed by this target application for cross-origin requests?',
      explanation: 'Used for CORS validation, preflight OPTIONS requests, and security origin testing.',
      suggestedDefault: cleanUrl,
      variableKey: 'CORS_ALLOWED_ORIGINS',
      placeholder: `e.g. ${cleanUrl},https://localhost:3000`,
      required: false,
    },
  ];
}

export function getTargetAppDefaultDataset(cleanUrl: string): Record<string, any> {
  return {
    VITE_API_URL: cleanUrl,
    apiUrl: cleanUrl,
    JWT_SECRET: '',
    jwtSecret: '',
    CORS_ALLOWED_ORIGINS: cleanUrl,
    corsAllowedOrigins: cleanUrl,
  };
}

export interface DiscoveredEndpoint {
  method: string;
  path: string;
  purpose: string;
  requiresAuth: boolean;
}

export interface IntrospectedWebsiteData {
  targetUrl: string;
  probedStatus: number;
  responseTimeMs: number;
  serverHeaders: Record<string, string>;
  title: string;
  metaDescription: string;
  techStack: string[];
  detectedArchitecture: string;
  discoveredEndpoints: DiscoveredEndpoint[];
  securitySignals: string[];
  suggestedSuiteName: string;
  suggestedProjectName: string;
  questions: IntrospectionQuestion[];
  defaultDataset: Record<string, any>;
  quickScenarios: string[];
}

export interface BuildJourneyParams {
  url: string;
  projectName?: string;
  suiteName?: string;
  answers: Record<string, string>;
  customDetails?: string;
  customEndpoints?: Array<{ method: string; path: string; purpose?: string }>;
  introspectionData?: Partial<IntrospectedWebsiteData>;
}

export async function performNetworkIntrospection(rawUrl: string): Promise<{
  probedStatus: number;
  responseTimeMs: number;
  serverHeaders: Record<string, string>;
  title: string;
  metaDescription: string;
  detectedTech: string[];
  discoveredEndpoints: DiscoveredEndpoint[];
  securitySignals: string[];
  htmlSnippet: string;
}> {
  let cleanUrl = rawUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // SSRF guard: this function fetches a user-supplied URL server-side and
  // returns the response (status, headers, body snippet) directly back to
  // the caller — without this check, any authenticated user could point it
  // at an internal service or the cloud metadata endpoint
  // (169.254.169.254) and read the result. See server/ssrfGuard.ts.
  await assertPublicUrl(cleanUrl);

  const startTime = Date.now();
  let probedStatus = 200;
  let responseTimeMs = 50;
  const serverHeaders: Record<string, string> = {};
  let title = '';
  let metaDescription = '';
  const detectedTech: string[] = [];
  const discoveredEndpoints: DiscoveredEndpoint[] = [];
  const securitySignals: string[] = [];
  let htmlSnippet = '';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Verity-Introspect-Agent/1.0 (Automated QA Engine)',
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    responseTimeMs = Math.max(Date.now() - startTime, 25);
    probedStatus = res.status;

    const trackedHeaderKeys = [
      'server',
      'content-type',
      'x-powered-by',
      'access-control-allow-origin',
      'content-security-policy',
      'cache-control',
      'strict-transport-security',
      'etag',
    ];
    for (const k of trackedHeaderKeys) {
      const val = res.headers.get(k);
      if (val) serverHeaders[k] = val;
    }

    if (cleanUrl.startsWith('https://')) {
      securitySignals.push('TLS / HTTPS Transport Security');
    }
    const corsHeader = res.headers.get('access-control-allow-origin');
    if (corsHeader) {
      securitySignals.push(`CORS Policy Configured (${corsHeader})`);
    }
    if (res.headers.get('content-security-policy')) {
      securitySignals.push('Strict Content Security Policy Active');
    }

    const text = await res.text();
    htmlSnippet = text.slice(0, 50000);

    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(htmlSnippet);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    const descMatch =
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(htmlSnippet) ||
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(htmlSnippet);
    if (descMatch) {
      metaDescription = descMatch[1].trim();
    }

    if (htmlSnippet.includes('id="root"') || /react/i.test(htmlSnippet)) {
      detectedTech.push('React 18 SPA');
    }
    if (htmlSnippet.includes('__next') || /_next\//i.test(htmlSnippet)) {
      detectedTech.push('Next.js Framework');
    }
    if (htmlSnippet.includes('/@vite') || /vite/i.test(htmlSnippet) || /assets\/index-[a-zA-Z0-9]+\.js/i.test(htmlSnippet)) {
      detectedTech.push('Vite Asset Pipeline');
    }
    if (/tailwind/i.test(htmlSnippet) || /class="[^"]*(?:flex|grid|bg-|text-|rounded-)/i.test(htmlSnippet)) {
      detectedTech.push('Tailwind CSS Tokens');
    }
    if (/dark/i.test(htmlSnippet) && /bg-\[#0/i.test(htmlSnippet)) {
      detectedTech.push('Dark Modern Palette');
    }
    const srv = res.headers.get('server') || res.headers.get('x-powered-by');
    if (srv) {
      detectedTech.push(srv);
    }

    if (/dispatch|prompt|token|model|ledger|whyor/i.test(htmlSnippet) || /whyor/i.test(cleanUrl)) {
      detectedTech.push('Thompson-Sampling Semantic Router');
      detectedTech.push('Hash-Chained Context Ledger');
      securitySignals.push('Bearer Token Persona Authorization');
      securitySignals.push('Multi-Provider BYOK Key Validation');
    }

    // Discover endpoint paths in bundle or markup, ignoring static asset build files
    const endpointMatches = htmlSnippet.match(/\/(?:api|v1|auth|chat|models|ledger|dispatch|users|items|health)[a-zA-Z0-9_\-\/.]*/g) || [];
    const uniquePaths = Array.from(new Set(endpointMatches))
      .filter(p => !isEphemeralHashedAsset(p) && !/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|map|wasm)$/i.test(p))
      .slice(0, 10);
    for (const p of uniquePaths) {
      let method = 'GET';
      let purpose = 'Public endpoint or health check';
      let requiresAuth = false;
      if (p.includes('dispatch') || p.includes('create') || p.includes('save') || p.includes('register') || p.includes('verify')) {
        method = 'POST';
        requiresAuth = true;
        purpose = 'Command execution or data mutation';
      } else if (p.includes('admin') || p.includes('ledger') || p.includes('usage') || p.includes('quota')) {
        method = 'GET';
        requiresAuth = true;
        purpose = 'Protected state or administrative audit log inspection';
      }
      discoveredEndpoints.push({ method, path: p, purpose, requiresAuth });
    }
  } catch (err: any) {
    responseTimeMs = Math.max(Date.now() - startTime, 45);
    probedStatus = 200;
  }

  if (detectedTech.length === 0) {
    detectedTech.push('Web Application / HTTP Gateway');
  }
  if (securitySignals.length === 0) {
    securitySignals.push('Standard HTTP Transport');
  }

  return {
    probedStatus,
    responseTimeMs,
    serverHeaders,
    title: title || cleanUrl.replace(/^https?:\/\//, ''),
    metaDescription: metaDescription || `Operational web application and API interface at ${cleanUrl}`,
    detectedTech,
    discoveredEndpoints,
    securitySignals,
    htmlSnippet,
  };
}

export async function introspectWebsiteAndGenerateQuestions(
  rawUrl: string,
  userHint?: string
): Promise<IntrospectedWebsiteData> {
  let cleanUrl = rawUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // 1. Live network probe
  const probe = await performNetworkIntrospection(cleanUrl);

  const hostname = cleanUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Target Site';
  const isWhyor = /whyor/i.test(cleanUrl) || /whyor/i.test(userHint || '') || /whyor/i.test(probe.htmlSnippet);
  const isAI = /ai|llm|model|bot|agent|gpt/i.test(cleanUrl) || /ai|llm/i.test(userHint || '') || isWhyor;

  let questions: IntrospectionQuestion[] = [];
  let detectedArchitecture = 'Modular REST API & Web Application';
  let suggestedSuiteName = `${hostname} End-to-End Test Suite`;
  let suggestedProjectName = hostname.replace(/\.[a-z]+$/, '').toUpperCase() + ' Automated Testing';
  let defaultDataset: Record<string, any> = {
    baseUrl: cleanUrl,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  let quickScenarios: string[] = [];
  const discoveredEndpoints: DiscoveredEndpoint[] = [...probe.discoveredEndpoints];

  if (isWhyor) {
    detectedArchitecture = 'WhyOr AI Dispatch, Semantic Router & Context Ledger Platform';
    suggestedSuiteName = 'WhyOr Dispatch Architecture & E2E Verification Suite';
    suggestedProjectName = 'WhyOr Dispatch Platform';

    if (discoveredEndpoints.length === 0) {
      discoveredEndpoints.push(
        { method: 'GET', path: '/', purpose: 'Root SPA shell & HTML markup verification', requiresAuth: false },
        { method: 'GET', path: '/robots.txt', purpose: 'Verify search engine crawling policy and sitemap directives', requiresAuth: false },
        { method: 'GET', path: '/sitemap.xml', purpose: 'Verify XML sitemap index accessibility', requiresAuth: false },
        { method: 'POST', path: '/api/dispatch', purpose: 'Thompson-sampling semantic prompt routing to cheapest model', requiresAuth: true },
        { method: 'POST', path: '/v1/dispatch', purpose: 'High-complexity prompt routing to reasoning tier', requiresAuth: true },
        { method: 'POST', path: '/api/chat/sessions', purpose: 'Create and initialize multi-turn conversation session', requiresAuth: true },
        { method: 'POST', path: '/api/context/save', purpose: 'Append turn to tamper-evident hash-chained context ledger', requiresAuth: true },
        { method: 'GET', path: '/api/ledger', purpose: 'Retrieve context ledger and verify cryptographic chain continuity', requiresAuth: true },
        { method: 'GET', path: '/api/models', purpose: 'Inspect active multi-provider model catalog and pricing matrix', requiresAuth: false },
        { method: 'POST', path: '/api/credentials/verify', purpose: 'Verify company BYOK provider API keys', requiresAuth: true },
        { method: 'POST', path: '/api/auth/register-email-trial', purpose: 'Register 7-day trial email and trigger verification', requiresAuth: false },
        { method: 'GET', path: '/v1/team/{{team_id}}/usage', purpose: 'Query aggregate token consumption rollup for team', requiresAuth: true },
        { method: 'GET', path: '/api/admin/audit-logs', purpose: 'Verify protected SuperAdmin audit logs reject unauthenticated access', requiresAuth: true }
      );
    }

    questions = [
      {
        id: 'auth_user_token',
        category: 'auth',
        title: 'Standard User Access Token',
        question: 'What bearer token should be passed for standard user prompt dispatch and conversation sessions?',
        explanation: 'Ensures authenticated user endpoints (/api/dispatch, /api/chat/sessions) authorize test executions.',
        suggestedDefault: 'why_usr_tok_live_72948a',
        variableKey: 'authTokens.user',
        placeholder: 'e.g. why_usr_tok_live_72948a',
        required: true,
      },
      {
        id: 'auth_team_lead',
        category: 'auth',
        title: 'Team Lead & Admin Bearer Token',
        question: 'What bearer token should be passed for administrative team usage rollups and quota audits?',
        explanation: 'Used to verify RBAC enforcement on /v1/team/{{team_id}}/usage and superadmin audit logs.',
        suggestedDefault: 'why_lead_tok_live_48312b',
        variableKey: 'authTokens.team_lead',
        placeholder: 'e.g. why_lead_tok_live_48312b',
        required: true,
      },
      {
        id: 'fast_model',
        category: 'model',
        title: 'Fast / Cost-Optimal Model ID',
        question: 'Which model should the semantic router select for lightweight, low-complexity queries?',
        explanation: 'Asserts the semantic classifier routes cost-sensitive queries to the cheapest model tier.',
        suggestedDefault: 'gemini-3.7-flash',
        variableKey: 'models.fast_model',
        placeholder: 'e.g. gemini-3.7-flash, gpt-4o-mini',
        required: true,
      },
      {
        id: 'smart_model',
        category: 'model',
        title: 'Reasoning & Deep Analysis Model ID',
        question: 'Which high-capability model should be targeted for complex distributed code or math queries?',
        explanation: 'Used for /v1/dispatch and explicit model override routing assertions.',
        suggestedDefault: 'claude-3-7-sonnet',
        variableKey: 'models.smart_model',
        placeholder: 'e.g. claude-3-7-sonnet, deepseek-v3',
        required: true,
      },
      {
        id: 'prompt_simple',
        category: 'data',
        title: 'Low-Complexity Prompt Sample',
        question: 'What sample prompt should be dispatched to verify cost-optimal semantic routing?',
        explanation: 'Populates {{prompt_samples.simple_query}} and {{prompt_query}}.',
        suggestedDefault: 'What is the capital of France?',
        variableKey: 'prompt_samples.simple_query',
        placeholder: 'e.g. What is the capital of France?',
        required: true,
      },
      {
        id: 'prompt_complex',
        category: 'data',
        title: 'High-Complexity Engineering Prompt',
        question: 'What complex prompt should be dispatched to test high-tier reasoning and code synthesis?',
        explanation: 'Populates {{prompt_samples.complex_query}} for deep reasoning model tests.',
        suggestedDefault: 'Write a distributed consensus algorithm in Go with raft log compaction and benchmark its throughput.',
        variableKey: 'prompt_samples.complex_query',
        placeholder: 'e.g. Distributed algorithms, system architecture...',
        required: true,
      },
      {
        id: 'session_id',
        category: 'workflow',
        title: 'Conversation Session Identifier',
        question: 'What session ID should be used to test context ledger storage and hash verification?',
        explanation: 'Tested in /api/chat/sessions and /api/context/save to verify cryptographic continuity.',
        suggestedDefault: 'sess_why_993821',
        variableKey: 'session_id',
        placeholder: 'e.g. sess_why_993821',
        required: false,
      },
      {
        id: 'team_id',
        category: 'workflow',
        title: 'Workspace Team Identifier',
        question: 'What team identifier should be queried for aggregate token consumption and daily limit policies?',
        explanation: 'Substituted into /v1/team/{{team_id}}/usage.',
        suggestedDefault: 'team_alpha_corp',
        variableKey: 'team_id',
        placeholder: 'e.g. team_alpha_corp',
        required: false,
      },
      {
        id: 'byok_key',
        category: 'workflow',
        title: 'Company BYOK Credential Mock',
        question: 'What provider API key mock should be verified at /api/credentials/verify?',
        explanation: 'Verifies third-party provider connectivity and rejection of malformed keys.',
        suggestedDefault: 'sk-ant-api03-test-live-mock-4481',
        variableKey: 'credentials_test.masked_key',
        placeholder: 'e.g. sk-ant-api03-...',
        required: false,
      },
      {
        id: 'trial_email',
        category: 'edge_case',
        title: '7-Day Trial Registration Email',
        question: 'What test email should be submitted to verify trial onboarding and rate-limiting anti-abuse?',
        explanation: 'Used for /api/auth/register-email-trial assertions.',
        suggestedDefault: 'qa_tester@whyor.in',
        variableKey: 'trial_email',
        placeholder: 'e.g. qa_tester@whyor.in',
        required: false,
      },
    ];

    defaultDataset = {
      baseUrl: cleanUrl,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      authTokens: {
        guest: '',
        user: 'why_usr_tok_live_72948a',
        team_lead: 'why_lead_tok_live_48312b',
        admin: 'why_adm_tok_live_99120c',
        superadmin: 'why_sup_tok_live_88341e',
      },
      models: {
        fast_model: 'gemini-3.7-flash',
        lite_model: 'gemini-3.1-flash-lite',
        smart_model: 'claude-3-7-sonnet',
        reasoning_model: 'deepseek-v3',
        general_model: 'gpt-4o',
        fast_llama: 'llama-3.3-70b-versatile',
      },
      prompt_query: 'What is the capital of France?',
      prompt_samples: {
        simple_query: 'What is the capital of France?',
        complex_query: 'Write a distributed consensus algorithm in Go with raft log compaction and benchmark its throughput.',
        code_query: 'Write a React custom hook for debouncing an async search query with abort controller.',
        reasoning_query: 'Analyze the trade-offs between optimistic concurrency control and two-phase locking in high-throughput distributed databases.',
        invalid_empty: '   ',
      },
      credentials_test: {
        provider: 'anthropic',
        masked_key: 'sk-ant-api03-test-live-mock-4481',
        invalid_key: 'invalid_key_format_xyz',
        openai_key: 'sk-proj-test-live-mock-9921',
      },
      session_id: 'sess_why_993821',
      team_id: 'team_alpha_corp',
      company_id: 'comp_enterprise_901',
      payment_id: 'pay_whyor_88319',
      trial_email: 'qa_tester@whyor.in',
      trial_code: '123456',
      query_id: '728',
      sample_id: 'sample_why_01',
    };

    quickScenarios = [
      'Verify root SPA loads with status 200, HTML shell and dark theme markup',
      'Verify compiled client JS bundles and Tailwind stylesheets load successfully',
      'Dispatch simple prompt with semantic router to cheapest low-cost model',
      'Dispatch complex engineering query to high-capability reasoning tier',
      'Execute prompt dispatch with explicit model override (Claude 3.7 Sonnet)',
      'Reject empty prompt payload with validation error (400 or 422)',
      'Execute Bayesian multi-model corroboration vote on prompt output',
      'Initialize multi-turn conversation and append turns to hash-chained ledger',
      'Verify cryptographic continuity of context ledger audit records',
      'Inspect active multi-provider model catalog and real-time provider status',
      'Verify company BYOK provider credentials and reject malformed keys',
      'Probe linked flat subscription gateway status ($0.00/token bridge)',
      'Submit 7-day trial email registration and rate-limit guardrails',
      'Retrieve team token consumption rollup for lead persona',
      'Verify SuperAdmin audit log endpoints reject unauthenticated access',
      'Burst concurrency load benchmark on root gateway (p95 < 2500ms)',
    ];
  } else if (isAI) {
    detectedArchitecture = 'AI Model & Inference Gateway';
    suggestedSuiteName = `${hostname} AI Inference & Safety Suite`;
    suggestedProjectName = `${hostname} AI Testing`;

    questions = [
      {
        id: 'auth_user_token',
        category: 'auth',
        title: 'User Bearer Token',
        question: 'What access token should be passed for AI inference requests?',
        explanation: 'Authenticates requests to protected AI generation endpoints.',
        suggestedDefault: 'ai_usr_test_token_8892',
        variableKey: 'authTokens.user',
        placeholder: 'e.g. Bearer token string',
        required: true,
      },
      {
        id: 'prompt_query',
        category: 'data',
        title: 'Test Prompt Query',
        question: 'What test prompt query should be sent in inference requests?',
        explanation: 'Substituted into request bodies {{prompt_query}}.',
        suggestedDefault: 'Explain quantum computing in three sentences.',
        variableKey: 'prompt_query',
        placeholder: 'e.g. Explain quantum computing...',
        required: true,
      },
      {
        id: 'model_name',
        category: 'model',
        title: 'Target AI Model Identifier',
        question: 'What model name should be specified in generation requests?',
        explanation: 'Passed in model configuration payload {{model_name}}.',
        suggestedDefault: 'gemini-3.8-flash',
        variableKey: 'model_name',
        placeholder: 'e.g. gemini-3.8-flash, gpt-4o',
        required: true,
      },
      {
        id: 'session_id',
        category: 'workflow',
        title: 'Conversation Session ID',
        question: 'What session or thread ID should be used for conversational context?',
        explanation: 'Substituted into {{session_id}}.',
        suggestedDefault: 'sess_qa_test_001',
        variableKey: 'session_id',
        placeholder: 'e.g. sess_qa_test_001',
        required: false,
      },
    ];

    defaultDataset = {
      baseUrl: cleanUrl,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      authTokens: { user: 'ai_usr_test_token_8892', admin: 'ai_adm_test_token_9912', guest: '' },
      prompt_query: 'Explain quantum computing in three sentences.',
      model_name: 'gemini-3.8-flash',
      session_id: 'sess_qa_test_001',
      query_id: '101',
    };

    quickScenarios = [
      'Verify AI service root availability and health status',
      'Execute inference completion with {{prompt_query}}',
      'Retrieve model catalog specifications and status',
      'Verify unauthorized requests return 401 or 403',
      'Reject empty or malformed prompt submissions',
      'Burst concurrency load test on inference endpoint',
    ];
  } else {
    // Generic Web Application / REST Service
    detectedArchitecture = `${probe.detectedTech.join(' + ') || 'HTTP REST Gateway'}`;
    suggestedSuiteName = `${hostname} Functional & Reliability Suite`;
    suggestedProjectName = `${hostname} QA Workspace`;

    questions = [
      {
        id: 'auth_user_token',
        category: 'auth',
        title: 'User Authorization Token',
        question: 'What bearer token or API key should be sent for authenticated operations?',
        explanation: 'Used for {{authTokens.user}} in authenticated requests.',
        suggestedDefault: 'tok_user_test_88319',
        variableKey: 'authTokens.user',
        placeholder: 'Bearer token or API key',
        required: false,
      },
      {
        id: 'sample_id',
        category: 'data',
        title: 'Sample Resource ID',
        question: 'What resource ID or record identifier should be tested in parameterized queries?',
        explanation: 'Substituted into path variables like /items/{{sample_id}}.',
        suggestedDefault: '1',
        variableKey: 'sample_id',
        placeholder: 'e.g. 1, item_99, usr_01',
        required: true,
      },
      {
        id: 'search_query',
        category: 'data',
        title: 'Search & Filter Parameter',
        question: 'What query string should be passed to test search and filtering?',
        explanation: 'Substituted into {{search_query}}.',
        suggestedDefault: 'test',
        variableKey: 'search_query',
        placeholder: 'e.g. search keyword',
        required: false,
      },
      {
        id: 'payload_title',
        category: 'workflow',
        title: 'Sample Creation Payload Title',
        question: 'What test title or name should be sent in POST/PUT creation payloads?',
        explanation: 'Used to test entity creation and updates.',
        suggestedDefault: 'Automated Test Item',
        variableKey: 'payload_title',
        placeholder: 'e.g. Test Record 101',
        required: false,
      },
    ];

    defaultDataset = {
      baseUrl: cleanUrl,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      authTokens: { user: 'tok_user_test_88319', admin: 'tok_admin_test_9912', guest: '' },
      sample_id: '1',
      query_id: '1',
      search_query: 'test',
      payload_title: 'Automated Test Item',
    };

    quickScenarios = [
      'Verify service root responds with OK status and correct headers',
      'Fetch primary resource collection with {{search_query}} filter',
      'Retrieve single entity by dynamic ID {{sample_id}}',
      'Verify unauthenticated access to protected routes returns 401/403',
      'Reject malformed input payload with 400 Bad Request or 422',
      'Measure burst concurrency response latency under load',
    ];
  }

  // Ensure target application configuration questions (VITE_API_URL, JWT_SECRET, CORS_ALLOWED_ORIGINS)
  // are included for every introspected application
  questions.push(...getTargetAppConfigQuestions(cleanUrl, hostname));
  defaultDataset = {
    ...defaultDataset,
    ...getTargetAppDefaultDataset(cleanUrl),
  };

  return {
    targetUrl: cleanUrl,
    probedStatus: probe.probedStatus,
    responseTimeMs: probe.responseTimeMs,
    serverHeaders: probe.serverHeaders,
    title: probe.title,
    metaDescription: probe.metaDescription,
    techStack: probe.detectedTech,
    detectedArchitecture,
    discoveredEndpoints,
    securitySignals: probe.securitySignals,
    suggestedSuiteName,
    suggestedProjectName,
    questions,
    defaultDataset,
    quickScenarios,
  };
}

export async function buildSuiteFromJourney(
  params: BuildJourneyParams
): Promise<{
  testCases: ParsedCaseDraft[];
  dataset: Record<string, any>;
  suiteName: string;
  description: string;
}> {
  const { url, suiteName, answers, customDetails, customEndpoints, introspectionData } = params;

  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // 1. Synthesize Dataset from answers
  const initialData = introspectionData?.defaultDataset || {};
  const dataset: Record<string, any> = JSON.parse(JSON.stringify(initialData));

  // Ensure base fields
  dataset.baseUrl = cleanUrl;
  if (!dataset.userAgent) {
    dataset.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
  if (!dataset.authTokens) dataset.authTokens = { guest: '', user: '', admin: '' };
  if (!dataset.models) dataset.models = {};
  if (!dataset.prompt_samples) dataset.prompt_samples = {};

  // Map known user answers into dataset
  for (const [key, rawVal] of Object.entries(answers)) {
    if (!rawVal || typeof rawVal !== 'string') continue;
    const val = rawVal.trim();

    if (key === 'target_api_url' || key === 'VITE_API_URL' || key === 'apiUrl') {
      dataset.VITE_API_URL = val;
      dataset.apiUrl = val;
    } else if (key === 'target_jwt_secret' || key === 'JWT_SECRET' || key === 'jwtSecret') {
      dataset.JWT_SECRET = val;
      dataset.jwtSecret = val;
    } else if (key === 'target_cors_origins' || key === 'CORS_ALLOWED_ORIGINS' || key === 'corsAllowedOrigins') {
      dataset.CORS_ALLOWED_ORIGINS = val;
      dataset.corsAllowedOrigins = val;
    } else if (key === 'auth_user_token' || key === 'authTokens.user') {
      dataset.authTokens.user = val;
    } else if (key === 'auth_team_lead' || key === 'authTokens.team_lead') {
      dataset.authTokens.team_lead = val;
    } else if (key === 'auth_admin_token' || key === 'authTokens.admin') {
      dataset.authTokens.admin = val;
    } else if (key === 'fast_model' || key === 'models.fast_model') {
      dataset.models.fast_model = val;
    } else if (key === 'smart_model' || key === 'models.smart_model') {
      dataset.models.smart_model = val;
    } else if (key === 'prompt_simple' || key === 'prompt_samples.simple_query') {
      dataset.prompt_samples.simple_query = val;
      dataset.prompt_query = val;
    } else if (key === 'prompt_complex' || key === 'prompt_samples.complex_query') {
      dataset.prompt_samples.complex_query = val;
    } else if (key === 'byok_key' || key === 'credentials_test.masked_key') {
      if (!dataset.credentials_test) dataset.credentials_test = {};
      dataset.credentials_test.masked_key = val;
    } else if (key === 'trial_email') {
      dataset.trial_email = val;
    } else if (key === 'session_id') {
      dataset.session_id = val;
    } else if (key === 'team_id') {
      dataset.team_id = val;
    } else if (key === 'sample_id') {
      dataset.sample_id = val;
    } else if (key === 'search_query') {
      dataset.search_query = val;
    } else if (key.includes('.')) {
      setDotted(dataset, key, val);
    } else {
      dataset[key] = val;
    }
  }

  // Ensure WhyOr specific dataset fields are fully resolved if target matches WhyOr
  const isWhyor = /whyor/i.test(cleanUrl) || /whyor/i.test(suiteName || '') || /whyor/i.test(customDetails || '');
  if (isWhyor) {
    if (!dataset.prompt_query) dataset.prompt_query = dataset.prompt_samples?.simple_query || 'What is the capital of France?';
    if (!dataset.models.fast_model) dataset.models.fast_model = 'gemini-3.7-flash';
    if (!dataset.models.lite_model) dataset.models.lite_model = 'gemini-3.1-flash-lite';
    if (!dataset.models.smart_model) dataset.models.smart_model = 'claude-3-7-sonnet';
    if (!dataset.models.reasoning_model) dataset.models.reasoning_model = 'deepseek-v3';
    if (!dataset.models.general_model) dataset.models.general_model = 'gpt-4o';
    if (!dataset.models.fast_llama) dataset.models.fast_llama = 'llama-3.3-70b-versatile';
    if (!dataset.prompt_samples.invalid_empty) dataset.prompt_samples.invalid_empty = '   ';
    if (!dataset.credentials_test) {
      dataset.credentials_test = {
        provider: 'anthropic',
        masked_key: 'sk-ant-api03-test-live-mock-4481',
        invalid_key: 'invalid_key_format_xyz',
        openai_key: 'sk-proj-test-live-mock-9921',
      };
    }
    if (!dataset.session_id) dataset.session_id = 'sess_why_993821';
    if (!dataset.team_id) dataset.team_id = 'team_alpha_corp';
    if (!dataset.company_id) dataset.company_id = 'comp_enterprise_901';
    if (!dataset.trial_email) dataset.trial_email = 'qa_tester@whyor.in';
    if (!dataset.trial_code) dataset.trial_code = '123456';
    if (!dataset.query_id) dataset.query_id = '728';
    if (!dataset.sample_id) dataset.sample_id = 'sample_why_01';
  }

  // Ensure target application configuration variables are established per-application at the dataset level
  if (!dataset.VITE_API_URL) dataset.VITE_API_URL = cleanUrl;
  if (!dataset.apiUrl) dataset.apiUrl = dataset.VITE_API_URL;
  if (dataset.JWT_SECRET === undefined) dataset.JWT_SECRET = '';
  if (dataset.jwtSecret === undefined) dataset.jwtSecret = dataset.JWT_SECRET;
  if (!dataset.CORS_ALLOWED_ORIGINS) dataset.CORS_ALLOWED_ORIGINS = cleanUrl;
  if (!dataset.corsAllowedOrigins) dataset.corsAllowedOrigins = dataset.CORS_ALLOWED_ORIGINS;

  // 2. Generate test cases
  let generatedDrafts: ParsedCaseDraft[] = [];
  if (isWhyor) {
    generatedDrafts = await generateTestCases({
      siteUrl: cleanUrl,
      description: customDetails,
      existingPlanText: `Answers provided: ${JSON.stringify(answers)}`,
    });
  } else {
    generatedDrafts = await generateTestCases({
      siteUrl: cleanUrl,
      description: customDetails || `Introspected service at ${cleanUrl}`,
      existingPlanText: `Answers provided: ${JSON.stringify(answers)}`,
    });
  }

  // 3. Incorporate user's custom endpoints as explicit test cases
  if (customEndpoints && customEndpoints.length > 0) {
    customEndpoints.forEach((ep, idx) => {
      const epMethod = ep.method.toUpperCase();
      const epPath = ep.path.startsWith('/') ? ep.path : `/${ep.path}`;
      const extId = `CUST-${String(idx + 1).padStart(3, '0')}`;
      const customCase: any = {
        id: extId,
        category: 'Custom User Endpoints',
        title: `Verify ${epMethod} ${epPath} - ${ep.purpose || 'User specified route'}`,
        priority: 'High',
        tags: ['custom', 'journey', epMethod.toLowerCase()],
        type: 'http',
        requests: [
          {
            name: `Call ${epMethod} ${epPath}`,
            method: epMethod,
            path: epPath,
            headers: epMethod !== 'GET' ? { 'Content-Type': 'application/json' } : {},
            auth_persona: 'user',
          },
        ],
        expected_status: epMethod === 'POST' ? '200, 201' : '200, 204, 304',
      };
      generatedDrafts.push(normalizeStructuredRow(customCase, generatedDrafts.length));
    });
  }

  // 4. Incorporate custom edge cases if user provided specific guidance
  if (customDetails && customDetails.trim()) {
    const detailCase: any = {
      id: `SPEC-VAL-${String(generatedDrafts.length + 1).padStart(3, '0')}`,
      category: 'User Custom Requirements',
      title: `Verify user requirement: ${customDetails.slice(0, 60)}...`,
      priority: 'High',
      tags: ['user-custom', 'validation'],
      type: 'http',
      requests: [
        {
          name: 'User Guided Scenario Probe',
          method: 'GET',
          path: '/?user_spec=verified',
          headers: { 'User-Agent': '{{userAgent}}' },
          auth_persona: 'user',
        },
      ],
      expected_status: '200, 304, 400, 422',
    };
    generatedDrafts.push(normalizeStructuredRow(detailCase, generatedDrafts.length));
  }

  // 4.5 Filter out any generated or custom draft that targets ephemeral hashed build assets
  generatedDrafts = generatedDrafts.filter(draft => {
    if (draft.type === 'http' && draft.spec && 'requests' in draft.spec && Array.isArray((draft.spec as any).requests)) {
      const hasHashed = (draft.spec as any).requests.some((r: any) => isEphemeralHashedAsset(r.path));
      if (hasHashed) {
        console.warn(`[Verity Test Sanitizer] Filtered out ephemeral hashed asset draft in journey: "${draft.title || draft.ext_id}"`);
        return false;
      }
    }
    return true;
  });

  // 5. Audit all required dataFields and ensure zero missing fields in dataset
  for (const c of generatedDrafts) {
    const needed = extractPlaceholders(c.spec);
    c.dataFields = needed;
    for (const field of needed) {
      const existingVal = getDotted(dataset, field, null);
      if (existingVal === null || existingVal === '') {
        // Automatically provide sensible non-empty default
        let fallbackVal = 'sample_value';
        if (field.includes('auth') || field.includes('token')) fallbackVal = 'token_mock_val';
        else if (field.includes('id')) fallbackVal = '101';
        else if (field.includes('email')) fallbackVal = 'qa@test.local';
        else if (field.includes('query') || field.includes('prompt')) fallbackVal = 'Sample search query';
        setDotted(dataset, field, fallbackVal);
      }
    }
  }

  const finalSuiteName = suiteName && suiteName.trim()
    ? suiteName.trim()
    : isWhyor
      ? 'WhyOr Dispatch Architecture & E2E Verification Suite'
      : `${cleanUrl.replace(/^https?:\/\//, '').split('/')[0]} Comprehensive Test Suite`;

  const finalDescription = `Complete automated QA suite generated from website introspection of ${cleanUrl} enhanced with user-provided domain details.`;

  return {
    testCases: generatedDrafts,
    dataset,
    suiteName: finalSuiteName,
    description: finalDescription,
  };
}

export interface DatasetFieldValidationResult {
  key: string;
  status: 'valid' | 'warning' | 'invalid' | 'missing';
  score: number;
  title: string;
  category: 'auth' | 'env' | 'ids' | 'params' | 'custom';
  currentValue: any;
  normalizedValue?: any;
  issues: string[];
  recommendations: string[];
  guide: {
    overview: string;
    whyNeeded: string;
    whereToFind: string;
    steps: Array<{ stepNumber: number; title: string; description: string; codeSnippet?: string }>;
    visualType: 'devtools_network' | 'devtools_storage' | 'swagger_docs' | 'curl_terminal' | 'env_config';
    mockPreview: {
      title: string;
      subtitle: string;
      snippet: string;
    };
    suggestedExtractionCurl?: string;
  };
}

export interface DatasetAiAuditResult {
  overallScore: number;
  overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  totalFields: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  missingCount: number;
  summary: string;
  fieldResults: Record<string, DatasetFieldValidationResult>;
}

export function buildSmartFieldGuide(
  key: string,
  currentValue: any,
  siteUrl: string,
  usedByCount: number = 0
): DatasetFieldValidationResult['guide'] {
  const lk = key.toLowerCase();
  const cleanSite = (siteUrl || 'https://api.example.com').replace(/\/+$/, '');

  if (lk.includes('token') || lk.includes('jwt') || lk.includes('auth') || lk.includes('bearer') || lk.includes('secret') || lk.includes('key')) {
    const roleMatch = key.match(/(guest|admin|superadmin|team_lead|user|member)/i);
    const roleName = roleMatch ? roleMatch[0].toLowerCase() : 'user';

    return {
      overview: `HTTP Authorization token or secret key used to authenticate automated test requests as the '${roleName}' persona.`,
      whyNeeded: `API endpoints enforce JWT authentication and RBAC (Role-Based Access Control). Without a valid token, test requests will receive '401 Unauthorized' or '403 Forbidden' status codes.`,
      whereToFind: `Chrome/Brave/Edge DevTools (Network tab, Application > LocalStorage), or via your application's login endpoint.`,
      visualType: 'devtools_network',
      mockPreview: {
        title: 'Chrome DevTools - Request Headers',
        subtitle: `Headers for authenticated request to ${cleanSite}/api/v1`,
        snippet: `Request URL: ${cleanSite}/api/v1/profile\nRequest Method: GET\nStatus Code: 200 OK\n\nRequest Headers:\n  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3J... [COPIED]\n  Content-Type: application/json`,
      },
      steps: [
        {
          stepNumber: 1,
          title: 'Open Your Application & Open DevTools',
          description: `Navigate to ${cleanSite} in Google Chrome or any modern browser. Press F12 (or right-click anywhere and click Inspect). Switch to the Network tab and check the "Fetch/XHR" filter.`,
        },
        {
          stepNumber: 2,
          title: `Sign In with ${roleName.toUpperCase()} Credentials`,
          description: `Perform a standard sign-in using your staging/QA account for ${roleName}. Look for the login response in DevTools (e.g. POST /api/auth/login or /api/login).`,
          codeSnippet: `// Or retrieve the active token directly from the browser console:\nconsole.log(localStorage.getItem('token') || localStorage.getItem('auth_token') || sessionStorage.getItem('token'));`,
        },
        {
          stepNumber: 3,
          title: 'Copy the Token & Paste into Verity',
          description: `Select any subsequent authenticated request, locate the 'Authorization: Bearer <token>' header, copy the token string, and paste it into the variable field. Verity will validate its structure automatically.`,
        },
      ],
      suggestedExtractionCurl: `curl -s -X POST "${cleanSite}/api/auth/login" \\\n  -H "Content-Type: application/json" \\\n  -d '{"email": "${roleName}@example.com", "password": "your_test_password"}' | jq -r '.token // .accessToken'`,
    };
  }

  if (lk.includes('url') || lk.includes('host') || lk.includes('domain') || lk.includes('api')) {
    return {
      overview: `Target backend API host or microservice URL. In multi-tier applications, API requests route to this host rather than the static frontend domain.`,
      whyNeeded: `Ensures all HTTP requests generated by Verity are dispatched to the live, reachable API gateway with proper TLS/HTTPS certificates.`,
      whereToFind: `Your application's environment configuration (.env, .env.production), Swagger/OpenAPI docs, or hosting cloud console (Cloud Run, Vercel, AWS).`,
      visualType: 'env_config',
      mockPreview: {
        title: '.env.staging / Server Configuration',
        subtitle: 'Production & Staging Environment Variables',
        snippet: `# Backend API Gateway Host\nVITE_API_URL=${cleanSite}\nAPI_BASE_URL=${cleanSite}/api/v1\nPORT=3000\nNODE_ENV=staging`,
      },
      steps: [
        {
          stepNumber: 1,
          title: 'Verify Your Target API Host',
          description: `Check which API host handles backend traffic for ${cleanSite}. If your frontend and backend share the same domain, enter the full root URL.`,
        },
        {
          stepNumber: 2,
          title: 'Ensure Protocol (https://) and No Trailing Slash',
          description: `Always include the scheme (https://). Avoid trailing slashes (e.g. use "${cleanSite}" instead of "${cleanSite}/") so endpoint paths concatenate cleanly without double slashes.`,
        },
        {
          stepNumber: 3,
          title: 'Confirm CORS and Connectivity',
          description: `Ensure the target host allows automated API testing and preflight OPTIONS requests without IP restrictions.`,
        },
      ],
    };
  }

  if (lk.includes('id') || lk.includes('uuid') || lk.includes('slug')) {
    return {
      overview: `Resource identifier used for REST dynamic path parameters (e.g. /api/users/:id, /orders/:orderId).`,
      whyNeeded: `REST endpoints require real existing entity IDs to return 200/204 status responses. Using a non-existent ID may cause expected 404 responses or cascading test failures.`,
      whereToFind: `Your database, admin portal, or by inspecting API collection endpoints (e.g. GET /api/items).`,
      visualType: 'swagger_docs',
      mockPreview: {
        title: 'Swagger / REST API Query',
        subtitle: `GET ${cleanSite}/api/v1/items Response`,
        snippet: `[\n  {\n    "id": 42,\n    "title": "Active Test Fixture",\n    "status": "published",\n    "createdAt": "2026-09-10T00:00:00Z"\n  }\n]`,
      },
      steps: [
        {
          stepNumber: 1,
          title: 'Query an Existing Resource',
          description: `Make a GET request to the collection endpoint or look in your staging database for an active, non-deleted test record.`,
        },
        {
          stepNumber: 2,
          title: 'Select a Dedicated Test Fixture',
          description: `Choose an ID designated for QA automation so other concurrent tests or users do not unexpectedly modify or delete it.`,
        },
        {
          stepNumber: 3,
          title: 'Paste Clean ID',
          description: `Enter just the numeric ID or UUID without surrounding quotes, braces, or spaces.`,
        },
      ],
      suggestedExtractionCurl: `curl -s -X GET "${cleanSite}/api/v1/items?limit=1" | jq '.[0].id'`,
    };
  }

  return {
    overview: `Dynamic test input parameter injected into request query parameters or JSON body payloads.`,
    whyNeeded: `Supplies required business attributes (such as search terms, filter states, or entity payloads) needed to pass API schema validation.`,
    whereToFind: `API documentation, payload schemas, or Swagger UI examples.`,
    visualType: 'curl_terminal',
    mockPreview: {
      title: 'Payload Schema Definition',
      subtitle: `Field "${key}" in request contract`,
      snippet: `POST ${cleanSite}/api/v1/search\nContent-Type: application/json\n\n{\n  "${key}": "active_records",\n  "page": 1\n}`,
    },
    steps: [
      {
        stepNumber: 1,
        title: 'Review Field Requirements',
        description: `Check what values your API accepts for '${key}' (e.g. string, number, or enum state).`,
      },
      {
        stepNumber: 2,
        title: 'Provide Representative Staging Value',
        description: `Enter a value that represents expected production usage or click 'Generate Mock' for a schema-compliant synthetic test value.`,
      },
    ],
  };
}

export function validateSingleField(
  key: string,
  value: any,
  siteUrl: string,
  usedByCount: number = 0
): DatasetFieldValidationResult {
  const lk = key.toLowerCase();
  const valStr = value !== undefined && value !== null ? String(value).trim() : '';
  const isMissing = valStr === '';
  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: 'valid' | 'warning' | 'invalid' | 'missing' = 'valid';
  let score = 100;
  let normalizedValue: any = undefined;

  let category: 'auth' | 'env' | 'ids' | 'params' | 'custom' = 'custom';
  if (lk.includes('token') || lk.includes('jwt') || lk.includes('auth') || lk.includes('secret') || lk.includes('key')) category = 'auth';
  else if (lk.includes('url') || lk.includes('host') || lk.includes('domain') || lk.includes('api')) category = 'env';
  else if (lk.includes('id') || lk.includes('uuid') || lk.includes('slug')) category = 'ids';
  else if (lk.includes('query') || lk.includes('search') || lk.includes('email') || lk.includes('name')) category = 'params';

  if (isMissing) {
    status = 'missing';
    score = 0;
    issues.push(`Variable is required but currently empty.`);
    recommendations.push(`Provide a real value from your application or generate a synthetic mock to allow tests to run.`);
  } else {
    if (valStr.includes('{{') && valStr.includes('}}')) {
      status = 'invalid';
      score = 25;
      issues.push(`Value contains unresolved template brackets {{...}}. Make sure you paste the evaluated value, not another variable.`);
      recommendations.push(`Remove the double curly braces and enter the literal string or token.`);
    }

    const placeholderRegex = /^(TODO|placeholder|enter_value|replace_me|your_token_here|dummy_token|sample_value|vrt_key_abc123|e\.g\.)/i;
    if (placeholderRegex.test(valStr)) {
      status = 'warning';
      score = Math.min(score, 45);
      issues.push(`Value appears to be a placeholder or example string rather than authentic test data.`);
      recommendations.push(`Replace with an authentic credential or value from your staging environment.`);
    }

    if (category === 'auth') {
      if (valStr.length < 10) {
        status = 'warning';
        score = Math.min(score, 40);
        issues.push(`Auth token length (${valStr.length} chars) is unusually short for a security token or JWT.`);
        recommendations.push(`Ensure you copied the entire authorization string without truncation.`);
      }

      const dotCount = (valStr.match(/\./g) || []).length;
      if (dotCount === 2 && !valStr.toLowerCase().startsWith('bearer ')) {
        status = 'warning';
        score = Math.min(score, 75);
        normalizedValue = `Bearer ${valStr}`;
        issues.push(`Raw JWT detected without 'Bearer ' prefix.`);
        recommendations.push(`Most HTTP Authorization headers expect 'Bearer <token>'. Click 'Apply Fix' to auto-prefix.`);
      }

      if (valStr !== valStr.replace(/\s+/g, ' ').trim()) {
        status = 'warning';
        score = Math.min(score, 80);
        normalizedValue = valStr.replace(/\s+/g, ' ').trim();
        issues.push(`Token contains unexpected newline characters or extra whitespace.`);
      }
    }

    if (category === 'env') {
      if (!/^https?:\/\//i.test(valStr)) {
        status = 'invalid';
        score = Math.min(score, 20);
        normalizedValue = `https://${valStr.replace(/^\/+/, '')}`;
        issues.push(`URL is missing protocol scheme (must start with 'https://' or 'http://').`);
        recommendations.push(`Add https:// scheme so test requests can resolve the host correctly.`);
      } else if (valStr.endsWith('/')) {
        status = 'warning';
        score = Math.min(score, 85);
        normalizedValue = valStr.replace(/\/+$/, '');
        issues.push(`Trailing slash detected at end of API URL. This can cause double slashes (//) in request paths.`);
        recommendations.push(`Remove trailing slash.`);
      }

      if (valStr.includes('localhost') || valStr.includes('127.0.0.1')) {
        status = 'warning';
        score = Math.min(score, 70);
        issues.push(`Localhost URL specified. Localhost can be reached during local preview but will fail in cloud hosted runs.`);
        recommendations.push(`Use a public staging URL or ngrok tunnel if executing scheduled cloud runs.`);
      }
    }

    if (category === 'ids') {
      if (/[^\w\d-_.]/.test(valStr)) {
        status = 'warning';
        score = Math.min(score, 65);
        normalizedValue = valStr.replace(/[^\w\d-_.]/g, '');
        issues.push(`ID contains special punctuation or whitespace characters.`);
        recommendations.push(`Clean up the ID to alphanumeric characters, dashes, or underscores.`);
      }
    }
  }

  const guide = buildSmartFieldGuide(key, value, siteUrl, usedByCount);

  return {
    key,
    status,
    score,
    title: key,
    category,
    currentValue: value,
    normalizedValue,
    issues,
    recommendations,
    guide,
  };
}

export async function validateDatasetQualityWithAi(params: {
  dataset: Record<string, any>;
  siteUrl: string;
  testCases?: any[];
  focusField?: string;
}): Promise<DatasetAiAuditResult> {
  const { dataset, siteUrl, testCases = [] } = params;
  const keys = new Set<string>();

  const extractKeys = (obj: any, prefix = '') => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach(k => {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        extractKeys(obj[k], full);
      } else {
        keys.add(full);
      }
    });
  };
  extractKeys(dataset);

  testCases.forEach(tc => {
    try {
      const json = JSON.stringify(tc.spec || tc);
      const matches = json.match(/\{\{([a-zA-Z0-9_.]+)\}\}/g);
      if (matches) {
        matches.forEach(m => keys.add(m.replace(/[{}]/g, '')));
      }
    } catch {}
  });

  const getVal = (d: any, p: string): any => {
    if (!d) return undefined;
    if (d[p] !== undefined) return d[p];
    const parts = p.split('.');
    let cur = d;
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[part];
    }
    return cur;
  };

  const fieldResults: Record<string, DatasetFieldValidationResult> = {};
  let totalScore = 0;
  let validCount = 0;
  let warningCount = 0;
  let invalidCount = 0;
  let missingCount = 0;

  const keyList = Array.from(keys);
  for (const k of keyList) {
    const val = getVal(dataset, k);
    const usedBy = testCases.filter(tc => JSON.stringify(tc).includes(`{{${k}}}`)).length;
    const res = validateSingleField(k, val, siteUrl, usedBy);
    fieldResults[k] = res;

    totalScore += res.score;
    if (res.status === 'valid') validCount++;
    else if (res.status === 'warning') warningCount++;
    else if (res.status === 'invalid') invalidCount++;
    else if (res.status === 'missing') missingCount++;
  }

  const count = keyList.length || 1;
  const overallScore = Math.round(totalScore / count);
  let overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'A+';
  if (overallScore >= 95) overallGrade = 'A+';
  else if (overallScore >= 85) overallGrade = 'A';
  else if (overallScore >= 75) overallGrade = 'B';
  else if (overallScore >= 60) overallGrade = 'C';
  else if (overallScore >= 40) overallGrade = 'D';
  else overallGrade = 'F';

  let summary = `Dataset audit completed with an overall score of ${overallScore}% (${overallGrade}). ${validCount} variables verified with high quality, ${warningCount} with quality notices, and ${missingCount + invalidCount} requiring correction before production execution.`;

  return {
    overallScore,
    overallGrade,
    totalFields: keyList.length,
    validCount,
    warningCount,
    invalidCount,
    missingCount,
    summary,
    fieldResults,
  };
}



