# Contexte d'apprentissage envoyé à Jev

Job Researcher injecte dans chaque évaluation Jev un résumé borné des retours
utilisateur déjà confirmés.

Le bloc `state.learned_preferences` contient :

- `confirmed` : tags actionnables ayant atteint le seuil de confirmation ;
- `pending` : signaux visibles mais encore insuffisants, sans impact ;
- `preferred_terms` et `avoided_terms` : termes récurrents dans les retours ;
- `instructions` : règles demandant à Jev de traiter ces éléments comme un
  contexte explicatif et non comme des contraintes absolues.

Les commentaires bruts, l'historique des offres et les identifiants internes ne
sont pas transmis dans ce bloc. Le score déterministe reste fourni séparément
et Jev ne doit ni le modifier ni créer directement une nouvelle préférence.

Le résumé est limité à 20 éléments par catégorie et 80 caractères par tag ou
terme. Le hash de requête Jev inclut ce contexte : une nouvelle préférence
confirmée rend donc l'évaluation précédente obsolète au prochain passage.
