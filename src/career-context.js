import { createHash } from 'node:crypto'
import { resolveDbPath, resolveDataDir, PLUGIN_ROOT } from './paths.js'
import { defaultCareerProfile, normalizeCareerProfile } from './profile.js'

export const CAREER_CONTEXT_VERSION = 'career-context.v1'
export const CAREER_MANIFEST_VERSION = 'career-manifest.v1'
export const CAREER_MAX_OFFERS = 5
export const CAREER_MAX_DESCRIPTION = 8_000

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

function bounded(value, max) {
  return text(value, max)
}

function offerForContext(offer) {
  return {
    id: Number(offer?.id),
    source: text(offer?.source, 80),
    external_id: text(offer?.external_id, 200),
    title: text(offer?.title, 500),
    employer: text(offer?.employer, 500),
    location: text(offer?.location, 500),
    contract_type: text(offer?.contract_type, 200),
    work_time: text(offer?.work_time, 100),
    remote: text(offer?.remote, 100),
    published_at: text(offer?.published_at, 80),
    score: Number.isFinite(Number(offer?.score)) ? Number(offer.score) : null,
    score_version: text(offer?.score_version, 80),
    score_details: offer?.score_details && typeof offer.score_details === 'object'
      ? offer.score_details
      : {},
    jev: offer?.jev_signals_json && typeof offer.jev_signals_json === 'object'
      ? offer.jev_signals_json
      : null,
    feedback_tags: Array.isArray(offer?.feedback_tags) ? offer.feedback_tags.slice(0, 20) : [],
    description: bounded(offer?.description, CAREER_MAX_DESCRIPTION),
  }
}

/**
 * Build the canonical runtime manifest. Paths are locators, not write grants:
 * all mutations still go through the Job Researcher API and revision checks.
 */
export function buildCareerManifest({
  dataDir = resolveDataDir(),
  pluginRoot = PLUGIN_ROOT,
  profileRevision = null,
  profileHash = '',
  profileSource = 'sqlite:schema_meta.search_config_json',
  manifestHash = '',
} = {}) {
  const root = text(pluginRoot, 1_000)
  const data = text(dataDir, 1_000)
  const manifest = {
    manifest_version: CAREER_MANIFEST_VERSION,
    plugin_id: 'dsh-job-researcher',
    plugin_root: root,
    data_root: data,
    database: {
      locator: resolveDbPath(data),
      authority: 'job-researcher store / SQLite',
      access: 'read via job_researcher_* tools; never edit directly',
    },
    profile: {
      locator: profileSource,
      authority: 'search_config_json.profile.markdown',
      revision: profileRevision == null ? null : Number(profileRevision),
      hash: text(profileHash, 80),
      access: 'read via profile tool; propose changes through API',
    },
    api: {
      status: '/api/job-researcher/status',
      config: '/api/job-researcher/config',
      offers: '/api/job-researcher/offers',
      learning: '/api/job-researcher/learning',
      jev: '/api/job-researcher/jev-enrich',
    },
    authorities: [
      'database/API > profile.markdown > profile.derived > session summary',
      'user-confirmed feedback > inferred preference',
      'deterministic score and Jev score remain separate signals',
    ],
    allowed_read_paths: [root, data],
    allowed_write_paths: [],
    write_policy: 'diff + explicit confirmation + profile revision check',
    secrets: 'never exposed in the career context',
  }
  const serialized = JSON.stringify(manifest)
  return { ...manifest, hash: manifestHash || hash(serialized) }
}

export function buildCareerContext({
  profile = defaultCareerProfile(),
  offers = [],
  learning = null,
  transcriptSummary = '',
  activeTask = '',
  manifest,
} = {}) {
  const normalized = normalizeCareerProfile(profile)
  const selectedOffers = (Array.isArray(offers) ? offers : [])
    .filter((offer) => Number.isSafeInteger(Number(offer?.id)) && Number(offer.id) > 0)
    .slice(0, CAREER_MAX_OFFERS)
    .map(offerForContext)
  const compactLearning = learning && typeof learning === 'object'
    ? {
        active_signals: Array.isArray(learning.active_signals) ? learning.active_signals.slice(0, 20) : [],
        pending_signals: Array.isArray(learning.pending_signals) ? learning.pending_signals.slice(0, 20) : [],
        prefer_terms: Array.isArray(learning.prefer_terms) ? learning.prefer_terms.slice(0, 20) : [],
        avoid_terms: Array.isArray(learning.avoid_terms) ? learning.avoid_terms.slice(0, 20) : [],
      }
    : null
  return {
    context_version: CAREER_CONTEXT_VERSION,
    profile: {
      schema_version: normalized.schema_version,
      markdown: normalized.markdown,
      derived: normalized.derived,
      source: normalized.source,
      updated_at: normalized.updated_at,
    },
    offers: selectedOffers,
    learning: compactLearning,
    transcript_summary: bounded(transcriptSummary, 6_000),
    active_task: bounded(activeTask, 1_000),
    manifest: manifest || buildCareerManifest(),
  }
}

export { offerForContext }
