import { existsSync } from 'node:fs'
import { nextCronUtc } from './cron.js'
import {
  DEFAULT_CRON,
  SECRET_KEYS,
  resolveDbPath,
  resolveVenvPython,
  resolvePythonSrc,
} from './paths.js'
import { APPLICATION_STATUSES, APPLICATION_TIMEZONE, parseOfferId } from './store.js'
import { FEEDBACK_TAGS, FEEDBACK_UI_COPY_FR } from './feedback.js'
import {
  SOURCE_IDS,
  DEFAULT_SOURCES,
  defaultSearchConfig,
  validateSearchConfig,
  redactedConfig,
  normalizeSourceList,
  sourcesNeedFt,
} from './config.js'
import { computeReadiness, probeFilesystem } from './readiness.js'
import { runBootstrap } from './bootstrap.js'

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function tryEnqueueRescore(getScheduler) {
  try {
    const sched = typeof getScheduler === 'function' ? getScheduler() : null
    if (!sched || typeof sched.enqueue !== 'function') return { ok: false, skipped: true }
    const kickoff = sched.enqueue('rescore', { sources: [] })
    return kickoff && typeof kickoff === 'object' ? kickoff : { ok: true, accepted: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

function probeSecretStatus(secrets) {
  const secretStatus = {}
  for (const k of SECRET_KEYS) {
    try {
      if (typeof secrets?.hasKey === 'function') {
        secretStatus[k] = secrets.hasKey(k) ? 'present' : 'missing'
      } else {
        const r = secrets?.resolve?.(k)
        secretStatus[k] = r?.ok && r.value ? 'present' : 'missing'
      }
    } catch {
      secretStatus[k] = 'unavailable'
    }
  }
  return secretStatus
}

function methodOf(req) {
  return String(req?.method || 'GET').toUpperCase()
}

/**
 * Soft-register HTTP API. Admin UI is same-origin Settings; no secrets in responses.
 *
 * CRITICAL: DSH webServer keys routes by (kind, path) ONLY — not by HTTP method.
 * Registering GET then PATCH on the same path throws "duplicate route" and aborts
 * the rest of registerHttpRoutes, leaving mutations unmatched → SPA 404.
 * Always dispatch methods inside a single handler per path.
 *
 * Auth: DSH same-origin admin assumed; tests register without auth middleware.
 * Never submits applications externally — only records manual APPLIED marks.
 */
export function registerHttpRoutes(webServer, {
  getStore,
  getScheduler,
  secrets,
  dataDir,
}) {
  const base = '/api/job-researcher'
  let bootstrapRunning = false
  let lastBootstrap = null

  function safeStore() {
    try {
      return getStore()
    } catch {
      return null
    }
  }

  function loadConfigBundle(store) {
    if (!store?.getSearchConfig) {
      const cfg = defaultSearchConfig()
      const v = validateSearchConfig(cfg)
      return {
        config: v.config,
        version: 0,
        valid: v.ok,
        errors: v.errors,
        config_hash: null,
      }
    }
    return store.getSearchConfig()
  }

  async function handleStatus(_req, res) {
    let storeStats = null
    let latest = null
    let sources = []
    let dailyApplications = null
    let learning = null
    let scoreCoverage = null
    let schemaOk = false
    let configBundle = {
      config: defaultSearchConfig(),
      valid: true,
      version: 0,
    }
    try {
      const store = getStore()
      storeStats = store.stats()
      latest = store.latestRun() || null
      sources = store.sourceState()
      dailyApplications = store.dailyApplicationProgress()
      learning = store.learningSummary()
      scoreCoverage = store.scoreCoverage?.() || null
      schemaOk = true
      configBundle = loadConfigBundle(store)
    } catch (err) {
      storeStats = { error: String(err.message || err) }
    }
    const sched = getScheduler()?.getStatus?.() || null
    const secretStatus = probeSecretStatus(secrets)
    const fsProbe = dataDir
      ? probeFilesystem(dataDir)
      : { dbExists: false, venvExists: false }
    const enabledSources =
      configBundle.config?.sources?.enabled || [...DEFAULT_SOURCES]
    const readiness = computeReadiness({
      dbExists: fsProbe.dbExists,
      venvExists: fsProbe.venvExists,
      schemaOk,
      configValid: configBundle.valid !== false,
      secretStatus,
      enabledSources,
      sourceState: sources,
      stats: storeStats?.error ? null : storeStats,
      scoreCoverage,
      scheduleRunning: Boolean(sched?.running),
      bootstrapRunning,
      latestRun: latest,
    })
    sendJson(res, 200, {
      ok: true,
      plugin: 'dsh-job-researcher',
      status: readiness.readiness,
      readiness: readiness.readiness,
      can_run: readiness.can_run,
      can_run_public: readiness.can_run_public,
      message: readiness.message,
      steps: readiness.steps,
      source_readiness: readiness.sources,
      score_coverage: readiness.score_coverage,
      schedule: sched,
      secrets: secretStatus,
      secrets_required: SECRET_KEYS,
      secrets_service: secrets ? 'cordis:secrets' : 'missing',
      stats: storeStats,
      daily_applications: dailyApplications || {
        timezone: APPLICATION_TIMEZONE,
        day: null,
        count: 0,
        target: 1,
        met: false,
      },
      learning: learning || null,
      feedback_tags: FEEDBACK_TAGS.map((t) => ({
        id: t.id,
        label_fr: t.labelFr,
        label_en: t.labelEn,
        actionable: t.actionable,
      })),
      latest_run: latest,
      sources,
      config_revision: configBundle.version ?? 0,
      notifications: { backend: 'dsh-piblox-discord', status: 'disabled_lab_profile' },
    })
  }

  async function handleConfig(req, res) {
    const method = methodOf(req)
    if (method === 'GET') {
      try {
        const store = safeStore()
        const bundle = loadConfigBundle(store)
        return sendJson(res, 200, {
          ok: true,
          config: redactedConfig(bundle.config),
          version: bundle.version,
          valid: bundle.valid,
          errors: bundle.errors || [],
          config_hash: bundle.config_hash,
        })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    }
    if (method === 'PUT') {
      try {
        const store = getStore()
        const body = await readJson(req)
        const input = body.config ?? body
        const expected =
          body.expected_revision ?? body.expectedRevision ?? input.revision
        const saved = store.saveSearchConfig(input, {
          expectedRevision: expected,
        })
        return sendJson(res, 200, {
          ok: true,
          config: redactedConfig(saved.config),
          version: saved.version,
          config_hash: saved.config_hash,
        })
      } catch (err) {
        if (err.code === 'revision_mismatch') {
          return sendJson(res, 409, {
            ok: false,
            error: 'revision_mismatch',
            current: err.current
              ? {
                  version: err.current.version,
                  config: redactedConfig(err.current.config),
                }
              : undefined,
          })
        }
        if (err.code === 'invalid_config') {
          return sendJson(res, 400, {
            ok: false,
            error: 'invalid_config',
            errors: err.errors || [],
          })
        }
        const msg = String(err.message || err)
        const status = msg.includes('db missing') ? 503 : 500
        return sendJson(res, status, { ok: false, error: msg })
      }
    }
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
  }

  async function handleConfigValidate(req, res) {
    if (methodOf(req) !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    try {
      const body = await readJson(req)
      const input = body.config ?? body
      const store = safeStore()
      const baseCfg = store?.getSearchConfig?.()?.config || defaultSearchConfig()
      const result = validateSearchConfig(input, { base: baseCfg })
      sendJson(res, result.ok ? 200 : 400, {
        ok: result.ok,
        config: result.ok ? redactedConfig(result.config) : undefined,
        errors: result.errors,
      })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: String(err.message || err) })
    }
  }

  async function handleDiagnostics(_req, res) {
    const secretStatus = probeSecretStatus(secrets)
    const fsProbe = dataDir
      ? probeFilesystem(dataDir)
      : { dbExists: false, venvExists: false }
    let schemaVersion = null
    let configValid = false
    let enabledSources = [...DEFAULT_SOURCES]
    try {
      const store = getStore()
      const meta = store.schemaMeta?.() || {}
      schemaVersion = meta.version || null
      const bundle = loadConfigBundle(store)
      configValid = bundle.valid !== false
      enabledSources = bundle.config?.sources?.enabled || enabledSources
    } catch {
      /* missing db */
    }
    sendJson(res, 200, {
      ok: true,
      python_src: existsSync(resolvePythonSrc()),
      venv: fsProbe.venvExists,
      venv_path: dataDir ? resolveVenvPython(dataDir) : null,
      database: fsProbe.dbExists,
      db_path: dataDir ? resolveDbPath(dataDir) : null,
      schema_version: schemaVersion,
      config_valid: configValid,
      secrets: secretStatus,
      sources: {
        known: [...SOURCE_IDS],
        enabled: enabledSources,
        ft_needed: sourcesNeedFt(enabledSources),
      },
      bootstrap_running: bootstrapRunning,
      last_bootstrap: lastBootstrap,
    })
  }

  async function handleBootstrap(req, res) {
    if (methodOf(req) !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    if (!dataDir) {
      return sendJson(res, 503, { ok: false, error: 'data_dir_unavailable' })
    }
    if (bootstrapRunning) {
      return sendJson(res, 409, { ok: false, code: 'bootstrap_running' })
    }
    bootstrapRunning = true
    sendJson(res, 202, { ok: true, accepted: true })
    void (async () => {
      try {
        lastBootstrap = await runBootstrap(dataDir)
      } catch (err) {
        lastBootstrap = {
          ok: false,
          steps: [],
          error: String(err?.message || err),
        }
      } finally {
        bootstrapRunning = false
      }
    })()
  }

  async function handleSourcesList(_req, res) {
    const secretStatus = probeSecretStatus(secrets)
    let enabled = [...DEFAULT_SOURCES]
    try {
      const bundle = loadConfigBundle(safeStore())
      enabled = bundle.config?.sources?.enabled || enabled
    } catch {
      /* ignore */
    }
    const list = SOURCE_IDS.map((id) => ({
      id,
      enabled: enabled.includes(id),
      secrets:
        id === 'ft'
          ? SECRET_KEYS.every((k) => secretStatus[k] === 'present')
            ? 'ok'
            : 'missing'
          : 'n/a',
    }))
    sendJson(res, 200, { ok: true, sources: list, secrets: secretStatus })
  }

  async function handleSourcesPrefix(req, res) {
    if (methodOf(req) !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.replace(`${base}/sources/`, '').split('/')
    const id = parts[0]
    const action = parts[1]
    if (!SOURCE_IDS.includes(id) || action !== 'test') {
      return sendJson(res, 404, { ok: false, error: 'not_found' })
    }
    sendJson(res, 200, {
      ok: true,
      skipped: true,
      source: id,
      message: 'smoke test stub — connector probe not implemented in this slice',
    })
  }

  async function handleLearning(_req, res) {
    try {
      const summary = getStore().learningSummary()
      sendJson(res, 200, {
        ok: true,
        ...summary,
        tags: FEEDBACK_TAGS.map((t) => ({
          id: t.id,
          label_fr: t.labelFr,
          label_en: t.labelEn,
          actionable: t.actionable,
          delta: t.delta,
        })),
        ui_copy_fr: FEEDBACK_UI_COPY_FR,
      })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err.message || err) })
    }
  }

  async function handleOffersList(req, res) {
    if (methodOf(req) !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      const store = getStore()
      const result = store.listOffers({
        q: url.searchParams.get('q') || '',
        source: url.searchParams.get('source') || '',
        decision: url.searchParams.get('decision') || '',
        application: url.searchParams.get('application') || '',
        remote: url.searchParams.get('remote') || '',
        minScore: url.searchParams.get('minScore'),
        limit: url.searchParams.get('limit') || 50,
        offset: url.searchParams.get('offset') || 0,
        sort: url.searchParams.get('sort') || 'score_desc',
      })
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err.message || err) })
    }
  }

  async function handleOffersPrefix(req, res) {
    const method = methodOf(req)
    const url = new URL(req.url, 'http://localhost')
    const parts = url.pathname.replace(`${base}/offers/`, '').split('/').filter(Boolean)
    const id = parseOfferId(parts[0])
    if (id == null) {
      return sendJson(res, 404, { ok: false, error: 'not_found' })
    }

    if (method === 'GET') {
      try {
        const offer = getStore().getOffer(id)
        if (!offer) return sendJson(res, 404, { ok: false, error: 'not_found' })
        return sendJson(res, 200, { offer })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    }

    if (method === 'PATCH') {
      try {
        const action = parts[1]
        if (action === 'decision') {
          const body = await readJson(req)
          const tags =
            body.tags !== undefined
              ? body.tags
              : body.feedback_tags !== undefined
                ? body.feedback_tags
                : undefined
          // Omit comment when absent so store preserves existing text (UX journey).
          const comment =
            Object.prototype.hasOwnProperty.call(body, 'comment')
              ? body.comment
              : undefined
          const offer = getStore().setDecision(id, body.decision, comment, { tags })
          const rescore = tryEnqueueRescore(getScheduler)
          return sendJson(res, 200, {
            ok: true,
            offer,
            learning: getStore().learningSummary(),
            rescore,
          })
        }
        if (action === 'feedback') {
          const body = await readJson(req)
          const offer = getStore().setUserFeedback(id, {
            comment: body.comment,
            tags: body.tags ?? body.feedback_tags,
            decision: body.decision,
          })
          const rescore = tryEnqueueRescore(getScheduler)
          return sendJson(res, 200, {
            ok: true,
            offer,
            learning: getStore().learningSummary(),
            rescore,
          })
        }
        if (action === 'application') {
          const body = await readJson(req)
          const status = body.status || body.application_status
          if (!APPLICATION_STATUSES.has(status)) {
            return sendJson(res, 400, {
              ok: false,
              error: `invalid application_status: ${status}`,
            })
          }
          const offer = getStore().setApplication(id, status)
          return sendJson(res, 200, {
            ok: true,
            offer,
            daily_applications: getStore().dailyApplicationProgress(),
          })
        }
        return sendJson(res, 404, { ok: false, error: 'not_found' })
      } catch (err) {
        const status = String(err.message).includes('not_found') ? 404 : 400
        return sendJson(res, status, { ok: false, error: String(err.message || err) })
      }
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
  }

  async function handleEnqueueRun(req, res) {
    const sched = getScheduler()
    if (!sched) return sendJson(res, 503, { ok: false, error: 'scheduler_unavailable' })
    let body = {}
    try {
      body = await readJson(req)
    } catch {
      body = {}
    }
    const sources =
      body.sources != null ? normalizeSourceList(body.sources) : undefined
    const kickoff =
      typeof sched.enqueue === 'function'
        ? sched.enqueue('manual', { sources })
        : await sched.fire('manual', { sources })
    if (!kickoff.ok && kickoff.code === 'already_running') {
      return sendJson(res, 409, kickoff)
    }
    if (!kickoff.ok && kickoff.code === 'db_run_in_progress') {
      return sendJson(res, 409, kickoff)
    }
    if (!kickoff.ok && kickoff.code === 'needs_bootstrap') {
      return sendJson(res, 503, kickoff)
    }
    sendJson(res, 202, {
      ok: kickoff.ok,
      accepted: kickoff.accepted !== false,
      ...kickoff,
      next_run_at: nextCronUtc(DEFAULT_CRON),
    })
  }

  async function handleRunsExact(req, res) {
    const method = methodOf(req)
    if (method === 'GET') {
      try {
        return sendJson(res, 200, { runs: getStore().listRuns(30) })
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    }
    if (method === 'POST') {
      return handleEnqueueRun(req, res)
    }
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
  }

  async function handleRunAlias(req, res) {
    if (methodOf(req) !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    return handleEnqueueRun(req, res)
  }

  async function handleRunsPrefix(req, res) {
    if (methodOf(req) !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      const idRaw = url.pathname.replace(`${base}/runs/`, '').split('/')[0]
      const id = Number(idRaw)
      if (!Number.isInteger(id) || id <= 0) {
        return sendJson(res, 404, { ok: false, error: 'not_found' })
      }
      const run = getStore().getRun?.(id) || null
      if (!run) return sendJson(res, 404, { ok: false, error: 'not_found' })
      sendJson(res, 200, { ok: true, run })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err.message || err) })
    }
  }

  async function handleRescore(req, res) {
    if (methodOf(req) !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    }
    const sched = getScheduler()
    if (!sched) return sendJson(res, 503, { ok: false, error: 'scheduler_unavailable' })
    const kickoff =
      typeof sched.enqueue === 'function'
        ? sched.enqueue('rescore', { sources: [] })
        : { ok: true, accepted: true }
    if (!kickoff.ok && (kickoff.code === 'already_running' || kickoff.code === 'db_run_in_progress')) {
      return sendJson(res, 409, kickoff)
    }
    sendJson(res, 202, {
      ok: true,
      accepted: true,
      ...kickoff,
    })
  }

  // One registration per path — method dispatch inside handlers (see file header).
  // Prefix paths MUST NOT end with `/`: DSH match is `p` or `p/<rest>`; a trailing
  // slash makes `p/` require `p//…` and every `/offers/123` falls through to SPA 404.
  webServer.register({ kind: 'exact', path: `${base}/status`, handler: handleStatus })
  webServer.register({ kind: 'exact', path: `${base}/config`, handler: handleConfig })
  webServer.register({
    kind: 'exact',
    path: `${base}/config/validate`,
    handler: handleConfigValidate,
  })
  webServer.register({
    kind: 'exact',
    path: `${base}/diagnostics`,
    handler: handleDiagnostics,
  })
  webServer.register({ kind: 'exact', path: `${base}/bootstrap`, handler: handleBootstrap })
  webServer.register({ kind: 'exact', path: `${base}/sources`, handler: handleSourcesList })
  webServer.register({
    kind: 'prefix',
    path: `${base}/sources`,
    handler: handleSourcesPrefix,
  })
  webServer.register({ kind: 'exact', path: `${base}/learning`, handler: handleLearning })
  webServer.register({ kind: 'exact', path: `${base}/offers`, handler: handleOffersList })
  webServer.register({ kind: 'prefix', path: `${base}/offers`, handler: handleOffersPrefix })
  webServer.register({ kind: 'exact', path: `${base}/runs`, handler: handleRunsExact })
  webServer.register({ kind: 'exact', path: `${base}/run`, handler: handleRunAlias })
  webServer.register({ kind: 'prefix', path: `${base}/runs`, handler: handleRunsPrefix })
  webServer.register({ kind: 'exact', path: `${base}/rescore`, handler: handleRescore })
}
