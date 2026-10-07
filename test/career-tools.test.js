import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCareerToolHandlers } from '../src/career-tools.js'

const offer = (id) => ({ id, title: `Offer ${id}`, description: 'desc', score: id, score_details: { skills: id }, jev_signals_json: { weighted_match: { overall: id + 50 } } })

describe('career tool handlers', () => {
  it('reads bounded offers and rejects unbounded comparison', () => {
    const store = {
      getSearchConfig: () => ({ version: 2, config_hash: 'h', config: { profile: {} } }),
      learningSummary: () => ({ active_signals: [] }),
      listOffers: (filters) => ({ total: 1, limit: filters.limit, rows: [offer(12)] }),
      getOffer: (id) => offer(id),
    }
    const handlers = createCareerToolHandlers({ getStore: () => store, getManifest: () => ({ manifest_version: 'test' }) })
    assert.equal(handlers.searchOffers({ limit: 999 }).limit, 30)
    assert.equal(handlers.getOffer({ offer_id: 12 }).offer.id, 12)
    assert.throws(() => handlers.compareOffers({ offer_ids: [1] }), /2 to 5/)
    assert.equal(handlers.explainScore({ offer_id: 12 }).deterministic.score, 12)
  })
})
