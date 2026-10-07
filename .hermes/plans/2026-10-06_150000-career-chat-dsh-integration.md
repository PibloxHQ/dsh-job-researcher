# Job Researcher Career Chat DSH Integration Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ajouter à `dsh-job-researcher` un agent conversationnel dédié à la revue des offres, intégré à une sidebar droite native DSH redimensionnable, capable d'analyser, proposer des modifications et s'améliorer de manière contrôlée sans perdre les références canoniques de chaque élément.

**Architecture:** Le plugin reste propriétaire des données métier, du profil, des scores, du registre d'améliorations et des outils de revue. DSH reste propriétaire de la session, de l'historique, du composer, du rendu de conversation, des commandes, du system prompt par tour et du layout/sidebar. Le panneau Job Researcher s'enregistre dans les APIs natives `ui-sidebar-right`/`sidebarRightTabs` et ne recrée ni conversation, ni resize, ni stockage de transcript. À chaque tour, une section native de system prompt injecte un manifeste dynamique des emplacements canoniques, autorités, droits et versions ; l'agent ne devine jamais un chemin.

**Tech Stack:** Plugin Cordis DSH, Node.js ESM, SQLite existant, `systemPrompt`, outils DSH, client React/slots DSH, tests Node/Python, smoke WebUI Playwright/CDP.

---

## Contexte vérifié

- Le plugin existe dans `~/dsh-lab/plugins/dsh-job-researcher` et expose déjà l'API `/api/job-researcher/*`, le profil carrière, les scores déterministes, Jev et les retours structurés.
- Le client actuel est principalement rendu par `src/client/index.js`; il ne faut pas transformer la modal d'offre en second chat indépendant.
- DSH traite une session comme un journal d'événements append-only : l'historique modèle est dérivé du journal. `/reset` ne doit donc pas effacer ou réécrire le transcript existant.
- Le WebUI officiel expose une sidebar droite (`ui-sidebar-right`, `ctx.sidebarRight`, `ctx.sidebarRightTabs`) et des extensions de conversation par slots. Le plugin doit consommer ces contrats natifs, pas fabriquer une colonne `position: fixed`, un splitter CSS ou un stockage local de messages.
- Le plugin officiel `ui-commands` fournit la découverte et le dispatch des commandes `/` par session. Les commandes métier doivent s'y raccorder.
- Le worktree contient déjà un `pnpm-lock.yaml` non suivi : il doit rester intact et ne devra pas être inclus dans les commits de cette mission.

## Recentrage : agent de revue et d'amélioration contrôlée

Le chat n'est pas seulement un assistant qui répond aux questions. C'est un agent de revue des offres qui peut :

- rechercher et proposer des offres à partir d'une demande naturelle ;
- expliquer pourquoi une offre est bonne, mauvaise ou incertaine ;
- comparer les scores déterministes, Jev et les retours utilisateur ;
- demander les informations manquantes ;
- proposer une modification du profil, des préférences ou des notes ;
- appliquer certaines modifications autorisées après confirmation ;
- transformer les erreurs récurrentes en propositions d'amélioration versionnées ;
- mesurer une amélioration sur un petit jeu d'offres de référence avant de l'accepter.

Il ne s'auto-modifie pas librement. L'auto-amélioration est une boucle contrôlée : observation → proposition → diff → validation → application → mesure → acceptation ou rollback.

## Manifeste canonique injecté à chaque tour

Le plugin doit produire un manifeste dynamique via une section native `systemPrompt`, avec une version et une empreinte. Exemple de contrat, à adapter aux chemins réellement observés au runtime :

