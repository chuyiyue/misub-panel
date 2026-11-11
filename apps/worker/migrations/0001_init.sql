-- misub-panel initial schema (9 tables)
-- Business state lives here; MiSub base URL and tokens are Worker Secrets, never stored in D1.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  invited_by TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_days INTEGER NOT NULL,
  device_limit INTEGER NOT NULL DEFAULT 0,
  misub_profile_id TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0, -- reserved for phase-2 payments
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  plan_id TEXT NOT NULL REFERENCES plans (id),
  token TEXT NOT NULL UNIQUE, -- the secret in /sub/<token>, 24-byte random base64url
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'banned')),
  device_limit INTEGER NOT NULL DEFAULT 0 -- snapshot of the plan limit at issue time; 0 = follow plan
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);

CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans (id),
  max_uses INTEGER NOT NULL DEFAULT 1,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'zh',
  sort INTEGER NOT NULL DEFAULT 0
);

-- Only salted IP hashes are stored; rows older than 7 days are deleted by the daily cron.
CREATE TABLE access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL REFERENCES subscriptions (id),
  ip_hash TEXT NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX idx_access_log_sub_at ON access_log (subscription_id, at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  refresh_hash TEXT NOT NULL, -- hash of the refresh token, so a D1 leak does not leak usable tokens
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('native', 'v2board', 'xboard')),
  manifest TEXT NOT NULL DEFAULT '{}', -- JSON: entry, config schema / config.json values
  active INTEGER NOT NULL DEFAULT 0
);
