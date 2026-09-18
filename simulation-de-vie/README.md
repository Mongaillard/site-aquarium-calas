# Simulation de vie

Monde 2D sans limite, généré au fil des explorations, peuplé de personnages autonomes, chacun
doté d'une identité et d'une IA propres. La spécification complète est dans [`PROTOCOLE.md`](./PROTOCOLE.md) ; l'avancement
par phase est dans [`CHANGELOG.md`](./CHANGELOG.md) ; la suite prévue (huit jalons de réalisme)
est dans [`FEUILLE_DE_ROUTE.md`](./FEUILLE_DE_ROUTE.md).

## Démarrage

```bash
pnpm install
pnpm check          # typecheck + lint + format + tests
pnpm sim run --seed 42 --days 30 --ressources
pnpm sim run --seed 42 --days 30 --sans-carte --inspect p-0001 --journal journal/evenements.ndjson
```

`pnpm sim run` génère un monde, affiche en ASCII la zone autour du berceau (`--rayon`, 48 par
défaut) avec sa distribution de biomes et son empreinte, puis fait avancer l'horloge du nombre
de jours demandé. Le monde n'a pas de bords : il est découpé en morceaux de 32 × 32 tuiles créés
à la demande, toujours identiques pour une même graine, et il grandit avec les explorations.

## Interface d'observation

```bash
pnpm serve -- --seed 42 --jours 30 --vitesse 4   # http://localhost:8080
```

