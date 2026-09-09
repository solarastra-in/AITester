import * as cheerio from 'cheerio';
import { assertPublicUrl, SsrfBlockedError } from './ssrfGuard.js';

export interface CrawledFormField {
  name: string;
  type: string; // text, email, password, number, tel, checkbox, radio, select, textarea, hidden, etc.
  required: boolean;
  placeholder?: string;
  /** For select/radio/checkbox groups, the available option values. */
  options?: string[];
  /** True for password/credit-card/SSN-like fields the crawler deliberately will not auto-fill. */
  sensitive: boolean;
}

export interface CrawledForm {
  action: string; // resolved absolute URL the form submits to
  method: string; // GET/POST as declared, uppercased
  fields: CrawledFormField[];
}

export interface CrawledLink {
  href: string; // resolved absolute URL
  text: string; // visible link text, trimmed
  sameOrigin: boolean;
}

export interface CrawledPage {
  url: string;
  status: number | null;
  title: string;
  forms: CrawledForm[];
  links: CrawledLink[];
  /** Buttons and other clickable controls not inside a <form> (e.g. a JS-driven modal trigger) — best-effort, matched by common patterns (button, [role=button], input[type=submit/button]). */
  interactiveElements: Array<{ selector: string; text: string }>;
  error?: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: CrawledPage[];
  /** Same-origin links discovered but not crawled (crawl budget exhausted, or excluded by robots.txt). */
  skippedUrls: string[];
  /** robots.txt disallow rules that were honored, for transparency in the report. */
  robotsDisallowed: string[];
}

const SENSITIVE_FIELD_PATTERN = /password|passwd|pwd|card|cvv|cvc|ccv|ssn|social.?security|routing.?number|account.?number|pin\b/i;

function classifySensitivity(name: string, type: string): boolean {
  if (type === 'password') return true;
  return SENSITIVE_FIELD_PATTERN.test(name.replace(/[_-]/g, ' '));
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchWithGuard(url: string, timeoutMs = 8000): Promise<{ status: number; text: string } | null> {
  try {
    await assertPublicUrl(url);
  } catch (err) {
    if (err instanceof SsrfBlockedError) return null;
    throw err;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Verity-Crawler-Agent/1.0 (Automated QA Engine; respects robots.txt)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    return { status: res.status, text };
  } catch {
    return null;
  }
}

/** Parses a minimal, standard robots.txt for User-agent: * Disallow rules. */
function parseRobotsDisallow(robotsTxt: string): string[] {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  const disallowed: string[] = [];
  let inGlobalGroup = false;
  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) {
      inGlobalGroup = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inGlobalGroup = false;
      continue;
    }
    if (inGlobalGroup) {
      const match = /^disallow:\s*(\S*)/i.exec(line);
      if (match && match[1]) disallowed.push(match[1]);
    }
  }
  return disallowed;
}

function isDisallowed(pathname: string, disallowRules: string[]): boolean {
  return disallowRules.some(rule => pathname.startsWith(rule));
}

export function extractPageData(html: string, pageUrl: string, rootOrigin: string): Omit<CrawledPage, 'url' | 'status' | 'error'> {
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim();

  const forms: CrawledForm[] = [];
  $('form').each((_, formEl) => {
    const $form = $(formEl);
    const actionAttr = $form.attr('action') || pageUrl;
    const action = resolveUrl(pageUrl, actionAttr) || pageUrl;
    const method = ($form.attr('method') || 'GET').toUpperCase();
    const fields: CrawledFormField[] = [];

    $form.find('input, select, textarea').each((__, fieldEl) => {
      const $field = $(fieldEl);
      const tag = (fieldEl as any).tagName?.toLowerCase();
      const name = $field.attr('name') || $field.attr('id') || '';
      if (!name) return;
      let type = tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : ($field.attr('type') || 'text').toLowerCase();
      if (type === 'hidden') return; // not user-fillable, nothing to guide the user on
      const required = $field.attr('required') !== undefined || $field.attr('aria-required') === 'true';
      const placeholder = $field.attr('placeholder');
      let options: string[] | undefined;
      if (tag === 'select') {
        options = $field.find('option').map((___, o) => $(o).attr('value') || $(o).text().trim()).get().filter(Boolean);
      }
      fields.push({
        name,
        type,
        required,
        placeholder,
        options,
        sensitive: classifySensitivity(name, type),
      });
    });

    // De-duplicate by field name (radio groups share a name across multiple inputs).
    const seen = new Map<string, CrawledFormField>();
    for (const f of fields) {
      if (!seen.has(f.name)) {
        seen.set(f.name, f);
      } else if (f.options) {
        const existing = seen.get(f.name)!;
        existing.options = Array.from(new Set([...(existing.options || []), ...f.options]));
      }
    }

    forms.push({ action, method, fields: Array.from(seen.values()) });
  });

  const links: CrawledLink[] = [];
  const seenHrefs = new Set<string>();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    const resolved = resolveUrl(pageUrl, href);
    if (!resolved || seenHrefs.has(resolved)) return;
    seenHrefs.add(resolved);
    let sameOrigin = false;
    try {
      sameOrigin = new URL(resolved).origin === rootOrigin;
    } catch {
      /* ignore */
    }
    links.push({ href: resolved, text: $(a).text().trim().slice(0, 120), sameOrigin });
  });

  const interactiveElements: Array<{ selector: string; text: string }> = [];
  $('button, [role="button"], input[type="submit"], input[type="button"]').each((i, el) => {
    const $el = $(el);
    if ($el.closest('form').length) return; // already covered by the form's submit action
    const text = $el.text().trim() || $el.attr('value') || $el.attr('aria-label') || `element-${i}`;
    const id = $el.attr('id');
    const selector = id ? `#${id}` : `text=${JSON.stringify(text.slice(0, 60))}`;
    interactiveElements.push({ selector, text: text.slice(0, 120) });
  });

  return { title, forms, links, interactiveElements };
}

