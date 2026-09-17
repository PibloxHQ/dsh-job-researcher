# Audit d'autonomie et d'amélioration — DSH Job Researcher

**Date :** 2026-09-17  
**Périmètre :** dépôt `dsh-job-researcher`, intégration au profil DSH web, API, UI, ordonnanceur, SQLite et worker Python  
**Nature :** audit en lecture seule ; aucune configuration, donnée ou exécution planifiée n'a été modifiée

## Verdict exécutif

Le plugin est aujourd'hui un **tableau de bord spécialisé fonctionnel sur une installation déjà préparée**, mais pas encore un produit autonome installable et paramétrable depuis DSH.

Le manque principal n'est pas seulement l'absence d'un champ « localisation ». Toute la politique de recherche est encore dispersée dans le code : département 38, communes INSEE, chemin de filtre CSP, catégories Emploi territorial, mots-clés, règles de triage, horaire UTC, fuseau des candidatures et objectif quotidien. L'interface ne permet que de filtrer les offres déjà collectées ; elle ne configure pas ce que le système doit chercher.

La cible recommandée est un plugin capable de :

1. détecter qu'il n'est pas initialisé ;
2. ouvrir un assistant « Configurer les fondations » depuis une roue crantée ;
3. enregistrer un profil de recherche versionné dans le Settings plane DSH ;
4. vérifier Python, base, secrets et sources sans exposer de secret ;
5. lancer chaque source autorisée indépendamment ;
6. expliquer précisément son état : configuré, dégradé, prêt, en cours ou en erreur ;
7. exécuter, scorer et apprendre à partir de ce profil sans constantes personnelles dans le code.

## État réel observé

Instantané en lecture seule du 2026-09-17 :

| Signal | État observé |
|---|---|
| Plugin monté | oui, le profil web résout vers le dépôt lab |
| API | `status=live` |
| Secrets FT | présents selon l'API, valeurs non lues |
| Planification | active, `0 12 * * *`, UTC |
| Offres | 4 128 |
| Dernier run | run `#1`, smoke CSP-filtre + ET uniquement |
| France Travail live | aucun succès de source enregistré |
| Score courant `v4-feedback` | 0 offre |
| Sans score | 3 628 offres |
| Ancien score `legacy-v1` | 500 offres |
| Candidatures | 4 128 offres en `TO_PREPARE` |
| Feedback réellement utilisateur | 0 |
| URL manquante | 11 offres, toutes ET |
| Employeur manquant | 91 offres FT |
| Télétravail inconnu | 400 offres |
| Notifications | désactivées / ignorées |

Conclusion : `status=live` signifie actuellement surtout « plugin chargé et secrets présents ». Ce statut ne démontre ni une configuration complète, ni un premier run intégral, ni un scoring à jour.

## Architecture actuelle comprise

```text
UI DSH (src/client/index.js)
        │
        ▼
API /api/job-researcher/* (src/http.js)
        │
        ├── SQLite via src/store.js
        │
        └── scheduler.js
              │
              └── pipeline.js → venv Python
                                  │
                                  └── job_radar/dsh_pipeline.py
                                        ├── CSP filtre
                                        ├── Emploi territorial
                                        ├── France Travail
                                        ├── normalisation
                                        └── triage + feedback
```

Points déjà solides : séparation des secrets, requêtes SQL préparées, migrations additives testées, décisions séparées des candidatures, provenance du feedback, scoring déterministe et tests Node/Python actuellement verts.

## Priorités critiques

### AUT-01 — Aucun Settings plane pour Job Researcher — P0

**Constat.** Le client s'enregistre uniquement dans `main` et `sidebar.panellist`. Le test de contrat vérifie même l'absence de `settings.section`. Aucun schéma Schemastery ni namespace `dsh-job-researcher` n'est enregistré côté host.

**Impact.** L'utilisateur ne peut pas configurer sa localisation, ses métiers, ses contrats, ses sources, son planning ou son objectif quotidien. Chaque changement demande du code ou un patch Cordis.

