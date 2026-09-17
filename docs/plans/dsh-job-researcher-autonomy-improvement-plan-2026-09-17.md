# Plan d’amélioration — autonomie DSH Job Researcher

**Date :** 2026-09-17  
**Source :** [`../audits/dsh-job-researcher-autonomy-audit-2026-09-17.md`](../audits/dsh-job-researcher-autonomy-audit-2026-09-17.md)  
**Statut plan :** implémentation runtime 2026-09-17 — voir §18 journal  
**Produit cible :** plugin autonome installable et paramétrable depuis DSH (sans shell)

**Complément parcours utilisateur :** [Plan UX du 2026-09-17](dsh-job-researcher-user-journey-plan-2026-09-17.md). Les lots A/B corrigent en priorité les ouvertures de fiche provoquées par le tri rapide, les réponses tardives et les pertes de brouillon ; intégrer leur recette aux livraisons de ce plan.

---

## 1. Analyse synthétique de l’audit

### 1.1 Verdict retenu

Job Researcher est un **tableau de bord opérationnel sur une install lab déjà câblée**, pas encore un **produit autonome**.  
Le gap central n’est pas « un champ localisation manquant » : c’est l’absence d’un **profil de recherche versionné** + **bootstrap** + **readiness honnête**. Aujourd’hui la politique métier vit dans le code ; l’UI ne fait que filtrer un stock déjà collecté.

### 1.2 Ce qui est déjà solide (ne pas casser)

| Domaine | Atout |
|---|---|
| Secrets | Cordis `secrets` + `materialize` fail-closed ; jamais dans le plugin config |
| Données | SQLite plugin-owned, migrations additives, décisions ≠ candidatures |
| Feedback | Provenance `user` vs `legacy`/`system` ; learning borné |
| UI shell | Panel `main` + `sidebar.panellist` (session-like) ; détail en modal |
| Qualité | Tests Node/Python verts ; pas de double-écriture Hermes |

### 1.3 Delta post-audit (vérité live 2026-09-17 après correctifs)

L’instantané d’audit (toutes les lignes en `TO_PREPARE`, décisions YES/MAYBE/NO legacy) est **partiellement obsolète** :

| Signal audit | Après correctifs session |
|---|---|
| Candidatures `TO_PREPARE` × 4128 | **`NONE` × 4128** |
| Décisions YES/MAYBE/NO legacy | **`UNREVIEWED` × 4128** |
| Secrets FT | toujours **présents** |
| `status=live` trop optimiste | **toujours vrai** (non corrigé) |
| Score `v4-feedback` / rescore | **toujours ouvert** |
| Settings / bootstrap / async run | **toujours ouverts** |

→ **AUT-03 (données)** : état `UNREVIEWED/NONE` confirmé en lecture seule sur 4 128 lignes lors de cette revue ; `migrate_db` initialise désormais les nouvelles lignes à `UNREVIEWED`. Cela ne prouve pas encore la conservation des futurs retours utilisateur après réouverture : voir REV-01. Les autres assertions live du tableau restent celles de la session précédente, non revérifiées ici.  
→ Le reste du P0 audit reste ouvert.

### 1.4 Carte des risques (regroupement AUT-*)

```text
P0 vérité / run
  AUT-03 données ✓ (live) · AUT-04 readiness · AUT-05/06 FT secrets & SystemExit
  AUT-18/19/20 async + lock + scheduler

P0 autonomie produit
  AUT-01 Settings · AUT-02 bootstrap · AUT-34 API config

P1 politique de recherche
  AUT-07…12 localisation/métiers/contrats/schedule/sources/provenance
  AUT-13…15 scoring unifié + rescore + feedback→suggestions

P1/P2 fiabilité & data lifecycle
  AUT-21…30 · AUT-31…33 · AUT-35…39
```

---

## 2. Objectif produit (Definition of Done)

Une install **vierge** DSH doit permettre, **sans terminal** :

1. comprendre ce qui manque (readiness) ;
2. configurer zone + critères + sources ;
3. poser les secrets FT via Settings → Secrets ;
4. bootstrap Python/venv/DB ;
5. tester chaque source ;
6. lancer un run avec progression ;
7. obtenir des offres scorées (`v4-feedback`) avec version de profil ;
8. changer les réglages → rescore complet ;
9. redémarrer sans perdre planning / état ;
10. distinguer strictement intérêt / préparation / envoi externe.

