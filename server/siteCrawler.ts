import * as cheerio from 'cheerio';
import { assertPublicUrl, SsrfBlockedError } from './ssrfGuard.js';

export interface CrawledFormField {
  name: string;
  type: string; // text, email, password, number, tel, checkbox, radio, select, textarea, hidden, etc.
  required: boolean;
  placeholder?: string;
  /** Visible <label> text associated with this field (via for=id, or wrapping) — often the single best signal of what a field is actually asking for, especially when `name` is a generated/non-descriptive id. */
  label?: string;
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

export interface InteractiveElement {
  selector: string;
  text: string;
  /** Why this was picked up — helps a human sanity-check the generated test rather than trusting a black box. */
  kind: 'button' | 'js_anchor' | 'onclick_handler' | 'aria_control' | 'disclosure';
}

export interface CrawledPage {
  url: string;
  status: number | null;
  title: string;
  forms: CrawledForm[];
  links: CrawledLink[];
  /**
   * Clickable controls not covered by a real navigable link or a form's own
   * submit action: JS-driven buttons, href="javascript:..." / href="#"
   * anchors with click handlers, elements with a bare onclick attribute,
   * ARIA tabs/menu items, and <details> disclosure widgets. Deliberately
   * broad — the goal is that nothing clickable on the page is silently
   * invisible to test generation, even if not every one of these turns
   * into its own generated test case.
   */
  interactiveElements: InteractiveElement[];
  error?: string;
}

export interface CrawlResult {
  rootUrl: string;
  pages: CrawledPage[];
  /** Same-origin links discovered but not crawled (crawl budget exhausted, or excluded by robots.txt). */
  skippedUrls: string[];
  /** robots.txt disallow rules that were honored, for transparency in the report. */
  robotsDisallowed: string[];
  /** True if a sitemap.xml was found and used to seed additional URLs beyond what link-following alone discovered. */
  usedSitemap: boolean;
  /** Total distinct same-origin URLs seen across the whole crawl (crawled + skipped) — a completeness signal: compare against pages.length to see how much of the site was actually covered vs. just discovered. */
  totalSameOriginUrlsDiscovered: number;
}

const SENSITIVE_FIELD_PATTERN = /password|passwd|pwd|card|cvv|cvc|ccv|ssn|social.?security|routing.?number|account.?number|pin\b/i;

// Query params that don't change page identity (analytics/tracking) — two
// URLs differing only in these are treated as the same page, so the crawl
// budget isn't wasted re-crawling what's really one page N times.
const IGNORED_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', 'referrer', 'source', '_ga',
]);

