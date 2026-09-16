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

/**
 * Build child env with secrets materialized into an explicit object (never process.env).
 * @param {object|null} secretsService ctx.secrets
 */
export async function buildChildEnv(secretsService, dataDir) {
  const env = {
    ...process.env,
    DSH_HOME: process.env.DSH_HOME || '',
    JOB_RESEARCHER_DATA_DIR: dataDir,
    DB_PATH: resolveDbPath(dataDir),
    PYTHONPATH: resolvePythonSrc(),
  }
  // Clear any inherited FT secrets so vault is SSOT when present
  delete env.FT_CLIENT_ID
  delete env.FT_CLIENT_SECRET

  if (!secretsService?.resolve) {
    return { env, secretStatus: Object.fromEntries(SECRET_KEYS.map((k) => [k, 'unavailable'])) }
  }

  const secretStatus = {}
  for (const key of SECRET_KEYS) {
    try {
      const r = secretsService.resolve(key)
      if (r?.ok && r.value) {
        env[key] = r.value
        secretStatus[key] = 'resolved'
      } else {
        secretStatus[key] = 'missing'
      }
    } catch {
      secretStatus[key] = 'error'
    }
  }
  return { env, secretStatus }
}

/**
 * Spawn plugin-owned Python pipeline. Single implementation for scheduler + Run now.
 */
export function runPipelineProcess({
  dataDir,
  env,
  triggerType = 'manual',
  sources = 'csp-filtre,et,ft',
  logger,
}) {
  const dir = ensureDataDir(dataDir)
  const python = resolveVenvPython(dir)
  if (!existsSync(python)) {
    return Promise.reject(new Error(`python venv missing at ${python} — run scripts/setup-venv.sh`))
  }
  const script = join(resolvePythonSrc(), 'job_radar', 'dsh_pipeline.py')
  const args = [script, '--trigger', triggerType, '--sources', sources]
  const logPath = join(dir, 'logs', 'pipeline.log')

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (b) => {
      stdout += b.toString()
    })
    child.stderr.on('data', (b) => {
      stderr += b.toString()
    })
    child.on('error', reject)
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
        reject(new Error(`pipeline_exit_${code}: ${stderr.slice(0, 800)}`))
        return
      }
      try {
        const jsonStart = stdout.indexOf('{')
        const parsed = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout)
        resolve(parsed)
      } catch (err) {
        reject(new Error(`pipeline_parse_error: ${err.message}; stdout=${stdout.slice(0, 400)}`))
      }
    })
  })
}