---

## 3. Principes de conception (non négociables)

1. **Secrets ≠ Settings JR** — JR n’affiche que `présent/manquant` + deep-link Secrets.  
2. **Profil versionné** — toute collecte/score référence `search_profile_version` + `config_hash`.  
3. **Sources indépendantes** — FT manquant = FT `blocked`, CSP/ET restent exécutables.  
4. **Fail-partial** — jamais `SystemExit` / abandon global pour une source.  
5. **Décision utilisateur explicite** — score `interested` ≠ `user_decision=YES`.  
6. **Candidature manuelle** — aucun seed `TO_PREPARE` sans action opérateur.  
7. **Async runs** — HTTP `202` immédiat ; UI poll ; jamais bloquer sur le worker.  
8. **Mono-utilisateur déclaré** jusqu’à `owner_id` (AUT-30).

---

## 4. Architecture cible (vue d’ensemble)

```text
                    ┌─────────────────────────────┐
                    │  Settings.section JR        │
                    │  + roue navbar → même UI    │
                    └──────────────┬──────────────┘
                                   │ config v1 (YAML/JSON)
                                   ▼
┌──────────────┐    ┌──────────────────────────────┐
│ panellist JR │───▶│ main panel (dashboard)       │
└──────────────┘    │ readiness · runs · offers    │
                    └──────────────┬───────────────┘
                                   │
                    /api/job-researcher/*
                      config · diagnostics · bootstrap
                      sources/:id/test · runs (202)
                      offers · feedback · application
                                   │
                    ┌──────────────┴───────────────┐
                    │ store.js + search_profiles   │
                    │ job_runs (+ snapshot config)  │
                    └──────────────┬───────────────┘
                                   │
                    scheduler (next_due_at durable)
                                   │
                    pipeline.js → Python (venv)
                      adapters(FT/CSP/ET) ← profil
                      triage ← règles profil
                      rescore queue
```

---

## 5. Phases d’exécution

### Phase 0 — Réparer la vérité opérationnelle (3–5 j)

**But :** un opérateur peut faire confiance à l’état affiché et lancer un run sans se faire mentir.

| ID | Work package | Livrables | Done when |
|---|---|---|---|
| P0.1 | AUT-03 confirm | Doc + test clone ; live déjà reset | `UNREVIEWED`/`NONE` stables ; pas de regress seed |
| P0.2 | AUT-04 readiness | Modèle `needs_setup\|installing\|ready\|running\|degraded\|blocked` dans `/status` | UI n’affiche plus « live » si FT jamais sync / score stale |
| P0.3 | AUT-05 secrets scoped | `materialize` seulement si FT enabled | CSP/ET run sans FT |
| P0.4 | AUT-06 SystemExit | Exception métier FT ; `finally` finalize run | OAuth fail ≠ run stuck `running` |
| P0.5 | AUT-19 lock time | Lock SQLite + timestamps epoch/ISO normalisés | Pas de faux « running » > 2h |
| P0.6 | AUT-15 rescore batch | Job rescore `legacy`+`null` → `v4-feedback` | Couverture visible `n/4128` ; ≥1 smoke FT |

**Exit Phase 0 :** conservation des retours après réouverture, contrat FT fonctionnel sur fixtures, readiness exacte, run partiel et reprise après crash validés. Un smoke FT réel conditionne la validation de FT, mais ne bloque pas la livraison d'une configuration CSP/ET seule.

---

### Phase 1 — Fondations autonomes (1–2 sem)

**But :** installation et configuration depuis l’UI.

| ID | Work package | Livrables | Done when |
|---|---|---|---|
| P1.1 | AUT-12/34 contrat config | Schéma JSON Schema / Cordis ; `search_profiles` table | Validation avant write ; version++ |
| P1.2 | AUT-01 Settings | `settings.section` + gear navbar → même surface | Survive restart ; pas de secrets |
| P1.3 | AUT-02 bootstrap | `POST /bootstrap` : python detect, venv, migrate, smoke | Install vierge → 1er run CSP/ET sans shell |
| P1.4 | AUT-11 sources | API liste sources ; `enabled` honoré ; test connexion | UI options dynamiques |
| P1.5 | Onboarding wizard | 9 étapes audit (objectif→premier run) | Relançable ; empty states guidés |
| P1.6 | AUT-32 auth proof | Tests 401 unauth / 200 auth sur routes mutantes | Hypothèse DSH auth documentée PASS |

