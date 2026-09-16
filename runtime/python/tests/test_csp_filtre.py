from job_radar.sources.csp_filtre import (
    DEFAULT_FILTRE_PATH,
    card_to_offer,
    parse_offer_cards,
)

SAMPLE = """
<div class="fr-card fr-card--horizontal fr-card--offer">
  <h3>Technicien informatique - TEST</h3>
  <a href="/offre-emploi/technicien-informatique-test-reference-O038260728001795/">voir</a>
  <ul>
    <li>Numérique</li>
    <li>Localisation : Isère (38)</li>
    <li>Fonction publique : Fonction publique Territoriale</li>
    <li>Employeur : Communes</li>
    <li>En ligne depuis le 28 juillet 2026</li>
  </ul>
</div>
"""


def test_parse_offer_cards():
    cards = parse_offer_cards(SAMPLE)
    assert len(cards) == 1
    c = cards[0]
    assert "Technicien informatique" in c["title"]
    assert "O038260728001795" in c["url"]
    assert c["employer"] == "Communes"
    assert "Isère" in c["location"]


def test_card_to_offer_tags():
    cards = parse_offer_cards(SAMPLE)
    offer = card_to_offer(cards[0], filtre_path=DEFAULT_FILTRE_PATH)
    assert offer.source == "csp"
    assert offer.external_id == "O038260728001795"
    assert "csp_filtre" in offer.tags
    assert "plan_b" in offer.tags
    assert "isere" in offer.tags
