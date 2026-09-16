import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolveDbPath, ensureDataDir } from './paths.js'

const DECISIONS = new Set(['UNREVIEWED', 'YES', 'NO', 'MAYBE'])

export function openStore(dataDir) {
  const dir = ensureDataDir(dataDir)
  const dbPath = resolveDbPath(dir)
  if (!existsSync(dbPath)) {
    throw new Error(`job-researcher db missing: ${dbPath} — run migrate first`)
  }
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')

  return {
    dbPath,
    close() {
      db.close()
    },

    stats() {
      const total = db.prepare('SELECT COUNT(*) AS n FROM offers').get().n
      const bySource = Object.fromEntries(
        db.prepare('SELECT source, COUNT(*) AS n FROM offers GROUP BY source').all()
          .map((r) => [r.source, r.n]),
      )
      const byDecision = Object.fromEntries(
        db.prepare('SELECT decision, COUNT(*) AS n FROM offer_feedback GROUP BY decision').all()
          .map((r) => [r.decision, r.n]),
      )
      return { total, bySource, byDecision }
    },

    listOffers(filters = {}) {
      const {
        q = '',
        source = '',
        decision = '',
        remote = '',
        minScore = null,
        limit = 50,
        offset = 0,
        sort = 'score_desc',
      } = filters
      const clauses = []
      const params = []
      if (q) {
        clauses.push('(o.title LIKE ? OR o.employer LIKE ? OR o.location LIKE ? OR o.description LIKE ?)')
        const like = `%${q}%`
        params.push(like, like, like, like)
      }
      if (source) {
        clauses.push('o.source = ?')
        params.push(source)
      }
      if (decision) {
        clauses.push("COALESCE(f.decision, 'UNREVIEWED') = ?")
        params.push(decision)
      }
      if (remote) {
        clauses.push('o.remote = ?')
        params.push(remote)
      }
      if (minScore != null && minScore !== '') {
        clauses.push('o.score >= ?')
        params.push(Number(minScore))
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      let order = 'o.score DESC NULLS LAST, o.last_seen_at DESC'
      if (sort === 'seen_desc') order = 'o.last_seen_at DESC'
      if (sort === 'title') order = 'o.title ASC'
      // SQLite lacks NULLS LAST — emulate
      if (sort === 'score_desc') order = 'CASE WHEN o.score IS NULL THEN 1 ELSE 0 END, o.score DESC, o.last_seen_at DESC'

      const countSql = `
        SELECT COUNT(*) AS n
        FROM offers o
        LEFT JOIN offer_feedback f ON f.offer_id = o.id
        ${where}
      `
      const total = db.prepare(countSql).get(...params).n
      const sql = `
        SELECT o.*,
          COALESCE(f.decision, 'UNREVIEWED') AS user_decision,
          COALESCE(f.comment, '') AS user_comment,
          COALESCE(f.viewed, 0) AS viewed,
          f.decision_updated_at
        FROM offers o
        LEFT JOIN offer_feedback f ON f.offer_id = o.id
        ${where}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `
      const rows = db.prepare(sql).all(...params, Number(limit), Number(offset))
      return { total, limit: Number(limit), offset: Number(offset), rows }
    },

    getOffer(id) {
      return db.prepare(`
        SELECT o.*,
          COALESCE(f.decision, 'UNREVIEWED') AS user_decision,
          COALESCE(f.comment, '') AS user_comment,
          COALESCE(f.viewed, 0) AS viewed,
          f.decision_updated_at
        FROM offers o
        LEFT JOIN offer_feedback f ON f.offer_id = o.id
        WHERE o.id = ?
      `).get(Number(id))
    },

    setDecision(id, decision, comment) {
      if (!DECISIONS.has(decision)) throw new Error(`invalid decision: ${decision}`)
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
      const offer = db.prepare('SELECT id, interest FROM offers WHERE id = ?').get(Number(id))
      if (!offer) throw new Error('not_found')
      const interestMap = {
        YES: 'interested',
        NO: 'skip',
        MAYBE: 'maybe',
        UNREVIEWED: 'unset',
      }
      db.prepare(`
        INSERT INTO offer_feedback (offer_id, decision, comment, viewed, decision_updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(offer_id) DO UPDATE SET
          decision=excluded.decision,
          comment=excluded.comment,
          viewed=1,
          decision_updated_at=excluded.decision_updated_at
      `).run(Number(id), decision, comment ?? '', now)
      db.prepare('UPDATE offers SET interest = ?, notes = COALESCE(?, notes) WHERE id = ?')
        .run(interestMap[decision], comment ?? null, Number(id))
      return this.getOffer(id)
    },

    sourceState() {
      return db.prepare('SELECT * FROM source_state ORDER BY source').all()
    },

    latestRun() {
      return db.prepare('SELECT * FROM job_runs ORDER BY id DESC LIMIT 1').get()
    },

    listRuns(limit = 20) {
      return db.prepare('SELECT * FROM job_runs ORDER BY id DESC LIMIT ?').all(Number(limit))
    },

    hasRunningJob() {
      const row = db.prepare(`
        SELECT id FROM job_runs
        WHERE status = 'running'
          AND started_at > datetime('now', '-2 hours')
        ORDER BY id DESC LIMIT 1
      `).get()
      return row || null
    },
  }
}
