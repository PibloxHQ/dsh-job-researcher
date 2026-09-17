import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'
import {
  ensureApplicationSchema,
  ensureFeedbackLearningSchema,
  openStore,
  parisCalendarDay,
} from '../src/store.js'

const fixtures = []

function createLegacyFixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), 'jr-store-'))
  fixtures.push(dir)
  const dbPath = join(dir, 'radar.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      employer TEXT DEFAULT '',
      location TEXT DEFAULT '',
      contract_type TEXT DEFAULT '',
      work_time TEXT DEFAULT 'unknown',
      remote TEXT DEFAULT 'unknown',
      url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      rome_codes TEXT DEFAULT '[]',
      raw_json TEXT DEFAULT '{}',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      interest TEXT DEFAULT 'unset',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      score INTEGER,
      score_classification TEXT DEFAULT '',
      score_version TEXT DEFAULT '',
      score_details TEXT DEFAULT '',
      notified_at TEXT,
      UNIQUE(source, external_id)
    );
    CREATE TABLE offer_feedback (
      offer_id INTEGER PRIMARY KEY,
      decision TEXT NOT NULL DEFAULT 'UNREVIEWED',
      comment TEXT DEFAULT '',
      viewed INTEGER NOT NULL DEFAULT 0,
      decision_updated_at TEXT,
      FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
    );
    CREATE TABLE source_state (
      source TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_success_at TEXT,
      last_error TEXT DEFAULT '',
      offers_seen INTEGER DEFAULT 0,
      offers_new INTEGER DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      sources_json TEXT DEFAULT '[]',
      offers_seen INTEGER DEFAULT 0,
      offers_new INTEGER DEFAULT 0,
      offers_updated INTEGER DEFAULT 0,
      offers_failed INTEGER DEFAULT 0,
      error_summary TEXT DEFAULT '',
      notify_status TEXT DEFAULT 'skipped'
    );
    CREATE TABLE schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO schema_meta (key, value) VALUES ('version', '2');
    INSERT INTO schema_meta (key, value) VALUES ('migrated_at', '2026-09-01T00:00:00Z');
  `)
  const now = '2026-09-15T10:00:00Z'
  db.prepare(
    `INSERT INTO offers (
      source, external_id, title, employer, location, first_seen_at, last_seen_at, interest, score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('csp', 'ext-1', 'Dev A', 'Co A', 'Paris', now, now, 'interested', 3)
  db.prepare(
    `INSERT INTO offers (
      source, external_id, title, employer, location, first_seen_at, last_seen_at, interest, score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('ft', 'ext-2', 'Dev B', 'Co B', 'Lyon', now, now, 'maybe', 1)
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (1, 'YES', 'seed-yes', 1, ?)`,
  ).run(now)
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (2, 'MAYBE', 'seed-maybe', 1, ?)`,
  ).run(now)
  db.close()
  return dir
}

afterEach(() => {
  while (fixtures.length) {
    const dir = fixtures.pop()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('store application tracker (fixture db)', () => {
  it('additive migration preserves interest feedback and defaults application to NONE', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    const meta = store.schemaMeta()
    assert.equal(meta.version, '4')
    assert.equal(meta.migrated_at, '2026-09-01T00:00:00Z')
    assert.ok(meta.application_schema_at)
    assert.ok(meta.application_none_default_at)
    assert.ok(meta.feedback_learning_schema_at)

    const a = store.getOffer(1)
    assert.equal(a.user_decision, 'YES')
    assert.equal(a.user_comment, 'seed-yes')
    assert.equal(a.application_status, 'NONE')
    assert.equal(a.applied_at, null)

    const list = store.listOffers({ limit: 10 })
    assert.equal(list.total, 2)
    store.close()
  })

  it('YES interest does not imply APPLIED; manual APPLIED is idempotent', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    const clock = new Date('2026-09-16T10:00:00Z') // afternoon Paris

    store.setDecision(1, 'YES', 'still interested')
    let offer = store.getOffer(1)
    assert.equal(offer.user_decision, 'YES')
    assert.equal(offer.application_status, 'NONE')
    assert.equal(offer.applied_at, null)

    offer = store.setApplication(1, 'APPLIED', { now: clock })
    assert.equal(offer.application_status, 'APPLIED')
    assert.equal(offer.applied_at, '2026-09-16T10:00:00Z')
    assert.equal(offer.applied_local_day, parisCalendarDay(clock))
    assert.equal(offer.user_decision, 'YES')

    const firstAt = offer.applied_at
    const later = new Date('2026-09-16T18:00:00Z')
    offer = store.setApplication(1, 'APPLIED', { now: later })
    assert.equal(offer.applied_at, firstAt, 'duplicate APPLIED must not refresh timestamp')
    assert.equal(offer.applied_local_day, parisCalendarDay(clock))

    const progress = store.dailyApplicationProgress({ now: clock })
    assert.equal(progress.timezone, 'Europe/Paris')
    assert.equal(progress.count, 1)
    assert.equal(progress.target, 1)
    assert.equal(progress.met, true)
    store.close()
  })

  it('remaps legacy TO_PREPARE + UNREVIEWED interest to NONE once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jr-store-none-'))
    fixtures.push(dir)
    const dbPath = join(dir, 'radar.db')
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        employer TEXT DEFAULT '',
        location TEXT DEFAULT '',
        contract_type TEXT DEFAULT '',
        work_time TEXT DEFAULT 'unknown',
        remote TEXT DEFAULT 'unknown',
        url TEXT DEFAULT '',
        description TEXT DEFAULT '',
        rome_codes TEXT DEFAULT '[]',
        raw_json TEXT DEFAULT '{}',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        interest TEXT DEFAULT 'unset',
        notes TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        score INTEGER,
        score_classification TEXT DEFAULT '',
        score_version TEXT DEFAULT '',
        score_details TEXT DEFAULT '',
        notified_at TEXT,
        UNIQUE(source, external_id)
      );
      CREATE TABLE offer_feedback (
        offer_id INTEGER PRIMARY KEY,
        decision TEXT NOT NULL DEFAULT 'UNREVIEWED',
        comment TEXT DEFAULT '',
        viewed INTEGER NOT NULL DEFAULT 0,
        decision_updated_at TEXT,
        application_status TEXT NOT NULL DEFAULT 'TO_PREPARE',
        applied_at TEXT,
        applied_local_day TEXT,
        FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
      );
      CREATE TABLE source_state (source TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE job_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        trigger_type TEXT NOT NULL
      );
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('version', '3');
      INSERT INTO schema_meta VALUES ('application_schema_at', '2026-09-16T00:00:00Z');
    `)
    const now = '2026-09-15T10:00:00Z'
    db.prepare(
      `INSERT INTO offers (source, external_id, title, first_seen_at, last_seen_at, score)
       VALUES ('csp', 'u1', 'Unset A', ?, ?, 2)`,
    ).run(now, now)
    db.prepare(
      `INSERT INTO offers (source, external_id, title, first_seen_at, last_seen_at, score)
       VALUES ('csp', 'y1', 'Yes A', ?, ?, 3)`,
    ).run(now, now)
    db.prepare(
      `INSERT INTO offer_feedback (offer_id, decision, application_status)
       VALUES (1, 'UNREVIEWED', 'TO_PREPARE')`,
    ).run()
    db.prepare(
      `INSERT INTO offer_feedback (offer_id, decision, application_status)
       VALUES (2, 'YES', 'TO_PREPARE')`,
    ).run()
    db.close()

    const store = openStore(dir)
    assert.equal(store.getOffer(1).application_status, 'NONE')
    assert.equal(store.getOffer(2).application_status, 'TO_PREPARE')
    assert.ok(store.schemaMeta().application_none_default_at)
    store.close()
  })

  it('correction clears applied day so re-apply does not double-count', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    const day = new Date('2026-09-16T12:00:00Z')

    store.setApplication(1, 'APPLIED', { now: day })
    assert.equal(store.dailyApplicationProgress({ now: day }).count, 1)

    store.setApplication(1, 'READY', { now: day })
    let offer = store.getOffer(1)
    assert.equal(offer.application_status, 'READY')
    assert.equal(offer.applied_at, null)
    assert.equal(offer.applied_local_day, null)
    assert.equal(store.dailyApplicationProgress({ now: day }).count, 0)

    store.setApplication(1, 'APPLIED', { now: day })
    assert.equal(store.dailyApplicationProgress({ now: day }).count, 1)
    store.close()
  })

  it('Europe/Paris local-day boundary: late UTC evening stays previous Paris day', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    // 2026-09-15 22:30 UTC = 2026-09-16 00:30 Paris (CEST, UTC+2)
    const justAfterMidnightParis = new Date('2026-09-15T22:30:00Z')
    // 2026-09-15 21:30 UTC = 2026-09-15 23:30 Paris
    const beforeMidnightParis = new Date('2026-09-15T21:30:00Z')

    store.setApplication(1, 'APPLIED', { now: beforeMidnightParis })
    assert.equal(parisCalendarDay(beforeMidnightParis), '2026-09-15')
    assert.equal(store.dailyApplicationProgress({ now: beforeMidnightParis }).count, 1)
    assert.equal(store.dailyApplicationProgress({ now: justAfterMidnightParis }).count, 0)

    store.setApplication(1, 'TO_PREPARE', { now: justAfterMidnightParis })
    store.setApplication(1, 'APPLIED', { now: justAfterMidnightParis })
    assert.equal(parisCalendarDay(justAfterMidnightParis), '2026-09-16')
    assert.equal(store.dailyApplicationProgress({ now: justAfterMidnightParis }).count, 1)
    assert.equal(store.dailyApplicationProgress({ now: beforeMidnightParis }).count, 0)
    store.close()
  })

  it('rejects bad application status and unknown offer ids', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    assert.throws(() => store.setApplication(1, 'SUBMITTED'), /invalid application_status/)
    assert.throws(() => store.setApplication(99999, 'APPLIED'), /not_found/)
    assert.throws(() => store.setApplication('nope', 'APPLIED'), /not_found/)
    assert.throws(() => store.setApplication('15e-1', 'APPLIED'), /not_found/)
    assert.throws(() => store.setApplication('1e1', 'APPLIED'), /not_found/)
    assert.equal(store.getOffer(99999), null)
    assert.equal(store.getOffer('abc'), null)
    assert.equal(store.getOffer('15e-1'), null)
    assert.equal(store.getOffer('1e1'), null)
    assert.equal(store.getOffer('01'), null)
    assert.ok(store.getOffer(1))
    assert.ok(store.getOffer('1'))
    store.close()
  })

  it('filters by application_status independently of interest', () => {
    const dir = createLegacyFixtureDb()
    const store = openStore(dir)
    store.setApplication(1, 'READY')
    store.setApplication(2, 'APPLIED', { now: new Date('2026-09-16T10:00:00Z') })

    const ready = store.listOffers({ application: 'READY' })
    assert.equal(ready.total, 1)
    assert.equal(ready.rows[0].id, 1)
    assert.equal(ready.rows[0].user_decision, 'YES')

    const yes = store.listOffers({ decision: 'YES' })
    assert.equal(yes.total, 1)
    assert.equal(yes.rows[0].application_status, 'READY')
    store.close()
  })

  it('ensureApplicationSchema is idempotent', () => {
    const dir = createLegacyFixtureDb()
    const dbPath = join(dir, 'radar.db')
    const db = new DatabaseSync(dbPath)
    ensureApplicationSchema(db, { now: new Date('2026-09-16T00:00:00Z') })
    const first = db.prepare("SELECT value FROM schema_meta WHERE key='application_schema_at'").get().value
    ensureApplicationSchema(db, { now: new Date('2026-09-17T00:00:00Z') })
    const second = db.prepare("SELECT value FROM schema_meta WHERE key='application_schema_at'").get().value
    assert.equal(first, second)
    db.close()
  })

  it('ensureFeedbackLearningSchema is idempotent and bumps to v4', () => {
    const dir = createLegacyFixtureDb()
    const dbPath = join(dir, 'radar.db')
    const db = new DatabaseSync(dbPath)
    ensureFeedbackLearningSchema(db, { now: new Date('2026-09-16T00:00:00Z') })
    const first = db
      .prepare("SELECT value FROM schema_meta WHERE key='feedback_learning_schema_at'")
      .get().value
    ensureFeedbackLearningSchema(db, { now: new Date('2026-09-17T00:00:00Z') })
    const second = db
      .prepare("SELECT value FROM schema_meta WHERE key='feedback_learning_schema_at'")
      .get().value
    assert.equal(first, second)
    assert.equal(
      db.prepare("SELECT value FROM schema_meta WHERE key='version'").get().value,
      '4',
    )
    db.close()
  })
})
