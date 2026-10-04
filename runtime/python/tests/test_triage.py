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



def test_student_negation_in_description_is_not_penalized():
    tr = score_offer(
        _row(
            "Ingénieur Planificateur (H/F)",
            "PARLYM",
            "38 - Grenoble",
            "Expérience d'au moins 6 ans sur un poste similaire (hors alternance ou stage)",
        )
    )
    assert tr.base_score == 2
    assert not any("alternance/stage" in reason for reason in tr.reasons)


def test_generic_support_prose_does_not_create_it_role_fit():
    tr = score_offer(
        _row(
            "INGÉNIEUR SM QSE MULTI-SITES (F/H)",
            "Industrie",
            "38 - Isle-d'Abeau",
            "Animation & Support QSE et système documentaire",
        )
    )
    assert not any("support/assistance" in reason for reason in tr.reasons)
    assert tr.verdict == "skip"


def test_normalized_geo_tag_can_supply_corridor_signal():
    row = _row("Technicien informatique", "Collectivité", "Isère | 38")
    row["tags"] = '["geo_preferred"]'
    tr = score_offer(row)
    assert tr.base_score >= 2
    assert any("signal géo normalisé" in reason for reason in tr.reasons)


def test_embedded_software_role_is_detected():
    tr = score_offer(
        _row(
            "Ingénieur de développement logiciel embarqué (H/F)",
            "Atos",
            "38 - Grenoble",
            "Développement de fonctions logicielles et protocoles réseau",
        )
    )
    assert tr.verdict == "interested"
    assert any("métier infra/dev" in reason for reason in tr.reasons)



def test_location_and_feedback_cannot_make_non_it_role_interested():
    prefs = {
        "active_signals": [
            {"tag": "location_good", "delta": 1, "count": 4, "actionable": True},
        ]
    }
    tr = score_offer(
        _row("INGENIEUR EN CHARPENTE METALLIQUE / ALLUMINIUM (H/F)", "", "38 - Grenoble"),
        preferences=prefs,
    )
    assert tr.verdict == "skip"


def test_cloud_sales_title_is_not_devops_fit():
    tr = score_offer(
        _row(
            "Directeur Grands Comptes - Solutions Cloud (H/F)",
            "Entreprise",
            "38 - Grenoble",
            "Vente de solutions cloud aux grands comptes",
        )
    )
    assert tr.verdict == "skip"
    assert not any("métier infra/dev" in reason for reason in tr.reasons)


def test_first_seen_ids_not_required():
    # scoring must not depend on tags/interest columns
    tr = score_offer(_row("Technicien d'exploitation", "Mairie de Sassenage"))
    assert tr.verdict == "interested"