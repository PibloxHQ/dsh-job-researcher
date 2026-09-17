"""Explainable feedback learning for offer scoring.

Learn ONLY from feedback_origin='user'. Legacy comment==notes rows must never
train (migration moves them to system_reason with origin legacy).
"""

from __future__ import annotations

import json
from typing import Any

# Keep in sync with src/feedback.js
SCORE_VERSION = "v4-feedback"
LEARN_THRESHOLD = 2
PER_TAG_DELTA_CAP = 1
TOTAL_FEEDBACK_CAP = 2

FEEDBACK_TAGS: list[dict[str, Any]] = [
    {"id": "location_good", "delta": 1, "actionable": True, "label_fr": "Bon lieu"},
    {"id": "too_far", "delta": -1, "actionable": True, "label_fr": "Trop loin"},
    {"id": "dev_infra_good", "delta": 1, "actionable": True, "label_fr": "Bon fit infra/dev"},
    {"id": "support_good", "delta": 1, "actionable": True, "label_fr": "Support OK"},
    {"id": "support_bad", "delta": -1, "actionable": True, "label_fr": "Support non"},
    {
        "id": "public_sector_good",
        "delta": 1,
        "actionable": True,
        "label_fr": "Secteur public OK",
    },
    {
        "id": "student_contract_bad",
        "delta": -1,
        "actionable": True,
        "label_fr": "Alternance/stage non",
    },
    {"id": "contract_bad", "delta": -1, "actionable": True, "label_fr": "Contrat non"},
    {
        "id": "missing_diploma",
        "delta": 0,
        "actionable": False,
        "label_fr": "Diplôme manquant",
    },
    {
        "id": "needs_details",
        "delta": 0,
        "actionable": False,
        "label_fr": "Manque de détails",
    },
]

TAG_BY_ID = {t["id"]: t for t in FEEDBACK_TAGS}
VALID_TAG_IDS = frozenset(TAG_BY_ID)


def normalize_tags(raw: Any) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            raw = json.loads(s)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid feedback_tags_json") from exc
    if not isinstance(raw, list):
        raise ValueError("invalid feedback_tags")
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        tid = str(item or "").strip()
        if not tid:
            continue
        if tid not in VALID_TAG_IDS:
            raise ValueError(f"invalid feedback_tag: {tid}")
        if tid in seen:
            continue
        seen.add(tid)
        out.append(tid)
    out.sort()
    return out


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def aggregate_learned_signals(
    rows: list[dict[str, Any]] | None,
    *,
    threshold: int = LEARN_THRESHOLD,
) -> dict[str, Any]:
    counts = {t["id"]: 0 for t in FEEDBACK_TAGS}
    user_feedback_count = 0
    for row in rows or []:
        if (row.get("feedback_origin") or "") != "user":
            continue
        user_feedback_count += 1
        try:
            tags = normalize_tags(row.get("tags") or row.get("feedback_tags_json") or "[]")
        except ValueError:
            tags = []
        for tid in tags:
            counts[tid] = counts.get(tid, 0) + 1

    active: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []
    for meta in FEEDBACK_TAGS:
        count = counts.get(meta["id"], 0)
        if count <= 0:
            continue
        delta = (
            _clamp(int(meta["delta"]), -PER_TAG_DELTA_CAP, PER_TAG_DELTA_CAP)
            if meta["actionable"]
            else 0
        )
        entry = {
            "tag": meta["id"],
            "count": count,
            "delta": delta,
            "actionable": bool(meta["actionable"]),
            "label_fr": meta["label_fr"],
        }
        if meta["actionable"] and count >= threshold:
            active.append(entry)
        else:
            pending.append(entry)

    return {
        "version": SCORE_VERSION,
        "threshold": threshold,
        "per_tag_cap": PER_TAG_DELTA_CAP,
        "total_cap": TOTAL_FEEDBACK_CAP,
        "user_feedback_count": user_feedback_count,
        "active_signals": active,
        "pending_signals": pending,
    }


def load_learned_preferences(conn: Any) -> dict[str, Any]:
    """Read-only aggregate from DB. Never mutates profile.yaml."""
    try:
        rows = conn.execute(
            """
            SELECT feedback_origin, feedback_tags_json
            FROM offer_feedback
            WHERE COALESCE(feedback_origin, '') = 'user'
            """
        ).fetchall()
    except Exception:  # noqa: BLE001 — missing columns → no learning
        return aggregate_learned_signals([])
    dict_rows = []
    for r in rows:
        if hasattr(r, "keys"):
            dict_rows.append(dict(r))
        else:
            dict_rows.append(
                {"feedback_origin": r[0], "feedback_tags_json": r[1]}
            )
    return aggregate_learned_signals(dict_rows)


def apply_learned_adjustment(
    *,
    base_score: int,
    match_flags: dict[str, bool],
    preferences: dict[str, Any] | None,
) -> tuple[int, int, list[dict[str, Any]]]:
    """Return (final_score, feedback_adjustment, applied_signals).

    match_flags keys are tag ids that are relevant for this offer.
    """
    prefs = preferences or {}
    applied: list[dict[str, Any]] = []
    raw = 0
    for sig in prefs.get("active_signals") or []:
        tag = sig.get("tag")
        if not tag or not match_flags.get(tag):
            continue
        if not sig.get("actionable"):
            continue
        delta = _clamp(int(sig.get("delta") or 0), -PER_TAG_DELTA_CAP, PER_TAG_DELTA_CAP)
        if delta == 0:
            continue
        raw += delta
        applied.append(
            {
                "tag": tag,
                "delta": delta,
                "count": int(sig.get("count") or 0),
                "reason": f"learned:{tag}",
            }
        )
    adjustment = _clamp(raw, -TOTAL_FEEDBACK_CAP, TOTAL_FEEDBACK_CAP)
    # If clamp trimmed, keep applied list but note total was capped via adjustment value.
    return base_score + adjustment, adjustment, applied
