"""Deterministic DSH pipeline — replaces Hermes agent orchestration.

Policy: partial source failure does not abort the run (legacy cron behaviour).
"""

from __future__ import annotations

import json
import os
import sqlite3
import traceback
from datetime import datetime, timezone
from typing import Any

from job_radar.config import FtAuthError, QUERY_PROFILES, load_settings
from job_radar.db import Database
from job_radar.learning import load_learned_preferences
from job_radar.schema_v2 import (
    LEGACY_SCORE_VERSION,
    SCORE_VERSION,
    SCHEMA_V2,
    ensure_feedback_learning_schema,
)
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
    ensure_feedback_learning_schema(conn)
    conn.commit()
    conn.close()


def _parse_search_config() -> dict[str, Any] | None:
    raw = os.getenv("JR_SEARCH_CONFIG_JSON", "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _apply_search_config(settings, config: dict[str, Any] | None) -> list[str] | None:
    """Apply JR_SEARCH_CONFIG_JSON onto settings; return FT profile filter or None."""
    if not config:
        return None
    location = config.get("location") if isinstance(config.get("location"), dict) else {}
    departments = location.get("departments") or []
    if isinstance(departments, list) and departments:
        settings.departement = str(departments[0]).strip() or settings.departement

    # Optional CSP path override from profile (P2.1)
    csp_path = location.get("csp_filtre_path")
    if isinstance(csp_path, str) and csp_path.strip():
        settings.csp_filtre_path = csp_path.strip().strip("/")

    roles = config.get("roles") if isinstance(config.get("roles"), dict) else {}
    selected = roles.get("selected")
    if isinstance(selected, list) and selected:
        return [str(r).strip() for r in selected if str(r).strip() in QUERY_PROFILES]
    return None


def _resolve_sources(
    *,
    sources: list[str] | None,
    search_config: dict[str, Any] | None,
) -> list[str]:
    if sources:
        return list(sources)
    env_sources = os.getenv("JR_ENABLED_SOURCES", "").strip()
    if env_sources:
        return [s.strip() for s in env_sources.split(",") if s.strip()]
    if search_config:
        enabled = (search_config.get("sources") or {}).get("enabled")
        if isinstance(enabled, list) and enabled:
            return [str(s).strip() for s in enabled if str(s).strip()]
    return list(DEFAULT_SOURCES)


def _sync_source(
    name: str,
    settings,
    *,
    run_started: str,
    ft_profiles: list[str] | None = None,
) -> dict[str, Any]:
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

    db = None
    try:
        db = Database(settings.db_path)
        if name == "csp-filtre":
            path = getattr(settings, "csp_filtre_path", None) or None
            offers = list(
                csp_filtre.iter_csp_filtre_offers(
                    settings,
                    path=path or csp_filtre.DEFAULT_FILTRE_PATH,
                )
            )
        elif name == "csp":
            offers = list(csp.iter_csp_offers(settings))
        elif name == "et":
            offers = list(
                et.iter_et_offers(settings, dept=settings.et_departement)
            )
        elif name == "ft":
            if not settings.ft_client_id or not settings.ft_client_secret:
                result["error"] = "missing_ft_credentials"
                return result
            offers = list(ft.iter_ft_offers(settings, profiles=ft_profiles))
        else:
            result["error"] = f"unknown_source:{name}"
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
    except FtAuthError as exc:
        # Explicit catch for clarity; FtAuthError subclasses RuntimeError → Exception.
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc()[-1500:]
    except Exception as exc:  # noqa: BLE001 — partial failure policy
        result["error"] = f"{type(exc).__name__}: {exc}"
        result["traceback"] = traceback.format_exc()[-1500:]
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:  # noqa: BLE001
                pass
    return result


def _apply_triage(
    db_path,
    *,
    limit: int = 500,
    search_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    db = Database(db_path)
    preferences = load_learned_preferences(db._conn)
    # REV-03: only unversioned / legacy / OLD versions — never re-queue SCORE_VERSION.
    rows = db._conn.execute(
        """
        SELECT * FROM offers
        WHERE score_version IS NULL
           OR score_version = ''
           OR score_version = ?
           OR score_version != ?
        ORDER BY id ASC
        LIMIT ?
        """,
        (LEGACY_SCORE_VERSION, SCORE_VERSION, limit),
    ).fetchall()
    updated = 0
    profile_rev = None
    if isinstance(search_config, dict):
        profile_rev = search_config.get("revision")
    for row in rows:
        d = dict(row)
        triage = score_offer(d, preferences=preferences)
        details = triage.details_dict()
        details["score_generation"] = SCORE_VERSION
        if profile_rev is not None:
            details["search_profile_revision"] = profile_rev
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
                json.dumps(details, ensure_ascii=False),
                triage.verdict if triage.verdict in ("interested", "maybe", "skip") else "unset",
                d["id"],
            ),
        )
        # Persist system scoring explanation separately; never overwrite user comment/tags.
        system_reason = "; ".join(triage.reasons)
        fb = db._conn.execute(
            "SELECT decision, comment, feedback_origin FROM offer_feedback WHERE offer_id=?",
            (d["id"],),
        ).fetchone()
        if fb is None:
            db._conn.execute(
                """
                INSERT INTO offer_feedback (
                  offer_id, decision, comment, viewed, system_reason, feedback_origin
                )
                VALUES (?, 'UNREVIEWED', '', 0, ?, 'system')
                """,
                (d["id"], system_reason),
            )
        else:
            db._conn.execute(
                """
                UPDATE offer_feedback
                SET system_reason = ?
                WHERE offer_id = ?
                """,
                (system_reason, d["id"]),
            )
        updated += 1
    remaining = int(
        db._conn.execute(
            """
            SELECT COUNT(*) FROM offers
            WHERE score_version IS NULL
               OR score_version = ''
               OR score_version = ?
               OR score_version != ?
            """,
            (LEGACY_SCORE_VERSION, SCORE_VERSION),
        ).fetchone()[0]
    )
    db._conn.commit()
    db.close()
    return {
        "triaged": updated,
        "remaining": remaining,
        "score_version": SCORE_VERSION,
        "learning": {
            "user_feedback_count": preferences.get("user_feedback_count"),
            "active_signals": preferences.get("active_signals"),
            "pending_signals": preferences.get("pending_signals"),
        },
    }


