from __future__ import annotations

from pathlib import Path

from job_radar.db import Database
from job_radar.models import Offer


def test_upsert_preserves_interest(tmp_path: Path):
    db = Database(tmp_path / "t.db")
    o = Offer(source="ft", external_id="1", title="A", tags=["x"])
    oid = db.upsert_offer(o)
    db.set_interest(oid, "interested", "nice")
    o2 = Offer(source="ft", external_id="1", title="A updated", tags=["y"])
    db.upsert_offer(o2)
    row = db.get(oid)
    assert row is not None
    assert row["title"] == "A updated"
    assert row["interest"] == "interested"
    assert row["notes"] == "nice"
    db.close()
