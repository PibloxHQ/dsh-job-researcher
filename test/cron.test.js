import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cronMatches, nextCronUtc } from '../src/cron.js'

describe('cron matcher', () => {
  it('matches 0 12 * * * at 12:00 UTC', () => {
    assert.equal(cronMatches('0 12 * * *', new Date('2026-09-16T12:00:00Z')), true)
    assert.equal(cronMatches('0 12 * * *', new Date('2026-09-16T12:01:00Z')), false)
  })

  it('computes a future next run', () => {
    const next = nextCronUtc('0 12 * * *', new Date('2026-09-16T11:00:00Z'))
    assert.ok(next)
    assert.ok(next.startsWith('2026-09-16T12:00'))
  })
})
