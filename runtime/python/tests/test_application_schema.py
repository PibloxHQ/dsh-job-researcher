"""Regression: Python-first v2 → v3 application schema (no pytest required)."""

from __future__ import annotations

import importlib.util
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
MIGRATE_SCRIPT = ROOT / "scripts" / "migrate_db.py"
sys.path.insert(0, str(SRC))

from job_radar.db import Database  # noqa: E402
from job_radar.dsh_pipeline import _ensure_schema  # noqa: E402
from job_radar.schema_v2 import SCHEMA_V2, ensure_application_schema  # noqa: E402


def _load_migrate():
    spec = importlib.util.spec_from_file_location("migrate_db", MIGRATE_SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_v2_db(path: Path) -> None:
    """Existing production-shaped v2 DB: offer_feedback without application columns."""
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA_V2)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(offer_feedback)")}
    assert "application_status" not in cols
    now = "2026-09-15T10:00:00"
    conn.execute(
        """
        INSERT INTO offers (
          source, external_id, title, employer, location,
          first_seen_at, last_seen_at, interest, score
        ) VALUES ('csp', 'e1', 'Dev', 'Co', 'Paris', ?, ?, 'interested', 3)
        """,
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
        VALUES (1, 'YES', 'keep-me', 1, ?)
        """,
        (now,),
    )
    conn.execute(
        "INSERT INTO schema_meta (key, value) VALUES ('version', '2')"
    )
    conn.execute(
        "INSERT INTO schema_meta (key, value) VALUES ('migrated_at', ?)",
        (now,),
    )
    conn.commit()
    conn.close()


def _upgrade(path: Path) -> None:
    conn = sqlite3.connect(path)
    ensure_application_schema(conn)
    conn.commit()
    conn.close()


class ApplicationSchemaUpgradeTests(unittest.TestCase):
    def test_python_first_existing_v2_via_ensure_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            _make_v2_db(db_path)
            # Regression: previously SCHEMA_V2 created indexes before ALTER → OperationalError
            _ensure_schema(db_path)
            conn = sqlite3.connect(db_path)
            cols = {r[1] for r in conn.execute("PRAGMA table_info(offer_feedback)")}
            self.assertIn("application_status", cols)
            row = conn.execute(
                "SELECT decision, comment, application_status, applied_at "
                "FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row[0], "YES")
            self.assertEqual(row[1], "keep-me")
            self.assertEqual(row[2], "NONE")
            self.assertIsNone(row[3])
            ver = conn.execute(
                "SELECT value FROM schema_meta WHERE key='version'"
            ).fetchone()[0]
            self.assertEqual(ver, "4")
            conn.close()

    def test_database_init_upgrades_existing_v2(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            _make_v2_db(db_path)
            db = Database(db_path)
            row = db._conn.execute(
                "SELECT decision, application_status FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row["decision"], "YES")
            self.assertEqual(row["application_status"], "NONE")
            db.close()

    def test_repeat_migration_preserves_applied_and_interest(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            _make_v2_db(db_path)
            _upgrade(db_path)
            conn = sqlite3.connect(db_path)
            conn.execute(
                """
                UPDATE offer_feedback
                SET application_status='APPLIED',
                    applied_at='2026-09-16T10:00:00Z',
                    applied_local_day='2026-09-16'
                WHERE offer_id=1
                """
            )
            conn.commit()
            conn.close()

            _ensure_schema(db_path)
            _upgrade(db_path)
            db = Database(db_path)
            row = db._conn.execute(
                "SELECT decision, comment, application_status, applied_at, applied_local_day "
                "FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row["decision"], "YES")
            self.assertEqual(row["comment"], "keep-me")
            self.assertEqual(row["application_status"], "APPLIED")
            self.assertEqual(row["applied_at"], "2026-09-16T10:00:00Z")
            self.assertEqual(row["applied_local_day"], "2026-09-16")
            stamp1 = db._conn.execute(
                "SELECT value FROM schema_meta WHERE key='application_schema_at'"
            ).fetchone()[0]
            db.close()

            db2 = Database(db_path)
            stamp2 = db2._conn.execute(
                "SELECT value FROM schema_meta WHERE key='application_schema_at'"
            ).fetchone()[0]
            self.assertEqual(stamp1, stamp2)
            db2.close()

    def test_fresh_database_has_application_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "fresh.db")
            cols = {
                r[1]
                for r in db._conn.execute("PRAGMA table_info(offer_feedback)")
            }
            self.assertIn("application_status", cols)
            self.assertIn("applied_at", cols)
            self.assertIn("applied_local_day", cols)
            ver = db._conn.execute(
                "SELECT value FROM schema_meta WHERE key='version'"
            ).fetchone()[0]
            self.assertEqual(ver, "4")
            db.close()

    def test_cli_migrate_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "legacy.db"
            dst = tmp_path / "out" / "radar.db"
            conn = sqlite3.connect(src)
            conn.execute(
                """
                CREATE TABLE offers (
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
                  UNIQUE(source, external_id)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO offers (
                  source, external_id, title, first_seen_at, last_seen_at, interest
                ) VALUES ('ft', 'x', 'Role', '2026-01-01T00:00:00', '2026-01-01T00:00:00', 'maybe')
                """
            )
            conn.commit()
            conn.close()

            env = {**os.environ, "PYTHONPATH": str(SRC)}
            proc = subprocess.run(
                [sys.executable, str(MIGRATE_SCRIPT), "--src", str(src), "--dst", str(dst)],
                check=True,
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertTrue(dst.exists())
            self.assertIn("offers", proc.stdout)

            out = sqlite3.connect(dst)
            cols = {r[1] for r in out.execute("PRAGMA table_info(offer_feedback)")}
            self.assertIn("application_status", cols)
            self.assertIn("system_reason", cols)
            row = out.execute(
                "SELECT decision, application_status FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row[0], "UNREVIEWED")
            self.assertEqual(row[1], "NONE")
            interest = out.execute(
                "SELECT interest FROM offers WHERE id=1"
            ).fetchone()[0]
            self.assertEqual(interest, "maybe")
            ver = out.execute(
                "SELECT value FROM schema_meta WHERE key='version'"
            ).fetchone()[0]
            self.assertEqual(ver, "4")
            out.close()

            migrate = _load_migrate().migrate
            c2 = sqlite3.connect(dst)
            c2.execute(
                """
                UPDATE offer_feedback SET application_status='APPLIED',
                  applied_at='2026-09-16T12:00:00Z', applied_local_day='2026-09-16'
                WHERE offer_id=1
                """
            )
            c2.commit()
            c2.close()
            migrate(src, dst)
            c3 = sqlite3.connect(dst)
            row = c3.execute(
                "SELECT decision, application_status, applied_at FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row[0], "UNREVIEWED")
            self.assertEqual(row[1], "APPLIED")
            self.assertEqual(row[2], "2026-09-16T12:00:00Z")
            c3.close()


if __name__ == "__main__":
    unittest.main()
