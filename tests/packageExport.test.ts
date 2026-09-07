import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';

/**
 * The "Multi-Cloud Deploy" / "Download .ZIP" CUJ promises a self-contained
 * Docker package the customer can run entirely on their own infrastructure.
 * This test builds a real package (via the real HTTP route, with real auth
 * and real test-case data) and then actually validates the generated
 * artifacts rather than trusting that the strings look plausible:
 *   - every generated .js file is syntactically valid (`node --check`)
 *   - the two library modules actually export the functions server.js and
 *     run-cli.js require from them
 *   - the Dockerfile's COPY instructions all reference paths that are
 *     genuinely present in the archive
 *   - the seeded data/tests.json contains the real test case we created,
 *     not placeholder content
 */

let tmpDir: string;
let originalCwd: string;
let app: express.Express;
let token: string;
let projectId: string;
let stopScheduler: () => void;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-packageexport-test-'));
  process.chdir(tmpDir);

  const { authRouter } = await import('../server/routes/authRoutes.js');
  const { projectRouter, stopScheduler: stop } = await import('../server/routes/projectRoutes.js');
  stopScheduler = stop;
  const { packageRouter } = await import('../server/routes/packageRoutes.js');

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/package', packageRouter);

  const loginRes = await request(app).post('/api/auth/login').send({ email: 'developer@indie.io', password: 'indie123!' });
  token = loginRes.body.token;

  const projRes = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Export Verification Project', siteUrl: 'https://registry.npmjs.org', description: 'test' });
  projectId = projRes.body.id;

  await request(app)
    .post(`/api/projects/${projectId}/cases`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Root endpoint returns 200',
      category: 'Smoke',
      priority: 'High',
      type: 'http',
      spec: { requests: [{ name: 'root', method: 'GET', path: '/' }], expect: { statusIn: [200] } },
    });
}, 20_000);

afterAll(() => {
  stopScheduler();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Docker export CUJ produces a real, runnable package', () => {
  it('downloads a real zip archive containing this project\'s real test case', async () => {
    const res = await request(app)
      .get(`/api/package/${projectId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('Package download failed body:', res.body?.toString?.());
    }
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('zip');
    const zipBuffer: Buffer = res.body;
    expect(zipBuffer.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.keys(zip.files);
    const rootDir = fileNames[0].split('/')[0];

    // Extract every generated file into a real temp directory.
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-export-extract-'));
    for (const name of fileNames) {
      const entry = zip.files[name];
      const outPath = path.join(extractDir, name);
      if (entry.dir) {
        fs.mkdirSync(outPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, await entry.async('nodebuffer'));
      }
    }

    // Install the archive's own declared dependencies exactly as a real
    // customer would via run-cli.sh ("npm install --silent && node run-cli.js"),
    // so the checks below run against the package's real, self-contained
    // dependency tree rather than borrowing this repo's node_modules.
    execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: path.join(extractDir, rootDir),
      stdio: 'pipe',
    });

    // 1. Every generated JS file must be syntactically valid — this is a
    //    real Node.js syntax check, not a string-matching heuristic.
    const jsFiles = fileNames.filter(n => n.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const jsFile of jsFiles) {
      const fullPath = path.join(extractDir, jsFile);
      expect(() => execFileSync('node', ['--check', fullPath], { stdio: 'pipe' })).not.toThrow();
    }

    // 2. The two library modules actually export what server.js / run-cli.js
    //    genuinely use them for (not just "syntactically valid" — actually
    //    usable). The standalone package's lib/specParser.js is a deliberately
    //    minimal runtime (template resolution only, for replaying pre-built
    //    specs) — it does not re-implement the full spec parser used to
    //    *author* new tests, so it only needs to export `get`/`resolveTemplates`.
    const specParserPath = path.join(extractDir, `${rootDir}/lib/specParser.js`);
    const genericRunnerPath = path.join(extractDir, `${rootDir}/lib/genericRunner.js`);
    const require = createRequire(import.meta.url);
    const specParserLib = require(specParserPath);
    const genericRunnerLib = require(genericRunnerPath);
    expect(typeof specParserLib.get).toBe('function');
    expect(typeof specParserLib.resolveTemplates).toBe('function');
    expect(typeof genericRunnerLib.runTestCase).toBe('function');

    // 3. The generated runner actually works end-to-end against a real
    //    reachable URL — proving the exported package isn't just valid JS,
    //    it's a functioning test runner. (registry.npmjs.org is used here,
    //    not api.github.com, because GitHub's public API rate-limits shared
    //    sandbox/CI IPs with a 403 — an environmental flakiness risk, not a
    //    product bug — whereas the npm registry is built for exactly this
    //    kind of high-volume automated traffic.)
    const liveResult = await genericRunnerLib.runTestCase(
      { type: 'http', spec: { requests: [{ name: 'root', method: 'GET', path: '/' }], expect: { statusIn: [200] } } },
      {},
      'https://registry.npmjs.org'
    );
    expect(liveResult.pass).toBe(true);

    // 4. Every path the Dockerfile COPYs must actually exist in the archive.
    const dockerfile = fs.readFileSync(path.join(extractDir, `${rootDir}/Dockerfile`), 'utf-8');
    const copyLines = dockerfile.match(/^COPY\s+(\S+)\s+/gm) || [];
    for (const line of copyLines) {
      const src = line.replace(/^COPY\s+/, '').split(/\s+/)[0];
      if (src.startsWith('--from')) continue; // multi-stage copy from a prior build stage, not from the archive
      const normalized = src.replace(/^\.\//, '').replace(/\/$/, '');
      const existsAsFile = fileNames.includes(`${rootDir}/${normalized}`);
      const existsAsDir = fileNames.some(n => n.startsWith(`${rootDir}/${normalized}/`));
      expect(existsAsFile || existsAsDir, `Dockerfile COPYs "${src}" but it is not in the archive`).toBe(true);
    }

    // 5. The seeded test data is the real test case we created — not
    //    placeholder/fabricated content.
    const testsJson = JSON.parse(fs.readFileSync(path.join(extractDir, `${rootDir}/data/tests.json`), 'utf-8'));
    expect(testsJson.some((t: any) => t.title === 'Root endpoint returns 200')).toBe(true);

    // 6. package.json inside the archive is valid, parseable JSON with the
    //    dependencies server.js/run-cli.js actually need.
    const packageJson = JSON.parse(fs.readFileSync(path.join(extractDir, `${rootDir}/package.json`), 'utf-8'));
    expect(packageJson.dependencies).toHaveProperty('axios');
    expect(packageJson.dependencies).toHaveProperty('express');

    fs.rmSync(extractDir, { recursive: true, force: true });
  }, 60_000);

  it('refuses to let a user download another user\'s project package', async () => {
    // developer@indie.io does not own the org's seeded projects.
    const res = await request(app)
      .get(`/api/package/proj_github_api/download`)
      .set('Authorization', `Bearer ${token}`);
    expect([403, 404]).toContain(res.status);
  });
});