**Amélioration.** Ajouter un Settings plane durable, sur le modèle de `dsh-piblox-theme`, avec une section dédiée et un bouton roue crantée dans la navbar du panneau principal.

**Critères d'acceptation.**

- le même écran est accessible depuis Settings et depuis la roue crantée ;
- les réglages survivent au redémarrage ;
- chaque champ est validé avant écriture ;
- les secrets restent dans `dsh-piblox-secrets`, jamais dans les réglages Job Researcher ;
- une prévisualisation résume les requêtes qui seront réellement envoyées.

### AUT-02 — Premier démarrage non autonome — P0

**Constat.** Le venv doit être créé manuellement par `scripts/setup-venv.sh`. `openStore()` refuse une base absente. Dans `scheduler.fire()`, `getStore()` est appelé avant le bloc `try`, alors que le pipeline Python sait créer son schéma. Sur une installation neuve, « Run now » peut donc échouer avant d'avoir la possibilité d'initialiser la base.

**Impact.** Une installation déclarée dans DSH n'est pas utilisable sans intervention shell et migration préalable.

**Amélioration.** Introduire un bootstrap idempotent : diagnostic Python, création du venv, installation verrouillée des dépendances, création de la base vide, migration, puis smoke local. Les opérations longues doivent exposer leur progression et leurs erreurs.

**Critères d'acceptation.** Une installation vierge peut arriver à une première collecte CSP/ET depuis l'UI uniquement, sans commande shell.

### AUT-03 — État de candidature historique incorrect — P0 données

**Constat.** Les 4 128 lignes live sont en `TO_PREPARE`. Elles proviennent d'un seed de migration et non d'une action manuelle. Le correctif actuel ne remappe vers `NONE` que `TO_PREPARE + UNREVIEWED`; les lignes historiques ont déjà une décision YES/MAYBE/NO et restent donc faussement dans le pipeline candidature.

**Impact.** La file « À préparer » ne représente pas l'intention réelle de l'utilisateur et rend le suivi de candidature non fiable.

**Amélioration.** Faire une migration réparatrice ciblée, basée sur une preuve d'origine de migration et non sur la décision d'intérêt. Avant écriture : snapshot, comptages, requête de sélection exacte, test sur clone, puis validation post-migration.

**Critères d'acceptation.** Seules les candidatures explicitement initiées par l'utilisateur restent dans `TO_PREPARE`, `READY` ou `APPLIED`; toutes les autres sont `NONE`.

### AUT-04 — Le statut `live` est trop optimiste — P0

**Constat.** Le statut passe à `live` dès que les deux secrets FT sont présents. Pourtant le dernier run n'a couvert que CSP-filtre et ET, aucune source FT n'a de succès enregistré, 3 628 offres n'ont aucun score et aucune n'utilise `v4-feedback`.

**Impact.** L'utilisateur reçoit un signal vert sans savoir si le système est réellement prêt ou à jour.

**Amélioration.** Remplacer le statut binaire par une readiness calculée :

```text
needs_setup → installing → ready → running
                         ↘ degraded
                         ↘ blocked
```

La readiness doit inclure : settings valides, venv, schéma, secrets nécessaires aux sources activées, dernier succès par source, fraîcheur, couverture de scoring et notifications optionnelles.

### AUT-05 — France Travail bloque même les sources publiques — P0/P1

**Constat.** `buildChildEnv()` exige toujours les deux secrets FT, alors que CSP et ET n'en ont pas besoin. Le pipeline annonce une politique de panne partielle, mais le host empêche toute exécution si FT n'est pas prêt.

**Impact.** Impossible d'utiliser le plugin en mode public uniquement ou de désactiver temporairement FT.

**Amélioration.** Matérialiser les secrets selon les sources activées. FT doit être `blocked` sans ses secrets, tandis que CSP/ET restent exécutables. Afficher clairement le mode dégradé.

### AUT-06 — Une erreur OAuth FT peut tuer tout le pipeline — P0/P1

