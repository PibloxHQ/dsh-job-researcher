import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyProfileProposal, createProfileProposal } from '../src/career-writes.js'

describe('career write gate', () => {
  it('creates a diff without mutating the profile', () => {
    const proposal = createProfileProposal({ current: { markdown: 'old', version: 2 }, nextMarkdown: 'new', reason: 'clarify target' })
    assert.equal(proposal.status, 'proposed')
    assert.equal(proposal.level, 'A')
    assert.equal(proposal.profile_revision_before, 2)
  })

  it('requires explicit confirmation and expected revision', () => {
    let saved
    const store = { saveSearchConfig(input, options) { saved = { input, options }; return { version: 3, config_hash: 'h3' } } }
    const proposal = createProfileProposal({ current: { markdown: 'old', version: 2 }, nextMarkdown: 'new' })
    assert.throws(() => applyProfileProposal(store, proposal, { expectedRevision: 2 }), /confirmation/)
    const accepted = applyProfileProposal(store, proposal, { expectedRevision: 2, confirmed: true })
    assert.equal(accepted.status, 'accepted')
    assert.equal(saved.options.expectedRevision, 2)
    assert.equal(saved.input.profile.markdown, 'new')
  })
})
