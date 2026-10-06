# Audit UI/UX Job Researcher — 2026-10-06

## Périmètre et méthode

- lecture du client `src/client/index.js` et des contrats HTTP utilisés par le front ;
- vérification live dans DSH Web à 780×493 puis 375×667 et 1280×800 ;
- parcours : ouverture du panneau, filtres, détail d'offre, feedback, réglages ;
- snapshot/accessibilité DOM : noms accessibles, rôles, focus, dimensions et débordement ;
- comparaison avec WCAG 2.2 et les patterns WAI-ARIA.

État observé : 4 203 offres, tri Jev actif, 8 retours utilisateur, 2 tags actifs.
Cet audit est en lecture seule ; aucun code métier n'a été modifié.

## Résumé exécutif

Le produit est fonctionnel et le parcours principal existe, mais l'interface est
encore pensée comme un panneau desktop compressé dans DSH. Le plus gros gain
ne vient pas d'un nouveau composant : il vient de la hiérarchisation de
l'information et de la réduction du bruit.

### Priorité immédiate

1. rendre le header réellement responsive ;
2. remplacer la table mobile par des cartes ou une vue compacte dédiée ;
3. rendre le tri et les filtres explicites ;
4. corriger le focus trap et le nommage du modal ;
5. rendre `Jev` / `D` compréhensibles sans tooltip ;
6. séparer clairement « voir les offres », « analyser une offre » et
   « modifier le profil ».

## Constats P0/P1

### P0 — Le header casse sur petit écran

**Preuve live :** à 375×667, le titre, les métriques, le badge Ready et les
boutons d'action se chevauchent ; « Lancer maintenant » sort de la zone
visible. À 780×493, le header atteint 131 px et reste visuellement instable.

**Cause probable :** `css.navbar` n'autorise pas le retour à la ligne et ses
trois enfants (marque, métriques, actions) n'ont pas de stratégie responsive.

**Quick win :** passer le header en grille responsive : titre + état sur la
première ligne, métriques condensées dans un résumé, actions dans une barre
secondaire. Sur mobile, masquer les métriques secondaires derrière « Activité ».

**Acceptation :** aucune collision à 320, 375, 768 et 1280 px ; aucune action
principale ne sort de la fenêtre ; le titre reste lisible sur deux lignes.

### P0 — Les réglages inline prennent la place du produit

Le bouton ⚙ ouvre une très grande zone inline, avec un profil Markdown long,
et repousse la liste sous la ligne de flottaison. Le texte « Ouvrir Settings →
Job Researcher » indique en plus que le panneau n'est pas le bon endroit pour
éditer ces réglages.

**Quick win :** ouvrir la page Settings dédiée, ou afficher un drawer court
avec uniquement les réglages opérationnels. Garder l'édition du profil dans
Settings et afficher ici seulement un résumé + un lien « Modifier le profil ».

### P1 — La table n'est pas adaptée au mobile ni à la lecture rapide

La liste expose huit colonnes simultanément : score, titre, entreprise, lieu,
source, intérêt, candidature, actions. Les lieux et intitulés longs forcent
une hauteur importante et la fenêtre étroite coupe les colonnes.

**Quick win :** ajouter une vue `Cartes` mobile et une vue `Liste` desktop.
Carte minimale : score, titre, entreprise, lieu/contrat, état, actions. Les
informations source et détails passent dans la fiche.

### P1 — Le score principal est cryptique

`J74 D6` est compact mais pas explicite. Le `D6` n'est expliqué que par un
tooltip ; l'utilisateur ne voit pas la couverture, la confiance, la date ou le
fait que Jev est encore en shadow.

**Quick win :** afficher `Jev 74/100` et `Déterministe 6/7` avec une légende
permanente. Ajouter `couverture`, `évalué le` et une indication « Jev aide au
classement, le score métier reste la décision ».

### P1 — Le tri est invisible et les filtres ne racontent pas leur logique

