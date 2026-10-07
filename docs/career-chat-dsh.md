# DSH integration notes

The host plugin mounts the career tools only when the agent preset is
`career-review`. The dynamic prompt contains `career-manifest.v1`, including
the database locator, profile revision/hash, API authorities, bounded read
roots and an empty write-path list. A path is a locator, never a permission.

The source of truth remains the Job Researcher SQLite/API boundary. DSH owns
the conversation journal, session lifecycle, native command dispatch and right
sidebar layout.

Runtime proof for the current branch:

- source commit: `4ec3972`
- Node tests: 70 passed
- `node --check src/client/index.js`: passed
- Web API after restart: `status=ready`, 4,210 offers, Jev ranking available
- profile composition dump contains `preset-career-review` / `career-review`

The local Web process is currently launched manually on `127.0.0.1:3080`; the
user service `dsh-web.service` is inactive, so the health script reports the
supervision gap separately from the successful HTTP probe.
