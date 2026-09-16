"""Scrape Choisir le Service Public filtered offer pages (HTML cards).

Uses the public filtre URL shape:
  /nos-offres/filtres/localisation/{id}/domaine/{id}/categorie/{id}/

Default = Isère (334) + Numérique (3522) + Catégorie B (1806).
"""

from __future__ import annotations

import json
import re
from html import unescape
from typing import Iterator
from urllib.parse import urljoin

import httpx

from job_radar.config import Settings
from job_radar.models import Offer
from job_radar.normalize import geo_tags, public_tags

BASE = "https://choisirleservicepublic.gouv.fr"

# Owner Plan B preset (2026-08-03)
DEFAULT_FILTRE_PATH = "localisation/334/domaine/3522/categorie/1806"
DEFAULT_FILTRE_LABELS = {
    "localisation": "Isère (334)",
    "domaine": "Numérique (3522)",
    "categorie": "Catégorie B (1806)",
}


def filtre_url(path: str = DEFAULT_FILTRE_PATH) -> str:
    path = path.strip("/")
    return f"{BASE}/nos-offres/filtres/{path}/"


def _strip_html(chunk: str) -> str:
    text = re.sub(r"<[^>]+>", " ", chunk)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _parse_detail(details: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for d in details:
        if d.startswith("Localisation"):
            out["location"] = d.split(":", 1)[-1].strip() if ":" in d else d
        elif d.startswith("Employeur"):
            out["employer"] = d.split(":", 1)[-1].strip() if ":" in d else d
        elif d.startswith("Fonction publique"):
            out["fp"] = d.split(":", 1)[-1].strip() if ":" in d else d
        elif d.startswith("En ligne depuis"):
            out["published"] = d.replace("En ligne depuis le", "").strip()
        elif d in ("Numérique",) or d.startswith("Numérique"):
            out["domain"] = d
        else:
            # first unknown short token often is domain label
            if "domain" not in out and len(d) < 40 and not d.startswith("http"):
                out.setdefault("domain", d)
    return out


def _external_id_from_url(url: str, title: str) -> str:
    m = re.search(r"reference-([^/]+)/?", url)
    if m:
        return m.group(1).strip()
    slug = re.sub(r"\W+", "-", title).strip("-")[:80]
    return slug or url


def parse_offer_cards(html: str) -> list[dict]:
    """Parse fr-card--offer blocks from archive HTML."""
    parts = html.split("fr-card--offer")
    offers: list[dict] = []
    for part in parts[1:]:
        block = part[:12000]
        m = re.search(r"<h[23][^>]*>(.*?)</h[23]>", block, re.S)
        if not m:
            continue
        title = _strip_html(m.group(1))
        if not title:
            continue
        href = ""
        for am in re.finditer(r'href="([^"]+)"', block):
            u = am.group(1)
            if "filtre" in u or "aide" in u or "mention" in u or "accessib" in u:
                continue
            if "/offre-emploi/" in u or u.startswith("/offre"):
                href = urljoin(BASE, u)
                break
        details = [
            _strip_html(d)
            for d in re.findall(r"<li[^>]*>(.*?)</li>", block, re.S)
            if _strip_html(d)
        ]
        meta = _parse_detail(details)
        offers.append(
            {
                "title": title,
                "url": href,
                "details": details,
                **meta,
            }
        )
    return offers


def fetch_filtre_html(
    settings: Settings,
    *,
    path: str = DEFAULT_FILTRE_PATH,
    client: httpx.Client | None = None,
) -> str:
    url = filtre_url(path)
    own = client is None
    client = client or httpx.Client(
        timeout=60.0,
        follow_redirects=True,
        headers={"User-Agent": "MestryxJobRadar/0.1 (+local; Plan B CRE)"},
    )
    try:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text
    finally:
        if own:
            client.close()


def card_to_offer(card: dict, *, filtre_path: str) -> Offer:
    title = card["title"]
    url = card.get("url") or ""
    external = _external_id_from_url(url, title)
    employer = card.get("employer") or ""
    location = card.get("location") or "Isère (38)"
    domain = card.get("domain") or "Numérique"
    fp = card.get("fp") or ""
    published = card.get("published") or ""
    description = " | ".join(p for p in (domain, fp, published) if p)

    tags = [
        "public",
        "csp_filtre",
        "plan_b",
        "isere",
        "numerique",
        "cat_b",
    ]
    tags.extend(geo_tags(location, employer))
    tags.extend(public_tags(title, f"{employer} {fp}", description))

    return Offer(
        source="csp",
        external_id=external,
        title=title,
        employer=employer,
        location=location,
        contract_type=fp,
        work_time="unknown",
        remote="unknown",
        url=url,
        description=description,
        rome_codes="[]",
        raw_json=json.dumps(
            {
                "filtre_path": filtre_path,
                "filtre_labels": DEFAULT_FILTRE_LABELS,
                "card": card,
            },
            ensure_ascii=False,
        ),
        tags=tags,
    )


def iter_csp_filtre_offers(
    settings: Settings,
    *,
    path: str = DEFAULT_FILTRE_PATH,
) -> Iterator[Offer]:
    html = fetch_filtre_html(settings, path=path)
    for card in parse_offer_cards(html):
        yield card_to_offer(card, filtre_path=path)
