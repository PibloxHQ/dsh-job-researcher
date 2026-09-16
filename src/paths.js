import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

export const PLUGIN_ID = 'dsh-job-researcher'
export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Resolve DSH_HOME the same way as dsh-piblox-secrets (env > lab default). */
export function resolveDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return join(homedir(), 'dsh-lab', 'runtime', 'dsh-home')
}

export function resolveDataDir(override) {
  if (override) return override
  if (process.env.JOB_RESEARCHER_DATA_DIR) return process.env.JOB_RESEARCHER_DATA_DIR
  return join(resolveDshHome(), 'job-researcher')
}

export function resolveDbPath(dataDir) {
  return join(dataDir || resolveDataDir(), 'radar.db')
}

export function resolveVenvPython(dataDir) {
  return join(dataDir || resolveDataDir(), '.venv', 'bin', 'python')
}

export function resolvePythonSrc() {
  return join(PLUGIN_ROOT, 'runtime', 'python', 'src')
}

export function ensureDataDir(dataDir) {
  const dir = dataDir || resolveDataDir()
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'cache'), { recursive: true })
  mkdirSync(join(dir, 'logs'), { recursive: true })
  return dir
}

/** Secret vault key names — never log values. */
export const SECRET_KEYS = ['FT_CLIENT_ID', 'FT_CLIENT_SECRET']

/** Default schedule: same cadence as Hermes cron (UTC). */
export const DEFAULT_CRON = '0 12 * * *'
