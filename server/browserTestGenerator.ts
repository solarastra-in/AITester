import { CrawlResult, CrawledPage, CrawledForm, CrawledFormField } from './siteCrawler.js';
import { BrowserStep, BrowserTestSpec } from './types.js';
import { ParsedCaseDraft } from './specParser.js';

let stepCounter = 0;
function nextStepId(): string {
  stepCounter += 1;
  return `step_${stepCounter}_${Date.now().toString(36)}`;
}

/**
 * Produces a real, non-fabricated value for a form field where one can be
 * safely auto-generated (the field's own declared type/name/placeholder
 * tells us what shape of data it wants), OR a {{placeholder}} template
 * reference for fields the crawler cannot confidently fill — most
 * importantly anything sensitive (passwords, payment details), but also
 * ambiguous free-text fields where a wrong guess could be misleading (e.g.
 * "confirm your account number").
 *
 * Returns { value, needsUserInput }. When needsUserInput is true, `value`
 * is a {{fieldName}}-style placeholder — resolveTemplates() will substitute
 * whatever the user supplies via the dataset configurator, and if they
 * haven't supplied it yet, the runner surfaces a clear "missing required
 * test data" failure rather than silently sending an empty string.
 */
function generateFieldValue(field: CrawledFormField): { value: string; needsUserInput: boolean } {
  const placeholderRef = `{{${field.name}}}`;

  if (field.sensitive) {
    return { value: placeholderRef, needsUserInput: true };
  }

  switch (field.type) {
    case 'email':
      return { value: 'qa.automation.test@example.com', needsUserInput: false };
    case 'tel':
      return { value: '+1 555 0100', needsUserInput: false };
    case 'url':
      return { value: 'https://example.com', needsUserInput: false };
    case 'number':
    case 'range':
      return { value: '1', needsUserInput: false };
    case 'date':
      return { value: new Date().toISOString().slice(0, 10), needsUserInput: false };
    case 'checkbox':
      return { value: 'true', needsUserInput: false };
    case 'select':
      if (field.options && field.options.length > 0) {
        return { value: field.options[0], needsUserInput: false };
      }
      return { value: placeholderRef, needsUserInput: true };
    case 'search':
    case 'text':
    case 'textarea':
      // A generic short text field — safe to fill with a clearly-synthetic
      // placeholder string UNLESS the field's name suggests it holds
      // something specific and important (e.g. "order_id", "account"),
      // where a nonsense value would make the test misleading rather than
      // useful — those get flagged for the user instead.
      if (/\b(id|number|reference|order|account|ssn|passport|license)\b/i.test(field.name.replace(/[_-]/g, ' '))) {
        return { value: placeholderRef, needsUserInput: true };
      }
      return { value: `Verity QA Test — ${field.name}`, needsUserInput: false };
    default:
      return { value: placeholderRef, needsUserInput: true };
  }
}

function buildFormTestSteps(page: CrawledPage, form: CrawledForm): { steps: BrowserStep[]; requiresUserSuppliedData: string[] } {
  const steps: BrowserStep[] = [];
  const requiresUserSuppliedData: string[] = [];

  steps.push({
    id: nextStepId(),
    action: 'navigate',
    url: page.url,
    description: `Navigate to ${page.url}`,
  });

  for (const field of form.fields) {
    const { value, needsUserInput } = generateFieldValue(field);
    if (needsUserInput) requiresUserSuppliedData.push(field.name);

    const selector = `[name="${field.name}"]`;
    if (field.type === 'select') {
      steps.push({ id: nextStepId(), action: 'select', selector, value, description: `Select "${value}" in ${field.name}` });
    } else if (field.type === 'checkbox') {
      steps.push({ id: nextStepId(), action: 'check', selector, description: `Check ${field.name}` });
    } else {
      steps.push({ id: nextStepId(), action: 'fill', selector, value, description: `Fill ${field.name}` });
    }
  }

  steps.push({
    id: nextStepId(),
    action: 'click',
    selector: 'form button[type="submit"], form input[type="submit"]',
    description: 'Submit the form',
    continueOnFailure: false,
  });

  steps.push({
    id: nextStepId(),
    action: 'assertNoConsoleErrors',
    description: 'Confirm the page produced no JavaScript console errors during this flow',
    continueOnFailure: true,
  });

  return { steps, requiresUserSuppliedData };
}

function buildPageHealthSteps(page: CrawledPage): BrowserStep[] {
  return [
    { id: nextStepId(), action: 'navigate', url: page.url, description: `Navigate to ${page.url}` },
    { id: nextStepId(), action: 'assertUrl', value: page.url, description: 'Confirm the page did not redirect unexpectedly' },
    { id: nextStepId(), action: 'assertNoConsoleErrors', description: 'Confirm no JavaScript console errors on load', continueOnFailure: true },
    { id: nextStepId(), action: 'assertNoBrokenLinks', description: 'Confirm every same-origin link on this page resolves without a 4xx/5xx response', continueOnFailure: true },
  ];
}

/**
 * Turns a crawl result into a set of real, executable browser test case
 * drafts — one page-health check per crawled page, plus one form-fill-and-
 * submit test per discovered form. Every draft's dataFields lists exactly
 * the fields a human needs to supply (via the dataset configurator) before
 * the test can run meaningfully; nothing sensitive is ever auto-filled.
 */
export function generateBrowserTestDrafts(crawl: CrawlResult): ParsedCaseDraft[] {
  const drafts: ParsedCaseDraft[] = [];

  for (const page of crawl.pages) {
    if (page.error || page.status === null) continue;

    const pagePath = (() => {
      try {
        const u = new URL(page.url);
        return u.pathname === '/' ? 'Home' : u.pathname;
      } catch {
        return page.url;
      }
    })();

    const healthSpec: BrowserTestSpec = { startPath: page.url, steps: buildPageHealthSteps(page) };
    drafts.push({
      ext_id: `browser_health_${drafts.length + 1}`,
      title: `${pagePath} — loads cleanly with no console errors or broken links`.slice(0, 140),
      category: 'Browser / Page Health',
      priority: page.url === crawl.rootUrl ? 'High' : 'Medium',
      tags: 'browser,page-health,auto-generated',
      type: 'browser',
      spec: { browser: healthSpec },
      dataFields: [],
    });

    for (const [formIdx, form] of page.forms.entries()) {
      if (form.fields.length === 0) continue; // nothing to fill (e.g. a single-button locale switcher)
      const { steps, requiresUserSuppliedData } = buildFormTestSteps(page, form);
      const formSpec: BrowserTestSpec = { startPath: page.url, steps, requiresUserSuppliedData };
      drafts.push({
        ext_id: `browser_form_${drafts.length + 1}`,
        title: `${pagePath} — form #${formIdx + 1} (${form.fields.map(f => f.name).slice(0, 3).join(', ')}${form.fields.length > 3 ? ', …' : ''}) can be filled and submitted`.slice(0, 140),
        category: 'Browser / Form Submission',
        priority: requiresUserSuppliedData.length > 0 ? 'Medium' : 'High',
        tags: `browser,form${requiresUserSuppliedData.length > 0 ? ',needs-test-data' : ''},auto-generated`,
        type: 'browser',
        spec: { browser: formSpec },
        dataFields: requiresUserSuppliedData,
      });
    }
  }

  return drafts;
}
