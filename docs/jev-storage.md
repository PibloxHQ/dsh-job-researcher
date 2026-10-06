# Jev evaluation storage

Job Researcher keeps the latest Jev result on `offers` for fast list/detail
views, and keeps the durable history in two additive tables:

- `jev_runs` — one row per enrichment campaign or API batch;
- `jev_evaluations` — one row per offer in a campaign.

The historical row records the profile revision/hash, question-set version,
model, request hash, typed answers, weighted match, token usage, status, error
and timestamps. The request, profile and credentials are not stored again.

The migration is idempotent and runs from `openStore()`/`ensureDb()` alongside
the existing autonomy schema. Existing `offers.jev_*` columns remain the latest
result projection and are not removed.

Read the history through:

```text
GET /api/job-researcher/jev-runs
GET /api/job-researcher/offers/:id/jev-evaluations
```

`POST /api/job-researcher/jev-enrich` creates a run row and returns its `run_id`.
It remains shadow-only: deterministic score, interest and application status
are not modified. Re-running with a new profile revision, question set or
request hash creates a new campaign history instead of overwriting the old
evaluation.