```text
[JOB_RESEARCHER_CONTEXT_MANIFEST]
manifest_version: 1
generated_at: <timestamp>
plugin_id: dsh-job-researcher
workspace_root: <workspace autorisé>
plugin_root: <racine canonique du plugin>
data_root: <répertoire runtime Job Researcher>
database: <chemin DB, lecture via outils métier uniquement>
profile_markdown: <fichier Markdown source éditable>
profile_derived: <vue dérivée déterministe>
profile_revision: <numéro>
profile_hash: <empreinte>
feedback_api: /api/job-researcher/offers/:id/feedback
offers_api: /api/job-researcher/offers
learning_api: /api/job-researcher/learning
jev_api: /api/job-researcher/jev-enrich
improvement_registry: <fichier/table des propositions>
review_benchmark: <jeu borné d'offres de référence>
allowed_read_paths: [...]
allowed_write_paths: [...]
read_authority: database/API > profile_markdown > profile_derived > session_summary
write_policy: diff + confirmation + version check
secrets: never exposed
[END_JOB_RESEARCHER_CONTEXT_MANIFEST]
```

Règles du manifeste :

1. Il est généré à chaque tour par le runtime, pas copié dans une consigne utilisateur statique.
2. Les chemins sont résolus avec `realpath` et contrôlés par containment ; aucun chemin ne vient directement d'un argument du modèle.
3. Chaque entrée indique son autorité, son mode (`read`, `propose`, `write-via-api`) et sa fraîcheur.
4. Les chemins secrets, tokens, valeurs de secrets et fichiers hors périmètre n'apparaissent jamais.
5. L'agent doit utiliser les identifiants et chemins du manifeste ou demander une clarification ; il ne doit jamais inventer `~/...`, un nom de DB ou une route.
6. Le manifeste est mesurable dans les événements de préparation de tour, sans ajouter le contenu sensible au transcript utilisateur.

## Boucle d'auto-amélioration

Les améliorations sont réparties en trois niveaux :

| Niveau | Exemples | Application |
|---|---|---|
| A — profil et préférences | mobilité, métier, salaire, environnement | diff + confirmation, version du profil |
| B — données et règles de revue | tag, question, explication, benchmark | proposition versionnée + test ciblé + confirmation |
| C — code, prompt système, scoring | bug, outil, poids, contrat DSH | mission d'ingénierie séparée, revue, tests, commit/push |

Une proposition d'amélioration doit toujours contenir :

```text
improvement_id
source_session_id
observed_problem
evidence_offer_ids
proposed_change
target_file_or_api
before / after
expected_effect
risks
validation_command
status: proposed | accepted | rejected | rolled_back
```

Les propositions `proposed` ne sont pas injectées comme règles actives. Seules les améliorations `accepted` et compatibles avec la version courante sont incluses dans les tours suivants. Toute amélioration de score doit être comparée sur le benchmark de référence et ne peut pas modifier silencieusement les scores historiques.

Références DSH à conserver dans la documentation d'implémentation :

- [Sessions DSH](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)
- [Client Web DSH](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/README.md)
- [Conversation UI et slots](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/README.md)
- [UI Commands](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-commands)

## Décisions d'architecture

### Session

Un panneau actif correspond à une session DSH carrière dédiée. La session est identifiée par le `sessionId` DSH courant et non par un identifiant inventé dans le plugin.

- Première ouverture : récupérer ou créer la session Job Researcher.
- Changement d'offre : changer le contexte actif, sans créer une session pour chaque clic.
- `/new` : créer une nouvelle session carrière vide avec le profil courant, sans offre active.
- `/reset` : créer une nouvelle session propre, archiver l'ancienne dans la navigation DSH et ne conserver que le profil + les préférences confirmées. Ne pas réinjecter l'ancien transcript.
- Les sessions précédentes restent consultables via la navigation native DSH.

### Sidebar redimensionnable

- Enregistrer un onglet via l'API native de la sidebar droite du WebUI.
- Laisser le WebUI gérer l'ouverture, la fermeture, la largeur, le splitter, le breakpoint mobile, le focus et la persistance de la taille.
- Ne pas ajouter de `window.resize`, `position: fixed`, `width` persistée maison, drag handle ou overlay global.
- Le panneau du plugin doit respecter la largeur fournie par le parent et rester utilisable entre les largeurs minimale et maximale exposées par DSH.

### Contexte

Le modèle reçoit un contexte borné, construit à la demande :

```text
Règles de l'agent carrière
Profil Markdown + profil dérivé + version/hash
Préférences et apprentissages utilisateur confirmés
Offre(s) active(s), par identifiant DB
Résultats d'outils limités
Résumé des échanges récents
Question courante
```

