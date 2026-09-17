/**
 * Idempotent install: data dir, python venv, empty DB.
 * No secrets in logs. Progress reported as {step, status, detail}[].
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import {
  PLUGIN_ROOT,
  ensureDataDir,
  resolveDbPath,
  resolveVenvPython,
} from './paths.js'
import { ensureDb } from './store.js'

function runCmd(command, args, { cwd, env, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env || {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        LANG: process.env.LANG || 'C.UTF-8',
        DSH_HOME: process.env.DSH_HOME || '',
        JOB_RESEARCHER_DATA_DIR: env?.JOB_RESEARCHER_DATA_DIR,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      settled = true
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: stderr + '\n[timeout]',
      })
    }, timeoutMs)
    child.stdout.on('data', (b) => {
      stdout += b.toString()
    })
    child.stderr.on('data', (b) => {
      stderr += b.toString()
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, code: -1, stdout, stderr: String(err.message || err) })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr })
    })
  })
}

async function detectPython3() {
  for (const bin of ['python3.12', 'python3', 'python']) {
    const r = await runCmd(bin, ['--version'], { timeoutMs: 10_000 })
    if (r.ok) return { bin, detail: (r.stdout || r.stderr).trim() }
  }
  return null
}

/**
 * @param {string} dataDir
 * @param {{ logger?: { info?: Function, warn?: Function, error?: Function } }} [opts]
 * @returns {Promise<{ ok: boolean, steps: Array<{step: string, status: string, detail?: string}>, error?: string }>}
 */
export async function runBootstrap(dataDir, { logger } = {}) {
  const steps = []
  const push = (step, status, detail) => {
    steps.push({ step, status, detail })
    logger?.info?.(`dsh-job-researcher bootstrap: ${step}=${status}${detail ? ` ${detail}` : ''}`)
  }

  try {
    const dir = ensureDataDir(dataDir)
    push('data_dir', 'ok', dir)

    const py = await detectPython3()
    if (!py) {
      push('python', 'failed', 'python3 not found on PATH')
      return { ok: false, steps, error: 'python3_missing' }
    }
    push('python', 'ok', `${py.bin} ${py.detail}`)

    const venvPython = resolveVenvPython(dir)
    if (existsSync(venvPython)) {
      push('venv', 'ok', 'already present')
    } else {
      push('venv', 'running', 'creating')
      const setupScript = join(PLUGIN_ROOT, 'scripts', 'setup-venv.sh')
      let venvOk = false
      if (existsSync(setupScript)) {
        const r = await runCmd('bash', [setupScript], {
          cwd: PLUGIN_ROOT,
          env: {
            PATH: process.env.PATH || '',
            HOME: process.env.HOME || '',
            LANG: process.env.LANG || 'C.UTF-8',
            DSH_HOME: process.env.DSH_HOME || '',
            JOB_RESEARCHER_DATA_DIR: dir,
          },
          timeoutMs: 600_000,
        })
        venvOk = r.ok && existsSync(venvPython)
        if (!venvOk) {
          push('venv', 'failed', (r.stderr || r.stdout || '').slice(0, 400))
          return { ok: false, steps, error: 'venv_setup_failed' }
        }
      } else {
        const create = await runCmd(py.bin, ['-m', 'venv', join(dir, '.venv')], {
          timeoutMs: 120_000,
        })
        if (!create.ok) {
          push('venv', 'failed', create.stderr.slice(0, 400))
          return { ok: false, steps, error: 'venv_create_failed' }
        }
        const pip = join(dir, '.venv', 'bin', 'pip')
        const install = await runCmd(pip, ['install', '-e', join(PLUGIN_ROOT, 'runtime', 'python')], {
          timeoutMs: 600_000,
        })
        if (!install.ok || !existsSync(venvPython)) {
          push('venv', 'failed', (install.stderr || '').slice(0, 400))
          return { ok: false, steps, error: 'pip_install_failed' }
        }
      }
      push('venv', 'ok', venvPython)
    }

    const dbPath = resolveDbPath(dir)
    if (existsSync(dbPath)) {
      push('database', 'ok', 'already present')
    } else {
      push('database', 'running', 'creating empty schema')
      // Prefer Node ensureDb (no python migrate required for empty install).
      try {
        const { created } = ensureDb(dir)
        push('database', 'ok', created ? 'created' : 'ensured')
      } catch (err) {
        push('database', 'failed', String(err?.message || err).slice(0, 400))
        return { ok: false, steps, error: 'db_create_failed' }
      }
    }

    push('bootstrap', 'ok', 'complete')
    return { ok: true, steps }
  } catch (err) {
    const message = String(err?.message || err)
    push('bootstrap', 'failed', message.slice(0, 400))
    return { ok: false, steps, error: message }
  }
}