**Exit Phase 1 :** DoD items 1–6, après anticipation de P2.1–P2.4 et P3.1 : les réglages zone/métiers/contrats/sources/planning doivent effectivement piloter le premier run. Une page qui sauvegarde des champs ignorés par les connecteurs ne satisfait pas ce jalon.

---

### Phase 2 — Recherche personnalisable (1–2 sem)

**But :** plus aucune constante perso hardcodée dans le chemin chaud.

| ID | Work package | Livrables | Done when |
|---|---|---|---|
| P2.1 | AUT-07 localisation | Modèle canonique + adapters FT/ET/CSP | Changer dept/communes sans code |
| P2.2 | AUT-08 métiers | Roles, include/exclude, presets éditables | Preset « Dev/Infra » chargeable |
| P2.3 | AUT-09 contrats/remote | CDI/CDD/… remote hybrid | Filtre collecte + UI |
| P2.4 | AUT-10 schedule | Heure locale, jours, catch-up, daily_target | Cordis patch n’est plus le seul levier |
| P2.5 | AUT-13 scoring unique | `triage.py` alimenté par profil ; Claims-to-Ping déprécié ou branché | Une vérité de score |
| P2.6 | AUT-14 feedback→suggest | Suggestions confirmables (pas auto-mutate profil) | Tag « trop loin » → proposition zone |
| P2.7 | AUT-12 provenance | Snapshot config dans `job_runs` + version sur score | Reproductibilité d’un run |

**Exit Phase 2 :** changer le profil → nouveau run + rescore cohérents ; zéro hardcode 38/INSEE dans le hot path.

---

### Phase 3 — Exploitation robuste (1–2 sem)

| ID | Work package | Livrables | Done when |
|---|---|---|---|
| P3.1 | AUT-18 async | `202 + run_id` ; poll status | Timeout HTTP impossible sur run long |
| P3.2 | AUT-20 scheduler durable | `next_due_at` + claim atomique + catch-up | Restart ne perd pas le créneau |
| P3.3 | AUT-21 source IDs | `connector_id` / `source_id` ; migration états | Plus de `csp` vs `csp-filtre` confus |
| P3.4 | AUT-25 lifecycle | active/expired ; hide expired default | Catalogue propre |
| P3.5 | AUT-22/23 ingest+logs | Upsert batch ; result file ; log rotation | Crash mid-page = rollback lot |
| P3.6 | Notifications | Discord optionnel (si plugin up) | Non bloquant |
| P3.7 | AUT-28 backup UI | Snapshot/export décisions ; restore doc | Sans secrets |
| P3.8 | AUT-39 metrics | Durées, pages, errors par source | Dashboard ops |

**Exit Phase 3 :** DoD items 7–9 (ops, restart, backup).

---

### Phase 4 — Produit candidature (plus tard)

| ID | Scope | Notes |
|---|---|---|
| P4.1 | AUT-29 event log | Append-only décisions/candidatures |
| P4.2 | Dossiers / pièces / rappels | Sans auto-apply |
| P4.3 | Funnel stats | YES → TO_PREPARE → READY → APPLIED |
| P4.4 | AUT-30 multi-user | Seulement si DSH multi-tenant réel |
| P4.5 | AUT-26 dedup cross-source | Empreinte explicable |
| P4.6 | AUT-16/17 Claims-to-Ping | Si le moteur secondaire est conservé |

---

## 6. Backlog priorisé (prochaines 2 semaines)

Ordre de livraison corrigé (prévaut sur le découpage historique des phases) :

