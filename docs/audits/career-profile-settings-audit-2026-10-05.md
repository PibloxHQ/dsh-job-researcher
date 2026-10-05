# Audit profil carrière et Settings — 2026-10-05

## État avant changement

Le profil injecté à Jev n'était pas un profil personnel. `handleJevEnrich`
prenait tout `store.getSearchConfig().config`, donc les filtres de recherche,
les sources et la planification partaient dans l'état Jev. La configuration
était persistée dans `schema_meta.search_config_json`, avec des snapshots dans
`search_profiles`, mais Settings n'exposait que département, sources, cron et
cible quotidienne. Le payload client était partiel et pouvait perdre des
champs existants lors d'une sauvegarde.

État observé avant modification : `GET /api/job-researcher/config` retournait
la configuration version 1, sans propriété `profile`.

## Décision

Markdown est la source humaine portable ; une vue structurée déterministe est
générée pour le matching. Le LLM peut produire un brouillon via le prompt
affiché dans Settings, mais l'opérateur relit et enregistre le résultat.

Le profil est limité à 24 000 caractères et Jev reçoit uniquement
`config.profile`, jamais `sources`, `schedule`, `revision` ou des secrets.

## Implantation

- `src/profile.js` : contrat `career-profile.v1`, modèle, prompt, dérivation
  bornée par sections.
- `src/config.js` : profil validé et normalisé dans la configuration versionnée.
- `src/client/index.js` : zone Markdown, import `.md`, modèle, prompt copiable,
  conservation des autres champs lors de la sauvegarde.
- `src/http.js` : frontière Jev restreinte au profil explicite.
- Tests de contrat et de normalisation ajoutés.

## Limites assumées

La première version ne tente pas de comprendre sémantiquement tout le texte et
ne lance pas de parsing LLM automatique. Les champs dérivés sont des aides
bornées, tandis que le Markdown reste la référence auditable.
