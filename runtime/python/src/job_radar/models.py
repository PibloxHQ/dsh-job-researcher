from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Offer:
    source: str
    external_id: str
    title: str
    employer: str = ""
    location: str = ""
    contract_type: str = ""
    work_time: str = "unknown"  # full | part | unknown
    remote: str = "unknown"  # yes | no | unknown
    url: str = ""
    description: str = ""
    rome_codes: str = "[]"
    raw_json: str = "{}"
    published_at: str = ""
    updated_at: str = ""
    expires_at: str = ""
    tags: list[str] = field(default_factory=list)
    interest: str = "unset"
    notes: str = ""

    def to_row(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "external_id": self.external_id,
            "title": self.title,
            "employer": self.employer,
            "location": self.location,
            "contract_type": self.contract_type,
            "work_time": self.work_time,
            "remote": self.remote,
            "url": self.url,
            "description": self.description,
            "rome_codes": self.rome_codes,
            "raw_json": self.raw_json,
            "published_at": self.published_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
            "tags": self.tags,
            "interest": self.interest,
            "notes": self.notes,
        }
