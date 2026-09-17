import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  validateSearchConfig,
  configHash,
  defaultSearchConfig,
  normalizeSourceList,
  sourcesNeedFt,
} from '../src/config.js'

describe('validateSearchConfig', () => {
  it('accepts defaultSearchConfig', () => {
    const { ok, config, errors } = validateSearchConfig(defaultSearchConfig())
    assert.equal(ok, true)
    assert.equal(errors.length, 0)
    assert.ok(config.sources.enabled.includes('ft'))
    assert.equal(config.schema_version, 1)
  })

  it('accepts partial overlay on base', () => {
    const { ok, config } = validateSearchConfig({
      location: { departments: ['69'], communes: [], prefer_remote: false },
      sources: { enabled: ['csp-filtre', 'et'] },
    })
    assert.equal(ok, true)
    assert.deepEqual(config.location.departments, ['69'])
    assert.equal(config.location.prefer_remote, false)
    assert.deepEqual(config.sources.enabled, ['csp-filtre', 'et'])
  })

  it('rejects empty location and unknown source', () => {
    const { ok, errors } = validateSearchConfig({
      location: { departments: [], communes: [] },
      sources: { enabled: ['not-a-source'] },
      roles: { selected: ['infra'] },
    })
    assert.equal(ok, false)
    assert.ok(errors.some((e) => e.includes('location')))
    assert.ok(errors.some((e) => e.includes('unknown source')))
    assert.ok(errors.some((e) => e.includes('sources.enabled')))
  })

  it('rejects bad cron and contract types', () => {
    const { ok, errors } = validateSearchConfig({
      schedule: { cron: '0 12 *' },
      contracts: { types: ['CDI', 'BAD'], remote: ['yes'] },
    })
    assert.equal(ok, false)
    assert.ok(errors.some((e) => e.includes('schedule.cron')))
    assert.ok(errors.some((e) => e.includes('unknown contract')))
  })
})

describe('configHash', () => {
  it('is stable across calls and ignores revision', () => {
    const a = defaultSearchConfig()
    const b = { ...structuredClone(a), revision: 99 }
    assert.equal(configHash(a), configHash(a))
    assert.equal(configHash(a), configHash(b))
  })
})

describe('source helpers', () => {
  it('normalizeSourceList and sourcesNeedFt', () => {
    assert.deepEqual(normalizeSourceList('csp-filtre,et'), ['csp-filtre', 'et'])
    assert.equal(sourcesNeedFt(['csp-filtre', 'et']), false)
    assert.equal(sourcesNeedFt(['ft']), true)
  })
})
