"""Explainable feedback learning for offer scoring.

Learn from feedback_origin='user' only:
- closed vocabulary tags (threshold ≥2)
- free-text comments (token preferences weighted by YES/NO/MAYBE)

Legacy comment==notes rows must never train (migration → system_reason).
No LLM. No profile.yaml mutation.
"""

from __future__ import annotations

import json
import re
from typing import Any

from job_radar.normalize import fold

# Keep in sync with src/feedback.js
SCORE_VERSION = "v5-feedback"
LEARN_THRESHOLD = 2
PER_TAG_DELTA_CAP = 1
TOTAL_FEEDBACK_CAP = 2
COMMENT_TERM_THRESHOLD = 2
COMMENT_TERM_MIN_LEN = 4
COMMENT_PER_TERM_CAP = 1
COMMENT_TOTAL_CAP = 1

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

_COMMENT_STOPWORDS = frozenset(
    {
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "de",
        "du",
        "et",
        "ou",
        "a",
        "au",
        "aux",
        "pour",
        "avec",
        "sans",
        "dans",
        "sur",
        "sous",
        "par",
        "qui",
        "que",
        "quoi",
        "dont",
        "est",
        "sont",
        "etre",
        "avoir",
        "fait",
        "faire",
        "plus",
        "moins",
        "tres",
        "trop",
        "pas",
        "non",
        "oui",
        "bien",
        "aussi",
        "comme",
        "tout",
        "tous",
        "toute",
        "toutes",
        "cette",
        "cet",
        "ces",
        "mon",
        "ma",
        "mes",
        "ton",
        "ta",
        "tes",
        "son",
        "sa",
        "ses",
        "notre",
        "nos",
        "votre",
        "vos",
        "leur",
        "leurs",
        "je",
        "tu",
        "il",
        "elle",
        "on",
        "nous",
        "vous",
        "ils",
        "elles",
        "me",
        "te",
        "se",
        "y",
        "en",
        "ce",
        "cela",
        "offre",
        "offres",
        "poste",
        "postes",
        "emploi",
        "job",
        "annonce",
        "candidature",
        "retour",
        "commentaire",
        "interessant",
        "interesse",
        "interessante",
        "peut",
        "etre",
        "donc",
        "car",
        "mais",
        "alors",
        "ainsi",
        "entre",
        "chez",
        "vers",
        "apres",
        "avant",
        "encore",
        "deja",
        "toujours",
        "jamais",
        "ici",
        "la",
        "the",
        "and",
        "for",
        "with",
        "from",
        "this",
        "that",
        "have",
        "will",
        "would",
        "could",
        "should",
        "about",
        "into",
        "over",
        "under",
        # Generic job-ad / HR noise
        "connaissance", "connaissances", "experience", "experiences",
        "formation", "formations", "gestion", "technique", "techniques",
        "developpement", "developper", "environnement", "environnements",
        "fonction", "fonctions", "titulaire", "titulaires", "client", "clients",
        "equipe", "equipes", "service", "services", "mission", "missions",
        "profil", "profils", "competence", "competences", "qualite", "qualites",
        "niveau", "bac", "ecole", "elements", "element", "correspond",
        "recherche", "recherchons", "recrute", "recrutement", "contrat",
        "cdi", "cdd", "temps", "plein", "partiel", "salaire", "remuneration",
        "avantage", "avantages", "disponible", "disponibilite", "candidat",
        "candidats", "dossier", "lettre", "motivation", "cv", "http", "https",
        "www", "html", "mailto", "gouv", "fr", "com", "org", "reference", "ref",
        "voir", "detail", "details", "lien", "url", "page", "site",
        "depublier", "terminee", "termine", "califications", "qualifications",
        "qualification", "hospitaliere", "hospitalier", "infra", "reseau",
        "reseaux", "systeme", "systemes", "informatique", "administratif",
        "administration",
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\-]{2,}")


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


def tokenize_comment(text: str) -> list[str]:
    """Deterministic token list from free-text user comment."""
    folded = fold(text or "")
    # Drop URLs / query noise before tokenization.
    folded = re.sub(r"https?://\S+", " ", folded)
    folded = re.sub(r"www\.\S+", " ", folded)
    out: list[str] = []
    seen: set[str] = set()
    for m in _TOKEN_RE.finditer(folded):
        tok = m.group(0).strip("-")
        if len(tok) < COMMENT_TERM_MIN_LEN:
            continue
        if len(tok) > 28:
            continue
        if tok in _COMMENT_STOPWORDS:
            continue
        if tok.isdigit():
            continue
        if tok in {"http", "https", "www", "html", "mailto"}:
            continue
        if sum(ch.isdigit() for ch in tok) >= 3:
            continue
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    return out


def aggregate_comment_preferences(
    rows: list[dict[str, Any]] | None,
    *,
    threshold: int = COMMENT_TERM_THRESHOLD,
) -> dict[str, Any]:
    """Build prefer/avoid term lists from user comments × decision."""
    prefer: dict[str, int] = {}
    avoid: dict[str, int] = {}
    commented = 0
    for row in rows or []:
        if (row.get("feedback_origin") or "") != "user":
            continue
        comment = str(row.get("comment") or "").strip()
        if not comment:
            continue
        commented += 1
        decision = str(row.get("decision") or "UNREVIEWED").upper()
        tokens = tokenize_comment(comment)
        if decision == "YES":
            for tok in tokens:
                prefer[tok] = prefer.get(tok, 0) + 2
        elif decision == "NO":
            # Need two NO confirmations of the same distinctive term (weight 1).
            for tok in tokens:
                avoid[tok] = avoid.get(tok, 0) + 1
        elif decision == "MAYBE":
            for tok in tokens:
                prefer[tok] = prefer.get(tok, 0) + 1
        else:
            for tok in tokens:
                prefer[tok] = prefer.get(tok, 0) + 1

    prefer_terms: list[dict[str, Any]] = []
    avoid_terms: list[dict[str, Any]] = []
    for tok, count in sorted(prefer.items()):
        net = count - avoid.get(tok, 0)
        if net < threshold:
            continue
        prefer_terms.append(
            {
                "term": tok,
                "count": count,
                "delta": COMMENT_PER_TERM_CAP,
                "polarity": "prefer",
            }
        )
    for tok, count in sorted(avoid.items()):
        net = count - prefer.get(tok, 0)
        if net < threshold:
            continue
        avoid_terms.append(
            {
                "term": tok,
                "count": count,
                "delta": -COMMENT_PER_TERM_CAP,
                "polarity": "avoid",
            }
        )
    return {
        "commented_feedback_count": commented,
        "prefer_terms": prefer_terms[:40],
        "avoid_terms": avoid_terms[:40],
        "comment_term_threshold": threshold,
        "comment_total_cap": COMMENT_TOTAL_CAP,
    }


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

    comments = aggregate_comment_preferences(rows)
    return {
        "version": SCORE_VERSION,
        "threshold": threshold,
        "per_tag_cap": PER_TAG_DELTA_CAP,
        "total_cap": TOTAL_FEEDBACK_CAP,
        "user_feedback_count": user_feedback_count,
        "active_signals": active,
        "pending_signals": pending,
        **comments,
    }


def load_learned_preferences(conn: Any) -> dict[str, Any]:
    """Read-only aggregate from DB. Never mutates profile.yaml."""
    try:
        rows = conn.execute(
            """
            SELECT feedback_origin, feedback_tags_json, comment, decision
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
                {
                    "feedback_origin": r[0],
                    "feedback_tags_json": r[1],
                    "comment": r[2] if len(r) > 2 else "",
                    "decision": r[3] if len(r) > 3 else "UNREVIEWED",
                }
            )
    return aggregate_learned_signals(dict_rows)


def apply_comment_adjustment(
    *,
    offer_blob_folded: str,
    preferences: dict[str, Any] | None,
) -> tuple[int, list[dict[str, Any]]]:
    prefs = preferences or {}
    applied: list[dict[str, Any]] = []
    raw = 0
    blob = offer_blob_folded or ""
    for term in prefs.get("prefer_terms") or []:
        tok = str(term.get("term") or "")
        if not tok or tok not in blob:
            continue
        delta = _clamp(int(term.get("delta") or 1), 0, COMMENT_PER_TERM_CAP)
        if delta == 0:
            continue
        raw += delta
        applied.append(
            {
                "tag": f"comment:{tok}",
                "term": tok,
                "delta": delta,
                "count": int(term.get("count") or 0),
                "reason": f"comment_prefer:{tok}",
            }
        )
    for term in prefs.get("avoid_terms") or []:
        tok = str(term.get("term") or "")
        if not tok or tok not in blob:
            continue
        delta = _clamp(int(term.get("delta") or -1), -COMMENT_PER_TERM_CAP, 0)
        if delta == 0:
            continue
        raw += delta
        applied.append(
            {
                "tag": f"comment:{tok}",
                "term": tok,
                "delta": delta,
                "count": int(term.get("count") or 0),
                "reason": f"comment_avoid:{tok}",
            }
        )
    return _clamp(raw, -COMMENT_TOTAL_CAP, COMMENT_TOTAL_CAP), applied


def apply_learned_adjustment(
    *,
    base_score: int,
    match_flags: dict[str, bool],
    preferences: dict[str, Any] | None,
    offer_blob_folded: str = "",
) -> tuple[int, int, list[dict[str, Any]]]:
    """Return (final_score, feedback_adjustment, applied_signals)."""
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
    comment_adj, comment_applied = apply_comment_adjustment(
        offer_blob_folded=offer_blob_folded,
        preferences=prefs,
    )
    raw += comment_adj
    applied.extend(comment_applied)
    adjustment = _clamp(raw, -TOTAL_FEEDBACK_CAP, TOTAL_FEEDBACK_CAP)
    return base_score + adjustment, adjustment, applied
