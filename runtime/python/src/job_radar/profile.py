"""User profile for Claims-to-Ping matching.

A *profile* describes what the user wants (skills, location, contract type, etc.)
with optional weights.  The `match_score` function compares a list of extracted
claims (from claims.py) against a profile and returns a MatchResult with a
composite score and per-claim-kind breakdown.

Profile YAML schema:
```yaml
name: "Florian — Dev/Infra"
weights:
  skill: 3       # weight multiplier per matching skill claim
  role: 2        # weight multiplier per matching role claim
  location: 4    # location is critical
  contract: 2    # contract type matters
  sector: 1      # public vs private (neutral weight)
  work_time: 1
  employer_size: 0.5
  benefit: 0.5
required:
  skill: ["python", "linux"]  # at least one must match
  contract: ["cdi"]           # must be CDI
  location: ["isere_38", "remote", "commune:montbonnot", ...]
accepted:
  role: ["devops", "developpeur", "administrateur systeme", ...]
  sector: ["public", "private"]
  work_time: ["full"]
  employer_size: ["pme", "eti", "startup", "grand_compte"]
  benefit: ["teletravail", "formation"]
```
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from job_radar.claims import Claim, ClaimKind

try:
    import yaml

    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False


@dataclass
class Profile:
    """Parsed user profile for matching."""

    name: str = "default"
    weights: dict[str, float] = field(default_factory=lambda: {
        "skill": 3.0,
        "role": 2.0,
        "location": 4.0,
        "contract": 2.0,
        "sector": 1.0,
        "work_time": 1.0,
        "employer_size": 0.5,
        "benefit": 0.5,
    })
    required: dict[str, list[str]] = field(default_factory=dict)
    accepted: dict[str, list[str]] = field(default_factory=dict)

    def weight(self, kind: ClaimKind) -> float:
        return self.weights.get(kind.value, 1.0)

    def is_required(self, kind: ClaimKind, value: str) -> bool:
        """Check if this claim value is in the required set for its kind."""
        reqs = self.required.get(kind.value, [])
        return value in reqs if reqs else False

    def is_accepted(self, kind: ClaimKind, value: str) -> bool:
        """Check if this claim value is in the accepted set for its kind.
        If accepted list is empty for a kind, any value is accepted (wildcard)."""
        accs = self.accepted.get(kind.value, [])
        return value in accs if accs else True  # empty = wildcard

    @classmethod
    def from_yaml(cls, path: Path) -> "Profile":
        """Load a profile from a YAML file."""
        if not _HAS_YAML:
            raise ImportError("PyYAML required for profile loading. pip install pyyaml")
        import yaml as _yaml

        with open(path, "r", encoding="utf-8") as f:
            data = _yaml.safe_load(f) or {}
        return cls._from_dict(data)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Profile":
        """Load a profile from a dict (e.g. parsed YAML or programmatic)."""
        return cls._from_dict(data)

    @classmethod
    def _from_dict(cls, data: dict[str, Any]) -> "Profile":
        weights = data.get("weights") or {}
        required = data.get("required") or {}
        accepted = data.get("accepted") or {}
        return cls(
            name=data.get("name", "default"),
            weights={**cls().weights, **weights},  # merge with defaults
            required=required,
            accepted=accepted,
        )


@dataclass
class ClaimMatch:
    """Result of matching one claim against the profile."""

    claim: Claim
    matched: bool  # True if the claim value is in profile's accepted set
    is_required: bool
    weight: float
    points: float  # weight * confidence if matched, 0 otherwise

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.claim.kind.value,
            "value": self.claim.value,
            "matched": self.matched,
            "is_required": self.is_required,
            "weight": self.weight,
            "points": self.points,
        }


@dataclass
class MatchResult:
    """Aggregate result of matching an offer's claims against a profile."""

    total_score: float = 0.0
    max_possible: float = 0.0
    match_rate: float = 0.0  # total_score / max_possible (0.0–1.0)
    required_satisfied: bool = True  # False if any required claim didn't match
    missing_required: list[str] = field(default_factory=list)
    claim_matches: list[ClaimMatch] = field(default_factory=list)

    @property
    def verdict(self) -> str:
        """High-level verdict based on score and required constraints."""
        if not self.required_satisfied:
            return "no_match"  # hard fail — missing required claims
        if self.match_rate >= 0.7:
            return "strong_match"
        if self.match_rate >= 0.4:
            return "partial_match"
        return "weak_match"

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_score": round(self.total_score, 2),
            "max_possible": round(self.max_possible, 2),
            "match_rate": round(self.match_rate, 2),
            "verdict": self.verdict,
            "required_satisfied": self.required_satisfied,
            "missing_required": self.missing_required,
            "matched_count": sum(1 for cm in self.claim_matches if cm.matched),
            "total_claims": len(self.claim_matches),
        }


def match_score(claims: list[Claim], profile: Profile) -> MatchResult:
    """Score a list of extracted claims against a user profile.

    Algorithm:
    1. For each claim, check if its value is in the profile's accepted list.
    2. If accepted, multiply the profile weight for that kind by claim confidence.
    3. Sum all matching points → total_score.
    4. Sum all possible points (weight * confidence) → max_possible.
    5. Check required constraints — if any required kind has no matching claims,
       required_satisfied = False.
    6. match_rate = total_score / max_possible (capped at 1.0).
    """
    total_score = 0.0
    max_possible = 0.0
    claim_matches: list[ClaimMatch] = []
    matched_by_kind: dict[str, set[str]] = {}

    for claim in claims:
        weight = profile.weight(claim.kind)
        max_possible += weight * claim.confidence
        is_req = profile.is_required(claim.kind, claim.value)
        is_acc = profile.accepted.get(claim.kind.value)  # None = wildcard
        matched = claim.value in (is_acc or []) if is_acc is not None else True
        points = weight * claim.confidence if matched else 0.0
        total_score += points
        if matched:
            matched_by_kind.setdefault(claim.kind.value, set()).add(claim.value)
        claim_matches.append(ClaimMatch(
            claim=claim,
            matched=matched,
            is_required=is_req,
            weight=weight,
            points=points,
        ))

    # Check required constraints
    missing: list[str] = []
    for kind_str, values in profile.required.items():
        if not values:
            continue
        matched_vals = matched_by_kind.get(kind_str, set())
        if not any(v in matched_vals for v in values):
            missing.append(kind_str)

    match_rate = total_score / max_possible if max_possible > 0 else 0.0
    match_rate = min(match_rate, 1.0)

    return MatchResult(
        total_score=total_score,
        max_possible=max_possible,
        match_rate=match_rate,
        required_satisfied=len(missing) == 0,
        missing_required=missing,
        claim_matches=claim_matches,
    )
