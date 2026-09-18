/**
 * Closed feedback-tag vocabulary + pure helpers (Node + client contract).
 * Learn only from feedback_origin=user; never from legacy system notes.
 */

export const FEEDBACK_SCORE_VERSION = 'v5-feedback'
export const LEARN_THRESHOLD = 2
export const PER_TAG_DELTA_CAP = 1
export const TOTAL_FEEDBACK_CAP = 2
export const COMMENT_TERM_THRESHOLD = 2
export const COMMENT_TERM_MIN_LEN = 4
export const COMMENT_PER_TERM_CAP = 1
export const COMMENT_TOTAL_CAP = 1

const COMMENT_STOPWORDS = new Set([
  'le','la','les','un','une','des','de','du','et','ou','a','au','aux','pour','avec','sans','dans','sur','sous','par','qui','que','quoi','dont','est','sont','etre','avoir','fait','faire','plus','moins','tres','trop','pas','non','oui','bien','aussi','comme','tout','tous','toute','toutes','cette','cet','ces','mon','ma','mes','ton','ta','tes','son','sa','ses','notre','nos','votre','vos','leur','leurs','je','tu','il','elle','on','nous','vous','ils','elles','me','te','se','y','en','ce','cela','offre','offres','poste','postes','emploi','job','annonce','candidature','retour','commentaire','interessant','interesse','interessante','peut','etre','donc','car','mais','alors','ainsi','entre','chez','vers','apres','avant','encore','deja','toujours','jamais','ici','the','and','for','with','from','this','that','have','will','would','could','should','about','into','over','under','connaissance','connaissances','experience','experiences','formation','formations','gestion','technique','techniques','developpement','developper','environnement','environnements','fonction','fonctions','titulaire','titulaires','client','clients','equipe','equipes','service','services','mission','missions','profil','profils','competence','competences','qualite','niveau','bac','ecole','elements','correspond','recherche','recrute','contrat','cdi','cdd','salaire','cv','http','https','www','gouv','depublier','terminee','califications','qualifications','hospitaliere','infra','reseau','systeme','informatique','administration',
])

export function tokenizeComment(text) {
  let folded = String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  folded = folded.replace(/https?:\/\/\S+/g, ' ').replace(/www\.\S+/g, ' ')
  const out = []
  const seen = new Set()
  const re = /[a-z0-9][a-z0-9\-]{2,}/g
  let m
  while ((m = re.exec(folded))) {
    const tok = m[0].replace(/^-+|-+$/g, '')
    if (tok.length < COMMENT_TERM_MIN_LEN) continue
    if (tok.length > 28) continue
    if (COMMENT_STOPWORDS.has(tok)) continue
    if (/^\d+$/.test(tok)) continue
    if (['http', 'https', 'www', 'html', 'mailto'].includes(tok)) continue
    if ((tok.match(/\d/g) || []).length >= 3) continue
    if (seen.has(tok)) continue
    seen.add(tok)
    out.push(tok)
  }
  return out
}

export function aggregateCommentPreferences(rows, { threshold = COMMENT_TERM_THRESHOLD } = {}) {
  const prefer = Object.create(null)
  const avoid = Object.create(null)
  let commented = 0
  for (const row of rows || []) {
    if ((row.feedback_origin || '') !== 'user') continue
    const comment = String(row.comment || '').trim()
    if (!comment) continue
    commented += 1
    const decision = String(row.decision || 'UNREVIEWED').toUpperCase()
    const tokens = tokenizeComment(comment)
    const weight = decision === 'YES' ? 2 : decision === 'NO' ? 1 : 1
    const bucket = decision === 'NO' ? avoid : prefer
    for (const tok of tokens) bucket[tok] = (bucket[tok] || 0) + weight
  }
  const preferTerms = []
  const avoidTerms = []
  for (const tok of Object.keys(prefer).sort()) {
    const net = (prefer[tok] || 0) - (avoid[tok] || 0)
    if (net < threshold) continue
    preferTerms.push({ term: tok, count: prefer[tok], delta: COMMENT_PER_TERM_CAP, polarity: 'prefer' })
  }
  for (const tok of Object.keys(avoid).sort()) {
    const net = (avoid[tok] || 0) - (prefer[tok] || 0)
    if (net < threshold) continue
    avoidTerms.push({ term: tok, count: avoid[tok], delta: -COMMENT_PER_TERM_CAP, polarity: 'avoid' })
  }
  return {
    commented_feedback_count: commented,
    prefer_terms: preferTerms.slice(0, 40),
    avoid_terms: avoidTerms.slice(0, 40),
    comment_term_threshold: threshold,
    comment_total_cap: COMMENT_TOTAL_CAP,
  }
}


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

  const comments = aggregateCommentPreferences(rows)
  return {
    version: FEEDBACK_SCORE_VERSION,
    threshold,
    per_tag_cap: PER_TAG_DELTA_CAP,
    total_cap: TOTAL_FEEDBACK_CAP,
    user_feedback_count: userFeedbackCount,
    active_signals: active,
    pending_signals: pending,
    ...comments,
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

/** Client contract strings (French UI must include these). */
export const FEEDBACK_UI_COPY_FR = Object.freeze({
  whyHeading: 'Pourquoi ce choix ?',
  whyHelper:
    'Les tags et ton commentaire libre influencent le classement (après enregistrement). Pas d’envoi de candidature.',
  saveFeedback: 'Enregistrer le retour',
  systemScore: 'Explication du score (système)',
  toPrepare: 'À préparer',
  ready: 'Prête',
  applied: 'Envoyée',
})
