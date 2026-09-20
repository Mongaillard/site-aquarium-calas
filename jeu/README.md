# 🏰 Âge des Empires Mobile

Un jeu de stratégie en temps réel inspiré d'Age of Empires, **jouable au doigt**
dans n'importe quel navigateur moderne. Pas de moteur de jeu, pas de bibliothèque,
presque aucune image : ~7 000 lignes de JavaScript, du Canvas 2D, des
pictogrammes vectoriels et trois illustrations de 30 Ko en tout.

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

## Formats de partie, vitesse et sauvegarde

Trois réglages se choisissent sur l'écran d'accueil, avant de lancer la partie.

| Format | Durée | Ce qui change |
| --- | --- | --- |
| ⚡ **Express** | **10 min chrono** | Départ à l'**Âge Féodal** avec 7 villageois, des ressources garnies et de la place pour produire tout de suite, petite carte, population plafonnée à 40, IA agressive dès la première minute. **Raser le Centre-Ville adverse met fin à la partie sur-le-champ** (il y est deux fois moins résistant) ; sinon, au temps écoulé, **le meilleur score l'emporte** |
| 🏰 **Classique** | 20 à 30 min | La partie complète : trois âges, population 60, victoire par conquête (tous les bâtiments **et** villageois adverses) |

Le score d'une partie Express : *ressources récoltées + 10 par unité vivante +
25 par bâtiment debout*. Il s'affiche sur l'écran de fin, et le compte à rebours
remplace le chronomètre en haut de l'écran (il rougit dans la dernière minute).

Mesuré sur huit parties IA contre IA : **toutes se terminent dans les dix
minutes**, durée moyenne 9 min 21 s, dont deux par destruction du Centre-Ville
(7 min 23 s et 7 min 29 s). Un joueur qui masse ses troupes finit plus vite
encore.

La **vitesse de jeu** — Tranquille ×0,75, Normal, Rapide ×1,5, Blitz ×2 —
multiplie le nombre de pas de simulation par seconde réelle. Elle se change
aussi en cours de partie depuis le menu pause, et le réglage est conservé d'une
partie à l'autre. Le pas de temps, lui, ne bouge pas : la simulation reste
déterministe quelle que soit la vitesse.

**La partie se sauvegarde toute seule**, toutes les 30 secondes et dès que
l'onglet passe en arrière-plan (un appel qui arrive, un écran qui s'éteint). Au
retour, l'écran d'accueil propose **Reprendre la partie** avec son format, son
âge et son chrono. Une partie finie ou abandonnée efface sa sauvegarde.

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
| Toucher un chantier (villageois sélectionné) | L'y affecter — même geste que pour le bois ou la nourriture |
| Bouton 👷 | Panneau d'affectation : − / + pour déplacer un ouvrier d'un poste à l'autre, **chantiers compris** |

Le pointage est **tolérant** : inutile de viser au pixel près. Un appui à moins
d'une case d'un ennemi, d'un arbre ou d'un filon vise la bonne cible. Et quand
vos troupes sont sélectionnées, un ennemi sous le doigt l'emporte sur un allié —
dans une mêlée, l'intention est d'attaquer, pas de changer de sélection. Un
appui franc sur l'un de vos bâtiments le sélectionne quand même : en plein raid,
il faut pouvoir continuer à produire. Deux exceptions, où l'intention ne fait
aucun doute : un **chantier** ou une **ferme** touchés avec des villageois en
main les envoient travailler (double tap pour sélectionner le bâtiment).

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

### Chantiers : file d'attente et renforts

Posez plusieurs bâtiments d'affilée : les ouvriers **terminent le chantier en
cours puis enchaînent** sur le suivant, dans l'ordre où vous les avez posés. Le
panneau de sélection d'un villageois indique combien de chantiers l'attendent.
Un appui direct sur un chantier, lui, remplace la file — vous avez changé
d'avis.

Tous les villageois sélectionnés au moment de la pose vont bâtir, et **plus ils
sont nombreux, plus c'est rapide**, avec le rendement décroissant d'AoE : un
ouvrier met 18 s pour une maison, trois en mettent 8. Le nombre d'ouvriers
affectés — ceux qui marchent encore vers le chantier compris — s'affiche sur le
chantier et dans le panneau de sélection.

**Affecter quelqu'un à un chantier**, c'est le geste de la récolte : on touche
le villageois, puis le chantier. Trois chemins mènent au même résultat :

- **au doigt** : sélection (un villageois ou dix), puis appui sur le chantier ;
- **par la barre 👷** : la ligne *🏗️ Chantiers* a ses **− / +** comme le bois ou
  la nourriture. Le **+** prend un inactif en priorité, sinon quelqu'un du métier
  le plus fourni, et l'envoie sur le chantier **qui manque le plus de bras** ;
- **par le chantier** : sélectionnez-le, puis **👷 +1 ouvrier**.

