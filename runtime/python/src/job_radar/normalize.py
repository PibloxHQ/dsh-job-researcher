from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from job_radar.config import (
    INTERIEUR_HINTS,
    PREFERRED_NAME_HINTS,
    PUBLIC_IT_KEYWORDS,
)
from job_radar.models import Offer

REMOTE_HINTS = (
    "télétravail",
    "teletravail",
    "full remote",
    "100% remote",
    "remote",
    "à distance",
    "a distance",
)

PART_HINTS = (
    "temps partiel",
    "mi-temps",
    "20 h",
    "20h",
    "50%",
    "quotité",
)


def fold(s: str) -> str:
    """Casefold + strip accents for resilient matching."""
    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c)).casefold()


def _blob(*parts: str) -> str:
    return " ".join(fold(p) for p in parts if p)


def detect_remote(*parts: str) -> str:
    for p in parts:
        v = fold(p).strip()
        if v in {"oui", "yes", "possible"}:
            return "yes"
        if v in {"non", "no"}:
            return "no"
    text = _blob(*parts)
    if any(fold(h) in text for h in REMOTE_HINTS):
        return "yes"
    return "unknown"


def detect_work_time(*parts: str) -> str:
    text = _blob(*parts)
    if any(fold(h) in text for h in PART_HINTS):
        return "part"
    for p in parts:
        v = fold(p).strip()
        if v == "non" and len(parts) == 1:
            return "part"
    if "temps plein" in text or "full time" in text:
        return "full"
    return "unknown"


def geo_tags(location: str, employer: str = "") -> list[str]:
    text = _blob(location, employer)
    tags: list[str] = []
    if any(fold(h) in text for h in PREFERRED_NAME_HINTS):
        tags.append("geo_preferred")
    if "grenoble" in text:
        tags.append("geo_grenoble")
    if any(fold(h) in text for h in REMOTE_HINTS):
        tags.append("geo_remote")
    return tags


def public_tags(title: str, employer: str, description: str = "") -> list[str]:
    text = _blob(title, employer, description)
    tags: list[str] = []
    if any(fold(h) in text for h in INTERIEUR_HINTS):
        tags.append("interieur")
    if any(fold(k) in text for k in PUBLIC_IT_KEYWORDS):
        tags.append("public_it")
    if "contractuel" in text:
        tags.append("contractuel")
    return tags


def normalize_ft(raw: dict[str, Any], profile_tags: list[str] | None = None) -> Offer:
    """Map France Travail Offres v2 offer object → Offer."""
    lieu = raw.get("lieuTravail") or {}
    entreprise = raw.get("entreprise") or {}
    location_parts = [
        lieu.get("libelle") or "",
        lieu.get("commune") or "",
        str(lieu.get("codePostal") or ""),
    ]
    location = ", ".join(p for p in location_parts if p)
    title = (raw.get("intitule") or "").strip() or "(sans titre)"
    employer = (entreprise.get("nom") or "").strip()
    description = (raw.get("description") or "").strip()
    contract = (raw.get("typeContratLibelle") or raw.get("typeContrat") or "").strip()
    url = (raw.get("origineOffre") or {}).get("urlOrigine") or ""
    if not url and raw.get("id"):
        url = f"https://candidat.francetravail.fr/offres/recherche/detail/{raw['id']}"

    rome = []
    if raw.get("romeCode"):
        rome.append(raw["romeCode"])
    if raw.get("romeLibelle"):
        rome.append(raw["romeLibelle"])

    tags = list(profile_tags or [])
    tags.extend(geo_tags(location, employer))
    tags.extend(public_tags(title, employer, description))
    if detect_remote(location, description, json.dumps(raw.get("tempsTravail") or {})) == "yes":
        tags.append("geo_remote")

    return Offer(
        source="ft",
        external_id=str(raw.get("id") or "").strip(),
        title=title,
        employer=employer,
        location=location,
        contract_type=contract,
        work_time=detect_work_time(description, str(raw.get("dureeTravailLibelle") or "")),
        remote=detect_remote(location, description),
        url=url,
        description=description,
        rome_codes=json.dumps(rome, ensure_ascii=False),
        raw_json=json.dumps(raw, ensure_ascii=False)[:20000],
        tags=tags,
    )


def _csp_get(row: dict[str, str], *keys: str) -> str:
    folded_map = {fold(k): v for k, v in row.items()}
    for key in keys:
        fk = fold(key)
        if fk in folded_map and folded_map[fk]:
            return str(folded_map[fk]).strip()
    for want in keys:
        fw = fold(want)
        for k, v in folded_map.items():
            if fw in k and v:
                return str(v).strip()
    return ""


