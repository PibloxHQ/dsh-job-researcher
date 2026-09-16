/**
 * dsh-job-researcher — Host Cordis entry (scaffold).
 *
 * Bootstrap only: logger ping + optional soft webServer health route.
 * Does NOT sync job sources, score offers, or touch Hermes cron / job-radar.
 *
 * Reference patterns: dsh-piblox-secrets (soft webServer), dsh-piblox-theme (settings UI).
 */

export const name = 'dsh-job-researcher'

/** Soft inject — empty hard inject so headless boots without requiring tools. */
export const inject = []

const PLUGIN_ID = 'dsh-job-researcher'
const API_STATUS_PATH = '/api/job-researcher/status'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config = {}) {
  ctx.logger?.info?.(`${PLUGIN_ID}: host apply (scaffold bootstrap)`)

  // Soft-inject webServer so headless / non-web profiles skip HTTP cleanly.
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    if (!webServer?.register) {
      webCtx.logger?.warn?.(`${PLUGIN_ID}: webServer present but register() missing`)
      return
    }

    webServer.register({
      kind: 'exact',
      path: API_STATUS_PATH,
      method: 'GET',
      handler: async (_req, res) => {
        const body = JSON.stringify({
          ok: true,
          plugin: PLUGIN_ID,
          status: 'bootstrap',
          message: 'DSH Job Researcher — Plugin bootstrap OK',
          configKeys: Object.keys(config || {}),
          // Explicit non-goals for this scaffold revision:
          jobRadar: 'untouched',
          hermesCron: 'untouched',
        })
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(body)
      },
    })

    webCtx.logger?.info?.(`${PLUGIN_ID}: registered ${API_STATUS_PATH}`)
  })
}
