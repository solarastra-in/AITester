import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * Regression test for a critical security fix: server/auth.ts used to fall
 * back to a hardcoded JWT signing secret ('verity-super-secure-jwt-signing-
 * secret-2026') that had been committed to source control since this repo's
 * first commit — any deployment that never explicitly set JWT_SECRET (which
 * .env.example never even documented) would silently sign every user's
 * token, including platform_admin, with a secret anyone reading this
 * repository already knows. This test proves the server now refuses to
 * start in production without a real, operator-provided secret, rather than
 * silently running insecurely.
 *
 * Runs against the actual built dist/server.cjs (not vitest's module
 * loader), since the whole point is verifying real process start-up
 * behavior, including its exit code. Builds it in beforeAll if it doesn't
 * already exist, rather than assuming `npm run build` already ran — a
 * plain `npm test` right after `npm install` (with no prior build step)
 * used to fail here confusingly, and this same gap would have silently
 * broken this repo's own CI "lint and unit tests" job, which runs `npm
 * test` without a preceding build.
 */

const DIST_SERVER_PATH = path.resolve('dist/server.cjs');

beforeAll(() => {
  if (!fs.existsSync(DIST_SERVER_PATH)) {
    execFileSync('npm', ['run', 'build'], { stdio: 'pipe', timeout: 120_000 });
  }
}, 130_000);

let tmpDataDir: string | null = null;

afterEach(() => {
  if (tmpDataDir) {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    tmpDataDir = null;
  }
});

describe('JWT_SECRET production safety', () => {
  it('refuses to start (non-zero exit) in production with no JWT_SECRET set', () => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-jwt-fail-test-'));

    let threw = false;
    try {
      execFileSync('node', [DIST_SERVER_PATH], {
        env: { ...process.env, NODE_ENV: 'production', PORT: '0', DATA_DIR: tmpDataDir, JWT_SECRET: '' },
        timeout: 3000,
        stdio: 'pipe',
      });
    } catch (err: any) {
      threw = true;
      // Node exits with a non-zero code on an uncaught throw at module load.
      expect(err.status).not.toBe(0);
      expect(String(err.stderr)).toContain('JWT_SECRET environment variable is required in production');
    }
    expect(threw).toBe(true);
  });

  it('starts successfully in production when a real JWT_SECRET is provided', () => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-jwt-ok-test-'));
    const port = 4700 + Math.floor(Math.random() * 200);

    // A short-lived child process: if it's still alive (didn't crash) after
    // a moment and responds to a health check, the fix's "happy path" works.
    const { spawn } = require('child_process');
    const child = spawn('node', [DIST_SERVER_PATH], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATA_DIR: tmpDataDir, JWT_SECRET: 'a-real-test-only-secret-value' },
      stdio: 'pipe',
    });

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`http://localhost:${port}/api/health`);
          expect(res.status).toBe(200);
          settled = true;
          child.kill();
          resolve();
        } catch (err) {
          child.kill();
          reject(err);
        }
      }, 1500);

      child.on('exit', (code: number) => {
        if (!settled) {
          clearTimeout(timer);
          reject(new Error(`Server exited early (code ${code}) when it should have stayed up with a valid JWT_SECRET.`));
        }
      });
    });
  }, 10_000);
});