Le client envoie toujours `sort=jev_desc`. Il n'existe pas de contrôle pour
choisir :

- pertinence Jev ;
- score déterministe ;
- plus récentes ;
- nouvelles / non examinées.

Le filtre `Score min` reste ambigu car il filtre le score déterministe alors
que la liste est triée par Jev.

**Quick win :** ajouter un select « Trier par » et afficher le tri actif. Donner
à `Score min` un libellé explicite : `Score déterministe min.` ou créer un
filtre Jev séparé.

### P1 — « Plus de filtres » masque des filtres structurants

Source, candidature et score min sont cachés derrière un bouton. Les filtres
actifs sont affichés, mais les chips ne permettent pas de retirer un filtre
individuellement : seul « Effacer les filtres » fonctionne.

**Quick win :** rendre chaque chip supprimable avec un bouton `×`, afficher le
nombre sur « Filtres (3) », conserver le panneau ouvert lorsqu'un filtre est
actif et ajouter `Réinitialiser` près des contrôles.

### P1 — Recherche sans état de chargement ni résultat contextualisé

La recherche est débouncée à 300 ms, mais aucun état « recherche en cours » ou
compteur mis à jour n'est annoncé. L'état vide dit seulement « Aucune offre
pour ces filtres ».

**Quick win :** afficher un état de chargement local, annoncer le nombre de
résultats avec `aria-live`, et proposer directement `Effacer les filtres` +
`Modifier la recherche` lorsqu'il n'y a aucun résultat.

## Accessibilité

### P1 — Focus du modal non enfermé

Le code place le focus sur Fermer, intercepte `Escape` et restaure le focus à
la fermeture. Mais le dialogue n'a pas de focus trap : les éléments DSH situés
hors du modal restent focusables au clavier. Le test DOM live a trouvé des
éléments focusables à l'extérieur alors que le modal était ouvert.

**Correction :** utiliser `dialog` natif si compatible avec DSH, ou implémenter
le cycle Tab/Shift+Tab dans le modal et rendre le reste inert pendant son
ouverture.

### P1 — Le titre du modal n'est pas relié sémantiquement

Le modal possède `aria-label="Détail offre"`, mais le `h2` du titre n'a pas
d'`id` et n'est pas référencé par `aria-labelledby`. La technologie
d'assistance ne reçoit donc pas le titre réel de l'offre comme nom du dialogue.

**Correction :** générer un id stable par offre et utiliser
`aria-labelledby="offer-detail-title-{id}"`, plus un `aria-describedby` pour
les métadonnées utiles.

### P1 — Menus custom incomplets au clavier

Les dropdowns utilisent `role=menu` et `menuitemradio`, mais le code gère
principalement le clic et `Escape`, sans navigation Arrow Up/Down ni gestion
du focus actif comme le pattern WAI-ARIA le prévoit.

**Correction :** soit utiliser un `<select>` natif pour les petits choix, soit
implémenter le pattern menu complet. Pour les filtres à suggestions, utiliser
le pattern combobox WAI-ARIA plutôt qu'un menu bricolé.

### P1 — Indicateur de focus visuel insuffisant

Les contrôles ont une taille correcte (environ 32 px), mais l'inspection des
styles computed montre souvent `outline: none` et aucun `box-shadow` de focus.
Le focus clavier peut donc être invisible dans le thème sombre.

**Correction :** ajouter un `:focus-visible` global contrasté, au moins 2 px,
sans supprimer le focus natif sans remplacement.

### P2 — Actions iconiques compréhensibles seulement après apprentissage

Les labels ARIA des boutons ✓/✗/? sont bons, mais le visuel reste dépendant du
symbole. Sur mobile, les actions devraient être des boutons libellés ou être
regroupées dans une action « Décider ».

## Fiche offre et feedback

### Ce qui fonctionne

