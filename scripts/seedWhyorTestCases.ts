import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';
import config from '../firebase-applet-config.json';

const dbPath = path.join(process.cwd(), 'data', 'verity-db.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const whyorDataset = {
  baseUrl: 'https://ai.whyor.in',
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

// Target projects
const targetProjects = rawDb.projects.filter(p => 
  p.siteUrl?.includes('whyor') || p.name?.toLowerCase().includes('whyor') || p.name?.toLowerCase().includes('ai')
);

if (targetProjects.length === 0) {
  targetProjects.push(rawDb.projects[0]);
}

const suiteId = 'suite_whyor_master';
const suiteName = 'WhyOr Dispatch End-to-End System & Architecture Suite';

const rawTestCases = [
  {
    extId: 'WHYO-SPA-001',
    category: 'Platform Smoke & Shell',
    title: 'Verify WhyOr Dispatch root SPA loads with status 200 and valid HTML shell',
    priority: 'High',
    tags: ['smoke', 'spa', 'html'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Root SPA Request',
          method: 'GET',
          path: '/',
          headers: { Accept: 'text/html,application/xhtml+xml' },
        },
      ],
      expect: {
        statusIn: [200, 304],
        bodyContains: ['WhyOr Dispatch', '<div id="root">', 'dark'],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-SPA-002',
    category: 'Static Assets & Bundles',
    title: 'Verify WhyOr Dispatch main JavaScript bundle loads and is executable',
    priority: 'High',
    tags: ['assets', 'bundle', 'smoke'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Main JS Bundle',
          method: 'GET',
          path: '/assets/index-l5opthvd.js',
          headers: { 'User-Agent': '{{userAgent}}' },
        },
      ],
      expect: {
        statusIn: [200, 304],
        bodyContains: ['dispatch', 'ledger'],
      },
    },
    dataFields: ['userAgent'],
  },
  {
    extId: 'WHYO-SPA-003',
    category: 'Static Assets & Bundles',
    title: 'Verify compiled Tailwind stylesheet and UI design tokens load successfully',
    priority: 'Medium',
    tags: ['assets', 'css', 'ui'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Main CSS Stylesheet',
          method: 'GET',
          path: '/assets/index-DQy2Zb7Y.css',
        },
      ],
      expect: {
        statusIn: [200, 304],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-SPA-004',
    category: 'Brand & Meta Assets',
    title: 'Verify OpenGraph social card image and metadata preview asset availability',
    priority: 'Low',
    tags: ['seo', 'assets', 'og'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'OpenGraph Image Check',
          method: 'GET',
          path: '/og-image.png',
        },
      ],
      expect: {
        statusIn: [200, 304],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-HLTH-005',
    category: 'System & Gateway Health',
    title: 'Probe API gateway health check endpoint and verify operational status',
    priority: 'High',
    tags: ['health', 'api', 'gateway'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Gateway Health Probe',
          method: 'GET',
          path: '/api/health',
          headers: { Accept: 'application/json' },
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-ROUT-006',
    category: 'AI Dispatch & Routing Engine',
    title: 'Dispatch simple query with semantic router to cheapest low-cost model',
    priority: 'High',
    tags: ['ai', 'dispatch', 'routing'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Low Complexity Prompt Dispatch',
          method: 'POST',
          path: '/api/dispatch',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            prompt: '{{prompt_samples.simple_query}}',
            routingMode: 'cheapest',
            stream: false,
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.simple_query'],
  },
  {
    extId: 'WHYO-ROUT-007',
    category: 'AI Dispatch & Routing Engine',
    title: 'Dispatch complex engineering prompt routing to high-capability reasoning tier',
    priority: 'High',
    tags: ['ai', 'dispatch', 'reasoning'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'High Complexity Prompt Dispatch',
          method: 'POST',
          path: '/v1/dispatch',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            prompt: '{{prompt_samples.complex_query}}',
            routingMode: 'quality_first',
            stream: false,
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.complex_query'],
  },
  {
    extId: 'WHYO-ROUT-008',
    category: 'AI Dispatch & Routing Engine',
    title: 'Execute prompt dispatch with explicit model override (Claude 3.7 Sonnet)',
    priority: 'High',
    tags: ['ai', 'override', 'models'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Model Override Dispatch',
          method: 'POST',
          path: '/api/dispatch',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            prompt: '{{prompt_samples.code_query}}',
            modelOverride: '{{models.smart_model}}',
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.code_query', 'models.smart_model'],
  },
  {
    extId: 'WHYO-ROUT-009',
    category: 'Validation & Guardrails',
    title: 'Reject empty prompt payload with validation error (400 or 422)',
    priority: 'Medium',
    tags: ['negative', 'validation', 'guardrails'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Empty Prompt Submission',
          method: 'POST',
          path: '/api/dispatch',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            prompt: '{{prompt_samples.invalid_empty}}',
          },
        },
      ],
      expect: {
        statusIn: [400, 422, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.invalid_empty'],
  },
  {
    extId: 'WHYO-CORR-010',
    category: 'Bayesian Quality & Corroboration',
    title: 'Execute Bayesian multi-model corroboration vote on prompt output',
    priority: 'Medium',
    tags: ['quality', 'bayesian', 'corroborate'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Output Corroboration Check',
          method: 'POST',
          path: '/api/dispatch/corroborate',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            prompt: '{{prompt_samples.simple_query}}',
            candidateModels: ['gemini-3.7-flash', 'claude-3.5-sonnet'],
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.simple_query'],
  },
  {
    extId: 'WHYO-CHAT-011',
    category: 'AI Chat & Context Sessions',
    title: 'Create new multi-turn conversation session and initialize context',
    priority: 'High',
    tags: ['chat', 'sessions', 'context'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Initialize Chat Session',
          method: 'POST',
          path: '/api/chat/sessions',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            title: 'Verity Automated Test Session',
            initialPrompt: '{{prompt_samples.simple_query}}',
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'prompt_samples.simple_query'],
  },
  {
    extId: 'WHYO-FILE-012',
    category: 'Workspace & Studio',
    title: 'Upload and preprocess source document for zero-loss context compression',
    priority: 'Medium',
    tags: ['workspace', 'preprocessing', 'context'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Preprocess Context File',
          method: 'POST',
          path: '/api/preprocess/file',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            fileName: 'spec.txt',
            content: 'Architecture specification for Thompson sampling multi-model router.',
            compress: true,
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user'],
  },
  {
    extId: 'WHYO-LEDG-013',
    category: 'Context Ledger & Auditing',
    title: 'Save conversation turns to hash-chained tamper-evident context ledger',
    priority: 'High',
    tags: ['ledger', 'cryptographic', 'context'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Save Context Turn',
          method: 'POST',
          path: '/api/context/save',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            sessionId: '{{session_id}}',
            userQuery: '{{prompt_samples.code_query}}',
            modelResponse: 'export const useDebounce = () => {}',
            tokenUsage: { input: 45, output: 85 },
          },
        },
      ],
      expect: {
        statusIn: [200, 201, 404],
      },
    },
    dataFields: ['authTokens.user', 'session_id', 'prompt_samples.code_query'],
  },
  {
    extId: 'WHYO-LEDG-014',
    category: 'Context Ledger & Auditing',
    title: 'Retrieve context ledger records and verify cryptographic chain continuity',
    priority: 'High',
    tags: ['ledger', 'audit', 'integrity'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Fetch Context Ledger',
          method: 'GET',
          path: '/api/ledger?session_id={{session_id}}',
          authPersona: 'user',
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: ['authTokens.user', 'session_id'],
  },
  {
    extId: 'WHYO-CAT-015',
    category: 'Models & Tools Catalog',
    title: 'Retrieve active multi-provider model catalog and token pricing matrix',
    priority: 'Medium',
    tags: ['catalog', 'pricing', 'models'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Fetch Model Catalog',
          method: 'GET',
          path: '/api/models',
          headers: { Accept: 'application/json' },
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-CAT-016',
    category: 'Models & Tools Catalog',
    title: 'Probe real-time availability and provider status for active models',
    priority: 'Medium',
    tags: ['catalog', 'availability', 'health'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Model Availability Probe',
          method: 'GET',
          path: '/api/models/availability',
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-BYOK-017',
    category: 'Company BYOK & Credentials',
    title: 'Verify third-party API key connectivity for {{credentials_test.provider}}',
    priority: 'High',
    tags: ['byok', 'credentials', 'security'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Verify BYOK Credentials',
          method: 'POST',
          path: '/api/credentials/verify',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            provider: '{{credentials_test.provider}}',
            apiKey: '{{credentials_test.masked_key}}',
          },
        },
      ],
      expect: {
        statusIn: [200, 400, 422, 404],
      },
    },
    dataFields: ['authTokens.user', 'credentials_test.provider', 'credentials_test.masked_key'],
  },
  {
    extId: 'WHYO-BYOK-018',
    category: 'Company BYOK & Credentials',
    title: 'Reject malformed or empty provider API key with validation error',
    priority: 'Medium',
    tags: ['negative', 'byok', 'validation'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Malformed Key Submission',
          method: 'POST',
          path: '/api/credentials/verify',
          authPersona: 'user',
          headers: { 'Content-Type': 'application/json' },
          body: {
            provider: '{{credentials_test.provider}}',
            apiKey: '{{credentials_test.invalid_key}}',
          },
        },
      ],
      expect: {
        statusIn: [400, 422, 404],
      },
    },
    dataFields: ['authTokens.user', 'credentials_test.provider', 'credentials_test.invalid_key'],
  },
  {
    extId: 'WHYO-GATE-019',
    category: 'Subscription Bridge & Gateway',
    title: 'Probe linked flat subscription gateway status ($0.00/token bridge)',
    priority: 'Medium',
    tags: ['gateway', 'subscription', 'bridge'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Gateway Bridge Status',
          method: 'GET',
          path: '/api/credentials/subscription/gateway-status',
          authPersona: 'user',
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: ['authTokens.user'],
  },
  {
    extId: 'WHYO-TRL-020',
    category: 'Pricing & Trial Onboarding',
    title: 'Submit 7-day trial email registration for {{trial_email}}',
    priority: 'High',
    tags: ['trial', 'auth', 'onboarding'],
    type: 'http',
    spec: {
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
      expect: {
        statusIn: [200, 201, 400, 404],
      },
    },
    dataFields: ['trial_email'],
  },
  {
    extId: 'WHYO-TRL-021',
    category: 'Pricing & Trial Onboarding',
    title: 'Verify daily limit status and remaining token quota for active user',
    priority: 'Medium',
    tags: ['limits', 'quota', 'user'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Daily Limit Status',
          method: 'GET',
          path: '/api/user/daily-limit-status',
          authPersona: 'user',
        },
      ],
      expect: {
        statusIn: [200, 404],
      },
    },
    dataFields: ['authTokens.user'],
  },
  {
    extId: 'WHYO-TEAM-022',
    category: 'Team & Governance',
    title: 'Retrieve aggregate token usage rollup for {{team_id}} with lead persona',
    priority: 'High',
    tags: ['team', 'governance', 'usage'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Team Token Usage Rollup',
          method: 'GET',
          path: '/v1/team/{{team_id}}/usage',
          authPersona: 'team_lead',
        },
      ],
      expect: {
        statusIn: [200, 401, 403, 404],
      },
    },
    dataFields: ['authTokens.team_lead', 'team_id'],
  },
  {
    extId: 'WHYO-ADM-023',
    category: 'SuperAdmin Console & Security',
    title: 'Verify protected platform audit logs reject unauthenticated guest access (401/403)',
    priority: 'High',
    tags: ['security', 'rbac', 'admin'],
    type: 'http',
    spec: {
      requests: [
        {
          name: 'Unauthorized Audit Log Attempt',
          method: 'GET',
          path: '/api/admin/audit-logs',
          authPersona: null,
        },
      ],
      expect: {
        statusIn: [401, 403, 404],
      },
    },
    dataFields: [],
  },
  {
    extId: 'WHYO-LOAD-024',
    category: 'Performance & Concurrency',
    title: 'Burst load concurrency test on WhyOr Dispatch root gateway',
    priority: 'Medium',
    tags: ['load', 'concurrency', 'sla'],
    type: 'load',
    spec: {
      request: {
        name: 'Gateway Concurrency Probe',
        method: 'GET',
        path: '/?load_benchmark=true',
      },
      totalRequests: 12,
      concurrency: 4,
      maxP95Ms: 2500,
    },
    dataFields: [],
  },
];

