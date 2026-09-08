export type UserRole = 'platform_admin' | 'org_admin' | 'member' | 'standalone';

export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  role: UserRole;
  orgId?: string | null;
  teamId?: string | null;
  creditsBalance: number;
  mustResetPassword?: boolean;
  createdAt: string;
}

export interface OrgApiKey {
  id: string;
  keyType: 'test_execution' | 'ai_integration' | 'webhook_secret';
  name: string;
  maskedKey: string;
  fullKey?: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
  rotatedAt?: string | null;
  status: 'active' | 'expiring' | 'revoked';
  expiresAt?: string | null;
  previousKeyExpiresAt?: string | null;
  allowedIps?: string[];
  environment: 'production' | 'staging' | 'all';
}

export interface KeyRotationHistory {
  id: string;
  keyType: 'test_execution' | 'ai_integration' | 'webhook_secret';
  rotatedByEmail: string;
  rotatedAt: string;
  gracePeriodHours: number;
  reason: string;
  oldKeyMasked: string;
  newKeyMasked: string;
}

export interface OrgSecurityConfig {
  apiKeys: OrgApiKey[];
  rotationHistory: KeyRotationHistory[];
  ipWhitelistingEnabled?: boolean;
  mfaRequiredForAdmins?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  plan: 'trial' | 'pro' | 'enterprise';
  creditsBalance: number;
  tokenBudget?: number;
  createdBy: string;
  createdAt: string;
  securityConfig?: OrgSecurityConfig;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  budgetTokens: number;
  allocatedCredits: number;
  createdAt: string;
}

export interface Project {
  id: string;
  ownerUserId: string;
  orgId?: string | null;
  name: string;
  siteUrl: string;
  description?: string;
  dataset: Record<string, any>;
  suiteCount?: number;
  caseCount?: number;
  runCount?: number;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Suite {
  id: string;
  projectId: string;
  name: string;
  source: 'uploaded' | 'ai_generated' | 'manual';
  createdAt: string;
}

export type TestCaseType = 'http' | 'load' | 'manual';

export interface HttpRequestSpec {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  authPersona?: string | null;
  headers?: Record<string, string>;
  body?: any;
}

export interface TestCaseSpec {
  requests?: HttpRequestSpec[];
  expect?: {
    statusIn?: number[];
    bodyContains?: string[];
    bodyNotContains?: string[];
    headerEquals?: Record<string, string>;
  };
  request?: HttpRequestSpec;
  totalRequests?: number;
  concurrency?: number;
  expectRateLimited?: boolean;
  maxP95Ms?: number;
  instructions?: string;
}

export interface TestCase {
  id: string;
  projectId?: string;
  suiteId?: string;
  suiteName?: string;
  extId: string;
  category: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  tags: string[];
  type: TestCaseType;
  spec: TestCaseSpec;
  dataFields: string[];
  missingDataFields?: string[];
  lastResult?: TestRun | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  testCaseId: string;
  ranAt: string;
  pass: boolean;
  message: string;
  executedBy: 'preview' | 'hosted' | 'manual' | 'standalone';
  creditsCharged: number;
  runByUserId: string;
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

export interface CreditLedgerEntry {
  id: string;
  orgId?: string | null;
  userId?: string | null;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

export interface SystemAuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface PricingTier {
  id: string;
  name: string;
  credits: number;
  priceUsd: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export interface IntrospectionQuestion {
  id: string;
  category: 'auth' | 'model' | 'data' | 'workflow' | 'edge_case';
  title: string;
  question: string;
  explanation: string;
  suggestedDefault: string;
  variableKey: string;
  placeholder: string;
  required: boolean;
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

export interface BuildJourneyResult {
  ok: boolean;
  projectId: string;
  suiteId: string;
  suiteName: string;
  caseCount: number;
  dataset: Record<string, any>;
  cases: TestCase[];
}

export type AppView =
  | 'home'
  | 'studio'
  | 'org_admin'
  | 'super_admin'
  | 'pricing'
  | 'contact'
  | 'docs'
  | 'features'
  | 'about';

export interface ContactInquiry {
  id?: string;
  ticketId?: string;
  name: string;
  email: string;
  company?: string;
  category: string;
  message: string;
  priority?: 'Standard' | 'Expedited' | 'Critical SLA';
  status?: string;
  createdAt?: string;
}

export interface TrendDataPoint {
  date: string;
  fullDate: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  avgDurationMs: number;
}

export interface CategoryAnalytics {
  category: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface PriorityAnalytics {
  priority: string;
  count: number;
  passed: number;
  failed: number;
}

export interface AnalyticsDashboardData {
  summary: {
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    passRate: number;
    avgDurationMs: number;
    flakinessScore: number;
    totalCases: number;
    activeCasesRun: number;
  };
  trendOverTime: TrendDataPoint[];
  categoryBreakdown: CategoryAnalytics[];
  priorityBreakdown: PriorityAnalytics[];
  typeBreakdown: Array<{ type: string; count: number }>;
  executionModeBreakdown: Array<{ mode: string; count: number }>;
  recentRuns: TestRun[];
}

export type ScheduleTriggerType = 'daily' | 'weekly' | 'cron';

export interface TestSchedule {
  id: string;
  projectId: string;
  suiteId?: string | 'all'; // 'all' or specific suiteId
  suiteName?: string;
  name: string;
  scheduleType: ScheduleTriggerType;
  cronExpression: string; // e.g. "0 2 * * *" or "0 9 * * 1" or custom
  timeOfDay?: string; // e.g. "02:00"
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  executionMode: 'preview' | 'hosted';
  enabled: boolean;
  notifyEmail?: string;
  lastRunAt?: string | null;
  lastRunPass?: boolean | null;
  lastRunMessage?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}


