import { describe, it, expect } from 'vitest';
import { crawlSite } from '../server/siteCrawler.js';
import { generateBrowserTestDrafts } from '../server/browserTestGenerator.js';

describe('generateBrowserTestDrafts — against a real live crawl', () => {
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
    const fillStep = formDraft!.spec.browser!.steps.find(s => s.action === 'fill' && s.selector === '[name="q"]');
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

    const passwordStep = formDraft.spec.browser!.steps.find(s => s.selector === '[name="password"]')!;
    expect(passwordStep.value).toBe('{{password}}');
    const ccStep = formDraft.spec.browser!.steps.find(s => s.selector === '[name="credit_card_number"]')!;
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
