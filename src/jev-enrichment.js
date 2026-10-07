/**
 * Career/Jev shadow-enrichment contract.
 *
 * This module deliberately does not calculate or mutate the Job Researcher
 * score. It builds a bounded state for Jev and normalizes the typed answer
 * envelope so the caller can persist it additively and compare it with the
 * deterministic scorer.
 */

import { computeMatchMatrix } from './match-scoring.js'

export const CAREER_CONTRACT_VERSION = 'career.v1'
export const CAREER_QUESTION_SET_VERSION = 'career-questions.v1'
export const JEV_ENRICHMENT_MAX_OFFERS = 20
export const JEV_ENRICHMENT_MAX_DESCRIPTION = 12_000
export const JEV_ENRICHMENT_MIN_SCORE = 5
export const JEV_LEARNING_MAX_ITEMS = 20
export const JEV_LEARNING_MAX_TERM_LENGTH = 80

export function isJevCandidate(offer) {
  return Number.isFinite(Number(offer?.score)) && Number(offer.score) >= JEV_ENRICHMENT_MIN_SCORE
}

const MATCH_SCORE_CRITERIA = ['very poor', 'poor', 'partial', 'strong', 'excellent']

const MATCH_AXIS_QUESTIONS = Object.freeze({
  candidate_to_job: 'How well does this job match the candidate\'s stated skills, experience and work preferences?',
  job_to_candidate: 'How well does the candidate appear to meet the job\'s explicit needs and constraints?',
  candidate_to_company: 'How well does the company environment appear to match the candidate\'s stated preferences?',
  company_to_candidate: 'Based only on the offer evidence, how well might the candidate fit this company\'s team environment?',
})

const MATCH_DIMENSION_QUESTIONS = Object.freeze({
  skills: 'How well do the candidate skills match the skills required by this offer?',
  experience: 'How well does the candidate experience match the seniority and responsibilities of this offer?',
  work_preference: 'How well do the work arrangement and constraints match the candidate preferences?',
  location: 'How well does the offer location and commute/remote arrangement match the candidate preferences?',
  salary: 'How well does the stated or inferable compensation match the candidate requirements? Return unknown-like low confidence when salary is absent.',
  culture: 'How well does the company culture and working environment in the evidence match the candidate preferences? Do not invent facts.',
  growth_path: 'How well does the role offer a plausible growth path matching the candidate goals? Do not treat missing information as a mismatch.',
})

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
  ...Object.fromEntries(Object.entries(MATCH_AXIS_QUESTIONS).map(([id, instructions]) => [
    id,
    Object.freeze({ type: 'score', instructions, criteria: MATCH_SCORE_CRITERIA }),
  ])),
  ...Object.fromEntries(Object.entries(MATCH_DIMENSION_QUESTIONS).map(([id, instructions]) => [
    `dimension_${id}`,
    Object.freeze({ type: 'score', instructions, criteria: MATCH_SCORE_CRITERIA }),
  ])),
  salary_evidence: Object.freeze({
    type: 'noul',
    instructions: 'Is compensation explicitly stated in the offer evidence?',
  }),
})

function bounded(value, max) {
  const text = String(value ?? '')
  return text.length <= max ? text : `${text.slice(0, max)} … [truncated]`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function boundedList(values, mapper) {
  return (Array.isArray(values) ? values : [])
    .slice(0, JEV_LEARNING_MAX_ITEMS)
    .map(mapper)
    .filter(Boolean)
}

/** Keep learned context compact; raw feedback history never crosses to Jev. */
export function buildJevLearningContext(summary = {}) {
  const item = (entry) => ({
    tag: bounded(entry?.tag, JEV_LEARNING_MAX_TERM_LENGTH),
    label: bounded(entry?.label_fr, JEV_LEARNING_MAX_TERM_LENGTH),
    count: Number.isFinite(Number(entry?.count)) ? Number(entry.count) : 0,
    delta: Number.isFinite(Number(entry?.delta)) ? Number(entry.delta) : 0,
    actionable: Boolean(entry?.actionable),
  })
  const term = (entry) => ({
    term: bounded(entry?.term, JEV_LEARNING_MAX_TERM_LENGTH),
    count: Number.isFinite(Number(entry?.count)) ? Number(entry.count) : 0,
    polarity: entry?.polarity === 'avoid' ? 'avoid' : 'prefer',
  })
  return {
    version: bounded(summary?.version, 40),
    confirmed: boundedList(summary?.active_signals, item),
    pending: boundedList(summary?.pending_signals, item),
    preferred_terms: boundedList(summary?.prefer_terms, term),
    avoided_terms: boundedList(summary?.avoid_terms, term),
    instructions: [
      'Use confirmed preferences as contextual evidence, not absolute rules.',
      'Do not apply pending signals as score adjustments.',
      'Do not invent preferences or treat missing evidence as a mismatch.',
      'Explain when a learned preference materially affects the evaluation.',
      'Do not modify the deterministic score or create a permanent preference.',
    ],
  }
}

function scoreFromAnswer(answer) {
  if (!answer || typeof answer !== 'object' || typeof answer.score !== 'number') return null
  const max = answer.legend && typeof answer.legend === 'object'
    ? Math.max(...Object.keys(answer.legend).map(Number).filter(Number.isFinite))
    : MATCH_SCORE_CRITERIA.length - 1
  return Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(1, answer.score / max)) : null
}

function buildWeightedMatch(answers) {
  const axes = Object.fromEntries(Object.keys(MATCH_AXIS_QUESTIONS).map((id) => [id, scoreFromAnswer(answers[id])]))
  const dimensions = Object.fromEntries(Object.keys(MATCH_DIMENSION_QUESTIONS).map((id) => [
    id,
    id === 'salary' && !(answers.salary_evidence && answers.salary_evidence.noul >= 0.5)
      ? null
      : scoreFromAnswer(answers[`dimension_${id}`]),
  ]))
  return computeMatchMatrix({ axes, dimensions })
}

/** Build the public-job state sent to the host Jev service. */
export function buildCareerJevRequest(offer, profile = {}, learning = {}) {
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
      // Only the explicit career profile crosses the Jev boundary. Search
      // sources, schedule, revision and credentials are host concerns.
      profile: clone(profile),
      learned_preferences: buildJevLearningContext(learning),
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
    weighted_match: buildWeightedMatch(result.answers),
    model: typeof result.model === 'string' ? result.model : null,
    usage: clone(result.usage || { input_tokens: 0, output_tokens: 0 }),
    provenance: 'jev-typed-answers',
  }
}
