# 🏰 Âge des Empires Mobile

Un jeu de stratégie en temps réel inspiré d'Age of Empires, **jouable au doigt**
dans n'importe quel navigateur moderne. Pas de moteur de jeu, pas de bibliothèque,
très peu d'images : ~7 800 lignes de JavaScript, du Canvas 2D, des
pictogrammes vectoriels et 1,1 Mo d'illustrations et de textures — dont un cycle de marche
complet.

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

### Le déplacement : le chemin se lisse en marchant

Le chercheur de chemin (A*, huit directions) raisonne sur des **centres de
cases**. Une unité, elle, occupe un carré de dix pixels et ne se trouve à peu
près jamais au centre de sa case. Toute la difficulté du déplacement tient dans
cet écart, et la première version s'y est prise les pieds : le chemin était
lissé une fois pour toutes en vérifiant la ligne droite *entre centres*, puis
chaque point de passage était validé à 17 px de son centre — sans y être entré.
L'unité visait alors le nœud suivant depuis une case d'où la ligne droite était
bouchée, glissait du mauvais côté le long du mur, ne progressait pas,
recalculait au bout de 0,8 s… et retombait sur le même chemin. **C'était le
« personnage coincé »** : jusqu'à cent recalculs pour un seul ordre.

Désormais l'unité garde la suite **complète** des cases, et lisse elle-même à
chaque pas, **depuis sa position réelle et avec son gabarit** : elle vise le
nœud le plus lointain qu'elle peut atteindre en ligne droite sans accrocher,
coupe les angles quand c'est ouvert, passe de centre en centre quand c'est
étroit. Entrer dans la case d'un nœud le valide — pas le frôler. Si rien n'est
visible devant (poussée hors du couloir par ses voisines), elle cherche
derrière ; si rien nulle part, elle avance en aveugle et recalcule vite, un
nombre borné de fois. Un dernier nœud se rejoint au centre, et à portée de
bras d'un gisement ou d'un dépôt on marche droit dessus plutôt que de
redemander un chemin qui reviendrait vide.

Deux protections de plus : poser un bâtiment sur des unités les **pousse
dehors** (avant, la grille se bloquait sous leurs pieds et plus aucun pas ne
leur était permis), et une unité qui se retrouve malgré tout dans une case
bloquée en ressort d'elle-même au premier pas.

Le banc de mesure — plusieurs centaines d'ordres tirés au hasard vers des cases
atteignables, sur trois tailles de carte, seul et en groupe — est passé de
**11 échecs sur 32** ordres en carte moyenne à **zéro**, avec au plus trois
recalculs par ordre. Et sur une même partie de 16 minutes entre deux IA, le
joueur récolte **50 % de plus** : les villageois coincés bridaient l'économie.

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

## Le troupeau

Des **hardes** vivent sur la carte : quatre **cochons** à sept ou huit cases de
chaque Centre-Ville, et des hardes de **cerfs** loin des bases. Ils pâturent
autour de leur point d'attache, ne comptent pas dans la population et ne sont
la cible de personne d'eux-mêmes — les soldats les ignorent.

- **Le cerf se chasse** : touchez-le avec des villageois en main. Frappé, il
  détale quelques cases puis s'arrête, et le chasseur le rattrape à l'arrêt.
  Abattu, il laisse une **carcasse** de 140 de nourriture, qui ne bloque pas le
  passage ; le chasseur la dépèce sans nouvel ordre et rapporte la viande au
  dépôt le plus proche.
- **Le cochon se capture** : un villageois qui passe à moins de deux cases le
  fait sien. Il cesse alors d'errer, se sélectionne et se mène au doigt comme
  une unité ; menez-le au village, puis touchez-le avec un villageois pour
  l'abattre — 100 de nourriture. Les unités adverses peuvent capturer les
  vôtres de la même façon.

Un ordre donné *à côté* d'un animal reste un ordre de déplacement : seul un
doigt posé sur la bête déclenche la chasse.

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

Les **illustrations** (`assets/`, 205 Ko, plus 149 Ko de textures de sol) viennent de planches de personnage
fournies par l'auteur du dépôt : le chevalier de l'écran d'accueil,
le portrait du milicien dans le panneau de sélection, et le chevalier à terre
de l'écran de défaite. Le portrait de l'adversaire est le même fichier, passé
en rouge par rotation de teinte — plutôt qu'une seconde image à télécharger.

