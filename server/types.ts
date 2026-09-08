export type UserRole = 'platform_admin' | 'org_admin' | 'member' | 'standalone';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
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
  createdBy: string;
  createdAt: string;
  tokenBudget?: number;
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
  // HTTP Spec
  requests?: HttpRequestSpec[];
  expect?: {
    statusIn?: number[];
    bodyContains?: string[];
    bodyNotContains?: string[];
    headerEquals?: Record<string, string>;
  };
  // Load Spec
  request?: HttpRequestSpec;
  totalRequests?: number;
  concurrency?: number;
  expectRateLimited?: boolean;
  maxP95Ms?: number;
  // Manual Spec
  instructions?: string;
}

export interface TestCase {
  id: string;
  suiteId: string;
  extId: string;
  category: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  tags: string[];
  type: TestCaseType;
  spec: TestCaseSpec;
  dataFields: string[];
  createdAt: string;
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

export type ScheduleTriggerType = 'daily' | 'weekly' | 'cron';

export interface TestSchedule {
  id: string;
  projectId: string;
  suiteId?: string | 'all';
  suiteName?: string;
  name: string;
  scheduleType: ScheduleTriggerType;
  cronExpression: string;
  timeOfDay?: string;
  dayOfWeek?: number;
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

export interface DatabaseSchema {
  users: User[];
  organizations: Organization[];
  teams: Team[];
  projects: Project[];
  suites: Suite[];
  testCases: TestCase[];
  testRuns: TestRun[];
  creditLedger: CreditLedgerEntry[];
  auditLogs: SystemAuditLog[];
  testSchedules?: TestSchedule[];
}
