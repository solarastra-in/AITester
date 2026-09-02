const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'verity.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK(role IN ('platform_admin','org_admin','member','standalone')),
  org_id TEXT,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  must_reset_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  org_id TEXT,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  description TEXT,
  dataset_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  ext_id TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  priority TEXT DEFAULT 'Medium',
  tags TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'http',
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  ran_at TEXT NOT NULL,
  pass INTEGER NOT NULL,
  message TEXT,
  requests_json TEXT,
  executed_by TEXT NOT NULL DEFAULT 'self-hosted',
  credits_charged INTEGER NOT NULL DEFAULT 0,
  run_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_suites_project ON suites(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_suite ON test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_runs_project ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
`);

module.exports = db;
