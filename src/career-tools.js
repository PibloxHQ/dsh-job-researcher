import { defineTool } from '/home/mestryx/dsh-lab/runtime/deepseek-harness/packages/core/tools/lib/index.js'
import { buildCareerContext, buildCareerManifest, offerForContext } from './career-context.js'

const OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

function positiveId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('offer_id must be a positive integer')
  return id
}

function boundedLimit(value, fallback = 10, max = 30) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(1, Math.trunc(n)))
}

export function createCareerToolHandlers({ getStore, getManifest }) {
  const store = () => {
    const value = getStore?.()
    if (!value) throw new Error('job researcher store unavailable')
    return value
  }
  const manifest = () => getManifest?.() || buildCareerManifest()
  return {
    getProfile() {
      const s = store()
      const bundle = s.getSearchConfig()
      return {
        profile: bundle.config?.profile || {},
        profile_revision: bundle.version,
        profile_hash: bundle.config_hash,
        manifest: manifest(),
      }
    },
    searchOffers(args = {}) {
      const rows = store().listOffers({
        q: String(args.query || '').trim().slice(0, 200),
        source: String(args.source || '').trim(),
        minScore: args.min_score ?? null,
        sort: args.sort || 'jev_desc',
        limit: boundedLimit(args.limit),
        offset: 0,
      })
      return {
        total: rows.total,
        limit: rows.limit,
        offers: rows.rows.map(offerForContext),
        manifest: manifest(),
      }
    },
    getOffer(args = {}) {
      const id = positiveId(args.offer_id)
      const offer = store().getOffer(id)
      if (!offer) throw new Error(`offer not found: ${id}`)
      return { offer: offerForContext(offer), manifest: manifest() }
    },
    compareOffers(args = {}) {
      const ids = Array.isArray(args.offer_ids) ? args.offer_ids.map(positiveId) : []
      if (ids.length < 2 || ids.length > 5) throw new Error('offer_ids must contain 2 to 5 ids')
      const offers = ids.map((id) => store().getOffer(id)).filter(Boolean).map(offerForContext)
      if (offers.length !== ids.length) throw new Error('one or more offer_ids were not found')
      return { offers, manifest: manifest() }
    },
    explainScore(args = {}) {
      const id = positiveId(args.offer_id)
      const offer = store().getOffer(id)
      if (!offer) throw new Error(`offer not found: ${id}`)
      return {
        offer_id: id,
        deterministic: {
          score: offer.score ?? null,
          version: offer.score_version || null,
          details: offer.score_details || {},
        },
        jev: offer.jev_signals_json || null,
        feedback_tags: offer.feedback_tags || [],
        manifest: manifest(),
      }
    },
    getLearning() {
      return { learning: store().learningSummary(), manifest: manifest() }
    },
    buildContext(args = {}) {
      const offers = (Array.isArray(args.offer_ids) ? args.offer_ids : [])
        .slice(0, 5)
        .map(positiveId)
        .map((id) => store().getOffer(id))
        .filter(Boolean)
      const bundle = store().getSearchConfig()
      return buildCareerContext({
        profile: bundle.config?.profile,
        offers,
        learning: store().learningSummary(),
        activeTask: args.active_task,
        manifest: manifest(),
      })
    },
  }
}

export function registerCareerTools(ctx, handlers) {
  const h = createCareerToolHandlers(handlers)
  const registrations = [
    defineTool({
      name: 'job_researcher_get_profile',
      description: 'Read the current bounded career profile, revision, hash, and canonical context manifest.',
      parameters: {}, output: OUTPUT, execute: async () => h.getProfile(),
    }),
    defineTool({
      name: 'job_researcher_search_offers',
      description: 'Search a bounded set of job offers. Never request the entire database.',
      parameters: {
        query: { type: 'string', description: 'Optional title, employer, location, or skill query.' },
        source: { type: 'string', description: 'Optional source id.' },
        min_score: { type: 'number', description: 'Optional deterministic minimum score.' },
        sort: { type: 'string', enum: ['jev_desc', 'score_desc', 'recent_desc', 'seen_desc', 'title'] },
        limit: { type: 'number', description: 'Maximum 30; prefer 10.' },
      }, output: OUTPUT, execute: async (args) => h.searchOffers(args),
    }),
    defineTool({
      name: 'job_researcher_get_offer',
      description: 'Read one complete bounded offer by its database id.',
      parameters: { offer_id: { type: 'number', required: true, description: 'Positive database offer id.' } },
      output: OUTPUT, execute: async (args) => h.getOffer(args),
    }),
    defineTool({
      name: 'job_researcher_compare_offers',
      description: 'Compare between two and five offers by database id.',
      parameters: { offer_ids: { type: 'array', required: true, items: { type: 'number' } } },
      output: OUTPUT, execute: async (args) => h.compareOffers(args),
    }),
    defineTool({
      name: 'job_researcher_explain_score',
      description: 'Explain deterministic score, Jev result, and user feedback without conflating them.',
      parameters: { offer_id: { type: 'number', required: true, description: 'Positive database offer id.' } },
      output: OUTPUT, execute: async (args) => h.explainScore(args),
    }),
    defineTool({
      name: 'job_researcher_get_learning',
      description: 'Read confirmed learning signals and pending feedback signals.',
      parameters: {}, output: OUTPUT, execute: async () => h.getLearning(),
    }),
  ]
  return registrations.map((definition) => ctx.tools.register(definition))
}
