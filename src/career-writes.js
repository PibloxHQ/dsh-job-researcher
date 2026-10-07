import { createHash, randomUUID } from 'node:crypto'

function clean(value, max = 80_000) {
  return String(value ?? '').trim().slice(0, max)
}

function proposalId(value) {
  return `profile-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

/** Build a non-mutating profile proposal. */
export function createProfileProposal({ current, nextMarkdown, sessionId = null, reason = '' } = {}) {
  const before = clean(current?.markdown)
  const after = clean(nextMarkdown)
  if (!after) throw new Error('profile proposal cannot be empty')
  if (before === after) throw new Error('profile proposal has no changes')
  return {
    id: proposalId(`${before}\n---\n${after}`),
    proposal_id: randomUUID(),
    kind: 'profile',
    level: 'A',
    status: 'proposed',
    session_id: sessionId,
    reason: clean(reason, 2_000),
    profile_revision_before: Number(current?.revision ?? current?.version ?? 0),
    before,
    after,
    diff: { before_chars: before.length, after_chars: after.length },
    policy: 'explicit confirmation + expected revision check',
  }
}

export function applyProfileProposal(store, proposal, { expectedRevision, confirmed = false } = {}) {
  if (!confirmed) throw new Error('explicit confirmation required')
  if (!proposal || proposal.status !== 'proposed') throw new Error('proposal_not_pending')
  const result = store.saveSearchConfig({ profile: { markdown: proposal.after, source: 'operator' } }, { expectedRevision })
  return { ...proposal, status: 'accepted', profile_revision_after: result.version, config_hash: result.config_hash }
}