Le choix des icônes a été fait sur mesure : une icône doit tenir **à 24 px en
une seule couleur**, et deux concepts voisins ne doivent pas se ressembler.
D'où, par exemple, le trio caserne / archerie / écurie rendu par trois formes
sans recouvrement possible — un X d'épées, un disque de cible, un fer à cheval.

### Les unités portent une illustration, et deux styles cohabitent

Le milicien marche pour de vrai : `assets/milicien-marche.webp` (67 Ko) tient
**huit orientations × huit images**, soit 64 cases de 51×76 px, découpées d'une
planche de cycle de marche. L'image affichée est choisie sur la **distance
parcourue** et non sur l'horloge — les jambes suivent donc le sol, une unité
lente marche lentement, et une unité arrêtée reprend sa pose de repos plutôt que
de pédaler sur place.

L'atlas est passé par une **palette de 48 couleurs** avant d'être encodé sans
pertes : l'encodeur WebP emprunte alors son chemin palettisé et l'atlas tombe de
326 à 67 Ko, sans différence visible même agrandi quatre fois.

Le **lancier** est du **pixel art natif** (`assets/lancier.png`, 4 Ko) : huit
orientations de 48 px, dessinées pour cette taille. Il est rendu sans lissage,
sinon l'interpolation le réduirait en bouillie.

Le personnage est dessiné plus grand que l'emprise de l'unité — comme dans AoE,
sinon un chevalier de dix-huit pixels ne se lirait pas — et posé sur un **socle
aux couleurs du joueur** : de loin une armure reste une tache sombre, et
l'appartenance doit se lire d'un coup d'œil.

**Collé au gisement.** Un villageois ne récolte pas à une case de vide : il
choisit, avant de partir, le point où se tenir — le corps contre la case, sur
un de ses côtés. L'ouest ou l'est de préférence (les poses de travail sont de
profil : posté au nord, il regarderait à côté), puis le nord et le sud, puis
les angles ; à préférence égale, le plus proche, et un côté déjà pris par un
autre récolteur de la même case est laissé tant qu'il en reste — trois
bûcherons sur un arbre se répartissent ses flancs. Le chemin vise ce point ;
s'il est tenu ou impossible (un coin), il se contente d'où il est, et si le
point n'est pas joignable du tout, n'importe quel côté fait l'affaire avant de
condamner la case. Le point choisi est sauvegardé avec l'unité : une partie
reprise le garde.

**Le villageois travaille pour de vrai** (`villageois.webp`, 324 Ko) : cinq
orientations de marche dessinées (le nord-ouest est le nord-est en miroir), et sept poses — repos,
cueillir, construire, porter. La pose suit l'état de la simulation : devant des
baies ou une ferme il cueille, devant un arbre, un gisement, un chantier ou un
ennemi il frappe, en chemin avec sa charge il la porte, à l'arrêt il souffle.
Les poses sont dessinées d'un seul côté et retournées en miroir quand la cible
est de l'autre ; elles se cadencent sur l'horloge, décalées par unité pour que
dix bûcherons ne frappent pas en chœur, et le port suit la distance comme la
marche.

**L'éclaireur galope** (`eclaireur.webp`, 145 Ko) : huit orientations × quatre
foulées d'un cavalier à la lance, la planche lue du nord dans le sens horaire
et remise sur les secteurs du jeu. Il fait 54 px de face, un homme à pied 44 ;
la foulée suit la distance, comme toutes les marches.

**Deux partis pris sont jouables**, au choix dans le menu de pause :

| Style | Sprite du milicien | Ce qu'on y gagne |
| --- | --- | --- |
| **Animé** (par défaut) | `milicien-marche.webp`, 8 images par direction | Le mouvement se lit : on voit qui avance, qui est bloqué |
| **Peint** | `chevalier.webp`, une pose par direction | Le détail de l'armure, au prix d'une silhouette figée |

Le choix est retenu d'un lancement à l'autre, et l'atlas de l'autre style n'est
téléchargé que si on le demande — inutile de payer les deux. Le verdict à
l'écran est net : **la marche dessinée l'emporte**. À la taille d'une unité, ce
qui se lit n'est pas le détail d'un personnage mais son mouvement ; la peinture
réduite devient une tache sombre. Elle garde sa place là où elle est vue en
grand — accueil, portrait, écran de fin.

### Douze bâtiments illustrés, un palais en tête

