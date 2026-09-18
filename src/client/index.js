/**
 * dsh-job-researcher — global main panel (session-like) + offer detail modal.
 * Visual language: --dsw-alias-* tokens only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-job-researcher',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime')
    const { createPortal } = require('react-dom')
    const { useEffect, useState, useCallback, useRef } = React

    const PLUGIN_ID = 'dsh-job-researcher'
    const PANEL_ID = 'job-researcher'
    const SECTION_ID = 'job-researcher'
    const LOCALE_NS = 'job-researcher'
    const SETTINGS_LOCALE_NS = 'settings.job-researcher'
    const API = '/api/job-researcher'
    const ORDER = 20
    const SETTINGS_ORDER = 17
    const SOURCE_OPTIONS = ['csp-filtre', 'et', 'ft']
    const SOURCE_LABELS = {
      'csp-filtre': 'CSP Filtre',
      csp: 'CSP Filtre',
      et: 'Emploi territorial',
      ft: 'France Travail',
    }
    const UNDO_MS = 8000

    const FEEDBACK_TAG_META = [
      { id: 'location_good', labelFr: 'Bon lieu' },
      { id: 'too_far', labelFr: 'Trop loin' },
      { id: 'dev_infra_good', labelFr: 'Bon fit infra/dev' },
      { id: 'support_good', labelFr: 'Support OK' },
      { id: 'support_bad', labelFr: 'Support non' },
      { id: 'public_sector_good', labelFr: 'Secteur public OK' },
      { id: 'student_contract_bad', labelFr: 'Alternance/stage non' },
      { id: 'contract_bad', labelFr: 'Contrat non' },
      { id: 'missing_diploma', labelFr: 'Diplôme manquant' },
      { id: 'needs_details', labelFr: 'Manque de détails' },
    ]

    const DICT = {
      en: {
        nav: 'Job Researcher',
        title: 'Job Researcher',
        runNow: 'Run now',
        running: 'Running…',
        refresh: 'Refresh',
        search: 'Search',
        source: 'Source',
        decision: 'Interest',
        application: 'Application',
        minScore: 'Min score',
        yes: "I'm interested",
        no: 'Not interested',
        maybe: 'Revisit later',
        comment: 'Optional free comment',
        lastRun: 'Last run',
        nextRun: 'Next scheduled',
        sources: 'Sources',
        empty: 'No offers match filters.',
        detail: 'Offer detail',
        dailyProgress: 'Daily applications',
        dailyTz: 'Europe/Paris',
        markApplied: 'Mark submitted (external application done)',
        toPrepare: 'À préparer',
        ready: 'Prête',
        applied: 'Envoyée',
        appNone: '—',
        applicationHint:
          'Application state is separate from interest. Starts empty until you begin prep. Never auto-applies. Mark submitted only after you personally submitted outside DSH.',
        whyHeading: 'Why this choice?',
        whyHelper:
          'Explain with tags and a free comment — both update ranking after save (no application sent).',
        saveFeedback: 'Save feedback',
        feedbackSaved: 'Feedback saved — ranking updating…',
        rankingUpdating: 'Ranking updating in background…',
        systemScore: 'Score explanation (system)',
        learning: 'Learning',
        prevPage: 'Previous page',
        nextPage: 'Next page',
        close: 'Close',
        backToChat: 'Back to chat',
        openAria: 'Open Job Researcher',
        closeDetail: 'Close detail',
        openOffer: 'Open offer',
        readiness: 'Readiness',
        settings: 'Settings',
        openSettings: 'Open Job Researcher settings',
        settingsHint: 'Open Settings → Job Researcher',
        needsSetupTitle: 'Setup required',
        needsSetupBody:
          'Configure location, sources, and FT secrets before the first run.',
        openSettingsCta: 'Open settings',
        bootstrapCta: 'Run bootstrap',
        undo: 'Undo',
        undoBanner: 'Decision updated',
        retry: 'Retry',
        unsavedChanges: 'Unsaved changes',
        runAccepted: 'Run accepted — collecting in background.',
        resetUnreviewed: 'Reset to review',
        unreviewed: 'To review',
        prevOffer: 'Previous',
        nextOffer: 'Next',
        description: 'Description',
        excerptHint: 'Excerpt provided by the source — open the full listing for the complete text.',
        noDescription: 'No description available.',
        whyThisOffer: 'Why this offer?',
        scoreDetail: 'Score details',
        scoreGood: 'Good match',
        scoreReview: 'Worth reviewing',
        scoreLow: 'Few matching criteria',
        scoreUnknown: 'Score not calculated',
        scoreNoReasons: 'No system reasons available yet.',
        sourceInfo: 'Source information',
        myInterest: 'My interest',
        myFeedback: 'My feedback',
        openExternal: 'View listing ↗',
        noExternalUrl: 'No external URL',
        moreActions: 'More',
        copyLink: 'Copy link',
        copyTitle: 'Copy title',
        linkCopied: 'Link copied',
        titleCopied: 'Title copied',
        copyFailed: 'Could not copy',
        notSpecified: 'Not specified',
        contract: 'Contract',
        remote: 'Remote',
        remoteYes: 'Remote',
        remoteHybrid: 'Hybrid',
        remoteNo: 'On-site',
        remoteUnknown: 'Remote TBD',
        match: 'Match',
        untitledOffer: 'Untitled offer',
        externalId: 'External id',
        collectedAt: 'Collected',
        appliedOn: 'Submitted on',
        clearApplied: 'Clear submitted status',
        appNoneStarted: 'Not started',
        allCriteria: 'All criteria',
        viewAll: 'All',
        moreFilters: 'More filters',
        clearFilters: 'Clear all',
        densityComfort: 'Comfortable',
        densityCompact: 'Compact',
        density: 'Density',
        activity: 'Activity',
        offersTab: 'Offers',
        applicationsTab: 'Applications',
        filtersActive: 'filters active',
      },
      fr: {
        nav: 'Job Researcher',
        title: 'Job Researcher',
        runNow: 'Lancer maintenant',
        running: 'En cours…',
        refresh: 'Rafraîchir',
        search: 'Recherche',
        source: 'Source',
        decision: 'Intérêt',
        application: 'Candidature',
        minScore: 'Score min',
        yes: "M'intéresse",
        no: 'Pas intéressé',
        maybe: 'À revoir',
        comment: 'Commentaire libre (optionnel)',
        lastRun: 'Dernier run',
        nextRun: 'Prochain run',
        sources: 'Sources',
        empty: 'Aucune offre pour ces filtres.',
        detail: 'Détail offre',
        dailyProgress: 'Candidatures du jour',
        dailyTz: 'Europe/Paris',
        markApplied: 'Marquer envoyée (candidature externe terminée)',
        toPrepare: 'À préparer',
        ready: 'Prête',
        applied: 'Envoyée',
        appNone: '—',
        applicationHint:
          'État candidature ≠ intérêt. Vide tant que tu n’as pas démarré la prep. Jamais d’envoi auto. Envoyée seulement après soumission manuelle hors DSH.',
        whyHeading: 'Pourquoi ce choix ?',
        whyHelper:
          'Les tags et ton commentaire libre influencent le classement après enregistrement (pas d’envoi de candidature).',
        saveFeedback: 'Enregistrer le retour',
        feedbackSaved: 'Retour enregistré — classement en cours de mise à jour…',
        rankingUpdating: 'Classement en cours de mise à jour…',
        systemScore: 'Explication du score (système)',
        learning: 'Apprentissage',
        prevPage: 'Page précédente',
        nextPage: 'Page suivante',
        close: 'Fermer',
        backToChat: 'Retour au chat',
        openAria: 'Ouvrir Job Researcher',
        closeDetail: 'Fermer le détail',
        openOffer: 'Ouvrir l’offre',
        readiness: 'État',
        settings: 'Réglages',
        openSettings: 'Ouvrir les réglages Job Researcher',
        settingsHint: 'Ouvrir Settings → Job Researcher',
        needsSetupTitle: 'Configuration requise',
        needsSetupBody:
          'Configure la zone, les sources et les secrets FT avant le premier run.',
        openSettingsCta: 'Ouvrir les réglages',
        bootstrapCta: 'Lancer le bootstrap',
        undo: 'Annuler',
        undoBanner: 'Décision mise à jour',
        retry: 'Réessayer',
        unsavedChanges: 'Modifications non enregistrées',
        runAccepted: 'Run accepté — collecte en arrière-plan.',
        resetUnreviewed: 'Remettre à examiner',
        unreviewed: 'À examiner',
        prevOffer: 'Précédente',
        nextOffer: 'Suivante',
        description: 'Description',
        excerptHint: 'Extrait fourni par la source — consultez l’annonce complète pour le texte entier.',
        noDescription: 'Aucune description disponible.',
        whyThisOffer: 'Pourquoi cette offre ?',
        scoreDetail: 'Voir le détail du score',
        scoreGood: 'Bonne correspondance',
        scoreReview: 'À examiner',
        scoreLow: 'Peu de critères correspondants',
        scoreUnknown: 'Score non calculé',
        scoreNoReasons: 'Aucune raison système pour l’instant.',
        sourceInfo: 'Informations de la source',
        myInterest: 'Mon intérêt',
        myFeedback: 'Mon retour',
        openExternal: 'Consulter l’annonce ↗',
        noExternalUrl: 'Pas d’URL externe',
        moreActions: 'Plus',
        copyLink: 'Copier le lien',
        copyTitle: 'Copier le titre',
        linkCopied: 'Lien copié',
        titleCopied: 'Titre copié',
        copyFailed: 'Copie impossible',
        notSpecified: 'Non précisé',
        contract: 'Contrat',
        remote: 'Télétravail',
        remoteYes: 'Télétravail',
        remoteHybrid: 'Hybride',
        remoteNo: 'Sur site',
        remoteUnknown: 'Télétravail à préciser',
        match: 'Correspondance',
        untitledOffer: 'Offre sans titre',
        externalId: 'Identifiant source',
        collectedAt: 'Collectée',
        appliedOn: 'Envoyée le',
        clearApplied: 'Retirer le statut envoyée',
        appNoneStarted: 'Non commencée',
        allCriteria: 'Tous les critères',
        viewAll: 'Toutes',
        moreFilters: 'Plus de filtres',
        clearFilters: 'Tout effacer',
        densityComfort: 'Confortable',
        densityCompact: 'Compact',
        density: 'Affichage',
        activity: 'Activité',
        offersTab: 'Offres',
        applicationsTab: 'Mes candidatures',
        filtersActive: 'filtres actifs',
      },
    }

    const SETTINGS_DICT = {
      en: {
        nav: 'Job Researcher',
        title: 'Job Researcher',
        subtitle: 'Search profile — no secrets stored here.',
        location: 'Departments',
        locationHint: 'Comma-separated INSEE department codes (e.g. 38)',
        sources: 'Enabled sources',
        scheduleCron: 'Schedule cron (UTC)',
        dailyTarget: 'Daily application target',
        load: 'Reload',
        save: 'Save',
        validate: 'Validate',
        saved: 'Saved',
        validated: 'Valid',
        invalid: 'Invalid',
        secretsLink: 'Secrets FT → Settings → Secrets',
        secretsHint: 'FT credentials live in the Secrets vault — never shown here.',
        readiness: 'Readiness',
        revision: 'Revision',
        error: 'Error',
        loading: 'Loading…',
        departmentsRequired: 'At least one department code is required.',
        conflict: 'Conflict: configuration was changed elsewhere.',
        conflictReload: 'Reload remote',
        dirtyConfirm: 'Discard unsaved settings changes?',
        newProfile: 'New profile',
        sectionSearch: 'My search',
        sectionSources: 'Sources',
        sectionRhythm: 'Rhythm',
        sectionPrefs: 'Preferences',
        sectionAdvanced: 'Advanced',
        summaryPrefix: 'Searching in',
        summaryFor: 'for',
        summaryVia: 'via',
        summaryAt: 'schedule',
        discard: 'Discard changes',
        jobsHint: 'Job titles / keywords (optional — used when sources support it)',
        jobs: 'Target roles',
      },
      fr: {
        nav: 'Job Researcher',
        title: 'Job Researcher',
        subtitle: 'Profil de recherche — aucun secret ici.',
        location: 'Départements',
        locationHint: 'Codes département INSEE séparés par des virgules (ex. 38)',
        sources: 'Sources activées',
        scheduleCron: 'Cron (UTC)',
        dailyTarget: 'Objectif candidatures / jour',
        load: 'Recharger',
        save: 'Enregistrer',
        validate: 'Valider',
        saved: 'Enregistré',
        validated: 'Valide',
        invalid: 'Invalide',
        secretsLink: 'Secrets FT → Settings → Secrets',
        secretsHint: 'Les identifiants FT sont dans le coffre Secrets — jamais affichés ici.',
        readiness: 'État',
        revision: 'Révision',
        error: 'Erreur',
        loading: 'Chargement…',
        departmentsRequired: 'Au moins un code département est requis.',
        conflict: 'Conflit : la configuration a été modifiée ailleurs.',
        conflictReload: 'Recharger le distant',
        dirtyConfirm: 'Abandonner les modifications non enregistrées ?',
        newProfile: 'Nouveau profil',
        sectionSearch: 'Ma recherche',
        sectionSources: 'Sources',
        sectionRhythm: 'Rythme',
        sectionPrefs: 'Préférences',
        sectionAdvanced: 'Avancé',
        summaryPrefix: 'Recherche dans',
        summaryFor: 'pour',
        summaryVia: 'via',
        summaryAt: 'horaire',
        discard: 'Annuler les modifications',
        jobsHint: 'Métiers / mots-clés (optionnel — si les sources le supportent)',
        jobs: 'Métiers ciblés',
      },
    }

    const css = {
      panel: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, transparent))',
      },
      navbar: {
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 1.25rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      navBrand: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        minWidth: 0,
      },
      navTitle: {
        margin: 0,
        fontSize: '1.05rem',
        fontWeight: 600,
        letterSpacing: '-0.02em',
      },
      navMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem 1.1rem',
        alignItems: 'center',
        fontSize: '0.78rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      navMetaItem: {
        display: 'inline-flex',
        gap: '0.3rem',
        alignItems: 'baseline',
      },
      navActions: {
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        flex: 'none',
      },
      body: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.85rem 1.25rem 1.25rem',
      },
      toolbar: {
        flex: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'center',
      },
      listPane: {
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        scrollbarGutter: 'stable',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: '0.55rem',
        background: 'var(--dsw-alias-bg-layer-2)',
        padding: '0.5rem',
      },
      muted: {
        fontSize: '0.8rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        opacity: 0.9,
      },
      input: {
        boxSizing: 'border-box',
        padding: '0.5rem 0.65rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.9rem',
        minWidth: '8rem',
      },
      btn: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        minHeight: '2rem',
        minWidth: '2rem',
        padding: '0.4rem 0.75rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: 'pointer',
      },
      btnPrimary: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        minHeight: '2rem',
        padding: '0.45rem 0.9rem',
        borderRadius: '0.45rem',
        border: '0.5px solid transparent',
        background: 'var(--dsw-alias-button-primary-fill)',
        color:
          'var(--dsw-alias-label-primary-foreground, var(--dsw-alias-brand-primary-invert))',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: 'pointer',
      },
      btnDisabled: { opacity: 0.55, cursor: 'not-allowed' },
      btnIcon: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        width: '1.75rem',
        height: '1.75rem',
        minWidth: '1.75rem',
        minHeight: '1.75rem',
        padding: 0,
        borderRadius: '0.4rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.8rem',
        lineHeight: 1,
        cursor: 'pointer',
        flex: 'none',
      },
      actionCell: {
        padding: '0.45rem 0.4rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      },
      actionGroup: {
        display: 'inline-flex',
        flexWrap: 'nowrap',
        gap: '0.25rem',
        alignItems: 'center',
      },
      titleBtn: {
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'var(--dsw-alias-label-primary, inherit)',
        textAlign: 'left',
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: '0.12em',
      },
      undoBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        padding: '0.45rem 0.75rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        fontSize: '0.85rem',
      },
      table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.875rem',
        font: 'inherit',
      },
      th: {
        textAlign: 'left',
        padding: '0.4rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        position: 'sticky',
        top: 0,
        background: 'var(--dsw-alias-bg-layer-2)',
        zIndex: 1,
      },
      td: {
        padding: '0.45rem 0.4rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        verticalAlign: 'top',
      },
      selectedRow: {
        background: 'var(--dsw-alias-bg-layer-3)',
        outline: '0.5px solid var(--dsw-alias-border-l2)',
      },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '2rem',
        padding: '0.15rem 0.45rem',
        borderRadius: '0.45rem',
        fontWeight: 600,
        fontSize: '0.8rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-3)',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      badgeHigh: {
        color: 'var(--dsw-alias-state-success-primary)',
        background:
          'color-mix(in oklab, var(--dsw-alias-state-success-primary) 14%, transparent)',
        border:
          '0.5px solid color-mix(in oklab, var(--dsw-alias-state-success-primary) 40%, transparent)',
      },
      badgeMid: {
        color: 'var(--dsw-alias-label-secondary, inherit)',
        background: 'var(--dsw-alias-bg-layer-3)',
      },
      badgeLow: {
        color: 'var(--dsw-alias-state-error-primary)',
        background:
          'color-mix(in oklab, var(--dsw-alias-state-error-primary) 14%, transparent)',
        border:
          '0.5px solid color-mix(in oklab, var(--dsw-alias-state-error-primary) 40%, transparent)',
      },
      row: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'center',
      },
      sectionTitle: {
        margin: 0,
        fontSize: '0.95rem',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      hint: {
        margin: 0,
        fontSize: '0.75rem',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
      },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.55rem',
        borderRadius: '0.45rem',
        fontSize: '0.8rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        cursor: 'pointer',
        minHeight: '2rem',
      },
      chipOn: {
        background: 'var(--dsw-alias-bg-layer-3)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        fontWeight: 600,
      },
      error: {
        fontSize: '0.85rem',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      ok: {
        fontSize: '0.85rem',
        color: 'var(--dsw-alias-state-success-primary)',
      },
      pre: {
        whiteSpace: 'pre-wrap',
        fontSize: '0.8rem',
        margin: 0,
        padding: '0.55rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      description: {
        fontSize: '0.85rem',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      modalRoot: {
        position: 'fixed',
        inset: 0,
        zIndex: 10_000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        pointerEvents: 'auto',
      },
      modalMask: {
        position: 'absolute',
        inset: 0,
        background: 'color-mix(in oklab, black 55%, transparent)',
      },
      modalDialog: {
        position: 'relative',
        zIndex: 1,
        width: 'min(44rem, 100%)',
        maxHeight: 'min(88vh, 52rem)',
        overflow: 'auto',
        scrollbarGutter: 'stable',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem 1.1rem 1.15rem',
        borderRadius: '0.65rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #0b0d10))',
        color: 'var(--dsw-alias-label-primary, inherit)',
        boxShadow: '0 18px 48px color-mix(in oklab, black 45%, transparent)',
      },
      modalHeader: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.75rem',
      },
      iconWrap: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--dsw-alias-label-primary, inherit)',
        opacity: 0.92,
      },
      iconActive: {
        color: 'var(--dsw-alias-button-primary-fill, inherit)',
        opacity: 1,
      },
      readinessBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.2rem 0.55rem',
        borderRadius: '0.4rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      },
      emptyState: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '1.25rem 1rem',
        borderRadius: '0.55rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      settingsPage: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '40rem',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      settingsTitle: {
        margin: 0,
        fontSize: '1.25rem',
        letterSpacing: '-0.02em',
      },
      settingsSubtitle: {
        margin: '0.25rem 0 0',
        fontSize: '0.9rem',
        lineHeight: 1.4,
        color: 'var(--dsw-alias-label-secondary, inherit)',
        opacity: 0.9,
      },
      settingsSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        padding: '0.85rem 0',
        borderTop: '0.5px solid var(--dsw-alias-border-l2)',
      },
      settingsField: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
      },
      settingsLabel: {
        fontSize: '0.8rem',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      settingsHint: {
        margin: 0,
        fontSize: '0.75rem',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
      },
      checkboxRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem 1.1rem',
        alignItems: 'center',
        fontSize: '0.85rem',
      },
      inlineSettings: {
        flex: 'none',
        padding: '0.85rem 1.25rem 1.25rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        overflow: 'auto',
        maxHeight: '55%',
      },
      modalDialogWide: {
        position: 'relative',
        zIndex: 1,
        width: 'min(72rem, 100%)',
        maxHeight: 'min(92vh, 56rem)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '0.65rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #0b0d10))',
        color: 'var(--dsw-alias-label-primary, inherit)',
        boxShadow: '0 18px 48px color-mix(in oklab, black 45%, transparent)',
      },
      sheetTopBar: {
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.65rem 1rem',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      sheetNavGroup: {
        display: 'flex',
        gap: '0.4rem',
        flexWrap: 'wrap',
      },
      sheetBody: {
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        scrollbarGutter: 'stable',
        padding: '1rem 1.15rem 1.35rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      },
      sheetHeader: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      },
      sheetTitle: {
        margin: 0,
        fontSize: '1.35rem',
        lineHeight: 1.25,
        fontWeight: 650,
        letterSpacing: '-0.02em',
      },
      sheetSub: {
        margin: 0,
        fontSize: '0.92rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      metaGrid: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        marginTop: '0.35rem',
      },
      metaChip: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.2rem 0.55rem',
        borderRadius: '0.4rem',
        fontSize: '0.78rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      sheetGrid: {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.6fr) minmax(16rem, 0.9fr)',
        gap: '1.25rem',
        alignItems: 'start',
      },
      sheetMain: {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      },
      sheetAside: {
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        padding: '0.85rem',
        borderRadius: '0.55rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      descriptionReadable: {
        fontSize: '0.95rem',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.55,
        maxWidth: '42rem',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      reasonList: {
        margin: '0.35rem 0 0.5rem',
        paddingLeft: '1.15rem',
        fontSize: '0.88rem',
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      dropdownRoot: {
        position: 'relative',
        display: 'block',
        width: '100%',
      },
      dropdownTrigger: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        width: '100%',
        minHeight: '2.25rem',
        padding: '0.4rem 0.65rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-3, transparent)',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: 'pointer',
        textAlign: 'left',
      },
      dropdownLabel: {
        fontSize: '0.72rem',
        color: 'var(--dsw-alias-label-tertiary, inherit)',
        flex: 'none',
      },
      dropdownValue: {
        flex: 1,
        minWidth: 0,
        fontWeight: 600,
        textAlign: 'left',
      },
      dropdownMenu: {
        position: 'absolute',
        zIndex: 20,
        right: 0,
        top: 'calc(100% + 0.25rem)',
        minWidth: '100%',
        margin: 0,
        padding: '0.3rem',
        listStyle: 'none',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, #0b0d10))',
        boxShadow: '0 10px 28px color-mix(in oklab, black 35%, transparent)',
      },
      dropdownItem: {
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        minHeight: '2rem',
        padding: '0.35rem 0.55rem',
        border: 'none',
        borderRadius: '0.35rem',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: '0.85rem',
        cursor: 'pointer',
        textAlign: 'left',
      },
      dropdownItemActive: {
        background: 'var(--dsw-alias-bg-layer-3)',
        fontWeight: 600,
      },
      accordion: {
        marginTop: '0.55rem',
        borderTop: '0.5px solid var(--dsw-alias-border-l2)',
        paddingTop: '0.45rem',
      },
      accordionBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        fontSize: '0.85rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        cursor: 'pointer',
        minHeight: '2rem',
      },
      accordionBody: {
        marginTop: '0.45rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
      },
      externalLinkBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '2.25rem',
        padding: '0.4rem 0.75rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.85rem',
        textDecoration: 'none',
        textAlign: 'center',
      },
      feedbackBlock: {
        marginTop: '0.35rem',
        paddingTop: '0.75rem',
        borderTop: '0.5px solid var(--dsw-alias-border-l2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
      },
      tagGroupLabel: {
        fontSize: '0.72rem',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-tertiary, inherit)',
        marginBottom: '0.2rem',
      },
      linkBtn: {
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        fontSize: '0.8rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        textDecoration: 'underline',
        textUnderlineOffset: '0.12em',
        cursor: 'pointer',
        alignSelf: 'flex-start',
        minHeight: '2rem',
      },
      deflist: {
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        fontSize: '0.8rem',
      },
      viewTabs: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
      },
      viewTab: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        minHeight: '2rem',
        padding: '0.3rem 0.7rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, inherit)',
        font: 'inherit',
        fontSize: '0.82rem',
        cursor: 'pointer',
      },
      viewTabOn: {
        background: 'var(--dsw-alias-bg-layer-3)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        fontWeight: 600,
      },
      filterChips: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
      },
      filterChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        minHeight: '1.75rem',
        padding: '0.15rem 0.55rem',
        borderRadius: '0.4rem',
        border: '0.5px solid var(--dsw-alias-border-l3)',
        background: 'var(--dsw-alias-bg-layer-3)',
        fontSize: '0.75rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      offerCard: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.7rem 0.75rem',
        borderRadius: '0.5rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        marginBottom: '0.45rem',
      },
      offerCardSelected: {
        outline: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-3)',
      },
      offerCardMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.45rem 0.75rem',
        fontSize: '0.78rem',
        color: 'var(--dsw-alias-label-secondary, inherit)',
      },
      settingsSectionTitle: {
        margin: 0,
        fontSize: '0.95rem',
        fontWeight: 650,
        letterSpacing: '-0.01em',
      },
      settingsSummary: {
        margin: 0,
        padding: '0.65rem 0.75rem',
        borderRadius: '0.45rem',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: '0.85rem',
        lineHeight: 1.4,
      },
    }

    function scoreBadgeStyle(score) {
      if (score == null) return css.badge
      if (score >= 3) return { ...css.badge, ...css.badgeHigh }
      if (score >= 1) return { ...css.badge, ...css.badgeMid }
      return { ...css.badge, ...css.badgeLow }
    }

    function applicationLabel(t, status) {
      if (status === 'READY') return t('ready')
      if (status === 'APPLIED') return t('applied')
      if (status === 'TO_PREPARE') return t('toPrepare')
      return t('appNone')
    }

    function btnStyle(base, disabled) {
      return disabled ? { ...base, ...css.btnDisabled } : base
    }

    function parseScoreDetails(raw) {
      if (!raw) return null
      if (typeof raw === 'object') return raw
      try {
        return JSON.parse(raw)
      } catch {
        return { reasons: [String(raw)] }
      }
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

    function settingsTBound(ctx) {
      return (key) => {
        try {
          const v = ctx.locale?.t?.(SETTINGS_LOCALE_NS + '.' + key)
          if (v && v !== SETTINGS_LOCALE_NS + '.' + key) return v
        } catch {
          /* fallthrough */
        }
        return SETTINGS_DICT.fr[key] || SETTINGS_DICT.en[key] || key
      }
    }

    function readinessBadgeStyle(state) {
      const base = { ...css.readinessBadge }
      if (state === 'ready') {
        return {
          ...base,
          borderColor: 'var(--dsw-alias-border-l3)',
          color: 'var(--dsw-alias-label-primary, inherit)',
          background: 'color-mix(in oklab, var(--dsw-alias-button-primary-fill) 22%, transparent)',
        }
      }
      if (state === 'degraded' || state === 'running' || state === 'installing') {
        return {
          ...base,
          color: 'var(--dsw-alias-label-secondary, inherit)',
          background: 'var(--dsw-alias-bg-layer-3, transparent)',
        }
      }
      if (state === 'blocked' || state === 'needs_setup') {
        return {
          ...base,
          color: 'var(--dsw-alias-label-primary, inherit)',
          background: 'color-mix(in oklab, var(--dsw-alias-label-primary) 10%, transparent)',
        }
      }
      return base
    }

    function ReadinessBadge(props) {
      const state = props.state || 'needs_setup'
      const message = props.message || state
      return jsx('span', {
        style: readinessBadgeStyle(state),
        title: message,
        'data-testid': 'job-researcher-readiness',
        'data-readiness': state,
        children: state,
      })
    }

    function tryOpenHostSettings(ctx, sectionId) {
      const target = sectionId || SECTION_ID
      try {
        if (typeof ctx?.layout?.openSettings === 'function') {
          ctx.layout.openSettings(target)
          return true
        }
        if (typeof ctx?.layout?.selectSettingsSection === 'function') {
          ctx.layout.selectSettingsSection(target)
          return true
        }
        if (typeof ctx?.layout?.navigate === 'function') {
          ctx.layout.navigate({ settings: target })
          return true
        }
      } catch {
        /* ignore */
      }
      return false
    }

    async function api(path, opts) {
      const res = await fetch(API + path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
        ...opts,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`)
        err.status = res.status
        err.data = data
        throw err
      }
      return data
    }

    function sourceLabel(id) {
      return SOURCE_LABELS[id] || id
    }


    const FEEDBACK_TAG_GROUPS = [
      {
        id: 'location',
        labelFr: 'Lieu',
        labelEn: 'Location',
        tags: ['location_good', 'too_far'],
      },
      {
        id: 'job',
        labelFr: 'Métier',
        labelEn: 'Role',
        tags: ['dev_infra_good', 'support_good', 'support_bad', 'public_sector_good'],
      },
      {
        id: 'contract',
        labelFr: 'Contrat',
        labelEn: 'Contract',
        tags: ['student_contract_bad', 'contract_bad'],
      },
      {
        id: 'missing',
        labelFr: 'Informations manquantes',
        labelEn: 'Missing info',
        tags: ['missing_diploma', 'needs_details'],
      },
    ]

    const EXCLUSIVE_TAG_PAIRS = [
      ['location_good', 'too_far'],
      ['support_good', 'support_bad'],
    ]

    const DENSITY_KEY = 'dsh-jr-density'
    const VIEW_OPTIONS = [
      { id: '', labelKey: 'viewAll' },
      { id: 'UNREVIEWED', labelKey: 'unreviewed' },
      { id: 'YES', labelKey: 'yes' },
      { id: 'MAYBE', labelKey: 'maybe' },
      { id: 'NO', labelKey: 'no' },
    ]

    function decisionLabel(t, d) {
      if (d === 'YES') return t('yes')
      if (d === 'NO') return t('no')
      if (d === 'MAYBE') return t('maybe')
      if (d === 'UNREVIEWED' || !d) return t('unreviewed')
      return d || '—'
    }

    function scoreMatchLabel(t, score) {
      if (score == null || score === '') return t('scoreUnknown')
      const n = Number(score)
      if (!Number.isFinite(n)) return t('scoreUnknown')
      if (n >= 3) return t('scoreGood')
      if (n >= 1) return t('scoreReview')
      return t('scoreLow')
    }

    function remoteLabel(t, remote) {
      const r = String(remote || '').toLowerCase()
      if (r === 'yes' || r === 'full' || r === 'remote') return t('remoteYes')
      if (r === 'hybrid') return t('remoteHybrid')
      if (r === 'no' || r === 'onsite') return t('remoteNo')
      return t('remoteUnknown')
    }

    function metaOrUnknown(value, unknown) {
      const s = String(value || '').trim()
      return s ? s : unknown
    }

    function toggleExclusiveTags(prev, id) {
      let next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (!prev.includes(id)) {
        for (const pair of EXCLUSIVE_TAG_PAIRS) {
          if (!pair.includes(id)) continue
          next = next.filter((x) => x === id || !pair.includes(x))
        }
      }
      return [...new Set(next)].sort()
    }

    function DropdownMenu(props) {
      const {
        label,
        valueLabel,
        options,
        disabled,
        testId,
        onSelect,
        align = 'end',
      } = props
      const [open, setOpen] = useState(false)
      const rootRef = useRef(null)
      const btnRef = useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onDoc = (e) => {
          if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            e.stopImmediatePropagation()
            e.preventDefault()
            setOpen(false)
            btnRef.current?.focus?.()
          }
        }
        document.addEventListener('mousedown', onDoc)
        window.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('mousedown', onDoc)
          window.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      return jsxs('div', {
        ref: rootRef,
        style: css.dropdownRoot,
        'data-testid': testId || undefined,
        children: [
          jsxs('button', {
            type: 'button',
            ref: btnRef,
            style: btnStyle(css.dropdownTrigger, disabled),
            disabled,
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            onClick: () => setOpen((v) => !v),
            children: [
              jsx('span', { style: css.dropdownLabel, children: label }),
              jsx('span', { style: css.dropdownValue, children: valueLabel }),
              jsx('span', { 'aria-hidden': true, children: '▾' }),
            ],
          }),
          open
            ? jsx('ul', {
                role: 'menu',
                style: {
                  ...css.dropdownMenu,
                  ...(align === 'start' ? { left: 0, right: 'auto' } : {}),
                },
                children: options.map((opt) =>
                  jsx(
                    'li',
                    {
                      role: 'none',
                      children: jsxs('button', {
                        type: 'button',
                        role: 'menuitemradio',
                        'aria-checked': Boolean(opt.checked),
                        style: {
                          ...css.dropdownItem,
                          ...(opt.checked ? css.dropdownItemActive : {}),
                          ...(opt.danger ? { color: 'var(--dsw-alias-state-error-primary)' } : {}),
                        },
                        disabled: Boolean(opt.disabled),
                        onClick: () => {
                          setOpen(false)
                          onSelect?.(opt.value)
                          btnRef.current?.focus?.()
                        },
                        children: [
                          jsx('span', { children: opt.label }),
                          opt.checked ? jsx('span', { 'aria-hidden': true, children: '✓' }) : null,
                        ],
                      }),
                    },
                    String(opt.value),
                  ),
                ),
              })
            : null,
        ],
      })
    }

    function Accordion(props) {
      const { title, children, testId, defaultOpen = false } = props
      const [open, setOpen] = useState(defaultOpen)
      return jsxs('div', {
        style: css.accordion,
        'data-testid': testId || undefined,
        children: [
          jsx('button', {
            type: 'button',
            style: css.accordionBtn,
            'aria-expanded': open,
            onClick: () => setOpen((v) => !v),
            children: `${open ? '▾' : '▸'} ${title}`,
          }),
          open ? jsx('div', { style: css.accordionBody, children }) : null,
        ],
      })
    }


    function JobResearcherSettings(props) {
      const t = props.t || ((k) => k)
      const openSecrets = props.openSecrets
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const [fieldErr, setFieldErr] = useState('')
      const [msg, setMsg] = useState('')
      const [conflict, setConflict] = useState(false)
      const [configLoaded, setConfigLoaded] = useState(false)
      const [allowNewProfile, setAllowNewProfile] = useState(false)
      const [dirty, setDirty] = useState(false)
      const [revision, setRevision] = useState(0)
      const [departments, setDepartments] = useState('')
      const [cron, setCron] = useState('0 12 * * *')
      const [dailyTarget, setDailyTarget] = useState(0)
      const [enabled, setEnabled] = useState({
        'csp-filtre': true,
        et: true,
        ft: true,
      })
      const [readiness, setReadiness] = useState(null)
      const [readinessMsg, setReadinessMsg] = useState('')

      const applyConfig = useCallback((config, version) => {
        const deps = config?.location?.departments
        setDepartments(Array.isArray(deps) ? deps.join(', ') : '')
        setCron(config?.schedule?.cron || '0 12 * * *')
        const n = Number(config?.schedule?.daily_application_target)
        setDailyTarget(Number.isFinite(n) ? n : 0)
        const src = config?.sources?.enabled || SOURCE_OPTIONS
        const next = {}
        for (const id of SOURCE_OPTIONS) next[id] = src.includes(id)
        setEnabled(next)
        setRevision(Number(version) || Number(config?.revision) || 0)
        setDirty(false)
        setFieldErr('')
        setConflict(false)
      }, [])

      const load = useCallback(
        async ({ confirmDirty } = {}) => {
          if (confirmDirty && dirty) {
            if (!window.confirm(t('dirtyConfirm'))) return
          }
          setErr('')
          setMsg('')
          setConflict(false)
          try {
            const [cfgRes, st] = await Promise.all([api('/config'), api('/status')])
            applyConfig(cfgRes.config || {}, cfgRes.version)
            setReadiness(st.readiness || st.status || null)
            setReadinessMsg(st.message || '')
            setConfigLoaded(true)
            setAllowNewProfile(false)
          } catch (e) {
            setErr(String(e.message || e))
          }
        },
        [applyConfig, dirty, t],
      )

      useEffect(() => {
        void load()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
      }, [])

      function markDirty() {
        setDirty(true)
        setMsg('')
      }

      function buildPayload() {
        const deps = departments
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (!deps.length) {
          const message = t('departmentsRequired')
          setFieldErr(message)
          throw new Error(message)
        }
        setFieldErr('')
        const n = Number(dailyTarget)
        return {
          location: { departments: deps },
          sources: {
            enabled: SOURCE_OPTIONS.filter((id) => enabled[id]),
          },
          schedule: {
            cron: cron.trim(),
            daily_application_target: Number.isFinite(n) ? n : 0,
          },
        }
      }

      const canEdit = configLoaded || allowNewProfile

      async function onValidate() {
        if (!canEdit) return
        setBusy(true)
        setErr('')
        setMsg('')
        try {
          const r = await api('/config/validate', {
            method: 'POST',
            body: JSON.stringify({ config: buildPayload() }),
          })
          setMsg(r.ok ? t('validated') : t('invalid'))
          if (!r.ok && r.errors?.length) setErr(r.errors.join('; '))
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      async function onSave() {
        if (!canEdit) return
        setBusy(true)
        setErr('')
        setMsg('')
        setConflict(false)
        try {
          const r = await api('/config', {
            method: 'PUT',
            body: JSON.stringify({
              config: buildPayload(),
              expected_revision: revision,
            }),
          })
          applyConfig(r.config || {}, r.version)
          setConfigLoaded(true)
          setAllowNewProfile(false)
          setMsg(t('saved'))
          const st = await api('/status')
          setReadiness(st.readiness || st.status || null)
          setReadinessMsg(st.message || '')
        } catch (e) {
          if (e.status === 409) {
            setConflict(true)
            setErr(t('conflict'))
          } else {
            setErr(String(e.message || e))
          }
        } finally {
          setBusy(false)
        }
      }

      function handleOpenSecrets() {
        if (typeof openSecrets === 'function' && openSecrets()) return
      }

      return jsxs('div', {
        className: 'dsh-job-researcher-settings',
        'data-testid': 'job-researcher-settings',
        style: css.settingsPage,
        children: [
          jsxs('div', {
            children: [
              jsx('h2', { style: css.settingsTitle, children: t('title') }),
              jsx('p', { style: css.settingsSubtitle, children: t('subtitle') }),
            ],
          }),
          jsxs('div', {
            style: { display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' },
            children: [
              jsx(ReadinessBadge, { state: readiness || 'needs_setup', message: readinessMsg }),
              jsxs('span', {
                style: css.settingsHint,
                children: [t('revision'), ': ', String(revision)],
              }),
              !configLoaded
                ? jsx('span', {
                    style: css.settingsHint,
                    children: t('loading'),
                  })
                : null,
            ],
          }),
          jsx('p', {
            style: css.settingsSummary,
            'data-testid': 'jr-settings-summary',
            children: `${t('summaryPrefix')} [${departments.trim() || '—'}], ${t('summaryVia')} [${SOURCE_OPTIONS.filter((id) => enabled[id]).map(sourceLabel).join(', ') || '—'}], ${t('summaryAt')} [${cron.trim() || '—'}]`,
          }),
          jsxs('div', {
            style: css.settingsSection,
            'data-testid': 'jr-settings-section-search',
            children: [
              jsx('h3', { style: css.settingsSectionTitle, children: t('sectionSearch') }),
              jsxs('div', {
                style: css.settingsField,
                children: [
                  jsx('label', {
                    style: css.settingsLabel,
                    htmlFor: 'jr-departments',
                    children: t('location'),
                  }),
                  jsx('input', {
                    id: 'jr-departments',
                    style: { ...css.input, width: '100%', minWidth: 0 },
                    value: departments,
                    disabled: busy || !canEdit,
                    onChange: (e) => {
                      setDepartments(e.target.value)
                      markDirty()
                    },
                    'data-testid': 'jr-settings-departments',
                  }),
                  jsx('p', { style: css.settingsHint, children: t('locationHint') }),
                  fieldErr
                    ? jsx('p', {
                        style: { ...css.muted, color: 'var(--dsw-alias-label-primary)' },
                        role: 'alert',
                        children: fieldErr,
                      })
                    : null,
                ],
              }),
            ],
          }),
          jsxs('div', {
            style: css.settingsSection,
            'data-testid': 'jr-settings-section-sources',
            children: [
              jsx('h3', { style: css.settingsSectionTitle, children: t('sectionSources') }),
              jsxs('div', {
                style: css.settingsField,
                children: [
                  jsx('span', { style: css.settingsLabel, children: t('sources') }),
                  jsxs('div', {
                    style: css.checkboxRow,
                    'data-testid': 'jr-settings-sources',
                    children: SOURCE_OPTIONS.map((id) =>
                      jsxs(
                        'label',
                        {
                          style: { display: 'inline-flex', gap: '0.35rem', alignItems: 'center' },
                          children: [
                            jsx('input', {
                              type: 'checkbox',
                              checked: Boolean(enabled[id]),
                              disabled: busy || !canEdit,
                              onChange: (e) => {
                                setEnabled((prev) => ({ ...prev, [id]: e.target.checked }))
                                markDirty()
                              },
                            }),
                            sourceLabel(id),
                          ],
                        },
                        id,
                      ),
                    ),
                  }),
                ],
              }),
              jsx('p', { style: css.settingsHint, children: t('secretsHint') }),
              jsx('button', {
                type: 'button',
                style: {
                  ...css.settingsLabel,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '0.15em',
                  font: 'inherit',
                  color: 'inherit',
                },
                'data-testid': 'jr-settings-secrets-link',
                onClick: handleOpenSecrets,
                children: t('secretsLink'),
              }),
            ],
          }),
          jsxs('div', {
            style: css.settingsSection,
            'data-testid': 'jr-settings-section-rhythm',
            children: [
              jsx('h3', { style: css.settingsSectionTitle, children: t('sectionRhythm') }),
              jsxs('div', {
                style: css.settingsField,
                children: [
                  jsx('label', {
                    style: css.settingsLabel,
                    htmlFor: 'jr-daily-target',
                    children: t('dailyTarget'),
                  }),
                  jsx('input', {
                    id: 'jr-daily-target',
                    type: 'number',
                    min: 0,
                    max: 50,
                    style: { ...css.input, width: '8rem' },
                    value: dailyTarget,
                    disabled: busy || !canEdit,
                    onChange: (e) => {
                      setDailyTarget(e.target.value)
                      markDirty()
                    },
                    'data-testid': 'jr-settings-daily-target',
                  }),
                ],
              }),
              jsx(Accordion, {
                title: t('sectionAdvanced'),
                testId: 'jr-settings-advanced',
                children: jsxs('div', {
                  style: css.settingsField,
                  children: [
                    jsx('label', {
                      style: css.settingsLabel,
                      htmlFor: 'jr-cron',
                      children: t('scheduleCron'),
                    }),
                    jsx('input', {
                      id: 'jr-cron',
                      style: { ...css.input, width: '100%', minWidth: 0 },
                      value: cron,
                      disabled: busy || !canEdit,
                      onChange: (e) => {
                        setCron(e.target.value)
                        markDirty()
                      },
                      'data-testid': 'jr-settings-cron',
                    }),
                  ],
                }),
              }),
            ],
          }),
          jsxs('div', {
            style: css.settingsSection,
            'data-testid': 'jr-settings-section-prefs',
            children: [
              jsx('h3', { style: css.settingsSectionTitle, children: t('sectionPrefs') }),
              jsx('p', {
                style: css.settingsHint,
                children: t('subtitle'),
              }),
            ],
          }),
          jsxs('div', {
            style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
            children: [
              jsx('button', {
                type: 'button',
                style: btnStyle(css.btn, busy),
                disabled: busy,
                onClick: () => void load({ confirmDirty: true }),
                children: t('load'),
              }),
              dirty
                ? jsx('button', {
                    type: 'button',
                    style: btnStyle(css.btn, busy),
                    disabled: busy,
                    'data-testid': 'jr-settings-discard',
                    onClick: () => void load({ confirmDirty: true }),
                    children: t('discard'),
                  })
                : null,
              !configLoaded
                ? jsx('button', {
                    type: 'button',
                    style: btnStyle(css.btn, busy),
                    disabled: busy,
                    onClick: () => {
                      setAllowNewProfile(true)
                      setDepartments('')
                      setDirty(true)
                    },
                    children: t('newProfile'),
                  })
                : null,
              jsx('button', {
                type: 'button',
                style: btnStyle(css.btn, busy || !canEdit),
                disabled: busy || !canEdit,
                onClick: () => void onValidate(),
                'data-testid': 'jr-settings-validate',
                children: t('validate'),
              }),
              jsx('button', {
                type: 'button',
                style: btnStyle(css.btnPrimary, busy || !canEdit),
                disabled: busy || !canEdit,
                onClick: () => void onSave(),
                'data-testid': 'jr-settings-save',
                children: t('save'),
              }),
              conflict
                ? jsx('button', {
                    type: 'button',
                    style: btnStyle(css.btn, busy),
                    disabled: busy,
                    onClick: () => void load({ confirmDirty: true }),
                    children: t('conflictReload'),
                  })
                : null,
            ],
          }),
          msg
            ? jsx('div', { style: css.muted, role: 'status', children: msg })
            : null,
          err
            ? jsx('div', {
                style: { ...css.muted, color: 'var(--dsw-alias-label-primary)' },
                role: 'alert',
                children: err,
              })
            : null,
        ],
      })
    }

    /** Small mark for sidebar panellist + navbar. */
    function JobMark(props) {
      const size = props.size || 16
      return jsxs('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        children: [
          jsx('path', {
            d: 'M8.5 7.25V6.5A2.5 2.5 0 0 1 11 4h2a2.5 2.5 0 0 1 2.5 2.5v.75',
            stroke: 'currentColor',
            strokeWidth: 1.75,
            strokeLinecap: 'round',
          }),
          jsx('path', {
            d: 'M4.75 8.25h14.5A1.75 1.75 0 0 1 21 10v8.25A1.75 1.75 0 0 1 19.25 20H4.75A1.75 1.75 0 0 1 3 18.25V10a1.75 1.75 0 0 1 1.75-1.75Z',
            fill: 'color-mix(in oklab, currentColor 18%, transparent)',
            stroke: 'currentColor',
            strokeWidth: 1.75,
          }),
          jsx('path', {
            d: 'M3 12.25h18',
            stroke: 'currentColor',
            strokeWidth: 1.75,
            strokeLinecap: 'round',
          }),
          jsx('circle', {
            cx: 12,
            cy: 15.75,
            r: 1.6,
            fill: 'currentColor',
          }),
        ],
      })
    }

    function JobResearcherIcon(props) {
      const { size = 16, active } = props
      return jsx('span', {
        style: { ...css.iconWrap, ...(active ? css.iconActive : {}) },
        'data-testid': 'job-researcher-icon',
        children: jsx(JobMark, { size }),
      })
    }


    function OfferDetailModal(props) {
      const {
        t,
        selected,
        busy,
        offerBusy,
        comment,
        tags,
        draftDirty,
        feedbackMsg,
        err,
        offersRows,
        onClose,
        onNavigate,
        onComment,
        onToggleTag,
        onSaveFeedback,
        onDecide,
        onAppStatus,
      } = props
      const closeBtnRef = useRef(null)
      const bodyRef = useRef(null)
      const previousActiveRef = useRef(null)
      const onCloseRef = useRef(onClose)
      const [showAllTags, setShowAllTags] = useState(false)
      const [copiedMsg, setCopiedMsg] = useState('')
      const rowBusy = selected ? Boolean(offerBusy?.[selected.id]) : false
      const controlsBusy = busy || rowBusy

      const rows = Array.isArray(offersRows) ? offersRows : []
      const idx = selected ? rows.findIndex((r) => r.id === selected.id) : -1
      const prevRow = idx > 0 ? rows[idx - 1] : null
      const nextRow = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : null

      useEffect(() => {
        onCloseRef.current = onClose
      }, [onClose])

      // Focus Fermer only when the offer identity changes — not on every
      // parent re-render (comment keystrokes recreate onClose and stole focus).
      useEffect(() => {
        if (!selected) return undefined
        previousActiveRef.current = document.activeElement
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        if (bodyRef.current) bodyRef.current.scrollTop = 0
        const focusTimer = window.setTimeout(() => {
          const btn =
            closeBtnRef.current ||
            document.querySelector('[data-testid="offer-detail-close"]')
          btn?.focus?.()
        }, 0)
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onCloseRef.current?.()
        }
        window.addEventListener('keydown', onKey, false)
        return () => {
          window.clearTimeout(focusTimer)
          window.removeEventListener('keydown', onKey, false)
          document.body.style.overflow = prevOverflow
          const prev = previousActiveRef.current
          if (prev && typeof prev.focus === 'function') {
            try {
              prev.focus()
            } catch {
              /* ignore */
            }
          }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- selected.id only
      }, [selected?.id])

      useEffect(() => {
        setShowAllTags(false)
        setCopiedMsg('')
      }, [selected?.id])

      if (!selected) return null

      const scoreDetails = parseScoreDetails(selected.score_details)
      const reasons = Array.isArray(scoreDetails?.reasons)
        ? scoreDetails.reasons.filter(Boolean)
        : []
      const systemText =
        selected.system_reason ||
        (reasons.length ? reasons.join('\n') : '') ||
        ''
      const shortReasons = reasons.slice(0, 3)
      const unknown = t('notSpecified')
      const contract = metaOrUnknown(selected.contract_type, unknown)
      const remote = remoteLabel(t, selected.remote)
      const matchLabel = scoreMatchLabel(t, selected.score)
      const interestLabel = decisionLabel(t, selected.user_decision)
      const appLabel = applicationLabel(t, selected.application_status)
      const desc = String(selected.description || '').trim()
      const isExcerpt = Boolean(desc) && desc.length < 280 && !desc.includes('\n\n')

      const interestOptions = [
        { value: 'YES', label: t('yes'), checked: selected.user_decision === 'YES' },
        { value: 'MAYBE', label: t('maybe'), checked: selected.user_decision === 'MAYBE' },
        { value: 'NO', label: t('no'), checked: selected.user_decision === 'NO' },
        {
          value: 'UNREVIEWED',
          label: t('unreviewed'),
          checked: !selected.user_decision || selected.user_decision === 'UNREVIEWED',
        },
      ]
      const appOptions = [
        {
          value: 'NONE',
          label: t('appNoneStarted'),
          checked: !selected.application_status || selected.application_status === 'NONE',
        },
        {
          value: 'TO_PREPARE',
          label: t('toPrepare'),
          checked: selected.application_status === 'TO_PREPARE',
        },
        {
          value: 'READY',
          label: t('ready'),
          checked: selected.application_status === 'READY',
        },
      ]
      const moreOptions = [
        {
          value: 'copy-link',
          label: t('copyLink'),
          checked: false,
          disabled: !selected.url,
        },
        { value: 'copy-title', label: t('copyTitle'), checked: false },
        {
          value: 'reset',
          label: t('resetUnreviewed'),
          checked: false,
          disabled: !selected.user_decision || selected.user_decision === 'UNREVIEWED',
        },
      ]

      async function copyText(text, okMsg) {
        try {
          await navigator.clipboard.writeText(text)
          setCopiedMsg(okMsg)
          window.setTimeout(() => setCopiedMsg(''), 2000)
        } catch {
          setCopiedMsg(t('copyFailed'))
        }
      }

      function handleMore(value) {
        if (value === 'copy-link' && selected.url) void copyText(selected.url, t('linkCopied'))
        if (value === 'copy-title') void copyText(selected.title || '', t('titleCopied'))
        if (value === 'reset') void onDecide(selected.id, 'UNREVIEWED', { force: true })
      }

      function navigateTo(row) {
        if (!row || typeof onNavigate !== 'function') return
        onNavigate(row)
      }

      const primaryGroups = FEEDBACK_TAG_GROUPS.slice(0, 2)
      const groups = showAllTags ? FEEDBACK_TAG_GROUPS : primaryGroups

      return createPortal(
        jsxs('div', {
          style: css.modalRoot,
          'data-testid': 'offer-detail-modal',
          children: [
            jsx('div', {
              style: css.modalMask,
              'aria-hidden': true,
              onClick: onClose,
            }),
            jsxs('div', {
              role: 'dialog',
              'aria-modal': true,
              'aria-label': t('detail'),
              'data-testid': 'offer-detail',
              style: css.modalDialogWide,
              children: [
                jsxs('div', {
                  style: css.sheetTopBar,
                  children: [
                    jsxs('div', {
                      style: css.sheetNavGroup,
                      children: [
                        jsx('button', {
                          type: 'button',
                          style: btnStyle(css.btn, !prevRow),
                          disabled: !prevRow,
                          'data-testid': 'offer-prev',
                          'aria-label': t('prevOffer'),
                          onClick: () => navigateTo(prevRow),
                          children: `← ${t('prevOffer')}`,
                        }),
                        jsx('button', {
                          type: 'button',
                          style: btnStyle(css.btn, !nextRow),
                          disabled: !nextRow,
                          'data-testid': 'offer-next',
                          'aria-label': t('nextOffer'),
                          onClick: () => navigateTo(nextRow),
                          children: `${t('nextOffer')} →`,
                        }),
                      ],
                    }),
                    jsx('button', {
                      type: 'button',
                      ref: closeBtnRef,
                      style: css.btn,
                      'aria-label': t('closeDetail'),
                      'data-testid': 'offer-detail-close',
                      onClick: onClose,
                      children: t('close'),
                    }),
                  ],
                }),
                jsxs('div', {
                  ref: bodyRef,
                  style: css.sheetBody,
                  children: [
                    jsxs('header', {
                      style: css.sheetHeader,
                      children: [
                        jsx('h2', {
                          style: css.sheetTitle,
                          'data-testid': 'offer-detail-title',
                          children: selected.title || t('untitledOffer'),
                        }),
                        jsx('p', {
                          style: css.sheetSub,
                          children: [
                            metaOrUnknown(selected.employer, unknown),
                            ' · ',
                            metaOrUnknown(selected.location, unknown),
                          ].join(''),
                        }),
                        jsxs('div', {
                          style: css.metaGrid,
                          children: [
                            jsxs('span', {
                              style: css.metaChip,
                              children: [t('contract'), ': ', contract],
                            }),
                            jsxs('span', {
                              style: css.metaChip,
                              children: [t('remote'), ': ', remote],
                            }),
                            jsxs('span', {
                              style: css.metaChip,
                              children: [t('source'), ': ', sourceLabel(selected.source)],
                            }),
                            jsxs('span', {
                              style: css.metaChip,
                              title: `${selected.score ?? '—'} · ${selected.score_version || '—'}`,
                              children: [t('match'), ': ', matchLabel],
                            }),
                          ],
                        }),
                      ],
                    }),
                    jsxs('div', {
                      className: 'jr-sheet-grid',
                      style: css.sheetGrid,
                      children: [
                        jsxs('div', {
                          style: css.sheetMain,
                          children: [
                            jsxs('section', {
                              'data-testid': 'offer-description',
                              children: [
                                jsx('h3', {
                                  style: css.sectionTitle,
                                  children: t('description'),
                                }),
                                isExcerpt
                                  ? jsx('p', {
                                      style: css.hint,
                                      children: t('excerptHint'),
                                    })
                                  : null,
                                jsx('div', {
                                  style: css.descriptionReadable,
                                  children: desc || t('noDescription'),
                                }),
                              ],
                            }),
                            jsxs('section', {
                              'data-testid': 'system-score',
                              style: { marginTop: '1.1rem' },
                              children: [
                                jsx('h3', {
                                  style: css.sectionTitle,
                                  children: t('whyThisOffer'),
                                }),
                                shortReasons.length
                                  ? jsx('ul', {
                                      style: css.reasonList,
                                      children: shortReasons.map((r, i) =>
                                        jsx('li', { children: r }, i),
                                      ),
                                    })
                                  : jsx('p', {
                                      style: css.muted,
                                      children: systemText
                                        ? systemText.split('\n').slice(0, 3).join(' · ')
                                        : t('scoreNoReasons'),
                                    }),
                                jsx(Accordion, {
                                  title: t('scoreDetail'),
                                  testId: 'score-detail-accordion',
                                  children: jsxs(Fragment, {
                                    children: [
                                      jsx('p', {
                                        style: css.muted,
                                        children: `${matchLabel} · score ${selected.score ?? '—'} (${
                                          selected.score_version || '—'
                                        })${
                                          selected.score_classification
                                            ? ` · ${selected.score_classification}`
                                            : ''
                                        }${
                                          scoreDetails?.feedback_adjustment
                                            ? ` · adj ${scoreDetails.feedback_adjustment}`
                                            : ''
                                        }`,
                                      }),
                                      jsx('pre', {
                                        style: css.pre,
                                        children: systemText || '—',
                                      }),
                                    ],
                                  }),
                                }),
                              ],
                            }),
                            jsx(Accordion, {
                              title: t('sourceInfo'),
                              testId: 'source-info-accordion',
                              children: jsxs('dl', {
                                style: css.deflist,
                                children: [
                                  jsxs('div', {
                                    children: [
                                      jsx('dt', { children: t('source') }),
                                      jsx('dd', { children: sourceLabel(selected.source) }),
                                    ],
                                  }),
                                  jsxs('div', {
                                    children: [
                                      jsx('dt', { children: 'ID' }),
                                      jsx('dd', { children: String(selected.id) }),
                                    ],
                                  }),
                                  jsxs('div', {
                                    children: [
                                      jsx('dt', { children: t('externalId') }),
                                      jsx('dd', {
                                        children: selected.external_id || '—',
                                      }),
                                    ],
                                  }),
                                  jsxs('div', {
                                    children: [
                                      jsx('dt', { children: t('collectedAt') }),
                                      jsx('dd', {
                                        children:
                                          selected.collected_at ||
                                          selected.created_at ||
                                          '—',
                                      }),
                                    ],
                                  }),
                                  selected.url
                                    ? jsxs('div', {
                                        children: [
                                          jsx('dt', { children: 'URL' }),
                                          jsx('dd', {
                                            children: jsx('a', {
                                              href: selected.url,
                                              target: '_blank',
                                              rel: 'noreferrer',
                                              children: t('openExternal'),
                                            }),
                                          }),
                                        ],
                                      })
                                    : null,
                                ],
                              }),
                            }),
                          ],
                        }),
                        jsxs('aside', {
                          style: css.sheetAside,
                          'data-testid': 'offer-actions-panel',
                          children: [
                            jsx(DropdownMenu, {
                              label: t('myInterest'),
                              valueLabel: interestLabel,
                              testId: 'interest-menu',
                              disabled: controlsBusy,
                              options: interestOptions,
                              onSelect: (v) =>
                                void onDecide(selected.id, v, {
                                  force: v === 'UNREVIEWED',
                                }),
                            }),
                            jsx(DropdownMenu, {
                              label: t('application'),
                              valueLabel: appLabel === t('appNone') ? t('appNoneStarted') : appLabel,
                              testId: 'application-menu',
                              disabled: controlsBusy,
                              options: appOptions,
                              onSelect: (v) => void onAppStatus(selected.id, v),
                            }),
                            selected.url
                              ? jsx('a', {
                                  href: selected.url,
                                  target: '_blank',
                                  rel: 'noreferrer',
                                  style: css.externalLinkBtn,
                                  'data-testid': 'open-external',
                                  children: t('openExternal'),
                                })
                              : jsx('span', {
                                  style: css.muted,
                                  children: t('noExternalUrl'),
                                }),
                            selected.applied_local_day
                              ? jsx('p', {
                                  style: css.hint,
                                  children: `${t('appliedOn')} ${selected.applied_local_day} (${t('dailyTz')})`,
                                })
                              : null,
                            selected.application_status !== 'APPLIED'
                              ? jsx('button', {
                                  type: 'button',
                                  style: btnStyle(css.btnPrimary, controlsBusy),
                                  disabled: controlsBusy,
                                  'data-testid': 'mark-applied',
                                  'aria-label': t('markApplied'),
                                  onClick: () => void onAppStatus(selected.id, 'APPLIED'),
                                  children: t('markApplied'),
                                })
                              : jsx('button', {
                                  type: 'button',
                                  style: btnStyle(css.btn, controlsBusy),
                                  disabled: controlsBusy,
                                  onClick: () => void onAppStatus(selected.id, 'NONE'),
                                  children: t('clearApplied'),
                                }),
                            jsx(DropdownMenu, {
                              label: t('moreActions'),
                              valueLabel: '…',
                              testId: 'more-actions-menu',
                              disabled: controlsBusy,
                              options: moreOptions,
                              onSelect: handleMore,
                            }),
                            copiedMsg
                              ? jsx('div', {
                                  style: css.ok,
                                  role: 'status',
                                  children: copiedMsg,
                                })
                              : null,
                            err
                              ? jsx('div', {
                                  style: css.error,
                                  role: 'alert',
                                  'data-testid': 'offer-detail-error',
                                  children: err,
                                })
                              : null,
                            jsxs('section', {
                              'data-testid': 'feedback-panel',
                              style: css.feedbackBlock,
                              children: [
                                jsx('h3', {
                                  style: css.sectionTitle,
                                  children: t('myFeedback'),
                                }),
                                jsx('p', { style: css.hint, children: t('whyHelper') }),
                                groups.map((group) =>
                                  jsxs(
                                    'div',
                                    {
                                      style: { marginBottom: '0.55rem' },
                                      children: [
                                        jsx('div', {
                                          style: css.tagGroupLabel,
                                          children: group.labelFr,
                                        }),
                                        jsxs('div', {
                                          style: css.row,
                                          role: 'group',
                                          'aria-label': group.labelFr,
                                          children: group.tags.map((tagId) => {
                                            const tag = FEEDBACK_TAG_META.find((x) => x.id === tagId)
                                            if (!tag) return null
                                            return jsx(
                                              'button',
                                              {
                                                type: 'button',
                                                style: {
                                                  ...css.chip,
                                                  ...(tags.includes(tag.id) ? css.chipOn : {}),
                                                },
                                                'aria-pressed': tags.includes(tag.id),
                                                onClick: () => onToggleTag(tag.id),
                                                children: tag.labelFr,
                                              },
                                              tag.id,
                                            )
                                          }),
                                        }),
                                      ],
                                    },
                                    group.id,
                                  ),
                                ),
                                !showAllTags
                                  ? jsx('button', {
                                      type: 'button',
                                      style: css.linkBtn,
                                      onClick: () => setShowAllTags(true),
                                      children: t('allCriteria'),
                                    })
                                  : null,
                                jsx('textarea', {
                                  style: { ...css.input, minHeight: '4.5rem', width: '100%' },
                                  placeholder: t('comment'),
                                  'aria-label': t('comment'),
                                  value: comment,
                                  onChange: (e) => onComment(e.target.value),
                                }),
                                draftDirty
                                  ? jsx('div', {
                                      style: css.muted,
                                      role: 'status',
                                      children: t('unsavedChanges'),
                                    })
                                  : null,
                                jsx('button', {
                                  type: 'button',
                                  style: btnStyle(css.btnPrimary, controlsBusy),
                                  disabled: controlsBusy,
                                  'data-testid': 'save-feedback',
                                  onClick: () => void onSaveFeedback(selected.id),
                                  children: t('saveFeedback'),
                                }),
                                feedbackMsg
                                  ? jsx('div', {
                                      style: css.ok,
                                      role: 'status',
                                      children: feedbackMsg,
                                    })
                                  : null,
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        document.body,
      )
    }


    function JobResearcherPanel(props) {
      const t = props.t || ((k) => DICT.fr[k] || DICT.en[k] || k)
      const closePanel = props.closePanel
      const openSettings = props.openSettings
      const openSecrets = props.openSecrets
      const [status, setStatus] = useState(null)
      const [offers, setOffers] = useState({ total: 0, rows: [] })
      const [qInput, setQInput] = useState('')
      const [q, setQ] = useState('')
      const [source, setSource] = useState('')
      const [decision, setDecision] = useState('')
      const [application, setApplication] = useState('')
      const [minScore, setMinScore] = useState('')
      const [selected, setSelected] = useState(null)
      const [comment, setComment] = useState('')
      const [tags, setTags] = useState([])
      const [draftDirty, setDraftDirty] = useState(false)
      const [busy, setBusy] = useState(false)
      const [runBusy, setRunBusy] = useState(false)
      const [offerBusy, setOfferBusy] = useState({})
      const [rowErrors, setRowErrors] = useState({})
      const [err, setErr] = useState('')
      const [listErr, setListErr] = useState('')
      const [statusErr, setStatusErr] = useState('')
      const [runMsg, setRunMsg] = useState('')
      const [feedbackMsg, setFeedbackMsg] = useState('')
      const [page, setPage] = useState(0)
      const [showSettingsInline, setShowSettingsInline] = useState(false)
      const [undoById, setUndoById] = useState(null)
      const [retryDecisionById, setRetryDecisionById] = useState({})
      const [showMoreFilters, setShowMoreFilters] = useState(false)
      const [showActivity, setShowActivity] = useState(false)
      const [listTab, setListTab] = useState('offers')
      const [density, setDensity] = useState(() => {
        try {
          return sessionStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfort'
        } catch {
          return 'comfort'
        }
      })
      const limit = 40

      const selectedRef = useRef(null)
      const draftsRef = useRef(new Map())
      const offersReqId = useRef(0)
      const decisionFilterRef = useRef(decision)
      const pageRef = useRef(page)
      const commentRef = useRef(comment)
      const tagsRef = useRef(tags)
      const offerBusyRef = useRef({})

      useEffect(() => {
        selectedRef.current = selected
      }, [selected])
      useEffect(() => {
        decisionFilterRef.current = decision
      }, [decision])
      useEffect(() => {
        pageRef.current = page
      }, [page])
      useEffect(() => {
        commentRef.current = comment
      }, [comment])
      useEffect(() => {
        tagsRef.current = tags
      }, [tags])
      useEffect(() => {
        offerBusyRef.current = offerBusy
      }, [offerBusy])

      useEffect(() => {
        try {
          sessionStorage.setItem(DENSITY_KEY, density)
        } catch {
          /* ignore */
        }
      }, [density])

      const readiness = status?.readiness || status?.status || null
      const canRun =
        status?.can_run === true || status?.can_run_public === true
      const needsSetup = readiness === 'needs_setup'

      function handleOpenSettings() {
        if (typeof openSettings === 'function' && openSettings()) return
        setShowSettingsInline((v) => !v)
      }

      useEffect(() => {
        const styleEl = document.createElement('style')
        styleEl.setAttribute('data-plugin', PLUGIN_ID)
        styleEl.textContent = `
[data-testid="dsh-job-researcher"] [data-scroll-pane],
[data-testid="offer-detail"] {
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-border-l3, #555) transparent;
}
[data-testid="dsh-job-researcher"] [data-scroll-pane]::-webkit-scrollbar,
[data-testid="offer-detail"]::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
[data-testid="dsh-job-researcher"] [data-scroll-pane]::-webkit-scrollbar-thumb,
[data-testid="offer-detail"]::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l3, #555);
  border-radius: 8px;
}
@media (max-width: 720px) {
  [data-testid="offer-detail"] .jr-sheet-grid {
    grid-template-columns: 1fr !important;
  }
  [data-testid="offer-detail"] [data-testid="offer-actions-panel"] {
    position: static !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="dsh-job-researcher"] *,
  [data-testid="offer-detail-modal"] * {
    transition: none !important;
    animation: none !important;
  }
}
[data-density="compact"] [data-testid="job-researcher-list"] td {
  padding-top: 0.28rem !important;
  padding-bottom: 0.28rem !important;
}
`
        document.head.appendChild(styleEl)
        return () => styleEl.remove()
      }, [])

      useEffect(() => {
        const timer = setTimeout(() => {
          setPage(0)
          setQ(qInput)
        }, 300)
        return () => clearTimeout(timer)
      }, [qInput])

      useEffect(() => {
        if (!undoById) return undefined
        const left = undoById.expiresAt - Date.now()
        if (left <= 0) {
          setUndoById(null)
          return undefined
        }
        const timer = setTimeout(() => setUndoById(null), left)
        return () => clearTimeout(timer)
      }, [undoById])

      const loadStatus = useCallback(async () => {
        try {
          const st = await api('/status')
          setStatus(st)
          setStatusErr('')
        } catch (e) {
          setStatusErr(String(e.message || e))
        }
      }, [])

      const loadOffers = useCallback(async () => {
        const reqId = ++offersReqId.current
        try {
          const list = await api(
            `/offers?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}&decision=${encodeURIComponent(decision)}&application=${encodeURIComponent(application)}&minScore=${encodeURIComponent(minScore)}&limit=${limit}&offset=${page * limit}`,
          )
          if (reqId !== offersReqId.current) return
          setOffers(list)
          setListErr('')
        } catch (e) {
          if (reqId !== offersReqId.current) return
          setListErr(String(e.message || e))
        }
      }, [q, source, decision, application, minScore, page])

      useEffect(() => {
        void loadStatus()
        void loadOffers()
      }, [loadStatus, loadOffers])

      useEffect(() => {
        const tick = () => {
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
            return
          }
          void loadStatus()
          const cur = selectedRef.current
          const dirty = cur ? Boolean(draftsRef.current.get(cur.id)?.dirty) : false
          if (!dirty) void loadOffers()
        }
        const id = setInterval(tick, 15_000)
        return () => clearInterval(id)
      }, [loadStatus, loadOffers])

      function serverCommentTags(row) {
        return {
          comment: row?.user_comment || '',
          tags: Array.isArray(row?.feedback_tags) ? [...row.feedback_tags] : [],
        }
      }

      function isDraftDirtyVs(row, nextComment, nextTags) {
        const server = serverCommentTags(row)
        const tagA = [...(nextTags || [])].sort().join(',')
        const tagB = [...server.tags].sort().join(',')
        return String(nextComment || '') !== server.comment || tagA !== tagB
      }

      function bumpDraft(id, nextComment, nextTags, row) {
        const prev = draftsRef.current.get(id) || { version: 0 }
        const version = (prev.version || 0) + 1
        const dirty = isDraftDirtyVs(row || selectedRef.current, nextComment, nextTags)
        draftsRef.current.set(id, {
          comment: nextComment,
          tags: [...(nextTags || [])],
          dirty,
          version,
        })
        setDraftDirty(dirty)
        return version
      }

      function persistCurrentDraft() {
        const cur = selectedRef.current
        if (!cur) return
        const nextComment = commentRef.current
        const nextTags = tagsRef.current
        if (!isDraftDirtyVs(cur, nextComment, nextTags)) {
          const existing = draftsRef.current.get(cur.id)
          if (existing && !existing.dirty) return
          draftsRef.current.delete(cur.id)
          return
        }
        const prev = draftsRef.current.get(cur.id) || { version: 0 }
        draftsRef.current.set(cur.id, {
          comment: nextComment,
          tags: [...(nextTags || [])],
          dirty: true,
          version: prev.version || 1,
        })
      }

      function mergeSelectedFromServer(offer) {
        setSelected((prev) => {
          if (!prev || prev.id !== offer.id) return prev
          return { ...prev, ...offer }
        })
        const draft = draftsRef.current.get(offer.id)
        if (draft?.dirty) return
        setComment(offer.user_comment || '')
        setTags(Array.isArray(offer.feedback_tags) ? [...offer.feedback_tags] : [])
        setDraftDirty(false)
      }

      function patchOfferInCache(offer) {
        if (!offer || offer.id == null) return
        const filter = decisionFilterRef.current
        setOffers((prev) => {
          const rows = prev?.rows || []
          const idx = rows.findIndex((r) => r.id === offer.id)
          const dropsFromFilter =
            filter &&
            filter !== '' &&
            String(offer.user_decision || 'UNREVIEWED') !== filter
          if (idx < 0) {
            if (dropsFromFilter) return prev
            return prev
          }
          if (dropsFromFilter) {
            const nextRows = rows.slice(0, idx).concat(rows.slice(idx + 1))
            const next = {
              ...prev,
              rows: nextRows,
              total: Math.max(0, (prev.total || 0) - 1),
            }
            if (nextRows.length === 0 && pageRef.current > 0) {
              setPage((p) => Math.max(0, p - 1))
            }
            return next
          }
          const nextRows = rows.slice()
          nextRows[idx] = { ...nextRows[idx], ...offer }
          return { ...prev, rows: nextRows }
        })
      }

      function selectOffer(row) {
        if (selectedRef.current && selectedRef.current.id !== row.id) {
          persistCurrentDraft()
        }
        setSelected(row)
        const draft = draftsRef.current.get(row.id)
        if (draft) {
          setComment(draft.comment || '')
          setTags(Array.isArray(draft.tags) ? [...draft.tags] : [])
          setDraftDirty(Boolean(draft.dirty))
        } else {
          setComment(row.user_comment || '')
          setTags(Array.isArray(row.feedback_tags) ? [...row.feedback_tags] : [])
          setDraftDirty(false)
        }
        setFeedbackMsg('')
        setErr('')
      }

      function closeDetail() {
        persistCurrentDraft()
        setSelected(null)
        setFeedbackMsg('')
        setDraftDirty(false)
      }

      function onCommentChange(value) {
        setComment(value)
        setFeedbackMsg('')
        const cur = selectedRef.current
        if (!cur) return
        bumpDraft(cur.id, value, tagsRef.current, cur)
      }

      function toggleTag(id) {
        setTags((prev) => {
          const next = toggleExclusiveTags(prev, id)
          const cur = selectedRef.current
          if (cur) bumpDraft(cur.id, commentRef.current, next, cur)
          return next
        })
        setFeedbackMsg('')
      }

      async function runNow() {
        setRunBusy(true)
        setErr('')
        setRunMsg('')
        try {
          const r = await api('/run', { method: 'POST', body: '{}' })
          if (r.accepted || r.ok) setRunMsg(t('runAccepted'))
          await loadStatus()
          await loadOffers()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setRunBusy(false)
        }
      }

      async function decide(id, dec, opts = {}) {
        if (offerBusyRef.current[id] && !opts.forceQueue) return
        const row =
          (offers.rows || []).find((r) => r.id === id) ||
          (selectedRef.current?.id === id ? selectedRef.current : null)
        if (!opts.force && row && row.user_decision === dec) return

        const previousDecision = row?.user_decision || 'UNREVIEWED'
        setRetryDecisionById((prev) => ({ ...prev, [id]: dec }))
        setOfferBusy((prev) => ({ ...prev, [id]: true }))
        setRowErrors((prev) => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        setFeedbackMsg('')
        try {
          const r = await api(`/offers/${id}/decision`, {
            method: 'PATCH',
            body: JSON.stringify({ decision: dec }),
          })
          patchOfferInCache(r.offer)
          if (r.learning) {
            setStatus((prev) => (prev ? { ...prev, learning: r.learning } : prev))
          }
          const cur = selectedRef.current
          if (opts.openDetail === true) {
            selectOffer(r.offer)
          } else if (cur?.id === id) {
            mergeSelectedFromServer(r.offer)
          }
          if (!opts.skipUndo) {
            setUndoById({
              id,
              previousDecision,
              expiresAt: Date.now() + UNDO_MS,
            })
          }
        } catch (e) {
          const message = String(e.message || e)
          setRowErrors((prev) => ({ ...prev, [id]: message }))
          if (selectedRef.current?.id === id) setErr(message)
        } finally {
          setOfferBusy((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        }
      }

      async function undoDecision() {
        if (!undoById) return
        const { id, previousDecision } = undoById
        setUndoById(null)
        await decide(id, previousDecision, { force: true, skipUndo: true })
      }

      async function saveFeedback(id) {
        const draft = draftsRef.current.get(id) || {
          comment: commentRef.current,
          tags: tagsRef.current,
          version: 0,
          dirty: true,
        }
        const sentVersion = draft.version || 0
        const sentComment = draft.comment
        const sentTags = Array.isArray(draft.tags) ? [...draft.tags] : []
        setOfferBusy((prev) => ({ ...prev, [id]: true }))
        setErr('')
        setFeedbackMsg('')
        try {
          const r = await api(`/offers/${id}/feedback`, {
            method: 'PATCH',
            body: JSON.stringify({ comment: sentComment, tags: sentTags }),
          })
          patchOfferInCache(r.offer)
          if (r.learning) {
            setStatus((prev) => (prev ? { ...prev, learning: r.learning } : prev))
          }
          const curDraft = draftsRef.current.get(id)
          if (!curDraft || curDraft.version === sentVersion) {
            draftsRef.current.set(id, {
              comment: r.offer.user_comment || '',
              tags: Array.isArray(r.offer.feedback_tags) ? [...r.offer.feedback_tags] : [],
              dirty: false,
              version: sentVersion,
            })
          }
          if (selectedRef.current?.id === id) {
            if (!curDraft || curDraft.version === sentVersion) {
              setComment(r.offer.user_comment || '')
              setTags(
                Array.isArray(r.offer.feedback_tags) ? [...r.offer.feedback_tags] : [],
              )
              setDraftDirty(false)
              setFeedbackMsg(t('feedbackSaved'))
              setSelected((prev) =>
                prev && prev.id === id ? { ...prev, ...r.offer } : prev,
              )
            } else {
              setDraftDirty(true)
              setFeedbackMsg(t('unsavedChanges'))
            }
          }
        } catch (e) {
          const message = String(e.message || e)
          if (selectedRef.current?.id === id) setErr(message)
          setRowErrors((prev) => ({ ...prev, [id]: message }))
        } finally {
          setOfferBusy((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        }
      }

      async function setAppStatus(id, statusValue) {
        setOfferBusy((prev) => ({ ...prev, [id]: true }))
        setErr('')
        try {
          const r = await api(`/offers/${id}/application`, {
            method: 'PATCH',
            body: JSON.stringify({ status: statusValue }),
          })
          patchOfferInCache(r.offer)
          if (r.daily_applications) {
            setStatus((prev) =>
              prev ? { ...prev, daily_applications: r.daily_applications } : prev,
            )
          }
          if (selectedRef.current?.id === id) {
            setSelected((prev) =>
              prev && prev.id === id ? { ...prev, ...r.offer } : prev,
            )
          }
        } catch (e) {
          const message = String(e.message || e)
          if (selectedRef.current?.id === id) setErr(message)
          setRowErrors((prev) => ({ ...prev, [id]: message }))
        } finally {
          setOfferBusy((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        }
      }

      const latest = status?.latest_run
      const sched = status?.schedule
      const daily = status?.daily_applications
      const learning = status?.learning
      const bannerErr = listErr || statusErr || (!selected ? err : '')

      function stopRowEvent(e) {
        e.stopPropagation()
      }

      function decisionAria(label, title) {
        return `${label}: ${title || ''}`.trim()
      }

      const activeFilterCount = [
        q,
        source,
        decision,
        application,
        minScore,
      ].filter((v) => String(v || '').trim() !== '').length

      function clearAllFilters() {
        setPage(0)
        setQInput('')
        setQ('')
        setSource('')
        setDecision('')
        setApplication('')
        setMinScore('')
        setListTab('offers')
      }

      function setViewDecision(next) {
        setPage(0)
        setDecision(next)
        if (listTab !== 'offers') setListTab('offers')
      }

      function switchListTab(tab) {
        setListTab(tab)
        setPage(0)
        if (tab === 'applications') {
          setApplication('APPLIED')
        } else if (application === 'APPLIED') {
          setApplication('')
        }
      }

      return jsxs('div', {
        'data-plugin': PLUGIN_ID,
        'data-testid': 'dsh-job-researcher',
        'data-density': density,
        style: css.panel,
        children: [
          jsxs('header', {
            style: css.navbar,
            'data-testid': 'job-researcher-navbar',
            children: [
              jsxs('div', {
                style: css.navBrand,
                children: [
                  jsx(JobMark, { size: 20 }),
                  jsx('h1', { style: css.navTitle, children: t('title') }),
                  jsx(ReadinessBadge, {
                    state: readiness || 'needs_setup',
                    message: status?.message || '',
                  }),
                ],
              }),
              jsxs('div', {
                style: css.navMeta,
                children: [
                  jsxs('span', {
                    style: css.navMetaItem,
                    children: [
                      jsx('span', { children: t('lastRun') }),
                      jsx('strong', {
                        children: latest
                          ? `#${latest.id} ${latest.status} · new ${latest.offers_new || 0}`
                          : '—',
                      }),
                    ],
                  }),
                  jsxs('span', {
                    style: css.navMetaItem,
                    'data-testid': 'daily-applications',
                    children: [
                      jsx('span', { children: t('dailyProgress') }),
                      jsx('strong', {
                        children: daily
                          ? `${daily.count}/${daily.target}${daily.met ? ' ✓' : ''}`
                          : '—',
                      }),
                    ],
                  }),
                  jsxs('span', {
                    style: css.navMetaItem,
                    'data-testid': 'learning-summary',
                    children: [
                      jsx('span', { children: t('learning') }),
                      jsx('strong', {
                        children: learning
                          ? `${learning.user_feedback_count || 0} retours` +
                            (learning.prefer_terms?.length || learning.avoid_terms?.length
                              ? ` · ${
                                  (learning.prefer_terms?.length || 0) +
                                  (learning.avoid_terms?.length || 0)
                                } termes`
                              : '') +
                            (learning.active_signals?.length
                              ? ` · ${learning.active_signals.length} tags actifs`
                              : '')
                          : '—',
                      }),
                    ],
                  }),
                  jsxs('span', {
                    style: css.navMetaItem,
                    children: [
                      jsx('span', { children: 'Total' }),
                      jsx('strong', { children: status?.stats?.total ?? '—' }),
                    ],
                  }),
                ],
              }),
              jsxs('div', {
                style: css.navActions,
                children: [
                  jsx('button', {
                    type: 'button',
                    style: btnStyle(css.btn, busy),
                    disabled: busy,
                    'aria-label': t('openSettings'),
                    title: t('openSettings'),
                    'data-testid': 'job-researcher-settings-gear',
                    onClick: handleOpenSettings,
                    children: '⚙',
                  }),
                  jsx('button', {
                    type: 'button',
                    style: btnStyle(
                      css.btnPrimary,
                      runBusy || sched?.running || !canRun,
                    ),
                    disabled: runBusy || sched?.running || !canRun,
                    'data-testid': 'job-researcher-run',
                    onClick: runNow,
                    children: runBusy || sched?.running ? t('running') : t('runNow'),
                  }),
                  jsx('button', {
                    type: 'button',
                    style: css.btn,
                    onClick: () => {
                      void loadStatus()
                      void loadOffers()
                    },
                    children: t('refresh'),
                  }),
                  closePanel
                    ? jsx('button', {
                        type: 'button',
                        style: css.btn,
                        'aria-label': t('backToChat'),
                        'data-testid': 'job-researcher-close',
                        onClick: () => closePanel(),
                        children: t('backToChat'),
                      })
                    : null,
                ],
              }),
            ],
          }),
          showSettingsInline
            ? jsxs('div', {
                style: css.inlineSettings,
                'data-testid': 'job-researcher-settings-inline',
                children: [
                  jsx('p', {
                    style: css.muted,
                    children: t('settingsHint'),
                  }),
                  jsx(JobResearcherSettings, {
                    t: (k) =>
                      SETTINGS_DICT.fr[k] ||
                      SETTINGS_DICT.en[k] ||
                      DICT.fr[k] ||
                      DICT.en[k] ||
                      k,
                    openSecrets:
                      typeof openSecrets === 'function'
                        ? openSecrets
                        : () => false,
                  }),
                ],
              })
            : null,
          jsxs('div', {
            style: css.body,
            children: [
              needsSetup
                ? jsxs('div', {
                    style: css.emptyState,
                    'data-testid': 'job-researcher-needs-setup',
                    children: [
                      jsx('strong', { children: t('needsSetupTitle') }),
                      jsx('p', {
                        style: { ...css.muted, margin: 0 },
                        children: status?.message || t('needsSetupBody'),
                      }),
                      jsxs('div', {
                        style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
                        children: [
                          jsx('button', {
                            type: 'button',
                            style: css.btnPrimary,
                            onClick: handleOpenSettings,
                            children: t('openSettingsCta'),
                          }),
                          jsx('button', {
                            type: 'button',
                            style: css.btn,
                            disabled: busy,
                            onClick: async () => {
                              setBusy(true)
                              setErr('')
                              try {
                                await api('/bootstrap', {
                                  method: 'POST',
                                  body: '{}',
                                })
                                await loadStatus()
                                await loadOffers()
                              } catch (e) {
                                setErr(String(e.message || e))
                              } finally {
                                setBusy(false)
                              }
                            },
                            children: t('bootstrapCta'),
                          }),
                        ],
                      }),
                    ],
                  })
                : null,
              runMsg
                ? jsx('div', {
                    style: css.ok || css.muted,
                    role: 'status',
                    'data-testid': 'job-researcher-run-accepted',
                    children: runMsg,
                  })
                : null,
              undoById
                ? jsxs('div', {
                    style: css.undoBanner,
                    role: 'status',
                    'data-testid': 'job-researcher-undo',
                    children: [
                      jsx('span', { children: t('undoBanner') }),
                      jsx('button', {
                        type: 'button',
                        style: css.btn,
                        onClick: () => void undoDecision(),
                        children: t('undo'),
                      }),
                    ],
                  })
                : null,
              jsxs('div', {
                style: { ...css.toolbar, width: '100%' },
                'data-testid': 'job-researcher-toolbar',
                children: [
                  jsxs('div', {
                    style: css.viewTabs,
                    role: 'tablist',
                    'aria-label': t('offersTab'),
                    children: [
                      jsx('button', {
                        type: 'button',
                        role: 'tab',
                        'aria-selected': listTab === 'offers',
                        style: {
                          ...css.viewTab,
                          ...(listTab === 'offers' ? css.viewTabOn : {}),
                        },
                        onClick: () => switchListTab('offers'),
                        children: t('offersTab'),
                      }),
                      jsx('button', {
                        type: 'button',
                        role: 'tab',
                        'aria-selected': listTab === 'applications',
                        style: {
                          ...css.viewTab,
                          ...(listTab === 'applications' ? css.viewTabOn : {}),
                        },
                        'data-testid': 'tab-applications',
                        onClick: () => switchListTab('applications'),
                        children: t('applicationsTab'),
                      }),
                    ],
                  }),
                  jsx('input', {
                    style: { ...css.input, flex: '1 1 12rem', minWidth: '10rem' },
                    placeholder: t('search'),
                    'aria-label': t('search'),
                    value: qInput,
                    onChange: (e) => setQInput(e.target.value),
                  }),
                  jsxs('div', {
                    style: css.viewTabs,
                    role: 'group',
                    'aria-label': t('decision'),
                    'data-testid': 'interest-views',
                    children: VIEW_OPTIONS.map((opt) =>
                      jsx(
                        'button',
                        {
                          type: 'button',
                          style: {
                            ...css.viewTab,
                            ...(decision === opt.id ? css.viewTabOn : {}),
                          },
                          'aria-pressed': decision === opt.id,
                          onClick: () => setViewDecision(opt.id),
                          children: t(opt.labelKey),
                        },
                        opt.id || 'all',
                      ),
                    ),
                  }),
                  jsx('button', {
                    type: 'button',
                    style: {
                      ...css.btn,
                      ...(showMoreFilters ? css.viewTabOn : {}),
                    },
                    'aria-expanded': showMoreFilters,
                    'data-testid': 'more-filters',
                    onClick: () => setShowMoreFilters((v) => !v),
                    children: t('moreFilters'),
                  }),
                  jsx('button', {
                    type: 'button',
                    style: css.btn,
                    'aria-label': t('density'),
                    'data-testid': 'density-toggle',
                    onClick: () =>
                      setDensity((d) => (d === 'compact' ? 'comfort' : 'compact')),
                    children:
                      density === 'compact' ? t('densityCompact') : t('densityComfort'),
                  }),
                  jsx('button', {
                    type: 'button',
                    style: css.btn,
                    'aria-expanded': showActivity,
                    onClick: () => setShowActivity((v) => !v),
                    children: t('activity'),
                  }),
                ],
              }),
              showMoreFilters
                ? jsxs('div', {
                    style: css.toolbar,
                    'data-testid': 'more-filters-panel',
                    children: [
                      jsxs('select', {
                        style: css.input,
                        value: source,
                        'aria-label': t('source'),
                        onChange: (e) => {
                          setPage(0)
                          setSource(e.target.value)
                        },
                        children: [
                          jsx('option', { value: '', children: t('source') + ' *' }),
                          jsx('option', { value: 'csp', children: sourceLabel('csp') }),
                          jsx('option', { value: 'et', children: sourceLabel('et') }),
                          jsx('option', { value: 'ft', children: sourceLabel('ft') }),
                        ],
                      }),
                      jsxs('select', {
                        style: css.input,
                        value: application,
                        'aria-label': t('application'),
                        onChange: (e) => {
                          setPage(0)
                          setApplication(e.target.value)
                          if (e.target.value === 'APPLIED') setListTab('applications')
                          else if (listTab === 'applications') setListTab('offers')
                        },
                        children: [
                          jsx('option', { value: '', children: t('application') + ' *' }),
                          jsx('option', { value: 'NONE', children: t('appNone') }),
                          jsx('option', { value: 'TO_PREPARE', children: t('toPrepare') }),
                          jsx('option', { value: 'READY', children: t('ready') }),
                          jsx('option', { value: 'APPLIED', children: t('applied') }),
                        ],
                      }),
                      jsx('input', {
                        style: { ...css.input, minWidth: '5rem' },
                        placeholder: t('minScore'),
                        'aria-label': t('minScore'),
                        value: minScore,
                        onChange: (e) => {
                          setPage(0)
                          setMinScore(e.target.value)
                        },
                      }),
                    ],
                  })
                : null,
              activeFilterCount
                ? jsxs('div', {
                    style: css.filterChips,
                    'data-testid': 'active-filters',
                    children: [
                      jsx('span', {
                        style: css.muted,
                        children: `${activeFilterCount} ${t('filtersActive')}`,
                      }),
                      q
                        ? jsx('span', {
                            style: css.filterChip,
                            children: `${t('search')}: ${q}`,
                          })
                        : null,
                      decision
                        ? jsx('span', {
                            style: css.filterChip,
                            children: decisionLabel(t, decision),
                          })
                        : null,
                      source
                        ? jsx('span', {
                            style: css.filterChip,
                            children: sourceLabel(source),
                          })
                        : null,
                      application
                        ? jsx('span', {
                            style: css.filterChip,
                            children: applicationLabel(t, application),
                          })
                        : null,
                      minScore
                        ? jsx('span', {
                            style: css.filterChip,
                            children: `${t('minScore')}: ${minScore}`,
                          })
                        : null,
                      jsx('button', {
                        type: 'button',
                        style: css.linkBtn,
                        'data-testid': 'clear-filters',
                        onClick: clearAllFilters,
                        children: t('clearFilters'),
                      }),
                    ],
                  })
                : null,
              showActivity
                ? jsxs('div', {
                    style: css.undoBanner,
                    'data-testid': 'activity-panel',
                    children: [
                      jsxs('span', {
                        style: css.muted,
                        children: [
                          t('lastRun'),
                          ': ',
                          latest
                            ? `#${latest.id} ${latest.status} · new ${latest.offers_new || 0}`
                            : '—',
                          ' · ',
                          t('nextRun'),
                          ': ',
                          sched?.next_run_at || '—',
                        ],
                      }),
                    ],
                  })
                : null,
              bannerErr
                ? jsx('div', { style: css.error, role: 'alert', children: bannerErr })
                : null,
              jsxs('div', {
                style: css.listPane,
                'data-scroll-pane': true,
                'data-testid': 'job-researcher-list',
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
                            jsx('th', { style: css.th, children: 'Intérêt' }),
                            jsx('th', { style: css.th, children: 'Candidature' }),
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
                                  colSpan: 8,
                                  children: t('empty'),
                                }),
                              })
                            : offers.rows.map((row) => {
                                const rowBusy = Boolean(offerBusy[row.id])
                                return jsxs(
                                  'tr',
                                  {
                                    tabIndex: 0,
                                    'aria-selected': selected?.id === row.id,
                                    onClick: (e) => {
                                      if (e.target !== e.currentTarget) {
                                        const interactive = e.target.closest?.(
                                          'button, a, input, textarea, select',
                                        )
                                        if (interactive && interactive !== e.currentTarget) {
                                          return
                                        }
                                      }
                                      selectOffer(row)
                                    },
                                    onKeyDown: (e) => {
                                      if (e.target !== e.currentTarget) return
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        selectOffer(row)
                                      }
                                    },
                                    style: {
                                      cursor: 'pointer',
                                      ...(selected?.id === row.id
                                        ? css.selectedRow
                                        : {}),
                                    },
                                    children: [
                                      jsx('td', {
                                        style: css.td,
                                        children: jsx('span', {
                                          style: scoreBadgeStyle(row.score),
                                          children: row.score ?? '—',
                                        }),
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: jsx('button', {
                                          type: 'button',
                                          style: css.titleBtn,
                                          'aria-label': `${t('openOffer')}: ${row.title}`,
                                          onClick: (e) => {
                                            stopRowEvent(e)
                                            selectOffer(row)
                                          },
                                          onKeyDown: stopRowEvent,
                                          children: row.title,
                                        }),
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: row.employer,
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: `${row.location || t('notSpecified')} · ${remoteLabel(t, row.remote)}${
                                          row.contract_type ? ` · ${row.contract_type}` : ''
                                        }`,
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: sourceLabel(row.source),
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: decisionLabel(t, row.user_decision),
                                      }),
                                      jsx('td', {
                                        style: css.td,
                                        children: applicationLabel(
                                          t,
                                          row.application_status,
                                        ),
                                      }),
                                      jsxs('td', {
                                        style: css.actionCell,
                                        children: [
                                          jsxs('div', {
                                            style: css.actionGroup,
                                            children: [
                                              jsx('button', {
                                                type: 'button',
                                                style: css.btnIcon,
                                                title: t('yes'),
                                                'aria-label': decisionAria(
                                                  t('yes'),
                                                  row.title,
                                                ),
                                                'aria-pressed':
                                                  row.user_decision === 'YES',
                                                disabled: rowBusy,
                                                onClick: (e) => {
                                                  stopRowEvent(e)
                                                  void decide(row.id, 'YES')
                                                },
                                                onKeyDown: stopRowEvent,
                                                children: '✓',
                                              }),
                                              jsx('button', {
                                                type: 'button',
                                                style: css.btnIcon,
                                                title: t('no'),
                                                'aria-label': decisionAria(
                                                  t('no'),
                                                  row.title,
                                                ),
                                                'aria-pressed':
                                                  row.user_decision === 'NO',
                                                disabled: rowBusy,
                                                onClick: (e) => {
                                                  stopRowEvent(e)
                                                  void decide(row.id, 'NO')
                                                },
                                                onKeyDown: stopRowEvent,
                                                children: '✗',
                                              }),
                                              jsx('button', {
                                                type: 'button',
                                                style: css.btnIcon,
                                                title: t('maybe'),
                                                'aria-label': decisionAria(
                                                  t('maybe'),
                                                  row.title,
                                                ),
                                                'aria-pressed':
                                                  row.user_decision === 'MAYBE',
                                                disabled: rowBusy,
                                                onClick: (e) => {
                                                  stopRowEvent(e)
                                                  void decide(row.id, 'MAYBE')
                                                },
                                                onKeyDown: stopRowEvent,
                                                children: '?',
                                              }),
                                            ],
                                          }),
                                          rowErrors[row.id]
                                            ? jsxs('div', {
                                                style: {
                                                  ...css.muted,
                                                  marginTop: '0.25rem',
                                                },
                                                role: 'alert',
                                                children: [
                                                  rowErrors[row.id],
                                                  ' ',
                                                  jsx('button', {
                                                    type: 'button',
                                                    style: css.btn,
                                                    disabled: rowBusy,
                                                    onClick: (e) => {
                                                      stopRowEvent(e)
                                                      void decide(
                                                        row.id,
                                                        retryDecisionById[row.id] ||
                                                          'YES',
                                                        { force: true },
                                                      )
                                                    },
                                                    onKeyDown: stopRowEvent,
                                                    children: t('retry'),
                                                  }),
                                                ],
                                              })
                                            : null,
                                        ],
                                      }),
                                    ],
                                  },
                                  row.id,
                                )
                              }),
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
                        style: btnStyle(css.btn, page === 0),
                        disabled: page === 0,
                        'aria-label': t('prevPage'),
                        onClick: () => setPage((p) => Math.max(0, p - 1)),
                        children: '←',
                      }),
                      jsx('button', {
                        type: 'button',
                        style: btnStyle(
                          css.btn,
                          (page + 1) * limit >= (offers.total || 0),
                        ),
                        disabled: (page + 1) * limit >= (offers.total || 0),
                        'aria-label': t('nextPage'),
                        onClick: () => setPage((p) => p + 1),
                        children: '→',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          jsx(OfferDetailModal, {
            t,
            selected,
            busy,
            offerBusy,
            comment,
            tags,
            draftDirty,
            feedbackMsg,
            err: selected ? err : '',
            offersRows: offers.rows || [],
            onClose: closeDetail,
            onNavigate: selectOffer,
            onComment: onCommentChange,
            onToggleTag: toggleTag,
            onSaveFeedback: saveFeedback,
            onDecide: decide,
            onAppStatus: setAppStatus,
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
      ctx.effect(
        () =>
          ctx.locale.register(SETTINGS_LOCALE_NS, {
            en: SETTINGS_DICT.en,
            fr: SETTINGS_DICT.fr,
          }),
        `${PLUGIN_ID}: settings locale`,
      )
      const t = tBound(ctx)
      const settingsT = settingsTBound(ctx)
      const panelInject = () => ({
        t,
        closePanel: () => {
          try {
            ctx.layout?.selectPanel?.(null)
          } catch {
            /* ignore */
          }
        },
        openSettings: () => tryOpenHostSettings(ctx),
        openSecrets: () => tryOpenHostSettings(ctx, 'secrets'),
      })
      const settingsInject = () => ({
        t: settingsT,
        openSecrets: () => tryOpenHostSettings(ctx, 'secrets'),
      })
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: LOCALE_NS,
            inject: panelInject,
          },
          JobResearcherPanel,
        ),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: ORDER,
            label: () => t('nav'),
            locale: LOCALE_NS,
          },
          JobResearcherIcon,
        ),
      )
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: SECTION_ID,
            order: SETTINGS_ORDER,
            label: () => settingsT('nav'),
            locale: SETTINGS_LOCALE_NS,
            inject: settingsInject,
          },
          JobResearcherSettings,
        ),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale', 'layout', 'settingsScope']
    exports.JobResearcherPanel = JobResearcherPanel
    exports.JobResearcherSettings = JobResearcherSettings
    exports.JobResearcherIcon = JobResearcherIcon
    exports.JobMark = JobMark
    return module.exports
  },
})
