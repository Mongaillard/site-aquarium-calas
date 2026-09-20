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
| Barre 👷 en bas | Voir qui fait quoi · toucher un métier pour sélectionner le groupe |
| Pastilles ⚔️ 🛡️ 🧱 🕊️ | Attitude de combat de la sélection (voir plus bas) |
| Bouton 🚪 puis un abri | Mettre la sélection à l'abri · 🔔 met tous les villageois à couvert |
| Bouton 👷 | Panneau d'affectation : − / + pour déplacer un ouvrier d'un poste à l'autre |

Le pointage est **tolérant** : inutile de viser au pixel près. Un appui à moins
d'une case d'un ennemi, d'un arbre ou d'un filon vise la bonne cible. Et quand
vos troupes sont sélectionnées, un ennemi sous le doigt l'emporte sur un allié —
dans une mêlée, l'intention est d'attaquer, pas de changer de sélection. Un
appui franc sur l'un de vos bâtiments le sélectionne quand même : en plein raid,
il faut pouvoir continuer à produire.

### Comportement des unités : les principes d'Age of Empires

Les personnages se conduisent selon les mêmes règles que dans AoE II.

**Attitudes de combat.** Chaque unité en a une, réglable d'un doigt sur la
sélection :

| Attitude | Comportement |
| --- | --- |
| ⚔️ **Agressif** | Engage tout ennemi en vue et le poursuit jusqu'à 9 cases de son poste |
| 🛡️ **Défensif** | Engage ce qui approche, ne s'éloigne pas de plus de 4 cases, puis revient |
| 🧱 **Position tenue** | Ne bouge jamais : ne frappe que ce qui entre à portée d'arme |
| 🕊️ **Sans attaque** | N'attaque jamais de sa propre initiative |

Les soldats démarrent en *agressif*, les villageois en *sans attaque* — mais un
villageois rend les coups à un autre villageois, comme dans AoE.

**Poursuite bornée.** Une unité qui choisit sa cible elle-même ne se laisse
jamais entraîner à l'autre bout de la carte : passé la limite de son attitude,
elle abandonne et regagne son poste. Un ordre d'attaque donné par le joueur,
lui, est suivi sans limite.

**Garnison.** Le Centre-Ville (15 places) et les tours de guet (5) abritent
villageois, fantassins et archers. À l'intérieur, les unités sont hors d'atteinte
et se soignent, et **chaque occupant ajoute une flèche** à la salve du bâtiment :
un Centre-Ville vide ne tire pas, un Centre-Ville plein est une forteresse. Si le
bâtiment tombe, la garnison périt avec lui. Le bouton **🔔 cloche du village**
envoie tous les villageois s'abriter d'un coup ; un second coup les renvoie au
travail. Pour abriter une sélection précise, le bouton **🚪 Abriter** puis un
appui sur le refuge (des soldats se réfugient d'un simple appui sur l'abri).

**Déplacement en groupe.** Une armée avance au rythme de son unité la plus
lente : un bélier ne se fait plus distancer par les éclaireurs. Un ordre donné à
une seule unité lui rend sa vitesse propre.

**Chantiers.** Plusieurs bâtisseurs accélèrent la construction, avec un
rendement décroissant : quatre villageois valent 2,8 villageois, pas 4.

### Répartition d'un groupe sur une ressource

Sélectionnez dix villageois, touchez une forêt : chacun rejoint **l'arbre libre
le plus proche de lui**, pas le même. La zone s'élargit jusqu'à ce qu'il y ait
assez de cases pour tout le monde, les villageois déjà au travail sont comptés
(un renfort ne vient pas se coller sur un arbre occupé), et on ne double une
case que lorsqu'il n'y a plus de place ailleurs. Une notification confirme la
répartition.

Les fermes suivent la même règle, avec la contrainte d'AoE : **une ferme nourrit
un villageois**. Un groupe envoyé sur une ferme se distribue sur celles qui sont
libres.

### Ce sont vos ouvriers, c'est vous qui les affectez

Le jeu ne réaffecte **jamais** vos villageois à votre place. Quand un arbre, un
buisson ou un filon s'épuise, le villageois rapporte son chargement à l'entrepôt
puis attend vos ordres : le compteur 💤 de la barre 👷 s'allume et une
notification vous prévient. De même, une ferme épuisée n'est pas replantée
d'office, et changer un ouvrier de métier ne jette jamais ce qu'il porte — il
passe d'abord livrer.

Si vous préférez le confort à la maîtrise, l'option **Réaffectation
automatique** (panneau 👷) rend la main au jeu : le villageois repart seul sur
le gisement suivant. Le réglage est conservé d'une partie à l'autre. L'IA
adverse, elle, joue toujours avec l'automatisme.

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
- **Attitudes de combat, poursuite bornée, garnison et cloche du village**,
  déplacement de groupe au rythme du plus lent (voir plus bas).
- **Affectation manuelle des ouvriers** : barre de répartition permanente et
  panneau d'affectation (voir plus haut).
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
