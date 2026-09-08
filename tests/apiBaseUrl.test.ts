import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Regression test for a real production bug: verity.whyor.in/studio was
 * failing to connect with "Unable to connect to Verity API Engine at
 * [https://ais-dev-...run.app]" — the wrong (dev) backend URL, even though
 * the deployment's VITE_API_URL was (or should have been) configured
 * correctly.
 *
 * Root cause: getApiBaseUrl()'s domain-based fallback ("if the hostname
 * includes whyor.in/vercel.app/pages.dev, use DEFAULT_CLOUD_RUN_ENGINE_URL")
 * was checked BEFORE the build-time VITE_API_URL env var — so for any
 * deployment on one of those domains, the hardcoded default always won
 * regardless of what VITE_API_URL was actually set to. Fixed by checking
 * VITE_API_URL first; the domain-based guess is now only used when nothing
 * else configured a target explicitly.
 *
 * import.meta.env.VITE_API_URL is resolved by Vite's transform at module
 * load time, not read reactively from process.env on every call — so each
 * test that needs a different VITE_API_URL uses vi.stubEnv() followed by
 * vi.resetModules() + a fresh dynamic import, forcing a fresh transform
 * that picks up the stubbed value.
 */

function stubBrowserGlobals(hostname: string, opts: { search?: string; localStorageValue?: string | null } = {}) {
  const store = new Map<string, string>();
  if (opts.localStorageValue) store.set('verity_api_engine_url', opts.localStorageValue);
  const localStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };
  (globalThis as any).window = { location: { hostname, search: opts.search || '' }, localStorage: localStorageStub };
  (globalThis as any).localStorage = localStorageStub;
}

async function freshApiModule() {
  vi.resetModules();
  return import('../src/services/api.js');
}

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getApiBaseUrl — precedence order', () => {
  it('falls back to the domain-based default only when VITE_API_URL is not set', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('verity.whyor.in');
    const { getApiBaseUrl, DEFAULT_CLOUD_RUN_ENGINE_URL } = await freshApiModule();

    expect(getApiBaseUrl()).toBe(DEFAULT_CLOUD_RUN_ENGINE_URL);
  });

  it('the default itself points at the "pre" (production) Cloud Run URL, not "dev"', async () => {
    const { DEFAULT_CLOUD_RUN_ENGINE_URL } = await freshApiModule();
    expect(DEFAULT_CLOUD_RUN_ENGINE_URL).toContain('ais-pre-');
    expect(DEFAULT_CLOUD_RUN_ENGINE_URL).not.toContain('ais-dev-');
  });

  it('localStorage override still takes priority over VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://build-time-configured.example.com');
    stubBrowserGlobals('verity.whyor.in', { localStorageValue: 'https://manually-overridden.example.com' });
    const { getApiBaseUrl } = await freshApiModule();

    expect(getApiBaseUrl()).toBe('https://manually-overridden.example.com');
  });

  it('an in-memory override (setApiBaseUrl) takes priority over everything', async () => {
    vi.stubEnv('VITE_API_URL', 'https://build-time-configured.example.com');
    stubBrowserGlobals('verity.whyor.in', { localStorageValue: 'https://stored.example.com' });
    const { getApiBaseUrl, setApiBaseUrl } = await freshApiModule();
    setApiBaseUrl('https://runtime-override.example.com', { persist: false, notify: false });

    expect(getApiBaseUrl()).toBe('https://runtime-override.example.com');
  });

  it('a non-whyor/vercel/pages.dev host with no VITE_API_URL falls back to same-origin', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('my-custom-domain.example.com');
    const { getApiBaseUrl } = await freshApiModule();

    expect(getApiBaseUrl()).toBe('');
  });
});

// The two tests proving VITE_API_URL beats the domain-based default (the
// actual reported production bug) live in tests/apiBaseUrlViteEnv.test.ts,
// in their own file — import.meta.env.VITE_API_URL is resolved once per
// vitest worker at Vite's initial config, so it needs to be set before this
// file's very first import of src/services/api.ts, which the rest of this
// file's tests (deliberately exercising the *unset* case) can't share.
