export type UserRole = 'platform_admin' | 'org_admin' | 'member' | 'standalone';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId?: string | null;
  teamId?: string | null;
  creditsBalance: number;
  mustResetPassword?: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  plan: 'trial' | 'pro' | 'enterprise';
  creditsBalance: number;
  tokenBudget?: number;
  createdBy: string;
  createdAt: string;
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
  suiteId: string;
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
