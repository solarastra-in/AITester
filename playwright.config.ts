import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against a real, running instance of the app (server.ts, which serves
 * both the API and the Vite/static frontend) — no mocked network layer.
 * Playwright boots it itself via `webServer` unless E2E_BASE_URL is set to
 * point at an already-running instance.
 */
const PORT = process.env.E2E_PORT || '4173';
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // the suite shares one seeded backend/project across tests
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 }, // desktop viewport so the lg: Studio tab bar renders
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Isolated data dir so this suite never touches the real repo database.
        // Uses plain shell env-var syntax (works on Linux/macOS CI runners and
        // in the dev container); Windows users should run with cross-env or
        // set E2E_BASE_URL against a manually-started server instead.
        command: `bash -c "NODE_ENV=production PORT=${PORT} DATA_DIR=.e2e-data node dist/server.cjs"`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