function classifySensitivity(name: string, type: string, label?: string): boolean {
  if (type === 'password') return true;
  const haystack = `${name} ${label || ''}`.replace(/[_-]/g, ' ');
  return SENSITIVE_FIELD_PATTERN.test(haystack);
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Strips tracking query params and the fragment, for dedup purposes only — the returned string is a dedup key, not necessarily a fetchable URL. */
export function dedupKey(url: string): string {
  try {
    const u = new URL(url);
    const keep = Array.from(u.searchParams.entries()).filter(([k]) => !IGNORED_QUERY_PARAMS.has(k.toLowerCase()));
    keep.sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url.split('#')[0];
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
        Accept: 'text/html,application/xhtml+xml,application/xml,*/*',
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

/** Fetches and parses sitemap.xml (and, if present, a sitemap index referencing child sitemaps, one level deep) into a flat list of same-origin URLs. */
async function discoverSitemapUrls(rootOrigin: string, rootUrl: string): Promise<string[]> {
  const res = await fetchWithGuard(`${rootOrigin}/sitemap.xml`, 5000);
  if (!res || res.status !== 200) return [];

  const $ = cheerio.load(res.text, { xmlMode: true });
  const isIndex = $('sitemapindex').length > 0;
  const urls: string[] = [];

  if (isIndex) {
    const childSitemaps = $('sitemap > loc').map((_, el) => $(el).text().trim()).get().slice(0, 5);
    for (const childUrl of childSitemaps) {
      const resolved = resolveUrl(rootUrl, childUrl);
      if (!resolved) continue;
      const childRes = await fetchWithGuard(resolved, 5000);
      if (!childRes || childRes.status !== 200) continue;
      const $child = cheerio.load(childRes.text, { xmlMode: true });
      $child('url > loc').each((_, el) => {
        const loc = $child(el).text().trim();
        if (loc) urls.push(loc);
      });
    }
  } else {
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
  }

  return urls.filter(u => {
    try {
      return new URL(u).origin === rootOrigin;
    } catch {
      return false;
    }
  }).slice(0, 200);
}

function extractLabelFor($: cheerio.CheerioAPI, field: any, name: string): string | undefined {
  const id = $(field).attr('id');
  if (id) {
    const forLabel = $(`label[for="${id}"]`).first().text().trim();
    if (forLabel) return forLabel;
  }
  const wrappingLabel = $(field).closest('label');
  if (wrappingLabel.length) {
    // Exclude the field's own value/text from the label text (e.g. a
    // checkbox nested inside its own <label>Subscribe<input/></label>).
    const clone = wrappingLabel.clone();
    clone.find('input, select, textarea').remove();
    const text = clone.text().trim();
    if (text) return text;
  }
  // aria-label is a common accessible-name fallback when there's no visible <label>.
  const ariaLabel = $(field).attr('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  return undefined;
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
      const label = extractLabelFor($, fieldEl, name);
      let options: string[] | undefined;
      if (tag === 'select') {
        options = $field.find('option').map((___, o) => $(o).attr('value') || $(o).text().trim()).get().filter(Boolean);
      }
      fields.push({
        name,
        type,
        required,
        placeholder,
        label,
        options,
        sensitive: classifySensitivity(name, type, label),
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
  const interactiveElements: InteractiveElement[] = [];

  $('a[href]').each((i, a) => {
    const $a = $(a);
    const href = $a.attr('href');
    if (!href) return;
    const text = $a.text().trim().slice(0, 120) || $a.attr('aria-label')?.trim().slice(0, 120) || '';

    if (href === '#' || href.startsWith('javascript:')) {
      // Not a real navigation target, but very likely a JS-driven control
      // (a "button" implemented as an anchor) — capture it as interactive
      // rather than silently dropping it.
      if ($a.closest('form').length) return;
      const id = $a.attr('id');
      interactiveElements.push({
        selector: id ? `#${id}` : `a:has-text(${JSON.stringify(text.slice(0, 60) || `link-${i}`)})`,
        text: text || `(unlabeled link ${i})`,
        kind: 'js_anchor',
      });
      return;
    }
    if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.startsWith('#')) return; // a genuine same-page fragment anchor — not a navigation or a control

    const resolved = resolveUrl(pageUrl, href);
    if (!resolved || seenHrefs.has(resolved)) return;
    seenHrefs.add(resolved);
    let sameOrigin = false;
    try {
      sameOrigin = new URL(resolved).origin === rootOrigin;
    } catch {
      /* ignore */
    }
    links.push({ href: resolved, text, sameOrigin });
  });

  // Real buttons and form-adjacent submit-like inputs.
  $('button, [role="button"], input[type="submit"], input[type="button"]').each((i, el) => {
    const $el = $(el);
    if ($el.closest('form').length) return; // already covered by the form's submit action
    const text = $el.text().trim() || $el.attr('value') || $el.attr('aria-label') || `element-${i}`;
    const id = $el.attr('id');
    interactiveElements.push({
      selector: id ? `#${id}` : `text=${JSON.stringify(text.slice(0, 60))}`,
      text: text.slice(0, 120),
      kind: 'button',
    });
  });

  // Elements with a bare onclick handler that aren't already covered above
  // (e.g. a <div onclick="..."> or <li onclick="...">, common in
  // hand-rolled JS widgets and older sites).
  $('[onclick]').each((i, el) => {
    const $el = $(el);
    const tag = (el as any).tagName?.toLowerCase();
    if (tag === 'button' || tag === 'a') return; // already handled above
    if ($el.closest('form').length) return;
    const text = $el.text().trim().slice(0, 120) || $el.attr('aria-label') || `onclick-element-${i}`;
    const id = $el.attr('id');
    interactiveElements.push({
      selector: id ? `#${id}` : `text=${JSON.stringify(text.slice(0, 60))}`,
      text,
      kind: 'onclick_handler',
    });
  });

  // ARIA-role interactive widgets: tabs, menu items, switches — these
  // drive real UI state changes (switching a tab panel, opening a menu)
  // that a pure link/form crawl would never see.
  $('[role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"]').each((i, el) => {
    const $el = $(el);
    if ($el.closest('form').length) return;
    const text = $el.text().trim().slice(0, 120) || $el.attr('aria-label') || `${$el.attr('role')}-${i}`;
    const id = $el.attr('id');
    interactiveElements.push({
      selector: id ? `#${id}` : `[role="${$el.attr('role')}"]:has-text(${JSON.stringify(text.slice(0, 60))})`,
      text,
      kind: 'aria_control',
    });
  });

  // <details>/<summary> disclosure widgets (native HTML accordions/FAQs).
  $('details > summary').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim().slice(0, 120) || `disclosure-${i}`;
    const id = $el.parent().attr('id');
    interactiveElements.push({
      selector: id ? `#${id} summary` : `summary:has-text(${JSON.stringify(text.slice(0, 60))})`,
      text,
      kind: 'disclosure',
    });
  });

  return { title, forms, links, interactiveElements };
}

/**
 * Breadth-first crawl of a site starting at rootUrl, staying same-origin,
 * respecting robots.txt, and bounded by maxPages/maxDepth so this can never
 * turn into an unbounded scrape. Every fetch — including robots.txt and
 * sitemap.xml — goes through the SSRF guard.
 *
 * Discovery combines two sources so real pages aren't missed just because
 * nothing on the crawled pages happened to link to them within the depth
 * budget: (1) normal link-following from the pages actually fetched, and
 * (2) sitemap.xml (including a one-level-deep sitemap index), which many
 * real sites publish specifically to declare every page that exists.
 */
export async function crawlSite(
  rootUrl: string,
  opts: { maxPages?: number; maxDepth?: number } = {}
): Promise<CrawlResult> {
  const maxPages = Math.min(opts.maxPages ?? 20, 40);
  const maxDepth = opts.maxDepth ?? 3;

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

  let sitemapUrls: string[] = [];
  try {
    sitemapUrls = await discoverSitemapUrls(rootOrigin, normalizedRoot);
  } catch {
    // No sitemap, or it failed to fetch/parse — link-following still covers discovery.
  }

  const visitedKeys = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: normalizedRoot, depth: 0 }];
  // Sitemap URLs are seeded at depth 0 too (not gated by link-following
  // depth) — they're a direct declaration from the site itself, not a
  // guess, so the crawl budget should treat them as equally authoritative
  // to the root.
  for (const su of sitemapUrls) {
    if (dedupKey(su) !== dedupKey(normalizedRoot)) {
      queue.push({ url: su, depth: 0 });
    }
  }

  const pages: CrawledPage[] = [];
  const skippedUrls: string[] = [];
  const allDiscoveredKeys = new Set<string>([dedupKey(normalizedRoot)]);

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const key = dedupKey(url);
    if (visitedKeys.has(key)) continue;
    visitedKeys.add(key);

    let pathname = '/';
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (isDisallowed(pathname, robotsDisallowed)) {
      skippedUrls.push(url);
      continue;
    }

    const fetched = await fetchWithGuard(url);
    if (!fetched) {
      pages.push({ url, status: null, title: '', forms: [], links: [], interactiveElements: [], error: 'Fetch failed or blocked' });
      continue;
    }

    const contentIsHtml = /<html[\s>]/i.test(fetched.text) || /<!doctype html/i.test(fetched.text);
    if (!contentIsHtml) {
      pages.push({ url, status: fetched.status, title: '', forms: [], links: [], interactiveElements: [] });
      continue;
    }

    const pageData = extractPageData(fetched.text, url, rootOrigin);
    pages.push({ url, status: fetched.status, ...pageData });

    for (const link of pageData.links) {
      if (!link.sameOrigin) continue;
      const linkKey = dedupKey(link.href);
      allDiscoveredKeys.add(linkKey);
      if (depth < maxDepth && !visitedKeys.has(linkKey) && pages.length + queue.length < maxPages * 3) {
        queue.push({ url: link.href, depth: depth + 1 });
      }
    }
  }

  for (const { url } of queue) {
    if (!visitedKeys.has(dedupKey(url))) skippedUrls.push(url);
  }

  return {
    rootUrl: normalizedRoot,
    pages,
    skippedUrls: Array.from(new Set(skippedUrls)).slice(0, 100),
    robotsDisallowed,
    usedSitemap: sitemapUrls.length > 0,
    totalSameOriginUrlsDiscovered: allDiscoveredKeys.size,
  };
}
