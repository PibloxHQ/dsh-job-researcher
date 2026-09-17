/**
 * Honest readiness model (AUT-04). Never equate FT secrets present with "live".
 */

import { existsSync } from 'node:fs'
import { FEEDBACK_SCORE_VERSION } from './feedback.js'
import { SECRET_KEYS, resolveDbPath, resolveVenvPython } from './paths.js'
import { DEFAULT_SOURCES, sourcesNeedFt } from './config.js'

export const READINESS_STATES = Object.freeze([
  'needs_setup',
  'installing',
  'ready',
  'running',
  'degraded',
  'blocked',
])

/**
 * @param {object} input
 * @returns {{ readiness: string, can_run: boolean, can_run_public: boolean, steps: object, sources: object, message: string }}
 */
export function computeReadiness({
  dbExists = false,
  venvExists = false,
  schemaOk = false,
  configValid = false,
  secretStatus = {},
  enabledSources = DEFAULT_SOURCES,
  sourceState = [],
  stats = null,
  scoreCoverage = null,
  scheduleRunning = false,
  bootstrapRunning = false,
  latestRun = null,
} = {}) {
  const steps = {
    config: configValid ? 'ok' : 'missing',
    database: dbExists ? (schemaOk ? 'ok' : 'migrate') : 'missing',
    venv: venvExists ? 'ok' : 'missing',
    secrets_ft: SECRET_KEYS.every((k) => secretStatus[k] === 'present')
      ? 'ok'
      : 'missing',
  }

  const enabled = [...enabledSources]
  const needFt = sourcesNeedFt(enabled)
  const ftSecretsOk = steps.secrets_ft === 'ok'

  const bySource = {}
  for (const s of enabled) {
    const row = sourceState.find((r) => r.source === s || r.source === aliasSource(s))
    const entry = {
      enabled: true,
      secrets: s === 'ft' ? (ftSecretsOk ? 'ok' : 'missing') : 'n/a',
      last_success_at: row?.last_success_at || null,
      last_error: row?.last_error || '',
      status: 'ready',
    }
    if (s === 'ft' && !ftSecretsOk) {
      entry.status = 'blocked'
    } else if (row?.last_error) {
      entry.status = 'degraded'
    } else if (!row?.last_success_at && !latestRun) {
      entry.status = 'never_run'
    }
    bySource[s] = entry
  }

  const publicSources = enabled.filter((s) => s !== 'ft')
  const setupComplete =
    steps.config === 'ok' &&
    steps.database === 'ok' &&
    steps.venv === 'ok' &&
    (!needFt || ftSecretsOk)

  const can_run_public =
    steps.config === 'ok' &&
    steps.database === 'ok' &&
    steps.venv === 'ok' &&
    publicSources.length > 0

  const can_run = needFt ? setupComplete : can_run_public

  let readiness = 'needs_setup'
  let message = 'Configuration or install incomplete'

  if (bootstrapRunning) {
    readiness = 'installing'
    message = 'Bootstrap in progress'
  } else if (scheduleRunning) {
    readiness = 'running'
    message = 'Pipeline running'
  } else if (!can_run && !can_run_public) {
    readiness = 'needs_setup'
    if (!dbExists) message = 'Database missing — run bootstrap'
    else if (!venvExists) message = 'Python venv missing — run bootstrap'
    else if (!configValid) message = 'Search profile incomplete'
    else if (needFt && !ftSecretsOk) message = 'FT secrets required for enabled sources'
    else message = 'Setup incomplete'
  } else if (needFt && !ftSecretsOk && can_run_public) {
    readiness = 'degraded'
    message = 'FT blocked (secrets) — CSP/ET runnable'
  } else if (
    bySource.ft?.status === 'degraded' ||
    Object.values(bySource).some((s) => s.status === 'degraded')
  ) {
    readiness = 'degraded'
    message = 'One or more sources reported errors'
  } else if (scoreCoverage && scoreCoverage.stale > 0 && scoreCoverage.current === 0) {
    readiness = 'degraded'
    message = `Scoring stale (${scoreCoverage.stale} need ${FEEDBACK_SCORE_VERSION})`
  } else if (can_run || can_run_public) {
    readiness = 'ready'
    message =
      !latestRun && !(stats?.total > 0)
        ? 'Ready — never run (first collection pending)'
        : 'Ready'
  }

  if (
    readiness !== 'installing' &&
    readiness !== 'running' &&
    needFt &&
    !ftSecretsOk &&
    !can_run_public
  ) {
    readiness = 'blocked'
    message = 'Blocked: FT secrets missing and no public sources enabled'
  }

  return {
    readiness,
    can_run,
    can_run_public,
    steps,
    sources: bySource,
    message,
    score_coverage: scoreCoverage,
  }
}

function aliasSource(name) {
  if (name === 'csp-filtre') return 'csp'
  return name
}

export function probeFilesystem(dataDir) {
  return {
    dbExists: existsSync(resolveDbPath(dataDir)),
    venvExists: existsSync(resolveVenvPython(dataDir)),
  }
}

export function scoreCoverageFromDb(db) {
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
    return null
  }
}
