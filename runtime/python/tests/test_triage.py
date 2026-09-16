"""Deterministic triage scoring tests."""

import pytest

from job_radar.triage import score_offer


def _row(title, employer="", location="Isère (38)", description=""):
    return {
        "title": title,
        "employer": employer,
        "location": location,
        "description": description,
    }


def test_corridor_infra_is_interested():
    tr = score_offer(
        _row(
            "Technicien Administrateur Systèmes et Réseaux - Sécurité (H/F)",
            "Mairie de Montbonnot-Saint-Martin",
        )
    )
    assert tr.verdict == "interested"
    assert "montbonnot" in tr.reasons[0]


def test_far_corner_is_skip():
    tr = score_offer(
        _row("TECHNICIEN RESEAUX ET SYSTEMES D'INFORMATION H/F", "Mairie de Tignieu-Jameyzieu")
    )
    assert tr.verdict == "skip"
    assert tr.reasons[0].startswith("loin")


def test_alternance_downgraded():
    tr = score_offer(
        _row(
            "Technicien Exploitant Informatique en Alternance",
            "CHU de Grenoble",
        )
    )
    # corridor (+2) + exploitant (+2) - alternance (-2) = 2 → maybe
    assert tr.verdict in ("maybe", "skip")


def test_st_egreve_corridor_recovered_from_title():
    tr = score_offer(
        _row(
            "TECHNICIEN INFORMATIQUE CHARGÉ D'APPLICATION",
            "Mairie de Saint-Égrève",
        )
    )
    assert "egreve" in tr.reasons[0]


def test_unknown_town_no_role_is_skip():
    tr = score_offer(_row("Chef de projet SI", "C.C des Vals du Dauphiné"))
    assert tr.verdict == "skip"


def test_first_seen_ids_not_required():
    # scoring must not depend on tags/interest columns
    tr = score_offer(_row("Technicien d'exploitation", "Mairie de Sassenage"))
    assert tr.verdict == "interested"