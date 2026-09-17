import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, it } from 'node:test'
import { registerHttpRoutes } from '../src/http.js'
import { openStore } from '../src/store.js'

const fixtures = []

function createFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'jr-api-'))
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
     VALUES ('csp', 'x1', 'Role', 'Acme', 'Paris', ?, ?, 'interested', 2)`,
  ).run(now, now)
  db.prepare(
    `INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
     VALUES (1, 'YES', '', 1, ?)`,
  ).run(now)
  db.close()
  return dir
}

function mockWebServer() {
  const routes = []
  return {
    routes,
    register(def) {
      routes.push(def)
    },
  }
}

function findRoute(server, path, kind = 'exact') {
  return server.routes.find((r) => r.path === path && r.kind === kind)
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v
    },
    end(s) {
      this.body = JSON.parse(s)
    },
  }
}

async function* bodyStream(obj) {
  yield Buffer.from(JSON.stringify(obj))
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

describe('HTTP application API', () => {
  it('PATCH application records APPLIED; decision path stays separate; bad ids 404', async () => {
    const dir = createFixtureDir()
    const store = openStore(dir)
    const server = mockWebServer()
    registerHttpRoutes(server, {
      getStore: () => store,
      getScheduler: () => null,
      secrets: { hasKey: () => false },
    })

    // DSH webServer: one route per path (no method key) — no duplicate registrations
    const offerPaths = server.routes.filter((r) => r.path.includes('/offers'))
    assert.equal(
      offerPaths.length,
      new Set(offerPaths.map((r) => `${r.kind}:${r.path}`)).size,
      'duplicate offer routes would break DSH webServer',
    )

    const statusRoute = findRoute(server, '/api/job-researcher/status')
    const resStatus = mockRes()
    await statusRoute.handler({ method: 'GET' }, resStatus)
    assert.equal(resStatus.statusCode, 200)
    assert.equal(resStatus.body.daily_applications.timezone, 'Europe/Paris')
    assert.equal(resStatus.body.daily_applications.target, 1)
    assert.equal(resStatus.body.daily_applications.count, 0)
    assert.ok(resStatus.body.readiness)

    const offers = findRoute(server, '/api/job-researcher/offers', 'prefix')

    const resBad2 = mockRes()
    await offers.handler(
      Object.assign(bodyStream({ status: 'APPLIED' }), {
        method: 'PATCH',
        url: '/api/job-researcher/offers/abc/application',
      }),
      resBad2,
    )
    assert.equal(resBad2.statusCode, 404)

    const resMissing = mockRes()
    await offers.handler(
      Object.assign(bodyStream({ status: 'APPLIED' }), {
        method: 'PATCH',
        url: '/api/job-researcher/offers/999/application',
      }),
      resMissing,
    )
    assert.equal(resMissing.statusCode, 404)

    const resInvalid = mockRes()
    await offers.handler(
      Object.assign(bodyStream({ status: 'DONE' }), {
        method: 'PATCH',
        url: '/api/job-researcher/offers/1/application',
      }),
      resInvalid,
    )
    assert.equal(resInvalid.statusCode, 400)

    const resOk = mockRes()
    await offers.handler(
      Object.assign(bodyStream({ status: 'APPLIED' }), {
        method: 'PATCH',
        url: '/api/job-researcher/offers/1/application',
      }),
      resOk,
    )
    assert.equal(resOk.statusCode, 200)
    assert.equal(resOk.body.offer.application_status, 'APPLIED')
    assert.equal(resOk.body.offer.user_decision, 'YES')
    assert.ok(resOk.body.daily_applications.count >= 1)

    // YES decision must not clear or invent application state incorrectly via interest alone
    const resDec = mockRes()
    await offers.handler(
      Object.assign(bodyStream({ decision: 'MAYBE', comment: 'hmm' }), {
        method: 'PATCH',
        url: '/api/job-researcher/offers/1/decision',
      }),
      resDec,
    )
    assert.equal(resDec.statusCode, 200)
    assert.equal(resDec.body.offer.user_decision, 'MAYBE')
    assert.equal(resDec.body.offer.application_status, 'APPLIED')

    const resGet = mockRes()
    await offers.handler(
      { method: 'GET', url: '/api/job-researcher/offers/1' },
      resGet,
    )
    assert.equal(resGet.statusCode, 200)
    assert.equal(resGet.body.offer.application_status, 'APPLIED')

    const resGet404 = mockRes()
    await offers.handler(
      { method: 'GET', url: '/api/job-researcher/offers/0' },
      resGet404,
    )
    assert.equal(resGet404.statusCode, 404)

    const list = findRoute(server, '/api/job-researcher/offers')
    const resList = mockRes()
    await list.handler(
      { method: 'GET', url: '/api/job-researcher/offers?application=APPLIED' },
      resList,
    )
    assert.equal(resList.statusCode, 200)
    assert.equal(resList.body.total, 1)

    store.close()
  })
})
