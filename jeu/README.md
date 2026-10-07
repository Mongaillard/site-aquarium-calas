# 🏰 Âge des Empires Mobile

Un jeu de stratégie en temps réel inspiré d'Age of Empires, **jouable au doigt**
dans n'importe quel navigateur moderne. Pas de moteur de jeu, pas de bibliothèque
(three.js ne sert qu'aux personnages en 3D : il les cuit une fois, puis tout est du Canvas 2D) :
~10 600 lignes de JavaScript, du Canvas 2D, des pictogrammes vectoriels et 1,6 Mo
d'illustrations et de textures — dont les cycles de marche du milicien, du
villageois, de l'éclaireur, du cerf et du cochon.

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

Six réglages se choisissent sur l'écran d'accueil, avant de lancer la partie :
votre civilisation, celle de l'adversaire, le format, la difficulté, la taille
de la carte et la vitesse de jeu.

**Deux civilisations.** Les **Atlantes** (peuple de la mer : marbre blanc, toits
bleus, tridents) et les **Solariens** (peuple du désert : grès ocre, toits en
terrasse, disques solaires). À ce stade, les règles sont les mêmes pour les
deux — coûts, points de vie, IA — : une civilisation change ce que l'on voit et
ce que l'interface nomme. Les Solariens ont leurs treize bâtiments (Palais du
Soleil, Cour des Gardes, Grenier à dômes, Temple du Soleil…) et dix troupes
à eux : le Fellah (l'ouvrier), le Garde à coiffe rayée, le Lancier, l'Archer,
le Chacal dressé (leur éclaireur), le Méhariste sur son dromadaire (leur
cavalerie lourde), le Garde masqué à tête de chacal (leur élite), le Prêtre du
Soleil et son sceptre, et les deux engins en bois blond cerclé de bronze doré.
L'arbalétrier, l'archer monté et l'Hydre gardent pour l'instant l'allure
atlante. Les troupes solariennes n'ont que leur modèle 3D : le style choisi au
menu de pause n'agit que sur les troupes atlantes, et son message le dit
(`troupesSelonStyle`, `js/sprites.js`). Seuls l'ouvrier et l'éclaireur sont
préparés au lancement ; le modèle
d'une autre troupe se prépare quand on la commande (`prevoirTroupe`,
`js/sprites.js`), pour ne pas cuire dix modèles avant la première minute. La civilisation
est un champ du joueur (`player.civ`, voir `CIVILISATIONS` dans `js/config.js`),
gardé par la sauvegarde ; l'image d'un type se cherche par `spriteDe(type, civ)`
(`IMAGES_CIV`, `js/sprites.js`) avec repli sur l'image atlante, son nom par
`nomDe(type, civ)`. Le tissu bleu roi des deux peuples est la couleur d'équipe :
le joueur 1 le porte en rouge, quelle que soit sa civilisation.

| Format | Durée | Ce qui change |
| --- | --- | --- |
| ⚡ **Express** | **10 min chrono** | Départ à l'**Âge Féodal** avec 7 villageois, des ressources garnies et de la place pour produire tout de suite, petite carte, population plafonnée à 40, IA agressive dès la première minute. **Raser le Centre-Ville adverse met fin à la partie sur-le-champ** (il y est deux fois moins résistant) ; sinon, au temps écoulé, **le meilleur score l'emporte** |
| 🏰 **Classique** | 20 à 30 min | La partie complète : trois âges, population 60, victoire par conquête (tous les bâtiments **et** villageois adverses) |

Le score d'une partie Express : *ressources récoltées + 10 par unité vivante +
25 par bâtiment debout*. Il s'affiche sur l'écran de fin, et le compte à rebours
remplace le chronomètre en haut de l'écran (il rougit dans la dernière minute).

