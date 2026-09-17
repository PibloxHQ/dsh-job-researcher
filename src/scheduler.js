import { existsSync } from 'node:fs'
import { resolveDbPath, DEFAULT_CRON } from './paths.js'
import { DEFAULT_SOURCES, normalizeSourceList, defaultSearchConfig } from './config.js'
import { buildChildEnv, runPipelineProcess } from './pipeline.js'
import { cronMatches, nextCronUtc } from './cron.js'

/**
 * Plugin-owned wall-clock scheduler with durable next_due_at (P3.2).
 * DSH has no native cron — poll every 30s; persist due time across restarts.
 *
 * fire() awaits the pipeline (tests). enqueue() returns 202-style immediately.
 */
export function startScheduler(ctx, {
  getStore,
  dataDir,
  secrets,
  cronExpr = DEFAULT_CRON,
  enabled = true,
}) {
  let running = false
  let lastFiredMinute = ''
  let lastResult = null
  let lastError = null
  let lastTrigger = null

  try {
    if (existsSync(resolveDbPath(dataDir))) {
      const store = getStore()
      store?.reconcileStaleRuns?.()
      ensureNextDue(store, resolveCron(store, cronExpr))
    }
  } catch {
    /* DB may be missing before bootstrap */
  }

  function resolveCron(store, fallback) {
    try {
      const cfg = store?.getSearchConfig?.()?.config
      if (cfg?.schedule?.cron) return String(cfg.schedule.cron)
      if (cfg?.schedule?.enabled === false) return null
    } catch {
      /* ignore */
    }
    return fallback || DEFAULT_CRON
  }

  function scheduleEnabled(store) {
    try {
      const cfg = store?.getSearchConfig?.()?.config
      if (cfg?.schedule?.enabled === false) return false
    } catch {
      /* ignore */
    }
    return enabled
  }

  function ensureNextDue(store, cron) {
    if (!store || !cron || typeof store.setMeta !== 'function') {
      // Fallback: write via raw schema_meta if helpers exist
      try {
        const due = nextCronUtc(cron)
        store?.setNextDueAt?.(due)
        return due
      } catch {
        return null
      }
    }
    const due = nextCronUtc(cron)
    store.setNextDueAt(due)
    return due
  }

  function readNextDue(store) {
    try {
      return store?.getNextDueAt?.() || null
    } catch {
      return null
    }
  }

  function resolveSources(opts = {}) {
    if (Array.isArray(opts.sources) && opts.sources.length === 0) return []
    if (opts.sources != null) return normalizeSourceList(opts.sources)
    if (opts.config?.sources?.enabled) {
      return normalizeSourceList(opts.config.sources.enabled)
    }
    try {
      if (existsSync(resolveDbPath(dataDir))) {
        const cfg = getStore()?.getSearchConfig?.()
        if (cfg?.config?.sources?.enabled) {
          return normalizeSourceList(cfg.config.sources.enabled)
        }
      }
    } catch {
      /* ignore */
    }
    return [...DEFAULT_SOURCES]
  }

  function resolveConfig(opts = {}) {
    if (opts.config) return opts.config
    try {
      if (existsSync(resolveDbPath(dataDir))) {
        return getStore()?.getSearchConfig?.()?.config || defaultSearchConfig()
      }
    } catch {
      /* ignore */
    }
    return defaultSearchConfig()
  }

  async function runWork(triggerType, opts = {}) {
    lastError = null
    lastTrigger = triggerType
    let runRow = null
    let store = null
    try {
      if (!existsSync(resolveDbPath(dataDir))) {
        return { ok: false, code: 'needs_bootstrap' }
      }

      store = getStore()
      if (store?.hasRunningJob?.()) {
        return { ok: false, code: 'db_run_in_progress' }
      }

      const sources = resolveSources(opts)
      const config = resolveConfig(opts)

      if (typeof store?.claimRun === 'function') {
        runRow = store.claimRun({
          triggerType,
          sources,
          configSnapshot: config,
        })
      }

      const { env, secretStatus } = buildChildEnv(secrets, dataDir, {
        sources,
        config,
      })
      ctx.logger?.info?.(
        `dsh-job-researcher: pipeline start trigger=${triggerType} sources=${sources.join(',')} secrets=${JSON.stringify(secretStatus)}`,
      )
      const result = await runPipelineProcess({
        dataDir,
        env,
        triggerType,
        sources,
        logger: ctx.logger,
      })
      lastResult = {
        ...result,
        secretStatus,
        sources,
        at: new Date().toISOString(),
        run_id: result.run_id ?? runRow?.id ?? null,
      }
      if (runRow?.id && store?.updateRun) {
        store.updateRun(runRow.id, {
          status:
            result.status === 'ok' || result.status === 'succeeded'
              ? 'succeeded'
              : result.status || 'succeeded',
          finished_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          offers_seen: result.offers_seen ?? 0,
          offers_new: result.offers_new ?? 0,
          offers_updated: result.offers_updated ?? 0,
          offers_failed: result.offers_failed ?? 0,
        })
      }
      // Advance durable schedule after successful scheduled work
      if (triggerType === 'scheduled') {
        const cron = resolveCron(store, cronExpr)
        if (cron) ensureNextDue(store, cron)
      }
      ctx.logger?.info?.(
        `dsh-job-researcher: pipeline done status=${result.status} run_id=${result.run_id} new=${result.offers_new}`,
      )
      return { ok: true, result: lastResult }
    } catch (err) {
      lastError = String(err?.message || err)
      ctx.logger?.error?.(`dsh-job-researcher: pipeline failed: ${lastError}`)
      try {
        if (runRow?.id && existsSync(resolveDbPath(dataDir))) {
          getStore()?.updateRun?.(runRow.id, {
            status: 'failed',
            finished_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
            error_summary: lastError.slice(0, 800),
          })
        }
      } catch {
        /* ignore */
      }
      return { ok: false, code: 'pipeline_error', error: lastError }
    }
  }

  /** Awaitable — used by tests and callers that need the result. */
  async function fire(triggerType, opts = {}) {
    if (running) {
      return { ok: false, code: 'already_running' }
    }
    if (!existsSync(resolveDbPath(dataDir))) {
      return { ok: false, code: 'needs_bootstrap' }
    }
    try {
      const store = getStore()
      if (store?.hasRunningJob?.()) {
        return { ok: false, code: 'db_run_in_progress' }
      }
    } catch {
      return { ok: false, code: 'needs_bootstrap' }
    }

    running = true
    try {
      return await runWork(triggerType, opts)
    } finally {
      running = false
    }
  }

  /**
   * HTTP 202 path: accept immediately, run in background.
   * Clears `running` in finally of the background work.
   */
  function enqueue(triggerType, opts = {}) {
    if (running) {
      return { ok: false, code: 'already_running', accepted: false }
    }
    if (!existsSync(resolveDbPath(dataDir))) {
      return { ok: false, code: 'needs_bootstrap', accepted: false }
    }
    try {
      const store = getStore()
      if (store?.hasRunningJob?.()) {
        return { ok: false, code: 'db_run_in_progress', accepted: false }
      }
    } catch {
      return { ok: false, code: 'needs_bootstrap', accepted: false }
    }

    running = true
    lastTrigger = triggerType
    void (async () => {
      try {
        await runWork(triggerType, opts)
      } finally {
        running = false
      }
    })()

    return {
      ok: true,
      accepted: true,
      trigger_type: triggerType,
    }
  }

  function tick() {
    let store = null
    try {
      if (!existsSync(resolveDbPath(dataDir))) return
      store = getStore()
    } catch {
      return
    }
    if (!scheduleEnabled(store)) return

    const cron = resolveCron(store, cronExpr)
    if (!cron) return

    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)

    // Durable catch-up: if next_due_at is in the past, fire once (bounded)
    const dueIso = readNextDue(store)
    let dueCatchUp = false
    if (dueIso) {
      const dueMs = Date.parse(dueIso)
      if (Number.isFinite(dueMs) && dueMs <= now.getTime()) {
        dueCatchUp = true
      }
    }

    const cronHit = cronMatches(cron, now)
    if (!cronHit && !dueCatchUp) return
    if (minuteKey === lastFiredMinute) return
    lastFiredMinute = minuteKey
    void enqueue('scheduled')
  }

  // Cordis disposal-aware interval when timer is injected; else setInterval.
  // Do not probe ctx.interval without inject=['timer'] — Cordis throws on get.
  let dispose = null
  try {
    dispose = ctx.interval(() => tick(), 30_000)
  } catch {
    const id = setInterval(() => tick(), 30_000)
    dispose = () => clearInterval(id)
    ctx.on?.('dispose', dispose)
  }

  return {
    fire,
    enqueue,
    dispose,
    getStatus() {
      let store = null
      let nextDue = null
      let cron = cronExpr
      try {
        if (existsSync(resolveDbPath(dataDir))) {
          store = getStore()
          cron = resolveCron(store, cronExpr) || cronExpr
          nextDue = readNextDue(store) || nextCronUtc(cron)
        }
      } catch {
        nextDue = nextCronUtc(cronExpr)
      }
      return {
        enabled: scheduleEnabled(store),
        cron,
        timezone: 'UTC',
        next_run_at: nextDue || nextCronUtc(cron),
        next_due_at: nextDue,
        running,
        last_result: lastResult,
        last_error: lastError,
        last_fired_minute: lastFiredMinute || null,
        last_trigger: lastTrigger,
        pipeline_running: running,
        can_accept_run: !running,
      }
    },
  }
}
