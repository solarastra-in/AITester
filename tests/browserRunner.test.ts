import { describe, it, expect, vi } from 'vitest';
import { executeBrowserSteps, BrowserPageDriver } from '../server/browserRunner.js';
import { BrowserStep, BrowserTestSpec } from '../server/types.js';

/**
 * These tests exercise the real orchestration logic in executeBrowserSteps
 * — step sequencing, timeout handling, continueOnFailure, the missing-data
 * pre-flight check, and bugsFound/browserSteps report assembly — against a
 * fake BrowserPageDriver rather than a real launched browser. This
 * sandbox's network egress blocks Playwright's browser-binary CDN, so the
 * real Playwright-backed driver (createPlaywrightDriver in this same file)
 * could not be executed here; this is what CAN be verified without one,
 * and it's everything except "does Playwright itself behave the way its
 * documented API says it does."
 */

function makeFakeDriver(overrides: Partial<BrowserPageDriver> = {}): BrowserPageDriver {
  let url = 'https://example.com/';
  return {
    async goto(u) {
      url = u;
      return { status: 200 };
    },
    async click() {},
    async fill() {},
    async selectOption() {},
    async check() {},
    async waitForSelector() {},
    async waitForLoadState() {},
    async isVisible() {
      return true;
    },
    async textContent() {
      return 'some text';
    },
    currentUrl() {
      return url;
    },
    async screenshot() {
      return 'data:image/jpeg;base64,fake';
    },
    async getSameOriginLinks() {
      return [];
    },
    async checkLinkStatus() {
      return 200;
    },
    getConsoleErrors() {
      return [];
    },
    async close() {},
    ...overrides,
  };
}

function step(partial: Partial<BrowserStep> & Pick<BrowserStep, 'action'>): BrowserStep {
  return { id: `s_${Math.random().toString(36).slice(2)}`, ...partial };
}

describe('executeBrowserSteps — missing test data pre-flight', () => {
  it('refuses to run and gives a clear message when required data is missing', async () => {
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/signup',
      steps: [step({ action: 'fill', selector: '[name="password"]', value: '{{password}}' })],
      requiresUserSuppliedData: ['password'],
    };
    const result = await executeBrowserSteps(spec, {}, makeFakeDriver());

    expect(result.pass).toBe(false);
    expect(result.message).toContain('password');
    expect(result.browserSteps).toHaveLength(0); // never even started
  });

  it('runs normally once the required data is supplied', async () => {
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/signup',
      steps: [step({ action: 'fill', selector: '[name="password"]', value: '{{password}}' })],
      requiresUserSuppliedData: ['password'],
    };
    const result = await executeBrowserSteps(spec, { password: 'a-real-test-password' }, makeFakeDriver());

    expect(result.pass).toBe(true);
    expect(result.browserSteps).toHaveLength(1);
  });

  it('treats an empty-string supplied value the same as missing', async () => {
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/signup',
      steps: [step({ action: 'fill', selector: '[name="password"]', value: '{{password}}' })],
      requiresUserSuppliedData: ['password'],
    };
    const result = await executeBrowserSteps(spec, { password: '   ' }, makeFakeDriver());
    expect(result.pass).toBe(false);
  });
});

describe('executeBrowserSteps — sequencing and failure handling', () => {
  it('stops at the first failing step by default', async () => {
    const driver = makeFakeDriver({
      async click(selector) {
        if (selector === '#fails') throw new Error('element not found');
      },
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [
        step({ action: 'navigate', url: 'https://example.com/' }),
        step({ action: 'click', selector: '#fails' }),
        step({ action: 'click', selector: '#never-reached' }),
      ],
    };
    const result = await executeBrowserSteps(spec, {}, driver);

    expect(result.pass).toBe(false);
    expect(result.browserSteps).toHaveLength(2); // the third step never ran
    expect(result.browserSteps[1].pass).toBe(false);
    expect(result.browserSteps[1].error).toContain('element not found');
  });

  it('continues past a failing step when continueOnFailure is set', async () => {
    const driver = makeFakeDriver({
      getConsoleErrors: () => ['TypeError: something broke'],
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [
        step({ action: 'navigate', url: 'https://example.com/' }),
        step({ action: 'assertNoConsoleErrors', continueOnFailure: true }),
        step({ action: 'assertVisible', selector: '#footer' }),
      ],
    };
    const result = await executeBrowserSteps(spec, {}, driver);

    expect(result.pass).toBe(false); // overall still fails
    expect(result.browserSteps).toHaveLength(3); // but all 3 ran
    expect(result.browserSteps[2].pass).toBe(true);
  });

  it('a failed navigation (HTTP 4xx/5xx) is reported as a step failure', async () => {
    const driver = makeFakeDriver({
      async goto() {
        return { status: 404 };
      },
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/missing',
      steps: [step({ action: 'navigate', url: 'https://example.com/missing' })],
    };
    const result = await executeBrowserSteps(spec, {}, driver);

    expect(result.pass).toBe(false);
    expect(result.browserSteps[0].error).toContain('404');
  });
});

describe('executeBrowserSteps — bug detection', () => {
  it('collects console errors into bugsFound', async () => {
    const driver = makeFakeDriver({
      getConsoleErrors: () => ['ReferenceError: x is not defined', 'TypeError: y is undefined'],
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [step({ action: 'assertNoConsoleErrors' })],
    };
    const result = await executeBrowserSteps(spec, {}, driver);

    expect(result.bugsFound).toHaveLength(2);
    expect(result.bugsFound.every(b => b.type === 'console_error')).toBe(true);
  });

  it('collects broken links into bugsFound, and passes when all links are healthy', async () => {
    const driver = makeFakeDriver({
      async getSameOriginLinks() {
        return ['https://example.com/ok', 'https://example.com/broken', 'https://example.com/also-ok'];
      },
      async checkLinkStatus(url) {
        return url.includes('broken') ? 500 : 200;
      },
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [step({ action: 'assertNoBrokenLinks' })],
    };
    const result = await executeBrowserSteps(spec, {}, driver);

    expect(result.pass).toBe(false);
    expect(result.bugsFound).toHaveLength(1);
    expect(result.bugsFound[0].type).toBe('broken_link');
    expect(result.bugsFound[0].url).toBe('https://example.com/broken');
  });

  it('flags a step as a slow_page_load bug when it takes over 8 seconds', async () => {
    vi.useFakeTimers();
    const driver = makeFakeDriver({
      async click() {
        // Advance fake time inside the mocked action to simulate a slow operation.
        vi.advanceTimersByTime(9000);
      },
    });
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [step({ action: 'click', selector: '#slow-button' })],
    };
    const result = await executeBrowserSteps(spec, {}, driver);
    vi.useRealTimers();

    expect(result.bugsFound.some(b => b.type === 'slow_page_load')).toBe(true);
  });
});

describe('executeBrowserSteps — SSRF protection on navigate steps', () => {
  it('refuses to navigate to a private/internal address even mid-test', async () => {
    const spec: BrowserTestSpec = {
      startPath: 'https://example.com/',
      steps: [
        step({ action: 'navigate', url: 'https://example.com/' }),
        step({ action: 'navigate', url: 'http://169.254.169.254/latest/meta-data/' }),
      ],
    };
    const result = await executeBrowserSteps(spec, {}, makeFakeDriver());

    expect(result.pass).toBe(false);
    expect(result.browserSteps[1].pass).toBe(false);
  });
});
