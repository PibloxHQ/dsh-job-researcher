"""Tests for claims extraction."""
from job_radar.claims import Claim, ClaimKind, extract_claims


def test_extract_skills_from_title():
    row = {
        "title": "DevOps Python/Docker Engineer",
        "employer": "Acme Corp",
        "location": "Grenoble (38)",
        "description": "Working with Python, Docker, Kubernetes, AWS",
        "contract_type": "CDI",
    }
    claims = extract_claims(row)
    skill_values = {c.value for c in claims if c.kind == ClaimKind.SKILL}
    assert "python" in skill_values
    assert "docker" in skill_values
    assert "kubernetes" in skill_values
    assert "aws" in skill_values


def test_extract_roles():
    row = {
        "title": "Administrateur Système Linux",
        "employer": "Mairie de Grenoble",
        "location": "Grenoble (38)",
        "description": "Gestion de serveurs Linux, Windows Server, VMware",
        "contract_type": "CDD",
    }
    claims = extract_claims(row)
    role_values = {c.value for c in claims if c.kind == ClaimKind.ROLE}
    assert "administrateur systeme" in role_values


def test_extract_contract_from_field():
    row = {
        "title": "Ingénieur DevOps",
        "employer": "StartupTech",
        "location": "Paris",
        "description": "",
        "contract_type": "CDI",
    }
    claims = extract_claims(row)
    contract_values = {c.value for c in claims if c.kind == ClaimKind.CONTRACT}
    assert "cdi" in contract_values


def test_extract_contract_from_text():
    row = {
        "title": "Stage développeur Python",
        "employer": "Uni Corp",
        "location": "Lyon",
        "description": "Stage de 6 mois en développement Python",
        "contract_type": "",
    }
    claims = extract_claims(row)
    contract_values = {c.value for c in claims if c.kind == ClaimKind.CONTRACT}
    assert "stage" in contract_values


def test_extract_public_sector():
    row = {
        "title": "Technicien Systèmes",
        "employer": "Mairie de Meylan",
        "location": "Meylan (38)",
        "description": "Service informatique municipal",
        "contract_type": "Contractuel",
    }
    claims = extract_claims(row)
    sector_values = {c.value for c in claims if c.kind == ClaimKind.SECTOR}
    assert "public" in sector_values


def test_extract_location_grenoble():
    row = {
        "title": "Dev Python",
        "employer": "TechCo",
        "location": "Grenoble (38)",
        "description": "",
        "contract_type": "CDI",
    }
    claims = extract_claims(row)
    loc_values = {c.value for c in claims if c.kind == ClaimKind.LOCATION}
    assert "isere_38" in loc_values or "grenoble" in loc_values


def test_extract_deduplication():
    """Same skill mentioned twice should produce one claim."""
    row = {
        "title": "Python Python Python",
        "employer": "X",
        "location": "Paris",
        "description": "Python is our main language. We use Python daily.",
        "contract_type": "",
    }
    claims = extract_claims(row)
    python_claims = [c for c in claims if c.kind == ClaimKind.SKILL and c.value == "python"]
    assert len(python_claims) == 1


def test_extract_empty_row():
    row = {"title": "", "employer": "", "location": "", "description": ""}
    claims = extract_claims(row)
    # Should return something (sector default, maybe contract)
    assert isinstance(claims, list)


def test_extract_remote_hint():
    row = {
        "title": "Full Remote Developer",
        "employer": "RemoteInc",
        "location": "",
        "description": "Teletravail possible, full remote",
        "contract_type": "CDI",
        "remote": "yes",
    }
    claims = extract_claims(row)
    loc_values = {c.value for c in claims if c.kind == ClaimKind.LOCATION}
    assert "remote" in loc_values


def test_extract_benefits():
    row = {
        "title": "DevOps Engineer",
        "employer": "BigCo",
        "location": "Paris",
        "description": "Télétravail 3 jours/semaine, formation continue, mutuelle prise en charge",
        "contract_type": "CDI",
    }
    claims = extract_claims(row)
    benefit_values = {c.value for c in claims if c.kind == ClaimKind.BENEFIT}
    assert "teletravail" in benefit_values
    assert "formation" in benefit_values
    assert "mutuelle" in benefit_values
