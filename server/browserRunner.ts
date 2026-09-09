import { TestCase, BrowserStep, TestRun } from './types.js';
import { resolveTemplates } from './specParser.js';
import { assertPublicUrl, SsrfBlockedError } from './ssrfGuard.js';

const STEP_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 45_000;

/**
 * Minimal interface a single browser page needs to expose for the step
 * runner below. Kept deliberately small and framework-agnostic so the
 * orchestration logic (step sequencing, timeouts, continueOnFailure,
 * building the report) can be unit-tested against a fake implementation of
 * this interface — without needing a real, launched browser — while
 * createPlaywrightDriver() below provides the real implementation used in
 * production.
 */
export interface BrowserPageDriver {
  goto(url: string, timeoutMs: number): Promise<{ status: number | null }>;
  click(selector: string, timeoutMs: number): Promise<void>;
  fill(selector: string, value: string, timeoutMs: number): Promise<void>;
  selectOption(selector: string, value: string, timeoutMs: number): Promise<void>;
  check(selector: string, timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs: number): Promise<void>;
  waitForLoadState(timeoutMs: number): Promise<void>;
  isVisible(selector: string): Promise<boolean>;
  textContent(selector: string): Promise<string | null>;
  currentUrl(): string;
  screenshot(): Promise<string | null>; // base64 data URL, or null if unsupported/failed
  /** Same-origin links visible on the current page, for assertNoBrokenLinks. */
  getSameOriginLinks(): Promise<string[]>;
  /** Checks a single URL's status without a full navigation (a lightweight HEAD/GET via the browser's own request context, so it shares cookies/session). */
  checkLinkStatus(url: string): Promise<number | null>;
  /** Console errors accumulated since this page was created. */
  getConsoleErrors(): string[];
  close(): Promise<void>;
}

export interface BugFound {
  type: 'broken_link' | 'console_error' | 'failed_request' | 'slow_page_load';
  detail: string;
  url?: string;
}

export interface BrowserStepResult {
  stepId: string;
  action: string;
  description?: string;
  pass: boolean;
  durationMs: number;
  error: string | null;
  screenshotPath?: string;
}

export interface BrowserRunResult {
  pass: boolean;
  message: string;
  browserSteps: BrowserStepResult[];
  bugsFound: BugFound[];
}

/**
 * Runs one 'browser' TestCase's step sequence against the given page
 * driver. This function contains all the orchestration logic (sequencing,
 * timeouts, error handling, continueOnFailure, missing-data pre-flight,
 * report assembly) and is deliberately decoupled from how the page driver
 * is created — see runBrowserTestCase() below for the real,
 * Playwright-backed entry point, and tests/browserRunner.test.ts for how
 * this function is tested directly against a fake driver.
 */