Le serveur fait tourner la simulation en temps réel (vitesse réglable depuis l'interface) et la
diffuse par WebSocket. La page montre la carte illustrée et animée (biomes, arbres, gisements,
huttes et maisons, feux, personnages dessinés aux couleurs de leur famille qui marchent d'une
case à l'autre, bulles de dialogue, jour / nuit) et cinq panneaux :
Personnage (pensée, besoins, famille, relations, souvenirs), Journal, Conversations,
Statistiques, Population. Cliquez sur un personnage ou un bâtiment pour l'inspecter, appuyez
sur `s` pour que la caméra suive le personnage sélectionné.

**L'interface (M29).** La carte prend tout l'écran ; tout le reste flotte dessus. En haut, une
seule barre : menu ☰ (nouveau monde, sauvegardes, pas à pas, vitesses, lois, plein écran),
pause, vitesse, date et météo, mode Dieu ✨, volet 📋. Le volet à droite porte les onglets
(Personnage, Journal, Population, Village, Statistiques, Buts, Légendes, Conversations) ; une
sélection sur la carte l'ouvre, ✕ ou Échap le ferme. Le fil des grands événements tient sur
deux lignes (une sur téléphone), la légende attend derrière « ? ». Sur téléphone, une barre de
navigation en bas (Carte, Personnage, Journal, Village, Plus) ouvre un onglet à la fois en
plein écran, façon appli.

**L'eau (M30).** L'eau peu profonde ne se passe plus à pied : à **gué** (des lignes de pierres
rares, posées à la génération là où un banc est étroit), en **pirogue** (une invention : son
porteur traverse toute eau), ou de **port** à port (un bâtiment de rive, réservé à qui maîtrise
la pirogue ; entre deux ports, tout le monde traverse en barque). La pêche se lance à deux tuiles
de la rive.

Quand un personnage est à court d'idées (faim ou froid qui dure, échecs répétés, besoin sans
idée, aucun projet), il pose une question dans un catalogue fermé (une invention à chercher, un
bâtiment, une leçon, une priorité, une direction) : **une option est tirée au sort** (M28 : la
page ne sollicite plus Claude, ça coûtait trop de crédit, et ne fait pas choisir l'observateur,
ça encombrait l'écran). Le moteur applique le choix et suit l'**ambition** qui en naît (fiche,
onglet Statistiques « Où ils vont », Journal). Le bouton « Demander conseil » d'une fiche fait
poser la question tout de suite.

Le bouton « ✨ Dieu » (touche `g`) ouvre une barre de pouvoirs : Ondée, Éclaircie, Sève,
Souffle, Main qui guérit, Braise, Foudre, Songe, Regard, payés en faveur (✦) gagnée chaque jour
et quand la colonie prospère. Un pouvoir armé se pose d'un clic (ou d'un appui long, sur
mobile) sur une tuile connue, une personne ou un bâtiment ; les personnages interprètent le
miracle, ils n'obéissent pas. Chacun a une **foi** : qui croit prie le ciel quand ça va mal
(les prières en attente s'affichent en mode Dieu, avec les pouvoirs qui les exaucent), une
famille croyante bâtit un autel où laisser des offrandes, et la réputation du dieu décide si
l'on voit sa main ou le hasard dans ce qui arrive. Le bouton « 🙏 auto » (providence) laisse le
ciel répondre de lui-même aux prières tant que la faveur le permet. Les épreuves lourdes (gel,
sécheresse, fièvre, secousse) et l'Épiphanie complètent le catalogue ; la foi moyenne fait un
culte qui relève la faveur, et trois leçons (le ciel écoute, le ciel frappe, ne pas attendre le
ciel) se retiennent des prières. Le bouton « ⛶ » (touche `p`) met la carte en plein écran avec
les commandes en menus flottants.

**Le jeu du ciel (M25).** Dans la barre du mode Dieu, une seconde palette **sculpte le monde**
(terre, eau, forêt, montagne, sable ; rayon réglable ; glisser pour peindre) et **pose des
peuples** (gratuit dans un monde vide, 25 ✦ ensuite). Le formulaire « Nouveau monde » propose
des **peuples rivaux** (1 à 4), un **monde vierge** (personne au départ : sculptez, puis posez
votre peuple où vous voulez) et un **domaine du ciel** — Moisson, Orage, Feu, Songes — qui
rend ses pouvoirs favoris moins chers et plus tôt, ceux du domaine opposé plus chers et plus
tard, ouvre les paliers de pouvoirs au fil du rang (culte, âge du cuivre), fait payer chaque
usage un peu plus cher dans la saison, et donne deux **créatures** (un gardien à poster, un
fléau à lâcher ; rang 2). Le bouton « ⚖️ Lois » (touche `l`) suspend la faim, les maladies, les
bêtes, les raids, les schismes, la vieillesse ou le conteur. Les **calques** (touche `c`) colorent la carte
par village, famille, foi ou vivres ; le **fil** des grands événements et le bouton 📍 du
journal mènent sur place ; l'onglet Population dessine les **arbres des familles**. Le
**conteur** (pastille 🎭) rythme le monde — calme, montée, crise, répit — et lit au joueur la
**chronique** de chaque année passée.

**Des buts (M26).** L'onglet « Buts » suit vingt **succès**, le **scénario** choisi au
formulaire (« but » : passez l'an dix, le cuivre avant l'an cinq, faites naître une légende,
trois villages en paix, cent âmes) et les **prophéties** que le ciel formule pour la saison
(accomplies, elles rapportent de la faveur). La simulation tourne dans un **Web Worker** : la
page reste fluide à deux cents habitants (quatre peuples de quarante-huit, chacun son berceau).

**De vraies tuiles (M27).** Pins, pommiers, buissons à baies, tas de pierre et d'argile, amas de
gemmes et mousserons viennent de deux planches CC0 de Kenney (domaine public, aucune attribution
requise ; voir `packages/viewer/src/assets/tuiles/CREDITS.md`) plutôt que d'un dessin vectoriel ;
gisements sans icône nette (poisson, gibier, fibres) restent en vectoriel. La page publiée reste
un fichier unique : les planches s'embarquent en URL `data:`, sans image externe à charger.

**La guerre se voit (M32).** Une guerre entre villages ne se règle plus hors écran : à
l'aube, une **troupe** se lève et marche sur le village ennemi, l'alarme lève les défenseurs,
et le combat se joue sur la carte, coup par coup — **barres de vie**, élans et impacts,
chiffres de dégâts, blessés qui se retirent, morts rares — avec une **jauge de bataille** en
haut de l'écran. Le village pris perd des vivres, la rancune monte, et la paix se fait au
prix du sang. Les **raids** de pillards et les **attaques de loups** se jouent de la même façon,
sur la carte, et un raid repoussé ne pille rien. Pour en voir tout de suite : `?peuples=2&guerre`
ou `?raid`. Le ciel a prise dessus (M33) : **⚔️ Sonner la guerre** lance le village visé contre
son pire voisin, **🕊️ Apaiser** arrête la bataille en cours ou fait la paix, la **Foudre** frappe
les combattants sur le champ, un **Gardien** repousse pillards et loups, et la loi « Les
guerres » suspend tout cela. Chaque village porte un **écusson** (couleur et emblème : devant
son nom, en bannière à son centre, en fanion sur ses maisons), et quand une bataille commence la
caméra y file avec une seconde de pause (M34, case « caméra sur les batailles » du menu). Une
victoire compte (M35) : le village pris perd la moitié de ses vivres et ses outils, que les
vainqueurs rapportent ; s'il est deux fois plus faible, il est **conquis** — ses familles
rejoignent le vainqueur et son village disparaît (une conquête par an au plus). Mais les
conquis gardent **rancune** (M37) : le panneau Villages les liste, et au bout de soixante jours,
si la tension monte ou s'ils pèsent assez, ils se **révoltent** et repartent reprendre leur ancien
village — guerre en vue avec le vainqueur.

**Les inventions sans catalogue (M38).** Le moteur ne connaît plus aucune invention : il connaît
une grammaire. Une trouvaille est un triplet **matière × procédé × fonction** dont il déduit le
nom, la recette et l'effet. Les personnages ne suivent aucun plan : le moteur mesure ce qui va
mal autour d'eux (on gèle, les vivres pourrissent, le gibier fuit, la roche ne cède pas), en
déduit la fonction qui manque, et le soir un esprit curieux la croise avec une matière qu'il
connaît et un procédé qu'il maîtrise. Il essaie ; un prototype sur trois rate ; quand ça tient,
sa famille l'apprend et le dialogue la répand. **Les matières elles-mêmes se dérivent** : au four,
allier ce qui fond donne du bronze, puis du laiton, du fer, de l'acier, puis des métaux qui n'ont
jamais existé — la chaîne n'a pas de fin, donc l'arbre des inventions non plus. L'onglet
**Inventions** montre tout : l'arbre des matières, ce que chaque trouvaille change, l'ennui qui
l'a fait naître, qui l'a trouvée et combien de prototypes ont raté.

**Le moteur sans écran, et le moment qu'on va regarder (M45).** Un onglet de navigateur ne fait
pas traverser les âges à un monde : il ralentit en arrière-plan et on ne le laisse pas tourner la
nuit. `sim traverser --seed 5 --annees 40 --tous-les 120 --dossier ma-chronique` fait tourner le
monde sans écran et **sème des instantanés** — un fichier par moment, comprimé (1,1 Mo au lieu de
10,9), plus un `chronique.json` qui les recense, et une ligne de compte rendu à chaque fois. Un
instantané n'est pas une image : c'est une partie. La boîte « Sauvegardes » du viewer sait
désormais **ouvrir un fichier** et **exporter la partie**, si bien qu'on lance quarante ans la
nuit et qu'on va regarder au matin le moment qui intrigue — puis qu'on le continue. Au passage :
l'année du jeu fait **cent vingt jours** (quatre saisons de trente), ce que la commande comptait
d'abord mal ; les mesures des jalons précédents, comptées en jours, sont réécrites en jours.

**Le grain, et l'agriculture qui sert enfin à quelque chose (M44).** Un champ mûr donnait
vingt-quatre baies une fois l'an — sept jours de vivres pour une personne, quand un village de
seize en consomme l'équivalent de six mille. Les graines ne venaient que d'une chance sur dix en
cueillant des baies, que personne ne cueillait puisque le poisson nourrit mieux : **le poisson
faisait 96 % des vivres et il n'y avait zéro à deux champs par monde**. Désormais la prairie porte
des **céréales sauvages** qu'on cueille avant de les semer, le **grain se mange** (trente points,
et il se garde trois cents jours — la seule nourriture qui passe l'hiver, et la seule qu'on doive
choisir entre manger et semer), un champ rend **trois cents unités** au lieu de vingt-quatre, une
famille cultive **autant de champs que de bouches à nourrir**, et un champ mûr passe devant le
poisson quand on cherche à manger. Résultat mesuré : quinze à vingt-deux champs par monde, le
grain fait **45 à 77 %** des vivres, et sur mille huit cents jours la population passe d'un plateau à
vingt-quatre à **trente-trois et encore en hausse**.

**On ne gèle plus en route (M43).** Les vingt-sept morts de froid mesurés étaient tous
« éveillés, dehors », souvent avec vingt couchages libres à la maison : on rentrait sous 25 points
de chaleur que l'abri soit à deux pas ou à vingt, alors qu'une nuit d'hiver coûte un point par pas.
Le seuil d'alerte vise maintenant **le coût du trajet**, le cerveau sait **à combien de pas** est
la chaleur la plus proche (au lieu de se demander s'il existe un feu quelque part dans le monde),
et faute d'abri comme de feu on **allume un feu là où l'on est** plutôt que de geler avec le bois
dans les bras. Sur douze mondes de trois cent soixante jours : **169 survivants au lieu de 146, un
seul monde éteint au lieu de trois, et les morts de froid passent de 27 à 15.**

**On ne meurt plus de soif au bord d'un lac (M42).** Un monde sur trois s'éteignait, et la soif
était le premier tueur. Elle ne tenait pas à l'équilibrage : un lieu mémorisé ne portait qu'une
ressource, et comme un bord de lac porte presque toujours un banc de poisson, la tuile était
retenue comme « poisson » et jamais comme « eau » — on mourait de soif à **quatre tuiles** d'un
lac, après deux cents tentatives de boire refusées faute de « point d'eau connu ». Un lieu connu
porte maintenant un drapeau « c'est de l'eau » en plus de ce qu'il donne, et un point d'eau ne
s'oublie plus jamais. Quant au puits, il ne se décidait qu'après avoir enterré quelqu'un mort de
soif : une famille le creuse désormais dès que l'eau est à plus de douze tuiles, et chaque
quartier peut avoir le sien. Sur douze mondes de trois cent soixante jours : **146 survivants au
lieu de 101, neuf morts de soif au lieu de trente-huit.**

**Les idées aboutissent, et le mur ferme vraiment (M41).** L'onglet Inventions se remplissait
d'idées que personne n'essayait jamais. On va désormais **chercher au stock de la famille** ce
qui manque à sa propre idée — mais seulement quand on ne manque de rien soi-même —, une idée vit
**trois mois** au lieu d'un, à gain proche on préfère ce qu'on peut vraiment réunir, et le
registre oublie à l'aube ce dont plus personne ne se souvient. Sur huit mondes de deux cent
quarante jours, quatre trouvailles réussies deviennent quatre-vingt-huit. Côté défense, les
palissades se dressaient depuis M39a mais **pas une n'enclosait quoi que ce soit** : le rayon de
la fouille était plus petit que l'enceinte, le rattrapage d'une tuile de bord se faisait en
diagonale et la détachait de ses voisines, une souche sur le tracé faisait un trou, et un marais
se traversait sans se bâtir. Tout cela est corrigé, et l'on peut maintenant **assécher un
marais** comme on ouvre un coin de forêt. Un anneau achevé enclot désormais tous les abris qu'il
entoure.

**Les champs poussent, les bêtes ont une allure, les murs entourent le village (M39).** L'enceinte
de pieux se centre désormais sur le **village** et son tracé est figé une fois choisi : elle ne
s'égrène plus en anneaux empilés, elle se raccorde d'un pan à l'autre, et on y taille un
**portail** du côté de l'eau. Les **enclos** sont de vrais parcs clos, avec portillon et
mangeoire, posés là où il y a de la place, et les bêtes se tiennent dedans. Les **champs
poussent** sous les yeux (sol labouré, pousse, jeune plant, plante mûre) et chacun cultive autre
chose que son voisin. Chaque **espèce a sa silhouette** : mouton et vache viennent de la planche
_Tiny Farm_ de Kenney, le cerf, le sanglier, le lièvre et le loup sont dessinés. Les boutons d'icônes et les jauges
portent des cadres de pixels (_UI Pack Pixel Adventure_). Et l'on peut enfin **défricher** :
quand il n'y a plus de place à bâtir, on arrache la souche ou le tas de pierres qui occupe une
tuile, et un coin de forêt s'ouvre en prairie — un village grandit désormais sur la forêt au
lieu de s'arrêter devant elle. Enfin (M40), le **gardien du ciel** est un homme d'armes casqué
et le **fléau** un spectre, là où ils n'étaient que des emojis, et les **pillards** portent le
casque à cornes au lieu d'être des villageois teints en gris.

**Bâtiments et personnages en sprites (M31).** Deux planches CC0 de Kenney de plus : tente,
maisons, grange, four, fumoir, puits et sanctuaire viennent de _Medieval RTS_ ; chaque personnage
se compose en couches de _Roguelike Characters_ — corps par teint, tunique teintée à la couleur
de sa famille, cheveux et coiffure, et l'outil qu'il tient (hache, pioche, lance, arc, canne,
marteau) selon ce qu'il fait et ce qu'il porte. Les malades pâlissent, les bannis s'éteignent,
les dormeurs se couchent.

Chaque décès laisse une leçon : la famille et les témoins retiennent une morale (gravée sur la
tombe) qui change leurs décisions et se transmet par le dialogue. Un besoin répété et de la
curiosité donnent des idées, puis des inventions (filet, piège, arc, pirogue, traîneau, fumoir,
couche de fibres, vêtement de cuir, osselets, flûte) que la colonie apprend à faire. Les corps se blessent, se fatiguent, se soignent (bandage, cataplasme, attelle) et vieillissent : la fiche a ses sections « Corps » et « Humeur », et un personnage blessé porte un bandeau rouge. La faune vit : troupeaux de cerfs, sangliers, mouflons, lièvres et aurochs, meutes de loups, chasse à la lance, à l'arc ou en battue, forêt et pêche qui s'épuisent et se régénèrent. La nuit menace : des meutes affamées rôdent, laissent des traces, attaquent l'isolé ou l'enfant ; l'alarme fait fuir à l'abri, les armés défendent, le combat se résout en six rounds, et les leçons mènent aux enceintes de pieux et au veilleur de nuit. Le temps compte : la nourriture se gâte (le froid, l'entrepôt et le fumoir conservent), les feux brûlent leurs bûches, les outils se réparent, l'eau se souille près des tombes, et quatre maladies circulent, dont une toux contagieuse. Le village apprivoise : une corde et une chasse ramènent un mouflon, l'enclos donne lait, laine et petits, les graines des baies font des champs qui mûrissent à l'automne, et la pratique donne un métier. L'onglet Statistiques liste les savoirs du village, la fiche d'un
personnage ce qu'il a retenu.

Un brouillard d'exploration couvre ce que la colonie n'a jamais vu : au départ, seul un halo
autour de chaque personnage est visible, et la carte se dévoile au fil des explorations. La
touche `b` (ou la case de la légende) l'enlève ; l'onglet Statistiques indique la part du monde
découverte.

Sauvegarde (mode local et page publiée) : le bouton « 💾 » sauve la partie sous un nom, la
reprend ou la supprime ; la page sauvegarde toute seule toutes les vingt secondes, à chaque aube,
dès qu'on met en pause et quand elle passe à l'arrière-plan, puis reprend la partie d'elle-même au
chargement suivant (sauf si l'adresse impose une graine, ou après douze heures : elle propose
alors « ↩ Reprendre la partie »). Tout est rangé compressé dans le navigateur (IndexedDB), propre
à l'appareil ; la sauvegarde de sortie part sans attendre, et une partie avancée est mise à
l'abri sous son nom avant qu'un nouveau monde ne remplace la sauvegarde automatique. Sur
claude.ai, les sauvegardes partent aussi dans la base de l'artefact (☁), qui survit au
navigateur et à l'appareil : la boîte 💾 liste les deux sources et la plus récente reprend. Une
sauvegarde s'encode par petites tranches entre deux images (le monde attend le temps de
l'encodage, rien ne gèle, même à cent habitants). Un monde restauré continue exactement comme l'original. Sur mobile, un doigt qui
tire en butée ne recharge plus la page.

Pour développer le viewer avec rechargement à chaud : lancez le serveur (`pnpm --filter
@sdv/server start -- --seed 42`) puis `pnpm viewer:dev` (http://localhost:5173).

Village (jalon 13) : l'onglet « Village » montre la tension, les coutumes nées des leçons, les
notables (étoile sur la carte), les factions, les griefs jugés à la veillée, les décisions prises
ensemble, les alliances par mariage et les lieux interdits (hachurés sur la carte). Le soir, un
cercle de lumière marque la veillée autour du feu. La fiche d'un personnage dit son prestige, son
maître, son exil et ses rancunes.

Psyché et mémoire (jalon 14) : la fiche montre le stress, le sens, l'ennui, l'objectif de la
saison, les attachements, les lieux évités, les deuils, la dérive du caractère et le dernier
rêve ; les souvenirs de rêve et les souvenirs que la mémoire a réécrits sont marqués. L'onglet
« Légendes » rassemble ce que le village se raconte aux veillées (avec les faits d'origine), les
lieux nommés (aussi écrits sur la carte) et les proverbes nés des coutumes.

Le monde s'élargit (jalon 15) : un schisme fonde un second village à soixante tuiles (son nom
sur la carte), des bandes rôdent autour des stocks pleins, des caravanes tracent des routes en
pointillé et font voyager les inventions, et les villages s'allient ou se font une guerre bornée
à deux batailles. Tout cela se lit dans l'onglet « Village », section « Villages ».

### Sans serveur (mobile, page publiée)

```bash
pnpm --filter @sdv/viewer build:local   # fichiers autonomes dans packages/viewer/dist-local/
```

Dans ce mode la simulation tourne dans la page elle-même : la même interface, les mêmes
messages, aucun serveur. Ajoutez `?seed=123&jours=40&population=24` à l'URL pour choisir la
graine, le nombre de jours simulés avant l'affichage et les habitants au départ (12, 24, 36 ou
48 : le berceau gagne des mares et des gisements à proportion), `&peuples=3` pour des peuples
rivaux, `&vierge` pour un monde sans personne, `&domaine=orage` pour le domaine du ciel, ou
changez tout cela directement dans la barre (« Nouveau monde »). Une colonie nombreuse ralentit la
simulation plutôt que la page : la vitesse effective s'affiche alors à côté de l'horloge. Sur un écran tactile : un doigt pour déplacer la carte, deux pour zoomer,
toucher un personnage ou un bâtiment pour l'inspecter, bouton « ? » pour la légende, « ⋯ » pour
la graine et les sauvegardes, poignée « ▾ » pour replier ou agrandir le panneau du bas. La page
servie par `pnpm serve` accepte aussi `?local` pour basculer dans ce mode.

### Application installable, itch.io

La page autonome (`build:local`) est une application web installable : manifeste, icône et
service worker (hors ligne, quand elle est servie en https). `pnpm --filter @sdv/viewer dist:itch`
produit `packages/viewer/simulation-de-vie-itch.zip`, à téléverser tel quel sur itch.io
(projet HTML, `index.html` à la racine, « mobile friendly » coché, plein écran conseillé).
Pour Steam, le même dossier s'emballe avec Tauri ou Electron.

## Structure

```
packages/core/src
  monde/        grille, génération, biomes, ressources, horloge, météo, recettes, bâtiments, faune, danger, village, divin (mode Dieu), terrain (pinceaux), creatures, conteur, objectifs (buts)
  agents/       identité, génome et héritage, besoins, inventaire, compétences, population, cycle de vie
  actions/      types d'actions et d'intentions, A*, planificateur, exécuteur
  cerveau/      interface Cerveau, perception, RuleBrain (règles), conseil (demander conseil)
  memoire/      flux de souvenirs, mise en mots des événements, réflexion du soir
  social/       relations, dialogues à gabarits, échanges et vol, couples
  genealogie.ts arbre des filiations et des unions
  evenements/   journal d'événements
  simulation.ts boucle principale
packages/cli        commande `sim`
packages/protocole  messages serveur ↔ viewer
packages/server     serveur temps réel (WebSocket + fichiers statiques), commande `sim-serve`
packages/viewer     interface web (Vite, canvas 2D)
```

Le moteur ne dépend d'aucun service réseau : les demandes de conseil produisent un catalogue
d'options que quelque chose d'extérieur choisit (depuis M28, l'observateur ou un tirage au sort
côté page), via l'interface `Cerveau`.

## Scripts

| Commande                            | Effet                                 |
| ----------------------------------- | ------------------------------------- |
| `pnpm typecheck`                    | `tsc -b` sur tous les paquets         |
| `pnpm lint`                         | ESLint (règles strictes type-checked) |
| `pnpm format` / `pnpm format:check` | Prettier                              |
| `pnpm test`                         | Vitest                                |
| `pnpm check`                        | tout ce qui précède, dans l'ordre     |
