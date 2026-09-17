import { spawn } from 'node:child_process'
import { existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ensureDataDir,
  resolveVenvPython,
  resolvePythonSrc,
  resolveDbPath,
  SECRET_KEYS,
} from './paths.js'
import { normalizeSourceList, sourcesNeedFt } from './config.js'

const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000

/**
 * Minimal subprocess env — no process.env spread (Secrets Boundary v1.1).
 * FT credentials are materialized only when enabled sources need FT.
 *
 * @param {{ materialize: Function, hasKey?: Function }} secretsService
 * @param {string} dataDir
 * @param {{ sources?: string[]|string, config?: object }} [options]
 * @returns {{ env: Record<string, string>, secretStatus: Record<string, string> }}
 */
export function buildChildEnv(secretsService, dataDir, { sources, config } = {}) {
  if (!secretsService || typeof secretsService.materialize !== 'function') {
    throw new Error(
      'job-researcher: required Cordis secrets service unavailable (inject dsh-piblox-secrets)',
    )
  }

  const enabled =
    Array.isArray(sources) && sources.length === 0
      ? []
      : normalizeSourceList(sources)
  const needFt = sourcesNeedFt(enabled)

  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    LANG: process.env.LANG || 'C.UTF-8',
    DSH_HOME: process.env.DSH_HOME || '',
    JOB_RESEARCHER_DATA_DIR: dataDir,
    DB_PATH: resolveDbPath(dataDir),
    PYTHONPATH: resolvePythonSrc(),
    JR_ENABLED_SOURCES: enabled.join(','),
  }

  if (config != null) {
    env.JR_SEARCH_CONFIG_JSON = JSON.stringify(config)
  }

  const secretStatus = {}

  if (needFt) {
    const result = secretsService.materialize([...SECRET_KEYS], env)
    const applied = result?.applied || []
    const missing = SECRET_KEYS.filter((k) => !applied.includes(k))

    if (!result?.ok || missing.length) {
      throw new Error(
        `job-researcher: required FT secrets unavailable (${missing.join(', ') || 'materialize failed'}). ` +
          'Add FT_CLIENT_ID and FT_CLIENT_SECRET in Settings → Secrets, then retry',
      )
    }
    for (const k of SECRET_KEYS) {
      secretStatus[k] = 'materialized'
    }
  } else {
    for (const k of SECRET_KEYS) {
      try {
        if (typeof secretsService.hasKey === 'function') {
          secretStatus[k] = secretsService.hasKey(k) ? 'present' : 'missing'
        } else {
          secretStatus[k] = 'skipped'
        }
      } catch {
        secretStatus[k] = 'skipped'
      }
    }
  }

  return { env, secretStatus }
}

/**
 * Spawn plugin-owned Python pipeline. Single implementation for scheduler + Run now.
 *
 * @param {object} opts
 * @param {string} opts.dataDir
 * @param {Record<string, string>} opts.env
 * @param {string} [opts.triggerType]
 * @param {string[]|string} [opts.sources]
 * @param {number} [opts.timeoutMs]
 * @param {{ error?: Function }} [opts.logger]
 */
export function runPipelineProcess({
  dataDir,
  env,
  triggerType = 'manual',
  sources = 'csp-filtre,et,ft',
  rescoreOnly = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger,
}) {
  const dir = ensureDataDir(dataDir)
  const python = resolveVenvPython(dir)
  if (!existsSync(python)) {
    return Promise.reject(new Error(`python venv missing at ${python} — run scripts/setup-venv.sh`))
  }
  const script = join(resolvePythonSrc(), 'job_radar', 'dsh_pipeline.py')
  const sourceList = Array.isArray(sources)
    ? sources
    : String(sources)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  const triageOnly =
    Boolean(rescoreOnly) ||
    triggerType === 'rescore' ||
    (Array.isArray(sources) && sources.length === 0)
  const args = [script, '--trigger', triggerType]
  if (triageOnly) {
    args.push('--rescore-only')
  } else {
    args.push('--sources', sourceList.join(',') || 'csp-filtre,et,ft')
  }
  const logPath = join(dir, 'logs', 'pipeline.log')

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer = null

    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn(arg)
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }, 5_000)
        finish(reject, new Error(`pipeline_timeout: exceeded ${timeoutMs}ms`))
      }, timeoutMs)
    }

    child.stdout.on('data', (b) => {
      stdout += b.toString()
    })
    child.stderr.on('data', (b) => {
      stderr += b.toString()
    })
    child.on('error', (err) => finish(reject, err))
    child.on('close', (code) => {
      try {
        appendFileSync(
          logPath,
          `\n--- ${new Date().toISOString()} trigger=${triggerType} code=${code}\n${stdout}\n${stderr}\n`,
        )
      } catch {
        /* ignore log errors */
      }
      if (code !== 0) {
        logger?.error?.(`pipeline exit ${code}: ${stderr.slice(0, 500)}`)
        finish(reject, new Error(`pipeline_exit_${code}: ${stderr.slice(0, 800)}`))
        return
      }
      try {
        const jsonStart = stdout.indexOf('{')
        const parsed = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout)
        finish(resolve, parsed)
      } catch (err) {
        finish(
          reject,
          new Error(`pipeline_parse_error: ${err.message}; stdout=${stdout.slice(0, 400)}`),
        )
      }
    })
  })
}
