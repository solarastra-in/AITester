import { GoogleGenAI } from '@google/genai';
import { ParsedCaseDraft, normalizeStructuredRow } from './specParser.js';

interface GenerateOptions {
  provider?: 'gemini' | 'openai' | 'anthropic';
  apiKey?: string;
  model?: string;
  siteUrl: string;
  description?: string;
  existingPlanText?: string;
}

let geminiClient: GoogleGenAI | null = null;

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

Ensure you use double curly braces {{placeholder_name}} for dynamic data, auth tokens, test IDs, or secret keys so Verity's Interactive Dataset Engine can automatically prompt the user for dataset values.`;

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

Do NOT wrap in markdown backticks.`;

export async function analyzeTargetUrl(url: string, userHint?: string): Promise<UrlAnalysisResult> {
  const cleanUrl = url.trim();

  // Try using Gemini AI first
  try {
    const ai = getGeminiClient();
    const prompt = `Target URL to analyze: ${cleanUrl}
${userHint ? `User Focus / Requirements / Hint: ${userHint}` : 'User Focus: Formulate a complete end-to-end automated test suite covering smoke, regression, security, and edge cases.'}

Analyze the domain and path structure. Recommend appropriate test case descriptions, focus areas, dynamic dataset variables (e.g., authTokens, sample_id, search_query), endpoints, and scenario titles.`;

    const candidateModels = ['gemini-3.6-flash', 'gemini-3.8-flash'];
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
        if (e?.status === 404 || e?.message?.includes('not found') || e?.message?.includes('404') || e?.message?.includes('is no longer available')) {
          continue;
        }
        throw e;
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
        return {
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
      }
    }
  } catch (err: any) {
    console.warn('Gemini URL analysis fallback triggered:', err.message);
  }

  // Smart Heuristic Fallback based on URL pattern matching
  let hostname = cleanUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Target Site';
  let path = cleanUrl.replace(/^https?:\/\/[^/]+/, '') || '/';
  if (!path.startsWith('/')) path = '/' + path;

  const isAuth = /auth|login|oauth|token|jwt|session/i.test(cleanUrl) || /auth|login/i.test(userHint || '');
  const isStore = /store|shop|cart|checkout|order|product|item|petstore/i.test(cleanUrl) || /shop|order/i.test(userHint || '');
  const isGithub = /github/i.test(cleanUrl);
  const isReqRes = /reqres/i.test(cleanUrl);
  const isGraphQL = /graphql/i.test(cleanUrl) || /graphql/i.test(path);

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

  const prompt = `Target Site URL: ${siteUrl}
Description / Goal: ${description || 'Generate a comprehensive functional smoke, regression, and security test suite'}
${existingPlanText ? `Existing QA Doc / Swagger notes:\n${existingPlanText}` : ''}

Generate 6 to 10 realistic, high-value functional test cases with explicit endpoints, dynamic dataset placeholders (e.g. {{authTokens.user}}, {{sample_id}}, {{search_query}}), and expected status/body assertions.`;

  try {
    const ai = getGeminiClient();
    const candidateModels = options.model ? [options.model] : ['gemini-3.6-flash', 'gemini-3.8-flash'];
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
        if (e?.status === 404 || e?.message?.includes('not found') || e?.message?.includes('404') || e?.message?.includes('is no longer available')) {
          continue;
        }
        throw e;
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    let text = response.text || '';
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error('AI did not return a JSON array of test cases.');
    }

    return parsed.map(normalizeStructuredRow);
  } catch (err: any) {
    console.error('Gemini test generation failed, falling back to smart heuristic generator:', err.message);

    // Fallback heuristic generator so user is never blocked even if API key is in setup
    const domain = siteUrl.replace(/^https?:\/\//, '').split('/')[0];
    const fallbackCases = [
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
            headers: { 'Accept': 'application/json, text/html' },
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
        expected_status: '200, 404',
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
        expected_status: '401, 403, 404',
      },
      {
        id: 'LOAD-004',
        category: 'Performance & Concurrency',
        title: 'Concurrent burst load test on search endpoint',
        priority: 'Medium',
        tags: ['load', 'concurrency'],
        type: 'load',
        request: {
          name: 'Search Load Probe',
          method: 'GET',
          path: '/api/search?q={{search_term}}',
        },
        total_requests: 12,
        concurrency: 4,
        max_p95_ms: 2500,
      },
    ];

    return fallbackCases.map(normalizeStructuredRow);
  }
}
