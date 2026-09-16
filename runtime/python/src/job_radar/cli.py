from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer

from job_radar import __version__
from job_radar.config import QUERY_PROFILES, ROOT, load_settings
from job_radar.db import Database
from job_radar.export import export_markdown
from job_radar.sources import csp as csp_src
from job_radar.sources import csp_filtre as csp_filtre_src
from job_radar.sources import et as et_src
from job_radar.sources import ft as ft_src
from job_radar.sources.csp_filtre import DEFAULT_FILTRE_PATH

app = typer.Typer(add_completion=False, no_args_is_help=True, help="Job Market Radar CLI")


@app.callback()
def main() -> None:
    """Local radar: sync FT + CSP, tag interest, analyse market (no auto-apply)."""


@app.command("version")
def version_cmd() -> None:
    typer.echo(__version__)


@app.command("sync")
def sync_cmd(
    source: str = typer.Option(
        "all", help="ft | csp | csp-filtre | et | all"
    ),
    profile: Optional[str] = typer.Option(
        None, help=f"FT profile only: {', '.join(QUERY_PROFILES)}"
    ),
    force_csp: bool = typer.Option(False, help="Re-download CSP CSV"),
    csp_filtre: str = typer.Option(
        DEFAULT_FILTRE_PATH,
        help="CSP web filtre path (loc/domaine/categorie ids)",
    ),
    dry_run: bool = typer.Option(False, help="Fetch/normalize without DB write"),
) -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    total = 0
    try:
        if source in ("ft", "all"):
            profiles = [profile] if profile else list(QUERY_PROFILES)
            for name in profiles:
                typer.echo(f"FT sync profile={name} …")
                batch = list(ft_src.iter_profile_offers(settings, name))
                if dry_run:
                    typer.echo(f"  dry-run: {len(batch)} offers")
                else:
                    n = db.upsert_many(batch)
                    typer.echo(f"  upserted: {n}")
                    total += n
        if source in ("csp", "all"):
            typer.echo("CSP sync …")
            batch = list(
                csp_src.iter_csp_offers(settings, force_download=force_csp)
            )
            if dry_run:
                typer.echo(f"  dry-run: {len(batch)} offers")
            else:
                n = db.upsert_many(batch)
                typer.echo(f"  upserted: {n}")
                total += n
        if source in ("csp-filtre", "all"):
            typer.echo(f"CSP filtre sync path={csp_filtre} …")
            batch = list(
                csp_filtre_src.iter_csp_filtre_offers(settings, path=csp_filtre)
            )
            if dry_run:
                typer.echo(f"  dry-run: {len(batch)} offers")
                for o in batch:
                    typer.echo(f"  - {o.title[:70]} | {o.employer[:40]}")
            else:
                n = db.upsert_many(batch)
                typer.echo(f"  upserted: {n}")
                total += n
                for o in batch:
                    typer.echo(f"  - {o.title[:70]} | {o.url}")
        if source in ("et", "all"):
            typer.echo("Emploi territorial sync (cat B / Isère) …")
            batch = list(et_src.iter_et_offers(settings))
            if dry_run:
                typer.echo(f"  dry-run: {len(batch)} offers")
                for o in batch:
                    typer.echo(f"  - {o.title[:70]} | {o.employer[:40]}")
            else:
                n = db.upsert_many(batch)
                typer.echo(f"  upserted: {n}")
                total += n
                for o in batch:
                    typer.echo(f"  - {o.title[:70]} | {o.url}")
        typer.echo(f"Done. total_upserts={total} db={settings.db_path}")
    finally:
        db.close()


@app.command("list")
def list_cmd(
    interest: Optional[str] = typer.Option(None),
    source: Optional[str] = typer.Option(None),
    q: Optional[str] = typer.Option(None, help="Search title/employer/location"),
    tag: Optional[str] = typer.Option(
        None, help="Filter JSON tags contains (e.g. plan_b, csp_filtre)"
    ),
    geo: Optional[str] = typer.Option(
        None,
        help="local = Isère/Grenoble/Meylan/Crolles/Montbonnot/remote hints",
    ),
    limit: int = typer.Option(30),
) -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    try:
        rows = db.list_offers(
            interest=interest,
            source=source,
            q=q,
            limit=max(limit, 500) if (geo or tag) else limit,
        )
        if tag:
            needle = tag.casefold()

            def has_tag(r: dict) -> bool:
                raw = r.get("tags") or ""
                return needle in raw.casefold()

            rows = [r for r in rows if has_tag(r)][:limit]
        if geo == "local":
            needles = (
                "(38)",
                "isère",
                "isere",
                "grenoble",
                "meylan",
                "montbonnot",
                "crolles",
                "saint-ismier",
                "versoud",
            )

            def ok(r: dict) -> bool:
                blob = f"{r.get('location') or ''}".casefold()
                return any(n in blob for n in needles)

            rows = [r for r in rows if ok(r)][:limit]
        elif geo == "remote":
            rows = [
                r
                for r in rows
                if r.get("remote") == "yes"
                or "geo_remote" in (r.get("tags") or "")
            ][:limit]
        else:
            if not tag:
                rows = rows[:limit]
        if not rows:
            typer.echo("(no offers)")
            return
        for r in rows:
            typer.echo(
                f"[{r['id']}] {r['interest']:10} {r['source']:3} | "
                f"{r['title'][:60]} | {r['employer'][:30]} | {r['location'][:40]}"
            )
    finally:
        db.close()


