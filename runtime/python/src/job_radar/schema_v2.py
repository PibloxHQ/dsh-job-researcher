"""DSH-owned SQLite schema extensions for job researcher.

Keeps legacy `offers` table (UNIQUE source, external_id) and adds:
- scoring columns on offers
- offer_feedback (YES/NO/MAYBE)
- source_state
- job_runs
"""

from __future__ import annotations

SCHEMA_V2 = """
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  employer TEXT DEFAULT '',
  location TEXT DEFAULT '',
  contract_type TEXT DEFAULT '',
  work_time TEXT DEFAULT 'unknown',
  remote TEXT DEFAULT 'unknown',
  url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  rome_codes TEXT DEFAULT '[]',
  raw_json TEXT DEFAULT '{}',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  interest TEXT DEFAULT 'unset',
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  score INTEGER,
  score_classification TEXT DEFAULT '',
  score_version TEXT DEFAULT '',
  score_details TEXT DEFAULT '',
  notified_at TEXT,
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_offers_interest ON offers(interest);
CREATE INDEX IF NOT EXISTS idx_offers_source ON offers(source);
CREATE INDEX IF NOT EXISTS idx_offers_score ON offers(score);
CREATE INDEX IF NOT EXISTS idx_offers_notified ON offers(notified_at);

CREATE TABLE IF NOT EXISTS offer_feedback (
  offer_id INTEGER PRIMARY KEY,
  decision TEXT NOT NULL DEFAULT 'UNREVIEWED',
  comment TEXT DEFAULT '',
  viewed INTEGER NOT NULL DEFAULT 0,
  decision_updated_at TEXT,
  FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_decision ON offer_feedback(decision);

CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT DEFAULT '',
  offers_seen INTEGER DEFAULT 0,
  offers_new INTEGER DEFAULT 0,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  sources_json TEXT DEFAULT '[]',
  offers_seen INTEGER DEFAULT 0,
  offers_new INTEGER DEFAULT 0,
  offers_updated INTEGER DEFAULT 0,
  offers_failed INTEGER DEFAULT 0,
  error_summary TEXT DEFAULT '',
  notify_status TEXT DEFAULT 'skipped'
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""

INTEREST_TO_DECISION = {
    "interested": "YES",
    "maybe": "MAYBE",
    "skip": "NO",
    "unset": "UNREVIEWED",
}

DECISION_TO_INTEREST = {
    "YES": "interested",
    "MAYBE": "maybe",
    "NO": "skip",
    "UNREVIEWED": "unset",
}

SCORE_VERSION = "legacy-v1"
