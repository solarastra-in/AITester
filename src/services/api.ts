import {
  User,
  Organization,
  Project,
  TestCase,
  TestRun,
  PricingTier,
  CreditLedgerEntry,
  SystemAuditLog,
  Team,
  IntrospectedWebsiteData,
  BuildJourneyResult,
  AnalyticsDashboardData,
  OrgSecurityConfig,
  OrgApiKey,
  KeyRotationHistory,
  TestSchedule,
  Suite,
} from '../types';
import { notifyApiError, notify, openEngineSettings } from './notifications';

const TOKEN_KEY = 'verity_auth_token';

let currentApiUser: User | null = null;

export function setCurrentUser(user: User | null) {
  currentApiUser = user;
}

export function getCurrentUser(): User | null {
  return currentApiUser;
}

export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearStoredToken() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
  currentApiUser = null;
}

/**
 * Security middleware layer on the API service to check currentUser permissions
 * before returning any test case data.
 * Throws a 403 Forbidden error if the user is not authorized or not logged in.
 */
export function checkTestCaseSecurity(
  projectId: string,
  user?: User | null
): void {
  const activeUser = user !== undefined ? user : currentApiUser;
  const token = getStoredToken();

  // If user is not logged in / no token provided -> 403 Forbidden
  if (!token && !activeUser) {
    const err: any = new Error('Forbidden: User is not authorized or logged in to access test cases.');
    err.status = 403;
    err.statusCode = 403;
    throw err;
  }

  // If user is provided, check role / org permissions
  if (activeUser) {
    if (activeUser.role === 'platform_admin') {
      return;
    }
    if ((projectId.startsWith('proj_org_') || projectId.startsWith('org_')) && (activeUser.role === 'standalone' || !activeUser.orgId)) {
      const err: any = new Error('Forbidden: You do not have permission to view test cases for this project.');
      err.status = 403;
      err.statusCode = 403;
      throw err;
    }
  }
}

// ============================================================================
// Dynamic Application-Level API Base URL Management
// Allows customers and deployments to configure target backend endpoints
// at runtime dynamically, rather than relying on build-time environment variables.
// ============================================================================

export const DEFAULT_CLOUD_RUN_ENGINE_URL = 'https://ais-dev-zxirjfnjh6bl2ylg7svoja-4552824319.us-west2.run.app';
export const API_URL_STORAGE_KEY = 'verity_api_engine_url';
export const API_URL_CHANGE_EVENT = 'verity_api_url_changed';

// In-memory runtime override (highest priority for programmatic application configuration)
let inMemoryApiUrl: string | null = null;
const urlChangeListeners = new Set<(newUrl: string) => void>();

export interface SetApiUrlOptions {
  /** If true (default in browser), saves to localStorage so it survives page reloads. */
  persist?: boolean;
  /** If true (default), dispatches change events to notify UI components. */
  notify?: boolean;
}

/**
 * Resolves the active API base URL dynamically in order of precedence:
 * 1. In-memory override set via `setApiBaseUrl(url)` / `api.setApiUrl(url)`
 * 2. URL search params (`?apiUrl=...` or `?api_url=...` or `?backend=...`)
 * 3. Browser localStorage persistence (`verity_api_engine_url` / `verity_api_url`)
 * 4. Runtime window global injected into index.html (`window.__VERITY_API_URL__` or `window.VERITY_API_URL`)
 * 5. Domain-level smart fallback (e.g. whyor.in / vercel.app uses Cloud Run engine)
 * 6. Build-time Vite env variable fallback (`import.meta.env.VITE_API_URL`)
 * 7. Empty string (relative same-origin `/api/*`)
 */
