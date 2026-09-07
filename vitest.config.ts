import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the unit/integration suite (tests/*.test.ts). The Playwright
    // browser suite lives in tests/e2e/*.spec.ts and runs via `npm run test:e2e`
    // (playwright test), not vitest — the two use different `test` globals
    // and must stay separated.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
