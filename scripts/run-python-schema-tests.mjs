#!/usr/bin/env node
/**
 * Run Python schema / feedback-learning regression tests (stdlib unittest; no pytest).
 * Prefer job-researcher venv python when present, else system python3.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'runtime', 'python', 'src')
const TESTS = [
  join(ROOT, 'runtime', 'python', 'tests', 'test_application_schema.py'),
  join(ROOT, 'runtime', 'python', 'tests', 'test_feedback_learning.py'),
  join(ROOT, 'runtime', 'python', 'tests', 'test_ft_adapter.py'),
]

const venvPy = join(
  process.env.DSH_HOME || join(homedir(), 'dsh-lab', 'runtime', 'dsh-home'),
  'job-researcher',
  '.venv',
  'bin',
  'python',
)
const python = existsSync(venvPy) ? venvPy : 'python3'

let failed = false
for (const test of TESTS) {
  const r = spawnSync(python, [test], {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: SRC },
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (r.error) {
    console.error(r.error)
    failed = true
    break
  }
  if ((r.status ?? 1) !== 0) {
    failed = true
    break
  }
}

process.exit(failed ? 1 : 0)
