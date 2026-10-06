/**
 * dsh-job-researcher — Host Cordis entry (full migration runtime).
 *
 * Hard-injects Cordis `secrets` (provided by dsh-piblox-secrets). Not an npm
 * dependency — the vault plugin must be installed/active on the same profile.
 * FT secrets are NOT required to load the plugin (CSP/ET can run without them).
 */
import { existsSync } from 'node:fs'
import {
  PLUGIN_ID,
  ensureDataDir,
  resolveDataDir,
  resolveDbPath,
  resolveVenvPython,
  DEFAULT_CRON,
  SECRET_KEYS,
} from './paths.js'
import { openStore } from './store.js'
import { startScheduler } from './scheduler.js'
import { registerHttpRoutes } from './http.js'
import { runBootstrap } from './bootstrap.js'
import { buildCareerManifest } from './career-context.js'
import { installCareerAgent, CAREER_AGENT_PRESET } from './career-agent.js'

export const name = PLUGIN_ID
/** Credential plane required — materialize when FT enabled (Secrets Boundary v1.1).
 *  `timer` required for ctx.interval (Cordis); without it apply throws and kills the whole web profile.
 *  `observability` for job lifecycle events (FIX-5). */
export const inject = ['secrets', 'timer', 'observability']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  const dataDir = ensureDataDir(config.dataDir || resolveDataDir())
  const cronExpr = String(config.cron || DEFAULT_CRON)
  const scheduleEnabled = config.scheduleEnabled !== false

  const secrets = ctx.secrets
  if (!secrets || typeof secrets.materialize !== 'function') {
    throw new Error(
      `${PLUGIN_ID}: Cordis secrets service missing — install/activate dsh-piblox-secrets before this plugin`,
    )
  }

  let store = null
  const getStore = () => {
    if (!store) store = openStore(dataDir)
    return store
  }

  let scheduler = null
  const getScheduler = () => scheduler

  try {
    if (existsSync(resolveDbPath(dataDir))) {
      store = openStore(dataDir)
      store?.reconcileStaleRuns?.()
    }
  } catch (err) {
    ctx.logger?.warn?.(`${PLUGIN_ID}: store open deferred: ${err?.message || err}`)
  }

  const ftReady = SECRET_KEYS.every((k) => {
    try {
      if (typeof secrets.hasKey === 'function') return Boolean(secrets.hasKey(k))
      const r = secrets.resolve?.(k)
      return Boolean(r?.ok && r.value)
    } catch {
      return false
    }
  })
  if (!ftReady) {
    ctx.logger?.warn?.(
      `${PLUGIN_ID}: FT_CLIENT_ID / FT_CLIENT_SECRET not in vault; FT source blocked until Settings → Secrets (plugin still loads)`,
    )
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
    let jev
    try {
      jev = ctx.get?.('jev')
    } catch {
      jev = undefined
    }
    registerHttpRoutes(webCtx.webServer, {
      getStore,
      getScheduler,
      secrets,
      dataDir,
      jev,
    })
    webCtx.logger?.info?.(`${PLUGIN_ID}: HTTP API registered under /api/job-researcher`)
  })

  ctx.provide?.('jobResearcher', {
    dataDir,
    dbPath: resolveDbPath(dataDir),
    venvPython: resolveVenvPython(dataDir),
    runNow: () => scheduler.fire('manual'),
    enqueue: (trigger, opts) => scheduler.enqueue(trigger, opts),
    getStatus: () => scheduler.getStatus(),
    bootstrap: (opts) => runBootstrap(dataDir, { logger: ctx.logger, ...opts }),
    getStore,
    careerAgentPreset: CAREER_AGENT_PRESET,
    buildCareerManifest: () => {
      const bundle = getStore()?.getSearchConfig?.() || {}
      return buildCareerManifest({
        dataDir,
        pluginRoot: new URL('.', import.meta.url).pathname.replace(/\/$/, ''),
        profileRevision: bundle.version,
        profileHash: bundle.config_hash,
      })
    },
  })

  // Agent-scoped integration: only the dedicated career-review preset sees
  // the Job Researcher tools and prompt. Other sessions remain unchanged.
  ctx.on?.('agent/created', (payload) => {
    try {
      installCareerAgent(payload?.agent ?? payload, {
        getStore,
        dataDir,
        pluginRoot: new URL('.', import.meta.url).pathname.replace(/\/$/, ''),
        logger: ctx.logger,
      })
    } catch (err) {
      ctx.logger?.warn?.(`${PLUGIN_ID}: career agent mount failed: ${err?.message || err}`)
    }
  })

  ctx.logger?.info?.(
    `${PLUGIN_ID}: apply dataDir=${dataDir} cron=${cronExpr} schedule=${scheduleEnabled} ft_vault=${ftReady ? 'ready' : 'missing'}`,
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
