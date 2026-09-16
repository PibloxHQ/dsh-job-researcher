from __future__ import annotations

from typing import Any, Iterable


def export_markdown(rows: Iterable[dict[str, Any]]) -> str:
    lines = [
        "# Job Market Radar export",
        "",
        "| id | interest | source | title | employer | location | url |",
        "|----|----------|--------|-------|----------|----------|-----|",
    ]
    for r in rows:
        title = (r.get("title") or "").replace("|", "/")
        employer = (r.get("employer") or "").replace("|", "/")
        location = (r.get("location") or "").replace("|", "/")
        url = r.get("url") or ""
        lines.append(
            f"| {r.get('id')} | {r.get('interest')} | {r.get('source')} | "
            f"{title} | {employer} | {location} | {url} |"
        )
    lines.append("")
    return "\n".join(lines)
