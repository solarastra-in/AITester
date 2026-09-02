import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { requireAuth, AuthRequest } from '../auth.js';
import { parseStructuredJson, parseStructuredCsv, parseMarkdownTable, extractPlaceholders, getDotted } from '../specParser.js';
import { runTestCase } from '../genericRunner.js';
import { generateTestCases, analyzeTargetUrl } from '../aiGenerate.js';
import { chargeCredits, CREDIT_COST_PER_RUN, PREVIEW_DAILY_CAP } from '../billing.js';
import { Project, Suite, TestCase, TestRun } from '../types.js';

export const projectRouter = Router();
projectRouter.use(requireAuth);

interface ProjectRequest extends AuthRequest {
  project?: Project;
  dataset?: Record<string, any>;
}

function loadProject(req: ProjectRequest, res: Response, next: NextFunction) {
  const projectId = req.params.projectId || req.params.id;
  const project = db.findProjectById(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found.' });

  const isOwner = project.ownerUserId === req.user!.id;
  const isSameOrg = !!(project.orgId && project.orgId === req.user!.orgId);
  const isSuperAdmin = req.user!.role === 'platform_admin';

  if (!isOwner && !isSameOrg && !isSuperAdmin) {
    return res.status(403).json({ error: 'You are not authorized to access this project.' });
  }

  req.project = project;
  req.dataset = project.dataset || {};
  next();
}

// 1. List accessible projects
projectRouter.get('/', (req: AuthRequest, res: Response) => {
  const user = req.user!;
  let projects: Project[] = [];

  if (user.role === 'platform_admin') {
    projects = db.data.projects;
  } else if (user.orgId) {
    projects = db.data.projects.filter(p => p.orgId === user.orgId || p.ownerUserId === user.id);
  } else {
    projects = db.data.projects.filter(p => p.ownerUserId === user.id);
  }

  const enhanced = projects.map(p => {
    const suites = db.data.suites.filter(s => s.projectId === p.id);
    const suiteIds = suites.map(s => s.id);
    const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));
    const runs = db.data.testRuns.filter(r => r.projectId === p.id);

    return {
      ...p,
      suiteCount: suites.length,
      caseCount: cases.length,
      runCount: runs.length,
      lastRunAt: runs.length ? runs[0].ranAt : null,
    };
  });

  res.json(enhanced);
});

