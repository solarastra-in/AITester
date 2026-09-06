import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;
let originalCwd: string;
let calculateNextRunDate: typeof import('../server/routes/projectRoutes.js')['calculateNextRunDate'];

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verity-scheduling-test-'));
  process.chdir(tmpDir);
  ({ calculateNextRunDate } = await import('../server/routes/projectRoutes.js'));
});

afterAll(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('calculateNextRunDate', () => {
  it('schedules a daily run in the future', () => {
    const next = new Date(calculateNextRunDate('daily', undefined, '02:00'));
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCHours()).toBe(2);
  });

  it('schedules a weekly run on the requested day of week', () => {
    const next = new Date(calculateNextRunDate('weekly', undefined, '09:00', 3)); // Wednesday
    expect(next.getTime()).toBeGreaterThan(Date.now());
    expect(next.getUTCDay()).toBe(3);
    expect(next.getUTCHours()).toBe(9);
  });

  it('always returns a real future timestamp, never a fixed/backdated placeholder', () => {
    for (const type of ['daily', 'weekly'] as const) {
      const next = new Date(calculateNextRunDate(type));
      expect(next.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
