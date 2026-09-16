"""Structured claims extraction from job offers.

A *claim* is a typed, machine-readable fact extracted from an offer's text
(title, employer, location, description). Claims power downstream matching
against a user profile (see profile.py) and conditional pinging (see ping.py).

Design:
- Deterministic (no LLM) — token/regex extraction, same pattern as triage.py.
- Extensible — add new ClaimKind values and extraction rules without touching
  the rest of the pipeline.
- Order-independent — claims are a bag of facts; scoring happens in profile.py.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ClaimKind(str, Enum):
    """Typed fact extracted from an offer."""

    SKILL = "skill"  # technical or soft skill
    ROLE = "role"  # job role / function
    LOCATION = "location"  # commune, department, remote
    CONTRACT = "contract"  # CDI, CDD, stage, alternance, etc.
    SECTOR = "sector"  # public, private, non-profit, etc.
    WORK_TIME = "work_time"  # full-time, part-time
    EMPLOYER_SIZE = "employer_size"  # PME, ETI, grand comptoire, public
    BENEFIT = "benefit"  # teletravail, formation, etc.


@dataclass(frozen=True)
class Claim:
    """One extracted fact from an offer."""

    kind: ClaimKind
    value: str  # normalised value (lowercase, no accents for matching)
    raw: str  # original text that produced this claim
    confidence: float = 1.0  # 0.0–1.0; regex/exact = 1.0, fuzzy = <1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind.value,
            "value": self.value,
            "raw": self.raw,
            "confidence": self.confidence,
        }


def _fold(s: str) -> str:
    """Casefold + strip accents — mirrors normalize.fold."""
    import unicodedata

    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c)).casefold()


def _has(text: str, token: str) -> bool:
    """Word-boundary match in folded text."""
    return re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", text) is not None


# ── Skill extraction ──────────────────────────────────────────────────

KNOWN_SKILLS: list[tuple[str, str]] = [
    # (token, normalised label)
    ("python", "python"),
    ("javascript", "javascript"),
    ("typescript", "typescript"),
    ("react", "react"),
    ("node", "node.js"),
    ("nodejs", "node.js"),
    ("vue", "vue.js"),
    ("vuejs", "vue.js"),
    ("angular", "angular"),
    ("django", "django"),
    ("flask", "flask"),
    ("fastapi", "fastapi"),
    ("docker", "docker"),
    ("kubernetes", "kubernetes"),
    ("k8s", "kubernetes"),
    ("terraform", "terraform"),
    ("ansible", "ansible"),
    ("aws", "aws"),
    ("azure", "azure"),
    ("gcp", "gcp"),
    ("git", "git"),
    ("linux", "linux"),
    ("bash", "bash"),
    ("sql", "sql"),
    ("postgresql", "postgresql"),
    ("mysql", "mysql"),
    ("mongodb", "mongodb"),
    ("redis", "redis"),
    ("elasticsearch", "elasticsearch"),
    ("grafana", "grafana"),
    ("prometheus", "prometheus"),
    ("ci/cd", "ci/cd"),
    ("cicd", "ci/cd"),
    ("jinja", "jinja"),
    ("php", "php"),
    ("java", "java"),
    ("c#", "c#"),
    ("csharp", "c#"),
    ("rust", "rust"),
    ("go", "golang"),
    ("golang", "golang"),
    ("swift", "swift"),
    ("flutter", "flutter"),
    ("react native", "react native"),
    ("html", "html"),
    ("css", "css"),
    ("sass", "sass"),
    ("graphql", "graphql"),
    ("rest", "rest api"),
    ("rest api", "rest api"),
    ("api", "api"),
    ("microservices", "microservices"),
    ("agile", "agile"),
    ("scrum", "scrum"),
    ("itil", "itil"),
    ("oauth", "oauth"),
    ("ldap", "ldap"),
    ("active directory", "active directory"),
    ("vmware", "vmware"),
    ("proxmox", "proxmox"),
    ("xen", "xen"),
    ("hyper-v", "hyper-v"),
    ("cisco", "cisco"),
    ("firewall", "firewall"),
    ("monitoring", "monitoring"),
    ("supervision", "monitoring"),
    ("scripting", "scripting"),
    ("powershell", "powershell"),
    ("web", "web"),
    ("fullstack", "fullstack"),
    ("full stack", "fullstack"),
    ("frontend", "frontend"),
    ("front-end", "frontend"),
    ("backend", "backend"),
    ("back-end", "backend"),
    ("devops", "devops"),
    ("sre", "sre"),
    ("cloud", "cloud"),
    ("data", "data"),
    ("ia", "ia"),
    ("ml", "ml"),
    ("machine learning", "ml"),
    ("ia/générative", "ia generative"),
    ("llm", "llm"),
]

# ── Role extraction ───────────────────────────────────────────────────

KNOWN_ROLES: list[tuple[str, str]] = [
    ("administrateur systeme", "administrateur systeme"),
    ("admin sys", "administrateur systeme"),
    ("admin systeme", "administrateur systeme"),
    ("technicien systeme", "technicien systeme et reseaux"),
    ("systemes et reseaux", "technicien systeme et reseaux"),
    ("systeme et reseaux", "technicien systeme et reseaux"),
    ("developpeur", "developpeur"),
    ("developpeuse", "developpeur"),
    ("ingenieur logiciel", "ingenieur logiciel"),
    ("ingenieur data", "ingenieur data"),
    ("data engineer", "ingenieur data"),
    ("devops", "devops"),
    ("exploitant", "exploitant"),
    ("exploitation", "exploitant"),
    ("sre", "sre"),
    ("cloud", "ingenieur cloud"),
    ("ingenieur systeme", "ingenieur systeme"),
    ("ingenieur reseau", "ingenieur reseau"),
    ("architecte technique", "architecte technique"),
    ("architecte logiciel", "architecte logiciel"),
    ("chef de projet", "chef de projet"),
    ("tech lead", "tech lead"),
    ("lead developer", "tech lead"),
    ("fullstack", "developpeur fullstack"),
    ("full stack", "developpeur fullstack"),
    ("technicien de maintenance", "technicien maintenance"),
    ("cybersecurite", "cybersecurite"),
    ("securite", "cybersecurite"),
    ("assistant informatique", "assistant informatique"),
    ("support informatique", "support informatique"),
    ("helpdesk", "helpdesk"),
    ("charge d'application", "charge d'application"),
    ("charge d application", "charge d'application"),
]

# ── Sector extraction ─────────────────────────────────────────────────

PUBLIC_SECTOR_TOKENS = (
    "mairie",
    "commune",
    "ville de",
    "conseil general",
    "conseil departemental",
    "prefecture",
    "sous-prefecture",
    "ministere",
    "etat",
    "gouvernement",
    "hopital",
    "chu",
    "centre hospitalier",
    "etablissement public",
    "public",
    "service public",
    "collectivite",
    "metropole",
    "communaute",
    "epci",
    "departement",
    "region",
    "agence",
    "office",
    "sdis",
    "pompiers",
    "gendarmerie",
    "police nationale",
)

# ── Contract extraction ───────────────────────────────────────────────

CONTRACT_PATTERNS: list[tuple[str, str]] = [
    # (token, normalised)
    ("cdi", "cdi"),
    ("cdd", "cdd"),
    ("alternance", "alternance"),
    ("apprentissage", "alternance"),
    ("stage", "stage"),
    ("interim", "interim"),
    ("intérim", "interim"),
    ("interim", "interim"),
    ("mission", "mission"),
    ("saisonnier", "saisonnier"),
    ("saison", "saisonnier"),
    ("contractuel", "contractuel"),
    ("fonctionnaire", "fonctionnaire"),
    ("titulaire", "fonctionnaire"),
]

# ── Benefit extraction ────────────────────────────────────────────────

BENEFIT_PATTERNS: list[tuple[str, str]] = [
    ("teletravail", "teletravail"),
    ("télétravail", "teletravail"),
    ("remote", "remote"),
    ("formation", "formation"),
    ("mutuelle", "mutuelle"),
    ("rdp", "rdp"),
    ("retraite", "retraite"),
    ("prevoyance", "prevoyance"),
    ("avantages", "avantages"),
    ("prime", "prime"),
]

# ── Employer size ─────────────────────────────────────────────────────

EMPLOYER_SIZE_PATTERNS: list[tuple[str, str]] = [
    ("tpe", "tpe"),
    ("pme", "pme"),
    ("eti", "eti"),
    ("grand compteur", "grand_compte"),
    ("grand groupe", "grand_compte"),
    ("startup", "startup"),
    ("start-up", "startup"),
]


def extract_claims(row: dict[str, Any]) -> list[Claim]:
    """Extract structured claims from an offer row (same shape as triage input).

    Args:
        row: dict with keys title, employer, location, description, contract_type,
             work_time, remote (all optional strings).

    Returns:
        List of Claim objects. Deduplicated by (kind, value).
    """
    title = row.get("title") or ""
    employer = row.get("employer") or ""
    location = row.get("location") or ""
    description = row.get("description") or ""
    contract_type = row.get("contract_type") or ""
    work_time = row.get("work_time") or "unknown"
    remote = row.get("remote") or "unknown"

    blob_all = _fold(f"{title} | {employer} | {location} | {description} | {contract_type}")
    blob_desc = _fold(description)
    blob_title = _fold(title)

    claims: list[Claim] = []
    seen: set[tuple[str, str]] = set()

    def _add(kind: ClaimKind, value: str, raw: str, confidence: float = 1.0) -> None:
        key = (kind.value, value)
        if key not in seen:
            seen.add(key)
            claims.append(Claim(kind=kind, value=value, raw=raw, confidence=confidence))

    # ── Skills ────────────────────────────────────────────────────────
    for token, label in KNOWN_SKILLS:
        if _has(blob_all, token):
            _add(ClaimKind.SKILL, label, token)

    # ── Roles ─────────────────────────────────────────────────────────
    for token, label in KNOWN_ROLES:
        if _has(blob_title, token) or _has(blob_all, token):
            _add(ClaimKind.ROLE, label, token)

    # ── Location ──────────────────────────────────────────────────────
    if remote in ("yes",):
        _add(ClaimKind.LOCATION, "remote", remote)
    elif remote == "unknown" and _has(blob_all, "teletravail") or _has(blob_all, "remote"):
        _add(ClaimKind.LOCATION, "remote", "remote hint in text", confidence=0.8)

    # Department
    dept_match = re.search(r"\(38\)", location)
    if dept_match:
        _add(ClaimKind.LOCATION, "isere_38", "Isère (38)")
    elif "isere" in _fold(location):
        _add(ClaimKind.LOCATION, "isere_38", location)
    elif "grenoble" in _fold(location):
        _add(ClaimKind.LOCATION, "grenoble", location)

    # Corridor communes
    from job_radar.triage import CORRIDOR_TOKENS

    for ct in CORRIDOR_TOKENS:
        if _has(blob_all, ct):
            _add(ClaimKind.LOCATION, f"commune:{ct}", ct, confidence=0.9)
            break  # one commune is enough

    # ── Contract ──────────────────────────────────────────────────────
    # Check explicit contract_type field first
    ct_folded = _fold(contract_type)
    for token, label in CONTRACT_PATTERNS:
        if token in ct_folded:
            _add(ClaimKind.CONTRACT, label, contract_type)
            break
    # Fallback to text scan
    if not any(c.kind == ClaimKind.CONTRACT for c in claims):
        for token, label in CONTRACT_PATTERNS:
            if _has(blob_all, token):
                _add(ClaimKind.CONTRACT, label, token)
                break

    # ── Sector ────────────────────────────────────────────────────────
    for token in PUBLIC_SECTOR_TOKENS:
        if _has(blob_all, token):
            _add(ClaimKind.SECTOR, "public", token, confidence=0.9)
            break
    if not any(c.kind == ClaimKind.SECTOR for c in claims):
        _add(ClaimKind.SECTOR, "private", "default")

    # ── Work time ─────────────────────────────────────────────────────
    if work_time in ("full", "part"):
        _add(ClaimKind.WORK_TIME, work_time, work_time)
    elif "temps plein" in blob_all or "full time" in blob_all:
        _add(ClaimKind.WORK_TIME, "full", "temps plein")
    elif "temps partiel" in blob_all or "mi-temps" in blob_all:
        _add(ClaimKind.WORK_TIME, "part", "temps partiel")

    # ── Employer size ─────────────────────────────────────────────────
    for token, label in EMPLOYER_SIZE_PATTERNS:
        if _has(blob_all, token):
            _add(ClaimKind.EMPLOYER_SIZE, label, token, confidence=0.7)

    # ── Benefits ──────────────────────────────────────────────────────
    for token, label in BENEFIT_PATTERNS:
        if _has(blob_all, token):
            _add(ClaimKind.BENEFIT, label, token)

    return claims