**Constat.** `get_token()` lève `SystemExit` sur erreur OAuth. `_sync_source()` intercepte `Exception`, mais `SystemExit` hérite de `BaseException`. L'erreur peut donc contourner la politique de panne partielle, arrêter le processus et laisser un `job_runs.status='running'`.

**Amélioration.** Lever une exception métier normale, finaliser le run dans un `finally`, enregistrer l'erreur de source sans token ni réponse sensible, et poursuivre les autres sources.

## Configuration de recherche à construire

### AUT-07 — Localisation entièrement codée en dur — P1

La localisation est dispersée dans plusieurs représentations incompatibles :

- `Settings.departement = "38"` pour FT ;
- `DEFAULT_DEPT = "038"` pour ET, sans utiliser `Settings.departement` ;
- communes INSEE statiques dans `PREFERRED_COMMUNE_INSEE` ;
- filtre CSP statique `localisation/334/...` ;
- villes proches et éloignées codées dans `triage.py` ;
- `profile.yaml` contient encore une autre liste de localisations.

Créer une configuration canonique : pays, région, départements, communes INSEE, rayon ou temps de trajet, remote/hybride/sur site, exclusions et mobilité. Chaque adaptateur de source traduit ce modèle vers son propre format.

### AUT-08 — Métiers et mots-clés codés en dur — P1

Les dix `QUERY_PROFILES`, les mots-clés ET et les constantes de triage sont spécifiques au profil actuel. Ils doivent devenir des réglages utilisateur : intitulés inclus, synonymes, compétences, intitulés exclus, niveau, secteurs et mots-clés négatifs.

Prévoir des presets (« Dev/Infra », « Support », « Secteur public ») qui restent éditables.

### AUT-09 — Contrats, rythme et secteur non configurables — P1

Le profil YAML accepte ces notions, mais le pipeline actif ne l'utilise pas comme politique principale. Ajouter CDI/CDD/contractuel/fonctionnaire/freelance, temps plein/partiel, salaire minimal si disponible, public/privé, télétravail et niveau d'expérience.

### AUT-10 — Planification et objectif quotidien figés — P1

Le cron est configurable uniquement via config Cordis, avec matcher limité. Le fuseau candidature est fixé à `Europe/Paris` et la cible à 1.

Ajouter dans Settings : activation, heure locale, jours actifs, fuseau, catch-up au redémarrage, cible quotidienne et jours sans objectif. Valider l'expression générée au lieu d'accepter une chaîne arbitraire.

### AUT-11 — Sources affichées comme configurables mais non pilotables — P1

`source_state.enabled` existe mais n'est jamais consulté. Le host passe toujours `csp-filtre,et,ft`. Les options de l'UI sont elles aussi codées en dur.

Ajouter : activation par source, test de connexion, réglages propres à la source, dernière réussite, prochain essai, compteur et erreur actionnable. La liste UI doit venir de l'API, pas d'une constante cliente.

### AUT-12 — Provenance de configuration absente — P1

Un run ne conserve pas le snapshot du profil de recherche, des sources et du scoring utilisés. Il est donc impossible de reproduire précisément pourquoi une offre a été trouvée ou notée.

Ajouter `search_profile_version`, `config_hash` et un snapshot JSON non secret dans `job_runs`; persister la version de profil sur chaque score.

## Scoring et apprentissage

### AUT-13 — Deux moteurs de scoring divergents — P1

Le pipeline DSH utilise `triage.py`, avec constantes personnelles. `profile.yaml`, `claims.py`, `profile.py` et `ping.py` forment un second moteur utilisé par la CLI mais pas par le pipeline principal.

Choisir un moteur canonique. Recommandation : conserver l'explicabilité de `triage.py`, mais alimenter ses règles depuis le profil durable. Déprécier ou intégrer clairement Claims-to-Ping pour éviter deux vérités concurrentes.

### AUT-14 — Le feedback n'affine pas encore la recherche — P1

