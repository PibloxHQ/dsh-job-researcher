# DSH Job Researcher Migration

**Date:** 2026-09-16  
**Status:** PARTIAL (primary DSH runtime live; FT secrets missing; Discord notify not enabled; some legacy `et` URLs still empty)

---

## Previous Architecture

Hermes cron `job-search-debrief` (`7abaf1c80aa4`, `0 12 * * *` UTC) → agent + skill → Python `job-radar` CLI → SQLite `cockpit/projects/emploi/job-radar/data/radar.db` → Discord deliver.

## Target Architecture

DSH plugin `dsh-job-researcher` owns: plugin wall-clock scheduler (DSH has **no** native cron), Python worker under `$DSH_HOME/job-researcher/.venv`, DSH-owned SQLite, Settings UI, HTTP API. Hermes cron **disabled** (retained). Secrets via `dsh-piblox-secrets` when present.

## Runtime Migration

- Vendored `runtime/python/` from legacy `job-radar` (MOVE/ADAPT).
- Orchestration: `job_radar.dsh_pipeline` (deterministic; replaces Hermes prompt).
- Node host: soft `webServer`, `ctx.interval` scheduler, spawn Python with explicit env.

## Python Packaging

| Item | Value |
|------|--------|
| Python | 3.12 |
| Venv | `$DSH_HOME/job-researcher/.venv` |
| Install | `scripts/setup-venv.sh` → `pip install -e runtime/python` |
| Command | `…/.venv/bin/python -m job_radar.dsh_pipeline --trigger …` |
| Data | `JOB_RESEARCHER_DATA_DIR` / `$DSH_HOME/job-researcher` |
| Env | `DB_PATH`, `FT_CLIENT_ID`, `FT_CLIENT_SECRET` (from vault resolve when available) |

## Database Migration

| | Path |
|--|------|
| Old | `…/emploi/job-radar/data/radar.db` (retained) |
| New | `$DSH_HOME/job-researcher/radar.db` |
| Backup | `~/dsh-lab/backups/job-researcher-pre-migration-20260916T043347Z/` |

Migrated rows: **4128** offers + **4128** feedback. UNIQUE(source, external_id) preserved. Tables: `offers` (+ score*), `offer_feedback`, `source_state`, `job_runs`, `schema_meta`.

Interest map → YES/MAYBE/NO/UNREVIEWED.

## Secret Migration

| Name | Status |
|------|--------|
| FT_CLIENT_ID | missing (empty legacy `.env`; not in vault) |
| FT_CLIENT_SECRET | missing |
| Backend | dsh-piblox-secrets (`resolve`) |
| Legacy `.env` | retained for rollback; not used by DSH primary path when vault resolves |

No secret values logged or committed.

## Scheduler Migration

DSH has no calendar cron. Plugin implements UTC cron matcher + 30s `ctx.interval` poll. Expression: `0 12 * * *` UTC. Manual `POST /api/job-researcher/run` uses the **same** pipeline.

## Source Migration

| Source | Status (smoke 2026-09-16) |
|--------|---------------------------|
| csp-filtre | ok |
| et | ok (URL parser fixed for new parses) |
| ft | degraded — missing credentials |
| csp | available via CLI/pipeline sources list |

## Scoring Migration

`triage.py::score_offer` as `score_version=legacy-v1`. Rules unchanged. Persisted: score, classification, details JSON.

## State / Checkpoint Migration

`last_debrief_ids.txt` **not** carried forward as SSOT. Replaced by DB: `first_seen_at` / `last_seen_at`, `notified_at`, `offer_feedback`, `job_runs`. Checkpoint file retained in backup only.

## Dashboard

Settings section `job-researcher`: ops strip, filters, pagination, YES/NO/MAYBE, comment, detail drawer, Run now.

## Notifications

`dsh-piblox-discord` remains disabled on web profile (`transport: fake` / not in bundles). Notify status: **skipped**. Dashboard is primary UI.

## Data Integrity Validation

| Check | Result |
|-------|--------|
| Offer count old vs new | 4128 = 4128 |
| by_source | csp 3780 · et 13 · ft 335 |
| feedback seeded | YES 396 · MAYBE 1871 · NO 1861 |
| Smoke run | run_id=1 status=ok (csp-filtre+et) |

## Tests

`npm test` in plugin: cron + manifest + store — PASS.  
ET URL unit assert — PASS.  
Pipeline smoke — PASS (partial without FT).

## Cutover

1. Snapshot + migrate DB ✓  
2. Venv + smoke ✓  
3. Wire web bundles + relink ✓  
4. Disable Hermes cron ✓ (backup JSON retained)  
5. Discord notify deferred  
6. FT secrets still missing  

## Hermes Fallback

See `docs/runbooks/job-researcher-hermes-rollback.md`.

## Rollback Procedure

Documented in runbook. Cron config preserved (`enabled=false`).

## Known Limitations

1. FT credentials not in vault → FT source fails soft.  
2. Discord notifications not cut over.  
3. Legacy `et` rows may still have empty `url` until re-synced with fixed parser (2 rows already have URLs post-smoke).  
4. Plugin scheduler is in-process (survives only while DSH web process runs).  
5. Live Settings UI smoke after process restart not fully operator-verified in this session.

## Files Changed

See git history on `PibloxHQ/dsh-job-researcher` and lab `INSTALL-MAP` / web `package.json` / Hermes `jobs.json`.

## Final Runtime State

```text
PRIMARY_RUNTIME: DSH (dsh-job-researcher)
HERMES_CRON: DISABLED (rollback ready)
DB_PRIMARY: $DSH_HOME/job-researcher/radar.db
SECRETS: dsh-piblox-secrets (FT missing)
SCHEDULE: plugin cron 0 12 * * * UTC
NOTIFICATIONS: skipped
```