export function getApiBaseUrl(): string {
  // 1. Programmatic in-memory override
  if (inMemoryApiUrl !== null) {
    return inMemoryApiUrl.trim().replace(/\/$/, '');
  }

  // 2. URL search params (convenient for ad-hoc QA, staging links, or customer support sessions)
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryUrl = searchParams.get('apiUrl') || searchParams.get('api_url') || searchParams.get('backend');
      if (queryUrl && queryUrl.trim()) {
        return queryUrl.trim().replace(/\/$/, '');
      }
    } catch {
      // ignore URL parsing errors in sandboxed environments
    }
  }

  // 3. User / Customer local browser storage override
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem(API_URL_STORAGE_KEY) || localStorage.getItem('verity_api_url');
      if (saved !== null && saved.trim()) {
        return saved.trim().replace(/\/$/, '');
      }
    } catch {
      // ignore storage access errors
    }
  }

  // 4. Runtime window global configuration (e.g. Docker container / k8s injected scripts)
  if (typeof window !== 'undefined') {
    const win = window as any;
    const runtimeInjected = win.__VERITY_API_URL__ || win.VERITY_API_URL || win.__API_URL__ || win.API_URL;
    if (runtimeInjected && typeof runtimeInjected === 'string' && runtimeInjected.trim()) {
      return runtimeInjected.trim().replace(/\/$/, '');
    }
  }

  // 5. Intelligent deployment domain routing (e.g. static hosting on Vercel or whyor.in)
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host.includes('whyor.in') || host.includes('vercel.app') || host.includes('pages.dev')) {
      return DEFAULT_CLOUD_RUN_ENGINE_URL;
    }
  }

  // 6. Build-time environment variable fallback
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  if (metaEnv && metaEnv.VITE_API_URL && metaEnv.VITE_API_URL.trim()) {
    return (metaEnv.VITE_API_URL as string).trim().replace(/\/$/, '');
  }

  // 7. Same-origin relative fallback
  return '';
}

export const getApiUrl = getApiBaseUrl;

/**
 * Sets the API base URL dynamically at the application level.
 * @param url The new API base URL (e.g., "https://my-backend.corp.com", "http://localhost:3000", or "" for same-origin).
 *            Pass `null` to clear the in-memory override and revert to storage/defaults.
 * @param options Persistence and event notification settings.
 */
export function setApiBaseUrl(url: string | null, options: SetApiUrlOptions = {}): void {
  const { persist = true, notify = true } = options;

  if (url === null) {
    inMemoryApiUrl = null;
    if (persist && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(API_URL_STORAGE_KEY);
        localStorage.removeItem('verity_api_url');
      } catch {
        // ignore storage errors
      }
    }
  } else {
    const sanitized = url.trim().replace(/\/$/, '');
    inMemoryApiUrl = sanitized;
    if (persist && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(API_URL_STORAGE_KEY, sanitized);
      } catch {
        // ignore storage errors
      }
    }
  }

  if (notify) {
    const effective = getApiBaseUrl();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(API_URL_CHANGE_EVENT, { detail: effective }));
    }
    urlChangeListeners.forEach(listener => {
      try {
        listener(effective);
      } catch (err) {
        console.error('Error in onApiUrlChange listener:', err);
      }
    });
  }
}

export const setApiUrl = setApiBaseUrl;

/**
 * Resets the API base URL to its default unconfigured state (clears in-memory and stored config).
 */
export function resetApiBaseUrl(): void {
  setApiBaseUrl(null, { persist: true, notify: true });
}

export const resetApiUrl = resetApiBaseUrl;

/**
 * Subscribes to API URL change events.
 * Returns an unsubscription function.
 */
export function onApiUrlChange(listener: (newUrl: string) => void): () => void {
  urlChangeListeners.add(listener);
  return () => {
    urlChangeListeners.delete(listener);
  };
}

