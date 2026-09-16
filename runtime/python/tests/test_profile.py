"""Tests for profile loading and match scoring."""
from pathlib import Path

import pytest

from job_radar.claims import Claim, ClaimKind, extract_claims
from job_radar.profile import ClaimMatch, MatchResult, Profile, match_score


# ── Profile loading ───────────────────────────────────────────────────


def test_profile_from_dict():
    data = {
        "name": "Test",
        "weights": {"skill": 5.0},
        "required": {"skill": ["python"]},
        "accepted": {"skill": ["python", "docker"]},
    }
    p = Profile.from_dict(data)
    assert p.name == "Test"
    assert p.weight(ClaimKind.SKILL) == 5.0
    assert p.is_required(ClaimKind.SKILL, "python")
    assert not p.is_required(ClaimKind.SKILL, "docker")


def test_profile_defaults():
    p = Profile()
    assert p.name == "default"
    assert p.weight(ClaimKind.SKILL) == 3.0
    assert p.weight(ClaimKind.LOCATION) == 4.0


def test_profile_accepted_wildcard():
    p = Profile(accepted={})
    # Empty accepted = wildcard (any value accepted)
    assert p.is_accepted(ClaimKind.SKILL, "anything")


def test_profile_accepted_specific():
    p = Profile(accepted={"skill": ["python", "docker"]})
    assert p.is_accepted(ClaimKind.SKILL, "python")
    assert not p.is_accepted(ClaimKind.SKILL, "rust")


def test_profile_from_yaml():
    pp = Path(__file__).parent.parent / "profile.yaml"
    if pp.exists():
        p = Profile.from_yaml(pp)
        assert p.name.startswith("Florian")
        assert "python" in p.accepted.get("skill", [])


# ── Match scoring ─────────────────────────────────────────────────────


def _make_profile():
    return Profile(
        weights={"skill": 3.0, "role": 2.0, "location": 4.0, "contract": 2.0},
        required={"skill": ["python"], "contract": ["cdi"]},
        accepted={
            "skill": ["python", "docker", "linux"],
            "role": ["devops", "developpeur"],
            "location": ["isere_38", "remote"],
            "contract": ["cdi"],
        },
    )


def test_match_strong():
    claims = [
        Claim(ClaimKind.SKILL, "python", "python"),
        Claim(ClaimKind.SKILL, "docker", "docker"),
        Claim(ClaimKind.ROLE, "devops", "devops"),
        Claim(ClaimKind.LOCATION, "isere_38", "Grenoble"),
        Claim(ClaimKind.CONTRACT, "cdi", "CDI"),
    ]
    result = match_score(claims, _make_profile())
    assert result.required_satisfied
    assert result.match_rate > 0.7
    assert result.verdict == "strong_match"


def test_match_missing_required():
    claims = [
        Claim(ClaimKind.SKILL, "docker", "docker"),
        Claim(ClaimKind.ROLE, "devops", "devops"),
        Claim(ClaimKind.LOCATION, "isere_38", "Grenoble"),
        Claim(ClaimKind.CONTRACT, "cdi", "CDI"),
    ]
    result = match_score(claims, _make_profile())
    assert not result.required_satisfied
    assert "skill" in result.missing_required
    assert result.verdict == "no_match"


def test_match_partial():
    claims = [
        Claim(ClaimKind.SKILL, "docker", "docker"),
        Claim(ClaimKind.CONTRACT, "cdi", "CDI"),
    ]
    result = match_score(claims, _make_profile())
    assert result.required_satisfied is False  # missing python
    # match_rate is 1.0 (all present claims matched) but required_satisfied=False
    # so verdict is still no_match — the key invariant here
    assert result.verdict == "no_match"


def test_match_empty():
    result = match_score([], _make_profile())
    assert result.total_score == 0.0
    assert result.match_rate == 0.0
    assert not result.required_satisfied


def test_claim_match_to_dict():
    cm = ClaimMatch(
        claim=Claim(ClaimKind.SKILL, "python", "python"),
        matched=True,
        is_required=True,
        weight=3.0,
        points=3.0,
    )
    d = cm.to_dict()
    assert d["kind"] == "skill"
    assert d["matched"] is True
    assert d["points"] == 3.0


def test_match_result_to_dict():
    result = MatchResult(
        total_score=6.0,
        max_possible=10.0,
        match_rate=0.6,
        required_satisfied=True,
    )
    d = result.to_dict()
    assert d["verdict"] == "partial_match"
    assert d["required_satisfied"] is True
