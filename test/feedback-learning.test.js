import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'
import {
  FEEDBACK_SCORE_VERSION,
  FEEDBACK_UI_COPY_FR,
  aggregateLearnedSignals,
  normalizeFeedbackTags,
} from '../src/feedback.js'
import {
  ensureFeedbackLearningSchema,
  openStore,
} from '../src/store.js'

const fixtures = []

function createV3ShapedDb({ withLegacyNotes = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jr-fb-'))
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
      application_status TEXT NOT NULL DEFAULT 'NONE',
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
  const systemNote = 'corridor Grenoble (commune montbonnot); métier infra/dev'
  db.prepare(
    `INSERT INTO offers (
      source, external_id, title, employer, location, first_seen_at, last_seen_at,
      interest, score, notes
    ) VALUES ('csp', 'leg-1', 'Admin sys', 'Mairie', 'Isère', ?, ?, 'interested', 3, ?)`,
  ).run(now, now, withLegacyNotes ? systemNote : '')
  db.prepare(
    `INSERT INTO offers (
      source, external_id, title, employer, location, first_seen_at, last_seen_at,
      interest, score, notes
    ) VALUES ('csp', 'real-1', 'Support', 'Co', 'Lyon', ?, ?, 'maybe', 1, ?)`,
  ).run(now, now, 'notes-other')
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (1, 'YES', ?, 1, ?)`,
  ).run(withLegacyNotes ? systemNote : 'user-only', now)
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (2, 'MAYBE', 'vrai commentaire utilisateur', 1, ?)`,
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

describe('feedback learning (Node)', () => {
  it('migration disentangles legacy comment==notes and preserves real comments', () => {
    const dir = createV3ShapedDb()
    const store = openStore(dir)
    const meta = store.schemaMeta()
    assert.equal(meta.version, '4')
    assert.ok(meta.feedback_learning_schema_at)
    assert.equal(meta.application_schema_at, '2026-09-16T00:00:00Z')

    const legacy = store.getOffer(1)
    assert.equal(legacy.user_comment, '')
    assert.equal(
      legacy.system_reason,
      'corridor Grenoble (commune montbonnot); métier infra/dev',
    )
    assert.equal(legacy.feedback_origin, 'legacy')
    assert.equal(legacy.user_decision, 'YES')

    const real = store.getOffer(2)
    assert.equal(real.user_comment, 'vrai commentaire utilisateur')
    assert.equal(real.system_reason, '')
    assert.equal(real.feedback_origin, '')

    // idempotent
    store.close()
    const store2 = openStore(dir)
    assert.equal(store2.getOffer(1).user_comment, '')
    assert.equal(store2.getOffer(2).user_comment, 'vrai commentaire utilisateur')
    store2.close()
  })

  it('manual feedback sets user provenance + tags; invalid tags rejected', () => {
    const dir = createV3ShapedDb()
    const store = openStore(dir)
    const offer = store.setUserFeedback(2, {
      comment: 'trop de support',
      tags: ['support_bad', 'needs_details'],
    })
    assert.equal(offer.feedback_origin, 'user')
    assert.deepEqual(offer.feedback_tags, ['needs_details', 'support_bad'])
    assert.equal(offer.user_comment, 'trop de support')
    assert.equal(offer.application_status, 'NONE')
    assert.ok(offer.feedback_updated_at)

    assert.throws(
      () => store.setUserFeedback(2, { tags: ['not_a_real_tag'] }),
      /invalid feedback_tag/,
    )
    store.close()
  })

  it('application remains independent of feedback write', () => {
    const dir = createV3ShapedDb()
    const store = openStore(dir)
    store.setApplication(1, 'APPLIED', { now: new Date('2026-09-16T10:00:00Z') })
    store.setUserFeedback(1, { comment: 'ok', tags: ['location_good'] })
    const o = store.getOffer(1)
    assert.equal(o.application_status, 'APPLIED')
    assert.equal(o.applied_local_day, '2026-09-16')
    assert.equal(o.feedback_origin, 'user')
    store.close()
  })

  it('learning ignores legacy rows; threshold=2 activates; reversible', () => {
    const dir = createV3ShapedDb()
    const store = openStore(dir)
    // offer 1 is legacy after migration — must not train
    let summary = store.learningSummary()
    assert.equal(summary.user_feedback_count, 0)
    assert.equal(summary.active_signals.length, 0)
    assert.equal(summary.version, FEEDBACK_SCORE_VERSION)

    store.setUserFeedback(2, { tags: ['too_far'] })
    summary = store.learningSummary()
    assert.equal(summary.user_feedback_count, 1)
    assert.equal(summary.active_signals.length, 0)
    assert.equal(summary.pending_signals.length, 1)
    assert.equal(summary.pending_signals[0].tag, 'too_far')

    // need a second user confirmation — add offer 3
    const db = store.dbPath
    // use store API: insert via raw then set feedback — open another offer
    store.close()
    const raw = new DatabaseSync(join(dir, 'radar.db'))
    raw.prepare(
      `INSERT INTO offers (
        source, external_id, title, employer, location, first_seen_at, last_seen_at, interest, notes
      ) VALUES ('ft', 'x3', 'Far', 'Co', 'Vienne', '2026-09-15T10:00:00Z', '2026-09-15T10:00:00Z', 'unset', '')`,
    ).run()
    raw.close()
    const store2 = openStore(dir)
    store2.setUserFeedback(3, { tags: ['too_far'] })
    summary = store2.learningSummary()
    assert.equal(summary.user_feedback_count, 2)
    assert.equal(summary.active_signals.length, 1)
    assert.equal(summary.active_signals[0].tag, 'too_far')
    assert.equal(summary.active_signals[0].delta, -1)

    // reverse: clear tags on both
    store2.setUserFeedback(2, { tags: [] })
    store2.setUserFeedback(3, { tags: [] })
    summary = store2.learningSummary()
    assert.equal(summary.active_signals.length, 0)
    store2.close()
  })

  it('REV-01: user feedback comment survives reopen when mirrored in notes', () => {
    const dir = createV3ShapedDb({ withLegacyNotes: false })
    const store = openStore(dir)
    const comment = 'commentaire operateur unique REV-01'
    store.setUserFeedback(2, {
      comment,
      tags: ['needs_details'],
      decision: 'MAYBE',
    })
    const afterWrite = store.getOffer(2)
    assert.equal(afterWrite.user_comment, comment)
    assert.equal(afterWrite.feedback_origin, 'user')
    assert.equal(afterWrite.notes, comment)
    store.close()

    const store2 = openStore(dir)
    assert.equal(store2.getOffer(2).user_comment, comment)
    assert.equal(store2.getOffer(2).feedback_origin, 'user')
    store2.close()

    const store3 = openStore(dir)
    assert.equal(store3.getOffer(2).user_comment, comment)
    assert.equal(store3.getOffer(2).system_reason, '')
    store3.close()
  })

  it('aggregate caps and pure tag validation', () => {
    assert.throws(() => normalizeFeedbackTags(['nope']), /invalid feedback_tag/)
    const agg = aggregateLearnedSignals([
      { feedback_origin: 'legacy', feedback_tags_json: '["too_far"]' },
      { feedback_origin: 'user', feedback_tags_json: '["dev_infra_good"]' },
      { feedback_origin: 'user', tags: ['dev_infra_good', 'location_good'] },
    ])
    assert.equal(agg.user_feedback_count, 2)
    assert.equal(agg.active_signals.find((s) => s.tag === 'dev_infra_good').count, 2)
    assert.ok(agg.pending_signals.find((s) => s.tag === 'location_good'))
    assert.equal(FEEDBACK_UI_COPY_FR.whyHeading, 'Pourquoi ce choix ?')
  })

  it('production-shaped disposable clone disentangles legacy notes (if present)', () => {
    const prod = join(
      process.env.DSH_HOME || join(homedir(), 'dsh-lab', 'runtime', 'dsh-home'),
      'job-researcher',
      'radar.db',
    )
    if (!existsSync(prod)) {
      // Environment without lab DB — fixture path already covers semantics.
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'jr-prodclone-'))
    fixtures.push(dir)
    const clone = join(dir, 'radar.db')
    copyFileSync(prod, clone)
    const db = new DatabaseSync(clone)
    ensureFeedbackLearningSchema(db)
    // REV-01: user-origin rows may keep comment==notes (mirror). Only legacy/empty
    // origin matches must be cleared by disentangle.
    const leftoverLegacy = db
      .prepare(
        `
        SELECT COUNT(*) AS n FROM offer_feedback f
        JOIN offers o ON o.id = f.offer_id
        WHERE COALESCE(f.comment, '') != ''
          AND f.comment = COALESCE(o.notes, '')
          AND (COALESCE(f.feedback_origin, '') = '' OR f.feedback_origin = 'legacy')
      `,
      )
      .get().n
    assert.equal(leftoverLegacy, 0, 'no remaining legacy comment==notes after disentangle')
    const ver = db.prepare(`SELECT value FROM schema_meta WHERE key='version'`).get().value
    assert.equal(ver, '4')
    // clone only — never write prod
    db.close()
  })
})
