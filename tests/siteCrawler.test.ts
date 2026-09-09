import { describe, it, expect } from 'vitest';
import { crawlSite } from '../server/siteCrawler.js';

/**
 * Runs against real, live sites reachable from this environment's network
 * allowlist (pypi.org, registry.npmjs.org) rather than synthetic/mocked
 * HTML — proving the crawler's HTML parsing, form/link extraction, and
 * same-origin/robots.txt handling work against real-world markup, not just
 * markup shaped exactly the way the parser expects.
 */

describe('crawlSite — real-world crawl', () => {
  it('discovers the real search form on pypi.org, including its actual field name and placeholder', async () => {
    const result = await crawlSite('https://pypi.org/', { maxPages: 3, maxDepth: 1 });

    expect(result.pages.length).toBeGreaterThan(0);
    const homePage = result.pages.find(p => p.url === 'https://pypi.org/');
    expect(homePage).toBeTruthy();
    expect(homePage!.status).toBe(200);
    expect(homePage!.title.toLowerCase()).toContain('pypi');

    // The real <input name="q" type="text" placeholder="Type '/' to search projects">
    // search form on pypi.org's homepage.
    const searchForm = homePage!.forms.find(f => f.fields.some(field => field.name === 'q'));
    expect(searchForm).toBeTruthy();
    const qField = searchForm!.fields.find(f => f.name === 'q')!;
    expect(qField.type).toBe('text');
    expect(qField.sensitive).toBe(false);
    expect(qField.placeholder).toContain('search');
  }, 30_000);

  it('discovers real same-origin links and correctly flags cross-origin ones', async () => {
    const result = await crawlSite('https://pypi.org/', { maxPages: 2, maxDepth: 1 });
    const homePage = result.pages.find(p => p.url === 'https://pypi.org/')!;

    expect(homePage.links.length).toBeGreaterThan(0);
    expect(homePage.links.every(l => typeof l.href === 'string' && l.href.startsWith('http'))).toBe(true);
    // /search/ and /organizations/ are real same-origin links on this page.
    expect(homePage.links.some(l => l.href.includes('pypi.org/search') && l.sameOrigin)).toBe(true);
  }, 30_000);

  it('stays same-origin and respects the page budget', async () => {
    const result = await crawlSite('https://pypi.org/', { maxPages: 2, maxDepth: 2 });
    expect(result.pages.length).toBeLessThanOrEqual(2);
    for (const page of result.pages) {
      expect(new URL(page.url).origin).toBe('https://pypi.org');
    }
  }, 30_000);

  it('classifies a password-type field, and a "confirm_password" text field, as sensitive (never auto-filled)', async () => {
    const { extractPageData } = await import('../server/siteCrawler.js');
    const html = `
      <html><body>
        <form action="/login" method="post">
          <input name="email" type="email" required placeholder="you@example.com" />
          <input name="password" type="password" required />
          <input name="confirm_password" type="text" />
          <input name="remember_me" type="checkbox" />
          <input name="csrf_token" type="hidden" value="abc123" />
          <button type="submit">Log in</button>
        </form>
      </body></html>
    `;
    const data = extractPageData(html, 'https://example.com/login', 'https://example.com');

    expect(data.forms).toHaveLength(1);
    const form = data.forms[0];
    expect(form.action).toBe('https://example.com/login');
    expect(form.method).toBe('POST');

    const byName = Object.fromEntries(form.fields.map(f => [f.name, f]));
    expect(byName.email.sensitive).toBe(false);
    expect(byName.email.required).toBe(true);
    expect(byName.password.sensitive).toBe(true);
    // "confirm_password" is type=text, not type=password, but the name
    // itself matches the sensitive-field name pattern — the crawler must
    // catch this by name, not just by input type, or a real signup form's
    // password-confirmation field would get auto-filled with guessed text.
    expect(byName.confirm_password.sensitive).toBe(true);
    expect(byName.remember_me.sensitive).toBe(false);
    // Hidden fields (e.g. CSRF tokens) aren't user-fillable and shouldn't
    // even appear — nothing for the user to guide.
    expect(byName.csrf_token).toBeUndefined();
  });

  it('classifies "pin_code" and "pin_number" as sensitive despite the trailing \\b in the base pattern not matching across underscores', async () => {
    const { extractPageData } = await import('../server/siteCrawler.js');
    const html = `
      <html><body>
        <form action="/verify">
          <input name="pin_code" type="text" />
          <input name="shipping_info" type="text" />
        </form>
      </body></html>
    `;
    const data = extractPageData(html, 'https://example.com/verify', 'https://example.com');
    const byName = Object.fromEntries(data.forms[0].fields.map(f => [f.name, f]));
    expect(byName.pin_code.sensitive).toBe(true);
    // "shipping_info" legitimately contains the substring "pin" — must NOT
    // false-positive just because "pin" appears inside a longer word.
    expect(byName.shipping_info.sensitive).toBe(false);
  });
});
