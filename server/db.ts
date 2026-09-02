import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseSchema, User, Organization, Team, Project, Suite, TestCase, TestRun, CreditLedgerEntry, SystemAuditLog } from './types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'verity-db.json');

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
          statusIn: [401, 403, 404],
          bodyContains: ['message', 'Requires authentication'],
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
  };
}

class Database {
  private db: DatabaseSchema;

  constructor() {
    this.db = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || [],
          organizations: parsed.organizations || [],
          teams: parsed.teams || [],
          projects: parsed.projects || [],
          suites: parsed.suites || [],
          testCases: parsed.testCases || [],
          testRuns: parsed.testRuns || [],
          creditLedger: parsed.creditLedger || [],
          auditLogs: parsed.auditLogs || [],
        };
      }
    } catch (e) {
      console.warn('Could not read existing db, initializing fresh seed database', e);
    }
    const initial = getInitialDb();
    this.saveDirect(initial);
    return initial;
  }

  private saveDirect(data: DatabaseSchema) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  public save() {
    this.saveDirect(this.db);
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
    this.save();
    return log;
  }
}

export const db = new Database();
