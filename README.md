# dsh-job-researcher

Scaffold / bootstrap plugin for a future **Job Researcher** Settings surface in DeepSeek Harness (DSH).

| Status | Value |
|--------|--------|
| Version | `0.1.0-dev` |
| Lab path | `~/dsh-lab/plugins/dsh-job-researcher/` |
| Wired into profiles | **No** (`scaffold` in INSTALL-MAP) |
| Live job pipeline | Still Hermes cron `job-search-debrief` + `job-radar` CLI |

## What this scaffold does

- Cordis host entry with soft `webServer` health route `GET /api/job-researcher/status`
- Settings section placeholder: **DSH Job Researcher / Plugin bootstrap OK**
- Manifest (`package.json` `dsh.bundle` + `cordis.patch.yml`) matching lab first-party conventions

## What it intentionally does NOT do

- Replace or disable Hermes cron `7abaf1c80aa4` (`job-search-debrief`)
- Read/write `cockpit/projects/emploi/job-radar/data/radar.db`
- Scrape / sync sources / score offers
- Wire into `profiles/web` or `profiles/headless` bundles

## Audit

Full existing-system audit: [`docs/audits/dsh-job-researcher-audit.md`](docs/audits/dsh-job-researcher-audit.md)

## Wire later (operator decision)

1. `pnpm add file:../../../plugins/dsh-job-researcher` in the target profile
2. Add `dsh-job-researcher` to `dsh.profile.bundles`
3. Relink / restart per `dsh-plugin-changes` skill
4. Update `~/dsh-lab/INSTALL-MAP.md` (`scaffold` → `live` / `dep-only`)

## References

- UI + HTTP: `dsh-piblox-secrets`, `dsh-piblox-discord`
- Background jobs (later): outbox tick or harness `ctx.jobs` — not invented here
- Existing pipeline SSOT: `/home/mestryx/WorkSpace/cockpit/projects/emploi/job-radar`