1. **REV-01 / REV-02** : protéger les commentaires et réparer le contrat FT, avec régressions isolées.
2. **P1.1 + P1.6 + AUT-31/33** : propriétaire unique des réglages, schéma, validation et contrôle d'accès avant exposition des mutations.
3. **P0.3/P0.4 + P1.4** : sélection effective des connecteurs, secrets par source, erreurs isolées.
4. **P0.5 + P3.1 + REV-04** : jobs durables, claim atomique, réponse 202, progression et reprise ; socle commun au bootstrap et rescore.
5. **P0.2 + P1.3 + AUT-24** : readiness calculée, installation reproductible et base vierge.
6. **P1.2 + P2.1–P2.4** : roue, Settings et propagation réelle zone/métier/contrats/planning jusqu'aux connecteurs et au score.
7. **P0.6 + P2.5/P2.7 + REV-03** : scoring canonique, provenance et rescore exhaustif.
8. **P1.5** : parcours de configuration complet, sauvegarde/reprise et premier run observable.
9. **P3.2–P3.8** : rattrapage, qualité des sources, lifecycle, sauvegarde/restauration, notifications et métriques.

Les connecteurs et composants UI peuvent être développés en parallèle après stabilisation du contrat. La validation finale Settings → requêtes → scores → redémarrage reste un lot d'intégration unique. Les durées ci-dessous sont des estimations, pas un engagement de livraison en deux semaines.

---

## 7. Contrats API (Phase 1 — esquisse)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/config` | Profil redigé + version |
| POST | `/config/validate` | Dry-run validation |
| PUT | `/config` | Save + version optimistic |
| GET | `/diagnostics` | Python, venv, schema, secrets presence, sources |
| POST | `/bootstrap` | Idempotent setup |
| POST | `/sources/:id/test` | Smoke connecteur |
| POST | `/runs` | `202 { run_id }` |
| GET | `/runs/:id` | Progression |
| POST | `/rescore` | File durable |

`/status` reste **lecture** de readiness agrégée — pas de mutations.

---

## 8. UX (Phase 1–2)

### Navbar panel

- Logo + titre  
- Badge readiness (`ready` / `degraded` / `needs_setup`)  
- Run now (disabled si blocked)  
- **Roue** → Settings JR  
- Retour chat  

### Empty / blocked states

- `needs_setup` → CTA « Configurer les fondations »  
- `blocked` FT → lien Secrets, CSP/ET toujours proposés  
- Base vide → premier run guidé  

### Modal offre (existant à durcir)

- Focus trap, restore focus, scroll lock (a11y audit)  
- « Pourquoi trouvée ? » vs « Pourquoi ce score ? »

---

## 9. Tests & validation

| Couche | Ajouts obligatoires |
|---|---|
| Unit | readiness matrix ; secrets scoped ; lock concurrent ; config schema |
| Integration | bootstrap DB absente ; FT down + CSP ok ; `202` run |
| Migration | clone 4128 rows AUT-03 ; csp vs csp-filtre IDs |
| E2E Playwright | onboarding → save → run → modal ; a11y Escape/focus |
| Security | unauth 401 sur PUT config / POST runs |

Gate sortie phase : `npm test` vert + smoke navigateur authentifié + note readiness dans `/status`.

---

## 10. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Scope Settings trop large | Ship Settings v1 = zone + sources + schedule seulement |
| Rescore 4k trop long | Batches + progress UI ; pas bloquer dashboard |
| Double vérité triage vs claims | Freeze claims ; triage-only jusqu’à décision produit |
| FT rate-limit | Backoff + degraded ; autres sources continuent |
| Regression seed décisions | Test migrate : interest score ≠ user_decision |

---

## 11. Estimation indicative

| Phase | Effort | Dépendances |
|---|---|---|
| Phase 0 | 3–5 j | Accès lab, secrets FT déjà présents |
| Phase 1 | 5–10 j | Patterns `dsh-piblox-theme/secrets` Settings |
| Phase 2 | 5–10 j | Phase 1 config schema |
| Phase 3 | 5–10 j | Phase 0 async/lock |
| Phase 4 | backlog | Produit candidature |

**Chemin critique vers « autonome usable » :** Phase 0 + Phase 1 (~2 sem).  
**Chemin critique vers « autonome 100 % » (DoD audit) :** + Phase 2–3 (~4–6 sem).

---

## 12. Prochaine action immédiate

**Implémentation critique livrée** (voir §18). Suite recommandée :

1. Smoke navigateur : Settings → save → Run CSP/ET → readiness badge.
2. Wizard onboarding multi-écrans (P1.5) + tests auth mutantes (P1.6).
3. Propagation contrats/remote + communes CSP (P2) ; lifecycle/backup (P3.4+).
4. Rescore catalogue lab (`POST /rescore` jusqu’à `remaining=0`) + smoke FT live.