export async function testApiConnection(customUrl?: string): Promise<{
  ok: boolean;
  status: number;
  latencyMs: number;
  engineUrl: string;
  data?: any;
  error?: string;
}> {
  const base = (customUrl !== undefined ? customUrl : getApiBaseUrl()).trim().replace(/\/$/, '');
  const url = `${base}/api/health`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        latencyMs,
        engineUrl: base || (typeof window !== 'undefined' ? window.location.origin : ''),
        error: `Server responded with HTTP ${res.status} (${res.statusText || 'Error'})`,
      };
    }
    const data = await res.json().catch(() => null);
    return {
      ok: true,
      status: res.status,
      latencyMs,
      engineUrl: base || (typeof window !== 'undefined' ? window.location.origin : ''),
      data,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      status: 0,
      latencyMs,
      engineUrl: base || (typeof window !== 'undefined' ? window.location.origin : ''),
      error: err.name === 'TimeoutError' ? 'Connection timed out after 10s' : (err.message || 'Network unreachable'),
    };
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const apiBase = getApiBaseUrl();
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    const currentEngine = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    const err: any = new Error(
      `Unable to connect to Verity API Engine at [${currentEngine}]. ` +
      `Check your network or click 'API Engine' to configure your runner endpoint.`
    );
    err.status = 0;
    throw err;
  }

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        errMsg = data.error || errMsg;
      } catch {
        if (response.status === 404 && (text.includes('<!DOCTYPE') || text.includes('<html') || !text.trim())) {
          const currentEngine = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
          errMsg = `API endpoint '${endpoint}' returned 404 (Not Found) from engine at [${currentEngine}]. You can switch your live Verity Engine URL in Engine Settings.`;
        } else if (text.trim()) {
          errMsg = text.slice(0, 300);
        }
      }
    } catch {
      // fallback
    }
    const err: any = new Error(errMsg);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

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

