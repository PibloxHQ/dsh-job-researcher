import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CAREER_AGENT_PRESET, installCareerAgent } from '../src/career-agent.js'

describe('career agent scope', () => {
  it('does not mount on another preset', () => {
    const agent = { session: { header: { agentPreset: 'vega' } }, ctx: {} }
    assert.equal(installCareerAgent(agent), false)
  })

  it('mounts tools and prompt only on career-review', () => {
    const registered = []
    const sections = []
    const ctx = {
      tools: { register(definition) { registered.push(definition); return () => {} } },
      systemPrompt: { section(definition) { sections.push(definition); return () => {} } },
    }
    const result = installCareerAgent({ session: { header: { agentPreset: CAREER_AGENT_PRESET } }, ctx }, {
      getStore: () => ({ getSearchConfig: () => ({ version: 1, config_hash: 'h', config: { profile: {} } }), learningSummary: () => ({}) }),
      dataDir: '/tmp/data',
      pluginRoot: '/tmp/plugin',
    })
    assert.equal(result.preset, CAREER_AGENT_PRESET)
    assert.equal(registered.length, 6)
    assert.equal(sections.length, 1)
    assert.match(sections[0].text(), /career-manifest.v1/)
  })
})
