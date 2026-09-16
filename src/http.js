import { nextCronUtc } from './cron.js'
import { DEFAULT_CRON, SECRET_KEYS } from './paths.js'

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/**
 * Soft-register HTTP API. Admin UI is same-origin Settings; no secrets in responses.
 */
export function registerHttpRoutes(webServer, {
  getStore,
  getScheduler,
  secrets,
}) {
  const base = '/api/job-researcher'

  webServer.register({
    kind: 'exact',
    path: `${base}/status`,
    method: 'GET',
    handler: async (_req, res) => {
      let storeStats = null
      let latest = null
      let sources = []
      try {
        const store = getStore()
        storeStats = store.stats()
        latest = store.latestRun() || null
        sources = store.sourceState()
      } catch (err) {
        storeStats = { error: String(err.message || err) }
      }
      const sched = getScheduler()?.getStatus?.() || null
      const secretStatus = {}
      for (const k of SECRET_KEYS) {
        try {
          const r = secrets?.resolve?.(k)
          secretStatus[k] = r?.ok && r.value ? 'present' : 'missing'
        } catch {
          secretStatus[k] = 'unavailable'
        }
      }
      sendJson(res, 200, {
        ok: true,
        plugin: 'dsh-job-researcher',
        status: 'live',
        message: 'DSH Job Researcher',
        schedule: sched,
        secrets: secretStatus,
        stats: storeStats,
        latest_run: latest,
        sources,
        notifications: { backend: 'dsh-piblox-discord', status: 'disabled_lab_profile' },
      })
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${base}/offers`,
    method: 'GET',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const store = getStore()
        const result = store.listOffers({
          q: url.searchParams.get('q') || '',
          source: url.searchParams.get('source') || '',
          decision: url.searchParams.get('decision') || '',
          remote: url.searchParams.get('remote') || '',
          minScore: url.searchParams.get('minScore'),
          limit: url.searchParams.get('limit') || 50,
          offset: url.searchParams.get('offset') || 0,
          sort: url.searchParams.get('sort') || 'score_desc',
        })
        sendJson(res, 200, result)
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    },
  })

  webServer.register({
    kind: 'prefix',
    path: `${base}/offers/`,
    method: 'GET',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const id = url.pathname.replace(`${base}/offers/`, '').split('/')[0]
        const offer = getStore().getOffer(id)
        if (!offer) return sendJson(res, 404, { ok: false, error: 'not_found' })
        sendJson(res, 200, { offer })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    },
  })

  webServer.register({
    kind: 'prefix',
    path: `${base}/offers/`,
    method: 'PATCH',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.replace(`${base}/offers/`, '').split('/')
        const id = parts[0]
        if (parts[1] !== 'decision') {
          return sendJson(res, 404, { ok: false, error: 'not_found' })
        }
        const body = await readJson(req)
        const offer = getStore().setDecision(id, body.decision, body.comment)
        sendJson(res, 200, { ok: true, offer })
      } catch (err) {
        const status = String(err.message).includes('not_found') ? 404 : 400
        sendJson(res, status, { ok: false, error: String(err.message || err) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${base}/runs`,
    method: 'GET',
    handler: async (_req, res) => {
      try {
        sendJson(res, 200, { runs: getStore().listRuns(30) })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err.message || err) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: `${base}/run`,
    method: 'POST',
    handler: async (_req, res) => {
      const sched = getScheduler()
      if (!sched) return sendJson(res, 503, { ok: false, error: 'scheduler_unavailable' })
      // Fire async — do not block UI
      const kickoff = await sched.fire('manual')
      if (!kickoff.ok && kickoff.code === 'already_running') {
        return sendJson(res, 409, kickoff)
      }
      if (!kickoff.ok && kickoff.code === 'db_run_in_progress') {
        return sendJson(res, 409, kickoff)
      }
      sendJson(res, 202, {
        ok: kickoff.ok,
        ...kickoff,
        next_run_at: nextCronUtc(DEFAULT_CRON),
      })
    },
  })
}