Tous les bâtiments portent une illustration (`assets/*.webp`, 490 Ko pour les
douze) : un palais à dômes bleus pour le Centre-Ville, une forteresse pour la
caserne, puis archerie, écurie, atelier de siège, forge, maison, moulin, camp de
bûcherons, camp minier, ferme et tour de guet — même cité, même vue de trois
quarts, mêmes tridents. Ils sont dessinés **plus grands que leur emprise** —
172 px pour le palais, 158 pour les autres 3×3, 108 pour les 2×2 (64 px) — et
posés par leur ligne de sol sur le bord sud : le bâtiment monte au-dessus des
cases situées derrière, le parvis déborde devant, sur les cases praticables, où
les unités marchent. C'est le compromis d'Age of Empires : des bâtiments de
trois quarts sur un sol vu de dessus.

Deux détails de rendu qui comptent : les bâtiments sont classés à leur **bord
nord** dans l'ordre du peintre (pas à leur centre), pour qu'une unité qui longe
le mur passe toujours devant le débord ; et un chantier **sort de terre** — on
ne révèle l'illustration que jusqu'à la hauteur atteinte, parvis d'abord, murs
ensuite, dômes à la fin. Un bâtiment adverse est le même fichier passé au rouge
par la fenêtre de teinte du chevalier : dômes, toits et bannières changent de
camp, la pierre blanche et l'eau des fontaines restent.

Le doigt suit la peinture : sous un point, le bâtiment retenu est celui dont
l'image y est **opaque** et qui est peint en dernier — un chantier ne compte que
pour la part déjà sortie de terre. Sans cela, avec douze bâtiments qui se
chevauchent, toucher une maison en chantier au pied du palais sélectionnait le
palais ; le test navigateur l'a pris sur le fait.

Le « peps » : réduites de 1254 à 150 px, les illustrations sortaient ternes, et
la quantification à 64 couleurs de la première chaîne aplatissait les dégradés.
Chaque atlas reçoit désormais, après réduction, un masque flou léger, +16 % de
saturation et +10 % de contraste, puis un WebP avec pertes (qualité 86) à
l'alpha intact ; les arbres passent de 73 à 95 px de haut — trois cases, un
arbre dépasse une maison. La chaîne est décrite dans `assets/SOURCES.md`.

### Le sol est une nappe, pas un damier

Quatre textures de sol (`assets/sol-*.webp`, 149 Ko) — herbe, herbe sombre,
terre, sable — et une nappe d'eau dessinée au chargement. Elles sont traitées
comme des **nappes continues** : chaque case montre le morceau de nappe qui
correspond à sa position dans le monde, si bien que deux cases voisines se
prolongent sans couture et que rien ne trahit la grille.

