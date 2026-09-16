import { cronMatches, nextCronUtc } from './cron.js'
import { DEFAULT_CRON } from './paths.js'
import { buildChildEnv, runPipelineProcess } from './pipeline.js'

/**
 * Plugin-owned wall-clock scheduler.
 * DSH has no native cron — poll every 30s and fire once per matching UTC minute.
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

  async function fire(triggerType) {
    if (running) {
      return { ok: false, code: 'already_running' }
    }
    const store = getStore()
    if (store?.hasRunningJob?.()) {
      return { ok: false, code: 'db_run_in_progress' }
    }
    running = true
    lastError = null
    try {
      const { env, secretStatus } = await buildChildEnv(secrets, dataDir)
      ctx.logger?.info?.(
        `dsh-job-researcher: pipeline start trigger=${triggerType} secrets=${JSON.stringify(secretStatus)}`,
      )
      const result = await runPipelineProcess({
        dataDir,
        env,
        triggerType,
        logger: ctx.logger,
      })
      lastResult = { ...result, secretStatus, at: new Date().toISOString() }
      ctx.logger?.info?.(
        `dsh-job-researcher: pipeline done status=${result.status} run_id=${result.run_id} new=${result.offers_new}`,
      )
      return { ok: true, result: lastResult }
    } catch (err) {
      lastError = String(err?.message || err)
      ctx.logger?.error?.(`dsh-job-researcher: pipeline failed: ${lastError}`)
      return { ok: false, code: 'pipeline_error', error: lastError }
    } finally {
      running = false
    }
  }

  function tick() {
    if (!enabled) return
    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)
    if (!cronMatches(cronExpr, now)) return
    if (minuteKey === lastFiredMinute) return
    lastFiredMinute = minuteKey
    void fire('scheduled')
  }

  // Cordis disposal-aware interval when available; else setInterval.
  let dispose = null
  if (typeof ctx.interval === 'function') {
    dispose = ctx.interval(() => tick(), 30_000)
  } else {
    const id = setInterval(() => tick(), 30_000)
    dispose = () => clearInterval(id)
    ctx.on?.('dispose', dispose)
  }

  return {
    fire,
    dispose,
    getStatus() {
      return {
        enabled,
        cron: cronExpr,
        timezone: 'UTC',
        next_run_at: nextCronUtc(cronExpr),
        running,
        last_result: lastResult,
        last_error: lastError,
        last_fired_minute: lastFiredMinute || null,
      }
    },
  }
}
