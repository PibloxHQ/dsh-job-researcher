from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

def _resolve_data_dir() -> Path:
    """Plugin-owned data under DSH, with legacy fallback for rollback tooling."""
    explicit = os.getenv("JOB_RESEARCHER_DATA_DIR") or os.getenv("DB_PATH")
    if explicit:
        p = Path(explicit)
        # DB_PATH may point at a file; use parent as data dir.
        return p.parent if p.suffix == ".db" else p
    dsh_home = os.getenv("DSH_HOME")
    if dsh_home:
        return Path(dsh_home) / "job-researcher"
    return Path(__file__).resolve().parents[2] / "data"


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = _resolve_data_dir()
CACHE_DIR = DATA_DIR / "cache"

# Preferred local communes (INSEE) — Montbonnot + Grésivaudan corridor
PREFERRED_COMMUNE_INSEE = {
    "38249": "Montbonnot-Saint-Martin",
    "38229": "Meylan",
    "38140": "Crolles",
    "38471": "Saint-Ismier",
    "38485": "Le Versoud",
    "38185": "Grenoble",  # allowed especially for public
}

PREFERRED_NAME_HINTS = tuple(
    name.casefold() for name in PREFERRED_COMMUNE_INSEE.values()
) + (
    "montbonnot",
    "gréssivaudan",
    "gresivaudan",
    "isère",
    "isere",
)

PUBLIC_IT_KEYWORDS = (
    "développ",
    "develop",
    "informatique",
    "numérique",
    "numerique",
    "devops",
    "système d'information",
    "systeme d'information",
    "full stack",
    "fullstack",
    "python",
    "typescript",
    "javascript",
    "docker",
    "cloud",
    "data",
    "réseau",
    "reseau",
)

INTERIEUR_HINTS = (
    "intérieur",
    "interieur",
    "ministère de l'intérieur",
    "ministere de l'interieur",
    "préfecture",
    "prefecture",
    "police nationale",
    "gendarmerie",
)

QUERY_PROFILES: dict[str, dict] = {
    "fullstack": {
        "motsCles": "développeur typescript",
        "tags": ["fullstack"],
    },
    "web": {
        "motsCles": "développeur web",
        "tags": ["fullstack", "web"],
    },
    "automation": {
        "motsCles": "automatisation",
        "tags": ["automation"],
    },
    "platform": {
        "motsCles": "DevOps",
        "tags": ["platform", "infra"],
    },
    "infra": {
        "motsCles": "administrateur systèmes",
        "tags": ["infra"],
    },
    "infra_reseau": {
        "motsCles": "administrateur réseau",
        "tags": ["infra"],
    },
    "sre": {
        "motsCles": "SRE",
        "tags": ["infra", "platform"],
    },
    "cloud": {
        "motsCles": "cloud ingénieur",
        "tags": ["infra", "platform"],
    },
    "sysadmin": {
        "motsCles": "ingénieur système",
        "tags": ["infra"],
    },
    "public_it": {
        "motsCles": "informatique",
        "tags": ["public_it", "infra"],
    },
}


@dataclass
class Settings:
    root: Path = ROOT
    db_path: Path = field(default_factory=lambda: DATA_DIR / "radar.db")
    cache_dir: Path = field(default_factory=lambda: CACHE_DIR)
    ft_client_id: str = ""
    ft_client_secret: str = ""
    ft_token_url: str = (
        "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
        "?realm=/partenaire"
    )
    ft_api_base: str = "https://api.francetravail.io/partenaire/offresdemploi/v2"
    ft_scope: str = "api_offresdemploiv2 o2dsoffre"
    csp_dataset_api: str = (
        "https://www.data.gouv.fr/api/1/datasets/"
        "les-offres-diffusees-sur-choisir-le-service-public/"
    )
    departement: str = "38"
    # Part-time filter intentionally OFF (Ikigai: revisit later)
    filter_part_time: bool = False

    def require_ft_credentials(self) -> None:
        if not self.ft_client_id or not self.ft_client_secret:
            raise SystemExit(
                "Missing FT_CLIENT_ID / FT_CLIENT_SECRET. "
                "Copy .env.example → .env and create an app on francetravail.io "
                "(subscribe to Offres d'emploi v2)."
            )


def load_settings() -> Settings:
    # Prefer process env (DSH secrets materialize). Optional dotenv for local/dev only.
    load_dotenv(ROOT / ".env", override=False)
    data_dir = _resolve_data_dir()
    cache_dir = data_dir / "cache"
    data_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    db_env = os.getenv("DB_PATH")
    if db_env and Path(db_env).suffix == ".db":
        db_path = Path(db_env)
    else:
        db_path = data_dir / "radar.db"
    return Settings(
        root=ROOT,
        db_path=db_path,
        cache_dir=cache_dir,
        ft_client_id=os.getenv("FT_CLIENT_ID", "").strip(),
        ft_client_secret=os.getenv("FT_CLIENT_SECRET", "").strip(),
        ft_token_url=os.getenv(
            "FT_TOKEN_URL",
            "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
            "?realm=/partenaire",
        ),
        ft_api_base=os.getenv(
            "FT_API_BASE",
            "https://api.francetravail.io/partenaire/offresdemploi/v2",
        ),
    )


def dumps_tags(tags: list[str]) -> str:
    return json.dumps(sorted(set(tags)), ensure_ascii=False)


def loads_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return list(data) if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []
