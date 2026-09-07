import { test, expect, Page } from '@playwright/test';

/**
 * Complements studio-flow.spec.ts (which drives the standalone developer's
 * full Studio journey) by checking the *other* three personas actually land
 * on, and are restricted to, the views the product promises for their role
 * (see Homepage's "Built for Superadmins, Customer Leads, and Standalone
 * Engineers" section and DEMO_PERSONAS in Navbar.tsx). This is a real,
 * no-mocking check against the running app — same caveat as the rest of
 * this suite: written and typechecked, but its first execution happens in
 * CI (see .github/workflows/ci.yml), not in the sandbox that authored it.
 */

async function selectPersona(page: Page, role: string) {
  await page.goto('/');
  await page.getByTestId('persona-switcher').click();
  await page.getByTestId(`persona-option-${role}`).click();
  await expect(page.getByTestId('persona-switcher')).not.toContainText('Guest');
}

test.describe('Persona: Platform Superadmin', () => {
  test('sees the Superadmin nav link and lands on the real console', async ({ page }) => {
    await selectPersona(page, 'platform_admin');
    await expect(page.getByTestId('nav-super-admin')).toBeVisible();
    await page.getByTestId('nav-super-admin').click();
    await expect(page).toHaveURL(/\/super-admin$/);
    await expect(page.getByRole('heading', { name: 'Platform Superadmin Console' })).toBeVisible();
  });

  test('also sees the Org Admin nav link (platform admin can act as org admin too)', async ({ page }) => {
    await selectPersona(page, 'platform_admin');
    await expect(page.getByTestId('nav-org-admin')).toBeVisible();
  });
});

test.describe('Persona: Customer Admin (org_admin)', () => {
  test('sees the Org Admin nav link, not Superadmin, and lands on their real org', async ({ page }) => {
    await selectPersona(page, 'org_admin');
    await expect(page.getByTestId('nav-org-admin')).toBeVisible();
    await expect(page.getByTestId('nav-super-admin')).toHaveCount(0);

    await page.getByTestId('nav-org-admin').click();
    await expect(page).toHaveURL(/\/org-admin$/);
    // Real org name from the seed data (server/db.ts) — not a placeholder.
    await expect(page.getByRole('heading', { name: 'Acme Cloud Solutions' })).toBeVisible();
  });
});

test.describe('Persona: Team Member', () => {
  test('does not see either admin nav link', async ({ page }) => {
    await selectPersona(page, 'member');
    await expect(page.getByTestId('nav-org-admin')).toHaveCount(0);
    await expect(page.getByTestId('nav-super-admin')).toHaveCount(0);
  });

  test('can still reach the Studio like any other authenticated user', async ({ page }) => {
    await selectPersona(page, 'member');
    await page.getByTestId('nav-studio').click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByTestId('studio-tab-cases')).toBeVisible();
  });
});

test.describe('Persona: Standalone Developer', () => {
  test('does not see either admin nav link', async ({ page }) => {
    await selectPersona(page, 'standalone');
    await expect(page.getByTestId('nav-org-admin')).toHaveCount(0);
    await expect(page.getByTestId('nav-super-admin')).toHaveCount(0);
  });
});
