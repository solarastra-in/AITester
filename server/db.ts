import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { DatabaseSchema, User, Organization, Team, Project, Suite, TestCase, TestRun, CreditLedgerEntry, SystemAuditLog, TestSchedule } from './types.js';
import { FirestoreAdapter, AdminFirestoreAdapter, FakeFirestoreAdapter, FirestoreWriteOp } from './firestoreAdapter.js';

export function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), 'verity-data');
  }
  return path.join(process.cwd(), '.data');
}

function getInitialDb(): DatabaseSchema {
  const salt = bcrypt.genSaltSync(10);

  const superAdminId = 'usr_superadmin';
  const orgAId = 'org_acme_corp';
  const orgAdminAId = 'usr_org_admin_a';
  const teamAlphaId = 'team_core_qa';
  const memberAId = 'usr_member_a';
  const standaloneUserId = 'usr_standalone_dev';

  const defaultUsers: User[] = [
    {
      id: superAdminId,
      email: 'admin@verity.dev',
      name: 'Platform Superadmin',
      passwordHash: bcrypt.hashSync('admin123!', salt),
      role: 'platform_admin',
      creditsBalance: 9999,
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: orgAdminAId,
      email: 'qa.lead@acmecorp.com',
      name: 'Sarah Chen (Org Admin)',
      passwordHash: bcrypt.hashSync('acme123!', salt),
      role: 'org_admin',
      orgId: orgAId,
      creditsBalance: 500,
      createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: memberAId,
      email: 'alex.engineer@acmecorp.com',
      name: 'Alex Rivera (Staff Engineer)',
      passwordHash: bcrypt.hashSync('alex123!', salt),
      role: 'member',
      orgId: orgAId,
      teamId: teamAlphaId,
      creditsBalance: 0,
      createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: standaloneUserId,
      email: 'developer@indie.io',
      name: 'Morgan Dev (Standalone)',
      passwordHash: bcrypt.hashSync('indie123!', salt),
      role: 'standalone',
      creditsBalance: 50,
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultOrgs: Organization[] = [
    {
      id: orgAId,
      name: 'Acme Cloud Solutions',
      plan: 'pro',
      creditsBalance: 850,
      tokenBudget: 500000,
      createdBy: superAdminId,
      createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultTeams: Team[] = [
    {
      id: teamAlphaId,
      orgId: orgAId,
      name: 'Backend Core QA Team',
      budgetTokens: 250000,
      allocatedCredits: 400,
      createdAt: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'team_frontend',
      orgId: orgAId,
      name: 'Frontend & API Integration Team',
      budgetTokens: 250000,
      allocatedCredits: 450,
      createdAt: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const proj1Id = 'proj_github_api';
  const suite1Id = 'suite_github_public';

  const defaultProjects: Project[] = [
    {
      id: proj1Id,
      ownerUserId: orgAdminAId,
      orgId: orgAId,
      name: 'GitHub Public REST API Suite',
      siteUrl: 'https://api.github.com',
      description: 'Automated functional test suite verifying public GitHub rate-limits, repositories, and user search APIs.',
      dataset: {
        baseUrl: 'https://api.github.com',
        userAgent: 'Verity-Automated-Test-Runner/1.0',
        test_org: 'octocat',
        test_repo: 'Hello-World',
        authTokens: {
          guest: '',
          user: '',
        },
      },
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'proj_json_placeholder',
      ownerUserId: standaloneUserId,
      name: 'JSONPlaceholder Live REST API',
      siteUrl: 'https://jsonplaceholder.typicode.com',
      description: 'Zero-config CRUD functional tests verifying JSON REST endpoints with parameter substitution.',
      dataset: {
        baseUrl: 'https://jsonplaceholder.typicode.com',
        sample_post_id: '1',
        sample_user_id: '1',
        new_post_title: 'Automated Test Verification Post',
        authTokens: {},
      },
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultSuites: Suite[] = [
    {
      id: suite1Id,
      projectId: proj1Id,
      name: 'Core GitHub API Smoke & Rate Limit Suite',
      source: 'uploaded',
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'suite_jp_crud',
      projectId: 'proj_json_placeholder',
      name: 'CRUD Posts & Comments Suite',
      source: 'ai_generated',
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultTestCases: TestCase[] = [
    {
      id: 'tc_gh_01',
      suiteId: suite1Id,
      extId: 'GH-001',
      category: 'System & Rate Limits',
      title: 'Verify root API endpoint and rate limit status headers',
      priority: 'High',
      tags: ['smoke', 'api', 'headers'],
      type: 'http',
      spec: {
        requests: [
          {
            name: 'Fetch Root API Manifest',
            method: 'GET',
            path: '/rate_limit',
            headers: {
              'User-Agent': '{{userAgent}}',
              'Accept': 'application/vnd.github+json',
            },
          },
        ],
        expect: {
          statusIn: [200, 304],
          bodyContains: ['rate', 'resources', 'core'],
        },
      },
      dataFields: ['userAgent'],
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tc_gh_02',
      suiteId: suite1Id,
      extId: 'GH-002',
      category: 'Repository Endpoints',
      title: 'Retrieve repository metadata with dynamic {{test_org}} and {{test_repo}}',
      priority: 'High',
      tags: ['regression', 'repos'],
      type: 'http',
      spec: {
        requests: [
          {
            name: 'Fetch Octocat Repository',
            method: 'GET',
            path: '/repos/{{test_org}}/{{test_repo}}',
            headers: {
              'User-Agent': '{{userAgent}}',
            },
          },
        ],
        expect: {
          statusIn: [200],
          bodyContains: ['full_name', 'owner', 'html_url'],
        },
      },
      dataFields: ['test_org', 'test_repo', 'userAgent'],
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tc_gh_03',
      suiteId: suite1Id,
      extId: 'GH-003',
      category: 'Rate Limiting & Concurrency',
      title: 'Load check: Validate fast concurrent burst against rate limit endpoint',
      priority: 'Medium',
      tags: ['load', 'concurrency'],
      type: 'load',
      spec: {
        request: {
          name: 'Concurrent Rate Limit Probe',
          method: 'GET',
          path: '/rate_limit',
          headers: {
            'User-Agent': '{{userAgent}}',
          },
        },
        totalRequests: 8,
        concurrency: 3,
        maxP95Ms: 2500,
      },
      dataFields: ['userAgent'],
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tc_gh_04',
      suiteId: suite1Id,
      extId: 'GH-004',
      category: 'Security & Access Control',
      title: 'Verify unauthenticated write endpoint returns 401/404 without valid token',
      priority: 'High',
      tags: ['security', 'rbac'],
      type: 'http',
      spec: {
        requests: [
          {
            name: 'Unauthorized Star Action',
            method: 'PUT',
            path: '/user/starred/{{test_org}}/{{test_repo}}',
            headers: {
              'User-Agent': '{{userAgent}}',
            },
          },
        ],
        expect: {
          statusIn: [401, 403],
          bodyContains: ['message'],
        },
      },
      dataFields: ['test_org', 'test_repo', 'userAgent'],
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tc_jp_01',
      suiteId: 'suite_jp_crud',
      extId: 'JP-001',
      category: 'Posts API',
      title: 'GET post details by ID with parameter substitution',
      priority: 'High',
      tags: ['smoke', 'crud'],
      type: 'http',
      spec: {
        requests: [
          {
            name: 'Fetch Post Record',
            method: 'GET',
            path: '/posts/{{sample_post_id}}',
          },
        ],
        expect: {
          statusIn: [200],
          bodyContains: ['userId', 'title', 'body'],
        },
      },
      dataFields: ['sample_post_id'],
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'tc_jp_02',
      suiteId: 'suite_jp_crud',
      extId: 'JP-002',
      category: 'Posts API',
      title: 'POST create new post payload with dynamic title and body',
      priority: 'Medium',
      tags: ['create', 'mutation'],
      type: 'http',
      spec: {
        requests: [
          {
            name: 'Create Post',
            method: 'POST',
            path: '/posts',
            headers: {
              'Content-Type': 'application/json',
            },
            body: {
              title: '{{new_post_title}}',
              body: 'Automated test execution body created at {{baseUrl}}',
              userId: '{{sample_user_id}}',
            },
          },
        ],
        expect: {
          statusIn: [201, 200],
          bodyContains: ['id', 'title'],
        },
      },
      dataFields: ['new_post_title', 'baseUrl', 'sample_user_id'],
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultLedger: CreditLedgerEntry[] = [
    {
      id: uuidv4(),
      orgId: orgAId,
      delta: 1000,
      reason: 'Initial Enterprise Org Onboarding Allocation',
      balanceAfter: 1000,
      createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: uuidv4(),
      orgId: orgAId,
      delta: -150,
      reason: 'Hosted Cloud Execution Batch: 150 Runs',
      balanceAfter: 850,
      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: uuidv4(),
      userId: standaloneUserId,
      delta: 50,
      reason: 'Free Trial Standalone Developer Credits Grant',
      balanceAfter: 50,
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultAuditLogs: SystemAuditLog[] = [
    {
      id: uuidv4(),
      userId: superAdminId,
      userEmail: 'admin@verity.dev',
      action: 'ORG_ONBOARDED',
      details: 'Created customer organization Acme Cloud Solutions and allocated 1,000 initial credits.',
      timestamp: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: uuidv4(),
      userId: orgAdminAId,
      userEmail: 'qa.lead@acmecorp.com',
      action: 'TEAM_SEEDED',
      details: 'Created team Backend Core QA Team and seeded team member Alex Rivera.',
      timestamp: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const defaultSchedules: TestSchedule[] = [
    {
      id: 'sched_daily_smoke',
      projectId: 'proj_github_api',
      suiteId: 'all',
      suiteName: 'All Suites',
      name: 'Daily Smoke & Health Ping',
      scheduleType: 'daily',
      cronExpression: '0 2 * * *',
      timeOfDay: '02:00',
      dayOfWeek: 1,
      executionMode: 'preview',
      enabled: true,
      notifyEmail: 'qa.lead@acmecorp.com',
      lastRunAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      lastRunPass: true,
      lastRunMessage: 'Completed: 3 passed, 0 failed (3 total)',
      nextRunAt: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sched_weekly_regression',
      projectId: 'proj_github_api',
      suiteId: 'suite_gh_01',
      suiteName: 'GitHub Public Core API Suite',
      name: 'Weekly Full Regression Audit',
      scheduleType: 'weekly',
      cronExpression: '0 6 * * 1',
      timeOfDay: '06:00',
      dayOfWeek: 1,
      executionMode: 'hosted',
      enabled: true,
      notifyEmail: 'admin@verity.dev',
      lastRunAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      lastRunPass: true,
      lastRunMessage: 'Completed: 3 passed, 0 failed (3 total)',
      nextRunAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  return {
    users: defaultUsers,
    organizations: defaultOrgs,
    teams: defaultTeams,
    projects: defaultProjects,
    suites: defaultSuites,
    testCases: defaultTestCases,
    testRuns: [],
    creditLedger: defaultLedger,
    auditLogs: defaultAuditLogs,
    testSchedules: defaultSchedules,
  };
}

const COLLECTION_NAMES = [
  'users', 'organizations', 'teams', 'projects', 'suites',
  'testCases', 'testRuns', 'creditLedger', 'auditLogs', 'testSchedules',
] as const;

function defaultAdapterForEnvironment(): FirestoreAdapter {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return new FakeFirestoreAdapter();
  }
  return new AdminFirestoreAdapter();
}

function cloneSchema(s: DatabaseSchema): DatabaseSchema {
  return JSON.parse(JSON.stringify(s));
}

class Database {
  private db: DatabaseSchema;
  /** Deep snapshot of the last state actually confirmed persisted to
   * Firestore — save() diffs the live in-memory state against this to
   * compute the minimal set of writes, rather than blindly rewriting
   * every document on every save. */
  private lastPersistedSnapshot: DatabaseSchema;
  private adapter: FirestoreAdapter;
  /** Resolves once the first real hydration from Firestore completes.
   * db.data is usable synchronously before this resolves (seeded with
   * getInitialDb()'s defaults) so nothing crashes on cold start, but
   * request handling should await this (or call reload()) before relying
   * on data being current. */
  public readonly ready: Promise<void>;

  public useFakeAdapter() {
    this.adapter = new FakeFirestoreAdapter();
  }

  constructor(adapter?: FirestoreAdapter) {
    this.adapter = adapter || defaultAdapterForEnvironment();
    const seed = getInitialDb();
    this.db = seed;
    this.lastPersistedSnapshot = cloneSchema(seed);
    this.ready = this.reload().then(() => undefined).catch(err => {
      console.error('[Database] Initial Firestore hydration note — continuing with in-memory seed data:', err.message || err);
    });
  }

  private sanitizeSchema(parsed: any): DatabaseSchema {
    return {
      users: Array.isArray(parsed?.users) ? parsed.users : [],
      organizations: Array.isArray(parsed?.organizations) ? parsed.organizations : [],
      teams: Array.isArray(parsed?.teams) ? parsed.teams : [],
      projects: Array.isArray(parsed?.projects) ? parsed.projects : [],
      suites: Array.isArray(parsed?.suites) ? parsed.suites : [],
      testCases: Array.isArray(parsed?.testCases) ? parsed.testCases : [],
      testRuns: Array.isArray(parsed?.testRuns) ? parsed.testRuns : [],
      creditLedger: Array.isArray(parsed?.creditLedger) ? parsed.creditLedger : [],
      auditLogs: Array.isArray(parsed?.auditLogs) ? parsed.auditLogs : [],
      testSchedules: (() => {
        const raw = Array.isArray(parsed?.testSchedules) ? parsed.testSchedules : [];
        const projectIds = new Set((parsed?.projects || []).map((p: any) => p.id));
        return raw.filter((s: any) => s && projectIds.has(s.projectId));
      })(),
    };
  }

  /**
   * Fetches the current, real state of every collection from Firestore —
   * the fix for the core cross-instance-consistency bug: a JSON file on a
   * serverless instance's local (and on Vercel, ephemeral, per-instance)
   * disk could never be reliably visible to a different instance handling
   * the next request. Firestore is a real, shared, persistent store, so a
   * fresh reload() at the start of every request (see the middleware in
   * server/app.ts) means every request sees every other request's writes,
   * regardless of which serverless instance handled which request.
   *
   * On a genuinely empty Firestore (first run ever), seeds it with
   * getInitialDb()'s demo/seed dataset and persists that seed immediately,
   * so subsequent reads (from any instance) see the same starting state.
   */
  public async reload(): Promise<DatabaseSchema> {
    const next: any = {};
    let anyDataFound = false;

    for (const name of COLLECTION_NAMES) {
      const docs = await this.adapter.getCollection(name);
      if (docs.length > 0) anyDataFound = true;
      next[name] = docs.map(d => ({ ...d.data, id: d.id }));
    }

    if (!anyDataFound) {
      const seed = getInitialDb();
      this.db = seed;
      this.lastPersistedSnapshot = cloneSchema({ ...seed, users: [], organizations: [], teams: [], projects: [], suites: [], testCases: [], testRuns: [], creditLedger: [], auditLogs: [], testSchedules: [] } as any); // force save() to treat every seed record as new
      await this.save();
      return this.db;
    }

    this.db = this.sanitizeSchema(next);
    this.lastPersistedSnapshot = cloneSchema(this.db);
    return this.db;
  }

  /**
   * Diffs the live in-memory state against the last confirmed-persisted
   * snapshot and writes only what actually changed (added, modified, or
   * removed documents) as a single batched Firestore write. Must be
   * awaited by callers.
   */
  public async save(): Promise<void> {
    const ops: FirestoreWriteOp[] = [];

    for (const name of COLLECTION_NAMES) {
      const current: any[] = (this.db as any)[name] || [];
      const previous: any[] = (this.lastPersistedSnapshot as any)[name] || [];
      const currentById = new Map(current.map((item: any) => [item.id, item]));
      const previousById = new Map(previous.map((item: any) => [item.id, item]));

      for (const [id, item] of currentById) {
        const prevItem = previousById.get(id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
          ops.push({ type: 'set', collection: name, id, data: item });
        }
      }
      for (const id of previousById.keys()) {
        if (!currentById.has(id)) {
          ops.push({ type: 'delete', collection: name, id });
        }
      }
    }

    if (ops.length === 0) return;

    try {
      await this.adapter.commitBatch(ops);
      this.lastPersistedSnapshot = cloneSchema(this.db);
    } catch (err: any) {
      // In dev mode when running without explicit credentials or when offline in dev:
      if (process.env.NODE_ENV !== 'production' && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.warn('[Database] Persisted in-memory only (FIREBASE_SERVICE_ACCOUNT_KEY not set in dev):', err.message || err);
        this.lastPersistedSnapshot = cloneSchema(this.db);
        return;
      }
      throw err;
    }
  }

  public get data(): DatabaseSchema {
    return this.db;
  }

  // Helper query methods
  public findUserById(id: string) {
    return this.db.users.find(u => u.id === id);
  }

  public findUserByEmail(email: string) {
    return this.db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  }

  public findOrgById(id: string) {
    return this.db.organizations.find(o => o.id === id);
  }

  public findProjectById(id: string) {
    return this.db.projects.find(p => p.id === id);
  }

  /**
   * Records an audit log entry in memory immediately (so it's reflected
   * in the same request's response if read back), and persists it to
   * Firestore best-effort in the background WITHOUT the caller awaiting
   * it. This is a deliberate scope decision for secondary/diagnostic data.
   */
  public addAuditLog(userId: string, userEmail: string, action: string, details: string) {
    const log: SystemAuditLog = {
      id: uuidv4(),
      userId,
      userEmail,
      action,
      details,
      timestamp: new Date().toISOString(),
    };
    this.db.auditLogs.unshift(log);
    if (this.db.auditLogs.length > 500) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 500);
    }
    this.save().catch(err => {
      console.warn('[Database] Background audit log persistence failed (in-memory record preserved for this request):', err);
    });
    return log;
  }
}

export const db = new Database();
export { Database };