- ouverture par titre et par ligne ;
- navigation précédente/suivante ;
- restauration du focus à la fermeture ;
- séparation claire entre intérêt, candidature et feedback ;
- feedback libre et tags conservés séparément des raisons système ;
- lien externe et action « marquer envoyée » visibles.

### Quick wins

- afficher le titre, l'entreprise et le score dans une barre sticky du modal ;
- laisser la description bénéficier d'un nettoyage typographique (paragraphes,
  listes, espaces) ;
- afficher les dates de publication/actualisation dans le résumé, pas seulement
  dans l'accordéon source ;
- afficher les raisons Jev directement sous le score au lieu de demander une
  deuxième ouverture d'accordéon ;
- afficher un avertissement si un brouillon de feedback non enregistré est
  abandonné en fermant ou en changeant d'offre ;
- distinguer visuellement `Mon intérêt`, `Candidature` et `Mon retour` avec un
  ordre d'action guidé : voir → décider → préparer → candidater.

## Cohérence métier et confiance

- `Jev` est présenté comme score principal alors que le déterministe reste la
  décision métier. Cette dualité doit être visible, pas seulement documentée.
- « Apprentissage : 8 retours · 2 tags actifs » est un indicateur, pas une
  explication. Il devrait ouvrir un résumé des préférences et un bouton
  d'oubli/réinitialisation.
- Les doublons apparents d'offres (même titre/commune/employeur ou même
  contenu provenant de plusieurs sources) augmentent le bruit. Ajouter un
  regroupement « offres similaires » ou un badge `doublon probable`.
- La liste ne montre pas l'âge de l'offre, alors que le cycle de vie distingue
  `active`, `stale`, `missing` et `retired`. Exposer `publiée il y a…` et un
  filtre « récentes » rendrait le nettoyage compréhensible.
- « Lancer maintenant » manque de contexte : sources concernées, dernier run,
  coût/temps estimé et impact. Ajouter une confirmation légère ou un bouton
  « Synchroniser les offres » avec un état de progression.

## Backlog de quick wins

### Lot 1 — 1 session, très fort ROI

- header responsive ;
- cartes mobile ;
- légende permanente des scores `Jev`/`D` ;
- tri visible ;
- chips de filtres supprimables ;
- état vide contextualisé ;
- focus-visible et focus trap modal ;
- `aria-labelledby` réel sur le modal.

### Lot 2 — confort de recherche

- filtres réorganisés par priorité : intérêt, candidature, source, score,
  ancienneté, télétravail, contrat ;
- filtres persistés dans l'URL ou dans la session ;
- recherche avec suggestions de titres/compétences ;
- regroupement des doublons ;
- dates et cycle de vie visibles dans la carte ;
- résumé « pourquoi cette offre » avec déterministe, apprentissage et Jev.

### Lot 3 — confiance et apprentissage

- panneau « ce que le système a appris » ;
- réinitialisation d'un tag ou d'un terme ;
- différence score de base / ajustement / Jev ;
- couverture et incertitude Jev ;
- feedback après candidature ;
- comparaison A/B déterministe vs Jev sur un corpus stable.

## Critères de validation avant implémentation

- tests à 320, 375, 768, 1024 et 1280 px ;
- parcours clavier complet : panneau → filtres → ligne → modal → feedback →
  fermeture ;
- test lecteur d'écran des scores et états ;
- zéro débordement horizontal involontaire ;
- filtre actif toujours visible et supprimable individuellement ;
- un résultat vide explique pourquoi et permet de revenir en arrière ;
- aucun clic sur une décision ne déclenche l'ouverture involontaire du détail ;
- état métier inchangé par les seules améliorations de présentation.

## Références

- [WCAG 2.2 — recommandation W3C](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA — pattern combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [WCAG — focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)
- [WCAG — ordre du focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)
- [Mesure de l'UX des moteurs de recherche d'emploi](https://measuringu.com/ux-jobsearch/)
