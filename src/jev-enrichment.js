/**
 * Career/Jev shadow-enrichment contract.
 *
 * This module deliberately does not calculate or mutate the Job Researcher
 * score. It builds a bounded state for Jev and normalizes the typed answer
 * envelope so the caller can persist it additively and compare it with the
 * deterministic scorer.
 */

export const CAREER_CONTRACT_VERSION = 'career.v1'
export const JEV_ENRICHMENT_MAX_OFFERS = 20
export const JEV_ENRICHMENT_MAX_DESCRIPTION = 12_000

export const CAREER_QUESTIONS = Object.freeze({
  location_fit: Object.freeze({
    type: 'score',
    instructions: 'How well does the offer location and work arrangement fit the profile constraints?',
    criteria: ['poor', 'partial', 'strong'],
  }),
  role_family: Object.freeze({
    type: 'choice',
    instructions: 'Which role family best describes this offer relative to the target profile?',
    criteria: Object.freeze({
      match: 'same target family',
      partial: 'adjacent family',
      mismatch: 'different family',
    }),
  }),
  semantic_fit: Object.freeze({
    type: 'score',
    instructions: 'How well do the responsibilities and required skills fit the target profile?',
    criteria: ['poor', 'partial', 'strong'],
  }),
})

function bounded(value, max) {
  const text = String(value ?? '')
  return text.length <= max ? text : `${text.slice(0, max)} … [truncated]`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Build the public-job state sent to the host Jev service. */
export function buildCareerJevRequest(offer, profile = {}) {
  if (offer == null || typeof offer !== 'object' || Array.isArray(offer)) {
    throw new TypeError('jev enrichment: offer must be an object')
  }
  return {
    contract: CAREER_CONTRACT_VERSION,
    state: {
      offer: {
        id: offer.id,
        source: offer.source,
        external_id: offer.external_id,
        title: bounded(offer.title, 500),
        employer: bounded(offer.employer, 500),
        location: bounded(offer.location, 500),
        contract_type: bounded(offer.contract_type, 200),
        work_time: bounded(offer.work_time, 200),
        remote: bounded(offer.remote, 100),
        description: bounded(offer.description, JEV_ENRICHMENT_MAX_DESCRIPTION),
      },
      profile: clone(profile),
      deterministic_score: {
        score: offer.score ?? null,
        classification: offer.score_classification ?? null,
        version: offer.score_version ?? null,
        details: clone(offer.score_details || {}),
      },
      evidence: [
        { kind: 'job-offer', source: offer.source, external_id: offer.external_id },
      ],
    },
    questions: clone(CAREER_QUESTIONS),
  }
}

/** Normalize Jev output; no probability is converted into a verdict here. */
export function normalizeCareerJevResult(result) {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('jev enrichment: result must be an object')
  }
  if (result.answers == null || typeof result.answers !== 'object' || Array.isArray(result.answers)) {
    throw new TypeError('jev enrichment: result.answers must be an object')
  }
  return {
    contract: CAREER_CONTRACT_VERSION,
    answers: clone(result.answers),
    model: typeof result.model === 'string' ? result.model : null,
    usage: clone(result.usage || { input_tokens: 0, output_tokens: 0 }),
    provenance: 'jev-typed-answers',
  }
}
