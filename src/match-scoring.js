/**
 * Explainable multi-axis match policy for Career.
 *
 * This is a shadow-policy module. It never changes the legacy deterministic
 * score by itself. Scores are normalized to [0, 1], weights are normalized to
 * sum to 1, and missing dimensions are excluded from the denominator while
 * their coverage is reported separately.
 */

export const MATCH_POLICY_VERSION = 'career-match.v1'

// Initial prior, deliberately conservative until BENCH-JOB-02 sensitivity
// analysis confirms that the ranking is stable for the user.
export const MATCH_AXIS_WEIGHTS = Object.freeze({
  candidate_to_job: 45,
  job_to_candidate: 30,
  candidate_to_company: 15,
  company_to_candidate: 10,
})

export const MATCH_DIMENSION_WEIGHTS = Object.freeze({
  skills: 25,
  experience: 20,
  work_preference: 15,
  location: 15,
  salary: 10,
  culture: 8,
  growth_path: 7,
})

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new TypeError('match weights must be an object')
  }
  const entries = Object.entries(weights).map(([key, value]) => {
    const number = finiteNumber(value)
    if (number == null || number < 0) throw new TypeError(`invalid match weight: ${key}`)
    return [key, number]
  })
  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  if (total <= 0) throw new TypeError('match weights must have a positive total')
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]))
}

/** Convert either 0..1 or 0..100 input to the canonical 0..1 range. */
export function normalizeMatchValue(value) {
  const number = finiteNumber(value)
  if (number == null) return null
  if (number >= 0 && number <= 1) return number
  if (number >= 0 && number <= 100) return number / 100
  return null
}

/**
 * Weighted average with explicit coverage. Unknown values never become zero:
 * the denominator is the weight of dimensions that actually have evidence.
 */
export function aggregateMatchScores(values, weights) {
  const normalizedWeights = normalizeWeights(weights)
  let weighted = 0
  let availableWeight = 0
  const dimensions = {}

  for (const [key, weight] of Object.entries(normalizedWeights)) {
    const score = normalizeMatchValue(values?.[key])
    if (score == null) {
      dimensions[key] = { score: null, weight: weight * 100, status: 'unknown' }
      continue
    }
    weighted += score * weight
    availableWeight += weight
    dimensions[key] = {
      score: Math.round(score * 100),
      weight: Math.round(weight * 10000) / 100,
      status: 'evidence',
    }
  }

  return {
    score: availableWeight > 0 ? Math.round((weighted / availableWeight) * 100) : null,
    coverage: Math.round(availableWeight * 100),
    dimensions,
  }
}

/**
 * Compute the four directional scores and the general score. The general
 * score is a weighted sum of available directional scores, not a replacement
 * for the current deterministic ranking until explicitly promoted.
 */
export function computeMatchMatrix({ axes = {}, dimensions = {} } = {}) {
  const axis = aggregateMatchScores(axes, MATCH_AXIS_WEIGHTS)
  const detail = aggregateMatchScores(dimensions, MATCH_DIMENSION_WEIGHTS)
  return {
    policy_version: MATCH_POLICY_VERSION,
    overall: axis.score,
    overall_coverage: axis.coverage,
    axes: axis.dimensions,
    dimensions: detail.dimensions,
    dimension_score: detail.score,
    dimension_coverage: detail.coverage,
  }
}
