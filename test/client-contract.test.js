import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { FEEDBACK_UI_COPY_FR } from '../src/feedback.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'src', 'client', 'index.js')

describe('client feedback / DSH token contract', () => {
  it('uses --dsw-alias tokens and required feedback copy/controls', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /--dsw-alias-label-primary/)
    assert.match(src, /--dsw-alias-border-l2/)
    assert.match(src, /--dsw-alias-button-primary-fill/)
    assert.match(src, /--dsw-alias-bg-layer-2/)
    assert.doesNotMatch(src, /#c9a227/)
    assert.doesNotMatch(src, /rgba\(201,\s*162,\s*39/)
    assert.doesNotMatch(src, /#ef4444/)
    assert.match(src, new RegExp(FEEDBACK_UI_COPY_FR.whyHeading.replace('?', '\\?')))
    assert.match(src, /Enregistrer le retour/)
    assert.match(src, /'data-testid':\s*'save-feedback'/)
    assert.match(src, /'data-testid':\s*'feedback-panel'/)
    assert.match(src, /'data-testid':\s*'system-score'/)
    assert.match(src, /À préparer/)
    assert.match(src, /Prête/)
    assert.match(src, /Envoyée/)
    assert.match(src, /aria-label/)
    assert.match(src, /aria-pressed/)
    assert.match(src, /borderRadius:\s*'0\.45rem'/)
    assert.match(src, /borderRadius:\s*'0\.55rem'/)
    assert.match(src, /0\.5px solid var\(--dsw-alias-border/)
  })

  it('registers as global main panel + sidebar panellist (session-like)', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /sidebar\.panellist/)
    assert.match(src, /name:\s*'main'/)
    assert.match(src, /key:\s*PANEL_ID|key:\s*'job-researcher'/)
    assert.match(src, /'data-testid':\s*'job-researcher-navbar'/)
    assert.match(src, /'data-testid':\s*'job-researcher-icon'/)
    assert.match(src, /selectPanel/)
    assert.match(src, /layout/)
    assert.doesNotMatch(src, /sidebar\.footer\.action/)
    assert.match(src, /settings\.section/)
  })

  it('exposes readiness badge and settings gear', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /'data-testid':\s*'job-researcher-readiness'/)
    assert.match(src, /'data-testid':\s*'job-researcher-settings-gear'/)
    assert.match(src, /'data-testid':\s*'job-researcher-settings'/)
    assert.match(src, /'data-testid':\s*'job-researcher-needs-setup'/)
    assert.match(src, /settings\.job-researcher/)
    assert.match(src, /settingsScope/)
  })

  it('opens offer detail in a body-portaled modal popup', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /createPortal/)
    assert.match(src, /'data-testid':\s*'offer-detail-modal'/)
    assert.match(src, /'data-testid':\s*'offer-detail'/)
    assert.match(src, /modalDialog/)
    assert.match(src, /JobMark/)
  })

  it('quick decide does not always setSelected; uses openDetail/selectedRef', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /openDetail/)
    assert.match(src, /selectedRef/)
    assert.match(src, /JSON\.stringify\(\{\s*decision:\s*dec\s*\}\)/)
    assert.match(src, /offerBusy/)
    assert.match(src, /event\.target\s*!==\s*event\.currentTarget|e\.target\s*!==\s*e\.currentTarget/)
  })

  it('product polish: readable sheet, menus, views, density, settings sections', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /modalDialogWide/)
    assert.match(src, /'data-testid':\s*'offer-actions-panel'/)
    assert.match(src, /testId:\s*'interest-menu'/)
    assert.match(src, /testId:\s*'application-menu'/)
    assert.match(src, /'data-testid':\s*'offer-prev'/)
    assert.match(src, /'data-testid':\s*'offer-next'/)
    assert.match(src, /'data-testid':\s*'interest-views'/)
    assert.match(src, /'data-testid':\s*'density-toggle'/)
    assert.match(src, /'data-testid':\s*'jr-settings-section-search'/)
    assert.match(src, /'data-testid':\s*'jr-settings-summary'/)
    assert.match(src, /Consulter l[\u2019']annonce|View listing/)
    assert.match(src, /function DropdownMenu/)
    assert.match(src, /toggleExclusiveTags/)
    assert.match(src, /data-density/)
  })

  it('settings secrets link is a button; empty departments are not silently 38', () => {
    const src = readFileSync(CLIENT, 'utf8')
    assert.match(src, /'data-testid':\s*'jr-settings-secrets-link'/)
    assert.match(src, /type:\s*'button'[\s\S]*?jr-settings-secrets-link|jr-settings-secrets-link[\s\S]*?type:\s*'button'/)
    assert.doesNotMatch(src, /departments:\s*deps\.length\s*\?\s*deps\s*:\s*\['38'\]/)
    assert.match(src, /departmentsRequired|At least one department|Au moins un code département/)
    assert.match(src, /Number\.isFinite\(n\)\s*\?\s*n\s*:\s*0/)
    assert.match(src, /configLoaded/)
  })
})
