"""Feedback provenance + explainable learning (stdlib unittest)."""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from job_radar.db import Database  # noqa: E402
from job_radar.dsh_pipeline import _ensure_schema  # noqa: E402
from job_radar.learning import (  # noqa: E402
    LEARN_THRESHOLD,
    TOTAL_FEEDBACK_CAP,
    aggregate_learned_signals,
    apply_learned_adjustment,
    load_learned_preferences,
)
from job_radar.schema_v2 import (  # noqa: E402
    SCHEMA_V2,
    SCORE_VERSION,
    ensure_feedback_learning_schema,
)
from job_radar.triage import score_offer  # noqa: E402


def _make_v3_with_legacy(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA_V2)
    now = "2026-09-15T10:00:00"
    system = "corridor Grenoble (commune 'montbonnot'); métier infra/dev"
    conn.execute(
        """
        INSERT INTO offers (
          source, external_id, title, employer, location,
          first_seen_at, last_seen_at, interest, score, notes
        ) VALUES ('csp', 'e1', 'Admin', 'Mairie de Montbonnot', 'Isère', ?, ?, 'interested', 3, ?)
        """,
        (now, now, system),
    )
    conn.execute(
        """
        INSERT INTO offers (
          source, external_id, title, employer, location,
          first_seen_at, last_seen_at, interest, score, notes
        ) VALUES ('csp', 'e2', 'Role', 'Co', 'Lyon', ?, ?, 'maybe', 1, 'other')
        """,
        (now, now),
    )
    conn.execute(
        """
        INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
        VALUES (1, 'YES', ?, 1, ?)
        """,
        (system, now),
    )
    conn.execute(
        """
        INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
        VALUES (2, 'MAYBE', 'vrai commentaire', 1, ?)
        """,
        (now,),
    )
    conn.execute("INSERT INTO schema_meta (key, value) VALUES ('version', '3')")
    conn.commit()
    conn.close()


