import { buildCareerManifest } from './career-context.js'
import { buildCareerPromptFromStore } from './career-prompt.js'
import { registerCareerTools } from './career-tools.js'

export const CAREER_AGENT_PRESET = 'career-review'
export const CAREER_PROMPT_SECTION = 'job-researcher:career-review'

function resolvePreset(agent) {
  return agent?.session?.header?.agentPreset
    || agent?.header?.agentPreset
    || agent?.meta?.agentPreset
    || null
}

/**
 * Mount the Job Researcher surface on one agent scope only. The agent preset
 * owns the lifecycle, so closing/resetting that session disposes its tools and
 * prompt without polluting other DSH sessions.
 */
export function installCareerAgent(agent, { getStore, dataDir, pluginRoot, logger } = {}) {
  if (!agent?.ctx || resolvePreset(agent) !== CAREER_AGENT_PRESET) return false
  const agentCtx = agent.ctx
  if (!agentCtx.tools?.register || !agentCtx.systemPrompt?.section) {
    logger?.warn?.('dsh-job-researcher: career preset lacks scoped tools/systemPrompt')
    return false
  }
  const getManifest = () => {
    const bundle = getStore()?.getSearchConfig?.() || {}
    return buildCareerManifest({
      dataDir,
      pluginRoot,
      profileRevision: bundle.version,
      profileHash: bundle.config_hash,
    })
  }
  const disposers = []
  const registered = registerCareerTools(agentCtx, { getStore, getManifest })
  for (const disposer of registered) if (typeof disposer === 'function') disposers.push(disposer)
  const promptDisposer = agentCtx.systemPrompt.section({
    name: CAREER_PROMPT_SECTION,
    order: 2_750,
    text: () => buildCareerPromptFromStore({
      store: getStore(),
      dataDir,
      pluginRoot,
      activeTask: 'review current job offers and improve explainability',
    }),
  })
  if (typeof promptDisposer === 'function') disposers.push(promptDisposer)
  // Agent contexts normally dispose their registrations with the scope. Keep
  // an explicit disposer for hosts/tests that expose only the plain object API.
  return { preset: CAREER_AGENT_PRESET, tools: registered.length, dispose: () => disposers.forEach((dispose) => dispose()) }
}
