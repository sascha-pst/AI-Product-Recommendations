-- D1 schema. Apply with: npx wrangler d1 execute rec-engine --remote --file=schema.sql
-- Keyed on the Qualtrics ResponseID (rid). No names, emails or IP addresses are stored.

CREATE TABLE IF NOT EXISTS sessions (
  rid             TEXT NOT NULL,
  scenario        TEXT NOT NULL,
  arm             TEXT NOT NULL,
  content_source  TEXT NOT NULL,   -- H, A or HY: what the participant actually saw
  label           TEXT NOT NULL,   -- human, ai, both, none: what it was labeled
  stimuli_version TEXT NOT NULL,   -- hash of src/recs.json at deploy time
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (rid, scenario)
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rid         TEXT,
  arm         TEXT,
  scenario    TEXT,
  type        TEXT NOT NULL,
  product_id  TEXT,
  value       REAL,               -- e.g. dwell ms, time to choice ms, rank chosen
  client_ts   INTEGER,
  server_ts   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_rid ON events (rid);


-- Study v2 is isolated from the previous six-arm study. Apply before deployment.
CREATE TABLE IF NOT EXISTS study_assignments (
  study_id TEXT NOT NULL,
  rid TEXT NOT NULL,
  arm TEXT NOT NULL CHECK (arm IN ('1','2')),
  scenario TEXT NOT NULL CHECK (scenario = 'commute'),
  content_source TEXT NOT NULL CHECK (content_source = 'A'),
  label TEXT NOT NULL,
  stimuli_version TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  choice_json TEXT,
  completed_at INTEGER,
  PRIMARY KEY (study_id,rid)
);
CREATE TABLE IF NOT EXISTS study_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id TEXT NOT NULL,
  rid TEXT NOT NULL,
  arm TEXT NOT NULL,
  scenario TEXT NOT NULL,
  type TEXT NOT NULL,
  product_id TEXT,
  value REAL,
  client_ts INTEGER,
  server_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_events_rid ON study_events(study_id,rid);

-- Issued only by an authenticated Qualtrics Survey Flow Web Service request.
CREATE TABLE IF NOT EXISTS verified_study_sessions (
  study_id TEXT NOT NULL,
  rid TEXT NOT NULL,
  survey_id TEXT NOT NULL,
  arm TEXT NOT NULL CHECK (arm IN ('1','2')),
  scenario TEXT NOT NULL CHECK (scenario = 'commute'),
  stimuli_version TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  preview INTEGER NOT NULL CHECK (preview IN (0,1)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (study_id,rid)
);