export async function executeBrowserSteps(
  spec: { startPath: string; steps: BrowserStep[]; requiresUserSuppliedData?: string[] },
  dataset: Record<string, any>,
  driver: BrowserPageDriver
): Promise<BrowserRunResult> {
  const browserSteps: BrowserStepResult[] = [];
  const bugsFound: BugFound[] = [];

  // Pre-flight: refuse to silently run with missing required test data —
  // resolveTemplates() would otherwise substitute an empty string for a
  // missing {{password}}-style placeholder and the test would fail later
  // with a confusing, indirect error (e.g. "login failed") instead of the
  // real, actionable one.
  const missingData = (spec.requiresUserSuppliedData || []).filter(key => {
    const v = dataset[key];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missingData.length > 0) {
    return {
      pass: false,
      message: `Missing required test data: ${missingData.join(', ')}. Add these values in the dataset configurator before running this test.`,
      browserSteps: [],
      bugsFound: [],
    };
  }

  let overallPass = true;
  const testStartedAt = Date.now();

  for (const step of spec.steps) {
    if (Date.now() - testStartedAt > TEST_TIMEOUT_MS) {
      browserSteps.push({
        stepId: step.id,
        action: step.action,
        description: step.description,
        pass: false,
        durationMs: 0,
        error: `Test exceeded overall ${TEST_TIMEOUT_MS}ms timeout budget — remaining steps skipped.`,
      });
      overallPass = false;
      break;
    }

    const stepStart = Date.now();
    let stepPass = true;
    let stepError: string | null = null;

    try {
      switch (step.action) {
        case 'navigate': {
          const url = resolveTemplates(step.url || '', dataset);
          await assertPublicUrl(url);
          const res = await driver.goto(url, STEP_TIMEOUT_MS);
          if (res.status !== null && res.status >= 400) {
            stepPass = false;
            stepError = `Navigation returned HTTP ${res.status}`;
          }
          break;
        }
        case 'click':
          await driver.click(step.selector || '', STEP_TIMEOUT_MS);
          break;
        case 'fill':
          await driver.fill(step.selector || '', resolveTemplates(step.value || '', dataset), STEP_TIMEOUT_MS);
          break;
        case 'select':
          await driver.selectOption(step.selector || '', resolveTemplates(step.value || '', dataset), STEP_TIMEOUT_MS);
          break;
        case 'check':
          await driver.check(step.selector || '', STEP_TIMEOUT_MS);
          break;
        case 'waitForSelector':
          await driver.waitForSelector(step.selector || '', STEP_TIMEOUT_MS);
          break;
        case 'waitForNavigation':
          await driver.waitForLoadState(STEP_TIMEOUT_MS);
          break;
        case 'assertVisible': {
          const visible = await driver.isVisible(step.selector || '');
          if (!visible) {
            stepPass = false;
            stepError = `Element "${step.selector}" is not visible.`;
          }
          break;
        }
        case 'assertText': {
          const text = await driver.textContent(step.selector || '');
          const expected = resolveTemplates(step.value || '', dataset);
          if (!text || !text.includes(expected)) {
            stepPass = false;
            stepError = `Expected text containing "${expected}", got "${text ?? '(none)'}".`;
          }
          break;
        }
        case 'assertUrl': {
          const expected = resolveTemplates(step.value || '', dataset);
          const actual = driver.currentUrl();
          if (!actual.includes(expected) && !expected.includes(actual)) {
            stepPass = false;
            stepError = `Expected URL to relate to "${expected}", got "${actual}".`;
          }
          break;
        }
        case 'assertNoConsoleErrors': {
          const errors = driver.getConsoleErrors();
          if (errors.length > 0) {
            stepPass = false;
            stepError = `${errors.length} console error(s): ${errors.slice(0, 3).join(' | ')}`;
            for (const e of errors) {
              bugsFound.push({ type: 'console_error', detail: e, url: driver.currentUrl() });
            }
          }
          break;
        }
        case 'assertNoBrokenLinks': {
          const links = await driver.getSameOriginLinks();
          const broken: string[] = [];
          for (const link of links.slice(0, 25)) {
            // Cap at 25 per page — enough for a real signal without turning
            // one step into an unbounded scan of every link on a large page.
            try {
              await assertPublicUrl(link);
            } catch {
              continue; // an internal/blocked link was already excluded from the page's own same-origin set in practice, but skip defensively
            }
            const status = await driver.checkLinkStatus(link);
            if (status === null || status >= 400) {
              broken.push(`${link} (${status ?? 'no response'})`);
              bugsFound.push({ type: 'broken_link', detail: `Broken link: ${link} returned ${status ?? 'no response'}`, url: link });
            }
          }
          if (broken.length > 0) {
            stepPass = false;
            stepError = `${broken.length} broken link(s): ${broken.slice(0, 3).join(', ')}`;
          }
          break;
        }
        case 'screenshot':
          break; // handled below unconditionally so we get one even on failure
        default:
          stepPass = false;
          stepError = `Unknown step action: ${step.action}`;
      }
    } catch (err: any) {
      stepPass = false;
      stepError = err?.message || String(err);
    }

    const durationMs = Date.now() - stepStart;
    if (durationMs > 8000) {
      bugsFound.push({ type: 'slow_page_load', detail: `Step "${step.description || step.action}" took ${durationMs}ms`, url: driver.currentUrl() });
    }

    let screenshotPath: string | undefined;
    if (step.action === 'screenshot' || !stepPass) {
      try {
        const shot = await driver.screenshot();
        if (shot) screenshotPath = shot;
      } catch {
        // Screenshot capture failing is never itself a test failure.
      }
    }

    browserSteps.push({
      stepId: step.id,
      action: step.action,
      description: step.description,
      pass: stepPass,
      durationMs,
      error: stepError,
      screenshotPath,
    });

    if (!stepPass) {
      overallPass = false;
      if (!step.continueOnFailure) break;
    }
  }

  const failedSteps = browserSteps.filter(s => !s.pass);
  const message = overallPass
    ? `All ${browserSteps.length} browser step(s) passed.`
    : `${failedSteps.length} of ${browserSteps.length} step(s) failed: ${failedSteps.map(s => s.description || s.action).join(', ')}`;

  return { pass: overallPass, message, browserSteps, bugsFound };
}

/**
 * Real, Playwright-backed driver factory. Not exercised by this repo's own
 * test suite — this environment cannot download Playwright's browser
 * binary (blocked network egress), so this function's correctness rests on
 * Playwright's documented API rather than an executed test here. The
 * orchestration logic above (executeBrowserSteps) IS fully tested against a
 * fake driver in tests/browserRunner.test.ts.
 */
export async function createPlaywrightDriver(startUrl: string): Promise<BrowserPageDriver> {
  await assertPublicUrl(startUrl);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Verity-Browser-Test-Runner/1.0 (Automated QA Engine)',
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', err => {
    consoleErrors.push(`Uncaught exception: ${err.message}`.slice(0, 300));
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  };

  return {
    async goto(url, timeoutMs) {
      await assertPublicUrl(url);
      const res = await page.goto(url, { timeout: timeoutMs, waitUntil: 'load' });
      return { status: res ? res.status() : null };
    },
    async click(selector, timeoutMs) {
      await page.locator(selector).first().click({ timeout: timeoutMs });
    },
    async fill(selector, value, timeoutMs) {
      await page.locator(selector).first().fill(value, { timeout: timeoutMs });
    },
    async selectOption(selector, value, timeoutMs) {
      await page.locator(selector).first().selectOption(value, { timeout: timeoutMs });
    },
    async check(selector, timeoutMs) {
      await page.locator(selector).first().check({ timeout: timeoutMs });
    },
    async waitForSelector(selector, timeoutMs) {
      await page.waitForSelector(selector, { timeout: timeoutMs });
    },
    async waitForLoadState(timeoutMs) {
      await page.waitForLoadState('load', { timeout: timeoutMs });
    },
    async isVisible(selector) {
      return page.locator(selector).first().isVisible();
    },
    async textContent(selector) {
      return page.locator(selector).first().textContent();
    },
    currentUrl() {
      return page.url();
    },
    async screenshot() {
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        return null;
      }
    },
    async getSameOriginLinks() {
      try {
        const origin = new URL(page.url()).origin;
        const hrefs: string[] = await page.locator('a[href]').evaluateAll((els: any[]) => els.map(e => e.href));
        return Array.from(new Set(hrefs.filter(h => {
          try {
            return new URL(h).origin === origin;
          } catch {
            return false;
          }
        })));
      } catch {
        return [];
      }
    },
    async checkLinkStatus(url) {
      try {
        const res = await context.request.get(url, { timeout: 6000 });
        return res.status();
      } catch {
        return null;
      }
    },
    getConsoleErrors() {
      return [...consoleErrors];
    },
    close,
  };
}

