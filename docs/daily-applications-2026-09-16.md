# Daily applications tracker — evidence 2026-09-16

**Plugin:** `~/dsh-lab/plugins/dsh-job-researcher`  
**Verdict:** **COMPLETE in lab source / tests** · **NOT LIVE** (no profile restart, no production DB mutation, no deploy)

Pre-implementation dirty migration diff captured at `/tmp/dsh-job-researcher-pre-impl-2026-09-16.diff` and preserved in the working tree.

## What shipped

Manual application workflow **separate from interest** (`YES` / `MAYBE` / `NO` / `UNREVIEWED`):

| Enum | Role |
|--|--|
| `TO_PREPARE` | Default after additive migration |
| `READY` | Ready to submit externally |
| `APPLIED` | Operator recorded a completed **external** submission |

- Persisted additive schema v3 on `offer_feedback`: `application_status`, `applied_at`, `applied_local_day`
- Shared Python `ensure_application_schema()` — **ALTER columns before indexes** (safe on existing v2)
- Wired into `Database.__init__`, `dsh_pipeline._ensure_schema`, `migrate_db.migrate`
- `SCHEMA_V2` remains v2-safe (`executescript` alone no longer creates application indexes)
- `APPLIED` timestamp + Europe/Paris local day; duplicate click idempotent
- Daily count / target = 1 using **Europe/Paris** (shown in UI)
- Correction (`APPLIED` → `READY`/`TO_PREPARE`) clears timestamps → no double count on re-apply
- No implicit applications from YES, opening URL, or draft prep
- API validates IDs via `parseOfferId` (positive safe integers only; rejects `15e-1` / `1e1`)
- UI: daily progress, application filter, localized status labels, unambiguous mark-submitted control
- Default offer list shows all offers (empty interest filter)
- Secrets fail-closed path unchanged
- Plugin never sends applications

## Files touched (this feature + migration fix)

| Path | Change |
|--|--|
| `src/store.js` | Schema ensure, `parseOfferId`, `setApplication`, daily progress |
| `src/http.js` | `PATCH …/application`, shared `parseOfferId` |
| `src/client/index.js` | Progress, filters, localized application labels |
| `runtime/python/src/job_radar/schema_v2.py` | v2-safe SCHEMA + `ensure_application_schema` |
| `runtime/python/src/job_radar/db.py` | Call shared ensure on open |
| `runtime/python/src/job_radar/dsh_pipeline.py` | Call shared ensure in `_ensure_schema` |
| `runtime/python/scripts/migrate_db.py` | Indexes only after ensure |
| `runtime/python/tests/test_application_schema.py` | Python-first v2 / repeat / fresh / CLI |
| `scripts/run-python-schema-tests.mjs` | npm integration (stdlib unittest) |
| `test/store.test.js` | Fixture DB + ID rejection |
| `test/http-application.test.js` | Isolated API cases |
| `README.md` | Daily workflow + restart required |
| `docs/daily-applications-2026-09-16.md` | This report |

Existing dirty migration edits were **not** reverted.

## Tests

```text
npm test          → node tests + Python schema unittest (via scripts/run-python-schema-tests.mjs)
npm run check     → exit 0
npm run test:node → node-only (16 cases)
npm run test:python-schema → Python regression only
```

Standalone Python (same as npm hook):

```bash
PYTHONPATH=runtime/python/src python3 runtime/python/tests/test_application_schema.py
```

Coverage: migration preservation of interest, Python-first existing v2 upgrade, repeat preserve APPLIED+interest, fresh DB, CLI migrate destination, Node APPLIED idempotency / Paris day boundary / bad IDs / interest separation.

Production-shape validation used a temporary copy of the current 4,128-offer database. The v2→v3 upgrade preserved 4,128 offers and 4,128 feedback rows, seeded every application as `TO_PREPARE`, and reported daily progress `0/1` for Europe/Paris. The real database was not opened for writing.

The web profile package resolves directly to the lab plugin source and the compared `src/store.js` hashes match. Propagation is ready; Node still needs a controlled restart because the running process caches the old module.

## Limitations

1. **Not live** — restart the DSH profile mounting this plugin after pull.
2. **Production DB not mutated** this session — additive `ALTER` runs on the next Python/`openStore` against `$DSH_HOME/job-researcher/radar.db`.
3. No Discord / recruiter automation / LLM / scoring changes.
4. Daily target hardcoded to 1.

## Complete vs not live

| Claim | Status |
|--|--|
| Implementation in plugin tree | COMPLETE |
| Python v2→v3 regression fixed + tested | COMPLETE |
| Isolated tests green | COMPLETE |
| Production DB migrated | NOT DONE (intentional) |
| Runtime serving new UI/API | NOT LIVE (no restart) |
| Applications submitted by plugin | NEVER (by design) |
