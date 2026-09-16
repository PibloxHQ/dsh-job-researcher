/**
 * dsh-job-researcher — Settings section: ops + offer triage UI.
 */
window.__ModuleLoader__.load({
  id: 'dsh-job-researcher',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime')
    const { useEffect, useState, useCallback } = React

    const PLUGIN_ID = 'dsh-job-researcher'
    const SECTION_ID = 'job-researcher'
    const LOCALE_NS = 'settings.job-researcher'
    const API = '/api/job-researcher'
    const ORDER = 42

    const DICT = {
      en: {
        nav: 'Job Researcher',
        title: 'DSH Job Researcher',
        runNow: 'Run now',
        running: 'Running…',
        refresh: 'Refresh',
        filters: 'Filters',
        search: 'Search',
        source: 'Source',
        decision: 'Decision',
        minScore: 'Min score',
        yes: 'YES',
        no: 'NO',
        maybe: 'MAYBE',
        comment: 'Comment',
        save: 'Save',
        lastRun: 'Last run',
        nextRun: 'Next scheduled',
        sources: 'Sources',
        empty: 'No offers match filters.',
        detail: 'Offer detail',
      },
      fr: {
        nav: 'Job Researcher',
        title: 'DSH Job Researcher',
        runNow: 'Lancer maintenant',
        running: 'En cours…',
        refresh: 'Rafraîchir',
        filters: 'Filtres',
        search: 'Recherche',
        source: 'Source',
        decision: 'Décision',
        minScore: 'Score min',
        yes: 'OUI',
        no: 'NON',
        maybe: 'PEUT-ÊTRE',
        comment: 'Commentaire',
        save: 'Enregistrer',
        lastRun: 'Dernier run',
        nextRun: 'Prochain run',
        sources: 'Sources',
        empty: 'Aucune offre pour ces filtres.',
        detail: 'Détail offre',
      },
    }

    const css = {
      root: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '72rem' },
      h2: { margin: 0, fontSize: '1.25rem', fontWeight: 600 },
      ops: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
        gap: '0.75rem',
        padding: '0.75rem',
        border: '1px solid rgba(127,127,127,0.25)',
        borderRadius: '8px',
      },
      card: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
      muted: { opacity: 0.7, fontSize: '0.8rem' },
      row: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
      input: {
        padding: '0.4rem 0.55rem',
        borderRadius: '6px',
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'transparent',
        minWidth: '8rem',
      },
      btn: {
        padding: '0.4rem 0.75rem',
        borderRadius: '6px',
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'transparent',
        cursor: 'pointer',
      },
      btnPrimary: {
        padding: '0.4rem 0.75rem',
        borderRadius: '6px',
        border: 'none',
        background: '#c9a227',
        color: '#111',
        cursor: 'pointer',
        fontWeight: 600,
      },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
      th: {
        textAlign: 'left',
        padding: '0.4rem',
        borderBottom: '1px solid rgba(127,127,127,0.3)',
        opacity: 0.8,
      },
      td: { padding: '0.45rem 0.4rem', borderBottom: '1px solid rgba(127,127,127,0.15)', verticalAlign: 'top' },
      badge: {
        display: 'inline-block',
        minWidth: '2rem',
        textAlign: 'center',
        padding: '0.1rem 0.35rem',
        borderRadius: '4px',
        fontWeight: 700,
        fontSize: '0.8rem',
      },
      drawer: {
        padding: '0.75rem',
        border: '1px solid rgba(127,127,127,0.25)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      },
      error: { color: '#ef4444', fontSize: '0.85rem' },
    }

    function scoreColor(score) {
      if (score == null) return 'rgba(127,127,127,0.3)'
      if (score >= 3) return 'rgba(22,163,74,0.35)'
      if (score >= 1) return 'rgba(201,162,39,0.35)'
      return 'rgba(185,28,28,0.3)'
    }

    function tBound(ctx) {
      return (key) => {
        try {
          const v = ctx.locale?.t?.(LOCALE_NS + '.' + key)
          if (v && v !== LOCALE_NS + '.' + key) return v
        } catch {
          /* fallthrough */
        }
        return DICT.fr[key] || DICT.en[key] || key
      }
    }

    async function api(path, opts) {
      const res = await fetch(API + path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
        ...opts,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      return data
    }

    function JobResearcherSection(props) {
      const t = props.t || ((k) => DICT.fr[k] || k)
      const [status, setStatus] = useState(null)
      const [offers, setOffers] = useState({ total: 0, rows: [] })
      const [q, setQ] = useState('')
      const [source, setSource] = useState('')
      const [decision, setDecision] = useState('UNREVIEWED')
      const [minScore, setMinScore] = useState('')
      const [selected, setSelected] = useState(null)
      const [comment, setComment] = useState('')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const [page, setPage] = useState(0)
      const limit = 40

      const load = useCallback(async () => {
        setErr('')
        try {
          const [st, list] = await Promise.all([
            api('/status'),
            api(
              `/offers?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&decision=${encodeURIComponent(decision)}&minScore=${encodeURIComponent(minScore)}&limit=${limit}&offset=${page * limit}`,
            ),
          ])
          setStatus(st)
          setOffers(list)
        } catch (e) {
          setErr(String(e.message || e))
        }
      }, [q, source, decision, minScore, page])

      useEffect(() => {
        void load()
        const id = setInterval(() => void load(), 15_000)
        return () => clearInterval(id)
      }, [load])

      async function runNow() {
        setBusy(true)
        setErr('')
        try {
          await api('/run', { method: 'POST', body: '{}' })
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      async function decide(id, dec) {
        setBusy(true)
        setErr('')
        try {
          const r = await api(`/offers/${id}/decision`, {
            method: 'PATCH',
            body: JSON.stringify({ decision: dec, comment }),
          })
          setSelected(r.offer)
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      const latest = status?.latest_run
      const sched = status?.schedule

      return jsxs('div', {
        'data-plugin': PLUGIN_ID,
        'data-testid': 'dsh-job-researcher',
        style: css.root,
        children: [
          jsx('h2', { style: css.h2, children: t('title') }),
          jsxs('div', {
            style: css.ops,
            children: [
              jsxs('div', {
                style: css.card,
                children: [
                  jsx('span', { style: css.muted, children: t('lastRun') }),
                  jsx('strong', {
                    children: latest
                      ? `#${latest.id} ${latest.status} · new ${latest.offers_new || 0}`
                      : '—',
                  }),
                ],
              }),
              jsxs('div', {
                style: css.card,
                children: [
                  jsx('span', { style: css.muted, children: t('nextRun') }),
                  jsx('strong', { children: sched?.next_run_at || '—' }),
                ],
              }),
              jsxs('div', {
                style: css.card,
                children: [
                  jsx('span', { style: css.muted, children: t('sources') }),
                  jsx('strong', {
                    children: (status?.sources || [])
                      .map((s) => `${s.source}${s.last_error ? '!' : ''}`)
                      .join(', ') || '—',
                  }),
                ],
              }),
              jsxs('div', {
                style: css.card,
                children: [
                  jsx('span', { style: css.muted, children: 'Total' }),
                  jsx('strong', { children: status?.stats?.total ?? '—' }),
                ],
              }),
            ],
          }),
          jsxs('div', {
            style: css.row,
            children: [
              jsx('button', {
                type: 'button',
                style: css.btnPrimary,
                disabled: busy || sched?.running,
                onClick: runNow,
                children: busy || sched?.running ? t('running') : t('runNow'),
              }),
              jsx('button', {
                type: 'button',
                style: css.btn,
                onClick: () => void load(),
                children: t('refresh'),
              }),
            ],
          }),
          jsxs('div', {
            style: css.row,
            children: [
              jsx('input', {
                style: css.input,
                placeholder: t('search'),
                value: q,
                onChange: (e) => {
                  setPage(0)
                  setQ(e.target.value)
                },
              }),
              jsxs('select', {
                style: css.input,
                value: source,
                onChange: (e) => {
                  setPage(0)
                  setSource(e.target.value)
                },
                children: [
                  jsx('option', { value: '', children: t('source') + ' *' }),
                  jsx('option', { value: 'csp', children: 'csp' }),
                  jsx('option', { value: 'et', children: 'et' }),
                  jsx('option', { value: 'ft', children: 'ft' }),
                ],
              }),
              jsxs('select', {
                style: css.input,
                value: decision,
                onChange: (e) => {
                  setPage(0)
                  setDecision(e.target.value)
                },
                children: [
                  jsx('option', { value: '', children: t('decision') + ' *' }),
                  jsx('option', { value: 'UNREVIEWED', children: 'UNREVIEWED' }),
                  jsx('option', { value: 'YES', children: 'YES' }),
                  jsx('option', { value: 'NO', children: 'NO' }),
                  jsx('option', { value: 'MAYBE', children: 'MAYBE' }),
                ],
              }),
              jsx('input', {
                style: { ...css.input, minWidth: '5rem' },
                placeholder: t('minScore'),
                value: minScore,
                onChange: (e) => {
                  setPage(0)
                  setMinScore(e.target.value)
                },
              }),
            ],
          }),
          err ? jsx('div', { style: css.error, children: err }) : null,
          jsxs('div', {
            style: { overflowX: 'auto' },
            children: [
              jsxs('table', {
                style: css.table,
                children: [
                  jsx('thead', {
                    children: jsxs('tr', {
                      children: [
                        jsx('th', { style: css.th, children: 'Score' }),
                        jsx('th', { style: css.th, children: 'Titre' }),
                        jsx('th', { style: css.th, children: 'Entreprise' }),
                        jsx('th', { style: css.th, children: 'Lieu' }),
                        jsx('th', { style: css.th, children: 'Src' }),
                        jsx('th', { style: css.th, children: 'Décision' }),
                        jsx('th', { style: css.th, children: 'Actions' }),
                      ],
                    }),
                  }),
                  jsx('tbody', {
                    children:
                      (offers.rows || []).length === 0
                        ? jsx('tr', {
                            children: jsx('td', {
                              style: css.td,
                              colSpan: 7,
                              children: t('empty'),
                            }),
                          })
                        : offers.rows.map((row) =>
                            jsxs(
                              'tr',
                              {
                                onClick: () => {
                                  setSelected(row)
                                  setComment(row.user_comment || '')
                                },
                                style: {
                                  cursor: 'pointer',
                                  background:
                                    selected?.id === row.id ? 'rgba(201,162,39,0.08)' : 'transparent',
                                },
                                children: [
                                  jsx('td', {
                                    style: css.td,
                                    children: jsx('span', {
                                      style: {
                                        ...css.badge,
                                        background: scoreColor(row.score),
                                      },
                                      children: row.score ?? '—',
                                    }),
                                  }),
                                  jsx('td', { style: css.td, children: row.title }),
                                  jsx('td', { style: css.td, children: row.employer }),
                                  jsx('td', {
                                    style: css.td,
                                    children: `${row.location || '—'} · ${row.remote || '?'}`,
                                  }),
                                  jsx('td', { style: css.td, children: row.source }),
                                  jsx('td', { style: css.td, children: row.user_decision }),
                                  jsxs('td', {
                                    style: css.td,
                                    children: [
                                      jsx('button', {
                                        type: 'button',
                                        style: css.btn,
                                        onClick: (e) => {
                                          e.stopPropagation()
                                          void decide(row.id, 'YES')
                                        },
                                        children: '✓',
                                      }),
                                      jsx('button', {
                                        type: 'button',
                                        style: css.btn,
                                        onClick: (e) => {
                                          e.stopPropagation()
                                          void decide(row.id, 'NO')
                                        },
                                        children: '✗',
                                      }),
                                      jsx('button', {
                                        type: 'button',
                                        style: css.btn,
                                        onClick: (e) => {
                                          e.stopPropagation()
                                          void decide(row.id, 'MAYBE')
                                        },
                                        children: '?',
                                      }),
                                    ],
                                  }),
                                ],
                              },
                              row.id,
                            ),
                          ),
                  }),
                ],
              }),
              jsxs('div', {
                style: { ...css.row, marginTop: '0.5rem' },
                children: [
                  jsx('span', {
                    style: css.muted,
                    children: `${offers.total || 0} offres · page ${page + 1}`,
                  }),
                  jsx('button', {
                    type: 'button',
                    style: css.btn,
                    disabled: page === 0,
                    onClick: () => setPage((p) => Math.max(0, p - 1)),
                    children: '←',
                  }),
                  jsx('button', {
                    type: 'button',
                    style: css.btn,
                    disabled: (page + 1) * limit >= (offers.total || 0),
                    onClick: () => setPage((p) => p + 1),
                    children: '→',
                  }),
                ],
              }),
            ],
          }),
          selected
            ? jsxs('div', {
                style: css.drawer,
                children: [
                  jsx('strong', { children: t('detail') }),
                  jsx('div', { children: selected.title }),
                  jsx('div', {
                    style: css.muted,
                    children: `${selected.employer} · ${selected.location} · ${selected.source}`,
                  }),
                  selected.url
                    ? jsx('a', {
                        href: selected.url,
                        target: '_blank',
                        rel: 'noreferrer',
                        children: selected.url,
                      })
                    : null,
                  jsx('div', {
                    style: css.muted,
                    children: `score=${selected.score} (${selected.score_version || '—'}) ${selected.score_classification || ''}`,
                  }),
                  selected.score_details
                    ? jsx('pre', {
                        style: { whiteSpace: 'pre-wrap', fontSize: '0.8rem', margin: 0 },
                        children: selected.score_details,
                      })
                    : null,
                  jsx('div', {
                    style: { maxHeight: '12rem', overflow: 'auto', fontSize: '0.85rem' },
                    children: selected.description || '—',
                  }),
                  jsx('textarea', {
                    style: { ...css.input, minHeight: '4rem', width: '100%' },
                    placeholder: t('comment'),
                    value: comment,
                    onChange: (e) => setComment(e.target.value),
                  }),
                  jsxs('div', {
                    style: css.row,
                    children: [
                      jsx('button', {
                        type: 'button',
                        style: css.btnPrimary,
                        disabled: busy,
                        onClick: () => void decide(selected.id, 'YES'),
                        children: t('yes'),
                      }),
                      jsx('button', {
                        type: 'button',
                        style: css.btn,
                        disabled: busy,
                        onClick: () => void decide(selected.id, 'NO'),
                        children: t('no'),
                      }),
                      jsx('button', {
                        type: 'button',
                        style: css.btn,
                        disabled: busy,
                        onClick: () => void decide(selected.id, 'MAYBE'),
                        children: t('maybe'),
                      }),
                    ],
                  }),
                ],
              })
            : null,
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
