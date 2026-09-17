"""DSH-owned SQLite schema extensions for job researcher.

Keeps legacy `offers` table (UNIQUE source, external_id) and adds:
- scoring columns on offers
- offer_feedback (YES/NO/MAYBE)
- source_state
- job_runs
- application columns (schema v3) via ensure_application_schema
- feedback provenance / learning (schema v4) via ensure_feedback_learning_schema
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from job_radar.learning import SCORE_VERSION as FEEDBACK_SCORE_VERSION

# Base schema (v2). Application indexes/columns are NOT created here so that
# executescript(SCHEMA_V2) is safe against an existing v2 offer_feedback table.
# Call ensure_application_schema(conn) after this script (or alone) for v3.
# Call ensure_feedback_learning_schema(conn) for v4.
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

# Bumped with feedback-learning slice; keep alias for older imports.
SCORE_VERSION = FEEDBACK_SCORE_VERSION
LEGACY_SCORE_VERSION = "legacy-v1"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _schema_version(conn: Any) -> int:
    row = conn.execute(
        "SELECT value FROM schema_meta WHERE key='version'"
    ).fetchone()
    if not row:
        return 0
    try:
        return int(row[0])
    except (TypeError, ValueError):
        return 0


def ensure_application_schema(conn: Any, *, now: str | None = None) -> None:
    """Additive schema v3: ALTER application columns, then indexes.

    Safe on existing v2 ``offer_feedback`` (CREATE INDEX must not run before ALTER).
    Idempotent. Shared by Database, dsh_pipeline._ensure_schema, and migrate_db.
    """
    stamp = now or _utc_now()
    # Ensure table exists (fresh path) before PRAGMA / ALTER.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS offer_feedback (
          offer_id INTEGER PRIMARY KEY,
          decision TEXT NOT NULL DEFAULT 'UNREVIEWED',
          comment TEXT DEFAULT '',
          viewed INTEGER NOT NULL DEFAULT 0,
          decision_updated_at TEXT,
          FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_meta ("
        "key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )

    cols = {r[1] for r in conn.execute("PRAGMA table_info(offer_feedback)")}
    if "application_status" not in cols:
        conn.execute(
            "ALTER TABLE offer_feedback "
            "ADD COLUMN application_status TEXT NOT NULL DEFAULT 'NONE'"
        )
    if "applied_at" not in cols:
        conn.execute("ALTER TABLE offer_feedback ADD COLUMN applied_at TEXT")
    if "applied_local_day" not in cols:
        conn.execute("ALTER TABLE offer_feedback ADD COLUMN applied_local_day TEXT")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_feedback_application "
        "ON offer_feedback(application_status)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_feedback_applied_day "
        "ON offer_feedback(applied_local_day)"
    )
    if _schema_version(conn) < 3:
        conn.execute(
            "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '3')"
        )
    conn.execute(
        "INSERT OR IGNORE INTO schema_meta (key, value) "
        "VALUES ('application_schema_at', ?)",
        (stamp,),
    )


def ensure_feedback_learning_schema(conn: Any, *, now: str | None = None) -> None:
    """Additive schema v4: provenance columns + one-shot legacy disentangle.

    When ``comment`` exactly equals ``offers.notes`` **and** origin is empty or
    ``legacy``, copy to ``system_reason``, clear ``comment``, mark ``legacy``.
    Never rewrite ``feedback_origin='user'`` (REV-01: user comments mirror into
    ``offers.notes`` and must survive reopen / Python Database open).
    """
    stamp = now or _utc_now()
    ensure_application_schema(conn, now=stamp)

    cols = {r[1] for r in conn.execute("PRAGMA table_info(offer_feedback)")}
    if "system_reason" not in cols:
        conn.execute(
            "ALTER TABLE offer_feedback ADD COLUMN system_reason TEXT DEFAULT ''"
        )
    if "feedback_tags_json" not in cols:
        conn.execute(
            "ALTER TABLE offer_feedback "
            "ADD COLUMN feedback_tags_json TEXT DEFAULT '[]'"
        )
    if "feedback_origin" not in cols:
        conn.execute(
            "ALTER TABLE offer_feedback ADD COLUMN feedback_origin TEXT DEFAULT ''"
        )
    if "feedback_updated_at" not in cols:
        conn.execute(
            "ALTER TABLE offer_feedback ADD COLUMN feedback_updated_at TEXT"
        )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_feedback_origin "
        "ON offer_feedback(feedback_origin)"
    )

    disentangle_done = conn.execute(
        "SELECT value FROM schema_meta WHERE key = 'feedback_legacy_disentangle_at'"
    ).fetchone()
    if not disentangle_done:
        rows = conn.execute(
            """
            SELECT f.offer_id AS offer_id, f.comment AS comment, o.notes AS notes,
                   COALESCE(f.system_reason, '') AS system_reason,
                   COALESCE(f.feedback_origin, '') AS feedback_origin
            FROM offer_feedback f
            JOIN offers o ON o.id = f.offer_id
            WHERE COALESCE(f.comment, '') != ''
              AND (COALESCE(f.feedback_origin, '') = ''
                   OR f.feedback_origin = 'legacy')
              AND f.comment = COALESCE(o.notes, '')
            """
        ).fetchall()
        for row in rows:
            oid = int(row[0] if not hasattr(row, "keys") else row["offer_id"])
            comment = row[1] if not hasattr(row, "keys") else row["comment"]
            system_reason = (
                row[3] if not hasattr(row, "keys") else row["system_reason"]
            )
            reason = system_reason or comment or ""
            conn.execute(
                """
                UPDATE offer_feedback
                SET system_reason = ?,
                    comment = '',
                    feedback_origin = 'legacy'
                WHERE offer_id = ?
                """,
                (reason, oid),
            )
        conn.execute(
            "INSERT INTO schema_meta (key, value) "
            "VALUES ('feedback_legacy_disentangle_at', ?)",
            (stamp,),
        )

    conn.execute(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '4')"
    )
    conn.execute(
        "INSERT OR IGNORE INTO schema_meta (key, value) "
        "VALUES ('feedback_learning_schema_at', ?)",
        (stamp,),
    )
