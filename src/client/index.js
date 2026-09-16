/**
 * dsh-job-researcher — WebUI Settings section (scaffold placeholder).
 * Pattern: ModuleLoader + settings.section (same as dsh-piblox-secrets / theme).
 */
window.__ModuleLoader__.load({
  id: 'dsh-job-researcher',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const PLUGIN_ID = 'dsh-job-researcher'
    const SECTION_ID = 'job-researcher'
    const LOCALE_NS = 'settings.job-researcher'
    const ORDER = 42

    const DICT = {
      en: {
        nav: 'Job Researcher',
        title: 'DSH Job Researcher',
        body: 'Plugin bootstrap OK',
        note: 'Scaffold only — Hermes job-radar + cron remain the live pipeline until migration.',
      },
      fr: {
        nav: 'Job Researcher',
        title: 'DSH Job Researcher',
        body: 'Plugin bootstrap OK',
        note: 'Squelette uniquement — le pipeline Hermes job-radar + cron reste actif jusqu’à migration.',
      },
    }

    function tBound(ctx) {
      return (key) => {
        try {
          const v = ctx.locale?.t?.(LOCALE_NS + '.' + key)
          if (v && v !== LOCALE_NS + '.' + key) return v
        } catch {
          /* fall through */
        }
        return DICT.en[key] || key
      }
    }

    function JobResearcherSection(props) {
      const t = props.t || ((k) => DICT.en[k] || k)
      return jsxs('div', {
        'data-plugin': PLUGIN_ID,
        'data-testid': 'dsh-job-researcher-bootstrap',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1rem 0',
          maxWidth: '40rem',
        },
        children: [
          jsx('h2', {
            style: { margin: 0, fontSize: '1.25rem', fontWeight: 600 },
            children: t('title'),
          }),
          jsx('p', {
            style: { margin: 0, fontSize: '1rem', opacity: 0.92 },
            children: t('body'),
          }),
          jsx('p', {
            style: { margin: 0, fontSize: '0.875rem', opacity: 0.7 },
            children: t('note'),
          }),
        ],
      })
    }

    function apply(ctx) {
      if (!ctx.slots || !ctx.slots.inject) return

      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, { en: DICT.en, fr: DICT.fr }),
        `${PLUGIN_ID}: locale`,
      )

      const t = tBound(ctx)
      const injected = () => ({ t })

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: SECTION_ID,
            order: ORDER,
            label: () => t('nav'),
            locale: LOCALE_NS,
            inject: injected,
          },
          JobResearcherSection,
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale', 'settingsScope']
    exports.JobResearcherSection = JobResearcherSection
    return module.exports
  },
})
