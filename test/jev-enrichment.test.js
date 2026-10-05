import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCareerJevRequest, normalizeCareerJevResult, CAREER_CONTRACT_VERSION } from '../src/jev-enrichment.js'

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
    }, { roles: { selected: ['platform'] } })
    assert.equal(request.contract, CAREER_CONTRACT_VERSION)
    assert.equal(request.state.deterministic_score.score, 4)
    assert.ok(request.state.offer.description.length < 20_000)
    assert.equal(Object.keys(request.questions).length, 14)
    assert.equal(request.questions.candidate_to_job.type, 'score')
    assert.equal(request.questions.dimension_growth_path.type, 'score')
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
      },
      usage: { input_tokens: 12, output_tokens: 2 },
    })
    assert.equal(normalized.contract, CAREER_CONTRACT_VERSION)
    assert.equal(normalized.provenance, 'jev-typed-answers')
    assert.equal(normalized.weighted_match.policy_version, 'career-match.v1')
    assert.equal(normalized.weighted_match.overall, 78)
    assert.equal(normalized.weighted_match.overall_coverage, 100)
    assert.throws(() => normalizeCareerJevResult({ answers: [] }), /answers must be an object/)
  })
})
