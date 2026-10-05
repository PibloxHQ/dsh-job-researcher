/**
 * Personal career profile: human-editable Markdown plus a bounded derived view.
 * The Markdown remains the source of truth; the derived fields are deliberately
 * simple and deterministic so an LLM cannot silently rewrite the profile.
 */

export const PROFILE_SCHEMA_VERSION = 'career-profile.v1'
export const PROFILE_MARKDOWN_MAX = 24_000

export const PROFILE_TEMPLATE = `# Profil candidat

## Identité
- Nom / prénom: à compléter
- Localisation: à compléter
- Mobilité: à compléter

## Positionnement
- Titres ciblés: à compléter
- Niveau: à compléter
- Années d'expérience: à compléter

## Compétences
### Cœur
- à compléter
### Adjacent
- à compléter

## Expérience
- Réalisations importantes: à compléter
- Environnements / secteurs: à compléter

## Préférences
- Contrats: CDI, CDD
- Travail: hybride, remote
- Salaire minimum: à compléter
- Environnement d'équipe: à compléter

## Contraintes non négociables
- à compléter

## Préférences souples
- à compléter

## Contexte pour Jev
- Ce que je recherche réellement: à compléter
- Ce que je veux éviter: à compléter
`

export const PROFILE_FORMAT_PROMPT = `Transforme mes notes/CV en un profil Markdown pour Job Researcher.
Règles : conserve uniquement les faits fournis, n'invente aucune compétence,
date, rémunération ou préférence. Utilise exactement les titres suivants :
Identité, Positionnement, Compétences (Cœur et Adjacent), Expérience,
Préférences, Contraintes non négociables, Préférences souples, Contexte pour Jev.
Quand une information manque, écris "à compléter". Retourne uniquement le Markdown.
Le profil doit distinguer les contraintes obligatoires des préférences et citer
les éléments qui peuvent réellement aider à comparer une offre.`

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max)
}

function listFromSection(lines) {
  return lines
    .map((line) => line.match(/^\s*[-*]\s+(.*)$/)?.[1] || '')
    .map((value) => clean(value, 300))
    .filter(Boolean)
    .filter((value) => !/^à compléter$/i.test(value))
    .slice(0, 40)
}

/** Extract headings and bullets without pretending to understand prose. */
export function deriveProfile(markdown) {
  const source = clean(markdown, PROFILE_MARKDOWN_MAX)
  const sections = {}
  let current = 'root'
  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/)?.[1]
    if (heading) current = heading.toLowerCase()
    else (sections[current] ||= []).push(line)
  }
  const find = (...names) => {
    const key = Object.keys(sections).find((candidate) =>
      names.some((name) => candidate.includes(name)),
    )
    return key ? listFromSection(sections[key]) : []
  }
  const skillsSection = find('compétences', 'competences', 'skills')
  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    identity: find('identité', 'identity'),
    positioning: find('positionnement', 'target', 'objectif'),
    skills: { core: find('cœur', 'coeur', 'core').length ? find('cœur', 'coeur', 'core') : skillsSection, adjacent: find('adjacent') },
    experience: find('expérience', 'experience'),
    preferences: find('préférence', 'preference'),
    hard_constraints: find('contrainte', 'non négociable', 'non negotiable'),
    soft_preferences: find('souple', 'soft'),
    context: find('contexte', 'jev'),
  }
}

export function defaultCareerProfile() {
  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    markdown: '',
    derived: deriveProfile(''),
    source: 'operator',
    updated_at: null,
  }
}

export function normalizeCareerProfile(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const markdown = clean(raw.markdown, PROFILE_MARKDOWN_MAX)
  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    markdown,
    derived: deriveProfile(markdown),
    source: raw.source === 'imported' ? 'imported' : 'operator',
    updated_at: raw.updated_at ? clean(raw.updated_at, 40) : null,
  }
}
