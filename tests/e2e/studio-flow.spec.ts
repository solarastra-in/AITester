import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end suite for the full Studio user journey, driven entirely through
 * the real UI against a real running server (see playwright.config.ts) — no
 * network mocking, no stubbed API responses. Every assertion here is checking
 * real, wired behavior:
 *
 *   Homepage -> pick a demo persona -> Studio -> create a project ->
 *   introspect a live URL -> AI-generate real test cases -> execute a case
 *   for real -> confirm Analytics reflects that real run (not a fabricated
 *   one — see the projectRoutes.ts fix) -> Multi-Cloud Deploy real download ->
 *   Billing shows the real pricing catalogue -> log out.
 *
 * Tests run serially in one file (see playwright.config.ts: fullyParallel is
 * off) because later steps depend on state created by earlier ones — this is
 * a journey, not a set of independent specs.
 *
 * Network note: the "Analyze URL" step below deliberately uses the
 * "HttpBin HTTP Probe" quick-sample chip (https://httpbin.org/get) rather
 * than an arbitrary URL or the "GitHub Public API" sample. httpbin.org is
 * purpose-built for exactly this kind of repeated automated HTTP testing
 * traffic and has no meaningful rate limits, whereas GitHub's public REST
 * API rate-limits shared IPs (60 req/hour, unauthenticated) — a real risk
 * on CI runners that share IP pools, which showed up as a genuine flaky
 * failure (403, not a bug) while building the equivalent backend test in
 * tests/packageExport.test.ts. Swapped here pre-emptively for the same
 * reason.
 */

test.describe.configure({ mode: 'serial' });

let projectName: string;
let firstCaseTestId: string | null = null;

async function selectPersona(page: Page, role: string) {
  await page.getByTestId('persona-switcher').click();
  await page.getByTestId(`persona-option-${role}`).click();
  // Menu closes and the switcher label updates once the persona session is live.
  await expect(page.getByTestId('persona-switcher')).not.toContainText('Guest');
}

// The project name only ever appears as text inside <option> elements (the
// main project switcher select, and the separate "Filter analytics by
// project" select in the Analytics tab) — never as its own visible text
// node. A plain getByText(name) match is therefore ambiguous (Playwright
// strict-mode violation: 2+ elements). This asserts against the specific,
// unambiguous project-switcher select's selected option instead.
async function expectActiveProject(page: Page, name: string) {
  const select = page.getByTestId('project-switcher-select');
  await expect(select).toBeVisible();
  await expect(select.locator('option:checked')).toHaveText(name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('homepage loads with real SEO metadata and no fabricated platform stats', async ({ page }) => {
  await expect(page).toHaveTitle(/Verity/);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toBeTruthy();

  // The live analytics widget must resolve to either a real empty-state message
  // or real numbers — never the old hardcoded "148,220 runs" style content.
  await expect(page.locator('#test-coverage-analytics-section')).toBeVisible();
  await expect(page.getByText('Mock Platform Analytics')).toHaveCount(0);
  await expect(page.getByText(/148,?220/)).toHaveCount(0);
});

test('homepage capabilities section reflects real implemented features', async ({ page }) => {
  await expect(page.locator('#platform-capabilities')).toBeVisible();
  await expect(page.getByText('Technical & Business Capabilities')).toBeVisible();
});

test('can select a demo persona and land in the Studio', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByTestId('studio-tab-cases')).toBeVisible();
});

test('can create a new project targeting a real, reachable URL', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();

  projectName = `E2E Project ${Date.now()}`;
  await page.getByTestId('new-project-button').click();
  await page.getByTestId('new-project-name-input').fill(projectName);
  await page.getByTestId('new-project-url-input').fill('https://httpbin.org/get');
  await page.getByTestId('new-project-submit').click();

  // Modal closes and the new project becomes the active one.
  await expect(page.getByTestId('new-project-name-input')).toHaveCount(0);
  await expectActiveProject(page, projectName);
});

test('can introspect a live URL and AI-generate real test cases from it', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();
  await expectActiveProject(page, projectName);

  await page.getByTestId('studio-tab-ingest').click();
  await page.getByTestId('quick-sample-httpbin-http-probe').click();

  // Real network introspection of httpbin.org — wait for the formed
  // description panel to populate with real content, not a stub.
  await expect(page.getByText('Enter a target URL above to start automatically forming test case descriptions.')).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId('ai-generate-submit').click();

  // Generation redirects to the Cases tab once the real backend call resolves.
  await expect(page.getByTestId('studio-tab-cases')).toHaveClass(/text-emerald-300/, { timeout: 30_000 });

  const caseRows = page.locator('[data-testid^="case-row-"]');
  await expect(caseRows.first()).toBeVisible({ timeout: 15_000 });
  expect(await caseRows.count()).toBeGreaterThan(0);

  const firstRowTestId = await caseRows.first().getAttribute('data-testid');
  firstCaseTestId = firstRowTestId ? firstRowTestId.replace('case-row-', '') : null;
  expect(firstCaseTestId).toBeTruthy();
});

test('can execute a real test case and see a genuine pass/fail result', async ({ page }) => {
  test.skip(!firstCaseTestId, 'No test case was generated in the previous step.');

  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();
  await expectActiveProject(page, projectName);
  await page.getByTestId('studio-tab-cases').click();

  const runButton = page.getByTestId(`run-preview-${firstCaseTestId}`);
  await expect(runButton).toBeVisible();
  await runButton.click();

  // Wait for the run to actually complete (button re-enables) rather than
  // asserting on a fixed timeout — the result comes from a real HTTP call.
  await expect(runButton).toBeEnabled({ timeout: 20_000 });

  const row = page.getByTestId(`case-row-${firstCaseTestId}`);
  await expect(row.getByText(/PASS|FAIL/)).toBeVisible();
});

test('Analytics tab reflects the real run just executed — not fabricated history', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();
  await expectActiveProject(page, projectName);

  await page.getByTestId('studio-tab-analytics').click();

  const totalRuns = page.getByTestId('analytics-total-runs');
  await expect(totalRuns).toBeVisible({ timeout: 15_000 });
  const value = parseInt((await totalRuns.textContent()) || '0', 10);

  // This is the regression check for the fake-data bug: if the platform ever
  // reintroduces the old seeded/randomized analytics fallback, this project
  // would show a suspiciously large run count immediately after a single
  // manual execution. We only ran (at most) one real test in this journey.
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThan(50);
});

test('Multi-Cloud Deploy modal offers a real Docker bundle download', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('nav-studio').click();
  await expectActiveProject(page, projectName);

  await page.getByTestId('open-deploy-modal').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-docker-zip').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  const path = await download.path();
  expect(path).toBeTruthy();
});

test('Billing modal shows the real pricing catalogue (matches server PRICING_TIERS)', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('credits-pill').click();

  // These figures must match server/billing.ts PRICING_TIERS exactly — if
  // pricing is ever changed in one place and not the other, this test fails.
  await expect(page.getByTestId('pricing-tier-starter_pack')).toContainText('$29');
  await expect(page.getByTestId('pricing-tier-pro_team')).toContainText('$119');
  await expect(page.getByTestId('pricing-tier-enterprise_pack')).toContainText('$399');
});

test('can log out and return to a guest state', async ({ page }) => {
  await selectPersona(page, 'standalone');
  await page.getByTestId('user-menu-button').click();
  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('persona-switcher')).toContainText('Guest');
});