Mesuré sur huit parties IA contre IA (difficulté Normal) : **toutes vont au
bout des dix minutes et se jouent aux points** — aucune IA ne rase le
Centre-Ville adverse, maintenant que plus aucun villageois ne reste figé
devant un dépôt (avant cette correction, deux parties sur huit finissaient
par la chute d'un Centre-Ville). Un joueur qui masse ses troupes peut, lui,
finir bien plus tôt.

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
| Bouton **Construire** (marteau et clous) puis toucher la carte | Poser un bâtiment |
| Barre des **ouvriers** en bas | Voir qui fait quoi · toucher un métier pour sélectionner le groupe |
| Pastilles **Agressif · Défensif · Tenir · Passif** | Attitude de combat de la sélection (voir plus bas) |
| Bouton **Abriter** (une porte) puis un abri | Mettre la sélection à l'abri · la **Cloche** met tous les villageois à couvert |
| Toucher un chantier (villageois sélectionné) | L'y affecter — même geste que pour le bois ou la nourriture |
| Bouton **Ouvriers** (trois silhouettes) | Panneau d'affectation : − / + pour déplacer un ouvrier d'un poste à l'autre, **chantiers compris** |
| Bouton **Détruire** puis **Confirmer** (dans les trois secondes) | Raser un de ses bâtiments — deux appuis, pour qu'un doigt qui visait « Ralliement » ne rase pas le Centre-Ville |

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
| **Agressif** | Engage tout ennemi en vue et le poursuit jusqu'à 9 cases de son poste |
| **Défensif** | Engage ce qui approche, ne s'éloigne pas de plus de 4 cases, puis revient |
| **Position tenue** | Ne bouge jamais : ne frappe que ce qui entre à portée d'arme |
| **Sans attaque** | N'attaque jamais de sa propre initiative |

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
bâtiment tombe, la garnison périt avec lui. Le bouton **Cloche**
envoie tous les villageois s'abriter d'un coup ; un second coup renvoie chacun à
son poste — le gisement, la ferme ou le chantier qu'il avait quitté —, y compris
ceux qui couraient encore vers l'abri. Pour abriter une sélection précise, le
bouton **Abriter** puis un appui sur le refuge (des soldats se réfugient d'un
simple appui sur l'abri).

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

### Plus aucune unité figée

Une partie jouée de bout en bout, dans un vrai navigateur, a pourtant montré
des villageois plantés des minutes devant un dépôt, sac plein, et une cloche
qui laissait quatre villageois dehors pour de bon. Chaque cause a été
reproduite, corrigée, et garde son test :

- **La case d'accès.** Un bâtiment se rejoignait par la case libre de son
  pourtour la plus proche *à vol d'oiseau* — parfois une poche murée par des
  arbres ou une maison. Le chemin vise désormais tout le pourtour : la case
  la plus proche *par le chemin*.
- **L'approche finale** en ligne droite reprenait la main avant que l'unité
  ait pu demander son chemin de contournement : elle se cognait au même mur
  en boucle.
- **Le quota de recalculs** (dix par ordre) ne se rouvrait qu'aux ordres de
  marche : après dix détours dans sa vie, un villageois ne recalculait plus.
- **L'hésitation entre deux nœuds.** Poussée par un voisin contre un angle,
  une unité visait un nœud, puis le précédent, un tick sur deux : chaque pas
  la rapprochait de sa cible du moment, jamais du bout. Le progrès se juge
  maintenant sur le trajet entier, et les glissements le long d'un obstacle
  suivent le cap voulu, pas la poussée des voisins.
- **Un bâtiment posé** en travers d'un chemin (recalcul immédiat), tout
  contre une unité (corps à cheval sur le mur : on la décale d'un pixel ou
  deux), ou qui ferme une poche autour d'elle (elle en sort) ; et le point
  d'apparition d'une unité formée n'est plus jamais une poche.
- **L'IA murait ses propres dépôts**, jusqu'à son Centre-Ville, ou coupait
  un passage entre deux bosquets : elle vérifie désormais chaque emplacement.
- **La foule devant la porte** : bloqué à portée de bras par d'autres
  villageois, on livre, on bâtit ou on entre d'où l'on est — pas à travers un
  mur, cependant.

Sur sept parties IA contre IA, les épisodes « en marche sans bouger dix
secondes ou plus » sont passés de **82** (6 900 secondes cumulées) à
**zéro** ; sur douze autres parties de quatorze minutes, les unités figées
vingt-cinq secondes d'affilée, de **123** à **zéro**.

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
- **par la barre des ouvriers** : la ligne *Chantiers* a ses **− / +** comme le
  bois ou la nourriture. Le **+** prend un inactif en priorité, sinon un
  villageois en chemin, sinon quelqu'un du métier le plus fourni, et l'envoie
  sur le chantier **qui manque le plus de bras** ;
- **par le chantier** : sélectionnez-le, puis **+1 ouvrier**.

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
puis attend vos ordres : le compteur des inactifs de la barre des ouvriers s'allume et une
notification vous prévient. De même, une ferme épuisée n'est pas replantée
d'office, et changer un ouvrier de métier ne jette jamais ce qu'il porte — il
passe d'abord livrer.

Si vous préférez le confort à la maîtrise, l'option **Réaffectation
automatique** (panneau des ouvriers) rend la main au jeu : le villageois repart seul sur
le gisement suivant. Le réglage est conservé d'une partie à l'autre. L'IA
adverse, elle, joue toujours avec l'automatisme.

Souris : clic gauche pour sélectionner ou tracer un rectangle, clic droit pour
donner un ordre, molette pour zoomer, `WASD`, `ZQSD` ou les flèches pour la vue,
`Échap` pour annuler, `Suppr` pour supprimer la sélection (un chantier est
annulé et remboursé), `Espace` pour la pause, `.` pour trouver un villageois
inactif, `H` pour revenir au Centre-Ville.

## Le jeu

- **3 ressources** : nourriture (buissons à baies, fermes, chasse au cerf, cochons), bois (forêts), or (filons).
- **3 âges** : Âge Sombre → Âge Féodal → Âge des Châteaux, chacun débloquant
  bâtiments, unités et technologies — et chacun demandant des bâtiments
  terminés en plus de son prix.
- **17 unités** : villageois, milicien, lancier, Atlante, Champion, archer,
  Arbalétrier, Archer monté, éclaireur, cavalier, bélier, Catapulte, Prêtresse,
  Hydre, Pavoisier, Frondeur et Sapeur. Chaque unité a des bonus contre
  une catégorie (le lancier mange la cavalerie, le cavalier fond sur les archers,
  le bélier démolit les bâtiments).
  - La **Prêtresse** (Temple, Âge Féodal) ne se bat pas : elle soigne d'elle-même
    l'allié blessé le plus mal en point à sa portée (8 points de vie toutes les
    2 s). Toucher une unité blessée avec une Prêtresse en main l'y envoie.
  - Le **Champion** (caserne, Âge des Châteaux) : infanterie lourde.
  - L'**Arbalétrier** (archerie, Âge des Châteaux) : un carreau lourd, de plus
    loin que l'archer, qui perce l'armure de l'infanterie ; lent à recharger.
  - L'**Archer monté** (archerie, Âge des Châteaux) : la portée d'un archer sur
    un cheval — il harcèle et s'esquive ; les lanciers le fauchent.
  - La **Catapulte** (atelier de siège, Âge des Châteaux) lance un boulet sur un
    point : dégâts de zone à l'arrivée, bonus contre les bâtiments. Un soldat
    ou un rang en marche l'esquive, et le boulet blesse aussi son propre camp.
  - L'**Hydre**, monstre à sept têtes, s'invoque au Temple à l'Âge des Châteaux
    (200 de nourriture, 200 d'or) : elle encaisse comme une escouade, mord
    jusqu'à trois ennemis par coup, et occupe trois places de population.
  - Le **Pavoisier** (caserne, Âge Féodal) : un fantassin derrière un grand
    bouclier — une flèche d'archer ou de tour ne lui ôte qu'un point de vie.
    Lent, il frappe peu.
  - Le **Frondeur** (archerie, Âge Féodal) : un tireur sans or, dont la pierre
    porte +6 contre les archers, les arbalétriers et les archers montés (un
    bonus par type de cible, `bonusType` : l'Archer monté est de la cavalerie).
  - Le **Sapeur** (caserne, Âge des Châteaux) : rapide, +25 contre les
    bâtiments et +8 contre les engins de siège ; 35 points de vie, sans armure.
    Ces trois-là se débloquent aux ligues 6 à 8 (voir le classement).
- **13 bâtiments** : Centre-Ville, maisons, moulin, camps de dépôt, fermes,
  caserne, archerie, écurie, atelier de siège, forge, Temple de l'Hydre (dès
  l'Âge Féodal), tour de guet.
- **4 technologies** : brouette, armes forgées, flèches barbelées, armure d'écailles.
- **Brouillard de guerre**, minimap, points de ralliement, files de production,
  réparation, annulation de chantier avec remboursement.
- **Attitudes de combat, poursuite bornée, garnison et cloche du village**,
  déplacement de groupe au rythme du plus lent (voir plus bas).
- **Affectation manuelle des ouvriers** : barre de répartition permanente et
  panneau d'affectation (voir plus haut).
- **Victoire** : en Classique, l'adversaire est vaincu quand il n'a plus ni
  Centre-Ville ni bâtiment militaire ; en Express, quand son dernier
  Centre-Ville tombe — sinon au score, qui compte le combat.
- **Sauvegarde automatique** et reprise, **vitesse de jeu** réglable, **formats
  de partie** (voir plus haut).

### L'IA adverse

Trois difficultés, qui ne trichent pas sur les ressources : seuls changent la
vitesse de récolte de l'IA (×0,8, ×1, ×1,25), le nombre de ses villageois (14,
20 ou 26) et son agressivité. L'IA suit un ordre de construction, répartit
ses villageois selon des quotas par ressource, met de côté le coût du prochain
âge, remplace ses fermes épuisées, défend sa base quand elle est attaquée et
lance des vagues d'assaut de plus en plus grosses. Première offensive typique :
vers la dixième minute en Normal, un peu plus tôt en Difficile, jamais avant
la quinzième en Facile ; en Express, dès la deuxième minute (4 min 30 s en
Facile). L'IA ne pose
jamais un bâtiment qui murerait un des siens ni qui couperait un passage.

À l'Âge des Châteaux elle bâtit aussi un Temple et forme toutes les troupes du
jeu — sauf le Pavoisier, le Frondeur et le Sapeur, qu'elle ne forme que si la
partie les lui donne (voir le classement). Les unités chères ne sortiraient
jamais si les fantassins buvaient l'or au fur et à mesure : elle en « commande »
donc une à la fois et met son prix de côté — une Hydre tant qu'elle en a moins
de deux, puis un engin de siège (catapulte et bélier en alternance), et deux
Prêtresses au plus pour soigner l'armée. Attaquée chez elle, elle lâche
l'épargne et forme ce qu'elle peut.

## Les réglages d'octobre 2026

Dix relecteurs ont joué le jeu sans écran et l'ont noté (4 à 6,5 sur 10 selon
le thème). Leur avis commun : le prochain gain ne viendrait pas d'une troupe de
plus, mais d'une vingtaine de petits réglages. Les voici, par thème ; chacun a
son fichier de vérifications, et `npm test` les lance tous. Ce qui ne se voit
qu'une fois les thèmes réunis (la cloche et le Centre-Ville perdu, réparer sous
le siège de l'IA, une sauvegarde d'avant les nouveaux prix, les corps à terre et
la mémoire, le style et les civilisations, la consigne d'un ordre armé) a le
sien : `node test/reglages-integration.test.js`.

**Alerte d'attaque, armée et sélection au doigt.** Quand vous êtes attaqué, le
message « Vous êtes attaqué ! Touchez pour voir où » reste six secondes :
touchez-le, la vue va sur le lieu de l'attaque, et pendant ces six secondes un
repère rouge pulse au même endroit sur la mini-carte. Il y a une alerte par
foyer d'attaque : douze secondes de silence autour d'une alerte, mais une
attaque ailleurs sur la carte (à plus de seize cases) a la sienne, trois
secondes au moins après la précédente — un raid sur le village n'est plus masqué
par un combat au loin. Au bout de la barre des ouvriers, la pastille **Armée**
(une épée et le nombre de soldats, c'est-à-dire tout ce qui n'est ni ouvrier ni
animal) prend toute l'armée d'un toucher, où qu'elle soit, sans bouger la vue ;
un second toucher amène la vue sur le gros de la troupe. Elle est grisée sans
soldat, et montre l'abri si toute l'armée s'y trouve. Enfin, dès qu'une
sélection existe, une **croix** en haut à droite du panneau du bas la lâche —
avec la pose en cours et l'ordre armé : un appui raté ne devient plus un ordre
(au clavier, c'est toujours `Échap`). « Stop » fait aussi tomber l'ordre armé,
et la consigne d'un ordre (« Touchez la zone à attaquer ») part toujours avec
lui — elle ne reste ni après « Stop », ni dans la partie suivante. La logique de
ces trois réglages vit sans
DOM dans `js/ui.js` (`FoyersAttaque`, `armeeDe`, `toucherArmee`) et se vérifie
sous Node : `node test/reglages-alerte.test.js`, 46 vérifications.

**Des ordres qui obéissent.** Un appui au sol est un ordre de marche, suivi
jusqu'au bout quelle que soit l'attitude : c'est le geste pour sortir ses
troupes d'un combat, et l'attitude ne reprend ses droits qu'à l'arrivée. Seul
**Attaquer ici** engage ce que la troupe croise en chemin. Un soldat occupé sur
un bâtiment ne se laisse plus tuer dans le dos : frappé par une troupe ennemie,
il se retourne contre elle, et avec lui tous ceux qui attaquent le même bâtiment
— même postés sur la face opposée, hors de sa vue — ainsi que les camarades qui
le voient ; tous reprennent le bâtiment une fois la menace écartée. La riposte
n'a pas lieu en *Position tenue* ni en *Sans attaque*, ni pour les engins de
siège ; la poursuite reste bornée par l'attitude, comptée depuis l'endroit où
l'unité s'est retournée, et la règle vaut aussi pour l'adversaire. Enfin, on
**répare** et on **soigne** au doigt : des ouvriers en main, toucher un de ses
bâtiments achevés et abîmés lance la réparation ; des Prêtresses seules en main,
toucher un allié blessé lance le soin, y compris en pleine mêlée, où le blessé
passe avant l'ennemi collé à lui. Réparer sous le feu a son prix : les soldats
de l'IA qui frappent un bâtiment se retournent contre les ouvriers qui le
réparent, puis reprennent le bâtiment (`chasserLesReparateurs`, `js/ai.js`) —
sans cela un seul ouvrier, que personne ne visait, rendait le Centre-Ville
imprenable en Express. Le double tap sélectionne toujours. Mesuré
dans le moteur : six miliciens en mêlée reculent de 7,9 cases en huit secondes
sans perte (0,7 case et un mort auparavant) ; cinq miliciens sur une maison
attaqués par trois gagnent en perdant un homme (ils mouraient tous) ; six
miliciens répartis autour d'un Centre-Ville attaqués par quatre gagnent à quatre
survivants. Ces règles ont leurs vérifications dans
`test/reglages-ordres.test.js` (`node test/reglages-ordres.test.js`), qui joue
aussi le vrai toucher de `js/main.js` sur un faux écran.

**Les règles de bord, refermées (octobre).** La cloche ne regarde que les
villageois. Tant qu'un villageois dehors peut être abrité, elle abrite : elle
répartit sur tous les abris en comptant les places déjà promises (une tour
pleine, les autres vont au Centre-Ville), n'envoie que ceux qui auront une place
et dit combien restent dehors ; ceux formés pendant l'alerte sont appelés au
coup suivant sans faire sortir les autres. Quand plus personne dehors ne peut
l'être, le coup suivant lève l'alerte et ne renvoie au travail que ceux qu'elle
a appelés, chacun à son poste — ni les soldats abrités, ni un villageois mis à
l'abri à la main, qui sort par « Libérer ». Un villageois appelé dont l'abri
tombe ou se remplit court au suivant, ou reprend son poste s'il n'y a plus de
place ; « Libérer » lève l'alerte aussi bien que la cloche. Un autre ordre donné
pendant l'alerte fait oublier le poste noté. Une unité à l'abri ne prend aucun
ordre, ne compte ni dans une formation ni dans le pas d'un groupe, et les
villageois abrités ne sont ni comptés « sans affectation » ni choisis par les
boutons + (le panneau des ouvriers indique « n à l'abri »). Un chantier garde
les coups reçus : le marteau ajoute des points de vie, il ne les recalcule pas ;
achevé abîmé, il libère ses bâtisseurs — réparer est un autre ordre. Le pas du
groupe tombe à chaque nouvel ordre. Raser un de ses bâtiments
(`World.raserBatiment`) fait sortir les occupants vivants et rend la file, une
recherche et un passage d'âge en cours — au prix payé, noté avec le passage (une
sauvegarde d'avant les nouveaux prix rend l'ancien) ; détruit par l'ennemi, un
bâtiment
emporte toujours sa garnison, et un passage d'âge s'arrête si son Centre-Ville
tombe. Une file pleine refuse aussi une technologie, on ne bâtit pas sur une
carcasse, et une fondation n'éclaire que ses abords. Ces règles ont leur fichier
de tests, `node test/reglages-bugs.test.js` (60 vérifications, dont deux parties
bombardées d'ordres au hasard).

**Score, fin de partie et palmarès.** En Express, le score ne récompense plus la
seule récolte : il additionne *la moitié des ressources récoltées*, *le prix des
troupes en vie et des bâtiments achevés*, et *deux fois le prix de ce que l'on a
abattu chez l'adversaire* (troupes, bâtiments, garnison comprise). Un soldat
perdu coûte donc son prix à son camp et le rapporte deux fois à l'autre : sur
huit parties IA contre IA, la récolte pèse 15 à 33 % du score (contre 78 à 85 %
avant) et le camp qui perd le plus de soldats ne gagne plus. Le score des deux
camps s'affiche pendant la partie, à côté du compte à rebours, et l'écran de fin
en donne le détail (`World.detailScore`, `js/game.js`). En Classique, la
conquête n'exige plus de raser la dernière ferme : un camp est vaincu quand il
n'a plus **ni Centre-Ville ni bâtiment militaire** (caserne, archerie, écurie,
atelier de siège, temple — tout ce qui forme des troupes), achevé ou en chantier
; le joueur qui perd son dernier Centre-Ville en est averti (« Rebâtissez… » ou,
s'il ne lui reste aucun villageois pour le faire, qu'il ne tient plus que par
ses troupes et ses bâtiments militaires), et l'écran de fin
dit pourquoi la partie s'arrête. Le joueur ne peut plus se faire perdre par
mégarde : « Détruire » (et la touche `Suppr`, qui demande désormais deux appuis
pour un bâtiment) prévient en rouge quand le bâtiment visé est le dernier qui
tient le camp en jeu, et « Annuler » fait de même pour le dernier chantier
(`World.destructionFatale` dit la règle d'avance). Entre deux IA de niveaux
inégaux, 11 parties sur 12 se terminent avant 40 minutes ; entre deux IA de même
niveau, aucune ne perce l'autre, et la règle n'y change rien. Enfin un
**palmarès** garde la trace des parties finies, par format et par difficulté :
victoires, défaites, meilleur temps de victoire, meilleur score Express. Il vit
dans `localStorage` sous la clé `aem.palmares.v1`, à part de la partie en cours
(`js/save.js`) ; l'écran de fin annonce « Nouveau record ! » avec le précédent,
et l'accueil le rappelle d'une ligne sous le bouton Jouer. Un abandon dans la
première minute ne compte pas. Vérifications : `node
test/reglages-score.test.js` (106).

**Des âges qui se méritent, et plus d'armée qui gagne contre tout.** Passer
d'âge demande désormais des bâtiments terminés en plus de son prix : une Caserne
et un Moulin puis 400 de nourriture pour l'Âge Féodal ; deux bâtiments
différents parmi l'Archerie, l'Écurie, la Forge et le Temple, puis 600 de
nourriture et 200 d'or, pour l'Âge des Châteaux (`requis` dans `AGES`,
`World.conditionAge`). Le bouton grisé dit ce qui manque quand on le touche («
Il faut une Caserne et un Moulin »), et en Express le stock de départ ne paie
plus l'Âge des Châteaux à la première seconde. L'IA bâtit ce que l'âge exige
avant ses fermes. Côté combat, le Champion perd un point d'armure de mêlée et le
carreau de l'Arbalétrier perce l'infanterie (+8) : à coût égal l'Arbalétrier et
le Cavalier battent le Champion, qui bat toujours lanciers, miliciens et
Atlantes. Le boulet de la Catapulte vole à 4 cases par seconde sur une zone de
0,8 case — un soldat isolé ou un rang en marche, visé de cinq cases ou plus,
l'esquive ; une colonne profonde prend le boulet sur ses rangs arrière — et il
blesse aussi les troupes de son camp prises dans l'explosion
(`World.impactDeZone`). L'Hydre mord jusqu'à trois ennemis par coup, sa cible et
les deux plus proches devant elle (`morsures`, `World.morsuresVoisines`) : une
Hydre bat trois Champions, trois Hydres tiennent tête à dix Champions ou neuf
Cavaliers. Ces règles ont leurs vérifications, duels à coût égal compris : `node
test/reglages-equilibre.test.js` (65 vérifications).

**Mémoire, mesures et batterie.** Les troupes en 3D pèsent lourd (environ 160 Mo
d'atlas pour les quatorze troupes d'un camp, autant pour leurs copies rouges),
et un iPhone coupe une page trop lourde. Le jeu se mesure donc lui-même et borne
ce qu'il garde. Un **témoin de coupure** (`js/save.js`, clé `aem.temoin.v1`)
tient à jour toutes les cinq secondes une petite marque — heure, minutes de jeu,
unités, Mo d'images de troupes, pixels par point, page visible — et la ferme à
chaque sortie normale (partie finie, retour à l'accueil, page masquée ou
quittée). Au lancement suivant, une marque restée ouverte donne une ligne sous
la carte de reprise (« La dernière partie s'est interrompue après 12 min — 180
Mo d'images, 64 unités ») ; une page quittée en pleine partie et relancée
aussitôt est dite « rechargée ». La marque n'est relevée qu'une fois, mais la
ligne tient jusqu'à la prochaine partie lancée, même si la page est rechargée
entre-temps : l'incident reste « non lu » (`incidentNonLu`) tant que `startGame`
ne l'a pas marqué (`marquerIncidentsLus`). Les cinq derniers incidents sont
gardés, et le menu de pause rappelle le dernier, lu ou non, dans sa ligne
**Mesures** : images par seconde des dernières secondes de jeu, Mo d'images de
troupes, troupes en mémoire, pixels par point. Le **plafond de mémoire**
(`js/sprites.js`, `entretenirMemoire`, appelé une fois par seconde) rend la
copie rouge d'une troupe après trente secondes sans dessin (elle se refait au
dessin suivant, jamais la toile d'origine) ; au-delà de `BUDGET_TROUPES_MO`
(120), une troupe sans unité en vie ni en formation, ni corps encore à terre,
depuis deux minutes est déchargée et relue du cache dès qu'on en reforme (partie
figée, un corps ne s'efface pas : sa troupe reste) — jamais une cuisson allégée,
ni une cuisson pas encore rangée dans le cache, ni l'ouvrier et le milicien
atlantes, qui servent de repli. Page masquée ou partie quittée, le sol en cache
et les copies rouges sont rendus tout de suite. **Batterie** : menu de pause
ouvert ou partie finie, la carte n'est redessinée que quatre fois par seconde
(`IMAGES_FIGEES`, `js/main.js`), et aussitôt si la vue, l'écran, la finesse ou
le style changent. Enfin l'empreinte de chaque modèle 3D est retenue d'un
lancement à l'autre (`aem.empreintes.v1`) avec l'ETag et la date que le serveur
annonce : une demande d'en-têtes remplace le téléchargement de 2 à 3 Mo, et au
moindre doute le fichier est relu comme avant. Tests : `node
test/reglages-memoire.test.js` (94 vérifications).

**L'adversaire, niveau par niveau.** En Facile, l'adversaire laisse le temps
d'apprendre : aucune vague avant 15:00 de jeu en Classique (4:30 en Express), un
message une minute avant (« L’ennemi prépare une attaque : formez des soldats à
la Caserne », au nom de la caserne de votre peuple), puis de petites vagues
comptées — 3 soldats, puis 5, puis 7 — pendant que le reste de son armée garde
sa base. La trêve tient quoi que fasse le joueur : s'il envoie son éclaireur
voir la base adverse, l'adversaire le chasse de chez lui sans le suivre jusqu'à
la sienne. Un joueur qui ne fait rien perd quand même, vers 20:30 en Classique
et vers 9:45 en Express. Normal et Difficile gardent leurs heures, à la seconde
près : première vague de six soldats vers la dixième minute en Classique, de
trois soldats vers 1:20 en Express ; Difficile récolte davantage, ses vagues
grossissent plus vite et, en Classique, il attaque un peu plus tôt. L'adversaire
ne se laisse plus paralyser par une tour habitée posée près de chez lui : une
troupe abritée n'est plus une menace ; une alerte où personne ne porte ni ne
reçoit de coup est levée au bout de 45 secondes, pour deux minutes, et les
ouvriers abrités ressortent ; l'épargne pour l'âge suivant tient pendant
l'alerte, sauf tant que l'ennemi a plus de troupes dans sa base qu'il n'a de
soldats ; l'état d'alerte est gardé par la sauvegarde. Un bâtiment qui tire sur
sa base est rasé par l'armée restée au camp dès qu'elle en a les moyens (il faut
14 miliciens ou 6 champions contre une tour qui abrite un ouvrier) : un assaut
dure deux minutes au plus, trois assauts par bâtiment et par âge, et une vague
ne le prend pas pour cible tant qu'elle ne peut pas l'abattre ; ses troupes
contournent la zone battue par la tour quand un détour existe. Limites connues :
une tour habitée posée au cœur même de sa base (moins de dix cases de son
Centre-Ville) retarde encore de trois à six minutes son âge ou sa première vague
sur une partie des emplacements, et en Express une tour à deux ouvriers collée à
son Centre-Ville (quatre à sept cases) peut encore le lui raser, faute de
riposte ; une tour vide qui ne menace aucun de ses bâtiments peut rester debout.
Une armée tombée nettement sous son plancher est complétée avant d'épargner pour
l'âge suivant. Tests : `node test/reglages-ia.test.js`.

## La direction artistique d'octobre 2026

Un principe : **les bâtiments et les arbres sont la référence** — un dessin à
l'encre, trait sombre, ombres peintes, lumière venue d'en haut à gauche — et
tout le reste s'en rapproche. On ne touche ni aux bâtiments, ni à la taille des
troupes, ni aux règles : chaque lot vérifie que la même partie donne le même
état avant et après.

**Le brouillard** est une brume bleu nuit au bord fondu, plus un noir en marches
d'escalier : un masque à trois points par case (`FOG_K`), lissé, repeint par
blocs de huit cases là où il a changé, et qui déborde de la carte pour que le
hors-carte ait la même teinte. Ce qui n'a jamais été vu reste opaque ; ce qui a
été vu garde un voile aussi sombre qu'avant (`BROUILLARD` dans `js/render.js`).
La mini-carte porte le même.

**Le sol et le décor de chaque peuple.** Un Solarien démarre dans son désert :
une quinzaine de cases de sable doré autour du palais, puis une bande de terre
avant l'herbe ; chacun de ses bâtiments posé plus loin a sa cour de sable. Près
de lui, cyprès, oliviers et pins parasols remplacent sapins et saules — ce sont
les mêmes arbres pour les règles, seule l'image change. Plus aucun rocher ni
buisson sur un bâtiment, son parvis ou un chantier ; les fleurs sont de petits
massifs dessinés ; l'or reste lisible sur la mini-carte du désert. Tout cela
est de l'affichage (`solDeBase`, `solApparent`, `filtrerDecor` dans
`js/decor.js`) : la carte que lisent les règles n'est pas modifiée, et le sol
ne change sous un bâtiment adverse qu'une fois ce bâtiment vu.

**Les troupes** ont le trait des bâtiments : contour sombre, ombres marquées,
côté gauche plus clair (`REGLAGE` dans `js/modele3d.js`, cuisson version 9 :
elles se recuisent une fois à la première ouverture). Chacune a une ombre au
sol, en bas à droite, et un anneau de camp franc — bleu ou rouge — posé sous les
jambes de toutes les troupes, à la place de la pastille pâle. Le panache du
Milicien suit le camp, l'Hydre adverse est d'un seul rouge, bélier et catapulte
sont en bois, le cochon est assombri. Les toits des bâtiments atlantes adverses
passent au rouge en entier.

**L'accueil et l'habillage.** On choisit son peuple sur l'image de sa capitale,
et toute l'interface prend ses couleurs (`body[data-civ]` dans `css/jeu.css`) :
bleu profond à liseré marbre pour les Atlantes, brun chaud à liseré or pour les
Solariens. Le bouton Jouer se voit sans défiler ; les autres réglages sont
repliés, résumés sur une ligne. Quand une partie dort, « Nouvelle partie »
demande deux touchers. En partie, la barre du bas est un panneau plein, le menu
Construire montre l'illustration de chaque bâtiment, les boutons de formation
le portrait de la troupe, et les écrans de fin la capitale du joueur.

Ce qui reste à dessiner : des palmiers et des végétaux du désert, les engins
(ils n'ont changé que de couleur), le portrait du Milicien, l'icône de
l'application. Rien n'a été mesuré sur un iPhone : tout a été jugé sur des
captures à la taille du téléphone. Tests : `node test/da-brouillard.test.js`,
`node test/da-desert.test.js`, `node test/da-troupes.test.js`,
`node test/da-accueil.test.js`.

## Classement, ligues, coffres et niveaux des troupes

Une partie se lance **classée** ou **libre** (réglages de l'accueil). Classée,
elle compte : une victoire rapporte 30 points d'« Elo », une défaite en coûte
15, jamais sous zéro. Le score fait monter de ligue — dix ligues, de Bois à
Légendes, à seuils de plus en plus écartés. Tant que le jeu entre joueurs
n'existe pas, l'adversaire d'une partie classée est l'ordinateur, et sa force
suit la ligue : sa difficulté, sa vitesse de récolte et le niveau de ses
troupes (table `echelle` des réglages).

**Les coffres** se gagnent en jouant — bois à chaque victoire classée (cinq par
jour au plus), argent tous les dix points de bataille (une victoire en vaut
deux, une défaite un), or à chaque nouvelle ligue et pour trois jours joués dans
la semaine, légendaire aux ligues 5, 8 et 10. Un coffre contient un nombre fixe
de tirages : chacun choisit une catégorie selon une table affichée au joueur,
puis une troupe débloquée de cette catégorie, à chances égales, et donne un
nombre fixe de **fragments**. Aucun coffre ne se vend.

**Les fragments montent le niveau d'une troupe**, de 1 à 5 : +5 % de points de
vie et de dégâts par niveau pour la plupart, la récolte pour l'ouvrier (+12,5 %
aux niveaux 2 et 3, puis le chargement et la vitesse de chantier), le soin pour
la prêtresse, la vitesse pour l'éclaireur. Ni la portée, ni la cadence, ni le
coût ne changent. En partie classée, une troupe joue à son niveau **dans la
limite du plafond de la ligue**, et l'ouvrier monte d'office à ce plafond :
l'économie n'est jamais inégale. En partie libre, elle joue à son niveau réel.

**Sept troupes se débloquent**, en atteignant une ligue ou après un nombre de
parties jouées. Tant qu'une troupe n'est pas débloquée, son bouton reste visible
sous cadenas, et l'ordinateur ne la forme pas non plus.

| Troupe | Ligue, ou parties | Ce qu'elle apporte | Sa faiblesse | Ce qui la bat |
|---|---|---|---|---|
| **Atlante** (caserne, Féodal) | 2, ou 10 | un fantassin robuste, +6 contre la cavalerie | il coûte de l'or, et n'a de bonus que contre la cavalerie | le Champion, à coût égal |
| **Archer monté** (archerie, Châteaux) | 3, ou 25 | la portée d'un archer, les jambes d'un cheval : il harcèle et s'esquive | cher, et c'est de la cavalerie | les lanciers, les frondeurs |
| **Catapulte** (atelier de siège, Châteaux) | 4, ou 50 | un boulet de zone, de loin : bâtiments et troupes à l'arrêt | lente, sans défense au contact ; une troupe en marche esquive, et le boulet blesse aussi son camp | Champions et Cavaliers au contact, les sapeurs |
| **Hydre** (Temple, Châteaux) | 5, ou 80 | elle encaisse comme une escouade et mord trois ennemis par coup | 400 de ressources, 45 s de formation, trois places de population | rien à coût égal : dix Champions ou neuf Cavaliers tiennent tête à trois Hydres |
| **Pavoisier** (caserne, Féodal) | 6, ou 130 | un mur contre les archers et les tours : armure de 6 contre les flèches | lent (0,85) et il frappe peu (4) | Cavaliers, Champions, et la Catapulte quand il tient la ligne |
| **Frondeur** (archerie, Féodal) | 7, ou 180 | un tireur sans or, +6 contre archers, arbalétriers et archers montés | portée de 4, 30 points de vie, et 3 de dégâts hors de son bonus | toute troupe de mêlée : miliciens, Cavaliers |
| **Sapeur** (caserne, Châteaux) | 8, ou 250 | rapide (1,3), +25 contre les bâtiments, +8 contre les engins de siège | 35 points de vie, aucune armure | tout soldat : un archer seul l'abat, cinq miliciens en abattent quatre sans perte |

Les trois dernières sont des hypothèses de départ, mesurées en duels à prix
égal (`node test/troupes-nouvelles.test.js`, qui écrit les temps) : sept
frondeurs battent six archers en neuf secondes, mais quatre perdent contre
trois miliciens ; un Pavoisier tient 34 s sous le tir de quatre archers, un
milicien 4 s, et sept pavoisiers battent dix archers sans perdre un homme ;
cinq sapeurs rasent une caserne en 15 s, deux béliers en 48 s. À +25, le Sapeur
démolit donc trois fois plus vite que le bélier pour le même prix : c'est le
réglage à surveiller.

**L'ordinateur ne forme pas ces trois-là de lui-même** : sa composition d'armée
n'a pas changé. La partie les lui donne par l'option `troupesEnPlus` de `World`
(une liste par camp, gardée par la sauvegarde) : en partie classée, celles que
la ligue du joueur offre ; en partie libre, celles que le joueur a débloquées.
Il les mêle alors à sa rotation, dès que l'âge et le bâtiment le permettent.
Les quatre premières, qui sont dans son ordinaire, lui sont au contraire
interdites (`troupesInterdites`) tant que la ligue ne les offre pas.

Ce qui ne se contourne pas : une défaite d'avant deux minutes (abandon, ou
bâtiment principal rasé de sa propre main) coûte ses points mais ne compte ni
vers un coffre ni vers une troupe ; une partie classée quittée — nouvelle
partie, sauvegarde jetée — compte comme un abandon ; chaque partie classée
porte un identifiant et ne se compte qu'une fois.

Où c'est : **tous les réglages** dans `js/progression-config.js` (barème,
seuils, tables des coffres en pour-mille, coûts, améliorations, force de
l'ordinateur) ; **les règles** dans `js/progression.js`, des fonctions pures
sur un profil ordinaire, sans stockage, sans horloge et sans hasard caché — le
même code pourra tourner sur un serveur qui fait foi ; **dans la partie**,
`World` reçoit `niveaux`, `troupesInterdites`, `troupesEnPlus` et
`recolteAdverse`, et sans ces options elle est celle d'avant au caractère près ;
**les écrans** dans `js/progression-ecrans.js` et `css/progression.css`. Le
profil est rangé dans le navigateur (`aem.progression.v1`) et, quand la page est
servie par un hôte qui prête une base par personne, il y est gardé aussi
(`js/rangement-durable.js`) : le plus avancé des deux l'emporte au lancement.

Ce qui n'existe pas encore : le serveur (rien n'est vérifié ailleurs que sur
l'appareil, et rien ne s'achète), le jeu entre joueurs, les saisons (le moteur
sait finir une saison, rien ne décide quand). Le Pavoisier, le Frondeur et le
Sapeur n'ont pas encore leur modèle 3D ni leur portrait : en partie ils gardent
le corps dessiné au code des unités sans illustration, et dans l'interface leur
pictogramme (un pavois, une fronde, une pioche). Tests :
`node test/progression.test.js`, `node test/progression-partie.test.js`,
`node test/rangement-durable.test.js`, `node test/troupes-nouvelles.test.js`.

## Architecture

```
jeu/
├── index.html            page unique
├── css/jeu.css           interface (DOM), pensée « pouce d'abord »
├── css/progression.css   classement, coffres, collection
├── js/
│   ├── config.js         données de jeu et équilibrage
│   ├── utils.js          maths, RNG déterministe, tas binaire, grille spatiale, bruit
│   ├── map.js            génération procédurale, terrain, ressources, blocage
│   ├── pathfinding.js    A* 8 directions, budget de nœuds (le lissage se fait en marchant)
│   ├── entities.js       unités (machine à états), animaux, bâtiments, projectiles
│   ├── game.js           le monde : ordres, économie, combat, troupeau, brouillard, victoire
│   ├── ai.js             l'adversaire
│   ├── save.js           sauvegarde et reprise, palmarès, profil du joueur
│   ├── progression-config.js  classement, ligues, coffres, niveaux : tous les réglages
│   ├── progression.js    … et toutes les règles, en fonctions pures
│   ├── progression-ecrans.js  bandeau de ligue, coffres, probabilités, collection
│   ├── rangement-durable.js   second rangement du profil, là où la page en offre un
│   ├── render.js         Canvas 2D : sol en tronçons, entités, brouillard, minimap
│   ├── sprites.js        atlas d'illustrations, couleur d'équipe, textures de sol
│   ├── decor.js          plantation du décor (rivages, campagne)
│   ├── decor-pieces.js   table des pièces de decor.webp (générée)
│   ├── icones.js         pictogrammes vectoriels (game-icons.net)
│   ├── input.js          gestes tactiles et souris
│   ├── ui.js             HUD, sélection contextuelle, menus
│   ├── audio.js          sons générés à la volée (Web Audio)
│   ├── modele3d.js       unités 3D (milicien, villageois, archer, Arbalétrier, Archer monté, lancier, Atlante, Champion, Éclaireur, Cavalier, Bélier, Catapulte, Prêtresse, Hydre) : modèles de l'Atelier cuits en atlas
│   ├── rendu3d.js        essai « 3D en direct » : un modèle 3D rendu case par case
│   ├── main.js           écrans et boucle de jeu
│   └── vendor/           three.js réduit au nécessaire (chargé à la demande)
├── assets/               illustrations et textures (voir assets/SOURCES.md)
├── outils/3d/            chaîne des essais de 3D : rendu Blender sans écran, atlas, modèle allégé
├── icons/                icônes de l'application
├── test/                 tests (voir plus bas)
├── package.json          scripts, Playwright en dépendance de développement
├── manifest.webmanifest  installation sur l'écran d'accueil
└── sw.js                 cache hors ligne
```

Choix structurant : **la simulation ne dépend pas du navigateur**. `config`,
`utils`, `map`, `pathfinding`, `entities`, `game`, `ai`, `save` et
`progression` — ainsi que `decor` et `decor-pieces`, que le test headless
vérifie — tournent tels quels
sous Node, ce qui permet de tester des parties entières sans rendu.

La boucle est à **pas fixe** (20 ticks/s) avec rattrapage plafonné ; le rendu
tourne au rythme de l'écran (60 images/s mesurées sur mobile). Les recherches de
chemin sont mises en file avec un budget par tick pour éviter les à-coups.

## Tests

```bash
cd jeu
npm test                  # sans écran : 1 638 vérifications en dix-sept fichiers — deux IA jouent 16 minutes, sauvegarde comprise, puis les réglages d'octobre (test/reglages-*.test.js), la direction artistique (test/da-*.test.js), le classement (test/progression*.test.js, test/rangement-durable.test.js) et les trois troupes des ligues 6 à 8 (test/troupes-nouvelles.test.js)
npm run test:navigateur   # Chromium (Playwright) : 213 vérifications — chargement, gestes, rendu, images/s
```

Le test headless vérifie que l'économie tourne, que les âges sont atteints, que
des combats ont lieu et que l'état reste cohérent, puis chaque attitude, la
garnison et la cloche, la répartition des groupes, la file et l'affectation des
chantiers, la sauvegarde et la reprise à l'identique, le mode Express, le
déplacement, la récolte collée au gisement, le décor et le troupeau. Le test
navigateur vérifie qu'il n'y a aucune erreur console, que le rendu tient 30+
images/s, que les gestes (sélection, ordre, pose de bâtiment, zoom, appui long)
répondent, et contrôle les illustrations, la recoloration d'équipe, le sol, le
rivage et le décor.

Chaque bug corrigé garde son test : ceux de la relecture de septembre ont chacun
une vérification écrite à partir du script qui l'a reproduit, qui échoue sur le
code d'avant et passe après.

## Le troupeau

Des **hardes** vivent sur la carte : trois ou quatre **cochons** à six à neuf
cases de chaque Centre-Ville, et des hardes de **cerfs** loin des bases. Ils pâturent
autour de leur point d'attache, ne comptent pas dans la population et ne sont
la cible de personne d'eux-mêmes — les soldats les ignorent.

- **Le cerf se chasse** : touchez-le avec des villageois en main. Frappé, il
  détale quelques cases puis s'arrête, et le chasseur le rattrape à l'arrêt.
  Abattu, il laisse une **carcasse** de 140 de nourriture, qui ne bloque pas le
  passage ; le chasseur la dépèce sans nouvel ordre et rapporte la viande au
  dépôt le plus proche.
- **Le cochon se capture** : une unité — villageois ou soldat — qui passe à
  moins de 1,6 case le fait sien. Il cesse alors d'errer, se sélectionne et se mène au doigt comme
  une unité ; menez-le au village, puis touchez-le avec un villageois pour
  l'abattre — 100 de nourriture. Les unités adverses peuvent capturer les
  vôtres de la même façon, si aucune des vôtres ne se tient à moins de 1,6 case
  pour le garder.

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

Les **illustrations** (`assets/`, 26 fichiers, 1 445 Ko, plus 155 Ko de textures
de sol et d'eau) viennent de planches générées par l'auteur du dépôt —
personnages, bâtiments, arbres, eau, ornements, animaux —, détaillées dans
`assets/SOURCES.md`. L'interface en reprend trois : le chevalier de l'écran
d'accueil, le portrait du milicien dans le panneau de sélection, et le chevalier
à terre de l'écran de défaite. Le portrait de l'adversaire est le même fichier,
passé en rouge par rotation de teinte — plutôt qu'une seconde image à
télécharger.

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

**Le villageois travaille pour de vrai** (`villageois.webp`, 291 Ko) : quatre
orientations de marche dessinées (en diagonale, la cardinale la plus proche) et
sept poses — repos, cueillir, construire, porter, bûcheron, mineur, boucher. La
pose suit l'état de la simulation et l'outil suit le gisement : devant des baies
ou une ferme il cueille, devant un arbre il abat à la hache, devant l'or il
pioche, sur une carcasse il travaille au maillet, devant un chantier ou un
ennemi il frappe au marteau, chargé de bois il porte son rondin à l'épaule (de
profil : vers l'est ou l'ouest ; l'or, les vivres et la marche vers le nord ou
le sud gardent la marche ordinaire, la pastille dit la charge), à l'arrêt il
souffle. Les poses sont dessinées d'un seul côté et retournées en miroir quand
la cible est de l'autre ; elles se cadencent sur l'horloge, décalées par unité
pour que dix bûcherons ne frappent pas en chœur, et le port suit la distance
comme la marche. Une rangée de marche nord-est, tirée d'une planche Gemini, a
été essayée puis retirée : ses dessins mêlaient vue de face et vue de dos (voir
`assets/SOURCES.md`).

**L'éclaireur galope** (`eclaireur.webp`, 145 Ko) : huit orientations × quatre
foulées d'un cavalier à la lance, la planche lue du nord dans le sens horaire
et remise sur les secteurs du jeu. Il fait 54 px de face, un homme à pied 44 ;
la foulée suit la distance, comme toutes les marches.

**Cinq styles sont jouables** pour le milicien (le villageois : les deux
premiers), au choix dans le menu de pause :

| Style | Sprite du milicien | Ce qu'on y gagne |
| --- | --- | --- |
| **3D** (par défaut) | `modeles/milicien.json`, `modeles/villageois.json` et `modeles/archer.json` : les modèles animés de l'auteur (Atelier 3D), cuits par le jeu en atlas de cinq directions (les trois autres en miroir) au premier lancement, puis gardés en cache | Ses propres personnages, toutes leurs animations — combat, gestes de travail tournés vers leur cible, chute — sans rien dessiner |
| **Animé** | `milicien-marche.webp`, 8 images par direction | Le mouvement se lit : on voit qui avance, qui est bloqué |
| **Peint** | `chevalier.webp`, une pose par direction | Le détail de l'armure, au prix d'une silhouette figée |
| **3D précalculée** (essai) | `chevalier-3d.webp` : un modèle 3D rendu à l'avance par Blender, 8 directions × course, repos, coup d'épée | Des directions et des pas parfaitement cohérents, sans rien coûter au téléphone |
| **3D en direct** (essai) | `chevalier-3d.json` (glTF), rendu à chaque image par three.js | L'unité tourne selon sa vraie direction, pas en huit crans ; l'animation se calcule à chaque image |

**Fluidité, netteté et couleurs du style 3D.** Ce qui fait qu'un modèle cuit en
images ne paraît ni saccadé, ni flou, ni terne :

- *Positions lissées* — la simulation avance vingt fois par seconde, l'écran
  affiche soixante images : le temps d'un dessin, unités et projectiles sont
  placés entre leur position d'avant le dernier pas et l'actuelle
  (`World.lisser`, `js/game.js`). Ils glissent au lieu d'avancer par à-coups ;
  la simulation, elle, ne voit rien (les vraies positions sont remises
  aussitôt). Coups, impacts et chutes avancent eux aussi entre deux pas.
- *Une image à la fois, et assez d'images* — seize images pour un tour de
  marche, douze pour un coup ou un repos, treize pour une chute, et le rendu
  dessine la plus proche (`Renderer.poserImage3D`). Un temps, chaque image se
  fondait dans la suivante : le mouvement était continu, mais le personnage
  était en permanence la superposition de deux poses — membres dédoublés,
  contour voilé, même au repos. Sur un téléphone, ce voile se voyait plus que
  le pas d'une image à l'autre. Les gestes lents ont donc reçu plus d'images
  (cueillette quatorze, cous de l'Hydre au repos seize), les engins à l'arrêt
  une seule.
- *Une vue qui ne tremble pas* — le cap de la simulation est recalculé vingt
  fois par seconde, poussée des voisines comprise : près de la limite entre
  deux vues, une troupe en groupe sautait de l'une à l'autre à chaque pas, et
  l'œil fondait les deux silhouettes. Le cap affiché est lissé sur un dixième
  de seconde et ne change de vue qu'après avoir franchi la limite d'une
  dizaine de degrés (`Renderer.vueDe`) ; de même, une troupe arrêtée que ses
  voisines repoussent ne repasse plus à la marche (`unitAnim`). La barre de
  vie et la pastille de charge sont posées au-dessus de la tête, au pixel, et
  non plus en travers du torse.
- *Une texture lue proprement* — la texture d'un modèle de l'Atelier est un
  atlas en miettes : des centaines d'îlots serrés, la peau à côté du bronze à
  côté du bleu. Un personnage de quatre-vingts pixels la lit huit fois trop
  grande ; lue par ses niveaux réduits (le réglage par défaut de three.js),
  chaque pixel moyennait des dizaines de texels, voisins d'îlots compris, et
  toutes les couleurs tiraient vers le même brun. La cuisson la lit donc à sa
  finesse d'origine, sur un rendu quatre fois plus grand que l'atlas, puis
  réduit ce RENDU de moitié en moitié (`cuireModele`, `js/modele3d.js`).
- *Couleurs du dessin* — lumière légère (la texture porte déjà ses ombres) et
  étalonnage doux (`REGLAGE`), réglés sur un banc d'essai face aux dessins
  d'origine : même luminosité et même saturation moyennes. La caméra regarde
  les troupes de 22° au-dessus de l'horizon (les bâtiments sont dessinés de
  plus haut) : on voit un visage et un torse, pas le dessus d'un casque.
- *Pixel pour pixel sur le téléphone* — la toile du jeu suit l'écran jusqu'à
  trois pixels par point (elle était plafonnée à deux, donc étirée une fois et
  demie sur un iPhone). Le zoom de départ est calé sur un zoom « net »
  (`zoomDeDepart`, `js/main.js`) — sur un iPhone, 2/3 : une case d'atlas couvre
  exactement ses pixels d'écran. La caméra se pose sur un pixel entier de la
  toile, et troupes et bâtiments avec elle (`calerX`, `calerY`) : sol,
  bâtiments et troupes, tous à deux pixels par pixel monde, sont recopiés sans
  rééchantillonnage. Un fantassin y fait 84 vrais pixels de haut, au lieu de
  43 étirés sur 64 ; on voit dix-huit cases en largeur au lieu de vingt-quatre.
  En fin de pincement, un zoom tout proche d'un zoom net s'y cale (`calerZoom`).
- *Garde-fou de cadence* — par fenêtres de cent vingt images
  (`Renderer.surveillerCadence`) : deux fenêtres de suite sous quarante-cinq
  images par seconde, et la toile passe à deux pixels par point pour une
  fenêtre témoin (quarante images : pendant qu'elle dure, toute l'image est
  plus douce). Nettement plus rapide : on y reste, le zoom de départ se
  recale à 0,5. Pas mieux (un téléphone en économie d'énergie tourne à trente
  images par seconde quoi qu'on dessine) : on remonte à trois, et on ne
  réessaiera que si le jeu ralentit nettement. Le menu de
  pause offre aussi le choix à la main, « Finesse de l'image : Fine /
  Légère », retenu d'une partie à l'autre, et dit la finesse réellement
  affichée ; `?dpr=2` dans l'adresse l'impose pour un essai.
- *Cinq directions, trois en miroir* — sud, sud-est, est, nord-est et nord
  sont cuites ; nord-ouest, ouest et sud-ouest sont leur miroir, comme dans
  Age of Empires (un soldat tourné vers l'ouest tient donc son arme de la
  main gauche).
- *Une colonne par direction* — dans l'atlas d'une animation, chaque
  direction a sa colonne, à sa largeur, avec sa propre ancre (`recadrer`,
  `js/modele3d.js`) : un corps étendu de profil ne réserve plus sa longueur
  aux vues de face et de dos, ni une place vide de l'autre côté de ses pieds.
  Les atlas des quatorze troupes d'un camp pèsent 159 Mo — ils en pesaient
  201 avec une case commune et moins d'images, 372 en huit directions. Si la
  mémoire graphique manque quand même, la cuisson retente plus léger — la
  chute à demi-finesse, puis toute la troupe à un pixel par pixel monde —
  avant de rendre la main à l'illustration ; une cuisson allégée n'est pas
  gardée d'une partie à l'autre, et le menu de pause la signale. Le sol, lui,
  passe au niveau grossier puis à des tuiles de couleur — jamais un écran
  noir.
- *Couleur d'équipe* — reconnue à la cuisson, avant l'étalonnage, et marquée
  dans l'opacité du pixel (liseré compris) ; l'acier clair d'une lame n'en fait
  pas partie. L'atlas de l'autre camp ne se fabrique qu'à la première unité de
  ce camp à l'écran.

Les deux essais de 3D utilisent le même modèle, un chevalier libre de droits
(KayKit, CC0) en attendant celui de l'auteur, et la **même caméra** — la case
rendue en direct se pose exactement comme une case de l'atlas précalculé, et
leur éclairage est étalonné l'un sur l'autre (couleur moyenne d'une même pose à
un niveau près). En direct, chaque unité est rendue dans une case d'un canevas
WebGL hors écran au début de l'image, puis recopiée à sa place dans l'ordre du
peintre : un arbre ou un toit devant elle la cache toujours. three.js (614 Ko)
et le modèle (527 Ko, 220 compressés) ne se téléchargent que si l'on choisit ce style ; sans
WebGL, l'atlas précalculé le remplace. Le détail de la chaîne est dans
`assets/SOURCES.md`.

Le choix est retenu d'un lancement à l'autre. Sans service worker, l'atlas
peint n'est téléchargé que si on choisit ce style — l'animé, style par défaut,
l'est toujours ; une fois le jeu installé, le service worker garde les deux pour
le hors-ligne (107 Ko à eux deux), l'atlas de la 3D précalculée avec eux
(406 Ko), three.js et le modèle au premier usage. Le verdict à
l'écran est net : **la marche dessinée l'emporte**. À la taille d'une unité, ce
qui se lit n'est pas le détail d'un personnage mais son mouvement ; la peinture
réduite devient une tache sombre. Elle garde sa place là où elle est vue en
grand — accueil, portrait, écran de fin.

### Douze bâtiments illustrés, un palais en tête

Tous les bâtiments portent une illustration (`assets/*.webp`, 491 Ko pour les
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

Cinq textures de sol (`assets/sol-*.webp`, 155 Ko) — herbe, herbe sombre,
terre, sable et eau. Elles sont traitées
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
traverse un rocher, et une partie reprise retrouve son décor. Rochers, amas,
roseaux, buissons, fougères, agaves et pampas entrent dans l'ordre du peintre
avec les unités ; le reste — galets, nénuphars, fleurs, touffes, couvre-sol —
est cuit dans les tronçons de sol mis en cache, et ne coûte rien à chaque
image.

Le sol est **pré-rendu par tronçons** de 8×8 cases dans des canvas hors écran
mis en cache (le terrain ne change presque jamais — un gisement d'or épuisé
laisse de la terre, et les tronçons qui couvrent la case sont refaits —, le
brouillard se peint par-dessus) :
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
ou un rocher d'or déborde à peine de sa case. Plus hauts que leur case, ils entrent dans l'**ordre du peintre** avec les
unités et les bâtiments : une unité passe derrière un arbre quand elle est
derrière, devant quand elle est devant. Un gisement qui s'épuise rapetisse un
peu — de loin, on voit ce qu'il reste. Le gisement d'or (`or.webp`, 10 Ko) suit
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
difficulté, tailles de carte, animaux, **formats de partie** (`GAME_MODES`) et
**vitesses** (`GAME_SPEEDS`). Restent codés ailleurs : l'effet des technologies
(`game.js`, `applyTech`), la taille et la distance des hardes (`game.js`,
`spawnHerds`), le rayon de capture d'un cochon (`entities.js`), le barème du
score (`game.js`, `score`) et le rythme des vagues de l'IA (`ai.js`).

## La sauvegarde, en deux mots

`js/save.js` ne stocke **pas la carte** : il stocke sa *graine*. La génération
étant déterministe, il suffit de rejouer ce qui a changé depuis — les gisements
épuisés, ce qu'il reste dans les autres, ceux marqués injoignables et les
carcasses nées en cours de partie. Le reste (joueurs, unités et animaux avec
leur pâture, bâtiments et ralliements, flèches en vol, IA, brouillard exploré,
file des demandes de trajet, état des générateurs aléatoires, minuteries
internes) est repris champ par champ.

C'est exigeant, et c'est vérifié comme tel : le test compare une partie qui
continue avec la même partie sauvegardée puis rechargée, et exige que les deux
restent **rigoureusement identiques** 60 secondes plus tard — positions au
centième de pixel, points de vie, contenu des gisements, décisions de l'IA. Un
seul champ oublié fait diverger les deux parties et échouer le test.

Une sauvegarde fait quelques dizaines de kilo-octets en début de partie, de 120
à 160 Ko après un quart d'heure ou une demi-heure, et vit dans `localStorage`, sous la clé
`aem.partie`. Un numéro de version accompagne le format : une sauvegarde
plus ancienne est refusée plutôt que relue de travers.
