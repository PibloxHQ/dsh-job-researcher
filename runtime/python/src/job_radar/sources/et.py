"""Scrape emploi-territorial.fr filtered offer search results (table rows).

Primary path: text keyword search via POST /rechercher → redirects to
/emploi-mobilite/?adv-search=<q>&search-dept=038 which returns IT-relevant
offers for the department (the IT keyword in the title matches, e.g.
'informatique', 'réseaux', 'data'). This is far more precise than category
browsing because emploi-territorial exposes no GET-only sub-family filter.

Fallback/reverse-chron path: GET /rechercher?search-cat=B&search-dept=038
returns the 20 most recent offers for a category — kept as a broad sweep so
non-keyworded IT roles (e.g. 'administrateur sécurité') that the keyword misses
still surface, then filtered locally by IT title signals.

Emploi territorial is a complementary Plan B public-sector source (collectivités
territoriales). Department code is embedded in the offer id (e.g. O038... = 38).

Notes:
- Search filter is held server-side after POST (redirects to /emploi-mobilite/?).
  A bare session cookie from a seed GET makes the POST stick.
- Offer URL detail pages carry Missions / Profils recherchés / Télétravail but are
  NOT fetched here (list-level is enough for the daily radar; detail pages too heavy).
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

BASE = "https://www.emploi-territorial.fr"

DEFAULT_CAT = "B"
DEFAULT_DEPT = "038"  # Isère
# IT catch-all keywords (kept tight — 'technique' alone matches building trades).
IT_KEYWORDS = (
    "informatique",
    "numérique",
    "numerique",
    "systeme d'information",
    "systemes d'information",
    "développeur",
    "developpeur",
    "développeuse",
    "developpeuse",
    "admin systeme",
    "admin réseaux",
    "admin reseaux",
    "administrateur système",
    "administrateur systeme",
    "administrateur réseau",
    "administrateur reseau",
    "réseaux et télécommunications",
    "reseaux et telecommunications",
    "technicien informatique",
    "data",
    "devops",
    "cloud",
    "support informatique",
    "sécurité système",
    "securite système",
    "cyber",
    "exploitant informatique",
    "dsi",
    "systèmes et réseaux",
    "systemes et reseaux",
    "exploitation et maintenance informatique",
    "réseau",
    "reseau",
)
STUDENT_HINTS = ("alternance", "apprentissage", "stage")
NON_IT_HINTS = ("assainissement", "eau potable", "reseau d'eau", "espace public",
                "voirie", "bâtiment", "batiment", "chantier", "espaces verts",
                "plomberie", "électricité", "electricite", "mécanicien", "mecanicien",
                "instructeur urbanisme", "policier", "cantine", "garderie")


def search_url(*, cat: str = DEFAULT_CAT, dept: str = DEFAULT_DEPT) -> str:
    return f"{BASE}/rechercher?search-cat={cat}&search-dept={dept}&search-limit=50"


def _strip(h: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def _cat_rank(row_html: str) -> str:
    out = []
    for cat in "ABC":
        if re.search(rf"badge[^>]*title='Emploi de catégorie {cat}'", row_html):
            out.append(cat)
    return "|".join(out)


def _external_id(offer_id: str, url: str) -> str:
    oid = (offer_id or "").strip()
    if oid:
        return oid
    m = re.search(r"/offre/([a-z0-9]+)-", url or "")
    return m.group(1) if m else url


def parse_rows(html: str) -> list[dict]:
    offers: list[dict] = []
    for m in re.finditer(r'<tr id="(O[0-9]+)">(.*?)</tr>', html, re.S):
        offer_id = m.group(1)
        block = m.group(2)

        # Site HTML often places href BEFORE class="lien-details-offre".
        # Searching only inside the class→</a> fragment missed the href and
        # produced empty urls in legacy radar.db (et rows).
        anchor = re.search(
            r"<a[^>]*lien-details-offre[^>]*>(.*?)</a>",
            block,
            re.S | re.I,
        )
        if not anchor:
            anchor = re.search(
                r"<a[^>]*href=['\"](/offre/[^'\"]+)['\"][^>]*>(.*?)</a>",
                block,
                re.S | re.I,
            )
            if not anchor:
                continue
            url = urljoin(BASE, anchor.group(1))
            title = _strip(anchor.group(2))
        else:
            title = _strip(anchor.group(1))
            href = re.search(
                r"href=['\"](/offre/[^'\"]+)['\"]",
                block[max(0, anchor.start() - 200) : anchor.end()],
                re.I,
            )
            if not href:
                href = re.search(r"href=['\"](/offre/[^'\"]+)['\"]", block, re.I)
            url = urljoin(BASE, href.group(1)) if href else ""
        if not title:
            continue

        employer = ""
        emp = re.search(
            r"detail-offre-collectivite.*?valeur font-weight-bold.*?>(.*?)</span>",
            block,
            re.S,
        )
        if emp:
            employer = _strip(emp.group(1))
        if not employer:
            emp = re.search(r"detail-offre-collectivite.*?<a[^>]*>(.*?)</a>", block, re.S)
            if emp:
                employer = _strip(emp.group(1))

        dept = ""
        dep = re.search(
            r"detail-offre-collectivite.*?text-secondary[^>]*>(.*?)</span>",
            block,
            re.S,
        )
        if dep:
            dept = _strip(dep.group(1))

        filiere = ""
        fil = re.search(r"badge badge-secondary[^>]*>(.*?)</span>", block, re.S)
        if fil:
            filiere = _strip(fil.group(1))

        permanent = ""
        pm = re.search(r"badge badge-light[^>]*>(.*?)</span>", block, re.S)
        if pm:
            permanent = _strip(pm.group(1))

        published = ""
        pub = re.search(r"data-tooltip=\"publié le ([0-9/]+)\"", block)
        if pub:
            published = pub.group(1)

        offers.append(
            {
                "offer_id": offer_id,
                "title": title,
                "url": url,
                "employer": employer,
                "department": dept,
                "filiere": filiere,
                "categories": _cat_rank(block),
                "permanent": permanent,
                "published": published,
            }
        )
    return offers


def _new_client() -> httpx.Client:
    return httpx.Client(
        timeout=60.0,
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        },
    )


def fetch_search_html(
    settings: Settings,
    *,
    cat: str = DEFAULT_CAT,
    dept: str = DEFAULT_DEPT,
    client: httpx.Client | None = None,
) -> str:
    url = search_url(cat=cat, dept=dept)
    own = client is None
    client = client or _new_client()
    try:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text
    finally:
        if own:
            client.close()


def fetch_keyword_html(
    settings: Settings,
    *,
    keyword: str = "informatique",
    dept: str = DEFAULT_DEPT,
    client: httpx.Client | None = None,
) -> str:
    """POST the advanced-search form → follows redirect → returns /emploi-mobilite/ page."""
    own = client is None
    client = client or _new_client()
    try:
        client.get(f"{BASE}/rechercher")  # seed server session
        data = {
            "search_offre_form[advsearch]": keyword,
            "search_offre_form[ville]": "",
            "search_offre_form[distance]": "",
            "search_offre_form[searchregion][]": "",
            "search_offre_form[searchdept][]": dept,
            "rechercher": "Consulter",
        }
        resp = client.post(f"{BASE}/rechercher", data=data)
        resp.raise_for_status()
        return resp.text
    finally:
        if own:
            client.close()


def _fold_plain(s: str) -> str:
    return s.casefold().replace("é", "e").replace("è", "e").replace("ê", "e").replace(
        "à", "a"
    ).replace("ô", "o").replace("ù", "u")


# Clearly-IT terms that override any NON_IT hint (e.g. "systèmes d'information").
STRONG_IT_HINTS = (
    "informatique",
    "systeme d'information",
    "systemes d'information",
    "systèmes et réseaux",
    "systemes et reseaux",
    "devops",
    "développeur",
    "developpeur",
    "developpeuse",
    "dsi",
    "data",
    "cloud",
    "sécurité système",
    "securite système",
    "support informatique",
    "cyber",
)


def _is_it(title: str, filiere: str) -> bool:
    blob = _fold_plain(f"{title} {filiere}")
    folded_non = [_fold_plain(h) for h in NON_IT_HINTS]
    folded_strong = [_fold_plain(h) for h in STRONG_IT_HINTS]
    has_non_it = any(h in blob for h in folded_non)
    has_strong_it = any(h in blob for h in folded_strong)
    if has_non_it and not has_strong_it:
        return False
    return any(_fold_plain(h) in blob for h in IT_KEYWORDS)


def row_to_offer(row: dict, *, cat: str) -> Offer:
    title = row["title"]
    url = row["url"]
    external = _external_id(row["offer_id"], url)
    employer = row["employer"] or ""
    dept = row["department"] or ""
    location = " | ".join(p for p in (dept, "38") if p)
    filiere = row["filiere"] or ""
    categories = row["categories"] or cat

    description = " | ".join(
        p
        for p in (filiere, f"catégorie {categories}", row["permanent"] or "")
        if p
    )

    tags = ["public", "emploi_territorial", "plan_b"]
    if _is_it(title, filiere):
        tags.append("info_filiere")
    tags.extend(geo_tags(location, employer))
    tags.extend(public_tags(title, f"{employer} {filiere}", description))
    if any(h in title.casefold() for h in STUDENT_HINTS):
        tags.append("student")

    return Offer(
        source="et",
        external_id=external,
        title=title,
        employer=employer,
        location=location,
        contract_type="territorial",
        work_time="unknown",
        remote="unknown",
        url=url,
        description=description,
        rome_codes="[]",
        raw_json=json.dumps(
            {"source": "emploi_territorial", "category": cat, "row": row},
            ensure_ascii=False,
        ),
        tags=tags,
    )


def iter_et_offers(
    settings: Settings,
    *,
    keyword: str = "informatique",
    dept: str = DEFAULT_DEPT,
) -> Iterator[Offer]:
    """Keyword IT sweep + broad category sweeps, deduped, IT-relevant only."""
    seen: set[str] = set()
    client = _new_client()
    try:
        pages: list[str] = []
        # Primary: keyword search catches exactly the IT titles.
        pages.append(fetch_keyword_html(settings, keyword=keyword, dept=dept, client=client))
        # Broad: latest cat B/A/C offers (catches non-keyworded IT roles).
        for cat in ("B", "A", "C"):
            pages.append(fetch_search_html(settings, cat=cat, dept=dept, client=client))
        for html in pages:
            for row in parse_rows(html):
                title = row.get("title") or ""
                filiere = row.get("filiere") or ""
                if not title or not _is_it(title, filiere):
                    continue
                oid = row.get("offer_id") or ""
                if oid in seen:
                    continue
                seen.add(oid)
                yield row_to_offer(row, cat=row.get("categories") or "B")
    finally:
        client.close()