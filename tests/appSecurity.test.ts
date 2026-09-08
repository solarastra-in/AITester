import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

let tmpDir: string;
let originalCwd: string;
let originalCorsEnv: string | undefined;
let originalNodeEnv: string | undefined;
let createApp: typeof import('../server/app.js')['createApp'];
let apiErrorHandler: typeof import('../server/app.js')['apiErrorHandler'];

beforeAll(async () => {
  originalCwd = process.cwd();
  originalCorsEnv = process.env.CORS_ALLOWED_ORIGINS;
  originalNodeEnv = process.env.NODE_ENV;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-appsecurity-test-'));
  process.chdir(tmpDir);

  // Set before the dynamic import below so createApp() picks it up when it
  // builds the CORS allowlist at construction time.
  process.env.CORS_ALLOWED_ORIGINS = 'https://verity.whyor.in,https://allowed-preview.vercel.app';

  ({ createApp, apiErrorHandler } = await import('../server/app.js'));
});

afterAll(() => {
  process.env.CORS_ALLOWED_ORIGINS = originalCorsEnv;
  process.env.NODE_ENV = originalNodeEnv;
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CORS allowlist', () => {
  it('reflects an allowed origin back in Access-Control-Allow-Origin', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://verity.whyor.in');
    expect(res.headers['access-control-allow-origin']).toBe('https://verity.whyor.in');
  });

  it('does not reflect a disallowed origin', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil-site.example.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil-site.example.com');
  });

  it('never sets Access-Control-Allow-Credentials (no cookie-based auth in this app)', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://verity.whyor.in');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('Security headers (helmet)', () => {
  it('sets standard hardening headers on every response', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });
});

describe('Auth endpoint rate limiting', () => {
  it('blocks login attempts after exceeding the configured limit', async () => {
    const app = createApp();
    const attempts: number[] = [];

    // The real limit is 20 per 15-minute window; fire more than that from
    // the same client and confirm a 429 shows up.
    for (let i = 0; i < 22; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });
      attempts.push(res.status);
    }

    expect(attempts).toContain(429);
    const firstLimited = attempts.indexOf(429);
    // Every attempt before the limit kicked in should have been rejected on
    // its own merits (401 bad credentials), not pre-emptively blocked.
    expect(attempts.slice(0, firstLimited).every(s => s === 401)).toBe(true);
  }, 20_000);
});

describe('apiErrorHandler', () => {
  const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body: any) => {
      res.body = body;
      return res;
    };
    return res;
  };

  it('returns a generic message for 5xx errors, never the raw internal error text', () => {
    const res = mockRes();
    const internalErr = new Error('ENOENT: no such file or directory, open \'/etc/shadow\'');
    apiErrorHandler(internalErr, {} as any, res, (() => {}) as any);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
    expect(res.body.error).not.toContain('ENOENT');
    expect(res.body.error).not.toContain('/etc/shadow');
  });

  it('keeps the specific, actionable message for 4xx errors', () => {
    const res = mockRes();
    const validationErr: any = new Error('Insufficient credits for this operation.');
    validationErr.status = 409;
    apiErrorHandler(validationErr, {} as any, res, (() => {}) as any);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Insufficient credits for this operation.');
  });

  it('defaults to 500 + generic message when the error has no status', () => {
    const res = mockRes();
    apiErrorHandler(new Error('some unexpected internal failure'), {} as any, res, (() => {}) as any);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
  });
});