---

## 13. Traceabilité AUT → phase

| AUT | Phase | Priorité |
|---|---|---|
| 03 | 0 (done live) | P0 |
| 04, 05, 06, 15, 19 | 0 | P0 |
| 01, 02, 11, 12, 32, 34 | 1 | P0/P1 |
| 07–10, 13–14 | 2 | P1 |
| 18, 20–23, 25, 28, 39 | 3 | P1/P2 |
| 16–17, 24, 26–27, 29–31, 33, 35–38 | 3–4 / hygiene | P2 |
| 30, dossiers candidature | 4 | P2 |

---

## 14. Défauts supplémentaires confirmés par lecture du code

### REV-01 — Conservation des commentaires utilisateur — P0

Preuves : `src/store.js::setUserFeedback/setDecision` recopie le commentaire dans `offers.notes`. Les migrations `ensureFeedbackLearningSchema` et `schema_v2.py::ensure_feedback_learning_schema` effacent tout commentaire égal à `offers.notes`, sans exclure `feedback_origin='user'`. Elles sont exécutées à l'ouverture du store et de `Database`.

Conséquence déduite du code : un retour utilisateur sauvegardé peut être effacé au prochain redémarrage ou run Python, même si son origine reste `user`. Corriger la sélection de migration pour ne traiter que les lignes dont la provenance legacy est démontrée ; rendre la migration historisée et préserver les lignes ambiguës. Ne jamais appliquer de reset global aux retours actuels.

Validation obligatoire : écrire commentaire + tags + décision + candidature depuis Node, fermer, rouvrir via Node puis Python, exécuter un triage et vérifier la conservation exacte de ces champs. Tester aussi la migration des vraies notes legacy.

### REV-02 — Fonction FT absente — P0

Preuves : `dsh_pipeline.py::_sync_source` appelle `ft.iter_ft_offers(settings)`, mais `sources/ft.py` ne définit que `iter_profile_offers(...)` pour l'itération métier. La branche FT échoue donc par `AttributeError` indépendamment des credentials.

Implémenter l'adaptateur canonique multi-requêtes ou corriger l'appel, avec sélection des profils et déduplication. Tester la branche `_sync_source('ft')` réellement utilisée en remplaçant le transport HTTP, puis erreur OAuth et pagination. Un test de présence de secrets ne valide pas cette branche.

### REV-03 — Rescore pouvant retraiter indéfiniment le même lot — P1

Preuve : `_apply_triage()` sélectionne aussi `score_version = SCORE_VERSION`, trie par `last_seen_at DESC` et limite à 500. Les lignes déjà traitées restent éligibles au lot suivant ; ajouter simplement plusieurs runs ne garantit pas d'atteindre le reste du catalogue.

Introduire une génération de scoring (version algorithme + révision profil + révision feedback), un curseur stable et des jobs reprenables. Invalider également le score quand le contenu d'une offre change. Un résultat calculé sur une ancienne génération ne doit pas être présenté comme courant.

Validation : fixture de plus de 1 000 offres, dates identiques, interruption/reprise et changement de profil pendant le calcul ; chaque offre cible doit être traitée sans famine ni écrasement de ses décisions.

### REV-04 — Bootstrap et durée de vie du worker — P1

`scheduler.fire()` ouvre le store avant son `try`, tandis que `openStore()` exige une base existante. Le bootstrap ne peut donc pas dépendre de ce même prérequis. Le processus enfant n'a pas non plus de deadline globale ni de protocole d'arrêt dans `pipeline.js`.

Prévoir un état d'installation accessible avant la DB métier, installation verrouillée et idempotente, timeout/annulation du worker, fermeture des connexions dans `finally` et réconciliation des jobs interrompus au démarrage. Définir explicitement si un worker est arrêté ou repris lors du dispose Cordis.

## 15. Décisions de conception nécessaires à l'implémentation

### Une seule autorité de configuration

Les réglages actifs non secrets sont détenus par le service Settings DSH, dans un namespace validé. `search_profiles` conserve des snapshots immuables pour les runs et les scores, pas une seconde configuration modifiable. La roue et Settings utilisent le même composant et la même commande de sauvegarde.