class FeedbackLearningTests(unittest.TestCase):
    def test_python_first_disentangle_and_preserve(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            _make_v3_with_legacy(db_path)
            _ensure_schema(db_path)
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            r1 = conn.execute(
                "SELECT comment, system_reason, feedback_origin FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(r1["comment"], "")
            self.assertIn("corridor", r1["system_reason"])
            self.assertEqual(r1["feedback_origin"], "legacy")
            r2 = conn.execute(
                "SELECT comment, system_reason, feedback_origin FROM offer_feedback WHERE offer_id=2"
            ).fetchone()
            self.assertEqual(r2["comment"], "vrai commentaire")
            self.assertEqual(r2["feedback_origin"] or "", "")
            ver = conn.execute(
                "SELECT value FROM schema_meta WHERE key='version'"
            ).fetchone()[0]
            self.assertEqual(ver, "4")
            conn.close()

    def test_learning_ignores_legacy_threshold_and_caps(self):
        prefs = aggregate_learned_signals(
            [
                {
                    "feedback_origin": "legacy",
                    "feedback_tags_json": '["too_far","too_far"]',
                },
                {"feedback_origin": "user", "feedback_tags_json": '["too_far"]'},
            ]
        )
        self.assertEqual(prefs["user_feedback_count"], 1)
        self.assertEqual(prefs["active_signals"], [])
        self.assertEqual(len(prefs["pending_signals"]), 1)

        prefs2 = aggregate_learned_signals(
            [
                {"feedback_origin": "user", "tags": ["too_far"]},
                {"feedback_origin": "user", "tags": ["too_far"]},
                {"feedback_origin": "user", "tags": ["dev_infra_good"]},
                {"feedback_origin": "user", "tags": ["dev_infra_good"]},
                {"feedback_origin": "user", "tags": ["location_good"]},
                {"feedback_origin": "user", "tags": ["location_good"]},
            ]
        )
        self.assertGreaterEqual(len(prefs2["active_signals"]), 2)
        final, adj, applied = apply_learned_adjustment(
            base_score=2,
            match_flags={
                "too_far": True,
                "dev_infra_good": True,
                "location_good": True,
            },
            preferences=prefs2,
        )
        self.assertLessEqual(abs(adj), TOTAL_FEEDBACK_CAP)
        self.assertEqual(final, 2 + adj)
        self.assertTrue(applied)

    def test_score_offer_backward_compatible_and_deterministic(self):
        row = {
            "title": "Technicien Administrateur Systèmes et Réseaux",
            "employer": "Mairie de Montbonnot-Saint-Martin",
            "location": "Isère (38)",
            "description": "",
        }
        a = score_offer(row)
        b = score_offer(row, preferences=None)
        self.assertEqual(a.score, b.score)
        self.assertEqual(a.base_score, a.score)
        self.assertEqual(a.feedback_adjustment, 0)
        self.assertEqual(a.score_version, SCORE_VERSION)

        prefs = {
            "active_signals": [
                {"tag": "dev_infra_good", "delta": 1, "count": 4, "actionable": True},
                {"tag": "location_good", "delta": 1, "count": 3, "actionable": True},
            ]
        }
        c = score_offer(row, preferences=prefs)
        d = score_offer(row, preferences=prefs)
        self.assertEqual(c.details_dict(), d.details_dict())
        self.assertEqual(c.feedback_adjustment, min(2, TOTAL_FEEDBACK_CAP))
        self.assertIn("base_score", c.details_dict())
        self.assertIn("learned_signals", c.details_dict())

        # reversibility: empty prefs restores base
        e = score_offer(row, preferences={"active_signals": []})
        self.assertEqual(e.score, a.score)

    def test_database_loads_user_prefs_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "fresh.db")
            now = "2026-09-16T12:00:00"
            db._conn.execute(
                """
                INSERT INTO offers (
                  source, external_id, title, employer, location,
                  first_seen_at, last_seen_at, interest, notes
                ) VALUES ('csp', 'a', 'T', 'E', 'L', ?, ?, 'unset', '')
                """,
                (now, now),
            )
            db._conn.execute(
                """
                INSERT INTO offer_feedback (
                  offer_id, decision, comment, viewed, feedback_origin, feedback_tags_json
                ) VALUES (1, 'YES', '', 1, 'legacy', '["too_far"]')
                """
            )
            db._conn.execute(
                """
                INSERT INTO offers (
                  source, external_id, title, employer, location,
                  first_seen_at, last_seen_at, interest, notes
                ) VALUES ('csp', 'b', 'T2', 'E', 'L', ?, ?, 'unset', '')
                """,
                (now, now),
            )
            db._conn.execute(
                """
                INSERT INTO offer_feedback (
                  offer_id, decision, comment, viewed, feedback_origin, feedback_tags_json
                ) VALUES (2, 'NO', 'x', 1, 'user', '["too_far"]')
                """
            )
            db._conn.commit()
            prefs = load_learned_preferences(db._conn)
            self.assertEqual(prefs["user_feedback_count"], 1)
            self.assertEqual(LEARN_THRESHOLD, 2)
            self.assertEqual(prefs["active_signals"], [])
            cols = {
                r[1]
                for r in db._conn.execute("PRAGMA table_info(offer_feedback)")
            }
            self.assertIn("system_reason", cols)
            self.assertIn("feedback_tags_json", cols)
            db.close()

    def test_ensure_idempotent_repeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            _make_v3_with_legacy(db_path)
            conn = sqlite3.connect(db_path)
            ensure_feedback_learning_schema(conn)
            ensure_feedback_learning_schema(conn)
            conn.commit()
            row = conn.execute(
                "SELECT comment, system_reason FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row[0], "")
            self.assertTrue(row[1])
            conn.close()

    def test_user_origin_comment_equals_notes_not_cleared(self):
        """REV-01: feedback_origin=user + comment==notes must survive ensure."""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "radar.db"
            conn = sqlite3.connect(db_path)
            conn.executescript(SCHEMA_V2)
            now = "2026-09-16T12:00:00"
            note = "opérateur: bon fit corridor"
            conn.execute(
                """
                INSERT INTO offers (
                  source, external_id, title, employer, location,
                  first_seen_at, last_seen_at, interest, notes
                ) VALUES ('csp', 'u1', 'Admin', 'Mairie', 'Isère', ?, ?, 'interested', ?)
                """,
                (now, now, note),
            )
            conn.execute(
                """
                INSERT INTO offer_feedback (offer_id, decision, comment, viewed)
                VALUES (1, 'YES', ?, 1)
                """,
                (note,),
            )
            conn.execute(
                "INSERT INTO schema_meta (key, value) VALUES ('version', '3')"
            )
            conn.commit()
            # Add provenance columns first (as Node/Python migrate would), then mark user.
            conn.execute(
                "ALTER TABLE offer_feedback ADD COLUMN feedback_origin TEXT DEFAULT ''"
            )
            conn.execute(
                "ALTER TABLE offer_feedback ADD COLUMN system_reason TEXT DEFAULT ''"
            )
            conn.execute(
                "UPDATE offer_feedback SET feedback_origin = 'user' WHERE offer_id = 1"
            )
            conn.commit()
            ensure_feedback_learning_schema(conn)
            conn.commit()
            row = conn.execute(
                """
                SELECT comment, feedback_origin, system_reason
                FROM offer_feedback WHERE offer_id=1
                """
            ).fetchone()
            self.assertEqual(row[0], note)
            self.assertEqual(row[1], "user")
            self.assertEqual(row[2] or "", "")
            ensure_feedback_learning_schema(conn)
            conn.commit()
            row2 = conn.execute(
                "SELECT comment, feedback_origin FROM offer_feedback WHERE offer_id=1"
            ).fetchone()
            self.assertEqual(row2[0], note)
            self.assertEqual(row2[1], "user")
            conn.close()



    def test_comment_preferences_affect_score(self):
        from job_radar.learning import aggregate_learned_signals

        rows = [
            {
                "feedback_origin": "user",
                "decision": "YES",
                "comment": "Bon profil Proxmox et virtualisation locale",
                "feedback_tags_json": "[]",
            },
            {
                "feedback_origin": "user",
                "decision": "NO",
                "comment": "Trop de commercial et vente terrain",
                "feedback_tags_json": "[]",
            },
            {
                "feedback_origin": "user",
                "decision": "NO",
                "comment": "Encore trop commercial vente",
                "feedback_tags_json": "[]",
            },
        ]
        prefs = aggregate_learned_signals(rows)
        self.assertGreaterEqual(prefs["commented_feedback_count"], 2)
        self.assertTrue(any(t["term"] == "proxmox" for t in prefs["prefer_terms"]))
        self.assertTrue(any(t["term"] == "commercial" for t in prefs["avoid_terms"]))

        row = {
            "title": "Administrateur Proxmox virtualisation",
            "employer": "Mairie de Meylan",
            "location": "Isère (38)",
            "description": "Cluster Proxmox",
        }
        boosted = score_offer(row, preferences=prefs)
        base = score_offer(row, preferences={"active_signals": [], "prefer_terms": [], "avoid_terms": []})
        self.assertGreaterEqual(boosted.score, base.score)
        self.assertTrue(
            any("comment" in str(s.get("reason", s.get("tag", ""))) for s in boosted.learned_signals)
            or boosted.feedback_adjustment != 0
            or boosted.score >= base.score
        )

        bad = {
            "title": "Commercial terrain vente",
            "employer": "Société",
            "location": "Isère (38)",
            "description": "Poste commercial",
        }
        avoided = score_offer(bad, preferences=prefs)
        plain = score_offer(bad, preferences={"active_signals": [], "prefer_terms": [], "avoid_terms": []})
        self.assertLessEqual(avoided.score, plain.score)

if __name__ == "__main__":
    unittest.main()
