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
    assert.equal(config.profile.schema_version, 'career-profile.v1')
  })

  it('normalizes a Markdown career profile into a bounded derived view', () => {
    const { ok, config } = validateSearchConfig({
      profile: { markdown: '# Profil\n\n## Compétences\n- TypeScript' },
    })
    assert.equal(ok, true)
    assert.equal(config.profile.markdown.includes('TypeScript'), true)
    assert.deepEqual(config.profile.derived.skills.core, ['TypeScript'])
  })

  it('allows a complete long-form profile within the Jev-safe bound', () => {
    const { ok, config } = validateSearchConfig({
      profile: { markdown: `## Expérience\n- ${'x'.repeat(70_000)}` },
    })
    assert.equal(ok, true)
    assert.equal(config.profile.markdown.length, 70_016)
  })

  it('keeps bullets under Markdown subsections in the derived profile', () => {
    const { config } = validateSearchConfig({
      profile: { markdown: '## Expériences\n### Projet\n- Node.js\n\n## Compétences techniques\n### Fortement étayées\n- Linux' },
    })
    assert.deepEqual(config.profile.derived.experience, ['Node.js'])
    assert.deepEqual(config.profile.derived.skills.core, ['Linux'])
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