Le texte produit promet d'affiner la recherche et le scoring. En réalité, les tags utilisateur ne modifient que le score après collecte. Ils ne changent ni mots-clés, ni communes, ni contrats, ni sources.

Séparer explicitement :

- apprentissage de ranking : ajustement automatique, borné et réversible ;
- suggestion de recherche : proposition visible (« tu refuses souvent les offres trop loin, réduire la zone ? ») ;
- modification effective du profil : uniquement après confirmation utilisateur.

### AUT-15 — Recalcul incomplet des offres — P1

Chaque run retraite au maximum 500 offres. L'état live montre 3 628 offres sans score et 500 en `legacy-v1`. Une évolution du feedback ne garantit donc pas un classement cohérent du catalogue entier.

Ajouter une file de rescore durable par lots, avec progression et reprise, déclenchée à chaque changement de profil ou de version de score. Le dashboard doit afficher la couverture (`500/4 128`, version active).

### AUT-16 — Contradiction dans Claims-to-Ping — P2

La documentation dit qu'une contrainte requise manquante produit `no_match` et reste silencieuse. `evaluate_pings()` filtre seulement sur `match_rate` et peut créer un ping malgré `required_satisfied=false`; un test consacre actuellement ce comportement contraire au contrat.

Décider la règle produit, corriger le code et le test ensemble.

### AUT-17 — Ambiguïté de détection remote — P2

Dans `claims.py`, la condition combinant `remote == "unknown"`, `teletravail` et `remote` dépend de la précédence `and/or`; un mot « remote » peut être accepté même si le champ structuré vaut `no`. Parenthéser et tester les trois états.

## Exécution et fiabilité

### AUT-18 — « Run now » n'est pas réellement asynchrone — P1

La route annonce un lancement asynchrone, mais attend `scheduler.fire()`, qui attend la fin du processus Python. Une collecte lente peut dépasser le timeout HTTP et donne une mauvaise UX.

Répondre immédiatement avec `202 + run_id`, exécuter en arrière-plan, puis suivre par polling ou événements. Ajouter annulation, durée et progression par source.

### AUT-19 — Verrou de run fragile — P1

Le verrou combine un booléen mémoire et une requête sur `job_runs`. Il n'est pas atomique entre processus. De plus, `started_at` est ISO avec `T/+00:00`, comparé lexicalement à `datetime('now')` au format espace SQLite ; la fenêtre « deux heures » n'est pas fiable.

Utiliser un lock SQLite transactionnel avec timestamp normalisé ou epoch, propriétaire, heartbeat et récupération explicite des runs abandonnés.

### AUT-20 — Scheduler non durable — P1

Le cron vit dans le processus web. Un arrêt à l'heure prévue perd le run; plusieurs instances pourraient le dupliquer; aucun catch-up n'est prévu.

Conserver un `next_due_at` durable, réclamer atomiquement le run et appliquer une politique de rattrapage configurable au redémarrage.

### AUT-21 — Source state incohérent — P1/P2

CSP-filtre écrit des offres avec `source='csp'`, mais l'état de run utilise `source='csp-filtre'`. La base live contient donc des lignes d'état `csp` et `csp-filtre` qui ne décrivent pas la même chose.

Définir des identifiants canoniques séparant connecteur et origine (`connector_id`, `source_id`) et migrer les états sans perdre l'historique.

### AUT-22 — Atomicité et performance d'ingestion — P2

`upsert_many()` commit offre par offre. Un crash laisse un lot partiellement importé et ralentit les gros volumes.

Faire un upsert transactionnel par page ou source, conserver les métriques inserted/updated/unchanged et rollback uniquement le lot fautif.

### AUT-23 — Logs non bornés et protocole stdout fragile — P2

`pipeline.log` grandit sans rotation. Le host cherche le premier `{` dans stdout pour parser le résultat, ce qui casse si une dépendance logue du JSON ou une accolade avant la réponse.

Adopter une ligne finale préfixée ou un fichier résultat, logs JSON structurés, rotation, rétention et redaction centralisée.

