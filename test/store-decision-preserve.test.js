import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'
import { openStore } from '../src/store.js'

const fixtures = []

function createFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'jr-decision-preserve-'))
  fixtures.push(dir)
  const db = new DatabaseSync(join(dir, 'radar.db'))
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
    CREATE TABLE source_state (source TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      trigger_type TEXT NOT NULL
    );
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO schema_meta VALUES ('version', '2');
  `)
  const now = '2026-09-15T10:00:00Z'
  db.prepare(
    `INSERT INTO offers (source, external_id, title, employer, location, first_seen_at, last_seen_at, interest, score)
     VALUES ('csp', 'preserve-1', 'Dev preserve', 'Co', 'Grenoble', ?, ?, 'interested', 2)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (1, 'YES', 'keep-me', 1, ?)`,
  ).run(now)
  db.close()
  return dir
}

afterEach(() => {
  while (fixtures.length) {
    try {
      rmSync(fixtures.pop(), { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('setDecision comment preserve contract', () => {
  it('omitting comment preserves existing comment; null clears; string sets', () => {
    const dir = createFixtureDir()
    const store = openStore(dir)

    let offer = store.getOffer(1)
    assert.equal(offer.user_comment, 'keep-me')

    offer = store.setDecision(1, 'NO', undefined)
    assert.equal(offer.user_decision, 'NO')
    assert.equal(offer.user_comment, 'keep-me', 'undefined comment must preserve')

    offer = store.setDecision(1, 'MAYBE', null)
    assert.equal(offer.user_decision, 'MAYBE')
    assert.equal(offer.user_comment, '', 'null comment must clear')

    offer = store.setDecision(1, 'YES', 'fresh note')
    assert.equal(offer.user_comment, 'fresh note')

    store.close()
  })
})
