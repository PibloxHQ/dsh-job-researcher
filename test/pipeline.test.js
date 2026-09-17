import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildChildEnv } from '../src/pipeline.js'
import { SECRET_KEYS } from '../src/paths.js'

describe('buildChildEnv — Secrets Boundary', () => {
  it('throws when secrets service is missing', () => {
    assert.throws(
      () => buildChildEnv(null, '/tmp/jr-test'),
      /secrets service unavailable/,
    )
  })

  it('throws when materialize omits FT keys (fail closed)', () => {
    const secrets = {
      materialize() {
        return { ok: true, applied: [] }
      },
    }
    assert.throws(
      () => buildChildEnv(secrets, '/tmp/jr-test'),
      /required FT secrets unavailable/,
    )
  })

  it('does not spread process.env and materializes only into explicit env', () => {
    const marker = `JR_LEAK_${Date.now()}`
    process.env[marker] = 'should-not-leak'
    const secrets = {
      materialize(keys, target) {
        assert.deepEqual(keys, [...SECRET_KEYS])
        assert.equal(target[marker], undefined)
        assert.notEqual(target, process.env)
        for (const k of keys) target[k] = `vault-${k}`
        return { ok: true, applied: [...keys] }
      },
    }
    const { env, secretStatus } = buildChildEnv(secrets, '/tmp/jr-data')
    assert.equal(env[marker], undefined)
    assert.equal(env.FT_CLIENT_ID, 'vault-FT_CLIENT_ID')
    assert.equal(env.FT_CLIENT_SECRET, 'vault-FT_CLIENT_SECRET')
    assert.equal(env.JOB_RESEARCHER_DATA_DIR, '/tmp/jr-data')
    assert.ok(env.DB_PATH.includes('radar.db'))
    assert.equal(secretStatus.FT_CLIENT_ID, 'materialized')
    delete process.env[marker]
  })

  it('does not require FT materialize when sources are public-only', () => {
    let materializeCalled = false
    const secrets = {
      materialize() {
        materializeCalled = true
        return { ok: false, applied: [] }
      },
      hasKey() {
        return false
      },
    }
    const { env, secretStatus } = buildChildEnv(secrets, '/tmp/jr-public', {
      sources: ['csp-filtre', 'et'],
    })
    assert.equal(materializeCalled, false)
    assert.equal(env.FT_CLIENT_ID, undefined)
    assert.equal(env.JR_ENABLED_SOURCES, 'csp-filtre,et')
    assert.equal(secretStatus.FT_CLIENT_ID, 'missing')
    assert.equal(secretStatus.FT_CLIENT_SECRET, 'missing')
  })

  it('fails when sources include ft and secrets missing', () => {
    const secrets = {
      materialize() {
        return { ok: true, applied: [] }
      },
    }
    assert.throws(
      () =>
        buildChildEnv(secrets, '/tmp/jr-ft', {
          sources: ['csp-filtre', 'ft'],
        }),
      /required FT secrets unavailable/,
    )
  })

  it('passes JR_SEARCH_CONFIG_JSON when config provided', () => {
    const secrets = {
      materialize(keys, target) {
        for (const k of keys) target[k] = 'x'
        return { ok: true, applied: [...keys] }
      },
    }
    const config = { sources: { enabled: ['ft'] }, revision: 1 }
    const { env } = buildChildEnv(secrets, '/tmp/jr-cfg', {
      sources: ['ft'],
      config,
    })
    assert.equal(env.JR_SEARCH_CONFIG_JSON, JSON.stringify(config))
  })
})
