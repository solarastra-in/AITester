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

const TOKEN_KEY = 'verity_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
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

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      errMsg = data.error || errMsg;
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
    return res;
  },

  async registerStandalone(email: string, password: string, name: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/register-standalone', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setStoredToken(res.token);
    return res;
  },

  async getMe(): Promise<{ user: User; organization: Organization | null }> {
    return request<{ user: User; organization: Organization | null }>('/api/auth/me');
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

  async getProjectCases(id: string): Promise<{
    cases: TestCase[];
    suites?: Suite[];
    dataset: Record<string, any>;
    allNeededFields: string[];
    missingProjectFields: string[];
  }> {
    return request(`/api/projects/${id}/cases`);
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
};