/**
 * Breadth-first crawl of a site starting at rootUrl, staying same-origin,
 * respecting robots.txt, and bounded by maxPages/maxDepth so this can never
 * turn into an unbounded scrape. Every fetch (including robots.txt itself)
 * goes through the SSRF guard.
 */
export async function crawlSite(
  rootUrl: string,
  opts: { maxPages?: number; maxDepth?: number } = {}
): Promise<CrawlResult> {
  const maxPages = Math.min(opts.maxPages ?? 15, 30);
  const maxDepth = opts.maxDepth ?? 2;

  let normalizedRoot = rootUrl.trim();
  if (!normalizedRoot.startsWith('http://') && !normalizedRoot.startsWith('https://')) {
    normalizedRoot = `https://${normalizedRoot}`;
  }
  await assertPublicUrl(normalizedRoot);
  const rootOrigin = new URL(normalizedRoot).origin;

  let robotsDisallowed: string[] = [];
  try {
    const robotsRes = await fetchWithGuard(`${rootOrigin}/robots.txt`, 4000);
    if (robotsRes && robotsRes.status === 200) {
      robotsDisallowed = parseRobotsDisallow(robotsRes.text);
    }
  } catch {
    // No robots.txt, or it failed to fetch — proceed with no restrictions beyond same-origin + page budget.
  }

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizedRoot, depth: 0 }];
  const pages: CrawledPage[] = [];
  const skippedUrls: string[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const normalizedUrl = url.split('#')[0];
    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);

    let pathname = '/';
    try {
      pathname = new URL(normalizedUrl).pathname;
    } catch {
      continue;
    }
    if (isDisallowed(pathname, robotsDisallowed)) {
      skippedUrls.push(normalizedUrl);
      continue;
    }

    const fetched = await fetchWithGuard(normalizedUrl);
    if (!fetched) {
      pages.push({ url: normalizedUrl, status: null, title: '', forms: [], links: [], interactiveElements: [], error: 'Fetch failed or blocked' });
      continue;
    }

    const contentIsHtml = /<html[\s>]/i.test(fetched.text) || /<!doctype html/i.test(fetched.text);
    if (!contentIsHtml) {
      pages.push({ url: normalizedUrl, status: fetched.status, title: '', forms: [], links: [], interactiveElements: [] });
      continue;
    }

    const pageData = extractPageData(fetched.text, normalizedUrl, rootOrigin);
    pages.push({ url: normalizedUrl, status: fetched.status, ...pageData });

    if (depth < maxDepth) {
      for (const link of pageData.links) {
        const linkPath = link.href.split('#')[0];
        if (link.sameOrigin && !visited.has(linkPath) && pages.length + queue.length < maxPages * 2) {
          queue.push({ url: linkPath, depth: depth + 1 });
        }
      }
    }
  }

  for (const { url } of queue) {
    if (!visited.has(url)) skippedUrls.push(url);
  }

  return { rootUrl: normalizedRoot, pages, skippedUrls: Array.from(new Set(skippedUrls)).slice(0, 50), robotsDisallowed };
}
