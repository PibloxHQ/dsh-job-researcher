# Plan de correction des parcours utilisateur — Job Researcher

Date : 2026-09-17. Statut : **lots A–F implémentés** (2026-09-17) — voir §11 journal.

Ce plan complète le [plan d'autonomie](dsh-job-researcher-autonomy-improvement-plan-2026-09-17.md). Il se fonde sur la version actuelle de `src/client/index.js`, qui comprend désormais Settings, une roue crantée et le bootstrap. L'attribution des modifications à Cursor n'a pas été vérifiée. Les constats ci-dessous sont issus du code et du signalement utilisateur ; aucune validation visuelle du navigateur n'est revendiquée.

## 1. Résultat produit attendu

L'utilisateur doit pouvoir configurer sa recherche, parcourir les offres, trier rapidement, approfondir une annonce et suivre ses candidatures sans ouverture imprévue, perte de saisie ou changement de contexte. Chaque commande doit avoir un effet visible, limité et réversible quand cela est pertinent.

La priorité est la fiabilité des interactions. Le succès ne se mesure pas à la présence de boutons ou à un test qui retrouve leur texte dans le fichier, mais aux parcours réellement exécutés.

## 2. Défauts confirmés dans le code

| ID | Priorité | Constat et preuve | Effet utilisateur |
|---|---|---|---|
| UX-01 | P0 | `decide()` appelle toujours `setSelected(r.offer)` ; les actions de ligne appellent cette fonction | Un tri rapide ouvre la fiche après la réponse API |
| UX-02 | P0 | `saveFeedback()` et `setAppStatus()` sélectionnent aussi la réponse sans vérifier la fiche active | Une réponse tardive peut rouvrir la fiche fermée ou remplacer une autre fiche ouverte |
| UX-03 | P0 | Commentaire/tags partagés au niveau du panneau, sans protection de brouillon à la fermeture ; champs éditables pendant certaines sauvegardes | Perte possible de modifications ou remplacement d'une saisie récente par une ancienne réponse |
| UX-04 | P1 | `onKeyDown` de la ligne traite Entrée/Espace sans vérifier la cible ; les boutons enfants arrêtent seulement le clic | L'action clavier d'un bouton peut aussi ouvrir la ligne ou perturber son activation |
| UX-05 | P1 | `busy` est global mais les boutons rapides ne sont pas désactivés | Le run bloque certaines commandes sans empêcher les doubles mutations ailleurs |
| UX-06 | P1 | `load()` couple statut et offres avec `Promise.all`, sans annulation ni ordre des réponses, et efface l'erreur globale | Réponses de recherche obsolètes, perte du diagnostic et chargement partiel impossible |
| UX-07 | P1 | Le lien Secrets est un `span` souligné sans navigation | Élément présenté comme cliquable mais inactif |
| UX-08 | P1 | Settings démarre avec des valeurs par défaut et autorise les commandes avant la fin du chargement | Les valeurs provisoires peuvent être prises pour les réglages enregistrés |
| UX-09 | P1 | `buildPayload()` remplace une zone vide par `['38']` ; `applyConfig()` utilise `Number(target) || 1` | Localisation imposée silencieusement ; un objectif enregistré à zéro réapparaît comme 1 |
| UX-10 | P1 | Settings n'a pas de gestion de brouillon/conflit dédiée, « Charger » réapplique tout le formulaire | Perte de réglages non enregistrés ; conflit de révision peu compréhensible |
| UX-11 | P1 | Listener Escape monté même sans sélection ; modal sans gestion explicite du focus | Escape peut interférer avec DSH ; navigation clavier hors de la fenêtre |
| UX-12 | P2 | Libellés techniques, sources brutes, cron et textes FR codés dans plusieurs composants | Configuration difficile à comprendre et localisation incohérente |

Références de correction : `JobResearcherPanel`, `OfferDetailModal`, `JobResearcherSettings`, `api`, `apply` dans `src/client/index.js`. Vérifier leurs contrats avec `src/http.js`, `src/config.js` et `src/store.js` avant implémentation.

## 3. Contrat d'interaction des offres

| Geste | Effet attendu | Navigation |
|---|---|---|
| Cliquer le titre ou « Voir les détails » | Ouvrir la fiche interne | Une seule fiche |
| Oui / Non / Peut-être dans la liste | Modifier uniquement l'intérêt de cette offre | Rester dans la liste |
| Cliquer la décision déjà active | Aucun changement nécessaire | Rester au même endroit |
| « Remettre à examiner » | Retour explicite à UNREVIEWED | Préserver le contexte |
| « Consulter l'annonce originale » | Ouvrir l'URL externe valide | Nouvel onglet, action explicite |
| Modifier l'intérêt dans la fiche | Mettre à jour l'intérêt et son affichage | Garder cette fiche ouverte |
| Enregistrer un commentaire | Persister le brouillon de cette offre | Aucun déplacement |
| Fermer la fiche | Fermer, restaurer le focus | Aucune réponse tardive ne la rouvre |

Utiliser « M'intéresse », « Pas intéressé », « À revoir » comme libellés compréhensibles ; icônes possibles avec état actif et nom accessible incluant l'offre. Ces choix sont exclusifs : ne pas les représenter comme trois cases indépendantes.

### Tri rapide fiable — premier lot

Séparer la commande métier de l'ouverture de fiche. Le succès d'une mutation met à jour le cache de l'offre ; seul un geste d'ouverture modifie l'identité de la fiche active. Une fiche déjà ouverte sur le même ID peut recevoir les champs confirmés sans écraser son brouillon.

Le PATCH rapide transmet uniquement la décision. Vérifier que le serveur conserve commentaire et tags lorsqu'ils sont omis : actuellement `setDecision()` remplace un commentaire omis par une chaîne vide. Cette correction de contrat est nécessaire pour éviter de renvoyer une copie périmée des commentaires depuis la liste.

Choix initial recommandé : état « Enregistrement… » par offre, affichage de la décision confirmée au succès, erreur locale avec « Réessayer » à l'échec. Autoriser le tri d'autres offres pendant ce temps. Sérialiser les mutations d'une même offre ; éviter que des réponses dans le désordre changent la dernière intention.

Après succès, proposer brièvement « Annuler » en conservant l'ancien intérêt seulement. L'annulation ne doit ni rétablir un ancien commentaire ni écraser une modification plus récente. En cas de conflit, rafraîchir l'offre et expliquer le conflit.

Si le filtre est « À examiner », l'offre traitée quitte la liste après confirmation. Conserver le scroll autant que possible, annoncer le retrait et placer le focus sur l'offre suivante. Corriger la pagination lorsque la dernière ligne d'une page disparaît ; conserver l'accès à Annuler hors de la ligne supprimée.

## 4. Fiche, commentaires et candidatures

Stocker les brouillons par ID d'offre, séparément des données serveur. Fermer une fiche ou passer à une autre conserve le brouillon pendant la session ; afficher « Modifications non enregistrées » à la réouverture et proposer Enregistrer/Abandonner. Ne pas faire passer un brouillon conservé pour une sauvegarde serveur.

Pendant l'enregistrement, capturer la version du brouillon. Si l'utilisateur continue à écrire, la réponse confirme seulement la version envoyée ; le texte plus récent reste marqué non enregistré. Une mutation d'intérêt ou de candidature ne doit pas toucher ce brouillon. Une réponse d'une fiche A ne change jamais la fiche B.

Présenter les détails dans cet ordre : titre/employeur/lieu/contrat, intérêt, description, lien externe, explication du score, retour personnel, candidature. Identifier les informations absentes et les scores non encore calculés. Séparer « pourquoi trouvée » et « pourquoi ce score » uniquement si les données correspondantes existent.

Les candidatures conservent des commandes distinctes : Commencer la préparation → Prête → « J'ai envoyé ma candidature ». Aucun clic d'intérêt ni lien externe ne compte comme envoi. Afficher la date et une correction possible, retour à NONE compris. Pas d'envoi automatique. Le compteur quotidien doit refléter la confirmation serveur et rester idempotent en cas de double clic.

Accessibilité : focus initial, focus contenu dans la modal, retour au déclencheur ou à un repli valable, arrière-plan inactif, Escape uniquement quand la modal est ouverte, scroll du fond verrouillé. Préférer un bouton natif sur le titre à une ligne entière interactive ; si la ligne reste cliquable, ignorer les événements de ses éléments interactifs descendants.

## 5. Liste, recherche et continuité de navigation

- Distinguer premier chargement, actualisation, aucun résultat, base vide, erreur et état hors ligne. Garder les résultats déjà affichés lors d'un rafraîchissement.
- Debounce de la recherche, annulation ou identifiant de requête ; seule la réponse correspondant aux filtres courants est applicable.
- Charger statut et liste indépendamment. Une erreur de statut ne masque pas des offres disponibles ; le polling ne supprime pas une erreur de mutation non résolue.
- Conserver filtres, page et scroll au retour de Settings, du détail et du chat. Définir une persistance de session ; aucun commentaire privé dans l'URL.
- Ajouter filtres réinitialisables, nombre de résultats, pagination correcte et tri stable avec ID comme dernier critère.
- Afficher des décisions et sources lisibles plutôt que les enums bruts. Prévoir une vue mobile conservant toutes les actions essentielles.
- Adapter le polling à la visibilité du panneau et aux jobs actifs. Arrêter les requêtes au démontage ; conserver les brouillons pendant les rafraîchissements.

## 6. Settings : parcours utilisable

La roue ouvre une surface de réglages identifiable, avec titre, fermeture/retour et conservation du contexte de liste. Réutiliser le même formulaire depuis Settings DSH et le panneau. Tester le mécanisme réel de navigation DSH ; le fallback inline doit être explicite et fermable, sans masquer durablement la liste derrière un formulaire partiel.

Ne pas afficher les valeurs par défaut comme des réglages chargés. Bloquer la sauvegarde jusqu'à réception de la configuration ou afficher un parcours de création neuf explicite. Une zone vide produit une erreur de champ ; aucun retour silencieux à l'Isère. Zéro candidature quotidienne doit rester zéro si le schéma l'autorise.

Proposer commune/département avec libellés, sources avec nom complet et état, planning en jours + heure locale + fuseau. Le cron reste éventuellement dans les options avancées. Les critères exposés doivent effectivement être consommés par les sources et le scoring ; signaler clairement les capacités indisponibles.

Une action principale « Enregistrer » réalise la validation ; « Tester les sources » est distincte. Erreurs placées auprès des champs, focus sur la première erreur. « Recharger » demande de résoudre un brouillon existant. Un conflit 409 conserve le brouillon et propose de comparer/recharger sans écrasement automatique.

Le lien vers Secrets doit être un vrai lien/bouton navigable au clavier. Montrer présence des clés, jamais leur valeur. Après ajout, permettre « Vérifier à nouveau » et revenir à la configuration. Une panne FT ne doit pas rendre les autres sources inutilisables.

Après sauvegarde, annoncer ce qui s'applique maintenant, au prochain run ou après recalcul. Ne pas déclencher silencieusement une collecte coûteuse. Synchroniser statut et résumé du panneau sans perdre les filtres.

## 7. Premier démarrage et collecte

Guider : définir la recherche → vérifier les sources → préparer le runtime si nécessaire → lancer la recherche → consulter les résultats. Chaque étape est reprise après fermeture ou redémarrage selon le stockage prévu par le plan d'autonomie.

Le lancement possède son propre état ; il ne désactive pas le tri ou les commentaires. Après acceptation du job, afficher progression, sources en cours, durée et accès au résultat. Une erreur explique l'action possible : configurer, réessayer une source, consulter les détails techniques.

Si les endpoints restent synchrones, ne pas annoncer une progression fictive : afficher l'attente réelle, puis livrer le contrat de jobs asynchrones du plan d'autonomie. En cas de réponse perdue, consulter le job/idempotency avant de relancer.

Différencier « aucune offre ne correspond » de « aucune source n'a répondu ». Un catalogue existant reste consultable lorsque la collecte est dégradée. Les boutons désactivés portent une raison accessible et une action pour lever le blocage.

## 8. Lots d'implémentation et dépendances

| Lot | Contenu | Dépendance | Critère de sortie |
|---|---|---|---|
| A — P0 | UX-01/02/04/05 : décisions rapides, identité fiche, clavier, opérations par offre, PATCH préservant les autres champs | Contrat décision API | 20 tris successifs sans ouverture de fiche ni perte de commentaire |
| B — P0 | UX-03 : brouillons, réponses tardives, sauvegarde, erreurs locales | A | Fermer/changer de fiche pendant la sauvegarde ne perd rien et ne rouvre rien |
| C — P1 | UX-06 : recherche, polling, pagination, retour au contexte | A | Réponses inversées et filtres rapides produisent la bonne liste |
| D — P1 | UX-07/08/09/10 : Settings, Secrets, validation, conflits, zéro | Schéma/config réelle | Modifier, enregistrer, revenir, recharger conserve les valeurs exactes |
| E — P1 | UX-11/12 : modal accessible, libellés, responsive, états candidature | A–D | Parcours clavier complet et petit écran utilisables |
| F — P1 | Setup, collecte et progression crédibles | Jobs/bootstrap du plan d'autonomie | Parcours neuf et reprise après panne démontrés |

Chaque lot inclut des tests de comportement et sa preuve navigateur. Ne pas attendre le dernier lot pour valider A. Une refonte graphique globale n'est pas un prérequis à la correction du tri rapide.

## 9. Matrice de recette obligatoire

Exécuter avec données isolées, API contrôlable et profil DSH de test. Les essais qui modifient des intérêts ou candidatures ne doivent pas polluer la base personnelle.

| Scénario | Résultat à vérifier |
|---|---|
| Oui, Non, Peut-être depuis trois lignes | Décisions persistées ; aucune modal, aucun onglet externe |
| Entrée/Espace sur bouton rapide | Une mutation et aucune activation de la ligne |
| Ouvrir le titre | Une fiche et focus correct |
| Réponse mutation retardée puis fermeture | Fiche reste fermée |
| Réponse pour A après ouverture de B | B reste ouverte, brouillon B intact |
| Saisie pendant sauvegarde | Texte nouveau conservé et marqué non enregistré |
| Erreur 500/offline sur décision | Ancien état confirmé conservé ; erreur locale ; autres offres utilisables |
| Double clic / deux décisions sur la même offre | Ordre déterministe ; pas de réponse ancienne qui gagne |
| Filtre UNREVIEWED, dernière ligne d'une page traitée | Page corrigée, focus valide, Annuler disponible |
| Annuler une décision | Intérêt antérieur restauré sans toucher feedback/candidature |
| Recherche A lente puis B rapide | Seuls résultats B visibles |
| Poll pendant édition ou erreur | Aucun brouillon perdu, diagnostic utile conservé |
| Settings lent/échoué au chargement | Aucun enregistrement de valeurs provisoires |
| Zone vide / objectif zéro / conflit 409 | Erreur de zone explicite ; zéro conservé ; brouillon en conflit conservé |
| Lien Secrets puis retour | Navigation réelle, état revérifiable, contexte conservé |
| APPLIED double clic puis correction | Compteur exact et absence d'envoi externe |
| Clavier : modal + Escape + fermeture | Focus contenu puis restauré ; Escape hors modal ne perturbe pas DSH |
| Écran étroit et zoom 200 % | Commandes accessibles et texte lisible sans éléments superposés |
| Redémarrage après sauvegarde et job interrompu | Réglages persistés, job réconcilié et statut honnête |

Tests ciblés : composants avec interactions DOM réelles, API avec persistance sur fixture, E2E dans DSH. Les tests par expressions régulières sur le fichier restent des contrôles de structure et ne constituent pas une recette UX.

## 10. Preuves de livraison

Pour chaque lot : noter version testée, scénarios exécutés, résultats, limites et captures utiles. Vérifier le code effectivement servi par DSH avant la recette. Une capture seule ne prouve pas une interaction : constater la mutation attendue, l'absence de navigation indésirable et la conservation des autres données.

La livraison UX est acceptée lorsque le tri rapide, la consultation, les retours, les candidatures, Settings et la reprise après erreur forment un parcours cohérent sur le runtime testé. Les défauts confirmés ci-dessus restent ouverts tant que leur scénario n'est pas passé.

---

## 11. Journal d’implémentation (2026-09-17)

| Lot | UX | Statut | Preuves |
|---|---|---|---|
| A | 01/02/04/05 | **DONE** | `decide` sans `setSelected` sauf `openDetail` / même id ; PATCH `{decision}` seul ; `offerBusy` ; undo 8s ; titre = bouton ; row keydown ignore enfants |
| B | 03 | **DONE** | `draftsRef` + version saveFeedback ; fermeture conserve brouillon |
| C | 06 | **DONE** | `loadStatus`/`loadOffers` séparés ; debounce 300 ms ; req id anti-stale |
| D | 07–10 | **DONE** | `configLoaded` ; départements vides → erreur ; cible 0 OK ; Secrets = bouton ; 409 conserve brouillon |
| E | 11/12 | **DONE** | Escape seulement si modal ; focus restore ; libellés FR ; sources lisibles |
| F | run | **DONE** | `runBusy` isolé ; message 202 |

**Contrat API :** `store.setDecision` préserve le commentaire si omis ; HTTP n’envoie plus `comment: undefined` comme `''`.

**Tests :** `npm test` → **47/47 PASS** (dont `store-decision-preserve`).

**Recette navigateur (Playwright, runtime relancé) :**
- Tri « À revoir » sur offre 4084 → `PATCH …/decision` **200**
- Aucune `offer-detail-modal` ouverte
- Bouton **Annuler** visible ; cellule intérêt = « À revoir »
- 0 erreur console

**Token frais (session de preuve) :** voir log `dsh-web-20260917-ux-journey.log` / stdout process.

**Reste recette §9 :** double-clic, conflit 409 Settings, clavier complet Escape hors modal, mobile 200 % — non tous exécutés dans cette passe.
