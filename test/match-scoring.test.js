import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MATCH_AXIS_WEIGHTS,
  MATCH_DIMENSION_WEIGHTS,
  aggregateMatchScores,
  computeMatchMatrix,
  normalizeWeights,
} from '../src/match-scoring.js'

test('match weights normalize to 100% and missing evidence reports coverage', () => {
  const result = aggregateMatchScores(
    { skills: 0.94, experience: 0.87, salary: null },
    MATCH_DIMENSION_WEIGHTS,
  )

  assert.equal(result.score, 91)
  assert.equal(result.coverage, 45)
  assert.equal(result.dimensions.salary.status, 'unknown')
  assert.equal(Math.round(Object.values(normalizeWeights(MATCH_DIMENSION_WEIGHTS)).reduce((a, b) => a + b, 0) * 100), 100)
})

test('four directional scores remain separate from the detail breakdown', () => {
  const result = computeMatchMatrix({
    axes: {
      candidate_to_job: 92,
      job_to_candidate: 81,
      candidate_to_company: 88,
      company_to_candidate: 76,
    },
    dimensions: {
      skills: 94,
      experience: 87,
      work_preference: 96,
      salary: 100,
      location: 100,
      culture: 78,
      growth_path: 91,
    },
  })

  assert.equal(result.policy_version, 'career-match.v1')
  assert.equal(result.overall, 87)
  assert.equal(result.overall_coverage, 100)
  assert.equal(result.dimension_score, 93)
  assert.equal(result.axes.company_to_candidate.score, 76)
  assert.equal(result.dimensions.salary.score, 100)
})

test('invalid or out-of-range values never become a positive match', () => {
  const result = aggregateMatchScores({ skills: 101, experience: -1 }, { skills: 1, experience: 1 })
  assert.equal(result.score, null)
  assert.equal(result.coverage, 0)
})