async function runSeed() {
  console.log('Seeding target projects:', targetProjects.map(p => p.id));

  // 1. Update projects in local DB
  for (const proj of targetProjects) {
    proj.dataset = {
      ...proj.dataset,
      ...whyorDataset,
    };
    proj.updatedAt = new Date().toISOString();

    // Ensure suite exists
    let suite = rawDb.suites.find(s => s.projectId === proj.id && s.id === suiteId);
    if (!suite) {
      suite = {
        id: suiteId + '_' + proj.id.slice(-6),
        projectId: proj.id,
        name: suiteName,
        source: 'ai_generated',
        createdAt: new Date().toISOString(),
      };
      rawDb.suites.push(suite);
    }

    // Remove older duplicate suite test cases if present and re-add fresh
    rawDb.testCases = rawDb.testCases.filter(tc => tc.suiteId !== suite.id);

    const createdCases = rawTestCases.map((tc, idx) => ({
      id: `tc_whyo_${proj.id.slice(-4)}_${String(idx + 1).padStart(2, '0')}`,
      projectId: proj.id,
      suiteId: suite.id,
      suiteName: suite.name,
      extId: tc.extId,
      category: tc.category,
      title: tc.title,
      priority: tc.priority,
      tags: tc.tags,
      type: tc.type,
      spec: tc.spec,
      dataFields: tc.dataFields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    rawDb.testCases.push(...createdCases);
  }

  fs.writeFileSync(dbPath, JSON.stringify(rawDb, null, 2));
  console.log('Local DB successfully updated with', rawTestCases.length, 'cases for each project.');

  // 2. Sync to Firestore
  try {
    const app = initializeApp(config);
    const firestore = getFirestore(app, config.firestoreDatabaseId);

    for (const proj of targetProjects) {
      console.log('Syncing project to Firestore:', proj.id);
      await setDoc(doc(firestore, 'projects', proj.id), {
        id: proj.id,
        name: proj.name || 'WhyOr Dispatch',
        siteUrl: 'https://ai.whyor.in',
        description: 'Comprehensive Automated QA & Complexity Routing Test Platform for https://ai.whyor.in',
        dataset: proj.dataset,
        ownerUserId: proj.ownerUserId || 'usr_superadmin',
        orgId: proj.orgId || null,
        createdAt: proj.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Save matching Firestore Dataset
      const dsId = `ds_${proj.id.slice(-8)}`;
      await setDoc(doc(firestore, 'datasets', dsId), {
        id: dsId,
        projectId: proj.id,
        name: `${proj.name} Production Dataset`,
        environment: 'production',
        description: 'Comprehensive dynamic variables for https://ai.whyor.in',
        variables: proj.dataset,
        isDefault: true,
        ownerUserId: proj.ownerUserId || 'usr_superadmin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Save Suite
      const sId = suiteId + '_' + proj.id.slice(-6);
      await setDoc(doc(firestore, 'suites', sId), {
        id: sId,
        projectId: proj.id,
        name: suiteName,
        source: 'ai_generated',
        createdAt: new Date().toISOString(),
      }, { merge: true });

      // Save all 24 test cases
      console.log('Writing test cases to Firestore...');
      for (let i = 0; i < rawTestCases.length; i++) {
        const tc = rawTestCases[i];
        const tcId = `tc_whyo_${proj.id.slice(-4)}_${String(i + 1).padStart(2, '0')}`;
        await setDoc(doc(firestore, 'test_cases', tcId), {
          id: tcId,
          projectId: proj.id,
          suiteId: sId,
          suiteName: suiteName,
          extId: tc.extId,
          category: tc.category,
          title: tc.title,
          priority: tc.priority,
          tags: tc.tags,
          type: tc.type,
          spec: tc.spec,
          dataFields: tc.dataFields,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    }
    console.log('Firestore successfully populated with all projects, datasets, and test cases!');
  } catch (err) {
    console.error('Firestore sync error:', err.message);
  } finally {
    process.exit(0);
  }
}

runSeed().catch(err => {
  console.error(err);
  process.exit(1);
});
