# Offer lifecycle and retention

Job Researcher separates source freshness from user history. An offer is never
deleted merely because one API call is empty or fails.

## Normalized dates

- `published_at`: source publication/creation date when provided;
- `updated_at`: source last-update date when provided;
- `expires_at`: explicit source expiry when provided;
- `first_seen_at` / `last_seen_at`: dates observed by this installation.

France Travail dates are read from `dateCreation` and `dateActualisation`.
Employment Territorial and CSP dates are populated when their source payload
exposes a parseable publication date.

## Lifecycle

`active` is the only status shown by default. A successful complete sync is
reconciled per source scope:

1. seen offers become `active` and reset their missing counter;
2. absent on one complete sync become `missing`;
3. absent on two consecutive complete syncs become `retired`;
4. date-backed offers whose publication/update freshness exceeds 30 days become
   `stale`.

`missing`, `retired`, and `stale` remain in SQLite so feedback, decisions and
   audit history are not destroyed. They are hidden from the normal offer list.

The reconciliation is never run after a failed source request and is scoped to
the exact source query (department/profiles/filter path), so a partial search
cannot retire unrelated offers.

## Why 30 days

France Travail documents a maximum 30-day publication period for the standard
employer-managed offer, with extensions possible. Therefore the implementation
uses 30 days as a freshness heuristic, preferring `updated_at` over the original
publication date. Sources without a trustworthy date are handled by successful
absence reconciliation instead of guessed age.
