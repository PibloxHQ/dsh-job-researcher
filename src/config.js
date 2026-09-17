/**
 * Search profile schema — single authority for non-secret JR settings.
 * Live config is stored in schema_meta + optional Cordis settings;
 * search_profiles holds immutable snapshots for runs/scores.
 */

import { createHash } from 'node:crypto'

export const CONFIG_SCHEMA_VERSION = 1
export const SETTINGS_NAMESPACE = 'dsh-job-researcher'

export const SOURCE_IDS = Object.freeze([
  'csp-filtre',
  'csp',
  'et',
  'ft',
])

export const DEFAULT_SOURCES = Object.freeze(['csp-filtre', 'et', 'ft'])

export const ROLE_PRESETS = Object.freeze({
  'dev-infra': {
    label: 'Dev / Infra',
    roles: ['fullstack', 'web', 'platform', 'infra', 'sre', 'cloud', 'sysadmin'],
    include_keywords: [],
    exclude_keywords: ['stage', 'alternance'],
  },
  public_it: {
    label: 'IT public',
    roles: ['public_it', 'infra', 'sysadmin'],
    include_keywords: [],
    exclude_keywords: [],
  },
})

export const CONTRACT_TYPES = Object.freeze([
  'CDI',
  'CDD',
  'interim',
  'freelance',
  'other',
])

export const REMOTE_MODES = Object.freeze(['yes', 'no', 'unknown', 'hybrid'])

/** Default search profile (lab Isère — overridable via Settings). */
export function defaultSearchConfig() {
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    revision: 0,
    location: {
      departments: ['38'],
      communes: [],
      radius_km: null,
      prefer_remote: true,
      /** Optional CSP filtre path override; null = Isère/Numérique/B default */
      csp_filtre_path: null,
    },
    roles: {
      preset: 'dev-infra',
      selected: [...ROLE_PRESETS['dev-infra'].roles],
      include_keywords: [],
      exclude_keywords: ['stage', 'alternance'],
    },
    contracts: {
      types: ['CDI', 'CDD'],
      remote: ['yes', 'hybrid', 'unknown'],
    },
    sources: {
      enabled: [...DEFAULT_SOURCES],
    },
    schedule: {
      cron: '0 12 * * *',
      timezone: 'UTC',
      enabled: true,
      daily_application_target: 1,
      catch_up: true,
    },
    scoring: {
      engine: 'triage',
      feedback_learning: true,
    },
  }
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function asStringArray(v, field, errors) {
  if (v == null) return []
  if (!Array.isArray(v)) {
    errors.push(`${field} must be an array`)
    return []
  }
  return v.map((x) => String(x).trim()).filter(Boolean)
}

/**
 * Validate and normalize a partial or full config. Returns { ok, config, errors }.
 */
