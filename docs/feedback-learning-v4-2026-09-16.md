# Feedback learning v4 — evidence 2026-09-16

**Plugin:** `~/dsh-lab/plugins/dsh-job-researcher`  
**Verdict:** **COMPLETE in lab source / tests** · **NOT LIVE** (no profile restart, no production DB mutation, no browser UX proof)

Preserves prior dirty migration + daily-application work. Production `$DSH_HOME/job-researcher/radar.db` was only **copied** into disposable fixtures for disentangle checks — never opened for writing.

## Clarification (operator)

Migrated feedback `comment` values equal `offers.notes` for all audited rows: they are **system-generated legacy score reasons**, not user free-text. Learning must **never** train on those rows.

## What shipped

### Provenance (schema v4)

Additive columns on `offer_feedback`:

| Column | Role |
|--|--|
| `system_reason` | System scoring explanation |
| `feedback_tags_json` | Closed vocabulary tags (user) |
| `feedback_origin` | `user` \| `legacy` \| `system` \| empty |
| `feedback_updated_at` | Last user feedback write |
| `comment` | True user free text (API-compatible) |

Migration (Node + Python, idempotent): when `comment` **exactly equals** `offers.notes`, copy → `system_reason`, clear `comment`, set `feedback_origin=legacy` when empty. Non-matching comments preserved. Pipeline updates `system_reason` only — never overwrites user comment/tags.

### Explainable learning

- Closed tags grounded in scoring rules (`location_good`, `too_far`, `dev_infra_good`, `support_good`/`bad`, `public_sector_good`, `student_contract_bad`, `contract_bad`, `missing_diploma`, `needs_details`) with French UI labels.
- Learn **only** from `feedback_origin=user`; require ≥2 confirmations; per-tag and total caps (±1 / ±2).
- `score_offer(row, preferences=None)` remains backward compatible; score version `v4-feedback`.
- `score_details` stores `base_score`, `feedback_adjustment`, `learned_signals`, `reasons`.
- Read-only `GET /api/job-researcher/learning` (+ `status.learning`). No LLM; no `profile.yaml` mutation.

### UX

- Client restyled with `--dsw-alias-*` tokens (secrets/discord pattern).
- Detail panel: « Pourquoi ce choix ? », helper, tag chips, optional comment, « Enregistrer le retour », system score separate.
- Human application labels: À préparer / Prête / Envoyée.
- Icon buttons have `aria-label`; score badges not color-only.

## Tests

```text
npm run check     → exit 0
npm test          → 24 Node cases pass; Python application (5) + feedback learning (5) pass
git diff --check  → clean
```

Observed 2026-09-16: disposable production-shaped clone disentangle also PASS (4,128-row copy; real DB not written).

## Limitations

1. **Not live** — DSH profile restart required to load module + run additive ALTER on the real DB.
2. **Production DB untouched** this session.
3. **Browser UX not proven** — no authenticated Settings smoke (restart unauthorized).
4. Informational tags (`missing_diploma`, `needs_details`) do not adjust score.

## Complete vs not live

| Claim | Status |
|--|--|
| Implementation in plugin tree | COMPLETE |
| Isolated tests green | COMPLETE (run locally) |
| Production DB migrated | NOT DONE (intentional) |
| Runtime serving new UI/API | NOT LIVE (no restart) |
| Browser visual proof | NOT PROVEN |
| Trains on legacy comment==notes | NEVER (by design) |
