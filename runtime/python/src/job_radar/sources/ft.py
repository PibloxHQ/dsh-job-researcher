from __future__ import annotations

import time
from typing import Any, Iterable, Iterator

import httpx

from job_radar.config import FtAuthError, PREFERRED_COMMUNE_INSEE, QUERY_PROFILES, Settings
from job_radar.models import Offer
from job_radar.normalize import normalize_ft

# Re-export for callers that imported from sources.ft
__all__ = [
    "FtAuthError",
    "TOKEN_CACHE",
    "get_token",
    "search_offers",
    "iter_profile_offers",
    "iter_ft_offers",
]


TOKEN_CACHE: dict[str, Any] = {"access_token": None, "expires_at": 0.0}


def get_token(settings: Settings, client: httpx.Client | None = None) -> str:
    settings.require_ft_credentials()
    now = time.time()
    if TOKEN_CACHE["access_token"] and now < TOKEN_CACHE["expires_at"] - 60:
        return str(TOKEN_CACHE["access_token"])

    own = client is None
    client = client or httpx.Client(timeout=30.0)
    try:
        resp = client.post(
            settings.ft_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.ft_client_id,
                "client_secret": settings.ft_client_secret,
                "scope": settings.ft_scope,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if resp.status_code >= 400:
            # Never SystemExit — AUT-06 / REV-02: partial-failure policy must catch this.
            raise FtAuthError(
                f"FT OAuth failed ({resp.status_code}): {resp.text[:300]}. "
                "Check app subscription to Offres d'emploi v2 on francetravail.io."
            )
        data = resp.json()
        TOKEN_CACHE["access_token"] = data["access_token"]
        TOKEN_CACHE["expires_at"] = now + int(data.get("expires_in", 1200))
        return str(data["access_token"])
    finally:
        if own:
            client.close()


def search_offers(
    settings: Settings,
    *,
    mots_cles: str,
    commune: str | None = None,
    departement: str | None = None,
    range_start: int = 0,
    range_end: int = 49,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    token = get_token(settings, client)
    own = client is None
    client = client or httpx.Client(timeout=45.0)
    try:
        params: dict[str, Any] = {"motsCles": mots_cles}
        if commune:
            params["commune"] = commune
        if departement:
            params["departement"] = departement
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        # Range header pagination (FT Offres API style)
        headers["Range"] = f"offres={range_start}-{range_end}"
        url = f"{settings.ft_api_base.rstrip('/')}/offres/search"
        resp = client.get(url, params=params, headers=headers)
        # 204 = no offers for this query
        if resp.status_code == 204 or not resp.content:
            return {"resultats": []}
        if resp.status_code not in (200, 206):
            raise RuntimeError(f"FT search failed ({resp.status_code}): {resp.text[:400]}")
        return resp.json()
    finally:
        if own:
            client.close()


def iter_profile_offers(
    settings: Settings,
    profile: str,
    *,
    include_remote_national: bool = True,
    max_per_query: int = 50,
) -> Iterator[Offer]:
    if profile not in QUERY_PROFILES:
        raise ValueError(f"Unknown profile {profile}; choose from {list(QUERY_PROFILES)}")
    conf = QUERY_PROFILES[profile]
    mots = conf["motsCles"]
    tags = list(conf["tags"])

    with httpx.Client(timeout=45.0) as client:
        # Dept 38 sweep
        data = search_offers(
            settings,
            mots_cles=mots,
            departement=settings.departement,
            range_end=max_per_query - 1,
            client=client,
        )
        for raw in data.get("resultats") or []:
            offer = normalize_ft(raw, profile_tags=tags)
            if offer.external_id:
                yield offer
        time.sleep(0.3)

        # Preferred communes (narrower)
        for code in list(PREFERRED_COMMUNE_INSEE)[:4]:
            data = search_offers(
                settings,
                mots_cles=mots,
                commune=code,
                range_end=min(24, max_per_query) - 1,
                client=client,
            )
            for raw in data.get("resultats") or []:
                offer = normalize_ft(raw, profile_tags=tags + ["geo_preferred"])
                if offer.external_id:
                    yield offer
            time.sleep(0.25)

        # Full remote: keyword-only national (no dept) — owner accepted full remote
        if include_remote_national:
            remote_mots = f"({mots}) télétravail OR remote"
            data = search_offers(
                settings,
                mots_cles=remote_mots,
                range_end=max_per_query - 1,
                client=client,
            )
            for raw in data.get("resultats") or []:
                offer = normalize_ft(raw, profile_tags=tags + ["geo_remote"])
                if offer.external_id:
                    yield offer


def iter_ft_offers(
    settings: Settings,
    *,
    profiles: Iterable[str] | None = None,
    include_remote_national: bool = True,
    max_per_query: int = 50,
) -> Iterator[Offer]:
    """Canonical multi-profile FT iterator used by ``dsh_pipeline._sync_source``.

    Deduplicates by ``external_id`` across QUERY_PROFILES sweeps.
    """
    selected = list(profiles) if profiles is not None else list(QUERY_PROFILES.keys())
    seen: set[str] = set()
    for profile in selected:
        if profile not in QUERY_PROFILES:
            continue
        for offer in iter_profile_offers(
            settings,
            profile,
            include_remote_national=include_remote_national,
            max_per_query=max_per_query,
        ):
            eid = offer.external_id or ""
            if not eid or eid in seen:
                continue
            seen.add(eid)
            yield offer
