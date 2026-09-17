#!/usr/bin/env python3
"""Migrate legacy radar.db into DSH-owned location + schema v2/v3."""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure vendored package is importable when run as script
SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from job_radar.schema_v2 import (  # noqa: E402
    SCHEMA_V2,
    ensure_feedback_learning_schema,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def migrate(src: Path, dst: Path) -> dict:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(src, dst)

    conn = sqlite3.connect(dst)
    conn.row_factory = sqlite3.Row

    # Existing legacy DB already has `offers` without score columns.
    # CREATE TABLE IF NOT EXISTS will not alter it — add columns first, then indexes/tables.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(offers)")}
    if not cols:
        conn.executescript(SCHEMA_V2)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(offers)")}

    for col, decl in [
        ("score", "INTEGER"),
        ("score_classification", "TEXT DEFAULT ''"),
        ("score_version", "TEXT DEFAULT ''"),
        ("score_details", "TEXT DEFAULT ''"),
        ("notified_at", "TEXT"),
    ]:
        if col not in cols:
            conn.execute(f"ALTER TABLE offers ADD COLUMN {col} {decl}")

    # v2 tables/indexes only — application indexes come after ensure_application_schema.
    conn.executescript(
        """
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
    )

    # Seed feedback rows as UNREVIEWED only.
    # Legacy offers.interest came from score triage — NOT operator decisions.
    existing = {
        r[0]
        for r in conn.execute("SELECT offer_id FROM offer_feedback")
    }
    rows = conn.execute(
        "SELECT id, notes FROM offers"
    ).fetchall()
    inserted = 0
    for row in rows:
        oid = int(row["id"])
        if oid in existing:
            continue
        conn.execute(
            """
            INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
            VALUES (?, 'UNREVIEWED', ?, 0, NULL)
            """,
            (
                oid,
                row["notes"] or "",
            ),
        )
        inserted += 1

    for source, n in conn.execute(
        "SELECT source, COUNT(*) FROM offers GROUP BY source"
    ):
        conn.execute(
            """
            INSERT INTO source_state (source, enabled, offers_seen, updated_at)
            VALUES (?, 1, ?, ?)
            ON CONFLICT(source) DO UPDATE SET
              offers_seen=excluded.offers_seen,
              updated_at=excluded.updated_at
            """,
            (source, n, utc_now()),
        )

    for source in ("csp-filtre", "et", "ft", "csp"):
        conn.execute(
            "INSERT OR IGNORE INTO source_state (source, enabled, updated_at) VALUES (?, 1, ?)",
            (source, utc_now()),
        )

    ensure_feedback_learning_schema(conn, now=utc_now())
    conn.execute(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('migrated_at', ?)",
        (utc_now(),),
    )
    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM offers").fetchone()[0]
    feedback = conn.execute("SELECT COUNT(*) FROM offer_feedback").fetchone()[0]
    by_source = dict(
        conn.execute("SELECT source, COUNT(*) FROM offers GROUP BY source")
    )
    by_decision = dict(
        conn.execute(
            "SELECT decision, COUNT(*) FROM offer_feedback GROUP BY decision"
        )
    )
    conn.close()
    return {
        "dst": str(dst),
        "offers": total,
        "feedback": feedback,
        "feedback_inserted": inserted,
        "by_source": by_source,
        "by_decision": by_decision,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--dst", type=Path, required=True)
    args = ap.parse_args()
    if not args.src.exists():
        raise SystemExit(f"missing source db: {args.src}")
    result = migrate(args.src, args.dst)
    print(result)


if __name__ == "__main__":
    main()
