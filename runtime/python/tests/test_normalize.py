from __future__ import annotations

import json
from pathlib import Path

from job_radar.normalize import normalize_csp, normalize_ft

FIX = Path(__file__).parent / "fixtures"


def test_normalize_ft_meylan_remote_tag():
    raw = json.loads((FIX / "ft_offer.json").read_text(encoding="utf-8"))
    offer = normalize_ft(raw, profile_tags=["fullstack"])
    assert offer.source == "ft"
    assert offer.external_id == "FT123"
    assert "Meylan" in offer.location
    assert offer.remote == "yes"
    assert "fullstack" in offer.tags
    assert "geo_preferred" in offer.tags


def test_normalize_csp_interieur():
    row = {
        "Référence": "CSP-1",
        "Intitulé du poste": "Développeur Python H/F",
        "Employeur": "Ministère de l'Intérieur",
        "Localisation du poste": "Grenoble (38)",
        "Nature de l'emploi": "Emploi ouvert aux contractuels",
        "Métier": "Développeuse / Développeur",
        "Télétravail": " Oui",
        "Compétences attendues": "Python",
    }
    offer = normalize_csp(row)
    assert offer is not None
    assert offer.source == "csp"
    assert "interieur" in offer.tags
    assert "contractuel" in offer.tags
    assert "geo_grenoble" in offer.tags
    assert offer.remote == "yes"
