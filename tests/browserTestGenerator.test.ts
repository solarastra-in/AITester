import { describe, it, expect } from 'vitest';
import { crawlSite } from '../server/siteCrawler.js';
import { generateBrowserTestDrafts, generateFieldValue } from '../server/browserTestGenerator.js';

describe('generateBrowserTestDrafts — against a real live crawl', () => {
  it('scopes every form-fill selector to that specific form — regression test for a real bug found via live browser execution', () => {
    // On a real multi-form page (this is exactly what pypi.org's homepage
    // looks like: a search form plus a separate locale-switcher form), an
    // unscoped selector like 'form button[type="submit"]' matches the
    // FIRST form in document order, which can be a completely unrelated
    // one. This was caught by actually running the generated test through
    // a real Playwright browser against real pypi.org — not by this unit
    // test, which only checks that the generated selector STRING is
    // correctly scoped (since this environment can't reliably run a real
    // browser in CI). See the commit message for the real execution
    // transcript that found and confirmed the fix for this.
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      usedSitemap: false,
      totalSameOriginUrlsDiscovered: 1,
      pages: [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          links: [],
          interactiveElements: [],
          forms: [
            // A decoy form that appears FIRST in document order — exactly
            // the shape of bug this regression test guards against.
            { action: 'https://example.com/locale', method: 'GET', fields: [{ name: 'locale_id', type: 'hidden-but-present-for-test', required: false, sensitive: false }] },
            { action: 'https://example.com/search', method: 'GET', fields: [{ name: 'q', type: 'text', required: false, sensitive: false }] },
          ],
        },
      ],
    };

    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    const formDrafts = drafts.filter(d => d.category === 'Browser / Form Submission');
    expect(formDrafts).toHaveLength(2);

    const searchFormDraft = formDrafts.find(d => d.spec.browser!.steps.some(s => s.selector?.includes('[name="q"]')))!;
    const fillStep = searchFormDraft.spec.browser!.steps.find(s => s.action === 'fill')!;
    const clickStep = searchFormDraft.spec.browser!.steps.find(s => s.action === 'click')!;

    // Both selectors must be scoped to the form containing "q", not a bare
    // page-wide "form ..." selector that could match the decoy form.
    expect(fillStep.selector).toBe('form:has([name="q"]) [name="q"]');
    expect(clickStep.selector).toBe('form:has([name="q"]) button[type="submit"], form:has([name="q"]) input[type="submit"]');
    expect(clickStep.selector).not.toBe('form button[type="submit"], form input[type="submit"]');
  });

  it('generates a page-health test and a real form-fill test from pypi.org', async () => {
    const crawl = await crawlSite('https://pypi.org/', { maxPages: 2, maxDepth: 1 });
    const drafts = generateBrowserTestDrafts(crawl);

    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every(d => d.type === 'browser')).toBe(true);

    const healthDraft = drafts.find(d => d.category === 'Browser / Page Health');
    expect(healthDraft).toBeTruthy();
    expect(healthDraft!.spec.browser!.steps[0].action).toBe('navigate');
    expect(healthDraft!.spec.browser!.steps.some(s => s.action === 'assertNoBrokenLinks')).toBe(true);

    const formDraft = drafts.find(d => d.category === 'Browser / Form Submission');
    expect(formDraft).toBeTruthy();
    // The real search field (name="q") should get a real, safe, non-sensitive
    // auto-generated value — never a {{placeholder}} needing user input,
    // since a search query field isn't sensitive.
    const fillStep = formDraft!.spec.browser!.steps.find(s => s.action === 'fill' && s.selector?.includes('[name="q"]'));
    expect(fillStep).toBeTruthy();
    expect(fillStep!.value).not.toMatch(/^\{\{.*\}\}$/);
    expect(formDraft!.dataFields).not.toContain('q');
  }, 30_000);

  it('never auto-fills a sensitive field — it always shows up in dataFields as a placeholder', () => {
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        {
          url: 'https://example.com/signup',
          status: 200,
          title: 'Sign Up',
          links: [],
          interactiveElements: [],
          forms: [
            {
              action: 'https://example.com/signup',
              method: 'POST',
              fields: [
                { name: 'email', type: 'email', required: true, sensitive: false },
                { name: 'password', type: 'password', required: true, sensitive: true },
                { name: 'credit_card_number', type: 'text', required: false, sensitive: true },
              ],
            },
          ],
        },
      ],
    };

    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    const formDraft = drafts.find(d => d.category === 'Browser / Form Submission')!;

    expect(formDraft.dataFields).toContain('password');
    expect(formDraft.dataFields).toContain('credit_card_number');
    expect(formDraft.dataFields).not.toContain('email');

    const passwordStep = formDraft.spec.browser!.steps.find(s => s.selector?.includes('[name="password"]'))!;
    expect(passwordStep.value).toBe('{{password}}');
    const ccStep = formDraft.spec.browser!.steps.find(s => s.selector?.includes('[name="credit_card_number"]'))!;
    expect(ccStep.value).toBe('{{credit_card_number}}');

    // Priority reflects that this test can't run unattended yet.
    expect(formDraft.priority).toBe('Medium');
  });

  it('flags identifier-like text fields (order id, account number) for user input rather than guessing', () => {
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        {
          url: 'https://example.com/track-order',
          status: 200,
          title: 'Track Order',
          links: [],
          interactiveElements: [],
          forms: [
            {
              action: 'https://example.com/track-order',
              method: 'GET',
              fields: [{ name: 'order_reference', type: 'text', required: true, sensitive: false }],
            },
          ],
        },
      ],
    };

    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    const formDraft = drafts.find(d => d.category === 'Browser / Form Submission')!;
    expect(formDraft.dataFields).toContain('order_reference');
  });

  it('skips forms with no fillable fields (e.g. a pure locale-switcher button form)', () => {
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          links: [],
          interactiveElements: [],
          forms: [{ action: 'https://example.com/locale', method: 'GET', fields: [] }],
        },
      ],
    };

    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    expect(drafts.some(d => d.category === 'Browser / Form Submission')).toBe(false);
    // The page-health check still gets generated regardless.
    expect(drafts.some(d => d.category === 'Browser / Page Health')).toBe(true);
  });
});

describe('generateFieldValue — intuitive named-field recognition', () => {
  const field = (overrides: Partial<{ name: string; type: string; label: string; placeholder: string; sensitive: boolean }>) => ({
    name: 'x', type: 'text', required: false, sensitive: false, ...overrides,
  });

  it('recognizes common personal-info field names and produces realistic, clearly-synthetic values', () => {
    expect(generateFieldValue(field({ name: 'first_name' })).value).toBe('Jordan');
    expect(generateFieldValue(field({ name: 'last_name' })).value).toBe('Rivera');
    expect(generateFieldValue(field({ name: 'company' })).value).toBe('Verity QA Testing Co.');
    expect(generateFieldValue(field({ name: 'city' })).value).toBe('Springfield');
    expect(generateFieldValue(field({ name: 'zip_code' })).value).toBe('94105');
    expect(generateFieldValue(field({ name: 'country' })).value).toBe('United States');
    for (const key of ['first_name', 'last_name', 'company', 'city', 'zip_code', 'country']) {
      expect(generateFieldValue(field({ name: key })).needsUserInput).toBe(false);
    }
  });

  it('uses the <label> text when the name attribute is meaningless (framework-generated ids)', () => {
    const result = generateFieldValue(field({ name: 'field_x92a', label: 'First Name' }));
    expect(result.value).toBe('Jordan');
    expect(result.needsUserInput).toBe(false);
  });

  it('uses placeholder text as a signal too', () => {
    const result = generateFieldValue(field({ name: 'q1', placeholder: 'Enter your company name' }));
    expect(result.value).toBe('Verity QA Testing Co.');
  });

  it('still flags identifier-like fields for user input even when a named recognizer might otherwise match nearby text', () => {
    const result = generateFieldValue(field({ name: 'account_number' }));
    expect(result.needsUserInput).toBe(true);
    expect(result.value).toBe('{{account_number}}');
  });

  it('still never auto-fills a sensitive field regardless of any named-recognizer match', () => {
    const result = generateFieldValue(field({ name: 'password', type: 'password', sensitive: true }));
    expect(result.needsUserInput).toBe(true);
    expect(result.value).toBe('{{password}}');
  });

  it('falls back to a generic-but-safe value for an unrecognized text field', () => {
    const result = generateFieldValue(field({ name: 'favorite_color' }));
    expect(result.needsUserInput).toBe(false);
    expect(result.value).toContain('favorite_color');
  });
});

describe('generateBrowserTestDrafts — interactive-element (button/JS-control) coverage', () => {
  it('generates a dedicated test that clicks every non-form interactive control on a page', () => {
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        {
          url: 'https://example.com/',
          status: 200,
          title: 'Home',
          links: [],
          forms: [],
          interactiveElements: [
            { selector: '#open-modal', text: 'Open Modal', kind: 'js_anchor' },
            { selector: '#save-btn', text: 'Save', kind: 'button' },
            { selector: '[role="tab"]:has-text("Billing")', text: 'Billing', kind: 'aria_control' },
          ],
        },
      ],
    };

    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    const controlsDraft = drafts.find(d => d.category === 'Browser / Interactive Controls');
    expect(controlsDraft).toBeTruthy();
    expect(controlsDraft!.title).toContain('3 interactive controls');

    const clickSteps = controlsDraft!.spec.browser!.steps.filter(s => s.action === 'click');
    expect(clickSteps).toHaveLength(3);
    expect(clickSteps.every(s => s.continueOnFailure)).toBe(true);
    expect(clickSteps.map(s => s.selector)).toEqual(
      expect.arrayContaining(['#open-modal', '#save-btn', '[role="tab"]:has-text("Billing")'])
    );
  });

  it('does not generate an interactive-controls test for a page with no such controls', () => {
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        { url: 'https://example.com/', status: 200, title: 'Home', links: [], forms: [], interactiveElements: [] },
      ],
    };
    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    expect(drafts.some(d => d.category === 'Browser / Interactive Controls')).toBe(false);
  });

  it('caps a single page\'s interactive-controls test at 15 clicks even if more were found', () => {
    const manyElements = Array.from({ length: 25 }, (_, i) => ({ selector: `#el-${i}`, text: `Element ${i}`, kind: 'button' as const }));
    const fakeCrawl = {
      rootUrl: 'https://example.com/',
      skippedUrls: [],
      robotsDisallowed: [],
      pages: [
        { url: 'https://example.com/', status: 200, title: 'Home', links: [], forms: [], interactiveElements: manyElements },
      ],
    };
    const drafts = generateBrowserTestDrafts(fakeCrawl as any);
    const controlsDraft = drafts.find(d => d.category === 'Browser / Interactive Controls')!;
    const clickSteps = controlsDraft.spec.browser!.steps.filter(s => s.action === 'click');
    expect(clickSteps).toHaveLength(15);
  });
});
