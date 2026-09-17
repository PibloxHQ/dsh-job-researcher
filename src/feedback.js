/**
 * Closed feedback-tag vocabulary + pure helpers (Node + client contract).
 * Learn only from feedback_origin=user; never from legacy system notes.
 */

export const FEEDBACK_SCORE_VERSION = 'v4-feedback'
export const LEARN_THRESHOLD = 2
export const PER_TAG_DELTA_CAP = 1
export const TOTAL_FEEDBACK_CAP = 2

/** @type {ReadonlyArray<{ id: string, delta: number, actionable: boolean, labelFr: string, labelEn: string }>} */
export const FEEDBACK_TAGS = Object.freeze([
  {
    id: 'location_good',
    delta: 1,
    actionable: true,
    labelFr: 'Bon lieu',
    labelEn: 'Good location',
  },
  {
    id: 'too_far',
    delta: -1,
    actionable: true,
    labelFr: 'Trop loin',
    labelEn: 'Too far',
  },
  {
    id: 'dev_infra_good',
    delta: 1,
    actionable: true,
    labelFr: 'Bon fit infra/dev',
    labelEn: 'Good infra/dev fit',
  },
  {
    id: 'support_good',
    delta: 1,
    actionable: true,
    labelFr: 'Support OK',
    labelEn: 'Support OK',
  },
  {
    id: 'support_bad',
    delta: -1,
    actionable: true,
    labelFr: 'Support non',
    labelEn: 'Support no',
  },
  {
    id: 'public_sector_good',
    delta: 1,
    actionable: true,
    labelFr: 'Secteur public OK',
    labelEn: 'Public sector OK',
  },
  {
    id: 'student_contract_bad',
    delta: -1,
    actionable: true,
    labelFr: 'Alternance/stage non',
    labelEn: 'Student contract no',
  },
  {
    id: 'contract_bad',
    delta: -1,
    actionable: true,
    labelFr: 'Contrat non',
    labelEn: 'Contract no',
  },
  {
    id: 'missing_diploma',
    delta: 0,
    actionable: false,
    labelFr: 'Diplôme manquant',
    labelEn: 'Missing diploma',
  },
  {
    id: 'needs_details',
    delta: 0,
    actionable: false,
    labelFr: 'Manque de détails',
    labelEn: 'Needs details',
  },
])

export const FEEDBACK_TAG_IDS = Object.freeze(FEEDBACK_TAGS.map((t) => t.id))

const TAG_BY_ID = Object.fromEntries(FEEDBACK_TAGS.map((t) => [t.id, t]))

export function isValidFeedbackTag(id) {
  return Object.prototype.hasOwnProperty.call(TAG_BY_ID, id)
}

/**
 * Validate and normalize a tags payload. Throws on unknown tags.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeFeedbackTags(raw) {
  if (raw == null || raw === '') return []
  let list = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      list = JSON.parse(s)
    } catch {
      throw new Error('invalid feedback_tags_json')
    }
  }
  if (!Array.isArray(list)) throw new Error('invalid feedback_tags')
  const out = []
  const seen = new Set()
  for (const item of list) {
    const id = String(item || '').trim()
    if (!id) continue
    if (!isValidFeedbackTag(id)) throw new Error(`invalid feedback_tag: ${id}`)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  out.sort()
  return out
}

export function serializeFeedbackTags(tags) {
  return JSON.stringify(normalizeFeedbackTags(tags))
}

export function parseFeedbackTagsJson(raw) {
  try {
    return normalizeFeedbackTags(raw || '[]')
  } catch {
    return []
  }
}

/**
 * Aggregate user-origin tag counts → active / pending learned signals.
 * Deterministic: sorted by tag id.
 * @param {Array<{ feedback_origin?: string, feedback_tags_json?: string, tags?: string[] }>} rows
 */
export function aggregateLearnedSignals(rows, { threshold = LEARN_THRESHOLD } = {}) {
  const counts = Object.create(null)
  for (const id of FEEDBACK_TAG_IDS) counts[id] = 0

  let userFeedbackCount = 0
  for (const row of rows || []) {
    if ((row.feedback_origin || '') !== 'user') continue
    userFeedbackCount += 1
    const tags =
      row.tags != null ? normalizeFeedbackTags(row.tags) : parseFeedbackTagsJson(row.feedback_tags_json)
    for (const id of tags) {
      counts[id] = (counts[id] || 0) + 1
    }
  }

  const active = []
  const pending = []
  for (const meta of FEEDBACK_TAGS) {
    const count = counts[meta.id] || 0
    if (count <= 0) continue
    const entry = {
      tag: meta.id,
      count,
      delta: meta.actionable ? clamp(meta.delta, -PER_TAG_DELTA_CAP, PER_TAG_DELTA_CAP) : 0,
      actionable: meta.actionable,
      label_fr: meta.labelFr,
    }
    if (meta.actionable && count >= threshold) active.push(entry)
    else pending.push(entry)
  }

  return {
    version: FEEDBACK_SCORE_VERSION,
    threshold,
    per_tag_cap: PER_TAG_DELTA_CAP,
    total_cap: TOTAL_FEEDBACK_CAP,
    user_feedback_count: userFeedbackCount,
    active_signals: active,
    pending_signals: pending,
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Client contract strings (French UI must include these). */
export const FEEDBACK_UI_COPY_FR = Object.freeze({
  whyHeading: 'Pourquoi ce choix ?',
  whyHelper:
    'Explique pourquoi tu postules, refuses ou hésites. Ce retour affine le classement futur sans envoyer de candidature.',
  saveFeedback: 'Enregistrer le retour',
  systemScore: 'Explication du score (système)',
  toPrepare: 'À préparer',
  ready: 'Prête',
  applied: 'Envoyée',
})
