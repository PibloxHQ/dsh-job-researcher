import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolveDbPath, ensureDataDir } from './paths.js'
import {
  FEEDBACK_SCORE_VERSION,
  aggregateLearnedSignals,
  normalizeFeedbackTags,
  parseFeedbackTagsJson,
  serializeFeedbackTags,
} from './feedback.js'
import {
  defaultSearchConfig,
  validateSearchConfig,
  configHash,
} from './config.js'
import { nextCronUtc } from './cron.js'

const RUN_LEASE_MS = 2 * 3600 * 1000

function computeNextDue(cron) {
  try {
    return nextCronUtc(cron)
  } catch {
    return null
  }
}

/** Minimal SCHEMA_V2 essentials for Node-first empty DB (bootstrap). */
const EMPTY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS offers (
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
CREATE TABLE IF NOT EXISTS offer_feedback (
  offer_id INTEGER PRIMARY KEY,
  decision TEXT NOT NULL DEFAULT 'UNREVIEWED',
  comment TEXT DEFAULT '',
  viewed INTEGER NOT NULL DEFAULT 0,
  decision_updated_at TEXT,
  FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT DEFAULT '',
  offers_seen INTEGER DEFAULT 0,
  offers_new INTEGER DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS job_runs (
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
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const DECISIONS = new Set(['UNREVIEWED', 'YES', 'NO', 'MAYBE'])

/** Application workflow — separate from interest YES/MAYBE/NO.
 * NONE = no application track yet (default until operator starts prep).
 */
export const APPLICATION_STATUSES = new Set(['NONE', 'TO_PREPARE', 'READY', 'APPLIED'])
export const DAILY_APPLICATION_TARGET = 1
export const APPLICATION_TIMEZONE = 'Europe/Paris'
export { FEEDBACK_SCORE_VERSION }

export function utcIso(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Calendar day YYYY-MM-DD in Europe/Paris. */
export function parisCalendarDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APPLICATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Positive safe integer offer IDs only.
 * Rejects scientific notation (`15e-1`, `1e1`), floats, leading zeros, negatives.
 */
export function parseOfferId(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!/^[1-9]\d*$/.test(s)) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return n
}

const OFFER_SELECT = `
  SELECT o.*,
    COALESCE(f.decision, 'UNREVIEWED') AS user_decision,
    COALESCE(f.comment, '') AS user_comment,
    COALESCE(f.system_reason, '') AS system_reason,
    COALESCE(f.feedback_tags_json, '[]') AS feedback_tags_json,
    COALESCE(f.feedback_origin, '') AS feedback_origin,
    f.feedback_updated_at,
    COALESCE(f.viewed, 0) AS viewed,
    f.decision_updated_at,
    COALESCE(f.application_status, 'NONE') AS application_status,
    f.applied_at,
    f.applied_local_day
  FROM offers o
  LEFT JOIN offer_feedback f ON f.offer_id = o.id
`

function schemaVersionNumber(db) {
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get()
  const n = Number(row?.value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Additive schema v3: application_status / applied_at / applied_local_day.
 * Safe on already-migrated DBs; does not rewrite interest decisions.
 * Default application track is NONE (not TO_PREPARE) until the operator starts prep.
 */
export function ensureApplicationSchema(db, { now = new Date() } = {}) {
  const cols = new Set(
    db.prepare('PRAGMA table_info(offer_feedback)').all().map((r) => r.name),
  )
  if (!cols.has('application_status')) {
    db.exec(
      "ALTER TABLE offer_feedback ADD COLUMN application_status TEXT NOT NULL DEFAULT 'NONE'",
    )
  }
  if (!cols.has('applied_at')) {
    db.exec('ALTER TABLE offer_feedback ADD COLUMN applied_at TEXT')
  }
  if (!cols.has('applied_local_day')) {
    db.exec('ALTER TABLE offer_feedback ADD COLUMN applied_local_day TEXT')
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_feedback_application ON offer_feedback(application_status)',
  )
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_feedback_applied_day ON offer_feedback(applied_local_day)',
  )
  if (schemaVersionNumber(db) < 3) {
    db.prepare(
      "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '3')",
    ).run()
  }
  const already = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'application_schema_at'")
    .get()
  if (!already) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('application_schema_at', ?)",
    ).run(utcIso(now))
  }
  // One-shot: TO_PREPARE was wrongly seeded for unanswered interest. Remap those to NONE.
  const noneDefault = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'application_none_default_at'")
    .get()
  if (!noneDefault) {
    db.prepare(`
      UPDATE offer_feedback
      SET application_status = 'NONE'
      WHERE application_status = 'TO_PREPARE'
        AND (decision IS NULL OR decision = '' OR decision = 'UNREVIEWED')
    `).run()
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('application_none_default_at', ?)",
    ).run(utcIso(now))
  }
}

/**
 * Additive schema v4: feedback provenance + disentangle legacy system notes from comment.
 * Idempotent. Never trains on legacy comment==notes rows (moved to system_reason).
 */
export function ensureFeedbackLearningSchema(db, { now = new Date() } = {}) {
  ensureApplicationSchema(db, { now })
  const cols = new Set(
    db.prepare('PRAGMA table_info(offer_feedback)').all().map((r) => r.name),
  )
  if (!cols.has('system_reason')) {
    db.exec("ALTER TABLE offer_feedback ADD COLUMN system_reason TEXT DEFAULT ''")
  }
  if (!cols.has('feedback_tags_json')) {
    db.exec("ALTER TABLE offer_feedback ADD COLUMN feedback_tags_json TEXT DEFAULT '[]'")
  }
  if (!cols.has('feedback_origin')) {
    db.exec("ALTER TABLE offer_feedback ADD COLUMN feedback_origin TEXT DEFAULT ''")
  }
  if (!cols.has('feedback_updated_at')) {
    db.exec('ALTER TABLE offer_feedback ADD COLUMN feedback_updated_at TEXT')
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_feedback_origin ON offer_feedback(feedback_origin)',
  )

  // One-shot disentangle: only legacy / unmarked rows where comment == offers.notes.
  // Never touch feedback_origin='user' — setDecision/setUserFeedback mirror comment into
  // offers.notes, so a re-open would otherwise wipe real operator comments (REV-01).
  const stamp = utcIso(now)
  const disentangleDone = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'feedback_legacy_disentangle_at'")
    .get()
  if (!disentangleDone) {
    db.prepare(`
      UPDATE offer_feedback AS f
      SET system_reason = CASE
            WHEN COALESCE(f.system_reason, '') = '' THEN f.comment
            ELSE f.system_reason
          END,
          comment = '',
          feedback_origin = 'legacy'
      WHERE COALESCE(f.comment, '') != ''
        AND (COALESCE(f.feedback_origin, '') = '' OR f.feedback_origin = 'legacy')
        AND EXISTS (
          SELECT 1
          FROM offers AS o
          WHERE o.id = f.offer_id
            AND f.comment = COALESCE(o.notes, '')
        )
    `).run()
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('feedback_legacy_disentangle_at', ?)",
    ).run(stamp)
  }

  db.prepare(
    "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '4')",
  ).run()
  const already = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'feedback_learning_schema_at'")
    .get()
  if (!already) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('feedback_learning_schema_at', ?)",
    ).run(stamp)
  }
}