export function validateSearchConfig(input, { base = defaultSearchConfig() } = {}) {
  const errors = []
  const raw = isPlainObject(input) ? input : {}
  const cfg = structuredClone(base)

  if (raw.schema_version != null && Number(raw.schema_version) !== CONFIG_SCHEMA_VERSION) {
    errors.push(`unsupported schema_version: ${raw.schema_version}`)
  }
  cfg.schema_version = CONFIG_SCHEMA_VERSION

  if (raw.revision != null) {
    const rev = Number(raw.revision)
    if (!Number.isInteger(rev) || rev < 0) errors.push('revision must be a non-negative integer')
    else cfg.revision = rev
  }

  if (isPlainObject(raw.location)) {
    cfg.location.departments = asStringArray(raw.location.departments, 'location.departments', errors)
    cfg.location.communes = asStringArray(raw.location.communes, 'location.communes', errors)
    if (raw.location.radius_km != null && raw.location.radius_km !== '') {
      const r = Number(raw.location.radius_km)
      if (!Number.isFinite(r) || r < 0 || r > 500) errors.push('location.radius_km out of range')
      else cfg.location.radius_km = r
    } else {
      cfg.location.radius_km = null
    }
    if (raw.location.prefer_remote != null) {
      cfg.location.prefer_remote = Boolean(raw.location.prefer_remote)
    }
  }
  if (!cfg.location.departments.length && !cfg.location.communes.length) {
    errors.push('location requires at least one department or commune')
  }

  if (isPlainObject(raw.roles)) {
    if (raw.roles.preset != null) {
      const p = String(raw.roles.preset)
      if (p && !ROLE_PRESETS[p]) errors.push(`unknown roles.preset: ${p}`)
      cfg.roles.preset = p || null
    }
    cfg.roles.selected = asStringArray(raw.roles.selected, 'roles.selected', errors)
    cfg.roles.include_keywords = asStringArray(
      raw.roles.include_keywords,
      'roles.include_keywords',
      errors,
    )
    cfg.roles.exclude_keywords = asStringArray(
      raw.roles.exclude_keywords,
      'roles.exclude_keywords',
      errors,
    )
  }
  if (!cfg.roles.selected.length) {
    errors.push('roles.selected must not be empty')
  }

  if (isPlainObject(raw.contracts)) {
    cfg.contracts.types = asStringArray(raw.contracts.types, 'contracts.types', errors).filter(
      (t) => {
        if (!CONTRACT_TYPES.includes(t)) {
          errors.push(`unknown contract type: ${t}`)
          return false
        }
        return true
      },
    )
    cfg.contracts.remote = asStringArray(raw.contracts.remote, 'contracts.remote', errors).filter(
      (m) => {
        if (!REMOTE_MODES.includes(m)) {
          errors.push(`unknown remote mode: ${m}`)
          return false
        }
        return true
      },
    )
  }

  if (isPlainObject(raw.sources)) {
    cfg.sources.enabled = asStringArray(raw.sources.enabled, 'sources.enabled', errors).filter(
      (s) => {
        if (!SOURCE_IDS.includes(s)) {
          errors.push(`unknown source: ${s}`)
          return false
        }
        return true
      },
    )
  }
  if (!cfg.sources.enabled.length) {
    errors.push('sources.enabled must not be empty')
  }

  if (isPlainObject(raw.schedule)) {
    if (raw.schedule.cron != null) {
      const cron = String(raw.schedule.cron).trim()
      const parts = cron.split(/\s+/)
      if (parts.length !== 5) errors.push('schedule.cron must have 5 fields')
      cfg.schedule.cron = cron
    }
    if (raw.schedule.timezone != null) {
      cfg.schedule.timezone = String(raw.schedule.timezone)
    }
    if (raw.schedule.enabled != null) {
      cfg.schedule.enabled = Boolean(raw.schedule.enabled)
    }
    if (raw.schedule.daily_application_target != null) {
      const t = Number(raw.schedule.daily_application_target)
      if (!Number.isInteger(t) || t < 0 || t > 50) {
        errors.push('schedule.daily_application_target out of range')
      } else {
        cfg.schedule.daily_application_target = t
      }
    }
    if (raw.schedule.catch_up != null) {
      cfg.schedule.catch_up = Boolean(raw.schedule.catch_up)
    }
  }

  if (isPlainObject(raw.scoring)) {
    if (raw.scoring.engine != null) cfg.scoring.engine = String(raw.scoring.engine)
    if (raw.scoring.feedback_learning != null) {
      cfg.scoring.feedback_learning = Boolean(raw.scoring.feedback_learning)
    }
  }

  return { ok: errors.length === 0, config: cfg, errors }
}

/** Stable hash excluding revision / volatile metadata. */
export function configHash(config) {
  const clone = structuredClone(config)
  delete clone.revision
  const json = JSON.stringify(clone, Object.keys(clone).sort())
  return createHash('sha256').update(json).digest('hex').slice(0, 16)
}

export function redactedConfig(config) {
  return {
    ...config,
    config_hash: configHash(config),
  }
}

export function sourcesNeedFt(sources) {
  const list = Array.isArray(sources) ? sources : DEFAULT_SOURCES
  return list.map(String).includes('ft')
}

export function normalizeSourceList(sources) {
  if (sources == null || sources === '') return [...DEFAULT_SOURCES]
  const raw = Array.isArray(sources)
    ? sources
    : String(sources)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  const out = []
  for (const s of raw) {
    if (SOURCE_IDS.includes(s) && !out.includes(s)) out.push(s)
  }
  return out.length ? out : [...DEFAULT_SOURCES]
}