Les **lisières** ne suivent pas la grille non plus. Une première version
repeignait chaque case de lisière élargie de 8 px à travers un masque qui
s'estompe : la frontière restait un escalier de cases, à peine adouci — « ça
fait bizarre ». Désormais chaque terrain a un **masque de couverture** : le
champ « ce terrain, ou un plus prioritaire » vaut 1 au centre de ses cases, 0
au centre des autres, et s'interpole entre les deux — sa ligne de niveau 0,5
passe par le milieu des bords de case et coupe les angles en diagonale. Un
bruit périodique l'ondule (jusqu'à 9 px), puis un seuil doux large de 10 px
donne l'opacité avec laquelle la nappe se pose. Les terrains se posent par
priorité croissante (terre, sable, herbe, herbe sombre, eau) ; les champs étant
emboîtés, chaque nappe ne garde sous les couches du dessus que sa part, et à
une lisière herbe/terre aucun sable ne transparaît. Les masques se calculent à
2 px monde par texel (moins d'une milliseconde par tronçon) et s'agrandissent
avec lissage ; chaque couche n'est composée que sur le rectangle où son masque
n'est pas nul.

**L'eau a des bords.** Sa nappe (`sol-eau.webp`) est l'« eau pleine » de la
planche, un losange isométrique redressé en carré vu de dessus puis raccordé
bord à bord comme les autres. Elle n'est pas posée telle quelle : une
transformée de distance depuis la ligne de rivage ondulée donne à chaque texel
sa distance au bord, et le rendu en tire trois bandes — une **frange de sable**
côté terre, un **haut-fond** turquoise et une **ligne d'écume** blanche côté
eau, striée par un bruit plus fin pour qu'elle se rompe comme un ressac. Trois
masques de plus par tronçon riverain, composés comme les couches de terrain.

**La carte est décorée.** Les planches d'eau ne montraient pas que de l'eau :
rochers, galets, touffes d'herbe, roseaux, nénuphars et fleurs en bordent les
rives ; une planche d'ornements a suivi. Ces pièces sont découpées une à une
(`assets/decor.webp`, 97 pièces : rochers, galets, touffes, roseaux, buissons
fleuris, fougères, couvre-sol, agaves, pampas, nénuphars, fleurs en quatre
couleurs) et le jeu les pose lui-même (`js/decor.js`). Le long de l'eau, un plan d'eau de 40
cases ou moins est une **mare**, ceinte de rochers serrés, de roseaux et de
nénuphars ; au-delà, un **lac** prend une plage de rochers épars, de galets et
de touffes. Partout ailleurs, la **campagne** suit le sol : herbe, bouquets de
fleurs, buissons et couvre-sol sur les prés ; cailloux, agaves, pampas et touffes
sèches sur la terre et le sable ; fougères et un peu plus de tout au pied des
forêts. Tout se déduit de la carte par un
hachage de la case et de la graine — la simulation n'en sait rien, une unité
traverse un rocher, et une partie reprise retrouve son décor. Rochers, roseaux,
buissons, fougères et agaves entrent dans l'ordre du peintre avec les unités ; le
reste est cuit dans les tronçons de sol mis en cache, et ne coûte rien à chaque
image.

Le sol est **pré-rendu par tronçons** de 8×8 cases dans des canvas hors écran
mis en cache (le terrain ne change jamais, le brouillard se peint par-dessus) :
une image affiche une dizaine de tronçons au lieu de trois cents cases et
d'autant de compositions — c'était 48 images par seconde en direct, c'est 60 en
cache, et 57 pendant un défilement continu qui rend dix tronçons frais par
seconde. Les tronçons se recouvrent de 8 px sur les mêmes texels, sans quoi un
zoom fractionnaire laissait voir une couture anticrénelée entre deux images
posées bord à bord. Une version demi-taille sert au zoom arrière, où réduire
une nappe de trop scintille au défilement.

Le raccord bord à bord des textures, qui ne l'étaient pas, est décrit dans
`assets/SOURCES.md` — avec la ligne à mi-période qu'un premier fondu laissait
en jeu, mesurée puis éliminée.

### Les arbres, les baies et l'or sont dessinés

Six essences d'arbres, un buisson à baies et un gisement d'or
(`assets/arbres.webp`, `baies.webp`, `or.webp`), à une seule échelle qui garde
les proportions des planches : le cyprès fait deux chevaliers, un buisson
ou un rocher tient dans sa case. Plus hauts que leur case, ils entrent dans l'**ordre du peintre** avec les
unités et les bâtiments : une unité passe derrière un arbre quand elle est
derrière, devant quand elle est devant. Un gisement qui s'épuise rapetisse un
peu — de loin, on voit ce qu'il reste. Le gisement d'or (`or.webp`, 9 Ko) suit
la même voie : une illustration et son miroir, avec une pointe de variation de
taille par case pour qu'un filon ne soit pas une frise.

### La couleur d'équipe se calcule au chargement

L'illustration d'origine sert un camp, l'autre est recalculée une fois pour
toutes dans un canvas hors écran — plutôt qu'un filtre appliqué à chaque image,
qui ne rend pas la même chose d'un navigateur à l'autre.

La règle ne peut pas être la même partout. Sur la cape peinte, un simple échange
des canaux rouge et bleu suffit. Sur le chevalier animé, l'armure est un **acier
bleuté** juste à côté du bleu franc du bouclier : l'échange faisait virer toute
l'armure au cuivre. On bascule donc une **fenêtre de teinte** (200°–255°,
saturation > 0,32), ce qui prend le bouclier et le tabard en épargnant l'acier.
Le lancier utilise la même mécanique dans l'autre sens, autour des rouges francs,
pour épargner la peau et le cuir.

Un test compare les deux variantes pixel à pixel : 20 % des pixels sont repeints,
**aucun pixel d'acier n'est touché**, et il ne reste aucun bleu franc côté adverse.

Toute unité sans illustration garde son rendu dessiné au code, et le jeu reste
jouable si une image ne charge pas. Avec 60 unités en marche à l'écran, les deux
styles tiennent **60 images par seconde** sur un Pixel 7 émulé.

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
