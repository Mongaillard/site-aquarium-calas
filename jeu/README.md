# 🏰 Âge des Empires Mobile

Un jeu de stratégie en temps réel inspiré d'Age of Empires, **jouable au doigt**
dans n'importe quel navigateur moderne. Pas de moteur de jeu, pas de bibliothèque,
pas une seule image à télécharger : ~3 500 lignes de JavaScript, du Canvas 2D,
et tous les graphismes dessinés au code.

## Lancer le jeu

Le jeu utilise des modules ES : il lui faut un serveur HTTP (l'ouvrir en
`file://` ne marchera pas).

```bash
cd jeu
npm start                      # ouvre http://localhost:8080
# ou, sans npm :
python3 -m http.server 8080    # puis ouvrir http://localhost:8080/index.html
```

Sur un téléphone : ouvrez l'URL, puis « Ajouter à l'écran d'accueil ». Le
*service worker* met tout en cache, le jeu fonctionne ensuite **hors ligne**.

## Comment on joue

| Geste | Effet |
| --- | --- |
| Glisser un doigt | Déplacer la vue |
| Pincer à deux doigts | Zoomer / dézoomer |
| Toucher une unité | La sélectionner |
| Double tap sur une unité | Sélectionner toutes celles du même type à l'écran |
| Appui long puis glisser | Sélection rectangulaire |
| Toucher le sol / un arbre / un ennemi (avec une sélection) | Ordre contextuel : se déplacer, récolter, construire, attaquer |
| Bouton 🏗️ puis toucher la carte | Poser un bâtiment |

Souris : clic gauche pour sélectionner ou tracer un rectangle, clic droit pour
donner un ordre, molette pour zoomer, `WASD`/flèches pour la vue, `Échap` pour
annuler, `.` pour trouver un villageois inactif, `H` pour revenir au Centre-Ville.

## Le jeu

- **3 ressources** : 🍖 nourriture (buissons, fermes), 🪵 bois (forêts), 🪙 or (filons).
- **3 âges** : Âge Sombre → Âge Féodal → Âge des Châteaux, chacun débloquant
  bâtiments, unités et technologies.
- **7 unités** : villageois, milicien, lancier, archer, éclaireur, cavalier, bélier.
  Chaque unité a des bonus contre une catégorie (le lancier mange la cavalerie,
  le cavalier fond sur les archers, le bélier démolit les bâtiments).
- **12 bâtiments** : Centre-Ville, maisons, moulin, camps de dépôt, fermes,
  caserne, archerie, écurie, atelier de siège, forge, tour de guet.
- **4 technologies** : brouette, armes forgées, flèches barbelées, armure d'écailles.
- **Brouillard de guerre**, minimap, points de ralliement, files de production,
  réparation, annulation de chantier avec remboursement.
- **Victoire** : détruire tous les bâtiments adverses et leurs villageois.

### L'IA adverse

Trois difficultés, qui ne trichent pas sur les ressources (seule la vitesse de
récolte et l'agressivité changent). L'IA suit un ordre de construction, répartit
ses villageois selon des quotas par ressource, met de côté le coût du prochain
âge, remplace ses fermes épuisées, défend sa base quand elle est attaquée et
lance des vagues d'assaut de plus en plus grosses. Première offensive typique :
7 à 11 minutes.

## Architecture

```
jeu/
├── index.html            page unique
├── css/jeu.css           interface (DOM), pensée « pouce d'abord »
├── js/
│   ├── config.js         toutes les données de jeu et l'équilibrage
│   ├── utils.js          maths, RNG déterministe, tas binaire, grille spatiale
│   ├── map.js            génération procédurale, terrain, ressources, blocage
│   ├── pathfinding.js    A* 8 directions, lissage, budget de nœuds
│   ├── entities.js       unités (machine à états), bâtiments, projectiles
│   ├── game.js           le monde : ordres, économie, combat, brouillard, victoire
│   ├── ai.js             l'adversaire
│   ├── render.js         Canvas 2D : terrain, entités, brouillard, minimap
│   ├── input.js          gestes tactiles et souris
│   ├── ui.js             HUD, sélection contextuelle, menus
│   ├── audio.js          sons générés à la volée (Web Audio)
│   └── main.js           écrans et boucle de jeu
├── test/                 tests (voir plus bas)
├── manifest.webmanifest  installation sur l'écran d'accueil
└── sw.js                 cache hors ligne
```

Choix structurant : **la simulation ne dépend pas du navigateur**. `config`,
`utils`, `map`, `pathfinding`, `entities`, `game` et `ai` tournent tels quels
sous Node, ce qui permet de tester des parties entières sans rendu.

La boucle est à **pas fixe** (20 ticks/s) avec rattrapage plafonné ; le rendu
tourne au rythme de l'écran (60 images/s mesurées sur mobile). Les recherches de
chemin sont mises en file avec un budget par tick pour éviter les à-coups.

## Tests

```bash
cd jeu
npm test              # simulation headless : deux IA jouent 16 minutes
npm run test:navigateur   # Chromium (Playwright) : chargement, gestes, rendu, FPS
```

Le test headless vérifie que l'économie tourne, que les âges sont atteints, que
des combats ont lieu et que l'état reste cohérent. Le test navigateur vérifie
qu'il n'y a aucune erreur console, que le rendu tient 30+ images/s, et que les
gestes (sélection, ordre, pose de bâtiment, zoom) répondent.

## Réglages

Presque tout l'équilibrage est dans `js/config.js` : coûts, temps, points de vie,
armures, bonus de dégâts, taux de récolte, coûts des âges, paramètres de
difficulté et tailles de carte. Changer une valeur suffit, rien n'est codé en dur
ailleurs.