### AUT-24 — Dépendances runtime non reproductibles — P2

Le venv exige précisément `python3.12`; les dépendances utilisent seulement des bornes minimales et aucun lock. Un nouvel install peut recevoir des versions différentes.

Détecter un Python compatible, fournir un lock/hash, exposer les versions dans diagnostics et tester l'upgrade du venv.

## Données et cycle de vie des offres

### AUT-25 — Pas de notion d'offre active, expirée ou disparue — P1

Les offres restent dans la base sans état de cycle de vie. Ajouter `active`, `first_seen`, `last_seen`, `closed_at`, `expires_at` quand disponible, et une politique de disparition par source. Masquer les expirées par défaut sans les supprimer.

### AUT-26 — Pas de déduplication inter-sources — P2

La clé `(source, external_id)` évite les doublons internes mais pas la même offre publiée sur plusieurs plateformes. Ajouter une empreinte explicable titre/employeur/lieu/URL, puis grouper les doublons sans fusion destructive.

### AUT-27 — Qualité des données peu visible — P2

La base live compte 11 URL manquantes, 91 employeurs manquants et 400 statuts remote inconnus. Ajouter un score de complétude, des badges et des métriques par connecteur. Les lignes ET historiques doivent être réparées après re-sync, sans inventer d'URL.

### AUT-28 — Pas de sauvegarde/export/import depuis l'UI — P2

Ajouter snapshot SQLite avant migration, export CSV/JSON des décisions et candidatures, import contrôlé et restauration documentée. Ne jamais inclure les secrets.

### AUT-29 — Pas d'historique métier — P2

Seul l'état courant est conservé. Ajouter une table append-only d'événements pour décision, feedback et candidature afin de comprendre les corrections, mesurer le funnel et reconstruire l'état.

### AUT-30 — Modèle implicitement mono-utilisateur — P2

Feedback, candidatures et profil sont globaux. Si DSH devient multi-utilisateur, les données se mélangeront. Déclarer explicitement le mode mono-utilisateur ou ajouter un `owner_id` dérivé de l'identité authentifiée, jamais fourni librement par le client.

## API, sécurité et validation

### AUT-31 — Validation HTTP insuffisamment bornée — P1/P2

`limit`, `offset` et `minScore` sont convertis directement avec `Number()`. Le corps JSON n'a pas de taille maximale. Les commentaires n'ont pas de limite. Ajouter schémas de requête, bornes, pagination maximale, erreurs 400 stables et limite de payload.

### AUT-32 — Contrat d'autorisation à prouver — P1/P2

Les routes mutantes ne montrent aucun contrôle d'autorisation ou CSRF dans le plugin. Elles peuvent hériter de la protection globale DSH, mais cette hypothèse doit être prouvée par un test d'intégration authentifié/non authentifié avant d'ajouter des réglages sensibles.

### AUT-33 — Séparer réglages et secrets — exigence de conception

La future page Settings peut afficher `présent/manquant` et guider vers Secrets, mais ne doit jamais lire ou renvoyer les valeurs FT. Les tests actuels de minimal child env sont à conserver comme barrière de sécurité.

### AUT-34 — API de configuration manquante — P1

Créer des endpoints dédiés : lecture de configuration redigée, validation sans sauvegarde, mise à jour avec version optimiste, diagnostics, tests de source et lancement de bootstrap. Ne pas détourner `/status` pour effectuer des mutations.

## UX proposée

### Roue crantée dans le panneau

Placer une action icône dans la navbar, avec libellé accessible « Configurer Job Researcher ». Elle ouvre la section Settings dédiée. Si les fondations sont incomplètes, afficher aussi un bandeau principal :

> Configuration incomplète — définir la zone, les métiers et les sources avant le premier run.

### Assistant « Configurer les fondations »

Étapes recommandées :

