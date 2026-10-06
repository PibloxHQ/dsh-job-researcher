import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCareerJevRequest, buildJevLearningContext, normalizeCareerJevResult, CAREER_CONTRACT_VERSION, isJevCandidate } from '../src/jev-enrichment.js'

describe('Jev Career shadow contract', () => {
  it('builds bounded state without changing the deterministic score', () => {
    const request = buildCareerJevRequest({
      id: 7,
      source: 'ft',
      external_id: 'x7',
      title: 'Platform Engineer',
      description: 'x'.repeat(20_000),
      score: 4,
      score_classification: 'interested',
      score_version: 'v6-feedback',
      score_details: { base_score: 4 },
    }, { schema_version: 'career-profile.v1', markdown: '## Positionnement\n- platform' })
    assert.equal(request.contract, CAREER_CONTRACT_VERSION)
    assert.equal(request.state.deterministic_score.score, 4)
    assert.ok(request.state.offer.description.length < 20_000)
    assert.equal(Object.keys(request.questions).length, 15)
    assert.equal(request.questions.candidate_to_job.type, 'score')
    assert.equal(request.questions.dimension_growth_path.type, 'score')
    assert.equal(request.questions.salary_evidence.type, 'noul')
    assert.equal(request.state.profile.schema_version, 'career-profile.v1')
  })

  it('normalizes typed answers and rejects malformed envelopes', () => {
    const normalized = normalizeCareerJevResult({
      model: 'jev-1.13.0',
      answers: {
        semantic_fit: { type: 'score', score: 0.8 },
        candidate_to_job: { type: 'score', score: 4, legend: { 0: 'very poor', 1: 'poor', 2: 'partial', 3: 'strong', 4: 'excellent' } },
        job_to_candidate: { type: 'score', score: 3, legend: { 0: 'very poor', 1: 'poor', 2: 'partial', 3: 'strong', 4: 'excellent' } },
        candidate_to_company: { type: 'score', score: 2, legend: { 0: 'very poor', 1: 'poor', 2: 'partial', 3: 'strong', 4: 'excellent' } },
        company_to_candidate: { type: 'score', score: 1, legend: { 0: 'very poor', 1: 'poor', 2: 'partial', 3: 'strong', 4: 'excellent' } },
        salary_evidence: { type: 'noul', noul: 0.1 },
      },
      usage: { input_tokens: 12, output_tokens: 2 },
    })
    assert.equal(normalized.contract, CAREER_CONTRACT_VERSION)
    assert.equal(normalized.provenance, 'jev-typed-answers')
    assert.equal(normalized.weighted_match.policy_version, 'career-match.v1')
    assert.equal(normalized.weighted_match.overall, 78)
    assert.equal(normalized.weighted_match.overall_coverage, 100)
    assert.equal(normalized.weighted_match.dimensions.salary.score, null)
    assert.throws(() => normalizeCareerJevResult({ answers: [] }), /answers must be an object/)
  })

  it('injects bounded learned preferences without raw feedback history', () => {
    const request = buildCareerJevRequest(
      { id: 1, title: 'Support', description: 'Offer', score: 6 },
      { schema_version: 'career-profile.v1', markdown: 'profile' },
      {
        version: 'v6-feedback',
        active_signals: [{ tag: 'location_good', label_fr: 'Bon lieu', count: 4, delta: 1, actionable: true }],
        pending_signals: [{ tag: 'missing_diploma', label_fr: 'Diplôme manquant', count: 1, delta: 0, actionable: false }],
        prefer_terms: [{ term: 'autonomie', count: 2, polarity: 'prefer' }],
        avoid_terms: [{ term: 'astreinte', count: 2, polarity: 'avoid' }],
        comments: ['ne doit jamais être transmis'],
      },
    )
    assert.deepEqual(request.state.learned_preferences.confirmed[0], {
      tag: 'location_good', label: 'Bon lieu', count: 4, delta: 1, actionable: true,
    })
    assert.equal(request.state.learned_preferences.pending[0].delta, 0)
    assert.equal(request.state.learned_preferences.preferred_terms[0].term, 'autonomie')
    assert.equal(request.state.learned_preferences.avoided_terms[0].polarity, 'avoid')
    assert.equal(JSON.stringify(request.state).includes('ne doit jamais être transmis'), false)
    assert.equal(buildJevLearningContext({}).confirmed.length, 0)
  })

  it('only sends deterministic candidates at score 5 or above to Jev', () => {
    assert.equal(isJevCandidate({ score: 5 }), true)
    assert.equal(isJevCandidate({ score: 7 }), true)
    assert.equal(isJevCandidate({ score: 4 }), false)
    assert.equal(isJevCandidate({ score: null }), false)
  })
})