Chaque sauvegarde inclut la révision attendue ; conflit concurrent → 409 avec état courant. Le hash exclut secrets et métadonnées variables. Le worker reçoit un snapshot validé et immuable au lancement. Une sauvegarde ne modifie pas rétroactivement un run déjà lancé ; l'UI indique les changements applicables au prochain run et le rescore restant.

Le modèle remote `yes/no/unknown` doit évoluer avant d'exposer une préférence `hybrid/full`. Conserver `unknown` sans inventer un mode. Distinguer critères impératifs, préférences pondérées et données absentes ; afficher les critères que chaque source ne sait pas appliquer.

### Recherche géographique cohérente

Tester une commune hors Isère et un département différent de 38 sur les trois connecteurs, la normalisation, les tags et le triage. Prévoir la résolution des communes et des identifiants propres à CSP, les noms ambigus et une indisponibilité du service de résolution. Ne pas promettre un temps de trajet si aucun moteur de trajet n'est intégré : proposer d'abord communes/départements et un rayon uniquement si les coordonnées permettent réellement de le calculer.

### Readiness et santé séparées

Exposer `can_run`, étapes de setup et état par source. Une source désactivée n'est pas une erreur. Aucun premier run signifie « prêt, jamais exécuté », pas un blocage empêchant ce premier run. Une panne FT autorise le run des autres sources. Une base vide, un catalogue sans résultats et une panne de collecte sont trois états distincts.

`GET /status` et `GET /diagnostics` n'exécutent ni migration, ni installation, ni collecte. Déplacer les migrations vers une opération explicite de démarrage/bootstrap : aujourd'hui `getStore()` peut migrer à la première lecture.

### Contrat des jobs et API

- `POST /runs`, `/bootstrap` et `/rescore` répondent après enregistrement durable, sans attendre le travail ; budget de réponse local visé inférieur à une seconde hors indisponibilité du stockage.
- États : `queued`, `running`, `succeeded`, `partial`, `failed`, `cancelled`, `interrupted`, avec horodatages, heartbeat, progression et erreur structurée.
- Clé d'idempotence et claim transactionnel empêchent les doubles clics et doubles instances ; un lease expiré ne permet pas à l'ancien worker de continuer à publier des résultats.
- Conserver temporairement `POST /run` comme alias documenté ; ajouter annulation et détail du job sans casser les clients existants.
- Borner corps JSON, commentaires, pagination, délais réseau et logs ; erreurs de validation 400, conflit 409, indisponibilité 503, accès refusé selon le contrat DSH effectif.
- Vérifier authentication, origine/CSRF si cookies et transport client DSH. Tester une requête locale sans cookie ne suffit pas à prouver une exposition publique.
- Scheduler : politique explicite heure d'été/hiver, runs manqués, déduplication du créneau, modification de planning et fuseau. Ne jamais rejouer plusieurs jours de collecte sans borne.

### Bootstrap et restauration

Inclure AUT-24 dès P1.3 : versions Python supportées, lock des dépendances, téléchargement/install en tâche observable et reprise hors ligne. Définir les prérequis de l'hôte ; s'ils manquent, afficher un diagnostic précis plutôt que promettre une installation système automatique.

Le bootstrap doit créer une base vide sans exiger une ancienne `radar.db`. Tester migrations Node-first et Python-first, intégrité, contention lecture/écriture et rollback. Les sauvegardes doivent utiliser une méthode cohérente avec SQLite/WAL ; une restauration sur instance isolée fait partie du gate, pas seulement la création d'un fichier.

## 16. Compléments de couverture de l'audit

| Audit | Lot et validation à ajouter |
|---|---|
| AUT-24 | P1.3 : packaging reproductible ; vérifier aussi le `readme = README.md` Python référencé mais absent du sous-projet actuel |
| AUT-27 | P3.4/P3.8 : complétude visible, réparation ciblée des URL, métriques distinctes offres nouvelles/mises à jour/erreurs de source |
| AUT-29 | Historique minimal dès les mutations v1 : provenance et transitions ; statistiques détaillées conservées en phase 4 |
| AUT-31/32/33 | P1.1/P1.6 avant bootstrap/config exposés ; bornes, autorisation, redaction et secrets par source |
| AUT-35/36 | P1.2 : extraire composants et contrat commun ; vérifier parité tags/enums Node/Python et retirer le test interdisant `settings.section` |
| AUT-37 | Tester le pipeline principal et les scénarios de perte de données ; `npm test` actuel ne lance pas toute la suite pytest historique |
| AUT-38 | Mettre à jour README et installation à chaque lot, conserver les audits comme instantanés datés |
| AUT-16/17 | Corriger/tester avant toute activation de Claims-to-Ping ; sinon déprécier explicitement le chemin secondaire |

