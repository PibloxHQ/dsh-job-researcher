import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openStore } from '../src/store.js'

describe('store against migrated db', () => {
  it('lists and updates feedback', () => {
    process.env.DSH_HOME = process.env.DSH_HOME || '/home/mestryx/dsh-lab/runtime/dsh-home'
    const store = openStore()
    const stats = store.stats()
    assert.ok(stats.total > 0)
    const list = store.listOffers({ limit: 5 })
    assert.ok(list.rows.length > 0)
    const id = list.rows[0].id
    const before = store.getOffer(id)
    const updated = store.setDecision(id, 'MAYBE', 'unit-test')
    assert.equal(updated.user_decision, 'MAYBE')
    assert.equal(updated.user_comment, 'unit-test')
    // restore previous decision
    store.setDecision(id, before.user_decision || 'UNREVIEWED', before.user_comment || '')
    store.close()
  })
})
