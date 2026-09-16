from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from job_radar.config import dumps_tags, loads_tags
from job_radar.models import Offer
from job_radar.schema_v2 import SCHEMA_V2

SCHEMA = SCHEMA_V2


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def upsert_offer(self, offer: Offer) -> int:
        now = utc_now()
        tags = dumps_tags(offer.tags)
        self._conn.execute(
            """
            INSERT INTO offers (
              source, external_id, title, employer, location, contract_type,
              work_time, remote, url, description, rome_codes, raw_json,
              first_seen_at, last_seen_at, interest, notes, tags
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(source, external_id) DO UPDATE SET
              title=excluded.title,
              employer=excluded.employer,
              location=excluded.location,
              contract_type=excluded.contract_type,
              work_time=excluded.work_time,
              remote=excluded.remote,
              url=excluded.url,
              description=excluded.description,
              rome_codes=excluded.rome_codes,
              raw_json=excluded.raw_json,
              last_seen_at=excluded.last_seen_at
            """,
            (
                offer.source,
                offer.external_id,
                offer.title,
                offer.employer,
                offer.location,
                offer.contract_type,
                offer.work_time,
                offer.remote,
                offer.url,
                offer.description[:8000],
                offer.rome_codes,
                offer.raw_json[:20000],
                now,
                now,
                offer.interest,
                offer.notes,
                tags,
            ),
        )
        cur = self._conn.execute(
            "SELECT id, tags FROM offers WHERE source=? AND external_id=?",
            (offer.source, offer.external_id),
        )
        row = cur.fetchone()
        assert row is not None
        offer_id = int(row["id"])
        merged = dumps_tags(loads_tags(row["tags"]) + offer.tags)
        self._conn.execute(
            "UPDATE offers SET tags=? WHERE id=?",
            (merged, offer_id),
        )
        self._conn.commit()
        return offer_id

    def upsert_many(self, offers: Iterable[Offer]) -> int:
        n = 0
        for offer in offers:
            self.upsert_offer(offer)
            n += 1
        return n

    def set_interest(self, offer_id: int, interest: str, note: str | None = None) -> None:
        allowed = {"unset", "interested", "maybe", "skip"}
        if interest not in allowed:
            raise ValueError(f"interest must be one of {sorted(allowed)}")
        if note is None:
            self._conn.execute(
                "UPDATE offers SET interest=? WHERE id=?",
                (interest, offer_id),
            )
        else:
            self._conn.execute(
                "UPDATE offers SET interest=?, notes=? WHERE id=?",
                (interest, note, offer_id),
            )
        self._conn.commit()

    def get(self, offer_id: int) -> dict[str, Any] | None:
        cur = self._conn.execute("SELECT * FROM offers WHERE id=?", (offer_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    def list_offers(
        self,
        *,
        interest: str | None = None,
        source: str | None = None,
        q: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if interest:
            clauses.append("interest = ?")
            params.append(interest)
        if source:
            clauses.append("source = ?")
            params.append(source)
        if q:
            clauses.append(
                "(title LIKE ? OR employer LIKE ? OR location LIKE ? OR description LIKE ?)"
            )
            like = f"%{q}%"
            params.extend([like, like, like, like])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
          SELECT * FROM offers
          {where}
          ORDER BY last_seen_at DESC, id DESC
          LIMIT ?
        """
        params.append(limit)
        cur = self._conn.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]

    def stats(self) -> dict[str, Any]:
        by_interest = {
            r["interest"]: r["n"]
            for r in self._conn.execute(
                "SELECT interest, COUNT(*) AS n FROM offers GROUP BY interest"
            )
        }
        by_source = {
            r["source"]: r["n"]
            for r in self._conn.execute(
                "SELECT source, COUNT(*) AS n FROM offers GROUP BY source"
            )
        }
        top_titles = [
            dict(r)
            for r in self._conn.execute(
                """
                SELECT title, COUNT(*) AS n FROM offers
                GROUP BY title ORDER BY n DESC LIMIT 15
                """
            )
        ]
        return {
            "total": sum(by_source.values()),
            "by_interest": by_interest,
            "by_source": by_source,
            "top_titles": top_titles,
        }


def row_tags(row: dict[str, Any]) -> list[str]:
    return loads_tags(row.get("tags"))