/**
 * Autonomy schema: search_profiles + job_runs lease columns + config meta keys.
 * Idempotent. Call after ensureFeedbackLearningSchema.
 */
export function ensureAutonomySchema(db, { now = new Date() } = {}) {
  ensureFeedbackLearningSchema(db, { now })
  const stamp = utcIso(now)

  db.exec(`
    CREATE TABLE IF NOT EXISTS search_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL,
      config_hash TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_search_profiles_version ON search_profiles(version)',
  )

  const runCols = new Set(
    db.prepare('PRAGMA table_info(job_runs)').all().map((r) => r.name),
  )
  const alterIfMissing = (name, decl) => {
    if (!runCols.has(name)) {
      db.exec(`ALTER TABLE job_runs ADD COLUMN ${name} ${decl}`)
      runCols.add(name)
    }
  }
  alterIfMissing('lease_expires_at', 'TEXT')
  alterIfMissing('heartbeat_at', 'TEXT')
  alterIfMissing('progress_json', "TEXT DEFAULT '{}'")
  alterIfMissing('config_snapshot_json', 'TEXT')
  alterIfMissing('config_hash', 'TEXT')
  alterIfMissing('idempotency_key', 'TEXT')
  alterIfMissing('sources_json', "TEXT DEFAULT '[]'")
  alterIfMissing('offers_seen', 'INTEGER DEFAULT 0')
  alterIfMissing('offers_new', 'INTEGER DEFAULT 0')
  alterIfMissing('offers_updated', 'INTEGER DEFAULT 0')
  alterIfMissing('offers_failed', 'INTEGER DEFAULT 0')
  alterIfMissing('error_summary', "TEXT DEFAULT ''")
  alterIfMissing('notify_status', "TEXT DEFAULT 'skipped'")
  alterIfMissing('finished_at', 'TEXT')

  const meta = (key) =>
    db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(key)
  if (!meta('search_config_json')) {
    const cfg = defaultSearchConfig()
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('search_config_json', ?)",
    ).run(JSON.stringify(cfg))
  }
  if (!meta('search_config_revision')) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('search_config_revision', '0')",
    ).run()
  }
  if (!meta('next_due_at')) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('next_due_at', '')",
    ).run()
  }
  if (!meta('autonomy_schema_at')) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES ('autonomy_schema_at', ?)",
    ).run(stamp)
  }
}

/**
 * Create empty radar.db with SCHEMA_V2 essentials + autonomy tables if missing.
 * Prefer python migrate when available; this is the Node-first bootstrap path.
 */
export function ensureDb(dataDir) {
  const dir = ensureDataDir(dataDir)
  const dbPath = resolveDbPath(dir)
  const created = !existsSync(dbPath)
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(EMPTY_SCHEMA_SQL)
  ensureAutonomySchema(db)
  if (created || !db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get()) {
    db.prepare(
      "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '4')",
    ).run()
  }
  db.close()
  return { dbPath, created }
}

function parseStartedAtMs(iso) {
  if (!iso) return NaN
  const t = Date.parse(String(iso))
  return Number.isFinite(t) ? t : NaN
}

export function openStore(dataDir, { now } = {}) {
  const dir = ensureDataDir(dataDir)
  const dbPath = resolveDbPath(dir)
  if (!existsSync(dbPath)) {
    throw new Error(`job-researcher db missing: ${dbPath} — run migrate first`)
  }
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  ensureAutonomySchema(db, { now: now ? new Date(now) : new Date() })

  function jobRunColumns() {
    return new Set(db.prepare('PRAGMA table_info(job_runs)').all().map((r) => r.name))
  }

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
      const byApplication = Object.fromEntries(
        db
          .prepare(
            'SELECT application_status, COUNT(*) AS n FROM offer_feedback GROUP BY application_status',
          )
          .all()
          .map((r) => [r.application_status, r.n]),
      )
      return { total, bySource, byDecision, byApplication }
    },

    /**
     * Daily manual APPLIED count for Europe/Paris calendar day.
     * Corrections away from APPLIED drop the offer from the count (applied_* cleared).
     */
    dailyApplicationProgress({ now: clock } = {}) {
      const when = clock ? new Date(clock) : new Date()
      const day = parisCalendarDay(when)
      const count = db
        .prepare(
          `
          SELECT COUNT(*) AS n FROM offer_feedback
          WHERE application_status = 'APPLIED'
            AND applied_local_day = ?
        `,
        )
        .get(day).n
      return {
        timezone: APPLICATION_TIMEZONE,
        day,
        count,
        target: DAILY_APPLICATION_TARGET,
        met: count >= DAILY_APPLICATION_TARGET,
      }
    },

    listOffers(filters = {}) {
      const {
        q = '',
        source = '',
        decision = '',
        application = '',
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
      if (application) {
        clauses.push("COALESCE(f.application_status, 'NONE') = ?")
        params.push(application)
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
        ${OFFER_SELECT.replace(/\n/g, '\n        ')}
        ${where}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `
      const rows = db.prepare(sql).all(...params, Number(limit), Number(offset))
      return {
        total,
        limit: Number(limit),
        offset: Number(offset),
        rows: rows.map(decorateOffer),
      }
    },

    getOffer(id) {
      const oid = parseOfferId(id)
      if (oid == null) return null
      const row = db.prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(oid) || null
      return row ? decorateOffer(row) : null
    },

    /**
     * Manual interest + optional user feedback (comment/tags).
     * Sets feedback_origin=user. Never overwrites system_reason.
     * Application columns stay untouched.
     */
    setDecision(id, decision, comment, { tags } = {}) {
      if (!DECISIONS.has(decision)) throw new Error(`invalid decision: ${decision}`)
      const oid = parseOfferId(id)
      if (oid == null) throw new Error('not_found')
      const now = utcIso()
      const offer = db.prepare('SELECT id, interest FROM offers WHERE id = ?').get(oid)
      if (!offer) throw new Error('not_found')
      const existingFb = db
        .prepare('SELECT comment, feedback_tags_json FROM offer_feedback WHERE offer_id = ?')
        .get(oid)
      const existingOffer = db.prepare('SELECT notes FROM offers WHERE id = ?').get(oid)
      const interestMap = {
        YES: 'interested',
        NO: 'skip',
        MAYBE: 'maybe',
        UNREVIEWED: 'unset',
      }
      // UX journey: omit comment → preserve; null → clear; string → set.
      const userComment =
        comment === undefined
          ? String(existingFb?.comment ?? existingOffer?.notes ?? '')
          : comment == null
            ? ''
            : String(comment)
      const tagsJson =
        tags !== undefined
          ? serializeFeedbackTags(tags)
          : (existingFb?.feedback_tags_json || '[]')
      if (tags === undefined) {
        normalizeFeedbackTags(tagsJson)
      }
      db.prepare(`
        INSERT INTO offer_feedback (
          offer_id, decision, comment, viewed, decision_updated_at, application_status,
          feedback_tags_json, feedback_origin, feedback_updated_at, system_reason
        )
        VALUES (?, ?, ?, 1, ?, 'NONE', ?, 'user', ?, '')
        ON CONFLICT(offer_id) DO UPDATE SET
          decision=excluded.decision,
          comment=excluded.comment,
          viewed=1,
          decision_updated_at=excluded.decision_updated_at,
          feedback_tags_json=excluded.feedback_tags_json,
          feedback_origin='user',
          feedback_updated_at=excluded.feedback_updated_at
      `).run(oid, decision, userComment, now, tagsJson, now)
      // Keep offers.notes as a mirror of user free-text only (not system_reason).
      db.prepare('UPDATE offers SET interest = ?, notes = ? WHERE id = ?')
        .run(interestMap[decision], userComment, oid)
      return this.getOffer(oid)
    },

    /**
     * Save structured user feedback without requiring a decision change.
     * If decision omitted, keeps existing decision (or UNREVIEWED on insert).
     */
    setUserFeedback(id, { comment, tags, decision } = {}) {
      const oid = parseOfferId(id)
      if (oid == null) throw new Error('not_found')
      const offer = db.prepare('SELECT id FROM offers WHERE id = ?').get(oid)
      if (!offer) throw new Error('not_found')
      const now = utcIso()
      const existing = db
        .prepare(
          'SELECT decision, comment, feedback_tags_json FROM offer_feedback WHERE offer_id = ?',
        )
        .get(oid)
      const nextDecision =
        decision != null
          ? decision
          : existing?.decision || 'UNREVIEWED'
      if (!DECISIONS.has(nextDecision)) throw new Error(`invalid decision: ${nextDecision}`)
      const userComment =
        comment !== undefined ? String(comment ?? '') : (existing?.comment ?? '')
      const tagsJson =
        tags !== undefined
          ? serializeFeedbackTags(tags)
          : (existing?.feedback_tags_json || '[]')
      // validate existing tags json if reusing
      normalizeFeedbackTags(tagsJson)

      db.prepare(`
        INSERT INTO offer_feedback (
          offer_id, decision, comment, viewed, decision_updated_at, application_status,
          feedback_tags_json, feedback_origin, feedback_updated_at, system_reason
        )
        VALUES (?, ?, ?, 1, ?, 'NONE', ?, 'user', ?, '')
        ON CONFLICT(offer_id) DO UPDATE SET
          decision=excluded.decision,
          comment=excluded.comment,
          viewed=1,
          decision_updated_at=CASE
            WHEN ? IS NOT NULL THEN excluded.decision_updated_at
            ELSE offer_feedback.decision_updated_at
          END,
          feedback_tags_json=excluded.feedback_tags_json,
          feedback_origin='user',
          feedback_updated_at=excluded.feedback_updated_at
      `).run(
        oid,
        nextDecision,
        userComment,
        now,
        tagsJson,
        now,
        decision != null ? 1 : null,
      )

      if (decision != null) {
        const interestMap = {
          YES: 'interested',
          NO: 'skip',
          MAYBE: 'maybe',
          UNREVIEWED: 'unset',
        }
        db.prepare('UPDATE offers SET interest = ?, notes = ? WHERE id = ?').run(
          interestMap[nextDecision],
          userComment,
          oid,
        )
      } else {
        db.prepare('UPDATE offers SET notes = ? WHERE id = ?').run(userComment, oid)
      }
      return this.getOffer(oid)
    },

    learningSummary() {
      const rows = db
        .prepare(
          `
          SELECT feedback_origin, feedback_tags_json, comment, decision
          FROM offer_feedback
          WHERE COALESCE(feedback_origin, '') = 'user'
        `,
        )
        .all()
      return aggregateLearnedSignals(rows)
    },

    /**
     * Manual application workflow only. Never implied by interest / URL / drafts.
     * APPLIED is idempotent: repeat clicks keep the original applied_at / local day.
     * Moving away from APPLIED clears timestamps so the day count does not double-count on re-apply.
     */
    setApplication(id, status, { now: clock } = {}) {
      if (!APPLICATION_STATUSES.has(status)) {
        throw new Error(`invalid application_status: ${status}`)
      }
      const oid = parseOfferId(id)
      if (oid == null) throw new Error('not_found')
      const offer = db.prepare('SELECT id FROM offers WHERE id = ?').get(oid)
      if (!offer) throw new Error('not_found')

      const when = clock ? new Date(clock) : new Date()
      const nowIso = utcIso(when)
      const localDay = parisCalendarDay(when)

      const existing = db
        .prepare(
          'SELECT application_status, applied_at, applied_local_day FROM offer_feedback WHERE offer_id = ?',
        )
        .get(oid)

      if (status === 'APPLIED' && existing?.application_status === 'APPLIED') {
        // Duplicate click: idempotent — do not refresh timestamp or day.
        return this.getOffer(oid)
      }

      let appliedAt = null
      let appliedDay = null
      if (status === 'APPLIED') {
        appliedAt = nowIso
        appliedDay = localDay
      }

      db.prepare(`
        INSERT INTO offer_feedback (
          offer_id, decision, comment, viewed, decision_updated_at,
          application_status, applied_at, applied_local_day
        )
        VALUES (?, 'UNREVIEWED', '', 0, NULL, ?, ?, ?)
        ON CONFLICT(offer_id) DO UPDATE SET
          application_status=excluded.application_status,
          applied_at=excluded.applied_at,
          applied_local_day=excluded.applied_local_day
      `).run(oid, status, appliedAt, appliedDay)

      return this.getOffer(oid)
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
      const cutoff = Date.now() - RUN_LEASE_MS
      const rows = db
        .prepare(
          `SELECT id, started_at, status FROM job_runs
           WHERE status IN ('running', 'queued')
           ORDER BY id DESC LIMIT 20`,
        )
        .all()
      for (const row of rows) {
        const startedMs = parseStartedAtMs(row.started_at)
        if (Number.isFinite(startedMs) && startedMs > cutoff) {
          return row
        }
      }
      return null
    },

    getSearchConfig() {
      const raw = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'search_config_json'")
        .get()?.value
      const revRaw = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'search_config_revision'")
        .get()?.value
      let parsed = null
      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = null
      }
      const { ok, config, errors } = validateSearchConfig(parsed || defaultSearchConfig())
      const revision = Number(revRaw)
      config.revision = Number.isInteger(revision) && revision >= 0 ? revision : 0
      return {
        config,
        version: config.revision,
        valid: ok,
        errors,
        config_hash: configHash(config),
      }
    },

    saveSearchConfig(input, { expectedRevision } = {}) {
      const current = this.getSearchConfig()
      if (
        expectedRevision != null &&
        Number(expectedRevision) !== Number(current.version)
      ) {
        const err = new Error(
          `revision_mismatch: expected ${expectedRevision}, current ${current.version}`,
        )
        err.code = 'revision_mismatch'
        err.current = current
        throw err
      }
      const { ok, config, errors } = validateSearchConfig(input, {
        base: current.config,
      })
      if (!ok) {
        const err = new Error(`invalid_config: ${errors.join('; ')}`)
        err.code = 'invalid_config'
        err.errors = errors
        throw err
      }
      const nextRev = current.version + 1
      config.revision = nextRev
      const hash = configHash(config)
      const json = JSON.stringify(config)
      const stamp = utcIso()

      db.prepare(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('search_config_json', ?)",
      ).run(json)
      db.prepare(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('search_config_revision', ?)",
      ).run(String(nextRev))

      db.prepare('UPDATE search_profiles SET active = 0 WHERE active = 1').run()
      db.prepare(`
        INSERT INTO search_profiles (version, config_hash, config_json, created_at, active)
        VALUES (?, ?, ?, ?, 1)
      `).run(nextRev, hash, json, stamp)

      // Durable schedule: refresh next_due_at when cron changes (P3.2)
      if (config.schedule?.enabled !== false && config.schedule?.cron) {
        this.setNextDueAt(computeNextDue(config.schedule.cron))
      }

      return { config, version: nextRev, config_hash: hash }
    },

    getNextDueAt() {
      const row = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'next_due_at'")
        .get()
      const v = row?.value
      return v && String(v).trim() ? String(v).trim() : null
    },

    setNextDueAt(iso) {
      const value = iso == null ? '' : String(iso)
      db.prepare(
        "INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('next_due_at', ?)",
      ).run(value)
      return value || null
    },

    scoreCoverage() {
      try {
        const total = db.prepare('SELECT COUNT(*) AS n FROM offers').get().n
        const current = db
          .prepare('SELECT COUNT(*) AS n FROM offers WHERE score_version = ?')
          .get(FEEDBACK_SCORE_VERSION).n
        const legacy = db
          .prepare(
            `SELECT COUNT(*) AS n FROM offers
             WHERE score_version IS NULL OR score_version = '' OR score_version = 'legacy-v1'`,
          )
          .get().n
        const other = Math.max(0, total - current - legacy)
        return {
          total,
          current,
          stale: legacy + other,
          version: FEEDBACK_SCORE_VERSION,
        }
      } catch {
        return { total: 0, current: 0, stale: 0, version: FEEDBACK_SCORE_VERSION }
      }
    },

    reconcileStaleRuns({ maxAgeMs = RUN_LEASE_MS } = {}) {
      const cutoff = Date.now() - maxAgeMs
      const rows = db
        .prepare(
          `SELECT id, started_at, status FROM job_runs
           WHERE status IN ('running', 'queued')`,
        )
        .all()
      let n = 0
      const finished = utcIso()
      for (const row of rows) {
        const startedMs = parseStartedAtMs(row.started_at)
        if (!Number.isFinite(startedMs) || startedMs <= cutoff) {
          db.prepare(
            `UPDATE job_runs SET status = 'interrupted', finished_at = ?
             WHERE id = ? AND status IN ('running', 'queued')`,
          ).run(finished, row.id)
          n += 1
        }
      }
      return { interrupted: n }
    },

    claimRun({ triggerType = 'manual', sources = [], configSnapshot = null } = {}) {
      const cols = jobRunColumns()
      const nowIso = utcIso()
      const leaseIso = utcIso(new Date(Date.now() + RUN_LEASE_MS))
      const sourcesJson = JSON.stringify(Array.isArray(sources) ? sources : [])
      const snapJson =
        configSnapshot != null ? JSON.stringify(configSnapshot) : null
      const hash =
        configSnapshot != null ? configHash(configSnapshot) : null

      const info = db
        .prepare(
          `INSERT INTO job_runs (started_at, status, trigger_type, sources_json)
           VALUES (?, 'queued', ?, ?)`,
        )
        .run(nowIso, String(triggerType), sourcesJson)
      const id = Number(info.lastInsertRowid)

      const sets = [`status = 'running'`, `started_at = ?`]
      const params = [nowIso]
      if (cols.has('lease_expires_at')) {
        sets.push('lease_expires_at = ?')
        params.push(leaseIso)
      }
      if (cols.has('heartbeat_at')) {
        sets.push('heartbeat_at = ?')
        params.push(nowIso)
      }
      if (cols.has('config_snapshot_json') && snapJson != null) {
        sets.push('config_snapshot_json = ?')
        params.push(snapJson)
      }
      if (cols.has('config_hash') && hash != null) {
        sets.push('config_hash = ?')
        params.push(hash)
      }
      params.push(id)
      db.prepare(`UPDATE job_runs SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return this.getRun(id)
    },

    updateRun(id, fields = {}) {
      const rid = Number(id)
      if (!Number.isInteger(rid) || rid <= 0) throw new Error('invalid run id')
      const cols = jobRunColumns()
      const allowed = [
        'status',
        'finished_at',
        'offers_seen',
        'offers_new',
        'offers_updated',
        'offers_failed',
        'error_summary',
        'notify_status',
        'lease_expires_at',
        'heartbeat_at',
        'progress_json',
        'config_snapshot_json',
        'config_hash',
        'idempotency_key',
        'sources_json',
      ]
      const sets = []
      const params = []
      for (const key of allowed) {
        if (fields[key] === undefined) continue
        if (!cols.has(key) && !['status', 'finished_at', 'offers_seen', 'offers_new',
          'offers_updated', 'offers_failed', 'error_summary', 'notify_status',
          'sources_json'].includes(key)) {
          continue
        }
        if (!cols.has(key)) continue
        sets.push(`${key} = ?`)
        let val = fields[key]
        if (
          (key === 'progress_json' || key === 'config_snapshot_json' || key === 'sources_json') &&
          val != null &&
          typeof val !== 'string'
        ) {
          val = JSON.stringify(val)
        }
        params.push(val)
      }
      if (!sets.length) return this.getRun(rid)
      params.push(rid)
      db.prepare(`UPDATE job_runs SET ${sets.join(', ')} WHERE id = ?`).run(...params)
      return this.getRun(rid)
    },

    getRun(id) {
      const rid = Number(id)
      if (!Number.isInteger(rid) || rid <= 0) return null
      return db.prepare('SELECT * FROM job_runs WHERE id = ?').get(rid) || null
    },

    /** Test/helper: raw schema_meta */
    schemaMeta() {
      return Object.fromEntries(
        db.prepare('SELECT key, value FROM schema_meta').all().map((r) => [r.key, r.value]),
      )
    },
  }
}

function decorateOffer(row) {
  if (!row) return row
  return {
    ...row,
    feedback_tags: parseFeedbackTagsJson(row.feedback_tags_json),
  }
}
