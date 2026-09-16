"""Emploi-territorial source parsing + IT filtering tests."""

from job_radar.sources import et
from job_radar.sources.et import _external_id, _is_it, parse_rows, row_to_offer

SAMPLE_ROWS = """
<tr id="O038260805000364">
    <td>
        <div class="detail-offres d-lg-none">
            <div class='float-right'>
                <span class='badge-success badge' title='Emploi de catégorie A'>A</span>
                <span class='badge-warning badge' title='Emploi de catégorie B'>B</span>
                <span class='badge badge-secondary' title='Filière Technique'>Technique</span><br />
            </div>
            <span class='badge badge-light mr-2 text-wrap'>Emploi permanent</span>
            <span class='text-muted font-weight-bold set-font-size-0-9em numOf'>
                O038260805000364
            </span>
            <div class='detail-offre detail-offre-titre mb-1'>
                <a href='/offre/o038260805000364-technicien-administrateur-systemes-et-reseaux' class='font-weight-bold lien-details-offre' data-tooltip='Voir le détail'>Technicien Administrateur Systèmes et Réseaux - Sécurité (H/F)</a>
            </div>
            <div class='detail-offre detail-offre-collectivite'>
                <span class='label'><em>Employeur :</em></span>
                <span class='valeur font-weight-bold'>
                    <a class='set-color-dark-blue' href='/emploi-mobilite/?search-col=99452' data-tooltip='Voir toutes les offres de la collectivité'>
                        <span class='icon-hash pr-1'></span>Mairie de Montbonnot-St-Martin
                    </a>
                </span>
                <span class='font-weight-bold text-secondary set-font-size-0-9em ml-2'>Isère</span>
            </div>
            <td class='d-none d-lg-table-cell'>
                <button type="button" data-tooltip="publié le 05/08/2026">publié</button>
            </td>
        </div>
    </td>
</tr>
"""


def test_parse_row_fields():
    rows = parse_rows(SAMPLE_ROWS)
    assert len(rows) == 1
    r = rows[0]
    assert r["offer_id"] == "O038260805000364"
    assert r["title"] == "Technicien Administrateur Systèmes et Réseaux - Sécurité (H/F)"
    assert r["employer"] == "Mairie de Montbonnot-St-Martin"
    assert r["department"] == "Isère"
    assert r["filiere"] == "Technique"
    assert "B" in r["categories"]
    assert r["permanent"] == "Emploi permanent"
    assert r["published"] == "05/08/2026"


def test_external_id_from_offer_id():
    assert _external_id("O038260805000364", "/offre/x") == "O038260805000364"


def test_is_it_positive_and_negative():
    assert _is_it("Technicien informatique (F/H)", "Technique")
    assert _is_it("Technicien Administrateur Systèmes et Réseaux - Sécurité (H/F)", "Technique")
    assert _is_it("Chef de projet IA, data et accompagnement numérique", "Administrative")
    assert _is_it("Responsable sécurité des systèmes d'information (F/H)", "Technique")
    # water network ≠ IT network
    assert not _is_it("Chef d'équipe exploitation et maintenance du réseau d'eau potable (F/H)", "Technique")
    # building trades
    assert not _is_it("Responsable du bâtiment, chef d'équipe entretien maintenance", "Technique")
    assert not _is_it("Instructeur urbanisme", "Technique")
    assert not _is_it("Mécanicien poids lourds et engins (F/H)", "Technique")


def test_row_to_offer_tags():
    rows = parse_rows(SAMPLE_ROWS)
    o = row_to_offer(rows[0], cat="B")
    assert o.source == "et"
    assert o.external_id == "O038260805000364"
    assert o.contract_type == "territorial"
    assert "public" in o.tags and "emploi_territorial" in o.tags and "plan_b" in o.tags
    assert "info_filiere" in o.tags