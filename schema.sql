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
