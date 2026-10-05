# Scoring Jev enrichment — implementation plan

Status: **Phase 1 shadow mode implemented; policy promotion not implemented**.
Mission Hub: [#231](https://mission-hub.lan/missions/231).

## Runtime baseline — 2026-10-05

- Job Researcher is `ready` and `can_run=true`.
- Live score version observed after the Web restart: `v5-feedback`.
- Live database observed: 4203 offers, 500 current and 3703 stale.
- Active production scorer: `runtime/python/src/job_radar/triage.py::score_offer`.
- The claims/profile scorer is not the active cron scorer.
- A real Jev request succeeded through DSH and `dsh-piblox-secrets`.

## Phase 1 delivered

`POST /api/job-researcher/jev-enrich` accepts 1–20 explicit offer IDs and:

1. builds a bounded `career.v1` state from the offer, profile and deterministic score;
2. asks the optional DSH `jev` host service for typed `location_fit`, `role_family`, and `semantic_fit` answers;
3. stores Jev answers additively (`jev_model`, `jev_schema_version`, `jev_signals_json`, `jev_scored_at`, `jev_error`);
4. reports `shadow_mode: true` and never changes `score`, `interest`, or `application_status`;
5. falls back to the deterministic result on missing Jev, timeout, invalid response, or upstream failure.

The endpoint is intentionally explicit and bounded. It does not call Jev for
the whole database and does not influence ranking yet.

## Next gates

- Build a stratified baseline and replay corpus.
- Compare deterministic-only and shadow signals for cost, latency, disagreement,
  and false positive/negative review.
- Add a bounded deterministic composite only after operator review.
- Keep closed/depublished and other hard blockers independent of Jev.
- Preserve Reviewer and human approval before `APPLIED`.
