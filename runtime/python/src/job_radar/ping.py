"""Conditional ping system for the Claims-to-Ping pipeline.

A *ping* is a notification triggered when an offer matches the profile above
a configurable threshold. Pings are grouped by employer to avoid spam
(recall from Hindsight: "regrouper les pings par entreprise pour éviter le spam").

Design:
- Deterministic — no LLM; threshold-based.
- Employer grouping — one ping per employer per batch (best offer shown).
- Configurable thresholds — strong_match triggers a ping, partial_match is
  informational, weak_match / no_match is silent.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from job_radar.claims import Claim, extract_claims
from job_radar.profile import MatchResult, Profile, match_score


@dataclass
class Ping:
    """A notification to be sent about a matching offer."""

    offer_id: int | None  # DB id if available
    title: str
    employer: str
    url: str
    verdict: str  # strong_match | partial_match
    score: float  # match_rate (0.0–1.0)
    total_points: float
    matched_skills: list[str] = field(default_factory=list)
    matched_roles: list[str] = field(default_factory=list)
    missing_required: list[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "offer_id": self.offer_id,
            "title": self.title,
            "employer": self.employer,
            "url": self.url,
            "verdict": self.verdict,
            "score": round(self.score, 2),
            "total_points": round(self.total_points, 2),
            "matched_skills": self.matched_skills,
            "matched_roles": self.matched_roles,
            "missing_required": self.missing_required,
            "timestamp": self.timestamp,
        }

    def format_summary(self) -> str:
        """Human-readable one-liner for Discord / terminal output."""
        emoji = "\U0001f525" if self.verdict == "strong_match" else "\U0001f50d"
        parts = [f"{emoji} {self.title[:60]}"]
        if self.employer:
            parts.append(f"  {self.employer[:40]}")
        parts.append(f"  score={self.score:.0%} ({self.verdict})")
        if self.matched_skills:
            parts.append(f"  skills: {', '.join(self.matched_skills[:5])}")
        if self.matched_roles:
            parts.append(f"  roles: {', '.join(self.matched_roles[:3])}")
        if self.url:
            parts.append(f"  {self.url}")
        return "\n".join(parts)


@dataclass
class PingBatch:
    """A batch of pings from one pipeline run, grouped by employer."""

    pings: list[Ping] = field(default_factory=list)
    run_time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def strong_matches(self) -> list[Ping]:
        return [p for p in self.pings if p.verdict == "strong_match"]

    @property
    def partial_matches(self) -> list[Ping]:
        return [p for p in self.pings if p.verdict == "partial_match"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_time": self.run_time,
            "total_pings": len(self.pings),
            "strong": len(self.strong_matches),
            "partial": len(self.partial_matches),
            "pings": [p.to_dict() for p in self.pings],
        }

    def format_output(self) -> str:
        """Multi-line formatted output for the debrief / Discord."""
        if not self.pings:
            return "[SILENT] Aucune offre correspondante."
        lines = [
            f"\U0001f514 Claims-to-Ping \u2014 {len(self.pings)} offre(s) correspondante(s)",
            "",
        ]
        if self.strong_matches:
            lines.append("\U0001f525 MATCH FORT")
            for p in self.strong_matches:
                lines.append(p.format_summary())
                lines.append("")
        if self.partial_matches:
            lines.append("\U0001f50d MATCH PARTIEL")
            for p in self.partial_matches:
                lines.append(p.format_summary())
                lines.append("")
        return "\n".join(lines).rstrip()


# ── Threshold defaults ────────────────────────────────────────────────

DEFAULT_STRONG_THRESHOLD = 0.7
DEFAULT_PARTIAL_THRESHOLD = 0.4


def evaluate_pings(
    offers: list[dict[str, Any]],
    profile: Profile,
    *,
    strong_threshold: float = DEFAULT_STRONG_THRESHOLD,
    partial_threshold: float = DEFAULT_PARTIAL_THRESHOLD,
    offer_ids: dict[str, int] | None = None,
) -> PingBatch:
    """Run the full Claims-to-Ping pipeline on a list of offers.

    Args:
        offers: list of offer dicts (same shape as triage input: title, employer,
                location, description, contract_type, work_time, remote, url).
        profile: the active user profile.
        strong_threshold: minimum match_rate for a strong_match ping.
        partial_threshold: minimum match_rate for a partial_match ping.
        offer_ids: optional mapping external_id → DB id for ping offer_id.

    Returns:
        PingBatch with all triggered pings, deduplicated by employer.
    """
    batch = PingBatch()
    offer_ids = offer_ids or {}

    # Collect all offers that meet at least the partial threshold
    candidates: list[tuple[dict[str, Any], MatchResult]] = []

    for offer in offers:
        claims = extract_claims(offer)
        result = match_score(claims, profile)

        if result.match_rate >= partial_threshold:
            candidates.append((offer, result))

    # Group by employer (folded) — take best score per employer
    employer_best: dict[str, tuple[dict[str, Any], MatchResult]] = {}
    for offer, result in candidates:
        employer = (offer.get("employer") or "_unknown").strip()
        emp_key = employer.casefold()
        if emp_key not in employer_best or result.match_rate > employer_best[emp_key][1].match_rate:
            employer_best[emp_key] = (offer, result)

    # Build pings from deduplicated offers
    for emp_key, (offer, result) in employer_best.items():
        verdict = "strong_match" if result.match_rate >= strong_threshold else "partial_match"

        # Extract matched skills and roles for the summary
        matched_skills = [
            cm.claim.value for cm in result.claim_matches
            if cm.claim.kind.value == "skill" and cm.matched
        ]
        matched_roles = [
            cm.claim.value for cm in result.claim_matches
            if cm.claim.kind.value == "role" and cm.matched
        ]

        ext_id = offer.get("external_id", "")
        offer_id = offer_ids.get(ext_id)

        ping = Ping(
            offer_id=offer_id,
            title=offer.get("title") or "(sans titre)",
            employer=offer.get("employer") or "",
            url=offer.get("url") or "",
            verdict=verdict,
            score=result.match_rate,
            total_points=result.total_score,
            matched_skills=matched_skills,
            matched_roles=matched_roles,
            missing_required=result.missing_required,
        )
        batch.pings.append(ping)

    # Sort: strong matches first, then by score descending
    batch.pings.sort(key=lambda p: (0 if p.verdict == "strong_match" else 1, -p.score))

    return batch
