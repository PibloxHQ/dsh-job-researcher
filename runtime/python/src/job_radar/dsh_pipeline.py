"""Deterministic DSH pipeline — replaces Hermes agent orchestration.

Policy: partial source failure does not abort the run (legacy cron behaviour).
"""

from __future__ import annotations

import json
import sqlite3
import traceback
from datetime import datetime, timezone
from typing import Any

from job_radar.config import load_settings
from job_radar.db import Database
from job_radar.schema_v2 import SCORE_VERSION, SCHEMA_V2
from job_radar.sources import csp, csp_filtre, et, ft
from job_radar.triage import score_offer


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


DEFAULT_SOURCES = ("csp-filtre", "et", "ft")


def _ensure_schema(db_path) -> None:
    conn = sqlite3.connect(db_path)
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
    conn.commit()
    conn.close()


def _sync_source(name: str, settings, *, run_started: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source": name,
        "ok": False,
        "seen": 0,
        "new": 0,
        "error": "",
    }
    source_key = {
        "csp-filtre": "csp",
        "csp": "csp",
        "et": "et",
        "ft": "ft",
    }.get(name)
    if not source_key:
        result["error"] = f"unknown_source:{name}"
        return result
    try:
        db = Database(settings.db_path)
        if name == "csp-filtre":
            offers = list(csp_filtre.iter_csp_filtre_offers(settings))
        elif name == "csp":
            offers = list(csp.iter_csp_offers(settings))
        elif name == "et":
            offers = list(et.iter_et_offers(settings))
        elif name == "ft":
            if not settings.ft_client_id or not settings.ft_client_secret:
                result["error"] = "missing_ft_credentials"
                db.close()
                return result
            offers = list(ft.iter_ft_offers(settings))
        else:
            result["error"] = f"unknown_source:{name}"
            db.close()
            return result

        n = db.upsert_many(offers)
        new_count = db._conn.execute(
            """
            SELECT COUNT(*) FROM offers
            WHERE source=? AND first_seen_at >= ?
            """,
            (source_key, run_started),
        ).fetchone()[0]
        result.update(
            {
                "ok": True,
                "seen": n,
                "new": int(new_count),
                "source_key": source_key,
            }
        )
        db.close()
    except Exception as exc:  # noqa: BLE001 — partial failure policy
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc()[-1500:]
    return result


def _apply_triage(db_path, *, limit: int = 500) -> dict[str, Any]:
    db = Database(db_path)
    rows = db._conn.execute(
        """
        SELECT * FROM offers
        WHERE score_version IS NULL OR score_version = '' OR score_version = ?
        ORDER BY last_seen_at DESC
        LIMIT ?
        """,
        (SCORE_VERSION, limit),
    ).fetchall()
    updated = 0
    for row in rows:
        d = dict(row)
        triage = score_offer(d)
        db._conn.execute(
            """
            UPDATE offers
            SET score=?, score_classification=?, score_version=?, score_details=?,
                interest=CASE
                  WHEN interest='unset' OR interest IS NULL OR interest='' THEN ?
                  ELSE interest
                END
            WHERE id=?
            """,
            (
                triage.score,
                triage.verdict,
                SCORE_VERSION,
                json.dumps({"reasons": triage.reasons}, ensure_ascii=False),
                triage.verdict if triage.verdict in ("interested", "maybe", "skip") else "unset",
                d["id"],
            ),
        )
        fb = db._conn.execute(
            "SELECT decision FROM offer_feedback WHERE offer_id=?",
            (d["id"],),
        ).fetchone()
        if fb is None:
            db._conn.execute(
                """
                INSERT INTO offer_feedback (offer_id, decision, comment, viewed)
                VALUES (?, 'UNREVIEWED', '', 0)
                """,
                (d["id"],),
            )
        updated += 1
    db._conn.commit()
    db.close()
    return {"triaged": updated, "score_version": SCORE_VERSION}


def run_pipeline(
    *,
    sources: list[str] | None = None,
    trigger_type: str = "manual",
    triage_limit: int = 500,
) -> dict[str, Any]:
    settings = load_settings()
    _ensure_schema(settings.db_path)
    started = utc_now()
    conn = sqlite3.connect(settings.db_path)
    cur = conn.execute(
        """
        INSERT INTO job_runs (started_at, status, trigger_type)
        VALUES (?, 'running', ?)
        """,
        (started, trigger_type),
    )
    run_id = int(cur.lastrowid)
    conn.commit()

    sources = list(sources or DEFAULT_SOURCES)
    source_results: list[dict[str, Any]] = []
    offers_seen = 0
    offers_new = 0
    offers_failed = 0

    for name in sources:
        res = _sync_source(name, settings, run_started=started)
        source_results.append(res)
        if res.get("ok"):
            offers_seen += int(res.get("seen") or 0)
            offers_new += int(res.get("new") or 0)
            conn.execute(
                """
                INSERT INTO source_state (source, enabled, last_run_at, last_success_at,
                  last_error, offers_seen, offers_new, updated_at)
                VALUES (?, 1, ?, ?, '', ?, ?, ?)
                ON CONFLICT(source) DO UPDATE SET
                  last_run_at=excluded.last_run_at,
                  last_success_at=excluded.last_success_at,
                  last_error='',
                  offers_seen=excluded.offers_seen,
                  offers_new=excluded.offers_new,
                  updated_at=excluded.updated_at
                """,
                (
                    name,
                    started,
                    started,
                    int(res.get("seen") or 0),
                    int(res.get("new") or 0),
                    utc_now(),
                ),
            )
        else:
            offers_failed += 1
            conn.execute(
                """
                INSERT INTO source_state (source, enabled, last_run_at, last_error, updated_at)
                VALUES (?, 1, ?, ?, ?)
                ON CONFLICT(source) DO UPDATE SET
                  last_run_at=excluded.last_run_at,
                  last_error=excluded.last_error,
                  updated_at=excluded.updated_at
                """,
                (name, started, res.get("error") or "error", utc_now()),
            )
        conn.commit()

    triage = _apply_triage(settings.db_path, limit=triage_limit)

    ok_sources = sum(1 for r in source_results if r.get("ok"))
    status = "ok" if ok_sources > 0 else "error"
    if ok_sources > 0 and offers_failed > 0:
        status = "partial"

    finished = utc_now()
    error_summary = "; ".join(
        f"{r['source']}:{r.get('error')}" for r in source_results if not r.get("ok")
    )
    conn.execute(
        """
        UPDATE job_runs SET
          finished_at=?, status=?, sources_json=?, offers_seen=?, offers_new=?,
          offers_updated=?, offers_failed=?, error_summary=?, notify_status='skipped'
        WHERE id=?
        """,
        (
            finished,
            status,
            json.dumps(source_results, ensure_ascii=False),
            offers_seen,
            offers_new,
            int(triage.get("triaged") or 0),
            offers_failed,
            error_summary,
            run_id,
        ),
    )
    conn.commit()
    conn.close()

    return {
        "run_id": run_id,
        "status": status,
        "started_at": started,
        "finished_at": finished,
        "sources": source_results,
        "offers_seen": offers_seen,
        "offers_new": offers_new,
        "triage": triage,
        "error_summary": error_summary,
        "db_path": str(settings.db_path),
        "notify_status": "skipped",
    }


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="DSH job-researcher pipeline")
    ap.add_argument("--trigger", default="manual")
    ap.add_argument("--sources", default="csp-filtre,et,ft")
    ap.add_argument("--triage-limit", type=int, default=500)
    args = ap.parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    result = run_pipeline(
        sources=sources,
        trigger_type=args.trigger,
        triage_limit=args.triage_limit,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