/**
 * Full entry point: launches a real browser, runs the test case's steps,
 * tears the browser down, and returns a result shaped for TestRun. Mirrors
 * genericRunner.ts's runTestCase() signature so the project routes can call
 * either runner interchangeably based on TestCase.type.
 */
export async function runBrowserTestCase(
  testCase: Pick<TestCase, 'type' | 'spec'>,
  dataset: Record<string, any>,
  siteUrl: string,
  options?: { token?: string } | string
): Promise<BrowserRunResult> {
  if (!testCase.spec.browser) {
    return { pass: false, message: 'This test case has no browser spec.', browserSteps: [], bugsFound: [] };
  }

  const startUrl = resolveTemplates(testCase.spec.browser.startPath || siteUrl, dataset);
  let driver: BrowserPageDriver;
  try {
    driver = await createPlaywrightDriver(startUrl);
  } catch (err: any) {
    if (err instanceof SsrfBlockedError) {
      return { pass: false, message: err.message, browserSteps: [], bugsFound: [] };
    }
    return { pass: false, message: `Could not launch browser: ${err?.message || String(err)}`, browserSteps: [], bugsFound: [] };
  }

  try {
    return await executeBrowserSteps(testCase.spec.browser, dataset, driver);
  } finally {
    await driver.close();
  }
}
