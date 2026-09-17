# DSH Job Researcher Migration

**Date:** 2026-09-16  
**Status:** PARTIAL (primary DSH runtime live; FT vault keys **present** 2026-09-17 — live FT run pending; Discord notify not enabled; some legacy `et` URLs still empty)

---

## Previous Architecture

Hermes cron `job-search-debrief` (`7abaf1c80aa4`, `0 12 * * *` UTC) → agent + skill → Python `job-radar` CLI → SQLite `cockpit/projects/emploi/job-radar/data/radar.db` → Discord deliver.

## Target Architecture

```text
Operator → Settings → Secrets → dsh-piblox-secrets (store + vault)
                                      │
                                      └── Cordis "secrets"
                                              │
                                              ▼
                                    dsh-job-researcher
                                              │
                                              └── materialize(FT_*) → Python child env
```

DSH plugin owns: wall-clock scheduler (DSH has **no** native cron), Python worker under `$DSH_HOME/job-researcher/.venv`, DSH-owned SQLite, Settings UI, HTTP API. Hermes cron **disabled** (retained).

**Secrets Boundary v1.1:** hard `inject: ['secrets']` — not optional `ctx.get('secrets')`. No npm embedding of the vault. No FT values in `cordis.patch.yml` / `.env` / host `process.env` / shell `set`. Operator path = **Settings → Secrets** only. Child env is minimal + `materialize([...])`. Missing FT keys → **throw** (fail closed), not soft degrade.

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
| Env | Minimal child env + FT via `secrets.materialize` (DSH path skips `.env`) |

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
| FT_CLIENT_ID | **present** (Settings → Secrets; verified names + materialize 2026-09-17) |
| FT_CLIENT_SECRET | **present** |
| Backend | Cordis `secrets` from dsh-piblox-secrets (`materialize`) |
| Operator path | Settings → Secrets (create both keys). Secrets CLI = break-glass only — not JR procedure |
| Legacy `.env` | rollback / local-dev only — **not** loaded when `JOB_RESEARCHER_DATA_DIR` or `DSH_HOME` is set |

No secret values logged or committed.

## Scheduler Migration

DSH has no calendar cron. Plugin implements UTC cron matcher + 30s `ctx.interval` poll. Expression: `0 12 * * *` UTC. Manual `POST /api/job-researcher/run` uses the **same** pipeline (fail-closed on missing FT).

## Source Migration

| Source | Status (smoke 2026-09-16) |
|--------|---------------------------|
| csp-filtre | ok |
| et | ok (URL parser fixed for new parses) |
| ft | **ready** (vault keys present 2026-09-17; live FT OAuth smoke pending) |
| csp | available via CLI/pipeline sources list |

## Scoring Migration

`triage.py::score_offer` as `score_version=v4-feedback` (was `legacy-v1`). Base rules unchanged; optional user-origin feedback tags apply a capped explainable adjustment (±2). Persisted: score, classification, details JSON (`base_score`, `feedback_adjustment`, `learned_signals`, `reasons`).

**Provenance note (2026-09-16):** all 4,128 migrated `offer_feedback.comment` values equalled `offers.notes` (system score reasons). Schema v4 moves those to `system_reason` and clears `comment`; learning ignores `feedback_origin=legacy`. See `docs/feedback-learning-v4-2026-09-16.md`.

## State / Checkpoint Migration

`last_debrief_ids.txt` **not** carried forward as SSOT. Replaced by DB: `first_seen_at` / `last_seen_at`, `notified_at`, `offer_feedback`, `job_runs`. Checkpoint file retained in backup only.

## Dashboard

Settings section `job-researcher`: ops strip, filters, pagination, YES/NO/MAYBE, comment, detail drawer, Run now. Status reports `blocked_missing_ft_secrets` until vault keys present.

## Notifications

`dsh-piblox-discord` remains disabled on web profile (`transport: fake` / not in bundles). Notify status: **skipped**. Dashboard is primary UI.

## Data Integrity Validation

| Check | Result |
|-------|--------|
| Offer count old vs new | 4128 = 4128 |
| by_source | csp 3780 · et 13 · ft 335 |
| feedback seeded | YES 396 · MAYBE 1871 · NO 1861 |
| Smoke run | run_id=1 status=ok (csp-filtre+et) — pre-fail-closed |

## Tests

`npm test` in plugin: cron + manifest + store + pipeline boundary — PASS.

## Cutover

1. Snapshot + migrate DB ✓  
2. Venv + smoke ✓  
3. Wire web bundles + relink ✓  
4. Disable Hermes cron ✓ (backup JSON retained)  
5. Discord notify deferred  
6. **P0 closed (2026-09-17):** FT secrets in vault via Settings → Secrets; next = live `materialize` + full run including `ft` after web reload if needed

## Hermes Fallback

See `docs/runbooks/job-researcher-hermes-rollback.md`.

## Rollback Procedure

Documented in runbook. Cron config preserved (`enabled=false`).

## Known Limitations

1. Live FT OAuth / full pipeline smoke still pending after vault fill (2026-09-17).  
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
SECRETS: Cordis secrets required (hard inject); FT = present (2026-09-17)
SCHEDULE: plugin cron 0 12 * * * UTC
NOTIFICATIONS: skipped
```