@app.command("show")
def show_cmd(offer_id: int) -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    try:
        row = db.get(offer_id)
        if not row:
            raise SystemExit(f"Offer {offer_id} not found")
        # Drop huge raw for readability unless needed
        printable = {k: v for k, v in row.items() if k != "raw_json"}
        typer.echo(json.dumps(printable, ensure_ascii=False, indent=2))
        if row.get("url"):
            typer.echo(f"\nURL: {row['url']}")
    finally:
        db.close()


@app.command("tag")
def tag_cmd(
    offer_id: int,
    interest: str = typer.Argument(..., help="unset|interested|maybe|skip"),
    note: Optional[str] = typer.Option(None, "-m", "--note"),
) -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    try:
        if not db.get(offer_id):
            raise SystemExit(f"Offer {offer_id} not found")
        db.set_interest(offer_id, interest, note)
        typer.echo(f"Tagged {offer_id} → {interest}")
    finally:
        db.close()


@app.command("triage")
def triage_cmd(
    limit: int = typer.Option(50, help="Max offers to score"),
    apply: bool = typer.Option(
        False,
        help="Write verdict to DB (interest + notes) instead of dry-run",
    ),
) -> None:
    """Score unset-tagged offers → interested / maybe / skip (deterministic)."""
    from job_radar.triage import Triage, bucket_label, score_offer

    settings = load_settings()
    db = Database(settings.db_path)
    try:
        rows = db.list_offers(interest="unset", limit=limit)
        if not rows:
            typer.echo("(no unset offers)")
            return
        counts: dict[str, int] = {}
        for r in rows:
            tr: Triage = score_offer(r)
            counts[tr.verdict] = counts.get(tr.verdict, 0) + 1
            label = bucket_label(tr.verdict)
            typer.echo(
                f"[{r['id']}] {label:10} score={tr.score} | "
                f"{r['title'][:58]} | {r['location'][:36]}"
            )
            for reason in tr.reasons:
                typer.echo(f"          · {reason}")
            if apply:
                db.set_interest(r["id"], tr.verdict, tr.to_row_note())
        typer.echo(
            "apply="
            + ("ON" if apply else "OFF")
            + " → "
            + ", ".join(f"{k}:{counts.get(k,0)}" for k in ("interested", "maybe", "skip"))
        )
    finally:
        db.close()


@app.command("stats")
def stats_cmd() -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    try:
        s = db.stats()
        typer.echo(json.dumps(s, ensure_ascii=False, indent=2))
    finally:
        db.close()


@app.command("export")
def export_cmd(
    interest: Optional[str] = typer.Option(None),
    limit: int = typer.Option(200),
) -> None:
    settings = load_settings()
    db = Database(settings.db_path)
    try:
        rows = db.list_offers(interest=interest, limit=limit)
        typer.echo(export_markdown(rows))
    finally:
        db.close()


@app.command("ping")
def ping_cmd(
    limit: int = typer.Option(50, help="Max offers to evaluate"),
    profile_path: str = typer.Option(
        None, help="Profile YAML path (default: job-radar/profile.yaml)"
    ),
    strong_threshold: float = typer.Option(0.7, help="Min match_rate for strong_match"),
    partial_threshold: float = typer.Option(0.4, help="Min match_rate for partial_match"),
    apply: bool = typer.Option(
        False, help="Write verdicts to DB (interest + notes)"
    ),
    json_output: bool = typer.Option(False, "--json", help="Output as JSON"),
) -> None:
    """Claims-to-Ping: extract claims, match profile, conditionally ping."""
    from job_radar.claims import extract_claims
    from job_radar.ping import evaluate_pings
    from job_radar.profile import Profile

    settings = load_settings()
    pp = Path(profile_path) if profile_path else ROOT / "profile.yaml"
    if not pp.exists():
        typer.echo(f"Profile not found: {pp}", err=True)
        raise SystemExit(1)
    profile = Profile.from_yaml(pp)
    typer.echo(f"Profile: {profile.name} (from {pp})")

    db = Database(settings.db_path)
    try:
        rows = db.list_offers(interest="unset", limit=limit)
        if not rows:
            typer.echo("(no unset offers)")
            return

        # Build external_id → DB id mapping
        offer_ids = {r.get("external_id", ""): r["id"] for r in rows if r.get("external_id")}

        batch = evaluate_pings(
            rows,
            profile,
            strong_threshold=strong_threshold,
            partial_threshold=partial_threshold,
            offer_ids=offer_ids,
        )

        if json_output:
            import json

            typer.echo(json.dumps(batch.to_dict(), ensure_ascii=False, indent=2))
        else:
            typer.echo(batch.format_output())

        # Apply verdicts if requested
        if apply:
            for ping in batch.pings:
                if ping.offer_id is not None:
                    verdict = "interested" if ping.verdict == "strong_match" else "maybe"
                    note_parts = [
                        f"score={ping.score:.0%}",
                        f"skills={','.join(ping.matched_skills[:3])}",
                    ]
                    if ping.missing_required:
                        note_parts.append(f"missing={','.join(ping.missing_required)}")
                    db.set_interest(ping.offer_id, verdict, "; ".join(note_parts))
            typer.echo(f"Applied {len(batch.pings)} verdicts to DB")

        typer.echo(
            f"\nstrong={len(batch.strong_matches)} "
            f"partial={len(batch.partial_matches)} "
            f"total_evaluated={len(rows)}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    app()
