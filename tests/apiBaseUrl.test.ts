import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * getApiBaseUrl() has been substantially strengthened since the original
 * fix for the verity.whyor.in "wrong dev URL" production bug (see git log
 * for that fix). Notably:
 *   - VITE_API_URL discovery (discoverViteApiUrl()) now checks
 *     import.meta.env, process.env, AND runtime window globals — and reads
 *     process.env at CALL TIME, so vi.stubEnv() reliably affects it without
 *     needing the resetModules/fresh-import workaround the original fix
 *     required (import.meta.env alone is still resolved once per worker,
 *     but process.env is checked as a real fallback now).
 *   - The domain-based guess is narrower and more precise: only
 *     vercel.app/pages.dev hosts route to DEFAULT_CLOUD_RUN_ENGINE_URL, and
 *     only when NOT also on run.app or localhost. whyor.in was removed
 *     from this list entirely — it now falls through to the same-origin
 *     default, which is correct if verity.whyor.in's backend is reached via
 *     the same origin (e.g. a platform-level rewrite/proxy) rather than a
 *     separate cross-origin Cloud Run URL.
 *   - The final fallback is '/api' (a same-origin relative path), not ''.
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

afterEach(async () => {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
  vi.unstubAllEnvs();
  // setApiBaseUrl's in-memory override is real module-level state that
  // persists across tests within the same module cache (import() without
  // vi.resetModules() returns the same cached instance) — must be cleared
  // explicitly, or a later test inherits an earlier test's override.
  const { setApiBaseUrl } = await import('../src/services/api.js');
  setApiBaseUrl(null, { persist: false, notify: false });
});

describe('getApiBaseUrl — precedence order', () => {
  it('an explicit VITE_API_URL (via process.env) beats the domain-based guess, even on whyor.in', async () => {
    vi.stubEnv('VITE_API_URL', 'https://the-real-configured-backend.example.com');
    stubBrowserGlobals('verity.whyor.in');
    const { getApiBaseUrl } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('https://the-real-configured-backend.example.com');
  });

  it('an explicit VITE_API_URL beats the domain-based guess on a vercel.app host too', async () => {
    vi.stubEnv('VITE_API_URL', 'https://the-real-configured-backend.example.com');
    stubBrowserGlobals('my-preview.vercel.app');
    const { getApiBaseUrl } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('https://the-real-configured-backend.example.com');
  });

  it('whyor.in with no VITE_API_URL falls back to same-origin, NOT the Cloud Run default', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('verity.whyor.in');
    const { getApiBaseUrl, DEFAULT_CLOUD_RUN_ENGINE_URL } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('/api');
    expect(getApiBaseUrl()).not.toBe(DEFAULT_CLOUD_RUN_ENGINE_URL);
  });

  it('a vercel.app host with no VITE_API_URL DOES fall back to the Cloud Run default', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('my-preview.vercel.app');
    const { getApiBaseUrl, DEFAULT_CLOUD_RUN_ENGINE_URL } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe(DEFAULT_CLOUD_RUN_ENGINE_URL);
  });

  it('a vercel.app host that is ALSO on run.app does not use the domain guess (same-origin wins)', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('my-service-vercel.run.app');
    const { getApiBaseUrl } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('/api');
  });

  it('the Cloud Run default itself points at the "pre" (production) URL, not "dev"', async () => {
    const { DEFAULT_CLOUD_RUN_ENGINE_URL } = await import('../src/services/api.js');
    expect(DEFAULT_CLOUD_RUN_ENGINE_URL).toContain('ais-pre-');
    expect(DEFAULT_CLOUD_RUN_ENGINE_URL).not.toContain('ais-dev-');
  });

  it('localStorage override still takes priority over VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://build-time-configured.example.com');
    stubBrowserGlobals('verity.whyor.in', { localStorageValue: 'https://manually-overridden.example.com' });
    const { getApiBaseUrl } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('https://manually-overridden.example.com');
  });

  it('an in-memory override (setApiBaseUrl) takes priority over everything', async () => {
    vi.stubEnv('VITE_API_URL', 'https://build-time-configured.example.com');
    stubBrowserGlobals('verity.whyor.in', { localStorageValue: 'https://stored.example.com' });
    const { getApiBaseUrl, setApiBaseUrl } = await import('../src/services/api.js');
    setApiBaseUrl('https://runtime-override.example.com', { persist: false, notify: false });

    expect(getApiBaseUrl()).toBe('https://runtime-override.example.com');
  });

  it('a fully unrelated host with no VITE_API_URL falls back to the same-origin relative path', async () => {
    vi.stubEnv('VITE_API_URL', '');
    stubBrowserGlobals('my-custom-domain.example.com');
    const { getApiBaseUrl } = await import('../src/services/api.js');

    expect(getApiBaseUrl()).toBe('/api');
  });
});
