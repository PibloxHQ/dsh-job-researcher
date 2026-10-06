import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCareerPromptFromStore, renderCareerPrompt } from '../src/career-prompt.js'

describe('career prompt contract', () => {
  it('includes the manifest and bounded context', () => {
    const prompt = renderCareerPrompt({ context: { profile: { markdown: 'profile' }, offers: [], manifest: { plugin_id: 'dsh-job-researcher' } } })
    assert.match(prompt, /canonical context manifest/i)
    assert.match(prompt, /dsh-job-researcher/)
    assert.match(prompt, /never invent a path/i)
  })

  it('builds the full manifest from the store revision', () => {
    const prompt = buildCareerPromptFromStore({
      dataDir: '/tmp/career-data',
      pluginRoot: '/tmp/plugin',
      store: {
        getSearchConfig: () => ({ version: 7, config_hash: 'hash-7', config: { profile: { markdown: '## Profil' } } }),
        learningSummary: () => ({ active_signals: ['remote'] }),
      },
    })
    assert.match(prompt, /career-manifest.v1/)
    assert.match(prompt, /"revision": 7/)
    assert.match(prompt, /remote/)
  })
})