1. **Objectif** — métier principal, alternatives, compétences et exclusions ;
2. **Zone** — adresse ou commune de référence, rayon/temps, départements, remote/hybride ;
3. **Contrats** — types, temps de travail, salaire et secteurs ;
4. **Sources** — activer CSP, ET, FT et vérifier chaque connexion ;
5. **France Travail** — état des deux secrets et lien vers Settings → Secrets ;
6. **Rythme** — jours, heure locale, fuseau et rattrapage ;
7. **Scoring** — résumé lisible des priorités et exclusions ;
8. **Validation** — prévisualisation des requêtes, smoke sans écriture métier, puis sauvegarde ;
9. **Premier run** — progression source par source et résultat final.

L'assistant doit être relançable. Après onboarding, la roue ouvre les mêmes réglages en mode édition.

### Améliorations du tableau de bord

- filtres remote, date, fraîcheur, contrat, secteur et score ;
- tris explicites et vues sauvegardées ;
- options de sources générées depuis l'API ;
- état du run avec progression plutôt qu'un bouton bloqué ;
- couverture de scoring et version de profil visibles ;
- affichage des offres expirées désactivé par défaut ;
- file candidature correcte et historique des transitions ;
- panneau « pourquoi trouvée ? » distinct de « pourquoi ce score ? » ;
- empty states guidés pour base vide, aucune source ou aucun résultat ;
- vue compacte responsive en cartes sur petit écran.

### Accessibilité

La modal gère Escape et expose `role=dialog`, ce qui est positif. Il reste à ajouter piège de focus, focus initial, restauration du focus à la fermeture et blocage du scroll arrière-plan. Les lignes de tableau cliquables contenant des boutons doivent être testées au clavier et avec lecteur d'écran.

## Maintenabilité et tests

### AUT-35 — Client monolithique — P2

`src/client/index.js` approche 1 500 lignes. Le découper en modèles purs, API client, composants Settings, panneau, modal et tokens de style. Conserver le format attendu par le ModuleLoader DSH.

### AUT-36 — Contrats dupliqués Node/Python/client — P2

Tags feedback, enums, labels, versions et defaults sont répétés. Définir un contrat canonique versionné et générer ou valider les représentations des deux runtimes.

### AUT-37 — Couverture trop centrée sur les sources textuelles — P1/P2

Les tests UI actuels inspectent surtout le texte du fichier. Ajouter :

- bootstrap base vide et venv absent ;
- API Settings et validation ;
- source activée/désactivée ;
- FT indisponible avec CSP/ET fonctionnels ;
- erreur OAuth sans abandon du run ;
- vrai `202` asynchrone ;
- lock concurrent et récupération après crash ;
- rescore complet et reprise ;
- migration réparatrice des 4 128 faux `TO_PREPARE` sur clone ;
- navigateur authentifié : onboarding, roue, sauvegarde, premier run ;
- accessibilité automatisée et navigation clavier ;
- parsers sur fixtures multiples pour détecter les changements HTML externes.

### AUT-38 — Documentation contradictoire — P2

Le README parle d'une « Settings UI », alors que le plugin fournit un panneau principal et aucune section Settings. Certains documents indiquent encore « not live » alors que l'API est actuellement chargée. Transformer les rapports datés en historique et maintenir une page d'état courant générée ou vérifiée.

### AUT-39 — Observabilité insuffisante — P1/P2

Ajouter métriques par run/source : durée, requêtes, pages, reçues, nouvelles, mises à jour, ignorées, invalides, erreurs, retries, rate-limit et couverture de scoring. Exposer des erreurs courtes dans l'UI et garder les détails techniques redigés dans les logs.

## Modèle de configuration recommandé

Exemple conceptuel, sans secrets :