Un double tap sur un chantier le sélectionne sans y envoyer personne (pour
suivre l'avancement ou annuler). Et le **−** de la ligne *Chantiers* retire un
bâtisseur, qui redevient disponible.

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
- **Victoire** : détruire tous les bâtiments adverses et leurs villageois — ou,
  en mode Express, leur dernier Centre-Ville.
- **Sauvegarde automatique** et reprise, **vitesse de jeu** réglable, **formats
  de partie** (voir plus haut).

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
npm test              # simulation headless : deux IA jouent 16 minutes, sauvegarde comprise
npm run test:navigateur   # Chromium (Playwright) : chargement, gestes, rendu, FPS
```

Le test headless vérifie que l'économie tourne, que les âges sont atteints, que
des combats ont lieu et que l'état reste cohérent. Le test navigateur vérifie
qu'il n'y a aucune erreur console, que le rendu tient 30+ images/s, et que les
gestes (sélection, ordre, pose de bâtiment, zoom) répondent.

## Les images et les icônes

Le jeu n'a longtemps affiché **aucune image** : tout était dessiné au code, et
les pictogrammes étaient des **emoji**. C'était le point faible visible — un
emoji se dessine différemment sur chaque téléphone, si bien qu'un Centre-Ville
n'avait pas la même tête sur un Samsung et sur un iPhone.

**Les 52 pictogrammes sont désormais des tracés vectoriels** (`js/icones.js`,
73 Ko) issus de [game-icons.net](https://game-icons.net), sous licence
**CC BY 3.0**. Ils sont rendus par le même jeu de données dans le DOM (balises
`<svg>`) et sur le canvas (`Path2D`), donc nets à tout zoom et teintables : la
couleur vient du texte qui les porte. Les auteurs sont cités dans l'écran
**Crédits**, accessible depuis le menu de pause — c'est ce que la licence exige.

Quatre **illustrations** (`assets/`, 70 Ko en WebP) viennent d'une planche de
personnage fournie par l'auteur du dépôt : le chevalier de l'écran d'accueil,
le portrait du milicien dans le panneau de sélection, et le chevalier à terre
de l'écran de défaite. Le portrait de l'adversaire est le même fichier, passé
en rouge par rotation de teinte — plutôt qu'une seconde image à télécharger.

Le choix des icônes a été fait sur mesure : une icône doit tenir **à 24 px en
une seule couleur**, et deux concepts voisins ne doivent pas se ressembler.
D'où, par exemple, le trio caserne / archerie / écurie rendu par trois formes
sans recouvrement possible — un X d'épées, un disque de cible, un fer à cheval.

### Deux unités portent une illustration

Les **huit orientations** de la planche sont découpées en atlas (`assets/chevalier.webp`,
40 Ko) et servent de sprite au milicien sur la carte. Le personnage est dessiné
plus grand que l'emprise de l'unité — comme dans AoE, sinon un chevalier de dix-huit
pixels ne se lirait pas — et posé sur un **socle aux couleurs du joueur** : de loin
une armure reste une tache sombre, et l'appartenance doit se lire d'un coup d'œil.

Le **lancier**, lui, est du **pixel art natif** (`assets/lancier.png`, 4 Ko) :
huit orientations de 48 pixels, dessinées pour cette taille. Il est rendu sans
lissage, sinon l'interpolation le réduirait en bouillie.

La comparaison à l'écran est nette : **le pixel art l'emporte largement** sur la
peinture réduite, qui devient sombre et illisible à la taille d'une unité. La
peinture garde sa place là où elle est vue en grand — accueil, portrait, écran de
fin — et le terrain appartient au pixel art.

Toute unité sans illustration garde son rendu dessiné au code, et le jeu reste
jouable si une image ne charge pas.

### Animation des unités

À cette taille, ce qui se lit n'est pas le détail d'un personnage mais le
**mouvement**. Les unités ont donc une cadence de marche calée sur la distance
parcourue (une unité lente balance lentement, une unité bloquée ne pédale pas
sur place), un coup d'arme qui part en arrière puis balaie vers l'avant, et des
**éclats de matière** : copeaux bruns sous la hache, poussière grise sur un
chantier, étincelles au choc, projection à la mort. Tout cela vit dans le rendu,
jamais dans la simulation — une partie rejouée à la même graine reste identique.

## Réglages

Presque tout l'équilibrage est dans `js/config.js` : coûts, temps, points de vie,
armures, bonus de dégâts, taux de récolte, coûts des âges, paramètres de
difficulté, tailles de carte, **formats de partie** (`GAME_MODES`) et **vitesses**
(`GAME_SPEEDS`). Changer une valeur suffit, rien n'est codé en dur ailleurs.

## La sauvegarde, en deux mots

`js/save.js` ne stocke **pas la carte** : il stocke sa *graine*. La génération
étant déterministe, il suffit de rejouer ce qui a changé depuis — les gisements
épuisés et ce qu'il reste dans les autres. Le reste (joueurs, unités, bâtiments,
flèches en vol, IA, brouillard exploré, état du générateur aléatoire, minuteries
internes) est repris champ par champ.

C'est exigeant, et c'est vérifié comme tel : le test compare une partie qui
continue avec la même partie sauvegardée puis rechargée, et exige que les deux
restent **rigoureusement identiques** 60 secondes plus tard — positions au
centième de pixel, points de vie, contenu des gisements, décisions de l'IA. Un
seul champ oublié fait diverger les deux parties et échouer le test.

Une sauvegarde fait une centaine de kilo-octets et vit dans `localStorage`, sous
la clé `aem.partie`. Un numéro de version accompagne le format : une sauvegarde
plus ancienne est refusée plutôt que relue de travers.
