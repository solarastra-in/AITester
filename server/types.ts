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
  /**
   * Usage control set by the org's Customer Admin when onboarding this
   * employee: the max credits this specific employee may consume per
   * calendar month, independent of the org's shared credit pool. Null/
   * undefined means "no individual cap — limited only by the org's own
   * balance", matching pre-existing behavior for any user created before
   * this field existed.
   */
  monthlyCreditLimit?: number | null;
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
  /** Customer's logo, set during Super Admin onboarding — a URL to an already-hosted image, not an uploaded file (this platform has no blob storage). */
  logoUrl?: string | null;
  /** Optional customer contact/detail fields collected during onboarding, for the Super Admin's own records — not used elsewhere in the product. */
  contactEmail?: string | null;
  industry?: string | null;
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

export type TestCaseType = 'http' | 'load' | 'manual' | 'browser';

export interface HttpRequestSpec {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  authPersona?: string | null;
  headers?: Record<string, string>;
  body?: any;
}

// A single browser automation action. `selector` is a CSS selector (or, for
// text-based matching, a Playwright-style `text=...`/`role=...` engine
// prefix — the runner passes it straight through to Playwright's locator
// API, so any selector engine Playwright supports works).
export type BrowserStepAction =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'waitForSelector'
  | 'waitForNavigation'
  | 'assertVisible'
  | 'assertText'
  | 'assertUrl'
  | 'assertNoConsoleErrors'
  | 'assertNoBrokenLinks'
  | 'screenshot';

export interface BrowserStep {
  id: string;
  action: BrowserStepAction;
  /** Required for 'navigate' (relative or absolute) and 'assertUrl' (substring match). */
  url?: string;
  /** Required for click/fill/select/check/waitForSelector/assertVisible/assertText. */
  selector?: string;
  /** Required for fill/select/assertText (expected substring). Supports {{placeholder}} templating against the resolved dataset. */
  value?: string;
  /** Human-readable description shown in the report, independent of the mechanical action. */
  description?: string;
  /** If true, a failure on this step doesn't stop the remaining steps (used for exploratory checks like broken-link scanning). */
  continueOnFailure?: boolean;
}

export interface BrowserTestSpec {
  /** The page this test starts on, relative to the project's siteUrl unless absolute. */
  startPath: string;
  steps: BrowserStep[];
  /** Field names (matching dataset keys) this test needs that the crawler/AI could not confidently auto-fill — e.g. a password field, a payment field, anything behind a login wall. Surfaced to the user via the dataset configurator rather than silently guessed. */
  requiresUserSuppliedData?: string[];
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
  // Browser Spec
  browser?: BrowserTestSpec;
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
  // Browser test results — populated only when the parent TestCase's type
  // is 'browser'. Kept separate from `requests` (HTTP-level) since a
  // browser run's unit of work is a step, not a request.
  browserSteps?: Array<{
    stepId: string;
    action: string;
    description?: string;
    pass: boolean;
    durationMs: number;
    error: string | null;
    screenshotPath?: string;
  }>;
  // Real problems the browser found while executing this test — broken
  // links (non-2xx/3xx same-origin links encountered), console errors, and
  // failed network requests for subresources. This is the "areas where
  // bugs are identified" report content, distinct from step pass/fail.
  bugsFound?: Array<{
    type: 'broken_link' | 'console_error' | 'failed_request' | 'slow_page_load';
    detail: string;
    url?: string;
  }>;
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