Collecte : pagination bornée par connecteur, retries/backoff sur erreurs transitoires et 429, timeouts et détection d'une page HTML vide ou de blocage. Une source en échec ou une collecte partielle ne peut pas déclarer les offres absentes « expirées ». Préserver les descriptions riches lorsqu'une source de liste renvoie ensuite une version appauvrie de la même offre.

UX : l'assistant peut regrouper les neuf étapes en quelques écrans ; brouillon sauvegardable, erreurs par champ, changements non enregistrés signalés. Ajouter debounce/annulation des recherches et protection contre réponses obsolètes, actions concurrentes par offre, focus modal et tests clavier. Le texte libre est stocké mais seuls les tags structurés entraînent actuellement le score : l'expliquer, y compris tags contradictoires, seuils et réinitialisation du learning.

Notifications : activation explicite, destination vérifiée, outbox/déduplication, reprise et rétention ; un succès de collecte ne dépend jamais du transport Discord. Conserver le marquage `APPLIED` explicitement manuel et prévoir retour à `NONE`, correction de date et journal des corrections sans gonfler le compteur quotidien.

## 17. Gates de livraison et preuves

Pour chaque lot, consigner : commit ou état de travail testé, commandes et résultats, fixture ou clone utilisé, critères acceptés et limites. Les chiffres de l'audit sont des instantanés, jamais des assertions codées en dur dans les tests.

1. **Données** : retour utilisateur conservé après les deux runtimes ; aucune migration ne réinterprète un score comme décision ; sauvegarde restaurable.
2. **Installation vierge** : dossier de données neuf, secrets FT absents, setup guidé et première collecte publique possibles.
3. **Personnalisation** : deux profils géographiques différents produisent les requêtes et scores attendus ; rien n'est implicitement ramené à l'Isère.
4. **Exploitation** : double lancement, crash, timeout, annulation, redémarrage et changement de fuseau ont des résultats déterministes et visibles.
5. **UI réelle** : roue → Settings → sauvegarde → run → détail → redémarrage, au clavier et en session authentifiée ; vérifier le montage et les fichiers servis avant de conclure.

Les tests isolés précèdent tout changement de données live. Un déploiement vérifie les liens du profil et les hashes, recharge le processus dans une fenêtre adaptée, puis contrôle l'API et le navigateur. Le périmètre de cette revue est la mise à jour du plan ; aucun correctif runtime ni reset métier n'est effectué ici.

---

## 18. Journal d’implémentation (2026-09-17)

**Preuve tests :** `npm test` → **44/44 Node PASS** + suites Python schema/ft/feedback **PASS**.

