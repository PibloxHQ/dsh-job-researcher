import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCareerContext, buildCareerManifest, CAREER_MAX_OFFERS, CAREER_MAX_DESCRIPTION } from '../src/career-context.js'

describe('career context contract', () => {
  it('publishes canonical locators and no write paths', () => {
    const manifest = buildCareerManifest({ dataDir: '/tmp/career-data', pluginRoot: '/tmp/plugin', profileRevision: 4, profileHash: 'abc' })
    assert.equal(manifest.manifest_version, 'career-manifest.v1')
    assert.equal(manifest.profile.revision, 4)
    assert.deepEqual(manifest.allowed_write_paths, [])
    assert.match(manifest.database.locator, /career-data/)
    assert.ok(manifest.hash)
  })

  it('bounds offers, descriptions, transcript and preserves profile derivation', () => {
    const context = buildCareerContext({
      profile: { markdown: '## Compétences\n- Linux\n- Support' },
      offers: Array.from({ length: CAREER_MAX_OFFERS + 2 }, (_, id) => ({ id: id + 1, title: `Offer ${id}`, description: 'x'.repeat(CAREER_MAX_DESCRIPTION + 200) })),
      transcriptSummary: 't'.repeat(10_000),
      activeTask: 'compare',
    })
    assert.equal(context.offers.length, CAREER_MAX_OFFERS)
    assert.equal(context.offers[0].description.length, CAREER_MAX_DESCRIPTION)
    assert.equal(context.transcript_summary.length, 6_000)
    assert.deepEqual(context.profile.derived.skills.core, ['Linux', 'Support'])
    assert.equal(context.active_task, 'compare')
  })
})