Le modèle ne reçoit jamais automatiquement les 4 200 offres, les secrets, le transcript complet d'autres sessions, ni les fichiers du dépôt sans outil explicitement autorisé.

### Écriture et sécurité

- Lecture d'offres, comparaison, explication et recherche : automatique.
- Enregistrement d'un feedback utilisateur : confirmation explicite ou geste UI équivalent.
- Modification du profil ou d'un fichier de notes : produire un diff, demander confirmation, écrire uniquement dans les chemins possédés par Job Researcher.
- Modification du code du plugin, des règles DSH, des secrets ou de la base hors API métier : interdite dans l'agent carrière.
- Candidature : jamais sans confirmation explicite ; aucune soumission automatique.
- Toute sortie d'offre doit distinguer score déterministe, score Jev, faits observés, hypothèses et informations manquantes.

## Contrat conversationnel proposé

### Outils métier

Créer un contrat stable et testable pour :

```text
job_researcher_get_profile
job_researcher_search_offers
job_researcher_get_offer
job_researcher_compare_offers
job_researcher_explain_score
job_researcher_get_feedback
job_researcher_record_feedback
job_researcher_propose_profile_change
job_researcher_save_note
```

Les outils retournent des enveloppes structurées avec `offer_id`, `profile_revision`, `score_source`, `evidence`, `uncertainties` et `next_actions`. Les recherches doivent imposer des limites (`limit`, maximum d'offres, taille maximale de description) et un tri explicite.

### Prompt système

Ajouter une section versionnée, par exemple `job-researcher-career.v1`, injectée par `systemPrompt` uniquement dans la session carrière. Elle doit imposer :

1. Ne pas inventer d'information absente de l'offre ou du profil.
2. Ne pas confondre adéquation du poste, adéquation de l'entreprise et probabilité de recrutement.
3. Expliquer les raisons positives et négatives avant de recommander.
4. Demander confirmation avant de transformer une hypothèse en préférence persistante.
5. Utiliser Jev seulement pour les analyses qui nécessitent un jugement avancé, jamais en fan-out implicite sur toute la DB.
6. Pour une décision « pas intéressé », proposer plusieurs tags structurés et conserver le commentaire libre séparément.
7. Ne jamais postuler sans confirmation.

### Commandes

Enregistrer via le système de commandes DSH, avec une commande associée à la session :

```text
/new       nouvelle session carrière propre
/reset     nouvelle session propre en remplaçant le contexte actif
/profile   profil, version, hash et sources utilisées
/offer ID  charger une offre dans le contexte actif
/compare ID... comparer 2 à 5 offres
/context   afficher le contexte actuellement injecté, sans secrets
```

Les commandes doivent être idempotentes côté client, refuser les IDs invalides et renvoyer un résultat visible dans la conversation native ou une notification native, sans écrire de faux message dans le transcript.

## Plan d'implantation par tâches

### Task 1: Figer le contrat et l'inventaire des APIs DSH installées

**Objective:** Confirmer les noms et formes exactes des APIs disponibles dans la version DSH du profil `web` avant d'écrire le client.

**Files:**
- Create: `docs/plans/career-chat-dsh-api-inventory.md`
- Inspect only: `~/dsh-lab/runtime/dsh-home/profiles/web/node_modules/` et le miroir DSH local

**Steps:**

1. Identifier les exports/types réellement installés pour `ui-sidebar-right`, `ui-slots`, `ui-conversation`, `ui-session` et `ui-commands`.
2. Relever la signature de l'enregistrement d'un tab de sidebar, les props transmises au composant et le scope de session.
3. Relever l'API de création/fork/sélection d'une session et le dispatch des commandes.
4. Documenter uniquement les contrats observés, avec version/hash du runtime.
5. Vérifier que le panneau peut demander l'ouverture de son tab sans prendre possession du resize.

**Validation:** aucune hypothèse d'API n'est codée tant que le contrat local n'est pas identifié ; le document distingue API officielle, runtime local et point à vérifier en smoke.

**Commit:** `docs: record native DSH career chat integration contracts`

### Task 2: Ajouter le contexte carrière borné et versionné

**Objective:** Construire le contexte métier sans faire transiter toute la base ou tout le transcript.

**Files:**
- Create: `src/career-context.js`
- Create: `test/career-context.test.js`
- Modify: `src/profile.js`
- Modify: `src/config.js` uniquement si une limite de contexte doit être configurable

**Steps:**

1. Écrire les tests des limites : profil tronqué de façon déterministe, offre limitée, IDs obligatoires, absence de secret, ordre stable.
2. Implémenter `buildCareerContext({ profile, offers, feedback, transcriptSummary, activeTask })`.
3. Ajouter un `context_version`, `profile_revision`, `profile_hash` et des compteurs de taille.
4. Refuser les offres sans identifiant et borner le nombre d'offres actives à 5.
5. Ajouter une fonction de résumé des échanges qui ne conserve que faits, décisions, questions ouvertes et actions en attente.

**Validation:** `node --test test/career-context.test.js` ; vérifier qu'une base de 4 200 offres ne produit jamais un contexte de 4 200 offres.

**Commit:** `feat: add bounded career conversation context`

### Task 3: Exposer les outils Job Researcher en lecture contrôlée

**Objective:** Donner à l'agent une interface métier structurée pour rechercher et expliquer les offres.

**Files:**
- Create: `src/career-tools.js`
- Create: `test/career-tools.test.js`
- Modify: `src/index.js`
- Modify: `src/store.js` si une requête bornée manque

**Steps:**

1. Écrire des tests d'arguments invalides, limites, offre inexistante et séparation des sources de score.
2. Implémenter les outils de profil, recherche, détail, comparaison et explication.
3. Retourner des résultats JSON structurés et bornés, jamais du HTML ou une concaténation non contrôlée.
4. Brancher les outils sur `getStore()` et les services Jev existants sans créer une seconde logique de scoring.
5. Ajouter une protection de lecture sur les offres retirées/stales et documenter le comportement.

**Validation:** tests Node ; appels directs avec une DB de test ; aucune écriture DB pendant les outils de lecture.

**Commit:** `feat: expose bounded career research tools`

### Task 4: Ajouter le prompt et les garde-fous de l'agent carrière

**Objective:** Encadrer le comportement du chat sans mélanger les responsabilités de Job Researcher et du codeur DSH.

**Files:**
- Create: `docs/career-chat-agent-contract.md`
- Create: `src/career-prompt.js`
- Create: `test/career-prompt.test.js`
- Modify: `src/index.js`

**Steps:**

1. Écrire les tests des règles critiques : pas de candidature implicite, séparation score/Jev, confirmation pour profil/feedback, limite des offres.
2. Construire la section `job-researcher-career.v1` avec profil de rôle et instructions de sortie.
3. Injecter la section uniquement dans la composition/session carrière détectée.
4. Ajouter un format de réponse lisible : recommandation, preuves, écarts, incertitudes, prochaine action.
5. Documenter les actions interdites et la frontière avec un agent d'ingénierie.

**Validation:** test de snapshot du prompt ; vérifier que les secrets et chemins de dépôt ne sont pas inclus.

**Commit:** `feat: add career agent prompt contract`

### Task 5: Intégrer `/new`, `/reset`, `/profile`, `/offer`, `/compare`, `/context`

**Objective:** Utiliser les commandes natives DSH pour contrôler explicitement le contexte de la session.

**Files:**
- Create: `src/career-commands.js`
- Create: `test/career-commands.test.js`
- Modify: `src/index.js`
- Modify: `cordis.patch.yml` seulement si l'injection/entrée de composition l'exige

**Steps:**

1. Écrire les tests de parsing, validation d'ID, bornes de comparaison et idempotence.
2. Enregistrer les commandes dans `ui-commands` selon le contrat inventorié à la Task 1.
3. Implémenter `/new` avec création d'une session carrière vide.
4. Implémenter `/reset` comme création/fork d'une nouvelle session, sans suppression du journal précédent.
5. Implémenter les commandes de consultation et vérifier qu'elles ne poussent pas de faux messages dans le transcript.

**Validation:** tests unitaires avec un fake DSH session/command service ; smoke sur une session neuve et une session avec historique.

**Commit:** `feat: add native career session commands`

### Task 6: Ajouter le tab Job Researcher dans la sidebar droite native

**Objective:** Rendre le chat accessible depuis une sidebar DSH réellement redimensionnable.

**Files:**
- Create: `src/client/career-sidebar.js`
- Create: `test/client-career-sidebar.test.js`
- Modify: `src/client/index.js` uniquement pour partager les actions d'offre et le profil
- Modify: `package.json` si une déclaration client supplémentaire est nécessaire

**Steps:**

1. Écrire un test de composition vérifiant l'enregistrement du tab via l'API native et le scope `session`.
2. Enregistrer le tab dans `sidebarRightTabs`/`ctx.sidebarRight` selon le contrat local observé.
3. Rendre le contenu à partir de la session DSH et des props de largeur fournies par le parent.
4. Ajouter les actions « ouvrir », « fermer », « nouvelle discussion » et « réinitialiser » sans logique de layout maison.
5. Ajouter l'affichage de l'offre active et des chips de contexte.
6. Supprimer ou éviter toute règle CSS de largeur fixe, splitter custom ou `position: fixed`.

**Validation:** test client ; vérification visuelle à 1280 px, 1024 px, 768 px et mobile ; drag du splitter natif DSH ; ouverture/fermeture ; persistance de largeur gérée par DSH.

**Commit:** `feat: mount career chat in native resizable sidebar`

### Task 7: Relier les offres et le chat sans créer de sessions parasites

**Objective:** Permettre de discuter d'une offre depuis la liste ou la modal en réutilisant la session carrière active.

**Files:**
- Modify: `src/client/index.js`
- Modify: `src/client/career-sidebar.js`
- Create: `test/client-career-context.test.js`

**Steps:**

1. Ajouter une action « Discuter de cette offre » dans la modal et la ligne d'offre.
2. Transmettre uniquement `offer_id` et le minimum de métadonnées affichables au panneau.
3. Réutiliser la session active ; ne pas créer une session à chaque clic.
4. Afficher un marqueur de contexte actif et permettre de retirer l'offre du contexte.
5. Vérifier qu'un changement d'offre ne réécrit pas l'historique passé.

**Validation:** smoke avec 3 clics sur 3 offres ; une seule session active ; `/reset` crée exactement une nouvelle session ; l'offre active est bien retrouvée après fermeture/réouverture du panneau.

**Commit:** `feat: bind offer actions to career session`

### Task 8: Ajouter les propositions de modification du profil et des notes

**Objective:** Permettre à l'agent de proposer des améliorations du profil sans mutation silencieuse.

**Files:**
- Create: `src/career-writes.js`
- Create: `test/career-writes.test.js`
- Modify: `src/http.js`
- Modify: `src/store.js` si une table de notes dédiée est nécessaire
- Modify: `docs/career-chat-agent-contract.md`

**Steps:**

1. Écrire les tests de diff, confirmation requise, chemin autorisé et annulation.
2. Ajouter une API de proposition qui retourne un diff et un identifiant de proposition.
3. Ajouter une API de confirmation idempotente qui met à jour le profil via le chemin de configuration existant.
4. Enregistrer l'auteur, la session, la version avant/après et la source de la proposition.
5. Refuser toute écriture de code, secret, configuration DSH ou chemin hors périmètre.

**Validation:** test d'absence de mutation avant confirmation ; test de concurrence sur la version du profil ; test de rollback/annulation.

**Commit:** `feat: gate career profile changes behind explicit confirmation`

### Task 8 bis: Injecter le manifeste canonique à chaque tour

**Objective:** Donner à l'agent les emplacements, autorités, versions et droits exacts dont il a besoin avant chaque réponse ou appel d'outil.

**Files:**
- Create: `src/career-context-manifest.js`
- Create: `test/career-context-manifest.test.js`
- Modify: `src/index.js`
- Modify: `src/career-prompt.js`
- Modify: `docs/career-chat-agent-contract.md`

**Steps:**

1. Écrire les tests de résolution des chemins, containment, absence de secrets, version/hash du profil et fallback lorsque la DB n'est pas disponible.
2. Construire le manifeste depuis les chemins effectivement utilisés par `paths.js`, le store et la configuration runtime.
3. Ajouter le manifeste comme section dynamique du `systemPrompt`, avec `manifest_version` et empreinte.
4. Ajouter pour chaque emplacement `authority`, `access`, `freshness` et `owner`.
5. Injecter les limites et les outils autorisés à côté des chemins afin d'éviter qu'un chemin de DB soit modifié directement.
6. Vérifier dans un test de contrat que le manifeste est recalculé par tour et qu'aucun secret ou chemin hors racine n'est rendu au modèle.

**Validation:** test unitaire de containment ; test de snapshot de section système ; inspection d'un événement `agent/pre-step` avec manifest hash ; aucun chemin inventé dans les réponses.

**Commit:** `feat: inject canonical career context manifest per turn`

### Task 8 ter: Mettre en place l'auto-amélioration versionnée

**Objective:** Permettre à l'agent de détecter une erreur de revue et de proposer une amélioration mesurable sans s'auto-modifier silencieusement.

**Files:**
- Create: `src/career-improvements.js`
- Create: `test/career-improvements.test.js`
- Modify: `src/career-writes.js`
- Modify: `src/store.js`
- Modify: `src/career-prompt.js`
- Create: `docs/career-improvement-loop.md`

**Steps:**

1. Écrire les tests du cycle `proposed → accepted/rejected → rolled_back`, de l'idempotence et du contrôle de version.
2. Ajouter un registre SQLite ou fichier append-only dédié aux propositions, sans mélanger les retours d'offres et les changements de code.
3. Implémenter la sortie structurée d'une proposition avec preuves, offres concernées, diff, risque et validation attendue.
4. Autoriser automatiquement seulement les modifications de niveau A après confirmation explicite ; les niveaux B/C restent en attente.
5. Ajouter les commandes `/improve`, `/accept <id>`, `/reject <id>`, `/rollback <id>` et `/improvements` via le système natif DSH.
6. Construire un benchmark borné de 20 à 30 offres représentatives pour comparer avant/après sans rescorrer toute la DB.
7. Bloquer l'acceptation si le benchmark régresse au-delà du seuil documenté ou si les preuves sont insuffisantes.
8. Injecter uniquement les améliorations acceptées dans le manifeste et le prompt des tours suivants.

**Validation:** tests de concurrence/version ; benchmark avant/après ; preuve qu'une proposition rejetée n'influence aucun tour ; rollback vérifié ; aucune mutation de code sans mission séparée.

**Commit:** `feat: add governed career agent self-improvement loop`

### Task 9: Compaction, reprise et état dégradé

**Objective:** Garder une conversation exploitable lorsque le contexte grossit ou qu'un service est indisponible.

**Files:**
- Modify: `src/career-context.js`
- Modify: `src/career-prompt.js`
- Create: `test/career-recovery.test.js`
- Create: `docs/career-chat-recovery.md`

**Steps:**

1. Tester une session avec transcript long et vérifier la production d'un résumé borné.
2. Tester Jev indisponible : afficher une réponse déterministe, jamais une recommandation inventée.
3. Tester DB indisponible : afficher un état dégradé avec action de reprise.
4. Tester `/reset` après erreur ou sortie incohérente.
5. Ajouter une commande de diagnostic `/context` sans exposer de secret.

**Validation:** tests Node ; replay d'une session ; smoke après redémarrage DSH ; vérification que la session précédente reste lisible.

**Commit:** `feat: harden career chat context recovery`

### Task 10: Documentation, mission et vérification live

**Objective:** Prouver l'intégration dans le runtime réel et synchroniser la documentation du plugin.

**Files:**
- Modify: `README.md`
- Create: `docs/career-chat-dsh.md`
- Modify: `docs/audits/ui-ux-audit-2026-10-06.md`
- Modify: Mission Hub #231 via son outil/API

**Steps:**

1. Documenter l'installation, les commandes, le contexte, les limites et le comportement de reset.
2. Exécuter `pnpm test`, `pnpm run check` et `git diff --check`.
3. Propager le plugin dans chaque profil DSH qui le monte ; comparer les hashes source/runtime.
4. Redémarrer le profil DSH selon le runbook, puis vérifier `ready` et l'API Job Researcher.
5. Faire un smoke navigateur avec une session neuve : ouvrir la sidebar, redimensionner, sélectionner une offre, discuter, `/offer`, `/compare`, `/reset`, fermer/réouvrir.
6. Vérifier les événements/session logs sans considérer un simple rendu UI comme preuve de session.
7. Mettre à jour Mission Hub #231 avec commits, tests, runtime, limites et risques restants.
8. Committer uniquement les fichiers du plugin et du plan ; laisser `pnpm-lock.yaml` non suivi.
9. Pousser régulièrement après chaque groupe de tâches validé, sans force push.

**Validation attendue:** source et runtime synchronisés, WebUI sain, sidebar nativement redimensionnable, session unique réutilisée, `/reset` isolant réellement le contexte, aucun secret dans le transcript, tests verts.

**Commit final:** `docs: document career chat DSH integration and verification`

## Critères d'acceptation globaux

- [ ] La sidebar utilise les balises/APIs natives DSH et son resize fonctionne avec le splitter natif.
- [ ] Aucun resize, overlay ou stockage de messages propriétaire n'est ajouté.
- [ ] Une discussion Job Researcher réutilise une seule session DSH active.
- [ ] `/new` crée une session vide ; `/reset` isole le nouveau contexte sans effacer l'ancien journal.
- [ ] Le profil courant est versionné et injecté de façon bornée.
- [ ] Un manifeste canonique est injecté nativement à chaque tour avec les emplacements, autorités, versions et droits utiles.
- [ ] L'agent ne devine jamais un chemin et n'utilise jamais un chemin comme autorisation d'écriture.
- [ ] Les offres sont chargées par outil et par identifiant, jamais toutes dans le prompt.
- [ ] Les scores déterministes, Jev, preuves et hypothèses restent séparés.
- [ ] Les écritures de profil/notes passent par diff + confirmation.
- [ ] Les auto-améliorations sont proposées, versionnées, mesurées sur un benchmark et acceptées ou rejetées explicitement.
- [ ] Une proposition de niveau code/scoring/prompt ne devient jamais active sans mission d'ingénierie et validation.
- [ ] Aucune candidature n'est envoyée sans confirmation explicite.
- [ ] Le comportement est documenté et prouvé dans le runtime DSH réel.

## Risques et questions à verrouiller avant implémentation

1. **Contrat exact du runtime local :** les noms de méthodes doivent venir des packages réellement installés dans `profiles/web`, pas seulement de la documentation GitHub.
2. **Création/fork de session :** si le runtime expose uniquement la création native et pas un fork public, `/reset` devra créer une nouvelle session et marquer l'ancienne comme remplacée via une relation de métadonnées minimale, sans modifier son journal.
3. **Portée du profil :** le profil doit être injecté par référence/version et résumé, avec le Markdown complet seulement sur demande ou si le modèle possède une capacité de contexte suffisante.
4. **Chemins et manifeste :** un chemin fourni au modèle n'est pas une autorisation d'écriture ; l'accès passe par les outils et les règles du manifeste.
5. **Auto-amélioration :** les niveaux B/C nécessitent une revue et une mission d'ingénierie ; aucune modification du prompt, du scorer ou du code ne doit devenir active simplement parce que l'agent l'a proposée.
6. **Écriture :** les modifications de profil/notes peuvent être confirmées dans le chat ; les écritures de code restent hors périmètre de l'agent carrière.
7. **Jev :** les appels restent bornés et explicites ; le chat ne doit pas réintroduire le fan-out des 4 200 offres que le pipeline avait précisément évité.
