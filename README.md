# dsh-job-researcher

Primary DSH runtime for Mestryx job search (migrated from Hermes `job-radar`).

| | |
|--|--|
| Lab path | `~/dsh-lab/plugins/dsh-job-researcher/` |
| Remote | https://github.com/PibloxHQ/dsh-job-researcher |
| Data | `$DSH_HOME/job-researcher/radar.db` |
| Python venv | `$DSH_HOME/job-researcher/.venv` |
| Schedule | `0 12 * * *` UTC (plugin-owned; DSH has no native cron) |
| Secrets | Cordis service `secrets` from **dsh-piblox-secrets** (hard inject; fail-closed) |
| UI | Sidebar panellist (logo) → **main panel** session-like (navbar + list); offre en **modal** |
| API | `/api/job-researcher/*` |
| Install | Profile `file:` dep → `~/dsh-lab/plugins/dsh-job-researcher` (pnpm link, live source) |

## Install / update (web profile)

Wired as:

```json
"dsh-job-researcher": "file:/home/mestryx/dsh-lab/plugins/dsh-job-researcher"
```

in `~/dsh-lab/runtime/dsh-home/profiles/web/package.json`.

| Change | Action |
|--|--|
| Edit `src/client/index.js` (UI) | **No reinstall.** Hard-refresh the browser (ModuleLoader may cache). |
| Edit host `src/*.js` (API/pipeline) | Restart the DSH web profile — still **no** `pnpm install` if the package path/`exports` are unchanged. |
| Change `package.json` name/version/`exports`/`files` | `pnpm install` in the web profile (relink `file:`), then restart. |
| First-time wire into profile | Add dep + bundle entry → `pnpm install` → restart. |

Do **not** reinstall on every UI tweak. The repo under `~/dsh-lab/plugins/dsh-job-researcher` is the live source via the symlink.

## API autonomie (2026-09-17)

| Méthode | Route | Rôle |
|--|--|--|
| GET | `/api/job-researcher/status` | Readiness agrégée (`needs_setup`…`blocked`) |
| GET/PUT | `/api/job-researcher/config` | Profil de recherche versionné (pas de secrets) |
| POST | `/api/job-researcher/config/validate` | Dry-run validation |
| GET | `/api/job-researcher/diagnostics` | Python/venv/schema/secrets presence |
| POST | `/api/job-researcher/bootstrap` | Setup idempotent venv+DB |
| GET | `/api/job-researcher/sources` | Sources + enabled |
| POST | `/api/job-researcher/runs` | `202` enqueue (alias `POST /run`) |
| POST | `/api/job-researcher/rescore` | File triage `v4-feedback` |

Secrets FT : **Settings → Secrets** uniquement (`FT_CLIENT_ID` / `FT_CLIENT_SECRET`). JR n’affiche que présent/manquant.

## Architecture

```text
Operator
   │
   ▼
Settings → Secrets          (admin plane — create FT_CLIENT_ID / FT_CLIENT_SECRET)
   │
   ▼
dsh-piblox-secrets          (encrypted store + in-memory vault)
   │
   └── Cordis service "secrets"
           │
           ▼
dsh-job-researcher          (hard inject: ['secrets'])
           │
           └── materialize(["FT_CLIENT_ID", "FT_CLIENT_SECRET"], childEnv)
                         │
                         ▼
                  Python worker             (values only in this child env)
```

Job Researcher does not know the vault encryption key or SQLite path. It only asks the Cordis `secrets` service to materialize the keys it needs. Values are never global `process.env`, model context, or operator shell args.

Not an npm vault dependency: secrets stays its own installed DSH plugin.

## Vault prep (P0 before FT-capable cutover)

1. Open the DSH WebUI → **Settings → Secrets**
2. Create `FT_CLIENT_ID` and `FT_CLIENT_SECRET` (UPPER_SNAKE names)
3. Confirm Job Researcher status leaves `blocked_missing_ft_secrets`

Do **not** put FT values in `cordis.patch.yml`, `.env`, the repo, host `process.env`, or shell `set` commands for the normal DSH operator path. The secrets CLI is break-glass for the Secrets plugin itself — not the Job Researcher procedure.

Pipeline runs **fail closed** if either key is missing from the vault.

## Quick ops

```bash
export DSH_HOME=~/dsh-lab/runtime/dsh-home
bash scripts/setup-venv.sh
# migrate (once)
$DSH_HOME/job-researcher/.venv/bin/python runtime/python/scripts/migrate_db.py \
  --src /path/to/legacy/radar.db \
  --dst $DSH_HOME/job-researcher/radar.db
```

Prefer **Run now** / scheduled fire from the plugin (materialize path).

## Feedback learning (v4)

Comments refine **future search/scoring**. Structured tags + optional free text are user feedback (`feedback_origin=user`). Legacy rows where `comment` equalled `offers.notes` are **system score reasons** — migrated to `system_reason` and never used for learning.

| | |
|--|--|
| Schema | additive v4 on `offer_feedback` (`system_reason`, `feedback_tags_json`, `feedback_origin`, `feedback_updated_at`) |
| Score version | `v4-feedback` (base + capped feedback adjustment ≤ ±2) |
| Learn from | `feedback_origin=user` only · ≥2 confirmations per tag |
| API | `PATCH …/feedback`, `PATCH …/decision` (tags), `GET …/learning` |
| UI | « Pourquoi ce choix ? » + tag chips + « Enregistrer le retour » |

No LLM. No silent `profile.yaml` mutation. Application state remains independent.

### Restart required

Host / Cordis / Python changes apply after **restart of the DSH web profile**. Client UI (`src/client/index.js`) is served from the same `file:` tree — after a client-only edit, a **hard browser refresh** is usually enough; restart only if the overlay still shows stale ModuleLoader output.

## Daily application tracker

Interest (YES / MAYBE / NO) is **not** an application. Application workflow is separate:

| State | UI label | Meaning |
|--|--|--|
| `NONE` | — | Default: no application track yet (interest unanswered or not started) |
| `TO_PREPARE` | À préparer | Operator started prep (manual) |
| `READY` | Prête | Materials ready; not yet submitted |
| `APPLIED` | Envoyée | You already submitted the application **outside** DSH |

Daily progress counts manual `APPLIED` marks for the **Europe/Paris** calendar day (target = 1). Duplicate clicks on `APPLIED` are idempotent. Moving back to `READY` / `TO_PREPARE` clears the timestamp so a correction does not double-count.

Opening a job URL, marking YES, or preparing a draft never creates an application. The plugin never sends applications.

## Docs

- Migration: [`docs/audits/dsh-job-researcher-migration.md`](docs/audits/dsh-job-researcher-migration.md)
- Prior audit: [`docs/audits/dsh-job-researcher-audit.md`](docs/audits/dsh-job-researcher-audit.md)
- Hermes rollback: [`docs/runbooks/job-researcher-hermes-rollback.md`](docs/runbooks/job-researcher-hermes-rollback.md)
- Daily applications evidence (2026-09-16): [`docs/daily-applications-2026-09-16.md`](docs/daily-applications-2026-09-16.md)
- Feedback learning v4 evidence (2026-09-16): [`docs/feedback-learning-v4-2026-09-16.md`](docs/feedback-learning-v4-2026-09-16.md)

## Still open

- **P0 closed (2026-09-17):** FT keys present in Settings → Secrets (`materialize` offline PASS)
- Discord notify via `dsh-piblox-discord` (lab profile currently disabled)
- **Operator:** restart profile to load application tracker + feedback learning (see above)
- Authenticated Settings UI smoke after restart (not done in this session)
