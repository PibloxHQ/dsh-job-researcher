# Job Researcher — Hermes break-glass rollback

**Primary runtime after 2026-09-16 cutover:** `dsh-job-researcher` (DSH).  
Hermes cron `job-search-debrief` (`7abaf1c80aa4`) is **DISABLED**, retained for emergency only.

## When to use

Only if DSH job researcher is broken and you need the daily debrief restored immediately.

## Preconditions

- Backup snapshot exists under `~/dsh-lab/backups/job-researcher-pre-migration-*`
- Hermes cron JSON backup: `~/.hermes/cron/jobs.json.bak-jobresearcher-cutover-*`
- Legacy tree still present: `WorkSpace/cockpit/projects/emploi/job-radar`

## Steps

1. **Stop DSH writers**
   - Set plugin config `scheduleEnabled: false` (cordis patch) or remove `dsh-job-researcher` from web `dsh.profile.bundles`
   - Restart DSH web (`scripts/verify-dsh-healthy.sh` / atomic relaunch per AGENTS.md)
   - Confirm no running row in `$DSH_HOME/job-researcher/radar.db` (`job_runs.status='running'`)

2. **Decide DB strategy**
   - Prefer continuing from **legacy** `job-radar/data/radar.db` if it was not written by DSH after cutover
   - If DSH DB is ahead and you need those rows: copy `$DSH_HOME/job-researcher/radar.db` → legacy path (after a backup)
   - Never run Hermes and DSH against the **same** writable DB

3. **Restore env for legacy**
   - Ensure `job-radar/.venv` works (`python3.12`)
   - Put FT credentials in `job-radar/.env` if FT sync is required (`FT_CLIENT_ID`, `FT_CLIENT_SECRET`) — values never committed

4. **Re-enable Hermes cron**
   - Edit `~/.hermes/cron/jobs.json` job `7abaf1c80aa4`:
     - `enabled: true`
     - `state: scheduled`
     - clear `paused_at` / `paused_reason`
   - Or restore from the cutover backup JSON for that job only

5. **Verify**
   - Manual: `cd …/job-radar && .venv/bin/python -m job_radar.cli sync --source csp-filtre`
   - Confirm Hermes gateway sees the job enabled
   - Wait for next schedule or trigger a one-shot run from Hermes UI

6. **After recovery**
   - File an incident note in `~/dsh-lab/audit/lab-log.md`
   - Plan re-cutover to DSH once fixed

## Do not

- Delete the DSH plugin or DSH DB during rollback
- Delete Hermes skill `job-search-assistant`
- Commit secrets
