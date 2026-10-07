# Career review agent

The `career-review` preset is the dedicated DSH session for reviewing Job
Researcher offers. It receives a bounded profile, learning summary and at most
five offers through the scoped tools registered by `src/career-agent.js`.

The agent keeps deterministic score, Jev score, user feedback, facts and
hypotheses separate. It may read offers and explain scores automatically. It
must not apply, send a message, expose a secret, or change code/scoring rules.

## Commands

The client uses the native DSH command surface: `/new`, `/reset`, `/profile`,
`/offer`, `/compare` and `/context`. `/reset` forks/opens a new native session;
it never rewrites or deletes the previous event log.

## Profile changes

Profile changes use `POST /api/job-researcher/profile-proposals`. Creating a
proposal is non-mutating and returns a diff, proposal id and expected profile
revision. Acceptance requires `confirmed: true` and the expected revision;
stale revisions fail closed. Code, scoring, DSH configuration and secrets are
outside this API.

## Native sidebar

The career review view is registered as a `sidebar.right.pane.tab` through
`sidebarRightTabs`. DSH owns the dock, splitter, responsive behavior and width
persistence. Job Researcher does not create a fixed overlay or a second
transcript store.
