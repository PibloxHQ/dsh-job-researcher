from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator

import httpx

from job_radar.config import Settings
from job_radar.models import Offer
from job_radar.normalize import is_it_offer, location_in_scope, normalize_csp


def latest_csp_csv_url(settings: Settings, client: httpx.Client | None = None) -> str:
    own = client is None
    client = client or httpx.Client(timeout=60.0)
    try:
        resp = client.get(settings.csp_dataset_api)
        resp.raise_for_status()
        data = resp.json()
        csvs = [
            r
            for r in data.get("resources") or []
            if str(r.get("format", "")).lower() == "csv"
            and "offre" in str(r.get("title", "")).casefold()
        ]
        if not csvs:
            raise RuntimeError("No CSP CSV resource found on data.gouv dataset")
        csvs.sort(
            key=lambda r: r.get("last_modified") or r.get("created_at") or "",
            reverse=True,
        )
        return str(csvs[0]["url"])
    finally:
        if own:
            client.close()


def download_csp_csv(settings: Settings, *, force: bool = False) -> Path:
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.cache_dir / "csp-offres-latest.csv"
    if dest.exists() and not force and dest.stat().st_size > 0:
        return dest
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        url = latest_csp_csv_url(settings, client)
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with dest.open("wb") as out:
                for chunk in resp.iter_bytes():
                    out.write(chunk)
    return dest


def iter_csp_offers(
    settings: Settings,
    *,
    force_download: bool = False,
    it_only: bool = True,
    geo_filter: bool = True,
) -> Iterator[Offer]:
    path = download_csp_csv(settings, force=force_download)
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(fh, delimiter=delimiter)
        for row in reader:
            if not row:
                continue
            clean = {
                str(k).strip(): (v.strip() if isinstance(v, str) else (v or ""))
                for k, v in row.items()
                if k
            }
            title = clean.get("Intitulé du poste") or ""
            metier = clean.get("Métier") or ""
            skills = clean.get("Compétences attendues") or ""
            tele = clean.get("Télétravail") or ""
            loc = " ".join(
                [
                    clean.get("Localisation du poste") or "",
                    clean.get("Lieu d'affectation") or "",
                    tele,
                ]
            )
            employer = " ".join(
                [
                    clean.get("Employeur") or "",
                    clean.get("Organisme de rattachement") or "",
                ]
            )

            if it_only and not is_it_offer(title, metier, skills):
                continue

            offer = normalize_csp(clean)
            if not offer:
                continue

            if geo_filter and not location_in_scope(
                loc, allow_grenoble=True, allow_remote=True
            ):
                blob = f"{employer} {title}".casefold()
                if not any(
                    h in blob
                    for h in ("intérieur", "interieur", "préfecture", "prefecture")
                ):
                    if offer.remote != "yes" and "geo_remote" not in offer.tags:
                        continue
            yield offer