def _finalize_job_run(
    conn: sqlite3.Connection,
    *,
    run_id: int,
    status: str,
    source_results: list[dict[str, Any]],
    offers_seen: int,
    offers_new: int,
    offers_updated: int,
    offers_failed: int,
    error_summary: str,
) -> str:
    finished = utc_now()
    conn.execute(
        """
        UPDATE job_runs SET
          finished_at=?, status=?, sources_json=?, offers_seen=?, offers_new=?,
          offers_updated=?, offers_failed=?, error_summary=?, notify_status='skipped'
        WHERE id=? AND status = 'running'
        """,
        (
            finished,
            status,
            json.dumps(source_results, ensure_ascii=False),
            offers_seen,
            offers_new,
            offers_updated,
            offers_failed,
            error_summary,
            run_id,
        ),
    )
    conn.commit()
    return finished


def run_pipeline(
    *,
    sources: list[str] | None = None,
    trigger_type: str = "manual",
    triage_limit: int = 500,
    rescore_only: bool = False,
) -> dict[str, Any]:
    settings = load_settings()
    search_config = _parse_search_config()
    ft_profiles = _apply_search_config(settings, search_config)
    resolved_sources = [] if rescore_only else _resolve_sources(
        sources=sources, search_config=search_config
    )

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

    source_results: list[dict[str, Any]] = []
    offers_seen = 0
    offers_new = 0
    offers_failed = 0
    triage: dict[str, Any] = {
        "triaged": 0,
        "remaining": 0,
        "score_version": SCORE_VERSION,
    }
    status = "error"
    finished = started
    error_summary = ""
    finalized = False

    try:
        for name in resolved_sources:
            res = _sync_source(
                name,
                settings,
                run_started=started,
                ft_profiles=ft_profiles if name == "ft" else None,
            )
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

        triage = _apply_triage(
            settings.db_path,
            limit=triage_limit,
            search_config=search_config,
        )

        if rescore_only:
            status = "ok" if int(triage.get("triaged") or 0) >= 0 else "error"
        else:
            ok_sources = sum(1 for r in source_results if r.get("ok"))
            status = "ok" if ok_sources > 0 else "error"
            if ok_sources > 0 and offers_failed > 0:
                status = "partial"

        error_summary = "; ".join(
            f"{r['source']}:{r.get('error')}" for r in source_results if not r.get("ok")
        )
        finished = _finalize_job_run(
            conn,
            run_id=run_id,
            status=status,
            source_results=source_results,
            offers_seen=offers_seen,
            offers_new=offers_new,
            offers_updated=int(triage.get("triaged") or 0),
            offers_failed=offers_failed,
            error_summary=error_summary,
        )
        finalized = True
    except Exception as exc:  # noqa: BLE001 — AUT-06 never leave job_runs stuck
        error_summary = f"{type(exc).__name__}: {exc}"
        status = "error"
        try:
            finished = _finalize_job_run(
                conn,
                run_id=run_id,
                status=status,
                source_results=source_results,
                offers_seen=offers_seen,
                offers_new=offers_new,
                offers_updated=int(triage.get("triaged") or 0),
                offers_failed=offers_failed,
                error_summary=error_summary[:2000],
            )
            finalized = True
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        if not finalized:
            try:
                finished = _finalize_job_run(
                    conn,
                    run_id=run_id,
                    status="interrupted",
                    source_results=source_results,
                    offers_seen=offers_seen,
                    offers_new=offers_new,
                    offers_updated=int(triage.get("triaged") or 0),
                    offers_failed=offers_failed,
                    error_summary=error_summary or "interrupted",
                )
                status = "interrupted"
            except Exception:  # noqa: BLE001
                pass
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass

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
        "rescore_only": rescore_only,
    }


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="DSH job-researcher pipeline")
    ap.add_argument("--trigger", default="manual")
    ap.add_argument(
        "--sources",
        default=None,
        help="Comma-separated sources (default: JR_ENABLED_SOURCES or csp-filtre,et,ft)",
    )
    ap.add_argument("--triage-limit", type=int, default=500)
    ap.add_argument(
        "--rescore-only",
        action="store_true",
        help="Skip source sync; only triage stale/legacy scores",
    )
    args = ap.parse_args()
    sources = None
    if args.sources is not None:
        sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    result = run_pipeline(
        sources=sources,
        trigger_type=args.trigger,
        triage_limit=args.triage_limit,
        rescore_only=args.rescore_only,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
