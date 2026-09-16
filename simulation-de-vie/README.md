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

Sur la page publiée sur claude.ai, le bouton « 🧠 Claude » laisse Claude écrire, sur le compte de
la personne qui regarde (aucune clé ni facture à part), la pensée du personnage sélectionné,
l'épitaphe des défunts et le récit des inventions ; le moteur reste maître de ce qu'il applique.
Le bouton « 💬 Conseils » va plus loin : quand un personnage est à court d'idées (faim ou froid
qui dure, échecs répétés, besoin sans idée, aucun projet), il pose une question à Claude, qui
choisit dans un catalogue fermé (une invention à chercher, un bâtiment, une leçon, une
priorité, une direction) ; le moteur applique ce choix et suit l'**ambition** qui en naît
(fiche, onglet Statistiques « Où ils vont », Journal). Le bouton « Demander conseil » d'une
fiche fait poser la question tout de suite.

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

## Structure

```
packages/core/src
  monde/        grille, génération, biomes, ressources, horloge, météo, recettes, bâtiments, faune, danger, village, divin (mode Dieu), terrain (pinceaux), creatures, conteur
  agents/       identité, génome et héritage, besoins, inventaire, compétences, population, cycle de vie
  actions/      types d'actions et d'intentions, A*, planificateur, exécuteur
  cerveau/      interface Cerveau, perception, RuleBrain (règles), conseil (demander à Claude)
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

Le moteur ne dépend d'aucun service réseau ; le cerveau Claude (phase M5) sera un paquet
séparé qui s'y branche via l'interface `Cerveau`.

## Scripts

| Commande                            | Effet                                 |
| ----------------------------------- | ------------------------------------- |
| `pnpm typecheck`                    | `tsc -b` sur tous les paquets         |
| `pnpm lint`                         | ESLint (règles strictes type-checked) |
| `pnpm format` / `pnpm format:check` | Prettier                              |
| `pnpm test`                         | Vitest                                |
| `pnpm check`                        | tout ce qui précède, dans l'ordre     |
