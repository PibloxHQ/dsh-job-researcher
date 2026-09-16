# dsh-job-researcher

Primary DSH runtime for Mestryx job search (migrated from Hermes `job-radar`).

| | |
|--|--|
| Lab path | `~/dsh-lab/plugins/dsh-job-researcher/` |
| Remote | https://github.com/PibloxHQ/dsh-job-researcher |
| Data | `$DSH_HOME/job-researcher/radar.db` |
| Python venv | `$DSH_HOME/job-researcher/.venv` |
| Schedule | `0 12 * * *` UTC (plugin-owned; DSH has no native cron) |
| UI | Settings → **Job Researcher** |
| API | `/api/job-researcher/*` |

## Quick ops

```bash
export DSH_HOME=~/dsh-lab/runtime/dsh-home
bash scripts/setup-venv.sh
# migrate (once)
$DSH_HOME/job-researcher/.venv/bin/python runtime/python/scripts/migrate_db.py \
  --src /path/to/legacy/radar.db \
  --dst $DSH_HOME/job-researcher/radar.db
# manual pipeline
JOB_RESEARCHER_DATA_DIR=$DSH_HOME/job-researcher \
  $DSH_HOME/job-researcher/.venv/bin/python -m job_radar.dsh_pipeline --trigger manual
```

## Docs

- Migration: [`docs/audits/dsh-job-researcher-migration.md`](docs/audits/dsh-job-researcher-migration.md)
- Prior audit: [`docs/audits/dsh-job-researcher-audit.md`](docs/audits/dsh-job-researcher-audit.md)
- Hermes rollback: [`docs/runbooks/job-researcher-hermes-rollback.md`](docs/runbooks/job-researcher-hermes-rollback.md)

## Non-goals still open

- FT vault secrets (operator must `dsh-piblox-secrets set FT_CLIENT_ID` / `FT_CLIENT_SECRET`)
- Discord notify via `dsh-piblox-discord` (lab profile currently disabled)
