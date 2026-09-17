import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeReadiness } from '../src/readiness.js'
import { SECRET_KEYS } from '../src/paths.js'

function secretsAllPresent() {
  return Object.fromEntries(SECRET_KEYS.map((k) => [k, 'present']))
}

function secretsAllMissing() {
  return Object.fromEntries(SECRET_KEYS.map((k) => [k, 'missing']))
}

describe('computeReadiness matrix', () => {
  it('needs_setup when database missing', () => {
    const r = computeReadiness({
      dbExists: false,
      venvExists: true,
      schemaOk: false,
      configValid: true,
      secretStatus: secretsAllPresent(),
      enabledSources: ['csp-filtre', 'et', 'ft'],
    })
    assert.equal(r.readiness, 'needs_setup')
    assert.equal(r.can_run, false)
  })

  it('installing while bootstrapRunning', () => {
    const r = computeReadiness({
      dbExists: false,
      venvExists: false,
      bootstrapRunning: true,
      configValid: true,
      secretStatus: secretsAllMissing(),
    })
    assert.equal(r.readiness, 'installing')
  })

  it('ready when public sources and stack ok', () => {
    const r = computeReadiness({
      dbExists: true,
      venvExists: true,
      schemaOk: true,
      configValid: true,
      secretStatus: secretsAllMissing(),
      enabledSources: ['csp-filtre', 'et'],
      stats: { total: 10 },
      latestRun: { id: 1 },
    })
    assert.equal(r.readiness, 'ready')
    assert.equal(r.can_run, true)
    assert.equal(r.can_run_public, true)
  })

  it('degraded when FT secrets missing but public sources runnable', () => {
    const r = computeReadiness({
      dbExists: true,
      venvExists: true,
      schemaOk: true,
      configValid: true,
      secretStatus: secretsAllMissing(),
      enabledSources: ['csp-filtre', 'et', 'ft'],
      stats: { total: 1 },
      latestRun: { id: 1 },
    })
    assert.equal(r.readiness, 'degraded')
    assert.equal(r.can_run, false)
    assert.equal(r.can_run_public, true)
  })

  it('blocked when only FT enabled and secrets missing', () => {
    const r = computeReadiness({
      dbExists: true,
      venvExists: true,
      schemaOk: true,
      configValid: true,
      secretStatus: secretsAllMissing(),
      enabledSources: ['ft'],
    })
    assert.equal(r.readiness, 'blocked')
    assert.equal(r.can_run, false)
    assert.equal(r.can_run_public, false)
  })

  it('running when scheduleRunning', () => {
    const r = computeReadiness({
      dbExists: true,
      venvExists: true,
      schemaOk: true,
      configValid: true,
      secretStatus: secretsAllPresent(),
      enabledSources: ['csp-filtre', 'et', 'ft'],
      scheduleRunning: true,
    })
    assert.equal(r.readiness, 'running')
  })
})
