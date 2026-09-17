"""Per-offer triage for Florian (Mestryx).

Deterministic scoring of a job offer → verdict (interested / maybe / skip).
Replaces the previous LLM-in-prompt bucket guessing that could not discriminate
because the CSP filtre source only stores 'Isère (38)' as location (no town).

The town is recovered from the offer **title** (CSP filtre titles carry the
employer commune, e.g. '... - MAIRIE DE MONTBONNOT-ST-MARTIN') and, when
present, from employer/location free text.

Optional ``preferences`` (from user-origin feedback tags) apply a capped,
explainable adjustment. Backward compatible: ``score_offer(row)`` with no
preferences behaves as before (base score only).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from job_radar.learning import SCORE_VERSION, apply_learned_adjustment
from job_radar.normalize import fold


def _has_word(text: str, token: str) -> bool:
    """Word-boundary match for a folded token in folded text."""
    return re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", text) is not None

# ---- Geo: Grenoble basin corridor closest to Montbonnot (Montbonnot is home).
# Tokens fold() to lowercase/no accents. +2 for a corridor commune.
CORRIDOR_TOKENS = (
    "montbonnot",
    "meylan",
    "crolles",
    "st-ismier",
    "saint-ismier",
    "versoud",
    "grenoble",
    "st-egreve",
    "saint-egreve",
    "sassenage",
    "seyssinet",
    "gières",
    "gieres",
    "la tronche",
    "st-martin-d'heres",
    "saint-martin-d-heres",
    "echirolles",
    "fontaine",
    "domene",
    "domanes",
)
# --- Known-far corners of Isère (north / south / alpine): -1 penalty.
FAR_TOKENS = (
    "tignieu",
    "jameyzieu",
    "morestel",
    "voiron",
    "rives",
    "vienne",
    "bourgoin",
    "l'isle-d'abeau",
    "isle-d-abeau",
    "la tour-du-pin",
    "tour-du-pin",
    "pont-de-beauvoisin",
    "bourg-d'oisans",
)

# ---- Role fit: Florian is dev+infra (sysadmin, réseau, DevOps, cloud), public
# sector OK (Plan B). Strong sysadmin-infra = +2 ; dev = +2 ; support = +1.
STRONG_ROLE_TOKENS = (
    "administrateur",
    "admin sys",
    "admin systeme",
    "technicien systeme",
    "systemes et reseaux",
    "systeme et reseaux",
    "securite",
    "sécurité",
    "devops",
    "exploitant",
    "exploitation",
    "sre",
    "cloud",
    "infrastructur",
    "ingenieur systeme",
    "ingenieur reseau",
    "dev fullstack",
    "fullstack",
    "full stack",
    "developpeur",
    "developpeuse",
)
# Support / helpdesk / application-level: still infra-adjacent → +1.
SUPPORT_ROLE_TOKENS = (
    "assistant",
    "assistance",
    "support",
    "proximite",
    "helpdesk",
    "hotline",
    "charge d'application",
    "charge d application",
    "maintenance informatique",
)
# Students-only tracks: not Florian's track.
STUDENT_TOKENS = ("alternance", "apprentissage", "stage", "contrat d'apprentissage")

CORRIDOR_EMPLOYER_TOKENS = ("commun", "metropole", "ville de", "epci", "sitpi")

CONTRACT_BAD_TOKENS = (
    "interim",
    "intérim",
    "cdd court",
    "vacation",
    "vacataire",
    "freelance",
    "portage",
)


@dataclass
class Triage:
    verdict: str  # interested | maybe | skip
    score: int
    reasons: list[str] = field(default_factory=list)
    base_score: int = 0
    feedback_adjustment: int = 0
    learned_signals: list[dict[str, Any]] = field(default_factory=list)
    score_version: str = SCORE_VERSION

    def to_row_note(self) -> str:
        return "; ".join(self.reasons)

    def as_summary(self) -> str:
        return f"{self.verdict} (score {self.score}): " + " | ".join(self.reasons)

    def details_dict(self) -> dict[str, Any]:
        return {
            "reasons": list(self.reasons),
            "base_score": self.base_score,
            "feedback_adjustment": self.feedback_adjustment,
            "learned_signals": list(self.learned_signals),
            "score_version": self.score_version,
        }


def _extract_town(title: str, employer: str, location: str) -> str:
    """Best-effort town recovery (folded, no accents)."""
    blob = fold(f"{title} | {employer} | {location}")
    # Prefer explicit commune patterns in title (CSP filtre: 'MAIRIE DE X').
    for lead in ("mairie de ", "ville de ", "commune de ", "mairie des ", "ville des ",
                 "mairie d'", "ville d'"):
        idx = blob.find(lead)
        if idx >= 0:
            after = blob[idx + len(lead):].split("|")[0].strip(" -_")
            if after:
                return after.replace("_", " ").strip()
    # Fallback: a known corridor/far commune token anywhere in the blob.
    for token in list(CORRIDOR_TOKENS) + list(FAR_TOKENS):
        if _has_word(blob, token):
            return token
    return ""


def score_offer(
    row: dict[str, Any],
    preferences: dict[str, Any] | None = None,
) -> Triage:
    title = row.get("title") or ""
    employer = row.get("employer") or ""
    location = row.get("location") or ""
    desc = row.get("description") or ""
    contract = row.get("contract_type") or ""
    town = _extract_town(title, employer, location)
    blob_title = fold(title)
    blob_all = fold(f"{title} | {employer} | {location} | {desc} | {contract}")

    score = 0
    reasons: list[str] = []
    corridor = False
    far = False
    strong_hit = False
    support_hit = False
    public_hit = False
    student_hit = False
    contract_bad_hit = False

    # Geo
    if town and any(_has_word(town, t) for t in CORRIDOR_TOKENS):
        score += 2
        corridor = True
        reasons.append(f"corridor Grenoble (commune '{town}')")
    elif any(_has_word(blob_all, t) for t in FAR_TOKENS):
        score -= 1
        far = True
        reasons.append(f"loin ({town or 'commune inconnue'})")
    else:
        reasons.append("commune indéterminée → géo à confirmer")

    # Role fit
    strong = [t for t in STRONG_ROLE_TOKENS if t in blob_all]
    if strong:
        score += 2
        strong_hit = True
        reasons.append("métier infra/dev ({}".format(", ".join(sorted(set(strong))[:3])) + ")")
    support = [t for t in SUPPORT_ROLE_TOKENS if t in blob_all]
    if support:
        score += 1
        support_hit = True
        reasons.append("support/assistance ({}".format(", ".join(sorted(set(support))[:3])) + ")")

    # Employer signal: public interco/metropole adjacent to corridor.
    emb = fold(employer)
    if employer and any(t in emb for t in CORRIDOR_EMPLOYER_TOKENS):
        public_hit = True
        score += 0  # neutral, informational only
        reasons.append(f"employeur: {employer}")

    # Student track → skip unless strong infra fit and full-time.
    if any(fold(t) in blob_all for t in STUDENT_TOKENS):
        score -= 2
        student_hit = True
        reasons.append("alternance/stage (hors parcours)")

    if any(fold(t) in blob_all for t in CONTRACT_BAD_TOKENS):
        contract_bad_hit = True

    base_score = score
    match_flags = {
        "location_good": corridor,
        "too_far": far,
        "dev_infra_good": strong_hit,
        "support_good": support_hit,
        "support_bad": support_hit,
        "public_sector_good": public_hit,
        "student_contract_bad": student_hit,
        "contract_bad": contract_bad_hit or student_hit,
        "missing_diploma": False,
        "needs_details": False,
    }

    final_score, adjustment, applied = apply_learned_adjustment(
        base_score=base_score,
        match_flags=match_flags,
        preferences=preferences,
    )
    if adjustment:
        reasons.append(f"feedback_adjustment={adjustment:+d}")
        for sig in applied:
            reasons.append(f"learned:{sig['tag']}({sig['delta']:+d})")

    score = final_score
    if score >= 3:
        verdict = "interested"
    elif score >= 1:
        verdict = "maybe"
    else:
        verdict = "skip"

    return Triage(
        verdict=verdict,
        score=score,
        reasons=reasons,
        base_score=base_score,
        feedback_adjustment=adjustment,
        learned_signals=applied,
        score_version=SCORE_VERSION,
    )


def bucket_label(verdict: str) -> str:
    return {
        "interested": "INTERESSE",
        "maybe": "A VOIR",
        "skip": "PAS POUR MOI",
    }.get(verdict, verdict)
