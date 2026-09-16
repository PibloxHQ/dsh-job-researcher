/**
 * dsh-job-researcher — Host Cordis entry (full migration runtime).
 */
import { existsSync } from 'node:fs'
import {
  PLUGIN_ID,
  ensureDataDir,
  resolveDataDir,
  resolveDbPath,
  resolveVenvPython,
  DEFAULT_CRON,
} from './paths.js'
import { openStore } from './store.js'
import { startScheduler } from './scheduler.js'
import { registerHttpRoutes } from './http.js'

export const name = PLUGIN_ID
export const inject = []

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const dataDir = ensureDataDir(config.dataDir || resolveDataDir())
  const cronExpr = String(config.cron || DEFAULT_CRON)
  const scheduleEnabled = config.scheduleEnabled !== false

  let store = null
  const getStore = () => {
    if (!store) store = openStore(dataDir)
    return store
  }

  const secrets = ctx.get?.('secrets') || ctx.secrets || null

  let scheduler = null
  const getScheduler = () => scheduler

  try {
    if (existsSync(resolveDbPath(dataDir))) {
      store = openStore(dataDir)
    }
  } catch (err) {
    ctx.logger?.warn?.(`${PLUGIN_ID}: store open deferred: ${err?.message || err}`)
  }

  scheduler = startScheduler(ctx, {
    getStore,
    dataDir,
    secrets,
    cronExpr,
    enabled: scheduleEnabled,
  })

  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer?.register) return
    registerHttpRoutes(webCtx.webServer, { getStore, getScheduler, secrets })
    webCtx.logger?.info?.(`${PLUGIN_ID}: HTTP API registered under /api/job-researcher`)
  })

  ctx.provide?.('jobResearcher', {
    dataDir,
    dbPath: resolveDbPath(dataDir),
    venvPython: resolveVenvPython(dataDir),
    runNow: () => scheduler.fire('manual'),
    getStatus: () => scheduler.getStatus(),
  })

  ctx.logger?.info?.(
    `${PLUGIN_ID}: apply dataDir=${dataDir} cron=${cronExpr} schedule=${scheduleEnabled}`,
  )

  ctx.on?.('dispose', () => {
    try {
      store?.close?.()
    } catch {
      /* ignore */
    }
    try {
      scheduler?.dispose?.()
    } catch {
      /* ignore */
    }
  })
}