// 2. Create new project (Step 1: Upload Site URL)
projectRouter.post('/', (req: AuthRequest, res: Response) => {
  const { name, siteUrl, description } = req.body;
  if (!name || !siteUrl) {
    return res.status(400).json({ error: 'Project name and Target Site URL are required.' });
  }

  let formattedUrl = siteUrl.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const projectId = `proj_${uuidv4().slice(0, 8)}`;
  const newProject: Project = {
    id: projectId,
    ownerUserId: req.user!.id,
    orgId: req.user!.orgId || null,
    name: name.trim(),
    siteUrl: formattedUrl,
    description: description ? description.trim() : `Automated testing platform for ${formattedUrl}`,
    dataset: {
      baseUrl: formattedUrl,
      authTokens: {
        guest: '',
        user: '',
        admin: '',
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.data.projects.unshift(newProject);
  db.addAuditLog(req.user!.id, req.user!.email, 'PROJECT_CREATED', `Created testing project "${name}" targeting URL ${formattedUrl}`);
  db.save();

  res.status(201).json(newProject);
});

// 3. Get Project details with suites and statistics
projectRouter.get('/:id', loadProject, (req: ProjectRequest, res: Response) => {
  const project = req.project!;
  const suites = db.data.suites.filter(s => s.projectId === project.id);
  const suiteIds = suites.map(s => s.id);
  const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));

  res.json({
    ...project,
    suites,
    caseCount: cases.length,
  });
});

// 4. Dataset management
projectRouter.get('/:id/dataset', loadProject, (req: ProjectRequest, res: Response) => {
  res.json(req.dataset);
});

projectRouter.put('/:id/dataset', loadProject, (req: ProjectRequest, res: Response) => {
  req.project!.dataset = req.body || {};
  req.project!.updatedAt = new Date().toISOString();
  db.save();
  res.json(req.project!.dataset);
});

projectRouter.patch('/:id/dataset', loadProject, (req: ProjectRequest, res: Response) => {
  const { path: dottedPath, value } = req.body;
  if (!dottedPath) return res.status(400).json({ error: 'path is required' });

  const dataset = req.dataset || {};
  const parts = dottedPath.split('.');
  let cur = dataset;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;

  req.project!.dataset = dataset;
  req.project!.updatedAt = new Date().toISOString();
  db.save();

  res.json(dataset);
});

// 5. Ingest test cases (Structured JSON, CSV, or Markdown QA plan)
projectRouter.post('/:id/suites/upload', loadProject, (req: ProjectRequest, res: Response) => {
  const { name, format, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Test case content is required.' });

  try {
    let parsedDrafts;
    if (format === 'json') parsedDrafts = parseStructuredJson(content);
    else if (format === 'csv') parsedDrafts = parseStructuredCsv(content);
    else parsedDrafts = parseMarkdownTable(content, name || 'Imported QA Plan');

    if (!parsedDrafts.length) {
      return res.status(400).json({ error: 'No test cases could be parsed from the provided input.' });
    }

    const suiteId = `suite_${uuidv4().slice(0, 8)}`;
    const newSuite: Suite = {
      id: suiteId,
      projectId: req.project!.id,
      name: name ? name.trim() : `Imported Suite (${parsedDrafts.length} Cases)`,
      source: 'uploaded',
      createdAt: new Date().toISOString(),
    };

    db.data.suites.push(newSuite);

    const createdCases: TestCase[] = parsedDrafts.map((draft, idx) => ({
      id: `tc_${uuidv4().slice(0, 8)}`,
      suiteId,
      extId: draft.ext_id || `TC-${String(idx + 1).padStart(3, '0')}`,
      category: draft.category,
      title: draft.title,
      priority: draft.priority,
      tags: draft.tags ? draft.tags.split(',').filter(Boolean) : [],
      type: draft.type,
      spec: draft.spec,
      dataFields: draft.dataFields || [],
      createdAt: new Date().toISOString(),
    }));

    db.data.testCases.push(...createdCases);
    db.addAuditLog(req.user!.id, req.user!.email, 'SUITE_UPLOADED', `Uploaded test suite "${newSuite.name}" with ${createdCases.length} cases.`);
    db.save();

    res.status(201).json({
      suiteId,
      suiteName: newSuite.name,
      caseCount: createdCases.length,
      manualCount: createdCases.filter(c => c.type === 'manual').length,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to parse upload: ${err.message}` });
  }
});

// 5b. Analyze URL & Auto-form test plan / description
projectRouter.post('/analyze-url', async (req: AuthRequest, res: Response) => {
  const { url, hint } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Please provide a valid target URL to analyze.' });
  }
  try {
    const analysis = await analyzeTargetUrl(url.trim(), hint);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to analyze target URL.' });
  }
});

projectRouter.post('/:id/analyze-url', loadProject, async (req: ProjectRequest, res: Response) => {
  const { url, hint } = req.body;
  const targetUrl = (url && typeof url === 'string' && url.trim()) || req.project!.siteUrl;
  try {
    const analysis = await analyzeTargetUrl(targetUrl, hint);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to analyze target URL.' });
  }
});

// 6. AI Generate test cases via Gemini
projectRouter.post('/:id/suites/generate', loadProject, async (req: ProjectRequest, res: Response) => {
  const { name, description, existingPlanText, targetUrl } = req.body;

  const effectiveUrl = (targetUrl && typeof targetUrl === 'string' && targetUrl.trim())
    ? targetUrl.trim()
    : req.project!.siteUrl;

  // If user provided a different URL for the project, update project siteUrl
  if (effectiveUrl && effectiveUrl !== req.project!.siteUrl) {
    req.project!.siteUrl = effectiveUrl;
    db.save();
  }

  try {
    const parsedDrafts = await generateTestCases({
      siteUrl: effectiveUrl,
      description,
      existingPlanText,
    });

    if (!parsedDrafts.length) {
      return res.status(502).json({ error: 'The AI model returned no parseable test cases.' });
    }

    const suiteId = `suite_${uuidv4().slice(0, 8)}`;
    const newSuite: Suite = {
      id: suiteId,
      projectId: req.project!.id,
      name: name ? name.trim() : `AI Generated Suite (${new Date().toLocaleDateString()})`,
      source: 'ai_generated',
      createdAt: new Date().toISOString(),
    };

    db.data.suites.push(newSuite);

    const createdCases: TestCase[] = parsedDrafts.map((draft, idx) => ({
      id: `tc_${uuidv4().slice(0, 8)}`,
      suiteId,
      extId: draft.ext_id || `AI-${String(idx + 1).padStart(3, '0')}`,
      category: draft.category,
      title: draft.title,
      priority: draft.priority,
      tags: draft.tags ? draft.tags.split(',').filter(Boolean) : [],
      type: draft.type,
      spec: draft.spec,
      dataFields: draft.dataFields || [],
      createdAt: new Date().toISOString(),
    }));

    db.data.testCases.push(...createdCases);
    db.addAuditLog(req.user!.id, req.user!.email, 'AI_SUITE_GENERATED', `Generated AI test suite "${newSuite.name}" with ${createdCases.length} cases.`);
    db.save();

    res.status(201).json({
      suiteId,
      suiteName: newSuite.name,
      caseCount: createdCases.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Generation failed.' });
  }
});

// 7. Get all test cases for project with last run results & missing fields discovery
projectRouter.get('/:id/cases', loadProject, (req: ProjectRequest, res: Response) => {
  const project = req.project!;
  const suites = db.data.suites.filter(s => s.projectId === project.id);
  const suiteMap = Object.fromEntries(suites.map(s => [s.id, s.name]));
  const suiteIds = suites.map(s => s.id);

  const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));
  const runs = db.data.testRuns.filter(r => r.projectId === project.id);

  // Group latest run per case
  const latestRunByCase: Record<string, TestRun> = {};
  runs.forEach(r => {
    if (!latestRunByCase[r.testCaseId] || new Date(r.ranAt) > new Date(latestRunByCase[r.testCaseId].ranAt)) {
      latestRunByCase[r.testCaseId] = r;
    }
  });

  const dataset = project.dataset || {};

  const enrichedCases = cases.map(c => {
    // Check missing fields
    const missingDataFields = (c.dataFields || []).filter(f => {
      const val = getDotted(dataset, f, null);
      return val === null || val === '';
    });

    return {
      ...c,
      suiteName: suiteMap[c.suiteId] || 'Default Suite',
      missingDataFields,
      lastResult: latestRunByCase[c.id] || null,
    };
  });

  // Calculate project-wide missing data requirements
  const allNeededFields = new Set<string>();
  cases.forEach(c => (c.dataFields || []).forEach(f => allNeededFields.add(f)));

  const missingProjectFields = Array.from(allNeededFields).filter(f => {
    const val = getDotted(dataset, f, null);
    return val === null || val === '';
  });

  res.json({
    cases: enrichedCases,
    dataset,
    allNeededFields: Array.from(allNeededFields),
    missingProjectFields,
  });
});

// 8. Execute single test case (Preview vs Hosted)
function getPreviewRunsToday(projectId: string): number {
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return db.data.testRuns.filter(r => r.projectId === projectId && r.executedBy === 'preview' && r.ranAt > oneDayAgo).length;
}

projectRouter.post('/:id/cases/:caseId/run', loadProject, async (req: ProjectRequest, res: Response) => {
  const mode: 'preview' | 'hosted' = req.body.mode === 'hosted' ? 'hosted' : 'preview';
  const testCase = db.data.testCases.find(c => c.id === req.params.caseId);
  if (!testCase) return res.status(404).json({ error: 'Test case not found.' });

  if (testCase.type === 'manual') {
    return res.status(400).json({ error: 'Manual test case cannot be executed via automated runner. Record manual verdict instead.' });
  }

  // Check preview limit
  if (mode === 'preview') {
    const count = getPreviewRunsToday(req.project!.id);
    if (count >= PREVIEW_DAILY_CAP) {
      return res.status(429).json({
        error: `Daily free preview limit reached (${PREVIEW_DAILY_CAP}/day). Upgrade to Cloud Hosted execution or download the standalone Docker package to run unlimited tests for free!`,
        capReached: true,
      });
    }
  }

  // Charge credits for hosted mode
  let creditsCharged = 0;
  if (mode === 'hosted') {
    try {
      const billingScope = req.project!.orgId ? { orgId: req.project!.orgId } : { userId: req.user!.id };
      chargeCredits({
        ...billingScope,
        amount: CREDIT_COST_PER_RUN,
        reason: `Hosted Cloud Execution: ${testCase.extId} on ${req.project!.name}`,
      });
      creditsCharged = CREDIT_COST_PER_RUN;
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_CREDITS') {
        return res.status(402).json({ error: err.message, insufficientCredits: true });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  let result;
  try {
    result = await runTestCase(testCase, req.dataset || {}, req.project!.siteUrl);
  } catch (err: any) {
    result = {
      pass: false,
      message: `Execution Runner Exception: ${err.message}`,
      type: testCase.type,
    };
  }

  const runRecord: TestRun = {
    id: `run_${uuidv4().slice(0, 8)}`,
    projectId: req.project!.id,
    testCaseId: testCase.id,
    ranAt: new Date().toISOString(),
    pass: result.pass,
    message: result.message,
    executedBy: mode,
    creditsCharged,
    runByUserId: req.user!.id,
    requests: result.requests,
    stats: result.stats,
  };

  db.data.testRuns.unshift(runRecord);
  db.save();

  res.json({
    testRun: runRecord,
    creditsCharged,
    mode,
  });
});

// 9. Run all automated tests in project
projectRouter.post('/:id/run-all', loadProject, async (req: ProjectRequest, res: Response) => {
  const mode: 'preview' | 'hosted' = req.body.mode === 'hosted' ? 'hosted' : 'preview';
  const suites = db.data.suites.filter(s => s.projectId === req.project!.id);
  const suiteIds = suites.map(s => s.id);
  const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId) && c.type !== 'manual');

  if (!cases.length) {
    return res.status(400).json({ error: 'No automated test cases found in this project.' });
  }

  const results: TestRun[] = [];

  for (const testCase of cases) {
    if (mode === 'preview' && getPreviewRunsToday(req.project!.id) >= PREVIEW_DAILY_CAP) {
      break;
    }

    let creditsCharged = 0;
    if (mode === 'hosted') {
      try {
        const billingScope = req.project!.orgId ? { orgId: req.project!.orgId } : { userId: req.user!.id };
        chargeCredits({
          ...billingScope,
          amount: CREDIT_COST_PER_RUN,
          reason: `Hosted Batch Execution: ${testCase.extId}`,
        });
        creditsCharged = CREDIT_COST_PER_RUN;
      } catch (err) {
        break; // Stop batch if credits exhausted
      }
    }

    let result;
    try {
      result = await runTestCase(testCase, req.dataset || {}, req.project!.siteUrl);
    } catch (err: any) {
      result = {
        pass: false,
        message: `Runner error: ${err.message}`,
        type: testCase.type,
      };
    }

    const runRecord: TestRun = {
      id: `run_${uuidv4().slice(0, 8)}`,
      projectId: req.project!.id,
      testCaseId: testCase.id,
      ranAt: new Date().toISOString(),
      pass: result.pass,
      message: result.message,
      executedBy: mode,
      creditsCharged,
      runByUserId: req.user!.id,
      requests: result.requests,
      stats: result.stats,
    };

    db.data.testRuns.unshift(runRecord);
    results.push(runRecord);
  }

  db.save();
  res.json({ runs: results, count: results.length });
});

// 10. Record manual test verdict
projectRouter.post('/:id/cases/:caseId/manual-result', loadProject, (req: ProjectRequest, res: Response) => {
  const testCase = db.data.testCases.find(c => c.id === req.params.caseId);
  if (!testCase) return res.status(404).json({ error: 'Test case not found.' });

  const { pass, notes } = req.body;
  const runRecord: TestRun = {
    id: `run_${uuidv4().slice(0, 8)}`,
    projectId: req.project!.id,
    testCaseId: testCase.id,
    ranAt: new Date().toISOString(),
    pass: !!pass,
    message: notes || 'Manual verification completed.',
    executedBy: 'manual',
    creditsCharged: 0,
    runByUserId: req.user!.id,
  };

  db.data.testRuns.unshift(runRecord);
  db.save();

  res.json(runRecord);
});

// 11. Delete suite
projectRouter.delete('/:id/suites/:suiteId', loadProject, (req: ProjectRequest, res: Response) => {
  db.data.testCases = db.data.testCases.filter(c => c.suiteId !== req.params.suiteId);
  db.data.suites = db.data.suites.filter(s => s.id !== req.params.suiteId);
  db.save();
  res.json({ ok: true });
});

// 12. Delete project
projectRouter.delete('/:id', loadProject, (req: ProjectRequest, res: Response) => {
  const projectId = req.project!.id;
  const suites = db.data.suites.filter(s => s.projectId === projectId);
  const suiteIds = suites.map(s => s.id);

  db.data.testCases = db.data.testCases.filter(c => !suiteIds.includes(c.suiteId));
  db.data.testRuns = db.data.testRuns.filter(r => r.projectId !== projectId);
  db.data.suites = db.data.suites.filter(s => s.projectId !== projectId);
  db.data.projects = db.data.projects.filter(p => p.id !== projectId);
  db.save();

  res.json({ ok: true, message: 'Project deleted successfully.' });
});

// 13. Export test results (CSV or JSON)
projectRouter.get('/:id/export', loadProject, (req: ProjectRequest, res: Response) => {
  const project = req.project!;
  const suites = db.data.suites.filter(s => s.projectId === project.id);
  const suiteIds = suites.map(s => s.id);
  const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));
  const runs = db.data.testRuns.filter(r => r.projectId === project.id);

  const latestRunByCase: Record<string, TestRun> = {};
  runs.forEach(r => {
    if (!latestRunByCase[r.testCaseId] || new Date(r.ranAt) > new Date(latestRunByCase[r.testCaseId].ranAt)) {
      latestRunByCase[r.testCaseId] = r;
    }
  });

  const rows = cases.map(c => {
    const r = latestRunByCase[c.id];
    return {
      id: c.extId,
      category: c.category,
      title: c.title,
      priority: c.priority,
      type: c.type,
      verdict: r ? (r.pass ? 'PASS' : 'FAIL') : 'NOT RUN',
      executedBy: r ? r.executedBy : 'N/A',
      ranAt: r ? r.ranAt : '',
      message: r ? r.message : '',
    };
  });

  if (req.query.format === 'csv') {
    const header = ['id', 'category', 'title', 'priority', 'type', 'verdict', 'executedBy', 'ranAt', 'message'].join(',');
    const body = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/\W+/g, '_')}-report.csv"`);
    return res.send(`${header}\n${body}`);
  }

  res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/\W+/g, '_')}-report.json"`);
  res.json({
    project: project.name,
    siteUrl: project.siteUrl,
    exportedAt: new Date().toISOString(),
    totalCases: cases.length,
    rows,
  });
});
