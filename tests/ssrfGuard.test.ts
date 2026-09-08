import { describe, it, expect } from 'vitest';
import { assertPublicUrl, SsrfBlockedError } from '../server/ssrfGuard.js';

describe('assertPublicUrl — blocks private/internal targets', () => {
  const blocked = [
    'http://localhost/',
    'http://localhost:3000/api/admin',
    'http://sub.localhost/',
    'http://127.0.0.1/',
    'http://127.0.0.1:8080/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata endpoint (AWS/GCP/Azure)
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'ftp://example.com/',
    'file:///etc/passwd',
    'not a url at all',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(SsrfBlockedError);
    });
  }
});

describe('assertPublicUrl — allows real public targets', () => {
  const allowed = [
    'https://registry.npmjs.org/',
    'https://pypi.org/',
    'https://api.github.com/',
  ];

  for (const url of allowed) {
    it(`allows ${url}`, async () => {
      await expect(assertPublicUrl(url)).resolves.toBeUndefined();
    });
  }
}, 15_000);

describe('assertPublicUrl — hostname resolution edge cases', () => {
  it('rejects a hostname that fails to resolve', async () => {
    await expect(assertPublicUrl('https://this-domain-should-not-exist-verity-test.invalid/'))
      .rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