export const api = {
  getToken: getStoredToken,

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    currentApiUser = res.user;
    return res;
  },

  async registerStandalone(email: string, password: string, name: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/register-standalone', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setStoredToken(res.token);
    currentApiUser = res.user;
    return res;
  },

  async getMe(): Promise<{ user: User; organization: Organization | null }> {
    const res = await request<{ user: User; organization: Organization | null }>('/api/auth/me');
    currentApiUser = res.user;
    return res;
  },

  async resetPassword(newPassword: string): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  async switchPersona(targetRole?: string, email?: string): Promise<{ token: string; user: User; organization: Organization | null }> {
    const res = await request<{ token: string; user: User; organization: Organization | null }>('/api/auth/switch-persona', {
      method: 'POST',
      body: JSON.stringify({ targetRole, email }),
    });
    setStoredToken(res.token);
    currentApiUser = res.user;
    return res;
  },

  async getDemoPersonas(): Promise<Array<{ id: string; email: string; name: string; role: string; orgId?: string; creditsBalance: number }>> {
    return request('/api/auth/demo-personas');
  },

  // Projects
  async getProjects(): Promise<Project[]> {
    return request<Project[]>('/api/projects');
  },

  async createProject(name: string, siteUrl: string, description?: string): Promise<Project> {
    return request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, siteUrl, description }),
    });
  },

  async getProject(id: string): Promise<Project & { suites: any[]; caseCount: number }> {
    return request<Project & { suites: any[]; caseCount: number }>(`/api/projects/${id}`);
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    return request<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteProject(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },

  async createTestCase(projectId: string, testCase: Partial<TestCase>): Promise<TestCase> {
    return request<TestCase>(`/api/projects/${projectId}/cases`, {
      method: 'POST',
      body: JSON.stringify(testCase),
    });
  },

  async updateTestCase(projectId: string, caseId: string, updates: Partial<TestCase>): Promise<TestCase> {
    return request<TestCase>(`/api/projects/${projectId}/cases/${caseId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteTestCase(projectId: string, caseId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/projects/${projectId}/cases/${caseId}`, {
      method: 'DELETE',
    });
  },

  setCurrentUser(user: User | null) {
    currentApiUser = user;
  },

  getCurrentUser(): User | null {
    return currentApiUser;
  },

  /**
   * Retrieves test cases for a project, protected by the security middleware layer.
   * Checks currentUser permissions before returning any test case data.
   * If a user is not authorized or logged in, returns a 403 Forbidden status.
   */
  async getTestCases(id: string, currentUser?: User | null): Promise<{
    cases: TestCase[];
    suites?: Suite[];
    dataset: Record<string, any>;
    allNeededFields: string[];
    missingProjectFields: string[];
  }> {
    checkTestCaseSecurity(id, currentUser);
    return request(`/api/projects/${id}/cases`);
  },

  async getProjectCases(id: string, currentUser?: User | null): Promise<{
    cases: TestCase[];
    suites?: Suite[];
    dataset: Record<string, any>;
    allNeededFields: string[];
    missingProjectFields: string[];
  }> {
    return this.getTestCases(id, currentUser);
  },

  async getSuites(projectId: string): Promise<Suite[]> {
    return request<Suite[]>(`/api/projects/${projectId}/suites`);
  },

  async updateDataset(projectId: string, dataset: Record<string, any>): Promise<Record<string, any>> {
    return request(`/api/projects/${projectId}/dataset`, {
      method: 'PUT',
      body: JSON.stringify(dataset),
    });
  },

  async patchDatasetField(projectId: string, path: string, value: any): Promise<Record<string, any>> {
    return request(`/api/projects/${projectId}/dataset`, {
      method: 'PATCH',
      body: JSON.stringify({ path, value }),
    });
  },

  async uploadSuite(projectId: string, name: string, format: 'json' | 'csv' | 'markdown', content: string): Promise<any> {
    return request(`/api/projects/${projectId}/suites/upload`, {
      method: 'POST',
      body: JSON.stringify({ name, format, content }),
    });
  },

  async analyzeUrl(url: string, hint?: string, projectId?: string): Promise<UrlAnalysisResult> {
    const endpoint = projectId ? `/api/projects/${projectId}/analyze-url` : '/api/projects/analyze-url';
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ url, hint }),
    });
  },

  async introspectJourney(url: string, hint?: string, projectId?: string): Promise<IntrospectedWebsiteData> {
    const endpoint = projectId ? `/api/projects/${projectId}/introspect-journey` : '/api/projects/introspect-journey';
    return request<IntrospectedWebsiteData>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ url, hint }),
    });
  },

  async buildFromJourney(payload: {
    url: string;
    projectId?: string;
    projectName?: string;
    suiteName?: string;
    answers: Record<string, string>;
    customDetails?: string;
    customEndpoints?: Array<{ method: string; path: string; purpose?: string }>;
    introspectionData?: Partial<IntrospectedWebsiteData>;
  }): Promise<BuildJourneyResult> {
    const endpoint = payload.projectId ? `/api/projects/${payload.projectId}/build-journey` : '/api/projects/build-journey';
    return request<BuildJourneyResult>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async generateAiSuite(
    projectId: string,
    name?: string,
    description?: string,
    existingPlanText?: string,
    targetUrl?: string,
  ): Promise<any> {
    return request(`/api/projects/${projectId}/suites/generate`, {
      method: 'POST',
      body: JSON.stringify({ name, description, existingPlanText, targetUrl }),
    });
  },

  async deleteSuite(projectId: string, suiteId: string): Promise<any> {
    return request(`/api/projects/${projectId}/suites/${suiteId}`, { method: 'DELETE' });
  },

  async runTestCase(projectId: string, caseId: string, mode: 'preview' | 'hosted' = 'preview'): Promise<{
    testRun: TestRun;
    creditsCharged: number;
    mode: string;
  }> {
    return request(`/api/projects/${projectId}/cases/${caseId}/run`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  },

  async runAllTestCases(projectId: string, mode: 'preview' | 'hosted' = 'preview'): Promise<{
    runs: TestRun[];
    count: number;
  }> {
    return request(`/api/projects/${projectId}/run-all`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  },

  async bulkRunTestCases(projectId: string, caseIds: string[], mode: 'preview' | 'hosted' = 'preview'): Promise<{
    runs: TestRun[];
    count: number;
    passedCount: number;
    failedCount: number;
  }> {
    return request(`/api/projects/${projectId}/cases/bulk-run`, {
      method: 'POST',
      body: JSON.stringify({ caseIds, mode }),
    });
  },

  async bulkDeleteTestCases(projectId: string, caseIds: string[]): Promise<{
    ok: boolean;
    deletedCount: number;
    message: string;
  }> {
    return request(`/api/projects/${projectId}/cases/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ caseIds }),
    });
  },

  async recordManualResult(projectId: string, caseId: string, pass: boolean, notes: string): Promise<TestRun> {
    return request(`/api/projects/${projectId}/cases/${caseId}/manual-result`, {
      method: 'POST',
      body: JSON.stringify({ pass, notes }),
    });
  },

  async getProjectRuns(projectId: string = 'all', limit: number = 200): Promise<{ runs: TestRun[]; total: number }> {
    return request<{ runs: TestRun[]; total: number }>(`/api/projects/${projectId}/runs?limit=${limit}`);
  },

  async getProjectAnalytics(projectId: string = 'all', days: number = 14): Promise<AnalyticsDashboardData> {
    return request<AnalyticsDashboardData>(`/api/projects/${projectId}/analytics?days=${days}`);
  },

  // Test Suite Scheduling & Automated Triggers
  async getSchedules(projectId: string): Promise<TestSchedule[]> {
    return request<TestSchedule[]>(`/api/projects/${projectId}/schedules`);
  },

  async createSchedule(projectId: string, schedule: Partial<TestSchedule>): Promise<TestSchedule> {
    return request<TestSchedule>(`/api/projects/${projectId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(schedule),
    });
  },

  async updateSchedule(projectId: string, scheduleId: string, updates: Partial<TestSchedule>): Promise<TestSchedule> {
    return request<TestSchedule>(`/api/projects/${projectId}/schedules/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteSchedule(projectId: string, scheduleId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/projects/${projectId}/schedules/${scheduleId}`, {
      method: 'DELETE',
    });
  },

  async toggleSchedule(projectId: string, scheduleId: string): Promise<TestSchedule> {
    return request<TestSchedule>(`/api/projects/${projectId}/schedules/${scheduleId}/toggle`, {
      method: 'POST',
    });
  },

  async triggerSchedule(projectId: string, scheduleId: string): Promise<{
    schedule: TestSchedule;
    runs: TestRun[];
    summary: { total: number; passed: number; failed: number };
  }> {
    return request<{
      schedule: TestSchedule;
      runs: TestRun[];
      summary: { total: number; passed: number; failed: number };
    }>(`/api/projects/${projectId}/schedules/${scheduleId}/trigger`, {
      method: 'POST',
    });
  },

  // Package & Cloud Download URL
  getDownloadPackageUrl(projectId: string): string {
    const token = getStoredToken();
    return `/api/package/${projectId}/download?token=${encodeURIComponent(token || '')}`;
  },

  // Billing
  async getBillingStatus(): Promise<{
    accountType: string;
    name: string;
    creditsBalance: number;
    pricingTiers: PricingTier[];
    ledger: CreditLedgerEntry[];
  }> {
    return request('/api/billing/status');
  },

  async topUpCredits(tierId: string): Promise<any> {
    return request('/api/billing/top-up', {
      method: 'POST',
      body: JSON.stringify({ tierId }),
    });
  },

  // Org Admin
  async getOrgOverview(): Promise<{
    organization: Organization;
    members: User[];
    teams: Team[];
    projects: Project[];
    ledger: CreditLedgerEntry[];
  }> {
    return request('/api/org/overview');
  },

  async seedOrgTeam(name: string, budgetTokens?: number, allocatedCredits?: number): Promise<Team> {
    return request('/api/org/teams', {
      method: 'POST',
      body: JSON.stringify({ name, budgetTokens, allocatedCredits }),
    });
  },

  async seedOrgMember(name: string, email: string, role: string = 'member', teamId?: string): Promise<{ member: User; tempPassword: string }> {
    return request('/api/org/members', {
      method: 'POST',
      body: JSON.stringify({ name, email, role, teamId }),
    });
  },

  async updateOrgTeam(teamId: string, data: { name?: string; budgetTokens?: number; allocatedCredits?: number }): Promise<Team> {
    return request(`/api/org/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getOrgSecurity(): Promise<{
    securityConfig: OrgSecurityConfig;
    auditLogs: SystemAuditLog[];
  }> {
    return request('/api/org/security');
  },

  async rotateOrgApiKey(params: {
    keyType: 'test_execution' | 'ai_integration' | 'webhook_secret';
    gracePeriodHours?: number;
    reason?: string;
    environment?: 'production' | 'staging' | 'all';
  }): Promise<{
    ok: boolean;
    newKey: string;
    apiKey: OrgApiKey;
    rotation: KeyRotationHistory;
    message: string;
  }> {
    return request('/api/org/security/rotate-key', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async revokePreviousKeyGrace(keyType: 'test_execution' | 'ai_integration' | 'webhook_secret'): Promise<{
    ok: boolean;
    apiKey: OrgApiKey;
    message: string;
  }> {
    return request('/api/org/security/revoke-previous-key', {
      method: 'POST',
      body: JSON.stringify({ keyType }),
    });
  },

  async testOrgKeyConnectivity(keyType: 'test_execution' | 'ai_integration' | 'webhook_secret'): Promise<{
    ok: boolean;
    latencyMs: number;
    message: string;
    testedAt: string;
  }> {
    return request('/api/org/security/test-key', {
      method: 'POST',
      body: JSON.stringify({ keyType }),
    });
  },


  // Platform Superadmin
  async getAdminStats(): Promise<{
    orgCount: number;
    userCount: number;
    projectCount: number;
    totalRuns: number;
    hostedRuns: number;
    passedRuns: number;
    creditsSpent: number;
  }> {
    return request('/api/admin/stats');
  },

  async getAdminOrgs(): Promise<any[]> {
    return request('/api/admin/organizations');
  },

  async onboardCustomerOrg(data: {
    orgName: string;
    adminEmail: string;
    adminName: string;
    plan?: string;
    initialCredits?: number;
    tokenBudget?: number;
  }): Promise<{ organization: Organization; orgAdmin: User; tempPassword: string }> {
    return request('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async grantOrgCredits(orgId: string, amount: number, reason: string): Promise<any> {
    return request(`/api/admin/organizations/${orgId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  },

  async getAdminUsers(): Promise<any[]> {
    return request('/api/admin/users');
  },

  async getAdminAuditLogs(): Promise<SystemAuditLog[]> {
    return request('/api/admin/audit-logs');
  },

  async submitContact(data: {
    name: string;
    email: string;
    company?: string;
    category: string;
    message: string;
    priority?: string;
  }): Promise<{ ok: boolean; ticketId: string; message: string; inquiry: any }> {
    return request('/api/contact', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getContactCategories(): Promise<{
    categories: Array<{ id: string; label: string; sla: string }>;
    supportChannels: Array<{ channel: string; email: string; hours: string }>;
  }> {
    return request('/api/contact/categories');
  },

  getApiBaseUrl,
  getApiUrl,
  setApiBaseUrl,
  setApiUrl,
  resetApiBaseUrl,
  resetApiUrl,
  onApiUrlChange,
  testApiConnection,
  DEFAULT_CLOUD_RUN_ENGINE_URL,
  API_URL_STORAGE_KEY,
  API_URL_CHANGE_EVENT,
};