| Lot | Statut | Preuves / fichiers |
|---|---|---|
| **REV-01** commentaires user | **DONE** | `store.js` + `schema_v2.py` : disentangle one-shot, skip `feedback_origin=user` ; test reopen Node + Python |
| **REV-02** `iter_ft_offers` | **DONE** | `sources/ft.py` multi-profil + dédup ; `test_ft_adapter.py` |
| **REV-02/AUT-06** SystemExit | **DONE** | `FtAuthError` dans `config.py` ; OAuth + credentials ; `dsh_pipeline` finally finalize `job_runs` |
| **REV-03** famine rescore | **DONE** | triage `ORDER BY id ASC`, exclut `SCORE_VERSION`, retourne `remaining` ; `--rescore-only` |
| **REV-04** bootstrap/worker | **DONE** | `bootstrap.js` ; scheduler refuse DB absente (`needs_bootstrap`) ; timeout pipeline 45 min |
| **P0.1 AUT-03** | **DONE** (live session) | `UNREVIEWED`/`NONE` ; seed migrate |
| **P0.2 AUT-04** readiness | **DONE** | `readiness.js` + `/status` ; badge UI ; plus de `live` binaire seul |
| **P0.3 AUT-05** secrets scoped | **DONE** | `buildChildEnv({ sources })` — CSP/ET sans materialize FT |
| **P0.4 AUT-06** fail-partial | **DONE** | voir SystemExit / finally ci-dessus |
| **P0.5 AUT-19** lock | **DONE** | `hasRunningJob` epoch JS 2h ; `reconcileStaleRuns` → `interrupted` ; lease columns |
| **P0.6 AUT-15** rescore | **DONE** | `POST /rescore` → enqueue triage-only ; couverture dans readiness |
| **P1.1 AUT-12/34** config | **DONE** | `config.js` schema ; `search_profiles` ; GET/PUT/validate `/config` ; revision 409 |
| **P1.2 AUT-01** Settings | **DONE** | `settings.section` + gear navbar ; même composant |
| **P1.3 AUT-02** bootstrap | **DONE** | `POST /bootstrap` + `ensureDb` Node-first |
| **P1.4 AUT-11** sources | **DONE** | GET `/sources` ; enabled honoré via config → pipeline ; test stub |
| **P1.5** onboarding | **PARTIAL** | empty `needs_setup` + Settings ; wizard 9 étapes non découpé |
| **P1.6 AUT-32** auth | **PARTIAL** | same-origin DSH documenté ; tests 401 non ajoutés (middleware host) |
| **P2.1–2.4** profil→connectors | **PARTIAL** | dept → FT + ET (`et_departement`) ; CSP via `csp_filtre_path` ; roles → FT profiles ; schedule durable `next_due_at` ; filtres contrats/remote collecte non exhaustifs |
| **P2.5** scoring unique | **PARTIAL** | triage seul sur hot path ; Claims-to-Ping non branché (gelé) |
| **P2.6** feedback→suggest | **OPEN** | tags entraînent score ; pas encore de suggestions confirmables |
| **P2.7** provenance | **PARTIAL** | snapshot config dans `job_runs` ; `search_profile_revision` dans `score_details` |
| **P3.1 AUT-18** async | **DONE** | `enqueue` 202 ; `POST /runs` + alias `/run` |
| **P3.2 AUT-20** scheduler | **DONE** | `next_due_at` meta + catch-up tick ; cron depuis profil |
| **P3.3–3.8** | **OPEN / light** | IDs sources, lifecycle expired, Discord, backup UI, métriques riches — non livrés |
| **Phase 4** | **OPEN** | event log, dossiers, multi-user, dedup cross-source |

### Fichiers clés ajoutés/étendus

- `src/config.js`, `src/readiness.js`, `src/bootstrap.js`
- `src/pipeline.js`, `src/scheduler.js`, `src/store.js`, `src/http.js`, `src/index.js`, `src/client/index.js`
- `runtime/python/.../dsh_pipeline.py`, `sources/ft.py`, `config.py`, `schema_v2.py`
- Tests : `test/config.test.js`, `test/readiness.test.js`, `test_ft_adapter.py`, régressions REV-01

### Hotfix 2026-09-17 — PATCH décisions 404

**Cause :** DSH `webServer` indexe les routes par `(kind, path)` **sans** méthode HTTP. Enregistrer GET puis PATCH sur le même path faisait échouer l’enregistrement (ou un préfixe `/offers/` avec slash final ne matchait jamais `/offers/123`). Le SPA renvoyait 404.

**Fix :** un handler unique par path + dispatch `req.method` ; préfixes **sans** `/` final (`/offers`, `/runs`, `/sources`). Host relancé (`dsh-web-final`, `CI=true`, node direct).

**Preuve live :** `PATCH /offers/5092/decision` → **200** ; DB `radar.db` inchangée (4128 offres) ; décision `MAYBE` + `feedback_origin=user` persistés. La base reste **plugin-owned** sous `$DSH_HOME/job-researcher/radar.db` — pas de DB parallèle.


1. Wizard onboarding multi-écrans (P1.5) + tests auth mutantes (P1.6)
2. Propagation contrats/remote + résolution communes CSP (P2.1–2.3)
3. Suggestions feedback confirmables (P2.6)
4. Lifecycle expired + backup/restore UI + métriques (P3.4/3.7/3.8)
5. Smoke FT live authentifié + rescore couverture catalogue lab

*Journal tenu à jour après chaque lot — ne pas traiter l’audit daté comme vérité live.*
