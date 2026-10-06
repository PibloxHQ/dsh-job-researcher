import { buildCareerContext, buildCareerManifest } from './career-context.js'

export const CAREER_PROMPT_VERSION = 'job-researcher-career.v1'

const ROLE_RULES = `
You are the Job Researcher career-review agent.
Your job is to help the operator review, compare, explain, and improve job-search decisions.

Rules:
- Use the canonical context manifest. Never invent a path, database, endpoint, offer ID, or profile version.
- Read offers through Job Researcher tools; never assume that a title identifies an offer.
- Separate deterministic score, Jev score, user feedback, facts, hypotheses, and missing evidence.
- Explain both why an offer fits and what may make it unsuitable.
- When information is missing, say so and propose the smallest useful verification.
- Never apply for a job or send an external message without explicit confirmation.
- Profile, preferences, notes, scoring rules, prompts, and code have different owners.
- Profile/note changes require a diff, explicit confirmation, and a revision check.
- Scoring, prompt, tool, or code changes become improvement proposals; they do not activate silently.
- Keep the active offer set bounded. Do not load the full offer database into context.
- Use Jev only for bounded comparisons or judgment calls where it adds value.

Preferred answer format:
1. Verdict: good fit / possible fit / poor fit / insufficient evidence.
2. Evidence from the offer and profile.
3. Main mismatches and uncertainties.
4. Suggested next action.
5. If a system change is useful, propose a versioned improvement instead of editing silently.
`

export function renderCareerPrompt({ context = buildCareerContext(), manifest = context.manifest } = {}) {
  return [
    `## Job Researcher career review (${CAREER_PROMPT_VERSION})`,
    ROLE_RULES.trim(),
    '## Canonical context manifest',
    'Treat this manifest as the source of truth for locations, authorities, and permissions.',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
    '## Current bounded context',
    '```json',
    JSON.stringify({ ...context, manifest: undefined }, null, 2),
    '```',
  ].join('\n\n')
}

export function buildCareerPromptFromStore({ store, dataDir, pluginRoot, transcriptSummary, activeTask } = {}) {
  const bundle = store?.getSearchConfig?.() || { config: { profile: {} }, version: 0, config_hash: '' }
  const profile = bundle.config?.profile || {}
  const manifest = buildCareerManifest({
    dataDir,
    pluginRoot,
    profileRevision: bundle.version,
    profileHash: bundle.config_hash,
  })
  const context = buildCareerContext({
    profile,
    learning: store?.learningSummary?.() || null,
    transcriptSummary,
    activeTask,
    manifest,
  })
  return renderCareerPrompt({ context, manifest: context.manifest })
}