```yaml
version: 1
onboarding_completed: true
search:
  home_commune_insee: "38249"
  departments: ["38"]
  communes_insee: ["38249", "38229", "38140"]
  remote: [hybrid, full]
  max_commute_minutes: 45
  roles: [devops, administrateur_systeme, developpeur_fullstack]
  include_keywords: [linux, docker, python]
  exclude_keywords: [stage, alternance]
  contracts: [cdi, contractuel, fonctionnaire]
  sectors: [private, public]
sources:
  ft: { enabled: true, max_per_query: 50 }
  csp_filter: { enabled: true, categories: [A, B] }
  emploi_territorial: { enabled: true, departments: ["038"] }
schedule:
  enabled: true
  local_time: "12:00"
  timezone: Europe/Paris
  days: [mon, tue, wed, thu, fri]
  catch_up: true
applications:
  daily_target: 1
learning:
  enabled: true
  confirmation_threshold: 2
```

Les IDs de commune doivent être résolus par une source de référence et non devinés à partir d'un texte libre. Le profil sauvegardé doit être validé, versionné et hashé.

## Ordre d'exécution recommandé

### Phase 0 — Réparer la vérité actuelle

1. snapshot de la DB live ;
2. migration sûre des faux `TO_PREPARE` ;
3. statut de readiness honnête ;
4. corriger `SystemExit`, la finalisation des runs et le verrou temporel ;
5. rescore complet contrôlé vers `v4-feedback` ;
6. smoke FT réel, puis preuve navigateur.

### Phase 1 — Fondations autonomes

1. contrat de configuration canonique ;
2. Settings namespace host ;
3. API de config/validation/diagnostics ;
4. roue crantée et assistant onboarding ;
5. bootstrap venv + DB ;
6. activation indépendante des sources.

### Phase 2 — Recherche réellement personnalisable

1. adaptateurs de localisation ;
2. métiers, contrats, exclusions et remote ;
3. unification du scoring ;
4. rescore durable et version de profil ;
5. feedback proposant des changements de recherche confirmables.

### Phase 3 — Exploitation robuste

1. runs asynchrones et scheduler durable ;
2. cycle de vie des offres ;
3. notifications ;
4. sauvegarde/export ;
5. observabilité et tests navigateur.

### Phase 4 — Produit candidature

1. historique métier ;
2. dossiers et pièces par offre ;
3. rappels et échéances ;
4. statistiques de funnel ;
5. éventuelle assistance de préparation, sans jamais compter une candidature avant confirmation manuelle d'envoi externe.

## Definition of Done pour « autonome à 100 % »

Le plugin peut être considéré autonome lorsque, depuis une installation vierge, un utilisateur peut sans terminal :

- ouvrir Job Researcher et comprendre ce qui manque ;
- configurer sa zone et ses critères ;
- fournir les secrets via le coffre DSH ;
- installer ou valider le runtime Python ;
- initialiser la base ;
- tester chaque source ;
- lancer un premier run et suivre sa progression ;
- obtenir des offres scorées avec une explication et une version de profil ;
- modifier ses réglages et provoquer un rescore complet ;
- voir les erreurs et les corriger depuis l'UI ;
- redémarrer DSH sans perdre planning, progression ou état ;
- sauvegarder/exporter ses données ;
- conserver une distinction stricte entre intérêt, préparation et candidature réellement envoyée.

## Validation effectuée pour cet audit

- lecture de tous les modules host principaux, du client, du worker Python, des sources, schémas, migrations et tests ;
- comparaison avec les patterns Settings de `dsh-piblox-theme`, `dsh-piblox-secrets` et `dsh-piblox-discord` ;
- vérification du montage du plugin dans le profil web et égalité du hash de `src/index.js` ;
- lecture redigée de `/api/job-researcher/status` ;
- agrégats SQLite en mode lecture seule ;
- `npm test` : 27 tests Node et 10 tests Python réussis ;
- `git diff --check` signale une espace finale préexistante dans `docs/audits/dsh-job-researcher-migration.md` ;
- aucun restart, run de collecte, write DB ou changement de configuration effectué.

## Limites de cet audit

- aucune interaction navigateur authentifiée n'a été réalisée ;
- aucune API externe n'a été appelée ;
- les protections globales DSH d'authentification/CSRF n'ont pas été exercées ;
- les faits live ci-dessus sont un instantané et peuvent évoluer après un run ou un redémarrage.