CSP_TITLE = "Intitulé du poste"
CSP_REF = "Référence"
CSP_EMPLOYER = "Employeur"
CSP_ORG = "Organisme de rattachement"
CSP_LOC = "Localisation du poste"
CSP_PLACE = "Lieu d'affectation"
CSP_NATURE = "Nature de l'emploi"
CSP_CONTRACT = "Nature de contrat"
CSP_METIER = "Métier"
CSP_TELE = "Télétravail"
CSP_SKILLS = "Compétences attendues"


def normalize_csp(row: dict[str, str]) -> Offer | None:
    """Map one CSP open-data CSV row → Offer."""
    title = row.get(CSP_TITLE) or _csp_get(row, "intitule", "titre", "title")
    external = row.get(CSP_REF) or _csp_get(row, "reference", "id", "ref")
    if not title and not external:
        return None
    employer = (
        row.get(CSP_EMPLOYER)
        or row.get(CSP_ORG)
        or _csp_get(row, "employeur", "organisme", "administration")
    )
    if not external:
        external = re.sub(r"\W+", "-", f"{title}-{employer}")[:80]

    location = " | ".join(
        p
        for p in (
            row.get(CSP_LOC) or "",
            row.get(CSP_PLACE) or "",
            _csp_get(row, "localisation", "ville", "commune", "lieu"),
        )
        if p
    )
    # de-dupe if fuzzy added same loc twice
    parts = []
    for p in location.split(" | "):
        if p and p not in parts:
            parts.append(p)
    location = " | ".join(parts)

    contract = (
        row.get(CSP_NATURE)
        or row.get(CSP_CONTRACT)
        or _csp_get(row, "nature", "contrat", "type_contrat")
    )
    metier = row.get(CSP_METIER) or _csp_get(row, "metier")
    tele = row.get(CSP_TELE) or _csp_get(row, "teletravail")
    skills = row.get(CSP_SKILLS) or _csp_get(row, "competences", "description")
    description = " | ".join(p for p in (metier, skills, tele) if p)
    url = _csp_get(row, "url", "lien", "link")
    if not url and external:
        url = f"https://choisirleservicepublic.gouv.fr/nos-offres/?recherche={external}"

    tags = ["public"]
    tags.extend(geo_tags(location, employer))
    tags.extend(public_tags(title, f"{employer} {metier}", description))
    if detect_remote(tele, location, description) == "yes":
        tags.append("geo_remote")
    if "contractuel" in fold(contract):
        tags.append("contractuel")

    return Offer(
        source="csp",
        external_id=str(external).strip(),
        title=(title or "(sans titre)").strip(),
        employer=employer.strip(),
        location=location.strip(),
        contract_type=contract.strip(),
        work_time=detect_work_time(description, contract, row.get("Temps Plein") or ""),
        remote=detect_remote(tele, location, description),
        url=url,
        description=description,
        rome_codes="[]",
        raw_json=json.dumps(
            {
                k: row.get(k)
                for k in (
                    CSP_REF,
                    CSP_TITLE,
                    CSP_EMPLOYER,
                    CSP_ORG,
                    CSP_LOC,
                    CSP_PLACE,
                    CSP_NATURE,
                    CSP_METIER,
                    CSP_TELE,
                )
                if row.get(k)
            },
            ensure_ascii=False,
        ),
        tags=tags,
    )


def location_in_scope(
    location: str, *, allow_grenoble: bool = True, allow_remote: bool = True
) -> bool:
    """Heuristic for CSP filtering (FT uses API geo params)."""
    text = fold(location)
    if not text:
        return True
    if allow_remote and any(fold(h) in text for h in REMOTE_HINTS):
        return True
    if any(fold(h) in text for h in PREFERRED_NAME_HINTS):
        return True
    if allow_grenoble and "grenoble" in text:
        return True
    if "(38)" in location or re.search(r"\b38\b", location):
        return True
    if "isere" in text:
        return True
    return False


def is_it_offer(title: str, metier: str = "", skills: str = "") -> bool:
    text = _blob(title, metier, skills)
    # Avoid bare "develop" (matches "développement territorial")
    keys = (
        "developpeur",
        "developpeuse",
        "developpement informatique",
        "developpement logiciel",
        "ingenieur logiciel",
        "ingenieur data",
        "data engineer",
        "data scientist",
        "informat",
        "numerique",
        "devops",
        "logiciel",
        "systeme d information",
        "systemes d information",
        "administrateur systeme",
        "admin systeme",
        "cyber",
        "securite des systemes",
        "cloud",
        "python",
        "javascript",
        "typescript",
        "fullstack",
        "full stack",
        "programmeur",
        "architecte technique",
        "architecte logiciel",
        "reseau informatique",
        "infrastructure",
        "sre",
    )
    return any(k in text for k in keys)
