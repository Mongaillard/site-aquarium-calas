# Protocole : Simulation de vie avec personnages à IA individuelle

> Document de spécification destiné à être remis tel quel à Claude Code.
> Il décrit **quoi** construire, **comment** l'architecturer et **dans quel ordre**.
> La commande de lancement à copier-coller se trouve en **Annexe A**.

---

## 0. Comment utiliser ce protocole

1. Créer un dépôt vide (ou un dossier vide) pour la simulation.
2. Y copier ce fichier à la racine sous le nom `PROTOCOLE.md`.
3. Ouvrir Claude Code dans ce dossier et lui donner le prompt de l'Annexe A.
4. Claude Code doit avancer **phase par phase** (section 15). Chaque phase se termine par
   des tests qui passent et un commit. On ne commence pas la phase N+1 tant que la
   définition de « fait » de la phase N n'est pas remplie.
5. Les choix marqués **[DÉCISION]** sont des valeurs par défaut que vous pouvez changer
   avant de lancer. Tout le reste est contractuel.

---

## 1. Vision et principes

**Objectif.** Un monde 2D persistant dans lequel vivent des personnages autonomes.
Chaque personnage possède :

- une **identité propre** (nom, personnalité, valeurs, histoire, apparence, génétique) ;
- une **IA propre** : ses décisions sont prises par un « cerveau » qui lui appartient,
  nourri par sa propre mémoire, ses propres relations et son propre caractère ;
- un **corps** avec des besoins (faim, soif, sommeil, chaleur, santé, moral) ;
- la capacité de **récolter des ressources**, **fabriquer**, **construire des habitations**,
  **parler**, **s'associer**, **se reproduire**, vieillir et mourir.

L'observateur (vous) regarde le monde évoluer, peut inspecter n'importe quel personnage,
lire ses pensées, son journal, ses relations, et peut mettre la simulation en pause,
l'accélérer ou la rejouer depuis une sauvegarde.

**Principes non négociables.**

| # | Principe | Conséquence concrète |
|---|----------|----------------------|
| P1 | Déterminisme du moteur | Même graine + mêmes décisions IA = même monde. Le RNG est seedé et centralisé. |
| P2 | Séparation moteur / cerveau | Le moteur ne sait pas ce qu'est un LLM. Le cerveau ne modifie jamais l'état du monde directement : il **propose des actions**, le moteur les **valide et les exécute**. |
| P3 | Un cerveau par personnage | Pas de « narrateur » qui décide pour tout le monde. Chaque appel IA reçoit uniquement ce que ce personnage sait. |
| P4 | Mode dégradé obligatoire | La simulation doit tourner sans clé API (cerveau à règles). Le LLM est un **niveau supérieur** de décision, pas une dépendance dure. |
| P5 | Tout est observable | Chaque décision, action, pensée et événement est journalisé et consultable. |
| P6 | Coût maîtrisé | Le nombre d'appels IA par personnage et par jour simulé est borné et configurable. |

---

## 2. Glossaire

| Terme | Définition |
|-------|------------|
| **Tick** | Unité de temps du moteur. **[DÉCISION]** 1 tick = 10 minutes de jeu → 144 ticks par jour. |
| **Monde** | Grille 2D de tuiles + entités + horloge + météo. |
| **Tuile** | Case du monde (biome, ressource éventuelle, bâtiment éventuel, occupants). |
| **Entité** | Tout objet ayant un identifiant : personnage, bâtiment, gisement, objet posé. |
| **Personnage** (agent) | Entité vivante dotée d'un corps, d'une identité et d'un cerveau. |
| **Cerveau** | Composant qui, à partir d'une perception, choisit une intention. Deux implémentations : `RuleBrain` (règles) et `LLMBrain` (Claude). |
| **Intention** | Objectif de haut niveau choisi par le cerveau (« construire un abri près de la rivière »). |
| **Plan** | Suite ordonnée d'actions atomiques réalisant une intention. |
| **Action** | Opération atomique validée et exécutée par le moteur en N ticks (`Move`, `Gather`, `Build`, `Talk`…). |
| **Perception** | Vue partielle du monde depuis les yeux d'un personnage (rayon de vision, souvenirs). |
| **Souvenir** | Entrée de la mémoire d'un personnage, horodatée, avec un score d'importance. |
| **Réflexion** | Souvenir de haut niveau synthétisé par le cerveau à partir de plusieurs souvenirs. |
| **Événement** | Fait produit par le moteur (naissance, mort, construction terminée…), journalisé et perceptible. |

---

## 3. Architecture globale

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VIEWER (navigateur)                          │
│  carte · inspecteur de personnage · journal · contrôles de temps     │
└───────────────▲───────────────────────────────────────▲──────────────┘
                │ WebSocket (état, événements)          │ commandes
┌───────────────┴───────────────────────────────────────┴──────────────┐
│                          SERVEUR DE SIMULATION                        │
│                                                                       │
│   ┌──────────────┐    perception     ┌───────────────────────────┐    │
│   │              │ ────────────────► │   CERVEAUX (1 par agent)  │    │
│   │   MOTEUR     │                   │  RuleBrain  │  LLMBrain   │    │
│   │ (déterministe│ ◄──────────────── │   (règles)  │  (Claude)   │    │
│   │  seedé)      │    intention      └─────────────┴─────────────┘    │
│   │              │                                                    │
│   │ monde·corps· │    ┌────────────┐   ┌──────────────┐               │
│   │ actions·     │◄──►│  MÉMOIRE   │   │ PERSISTANCE  │               │
│   │ événements   │    │ par agent  │   │ snapshots +  │               │
│   └──────────────┘    └────────────┘   │ journal NDJSON│               │
│                                        └──────────────┘               │
└───────────────────────────────────────────────────────────────────────┘
```

**Boucle principale (par tick).**

1. Avancer l'horloge, appliquer la météo et la régénération des ressources.
2. Pour chaque personnage vivant : mettre à jour le corps (besoins, âge, santé).
3. Pour chaque personnage sans action en cours ou dont le plan est invalidé :
   construire sa **perception**, demander une **intention** à son cerveau
   (synchrone pour `RuleBrain`, asynchrone pour `LLMBrain` : en attendant la
   réponse, le personnage exécute une action de repli fournie par `RuleBrain`).
4. Convertir l'intention en plan, exécuter la prochaine action du plan.
5. Résoudre les interactions (conversations, échanges, conflits, reproduction).
6. Émettre les événements, alimenter les mémoires des témoins, journaliser.
7. Tous les N ticks : snapshot de sauvegarde.

**Ordre d'itération.** Les personnages sont traités dans l'ordre de leur identifiant,
puis mélangés avec le RNG seedé du tick pour éviter un biais systématique. Cet ordre est
reproductible (P1).

---

## 4. Le monde

### 4.1 Grille et biomes

- Grille de tuiles **sans limite** : le monde est découpé en morceaux de 32 × 32 tuiles,
  générés à la demande dès qu'un personnage (ou un calcul de chemin) s'en approche, et il
  grandit avec les explorations. Coordonnées négatives comprises ; l'origine (0, 0) est le
  berceau de la colonie. **[DÉCISION]** Chaque morceau ne dépend que de la graine et de ses
  coordonnées : l'ordre d'exploration ne change jamais le monde.
- Génération procédurale par bruit (simplex) seedé : un bruit lent pour les continents et les
  mers, un plus fin pour le relief, un troisième pour l'humidité → altitude, humidité → biome.
  Un « berceau » garantit à l'origine de la terre ferme avec un rivage à quelques tuiles.
- Biomes : `eau_profonde`, `eau_peu_profonde`, `plage`, `prairie`, `foret`, `colline`,
  `montagne`, `marais`. Chaque biome a un coût de déplacement et une liste de ressources
  possibles.
- Une tuile contient au plus : un gisement de ressource, un bâtiment, plusieurs objets
  au sol, plusieurs personnages (sauf si bâtiment plein).

### 4.2 Ressources

| Ressource | Où | Régénère | Usage |
|-----------|----|----------|-------|
| `bois` | forêt (arbres) | lente (repousse) | construction, feu, outils |
| `pierre` | colline, montagne | non | construction, outils |
| `baies` | forêt, prairie | saisonnière | nourriture immédiate |
| `poisson` | eau peu profonde | moyenne | nourriture (nécessite canne ou filet) |
| `gibier` | forêt, prairie (entité mobile simple) | reproduction animale | nourriture, cuir |
| `eau` | eau, rivière, puits | infinie | boisson |
| `fibres` | prairie, marais | rapide | corde, vêtements, filets |
| `argile` | marais, plage | lente | poterie, briques |
| `graines` | issues des baies | — | agriculture (phase avancée) |

Chaque gisement a une `quantite`, un `max`, un `tauxRegen` et un `outilRequis` optionnel.

**La faune (M9).** Le gibier n'est plus un gisement : `Simulation.troupeaux` porte une entité
par troupeau ou meute (`Troupeau` : espèce, position, gîte et gîte d'été, taille, méfiance,
état pâture / fuite / gîte, cible, faim pour les prédateurs, flux aléatoire propre). Chaque
morceau du monde est peuplé à sa génération (`peuplerMorceau`, flux `faune/cx:cy`) selon la
part de ses biomes favorables (`PROFILS` par espèce : biomes, taille initiale et maximale,
rayon de pâture, distance de fuite, vitesse, viande et cuir par bête, dangerosité, naissances,
mortalité d'hiver, réussite de base, densité). Toutes les six ticks, `heureTroupeau` fait fuir
le troupeau devant un humain à moins de `fuite × (0,5 + méfiance)` tuiles ou une meute à six
tuiles, le ramène au gîte la nuit, le fait pâturer le jour (cible tirée dans le rayon du gîte)
et traque la proie la plus proche pour une meute affamée ; au-delà de 48 tuiles de tout humain,
rien ne bouge. À l'aube, `jourTroupeau` fait retomber la méfiance, met bas au dixième jour du
printemps, tire la mortalité d'hiver, migre vers la forêt au premier jour de l'hiver, scinde
les grands troupeaux, nourrit ou affame les meutes ; les troupeaux vidés disparaissent. Les
bêtes vues deviennent des lieux de gibier (`connaissance`, `outilRequis: "lance"`) ; le
planificateur mène à portée et l'action `chasser` tire la réussite (base par espèce + 0,06 par
niveau de chasse + 0,15 à l'arc + 0,2 par rabatteur à moins de six tuiles, jusqu'à deux,
− 0,3 × méfiance), fait fuir et rend méfiant, et laisse un sanglier ou un aurochs mordre le
chasseur qui le rate. Forêt : un arbre abattu (`epuiseDepuis`) ne repousse qu'après 180 jours.
Pêche : les bancs croissent par bassin de 8 × 8 tuiles (logistique, 0,2 par jour à mi-charge,
immigration d'un poisson par jour sous 10 % de la capacité).

**La nuit menace (M10).** `Simulation.danger` (`EtatDanger` : menace en cours, budget de la
saison, répit, jours de grâce, nombre d'attaques) est piloté chaque heure par `heureDanger`
(`monde/danger.ts`) : au plus une menace par saison, rien avant trente jours.
Une meute (`Troupeau` de loups, `faim ≥ 2`, deux bêtes au moins) à moins de 40 tuiles du
centre du village (barycentre des abris) devient la menace ; sans gibier à 30 tuiles ni
meute, une meute arrive la nuit (1 % par heure). Traces quand un humain éveillé passe à
15 tuiles ; préavis jusqu'au crépuscule suivant (au moins 72 ticks) pendant lequel la meute
rôde à 12 tuiles (`enMenace`) ; la nuit, `vulnerabilite` note chaque personne (0 si à l'abri,
à moins de 4 tuiles d'un feu allumé, à deux autres personnes près, ou enclose ; sinon 1 + 3
pour un enfant + 2 pour l'isolé + 1 endormi + 1 blessé + proximité) et la meute suit la mieux
notée (`proieHumaine`) en évitant les feux ; quiconque est éveillé et la voit donne l'alarme
(`drapeaux.alerteJusqua` à 12 tuiles). `menacePercue` alimente la perception légère : l'urgence
du cerveau devient `defendre` (adulte armé, cible à 12 tuiles) ou `fuir` (abri, feu, adulte le
plus proche). Au contact (`proieAuContact`), `combattre` (`agents/combat.ts`) résout six rounds
au plus et un seul événement `combat` est émis ; l'aube ou le combat referme la menace et ouvre
un répit de deux jours. `enclos` (fouille à six tuiles sans franchir un bâtiment terminé) sert
à la vulnérabilité, aux leçons (« murs contre les loups » si le défunt n'était pas enclos,
sinon « veilleur de nuit ») et à `tuileEnceinteManquante`, qui fait bâtir l'anneau de
palissade à trois tuiles de l'abri familial quand la leçon est sue. Le cerveau propose
`veiller` la nuit (leçon sue, arme, feu connu, personne d'autre ne veille).

**Le temps compte (M11).** `Inventaire.age` porte l'âge moyen (jours) de chaque pile de
nourriture ; `ajouterAge` mélange en moyenne pondérée, `transferer` emporte l'âge, `pourrir`
(à l'aube, `Simulation.jourDuTemps`) vieillit d'un jour et, dès que l'âge moyen dépasse la
moitié de `VIE_NOURRITURE × conservation` (entrepôt ×2, automne ×2,5, hiver ×4), retire un
`vie`-ième de la pile par jour en la rajeunissant d'autant. Manger gâté
(`estGate`) donne le mal des ventres à 30 %. Les feux ont `reserveBois` (max 20) et brûlent
0 / 1 / 2 bûches par jour (belle saison / saison froide / neige) ; `feuAAlimenter` désigne le
feu familial éteint ou sous le seuil (4 en saison froide, jamais à la belle saison sauf feu éteint) que `prochainBatimentNecessaire`
fait alimenter (`construire` sur le feu livre jusqu'à dix bûches ; un feu éteint avec des
bûches se rallume sans bois). Les outils portent `reparations` (deux au plus, `reparer` :
une bûche, +40 de solidité). `agents/maladies.ts` : `PROFILS_MALADIE` (durée, perte par jour
×1,5 pour enfants et anciens, contagion, immunisante, faim), `tomberMalade` (pas deux fois,
pas si immunisé, durée modulée par l'immunité innée), `jourMaladies` (guérisons, immunités,
refroidissement après une journée sous 25 de chaleur), `heureContagion` (toux grise à deux
tuiles), `eauSouillee` (tombe à quatre tuiles, sauf puits), `soulager` (cataplasme : trois jours
de moins). Les maladies entrent dans `sourcesDegats`, donc dans la cause de décès. Épidémie :
à partir du deuxième hiver, au plus tous les deux ans, un adulte tiré au sort prend la toux
grise. Les tombes sont creusées à l'écart de l'eau (rayon de souillure + 1) quand une tuile
libre existe à huit tuiles.

**Le village apprivoise (M12, M23).** `monde/village.ts` : `DOCILITE` par espèce, `tenterCapture`
(à la chasse, avant la mise à mort, corde consommée, chance docilité × 0,8 ; au plus
`BETES_PAR_FAMILLE_MAX` = 4 bêtes par famille ; le cerveau tresse une corde devant un troupeau
docile et la garde en poche au rangement, **[DÉCISION M23]** sans quoi personne
n'apprivoisait), `Bete` dans
`Simulation.betail` (`ajouterBete`, `retirerBete`, `prochainIdBete`), `heureBete` (à l'enclos,
sinon derrière le maître, sinon fuite), `jourBete` (fuite d'une bête peu docile sans enclos,
fourrage d'hiver : fibres à six tuiles ou stock de l'enclos, famine en dix jours, lait tous les
deux jours pour mouflon et aurochs adultes dociles, laine du mouflon au printemps, mise bas au
dixième jour du printemps à deux adultes de même espèce, une fois sur deux, sous la capacité
de six). Bâtiments `enclos` (stock de douze) et `champ` (matériaux : quatre graines ;
`Batiment.culture` : semé, stade 0..4, jours, récoltes consécutives, jachère). `jourChamp` :
un stade tous les douze jours à la belle saison, mûr = gisement de baies sur la tuile
(`rendement` = 24 × fertilité × (1 + 0,08 × niveau d'agriculture), fertilité −30 % par récolte
consécutive, plancher 0,25), gel au premier jour d'hiver, ravage par un troupeau à une tuile,
jachère qui remet la fertilité. `prochainBatimentNecessaire` propose l'enclos (bêtes sans
enclos) et le champ (quatre graines accessibles à la belle saison, `grainesAccessibles`).
Intention `abattre` (faim < 35, rien d'autre de connu, lance ou hache). `titre` : compétence
la plus pratiquée (cueillette à moitié) au niveau 3, exposée dans `PersonnageEtat.metier`.

### 4.3 Temps, saisons, météo

- Horloge : tick → minute, heure, jour, saison, année. **[DÉCISION]** 30 jours par saison,
  4 saisons.
- Cycle jour/nuit : la nuit réduit la vision et augmente la perte de chaleur.
- Météo par jour (seedée) : `clair`, `pluie`, `orage`, `neige` (hiver), `canicule` (été).
  Effets sur la chaleur, la vitesse de déplacement, la régénération des baies, le risque
  d'incendie (feu de camp sous orage → éteint).
- Saisons : disponibilité des baies, température de base, longueur du jour.

### 4.4 Rayon de perception

Un personnage perçoit les tuiles dans un rayon **[DÉCISION]** 6 (jour) / 3 (nuit),
réduit par la forêt et la pluie. Il connaît aussi ce dont il se souvient (voir 5.4) :
« il y avait des baies au nord-est il y a deux jours ».

---

## 5. Les personnages

### 5.1 Identité (fiche persistante)

La fiche est créée à la naissance (ou à la génération initiale) et n'est modifiée que
par des mécanismes explicites (vieillissement, réflexions, apprentissage).

```ts
interface Identite {
  id: string;                 // ULID
  prenom: string;             // généré à partir d'une liste par « culture » du monde
  nomFamille: string;         // hérité (voir 8.2)
  sexe: "F" | "M";
  naissance: Horodatage;      // tick de naissance
  parents: [string, string] | null;
  apparence: { taille: number; teint: string; cheveux: string; yeux: string; marque?: string };

  // Personnalité : modèle Big Five, valeurs 0..1, héritées et bruitées (8.2)
  personnalite: {
    ouverture: number;        // curiosité, goût de l'exploration
    conscience: number;       // discipline, planification, entretien de l'habitat
    extraversion: number;     // recherche de contact social
    agreabilite: number;      // coopération, partage, pardon
    nevrosisme: number;       // sensibilité au stress, peur, prudence
  };

  // Valeurs : ce qui compte pour ce personnage (3 max, tirées d'une liste fermée)
  valeurs: Array<"famille" | "liberte" | "securite" | "tradition" | "curiosite"
               | "pouvoir" | "harmonie" | "richesse" | "honneur" | "plaisir">;

  // Traits narratifs (2 à 4) — servent au style du LLM et à des modificateurs de règles
  traits: string[];           // ex. "bavard", "rancunier", "gourmand", "lève-tôt"

  // Texte court écrit par le LLM à la création (ou modèle pour RuleBrain)
  biographie: string;         // 3-5 phrases, à la 3e personne
  motto: string;              // une phrase qui résume sa vision de la vie

  // Génétique (voir 8.2)
  genome: Genome;
}
```

**Génération initiale.** **[DÉCISION]** 12 personnages adultes (18–35 ans), sexe
équilibré, personnalités tirées d'une distribution normale bruitée, 2 à 3 familles
préexistantes pour amorcer des relations.

### 5.2 Corps et besoins

Tous les besoins sont sur 0..100, 100 = pleinement satisfait. Décroissance par tick,
modulée par l'activité, la météo et l'âge.

| Besoin | Baisse de base / jour | Conséquence si < 20 | Conséquence si 0 |
|--------|----------------------|---------------------|------------------|
| `faim` | 100 → 0 en 2 jours | vitesse −30 %, moral − | perte de santé 10 / jour |
| `soif` | 100 → 0 en 1 jour | idem | perte de santé 25 / jour |
| `sommeil` | 100 → 0 en 1,5 jour | perception −, erreurs d'action | s'endort sur place |
| `chaleur` | dépend météo / abri / vêtements | perte de santé | hypothermie |
| `securite` | monte dans un abri / groupe, baisse seul la nuit | stress, moral − | — |
| `social` | baisse selon extraversion | moral −, cherche du contact | dépression (moral plafonné) |
| `moral` | dérivé : moyenne pondérée + événements | actions plus lentes | apathie (moins d'initiative) |

État physique :

```ts
interface Corps {
  sante: number;        // 0..100, 0 = mort
  ageJours: number;
  stade: "enfant" | "adolescent" | "adulte" | "ancien";   // 0-12 / 12-16 / 16-55 / 55+ ans
  enceinte: { depuisTick: number; pere: string } | null;
  blessures: Blessure[];
  maladie: Maladie | null;
  inventaire: Inventaire;    // capacité limitée par la force
  equipement: { outil?: Objet; vetement?: Objet };
  position: { x: number; y: number };
}
```

**[DÉCISION]** Échelle temporelle de vie : 1 année de jeu = 120 jours de jeu (4 saisons
de 30 jours). Espérance de vie moyenne 70 ans, avec mortalité aléatoire croissante après 55.

**État du corps (M8).** `corps.etat` porte les blessures (type coupure / fracture / morsure,
gravité 1-3, lieu, saigne, bandée, infectée, fièvre, immobilisée, ticks de repos), la fatigue
(0-100, dette d'effort distincte du sommeil), la carence (gencives, ventre creux), les
handicaps (boiterie, main raide, sans dents), les cicatrices et les vingt derniers repas. La
santé n'est modifiée que par des **sources de dégâts nommées** (soif 25/j, froid 15/j, faim
10/j, hémorragie 4/8/15 par jour selon la gravité, infection 6/j modulé par l'immunité, carence
1/j) ; la cause du décès est la source dominante au moment où la santé atteint 0. Quatre
**capacités** dérivées (mobilité, manipulation, vue, vigueur ; plancher 0,2) sont lues par la
vitesse, le rendement de récolte et le rayon de vision ; elles déclinent avec l'âge (vue et
vigueur −1 % par an après 40, mobilité −1,5 % par an après 50) et avec la fatigue (> 60). Un
handicap se compense à moitié après trente jours. Le **moral** cible additionne des
modificateurs datés (`personnage.humeur`, somme bornée à ±40, effacement sur le dernier
quart). Soins : bandage (arrête le saignement), cataplasme (deux herbes, fièvre ramenée à
deux jours), attelle (bois + corde, immobilise) ; intentions `soigner` et `se_reposer` ;
convalescence 5/j au repos à l'abri, 2/j sinon, 0 en saignant. Accouchement : 3 % de mortalité
maternelle, ×2 si santé < 50 ou âge > 40, ÷2 avec une accoucheuse à portée (÷10 si elle
connaît la leçon), nouveau-né à 60 de santé, mort au berceau 0,02 % par jour avant deux ans.

### 5.3 Compétences

Niveaux 0..10, progressent par la pratique (courbe logarithmique). Modifient vitesse,
rendement, qualité et taux d'échec.

`recolte`, `chasse`, `peche`, `construction`, `artisanat`, `cuisine`, `soin`,
`persuasion`, `combat`, `agriculture`.

Un enfant apprend plus vite les compétences que ses parents pratiquent devant lui
(souvenir « a vu X faire Y » → bonus d'apprentissage).

### 5.4 Mémoire

Inspirée de l'architecture « Generative Agents » (flux de mémoire + récupération +
réflexion). Chaque personnage possède un flux de souvenirs privé.

```ts
interface Souvenir {
  id: string;
  tick: number;
  type: "observation" | "action" | "dialogue" | "reflexion" | "plan";
  texte: string;              // phrase en langage naturel, à la 1re personne
  importance: number;         // 1..10 (voir ci-dessous)
  sujets: string[];           // ids d'entités concernées
  position?: { x: number; y: number };
  dernierAcces: number;       // tick
  embedding?: number[];       // optionnel (phase 6)
}
```

**Importance.** Attribuée par une table de règles (naissance = 10, mort d'un proche = 10,
construction terminée = 7, repas = 2, déplacement = 1). Le LLM peut la réévaluer lors de
la réflexion.

**Récupération** (pour construire le contexte d'un appel IA). Score =
`α·récence + β·importance + γ·pertinence`. **[DÉCISION]** α=1, β=1, γ=1 ; récence
exponentielle (demi-vie 1 jour), pertinence = recouvrement des `sujets` avec la situation
courante (ou similarité d'embedding en phase 6). On garde les 20 meilleurs souvenirs.

**Réflexion.** Chaque soir (ou quand la somme d'importance des souvenirs récents dépasse
un seuil), le cerveau synthétise 2 à 3 réflexions : « Je remarque que Léa partage
toujours sa nourriture, je peux compter sur elle ». Ces réflexions deviennent des
souvenirs de type `reflexion`, importance élevée, et peuvent faire évoluer les relations
et, rarement, un trait.

**Oubli.** Au-delà de **[DÉCISION]** 2 000 souvenirs, les souvenirs d'importance ≤ 2 et
non consultés depuis 30 jours sont compressés (résumés en un seul souvenir) puis
supprimés.

### 5.5 Relations

```ts
interface Relation {
  cible: string;
  lien: "inconnu" | "connaissance" | "ami" | "partenaire" | "parent" | "enfant"
      | "fratrie" | "rival" | "ennemi";
  affinite: number;      // -100..100
  confiance: number;     // 0..100
  attirance: number;     // 0..100 (adultes uniquement, non-parents)
  derniereInteraction: number;
  dette: number;         // >0 : il me doit ; <0 : je lui dois
}
```

Évolutions : chaque interaction ajuste `affinite` et `confiance` selon son issue et la
compatibilité de personnalité (agréabilité proche → +, névrosisme élevé → variations
amplifiées). `lien` est dérivé de seuils, sauf liens familiaux qui sont fixes.

---

## 6. Catalogue des actions

Chaque action est une classe avec : `preconditions(monde, agent)`, `duree(agent)`,
`executer(monde, agent)`, `interrompre()`. Le moteur refuse toute action dont les
préconditions échouent et renvoie la raison au cerveau (qui la mémorise).

| Action | Paramètres | Durée (ticks) | Préconditions | Effets |
|--------|------------|---------------|---------------|--------|
| `Deplacer` | cible (x,y) | pathfinding A*, coût par biome | tuile atteignable | position |
| `Recolter` | gisement | 2–6 selon compétence | adjacent, outil si requis, place inventaire | ressource +, gisement −, compétence + |
| `Chasser` | animal | 3–8 | arme/outil, adjacent | gibier + ou échec, risque blessure |
| `Pecher` | tuile d'eau | 4 | canne ou filet | poisson + |
| `Boire` | source d'eau | 1 | adjacent | soif = 100 |
| `Manger` | objet nourriture | 1 | dans inventaire ou stock accessible | faim +, moral + si cuisiné |
| `Dormir` | lieu | jusqu'à sommeil ≥ 90 | — | sommeil +, chaleur selon lieu |
| `Fabriquer` | recette | selon recette | ingrédients, atelier si requis | objet + |
| `Construire` | plan de bâtiment, tuile | selon bâtiment, cumulable à plusieurs | matériaux livrés, tuile libre | bâtiment (chantier → terminé) |
| `Deposer` / `Prendre` | objet, conteneur | 1 | adjacent, propriété/permission | inventaire ↔ stock |
| `Parler` | cible, sujet | 2–4 | cible à ≤ 2 tuiles, éveillée | dialogue (10), relation |
| `Offrir` | cible, objet | 1 | adjacent | relation +, dette |
| `Demander` | cible, objet/aide | 2 | adjacent | dépend de la persuasion et de la relation |
| `Courtiser` | cible | 3 | adultes, attirance mutuelle > seuil | attirance +, peut aboutir à `partenaire` |
| `SeReproduire` | partenaire | 2 | lien partenaire, adultes, abri (8.1) | grossesse possible |
| `Soigner` | cible | 3 | plantes/bandage | santé + |
| `Attaquer` | cible | 2 | adjacent | blessures, relations −− |
| `Fuir` | direction | — | menace perçue | déplacement rapide |
| `Explorer` | direction ou zone | variable | — | découvre tuiles, souvenirs |
| `Attendre` | ticks | n | — | — |

**Planification.** Une intention est convertie en plan par un planificateur simple
(chaînage arrière sur les préconditions, profondeur ≤ 6). Exemple : « avoir un abri » →
`Construire(abri)` requiert 10 bois + 4 pierre → `Recolter(bois)` × n → `Deplacer(forêt)`.
Si le plan échoue deux fois, l'intention est abandonnée et le cerveau est ré-interrogé
avec la raison de l'échec.

---

## 7. Construction et artisanat

### 7.1 Recettes d'objets

| Objet | Ingrédients | Compétence | Atelier | Effet |
|-------|-------------|------------|---------|-------|
| `hache_pierre` | 2 bois, 3 pierre, 1 fibres | artisanat 0 | non | bois ×2, requis pour arbres |
| `pioche` | 2 bois, 4 pierre | artisanat 2 | non | pierre ×2 |
| `lance` | 3 bois, 1 pierre | artisanat 1 | non | chasse possible |
| `canne_a_peche` | 2 bois, 2 fibres | artisanat 1 | non | pêche possible |
| `filet` | 6 fibres | artisanat 3 | non | pêche ×2 |
| `corde` | 3 fibres | artisanat 0 | non | ingrédient |
| `vetement_cuir` | 3 cuir, 1 corde | artisanat 3 | non | chaleur + |
| `pot_argile` | 3 argile | artisanat 2 | four | stockage d'eau/nourriture |
| `repas_cuit` | 1 nourriture crue | cuisine 0 | feu | faim ×1,5, moral + |
| `bandage` | 2 fibres | soin 1 | non | soigne blessure |

### 7.2 Bâtiments

Un bâtiment passe par les états `chantier` (matériaux à livrer, travail à fournir) puis
`termine`. Plusieurs personnages peuvent travailler sur le même chantier. Chaque bâtiment
a un **propriétaire** (le fondateur) et une liste d'**autorisés** (famille, invités).

| Bâtiment | Matériaux | Travail (ticks·personne) | Capacité | Effets |
|----------|-----------|--------------------------|----------|--------|
| `feu_de_camp` | 5 bois | 3 | — | chaleur, cuisine, lumière, sécurité + |
| `abri` (hutte) | 10 bois, 4 fibres | 24 | 2 dormeurs | chaleur, sécurité, sommeil ×1,3, **requis pour se reproduire** |
| `maison` | 30 bois, 20 pierre, 6 corde | 96 | 5 dormeurs, stock 50 | tout ce que fait l'abri, en mieux ; stock |
| `entrepot` | 15 bois, 10 pierre | 40 | stock 200 | stockage partagé |
| `four` | 12 argile, 6 pierre | 24 | — | poterie, cuisson |
| `puits` | 20 pierre | 48 | — | eau infinie loin des rivières |
| `palissade` (segment) | 4 bois | 6 | — | bloque animaux, sécurité + |
| `champ` | 4 graines, outil | 12 | — | baies/graines cultivées (phase 5) |
| `tombe` | 4 pierre | 8 | — | souvenir collectif, moral des proches + après deuil |

Les bâtiments **s'usent** (−1 % de solidité par jour, plus sous orage) et doivent être
entretenus (`Construire` sur un bâtiment existant = réparation).

---

## 8. Reproduction, génétique, cycle de vie

### 8.1 Formation de couple et reproduction

1. Deux adultes avec `attirance` mutuelle > 60 et `affinite` > 40 peuvent se courtiser.
2. Après **[DÉCISION]** 3 interactions `Courtiser` réussies, le lien devient `partenaire`
   (monogamie par défaut ; un trait `volage` autorise des exceptions, avec conséquences
   relationnelles).
3. `SeReproduire` requiert : lien partenaire, les deux dans un abri/maison dont l'un est
   autorisé, besoins de base > 40, femme non enceinte, âge 16–45 pour la mère, deux ans depuis
   la dernière naissance, et une famille qui a encore les bras pour un enfant de plus (moins
   de deux enfants par adolescent ou adulte : **[DÉCISION M21]** frein démographique, sans
   lequel les colonies meurent de faim en l'an dix sous le nombre de bouches).
4. Probabilité de grossesse par acte : **[DÉCISION]** 25 %, réduite si faim ou santé basse.
5. Grossesse : **[DÉCISION]** 30 jours de jeu. La mère a des besoins accrus (faim ×1,3),
   vitesse réduite au dernier tiers. Risque de fausse couche si santé < 30.
6. Naissance : événement d'importance 10 pour parents et témoins ; le nouveau-né est un
   personnage complet avec `stade: "enfant"`.

### 8.2 Génétique et héritage

```ts
interface Genome {
  // 12 gènes, chacun une paire d'allèles 0..1 (mère, père)
  genes: Record<
    "taille" | "force" | "endurance" | "immunite" | "longevite" | "fertilite"
    | "ouverture" | "conscience" | "extraversion" | "agreabilite" | "nevrosisme" | "teint",
    [number, number]
  >;
}
```

- Chaque allèle de l'enfant est tiré au hasard parmi les deux allèles du parent
  correspondant, puis muté avec probabilité 5 % (bruit gaussien σ = 0,1).
- Le phénotype est la moyenne des deux allèles (dominance simple pour `teint`).
- La personnalité de l'enfant = phénotype génétique × 0,6 + influence de l'environnement
  × 0,4 (calculée à l'adolescence à partir des traits des personnes les plus présentes dans
  ses souvenirs).
- `nomFamille` : celui du père par défaut **[DÉCISION]**, ou selon la « coutume » du monde
  (configurable : père, mère, composé).
- Le prénom est choisi par le cerveau LLM du parent principal (avec la culture du monde et
  la liste des prénoms déjà utilisés en contexte), ou tiré d'une liste en mode règles.

### 8.3 Enfance et apprentissage

- Enfant (0–10 ans, adolescent de 10 à 14, adulte à 14 : **[DÉCISION M21]** la relève doit arriver avant que les fondateurs ne s'éteignent) : ne peut pas récolter de ressources lourdes, ni construire, ni se
  battre ; mange à partir des stocks familiaux ; suit un parent ou joue ; apprend par
  observation (5.3). Dès six ans, un grand enfant cueille des baies lui-même, pour lui et pour
  le garde-manger quand il se vide (**[DÉCISION M21]** : sans cela, une famille de six adultes
  et vingt-neuf enfants meurt de faim en l'an dix).
- Adolescent (10–14) : actions d'adulte avec rendement ×0,6 ; commence à avoir son propre
  cerveau LLM (avant : `RuleBrain` uniquement, pour limiter le coût **[DÉCISION]**).
- Un enfant dont les deux parents meurent est pris en charge par un adulte ayant la
  meilleure affinité (événement « adoption »).

### 8.4 Vieillesse et mort

- Après 55 ans : force et vitesse −1 %/an, risque de maladie croissant.
- Causes de mort : faim, soif, hypothermie, blessure, maladie, vieillesse (probabilité
  journalière croissante après l'espérance de vie génétique), violence.
- Événement `Deces` : importance 10 pour la famille et les amis, 6 pour les connaissances.
  Deuil : moral −, besoin social ↑ pendant 10 jours. Les biens vont au partenaire puis aux
  enfants. Une tombe peut être construite.
- Le personnage mort reste en base (généalogie, journal) mais n'est plus simulé.

---

## 9. Social

### 9.1 Dialogue

Un dialogue est un échange de 2 à 6 répliques entre deux personnages, produit par **un
seul appel IA** qui reçoit les deux fiches (côté connu de chacun), leur relation et leur
contexte, et renvoie les répliques plus les effets (voir 10.4). En mode règles, le
dialogue est un gabarit (« Bonjour X, as-tu vu des baies ? » → « Oui, au nord. ») et les
effets sont calculés par table.

Effets possibles d'un dialogue : transfert d'information (position d'une ressource → nouveau
souvenir), promesse (dette), invitation (autorisation dans un bâtiment), proposition
d'échange, déclaration, dispute, réconciliation.

### 9.2 Échange et propriété

- Tout objet et bâtiment a un propriétaire. Prendre sans autorisation = **vol** : événement
  perçu par les témoins, relations −−, réputation −.
- Échange : `Demander`/`Offrir` avec contre-partie négociée par le dialogue. Pas de
  monnaie en phases 1–5 ; le troc et la dette suffisent. **[DÉCISION]** Une monnaie peut
  être ajoutée en phase 6 si les stocks et échanges le justifient.

### 9.3 Groupes

- Une **famille** est un groupe implicite (liens `parent`/`enfant`/`partenaire`/`fratrie`)
  qui partage automatiquement les autorisations sur les bâtiments et les stocks.
- Un **foyer** est un bâtiment de type `abri`/`maison` et ses dormeurs.
- Une **communauté** émerge : ensemble des foyers à ≤ 8 tuiles les uns des autres.
  Statistiques disponibles dans le viewer (population, stocks, naissances, décès).

### 9.4 Conflit

Les conflits sont possibles mais rares et coûteux : `Attaquer` requiert une raison (vol
subi, rivalité, névrosisme élevé + faim) et entraîne blessures, fuite, réputation. Il n'y
a pas de « guerre » scriptée ; si des groupes hostiles émergent, c'est un résultat, pas une
mécanique dédiée.

---

## 10. Le cerveau IA

### 10.1 Deux niveaux de décision

| Niveau | Qui | Quand | Latence | Coût |
|--------|-----|-------|---------|------|
| **Réflexe** | `RuleBrain` (règles + scores d'utilité) | chaque tick où une décision est nécessaire | 0 | 0 |
| **Délibération** | `LLMBrain` (Claude) | aux **points de décision** listés ci-dessous | asynchrone | appel API |

Le `RuleBrain` est **toujours** présent, même pour un agent LLM : il gère les urgences
(soif < 15 → boire, danger → fuir), fournit l'action de repli pendant qu'une réponse LLM
est en attente, et sert de cerveau unique en mode dégradé (P4).

**Points de décision LLM** (par personnage) :

1. **Aube** : plan de la journée (3 à 6 intentions ordonnées, avec créneaux).
2. **Interruption** : le plan devient impossible, ou un événement d'importance ≥ 7 est
   perçu (rencontre, danger, naissance, mort, découverte).
3. **Rencontre** : un personnage avec qui il souhaite parler est à portée (fusionné en un
   seul appel de dialogue pour les deux, voir 9.1).
4. **Soir** : réflexion (5.4) et ajustement des relations.
5. **Événements de vie** : choix d'un prénom, décision de courtiser/former un couple,
   choix de l'emplacement d'une maison.

**Budget.** **[DÉCISION]** Maximum 12 appels LLM par personnage et par jour de jeu.
Au-delà, le personnage retombe sur `RuleBrain` jusqu'au lendemain, et l'événement
« budget épuisé » est journalisé. Ce plafond est configurable (`brain.maxCallsPerDay`).

### 10.2 Ce que le cerveau reçoit (perception)

Le contexte d'un appel est **construit par le moteur**, jamais par le LLM. Il ne contient
que ce que le personnage sait :

```ts
interface Perception {
  moi: {
    identite: Identite;                // sans le génome brut
    corps: Corps;                      // besoins, inventaire, position, stade
    competences: Record<string, number>;
    planEnCours: Intention[] | null;
    dernierEchec: { action: string; raison: string } | null;
  };
  monde: {
    horloge: { jour: number; heure: number; saison: string; meteo: string };
    tuilesVisibles: TuileResumee[];    // biome, ressources, bâtiments, personnes
    personnesVisibles: Array<{ id: string; prenom: string; lien: string; activite: string }>;
    lieuxConnus: LieuConnu[];          // issus de la mémoire (ressources, bâtiments)
  };
  memoire: Souvenir[];                 // 20 meilleurs (5.4)
  relations: Relation[];               // uniquement les personnes connues
  evenementsRecents: Evenement[];      // depuis le dernier appel
  actionsPossibles: ActionDescripteur[]; // catalogue filtré par préconditions
}
```

### 10.3 Ce que le cerveau renvoie (sortie structurée)

La sortie est **obligatoirement** un JSON validé par schéma (structured outputs). Le
moteur rejette toute intention non conforme et retombe sur `RuleBrain`.

```ts
// Réponse pour "aube" et "interruption"
interface DecisionIA {
  penseeInterieure: string;      // 1-3 phrases, à la 1re personne, affichée dans le viewer
  humeur: "serein" | "inquiet" | "joyeux" | "triste" | "en_colere" | "fatigue" | "amoureux";
  intentions: Array<{
    type: TypeIntention;         // énumération fermée alignée sur le catalogue (6)
    parametres: Record<string, string | number>;
    priorite: 1 | 2 | 3;
    raison: string;              // courte, journalisée
  }>;
  souvenirsAEnregistrer: Array<{ texte: string; importance: number }>;
}

// Réponse pour "soir"
interface ReflexionIA {
  reflexions: Array<{ texte: string; importance: number; sujets: string[] }>;
  ajustementsRelations: Array<{ cible: string; affinite: number; confiance: number; raison: string }>;
  evolutionTrait?: { ajouter?: string; retirer?: string; raison: string };  // rare
}

// Réponse pour "dialogue"
interface DialogueIA {
  repliques: Array<{ locuteur: string; texte: string }>;   // 2 à 6
  effets: Array<
    | { type: "information"; vers: string; texte: string; position?: { x: number; y: number } }
    | { type: "relation"; de: string; vers: string; affinite: number; confiance: number }
    | { type: "promesse"; de: string; vers: string; objet: string; quantite: number }
    | { type: "invitation"; de: string; vers: string; batiment: string }
    | { type: "echange"; de: string; vers: string; donne: string; recoit: string }
  >;
  souvenirs: Array<{ pour: string; texte: string; importance: number }>;
}
```

### 10.4 Prompts

Le **prompt système** est identique pour tous les personnages et **figé** (pour le cache).
Il décrit les règles du monde, le catalogue d'actions, le format de sortie et le style
attendu. Tout ce qui est propre au personnage va dans le message utilisateur, dans un ordre
stable : identité → corps → relations → mémoire → perception → événements → question.

Extrait du prompt système (à compléter par Claude Code, en français) :

```
Tu incarnes UN personnage d'une simulation de vie. Tu n'es pas un narrateur : tu ne sais
que ce que ce personnage sait, tu ne décides que pour lui. Réponds en restant fidèle à
sa personnalité, ses valeurs et son histoire, même si ce n'est pas le choix optimal.
Un personnage prudent hésite, un personnage gourmand mange trop, un personnage rancunier
n'oublie pas. Les intentions doivent être réalisables avec les actions possibles listées.
Réponds uniquement dans le format JSON demandé.
```

Règles de rédaction des prompts :

- pas de « rappels » du type « n'oublie pas de… » : décrire la situation suffit ;
- les personnages parlent en français, tutoiement entre proches, vouvoiement entre
  inconnus adultes **[DÉCISION]** ;
- un enfant (adolescent LLM) parle comme son âge.

### 10.5 Implémentation de l'appel

- SDK officiel `@anthropic-ai/sdk` (TypeScript), jamais d'appel HTTP à la main.
- Modèle par défaut **[DÉCISION]** `claude-opus-5`. Un second modèle peut être configuré
  pour les appels à faible enjeu (`brain.modelDialogue`, `brain.modelReflexion`) ; par
  exemple `claude-haiku-4-5` si vous préférez privilégier le volume au raffinement. Ce
  choix vous appartient ; ne pas le faire silencieusement dans le code.
- Réflexion adaptative (`thinking: { type: "adaptive" }`) avec `output_config.effort`
  réglable : `low` pour les dialogues, `medium` pour l'aube, `high` pour les réflexions.
- Sorties structurées via `client.messages.parse()` + `zodOutputFormat` (Annexe B).
- **Cache de prompt** : prompt système marqué `cache_control: { type: "ephemeral" }` ;
  aucune donnée volatile (horodatage, id d'appel) avant le dernier point de cache.
- **Repli serveur** : activer `fallbacks: "default"` avec la beta
  `server-side-fallback-2026-07-01` pour qu'une requête refusée par les classificateurs
  soit rejouée sur un autre modèle plutôt que de casser le tour. Toujours tester
  `stop_reason === "refusal"` avant de lire le contenu.
- Concurrence : au plus **[DÉCISION]** 4 appels en vol simultanément ; file d'attente
  FIFO par priorité (interruption > aube > dialogue > soir).
- Timeout 60 s, 2 tentatives ; au-delà, `RuleBrain` prend le relais et l'échec est
  journalisé.
- Toute réponse (brute + parsée), le contexte envoyé et le coût (`usage`) sont écrits
  dans `journal/llm/<agentId>/<tick>.json` pour audit (P5).
- Un **mode enregistrement/relecture** : en développement, les réponses LLM sont
  mémorisées par empreinte du contexte et rejouées, ce qui rend les tests déterministes
  et gratuits.

### 10.6 `RuleBrain` (cerveau à règles)

Sélection par **score d'utilité** : pour chaque intention candidate, score =
Σ (urgence du besoin qu'elle satisfait × poids personnalité) − coût estimé (distance,
durée, risque). Les poids dépendent de la personnalité (conscience → construction et
stockage ; extraversion → parler ; ouverture → explorer ; névrosisme → sécurité).
Bruit aléatoire seedé de ±10 % pour éviter les comportements robotiques. Ce cerveau doit à
lui seul produire une société viable (les personnages survivent, construisent et se
reproduisent) : c'est la **base de test** de tout le moteur.

---

## 11. Stack technique et structure du projet

**[DÉCISION]** TypeScript partout (moteur, serveur, viewer), Node ≥ 20, pnpm.

```
simulation-de-vie/
├── PROTOCOLE.md
├── package.json                  # workspace pnpm
├── packages/
│   ├── core/                     # moteur déterministe, aucune dépendance réseau
│   │   ├── src/monde/            # grille, génération, ressources, météo, horloge
│   │   ├── src/agents/           # identité, corps, besoins, compétences, génétique
│   │   ├── src/memoire/          # flux, récupération, oubli
│   │   ├── src/actions/          # catalogue + planificateur
│   │   ├── src/social/           # relations, dialogues (gabarits), propriété
│   │   ├── src/cerveau/          # interface Cerveau, RuleBrain
│   │   ├── src/evenements/       # bus d'événements, journal
│   │   ├── src/persistance/      # snapshots JSON, journal NDJSON
│   │   ├── src/rng.ts            # RNG seedé (mulberry32 ou xoshiro)
│   │   └── src/simulation.ts     # boucle principale
│   ├── brain-claude/             # LLMBrain : prompts, schémas zod, file d'appels, cache
│   ├── server/                   # démarre la simulation, expose WebSocket + HTTP
│   ├── viewer/                   # Vite + Canvas 2D (ou PixiJS), inspecteur, journal
│   └── cli/                      # `sim run`, `sim replay`, `sim inspect`, `sim stats`
├── data/
│   ├── prenoms.json              # listes par culture
│   ├── recettes.json
│   ├── batiments.json
│   └── importance.json           # table d'importance des événements
├── saves/                        # snapshots (gitignored)
└── journal/                      # NDJSON + appels LLM (gitignored)
```

- Tests : Vitest. Le paquet `core` doit avoir ≥ 80 % de couverture sur actions, besoins,
  génétique, mémoire, planificateur.
- Lint/format : ESLint + Prettier. Typage strict (`strict: true`, pas de `any`).
- Le viewer consomme un flux d'**événements** et des **snapshots** ; il ne recalcule
  jamais de logique de jeu.
- Configuration : un fichier `sim.config.json` (voir 16) + variables d'environnement
  (`ANTHROPIC_API_KEY`).

---

## 12. Persistance et journal

- **Snapshot** : état complet sérialisable (monde, agents, mémoires, relations, RNG)
  toutes les **[DÉCISION]** 144 ticks (1 jour), en JSON compressé (gzip). Le rechargement
  d'un snapshot suivi de la relecture du journal LLM doit reproduire exactement l'état
  suivant (P1).
- **Journal d'événements** : `journal/evenements.ndjson`, une ligne par événement
  `{ tick, type, acteurs, position, details }`.
- **Journal des pensées** : par personnage, `journal/pensees/<id>.ndjson`.
- **Généalogie** : `saves/genealogie.json` mis à jour à chaque naissance/décès/couple.
- Commandes CLI : `sim run --seed 42 --days 30`, `sim replay saves/j12.json.gz`,
  `sim inspect <agentId>`, `sim stats`.

---

## 13. Interface (viewer)

Fonctionnalités minimales, dans cet ordre de priorité :

1. **Carte** : tuiles colorées par biome, ressources en icônes, bâtiments, personnages
   (cercle coloré par famille, contour selon l'humeur), jour/nuit en overlay.
2. **Contrôles** : pause, ×1, ×4, ×16, avance d'un tick, saut à l'aube suivante.
3. **Inspecteur de personnage** (clic) : fiche d'identité, besoins en jauges, inventaire,
   compétences, relations (liste triée par affinité), plan en cours, **pensée intérieure
   actuelle**, 20 derniers souvenirs, arbre généalogique court.
4. **Journal global** filtrable par type et par personnage.
5. **Statistiques** : population, naissances/décès par saison, stocks totaux, bâtiments,
   nombre d'appels LLM et coût cumulé.
6. **Bulles de dialogue** au-dessus des personnages en conversation.
7. Mode « suivre ce personnage » (caméra).

Pas d'édition du monde par l'observateur en phase 1–5 (lecture seule). **[DÉCISION]** Une
« intervention divine » (déposer une ressource, déclencher une météo) peut être ajoutée
en phase 6 — réalisée en M13 sous la forme du mode Dieu (section 8 ter).

---

## 14. Tests et critères d'acceptation

### 14.1 Tests unitaires (core)

- Génération du monde : même seed → même grille (hash).
- Besoins : décroissance conforme aux tables, mort par soif au bon tick.
- Chaque action : préconditions, durée, effets, interruption.
- Planificateur : produit un plan valide pour chaque intention du catalogue à partir de
  10 situations de départ prédéfinies.
- Génétique : héritage, mutation dans les bornes, personnalité de l'enfant.
- Mémoire : récupération renvoie les souvenirs attendus ; oubli respecte les seuils.
- Relations : seuils de lien, effets d'un vol observé.

### 14.2 Tests d'intégration (core + RuleBrain)

- **Survie** : 12 personnages, seed fixe, 60 jours, sans LLM → au moins 8 survivants,
  au moins 3 abris construits, au moins 1 naissance.
- **Déterminisme** : deux exécutions identiques → journaux identiques (hash).
- **Reprise** : snapshot au jour 10 + relecture → état identique au jour 20 à celui d'une
  exécution continue.
- **Charge** : 100 personnages, 1 000 ticks en < 60 s sur une machine portable.

### 14.3 Tests du cerveau LLM

- Schémas : 100 % des réponses enregistrées en fixtures valident les schémas zod.
- Mode relecture : la suite de tests tourne sans clé API.
- Cohérence de personnalité : sur 20 situations fixtures, un juge (script) vérifie que
  les intentions choisies respectent des contraintes simples (un personnage `agreabilite`
  > 0,8 ne choisit jamais `Attaquer` sans avoir été attaqué, etc.).
- Cache : sur une journée simulée, `cache_read_input_tokens` > 50 % des tokens d'entrée.

### 14.4 Critères d'acceptation finaux

- Une simulation de 3 années de jeu (360 jours) avec 12 personnages initiaux et LLM
  actif tourne sans crash ni fuite mémoire.
- La population comporte à la fin une **deuxième génération** vivante.
- Le viewer permet de reconstituer, pour n'importe quel personnage, **pourquoi** il a
  fait chaque chose (pensée + raison + souvenirs).
- Le coût d'une journée simulée est affiché et reste sous le plafond configuré.

---

## 15. Roadmap par phases

Chaque phase = branche, tests verts, commit, mise à jour d'un `CHANGELOG.md`.

| Phase | Contenu | Définition de « fait » |
|-------|---------|------------------------|
| **M0 – Squelette** | workspace pnpm, `core` vide, RNG seedé, horloge, grille + génération procédurale, CLI `sim run` qui affiche la carte en ASCII | test de hash de génération ; lint et types OK |
| **M1 – Corps et survie** | personnages, besoins, ressources, actions `Deplacer/Recolter/Boire/Manger/Dormir/Explorer`, `RuleBrain` minimal, mort | test « survie 10 jours » : ≥ 10/12 vivants |
| **M2 – Construire et fabriquer** | inventaire, recettes, bâtiments (feu, abri, maison, entrepôt), propriété, chantiers partagés, météo et saisons | test « 3 abris en 30 jours » |
| **M3 – Mémoire et relations** | flux de souvenirs, importance, récupération, relations, dialogues à gabarits, échange/dette, vol | tests mémoire/relations ; les personnages se transmettent des positions de ressources |
| **M4 – Vie et reproduction** | couples, grossesse, naissance, génétique, enfance, apprentissage, vieillesse, héritage, généalogie | test « 1 naissance en 60 jours » ; test génétique |
| **M5 – Cerveau Claude** | `brain-claude` : prompts, schémas, points de décision, file d'appels, cache, repli, enregistrement/relecture, journal LLM | tests 14.3 ; une journée avec 12 agents LLM sous budget |
| **M6 – Viewer** | serveur WebSocket, carte, contrôles, inspecteur, journal, stats, bulles | démo : suivre un personnage de sa naissance à sa première maison |
| **M7 – Polissage** | embeddings pour la mémoire (optionnel), agriculture, monnaie (optionnel), intervention divine, équilibrage, profilage | critères 14.4 |

L'ordre M5/M6 peut être inversé si vous voulez voir le monde avant de brancher l'IA.

---

## 8 bis. Cerveau Claude tel que réalisé (M5)

- **[DÉCISION]** Pas d'API payante : Claude est sollicité depuis la page publiée sur claude.ai,
  sur le compte de la personne qui regarde (capacité `sample`), avec consentement au premier
  appel. Hors de claude.ai, le mode règles continue seul.
- Claude ne décide pas à la place du moteur : il envoie une `inspiration` (pensée intérieure,
  récit d'invention, épitaphe avec une leçon du catalogue) que le moteur applique et journalise
  (`claude`), ce qui garde le rejeu possible.
- Sobriété : un appel à la fois, déclenché par un décès, une invention ou la sélection d'un
  personnage ; jamais en boucle.

## 8 quater. Sauvegarde telle que réalisée (M15)

- `Simulation.sauvegarder()` rend un objet JSON versionné ; `Simulation.restaurer()` en refait
  un monde qui continue à l'identique (P1 : même journal à venir). La sérialisation est
  structurelle (chaque champ parcouru), les tuiles se regénèrent de la graine, le journal est
  tronqué à ses trois mille derniers événements (compteurs conservés). **[DÉCISION M24]**
  `Simulation.sauvegarderParEtapes()` rend la même sauvegarde en plusieurs fois : tout est
  encodé d'un coup sauf les personnages, que `suivant(n)` encode par paquets ; le monde ne doit
  pas avancer d'ici la fin (`suivant` le refuse). En mémoire, le journal est une fenêtre de
  vingt-quatre mille événements (effacés par six mille) avec un index global (`taille`,
  `depuisIndex`) et des compteurs par type et par détail (`compteDetail("chasse:reussie")`).
- La page range les sauvegardes dans IndexedDB (nommées, plus « auto »), en JSON compressé
  (gzip par `CompressionStream`, à plat si le navigateur ne l'a pas) ; la sauvegarde de sortie
  (page cachée ou fermée) part sans compression, dans une écriture lancée dans la foulée sur
  une connexion gardée ouverte, et une partie d'au moins vingt jours est copiée sous son nom
  avant qu'un nouveau monde ne remplace « auto » (**[DÉCISION M22]**). Sur claude.ai, chaque
  sauvegarde part aussi dans la base de documents de l'artefact (capacité `db`), en gzip +
  base64 découpé en morceaux de 180 000 caractères sous `sauvegardes/<id>/morceaux/<n>`, l'en-
  tête `sauvegardes/<id>` (nom, date, graine, jour, vivants, taille, nombre de morceaux) écrit
  en dernier ; la boîte 💾 liste les deux sources et la plus récente reprend au chargement
  (**[DÉCISION M22]** : le stockage du navigateur ne survit pas toujours à la fermeture de
  l'artefact dans l'application). Le serveur `sim-serve` n'a pas encore de sauvegarde. La sauvegarde automatique suit une cadence adaptative (vingt secondes, allongée pour
  que l'encodage reste sous un centième du temps), plus l'aube, la mise en pause et la mise à
  l'arrière-plan ; **[DÉCISION M24]** hors sortie de page, la page encode par tranches de 8 ms
  entre deux images (`LiaisonLocale.sauvegarderSansBloquer`), le monde attendant entre-temps,
  puis sérialise et compresse en flux, morceau par morceau (`compresserParMorceaux`), sans
  jamais assembler le JSON entier ; la plus récente reprend d'elle-même au chargement si elle a moins de douze
  heures et que l'adresse n'impose pas de graine.

## 8 quinquies. La société telle que réalisée (M19, jalon 13)

- Un module `social/societe.ts` porte l'état social (`Simulation.societe`, sauvegardé) : coutumes,
  griefs, tension, décisions, lieux interdits, alliances, factions, dernière veillée, compteurs.
  Il observe le journal (prestige, rancunes, griefs, fêtes à venir), agit à l'aube (érosion du
  prestige, rancunes, coutumes, maîtres, factions, décisions, fin d'exil, levée des tabous),
  chaque heure (rixes), le soir (veillée, palabre, prix du sang, amitiés d'enfance), à la
  naissance (haine héritée) et à la mort (traumatisme, haine, tabou).
- Le personnage gagne `prestige`, `maitre`, `banni` ; la relation gagne `rancune` et `haine`.
  Les coutumes entrent dans la perception (`coutumes`) : le cerveau les suit comme des savoirs.
  Un bâtiment `commun` est accessible et prioritaire pour tous ; `autorise` refuse tout à un
  banni, ouvre les stocks après décision et les abris aux familles alliées.
- Intention et action `se_recueillir` (tombe d'origine d'une leçon, une fois par saison).
- Le protocole expose `MessageEtat.societe` (onglet Village, carte), `notable` et `banni` sur
  chaque personnage, et la section société de la fiche.

## 8 sexies. La psyché et la mémoire telles que réalisées (M20, jalon 14)

- `memoire/psyche.ts` : `Personnage.psyche` (stress, abattement, lieux évités, objectif, sens,
  ennui, dernières intentions, rêve, attachements, deuils, personnalité de base, dons,
  gravures). Observe le journal (stress), agit à l'aube (décroissance, abattement, ennui,
  objectifs, anniversaires, attachements mensuels, un souvenir réécrit par semaine), le soir
  (lieu d'attachement), à la mort (deuil, évitement, personnalité). Le rêve se fait dans
  l'action `dormir` (dix-huitième tick). La perception porte `abattu` et
  `intentionDominante` ; le cerveau réduit tout sauf le nécessaire quand on est abattu et
  récompense la variété quand on s'ennuie. Le planificateur évite les lieux évités.
- `memoire/legendes.ts` : `Simulation.chronique` (récits, lieux nommés, proverbes). Les récits
  naissent des événements marquants, se racontent à la veillée (`raconter`), s'embellissent,
  deviennent légendes ; les lieux se nomment ; les dialogues emploient les noms de lieux et les
  proverbes. Le journal, lui, reste la vérité.
- Bâtiment `stele` (gravure d'un ancien). Souvenir : `texte` réécrivable, `altere`, type
  `reve`. Sauvegarde en version 3 (migration depuis 1 et 2).
- Protocole : `MessageFiche.psyche`, `SouvenirFiche.altere`, `PersonnageEtat.abattu`,
  `MessageEtat.chronique`, statistiques (légendes, lieux nommés, proverbes, abattus).

## 8 septies. Le monde qui s'élargit tel que réalisé (M21, jalon 15)

- `monde/villages.ts` : `Simulation.villages` (villages, relations, bandes, caravanes, routes,
  compteurs). Aube : recentrage, schisme, arrivées, bandes, caravanes, diplomatie et batailles ;
  heure : bandes et caravanes qui avancent ; journal : vols entre villages (casus belli),
  mariages (rapprochement), rixes. La veillée se tient par village.
- Ambition `migrer` avec `destination`, intention et perception `migrer` : la marche par étapes
  vers le site, puis l'abri sur place (mécanique de migration de M17).
- Protocole : `MessageEtat.villages` (villages, relations, bandes, caravanes, routes) et
  statistiques (villages, raids, caravanes, batailles).
- Restent hors du jalon : des coutumes propres à chaque village (elles sont communes), les
  messagers comme personnages (les caravanes portent les nouvelles), les nomades étrangers.

## 8 ter. Mode Dieu et conseil de Claude tels que réalisés (M13)

- **[DÉCISION]** L'observateur influence, il ne commande pas. Un pouvoir change le monde
  (météo, gisements, un corps, un bâtiment, le brouillard) ; jamais une intention, un plan ou
  une relation. Les personnages interprètent : le témoin éveillé le plus proche mémorise le
  miracle et en garde une humeur de trois jours.
- **Faveur** : 20 au départ, plafond 40, +1 par jour simulé, +1 à +4 quand la colonie
  prospère (bâtiment terminé, leçon, union, naissance, invention). Chaque pouvoir a un coût et
  une recharge (`FICHES_POUVOIR`, dans le protocole, contrat commun du moteur et de la page).
  Refus explicites : `faveur_insuffisante`, `recharge`, `cible_invalide`, `hors_monde` (le
  monde déjà généré seulement), `sans_effet` (rien n'est payé).
- **Rejeu** : chaque miracle est journalisé (`divin` : pouvoir, cible, effet, témoin,
  réaction) ; le hasard d'un pouvoir vient d'un flux dérivé du tick et du pouvoir. Même
  graine, mêmes commandes aux mêmes ticks, même monde.
- **Demander à Claude** : le moteur mesure les motifs (compteurs de faim, de froid, de moral
  bas, soirs sans idée, échecs consécutifs, absence de projet), tient la file, ouvre une
  question à la fois et construit lui-même le contexte et le catalogue d'options (règle 10.2 :
  jamais le LLM). La page met la question en mots ; Claude répond `{choix, pensee, ambition}`
  ; la page valide, relance une fois, puis le moteur revalide le choix contre les options de
  la question ouverte (la liste n'est pas reconstruite d'après la page). Une réponse tardive
  ou hors catalogue ne change rien. Événements `conseil` et `ambition`.
- **Ambition** : une seule par personne (but, cible, pensée, échéance) ; le moteur la vérifie
  chaque aube et la déclare accomplie ou abandonnée. C'est la trace visible de « où il va ».
- Sobriété inchangée : un appel à la fois, conseils espacés d'au moins vingt secondes réelles,
  quatre questions par jour simulé au plus, cinq jours de silence par personne.
- **v2 (M14)** : la foi (0..10, valeurs, héritage à moitié, miracles vus, une saison sans
  miracle) décide de l'attribution d'un miracle au ciel ou au hasard, avec la réputation du dieu
  (−10..10). Les prières sont une intention du cerveau à règles (`prier`, une par jour, foi ≥ 3,
  un besoin sous 40) ; le moteur en fait des événements `priere` (faveur +1, offrande à l'autel
  +2) et les tient ouvertes trois jours : un bienfait de sujet correspondant, sur la personne ou
  à dix tuiles, les exauce (foi +2, faveur +2). L'autel est un bâtiment ordinaire (famille logée
  de foi moyenne ≥ 5, un par village). Trois pouvoirs de plus : Troupeau offert, Idée soufflée,
  Loups au bord du halo (qui passe par le directeur de danger, jamais à côté). La fiche expose
  la question posée à Claude (motifs, options) et la réponse, pour que l'observateur voie ce que
  le moteur a proposé et ce que Claude a choisi.
- **v3 (M17)** : la météo imposée par un miracle (`meteoForcee`) remplace le tirage du jour sans
  toucher au flux de hasard ; le culte (foi moyenne des adultes) fixe la faveur maximale chaque
  aube ; les leçons du ciel viennent des prières (exaucées, sans réponse) et des épreuves
  attribuées ; la migration conseillée passe par le catalogue (`migrer:<direction>`), le
  planificateur bâtissant sur place à seize tuiles du vieux foyer.


## 8 quater. Le jeu du ciel tel que réalisé (M25)

- **[DÉCISION]** Deux façons de jouer, sans rien enlever à la simulation : la main sur le monde
  (WorldBox) et l'identité du ciel (Age of Mythology). Le viewer ne calcule toujours rien : il
  envoie des commandes (`sculpter`, `peupler`, `loi`, `domaine`, `creature`) que le moteur
  valide (`analyserCommande`) et applique ; tout se journalise (`divin`, `conteur`) et se
  sauvegarde (version 5, migration des versions antérieures).
- **Sculpter** : `Grille.modifierBiome` (le biome d'une tuile n'est plus figé), une couche de
  sculptures sauvée avec la grille et rejouée après la regénération ; `SuiviClient` renvoie les
  tuiles sculptées déjà connues du client (le viewer remplace le biome). Le pinceau découvre ce
  qu'il touche. Les tuiles bâties sont épargnées.
- **Peupler** : `genererGroupe` (familles neuves, identifiants qui suivent), un village par
  peuple ; `population.peuples` pour les rivaux du départ ; un monde à 0 habitant révèle le
  berceau et attend son premier peuple, gratuit.
- **Lois** : `Monde.lois` (faim, maladies, betes, raids, schismes, vieillesse, conteur), lues aux points
  d'ancrage (besoins, `tomberMalade`, contagion et épidémie, directeur de danger,
  `aubeVillages`, mort naturelle). Les tirages ont lieu même loi suspendue : mêmes flux.
- **Domaine, rang, paliers, coûts** : `EtatFaveur.domaine`, `rang` (culte + âge du cuivre),
  `usages` par saison ; `niveauRequis` et `coutEffectif` dans `divin.ts` ; `FaveurEtat`
  transporte `couts` et `verrous`. Un ciel sans visage n'a pas de verrou (les paliers sont le
  jeu d'un domaine) ; la providence respecte verrous et coûts.
- **Créatures** (`creatures.ts`) : un gardien (poste fixe, portée 12, chasse meutes et bandes,
  éteint la menace), un fléau (errance 6, nuisance 4, gisements −8 %/h, sécurité −8, moral −3),
  vingt jours ; une de chaque, rang 2, 30 ✦.
- **Conteur** (`conteur.ts`) : phases et durées (`DUREES`), tension et pression, clémence
  (`PRESSION_CLEMENCE` 60), épreuves et bienfaits qui passent par les mécaniques existantes
  (menace du directeur, `lancerBande`, `tomberMalade`, `forcerMeteo`, `ajouterTroupeau`), et
  la chronique du nouvel an bâtie sur les compteurs du journal (`compter`, types et détails).
  Au répit et au calme, le directeur de danger garde ses propres règles (jours de grâce,
  budget par saison) : le conteur ajoute, il ne remplace pas.


## 8 quinquies. Buts, échelle et distribution tels que réalisés (M26)

- **Buts** (`objectifs.ts`) : succès à conditions pures sur l'état et les compteurs du journal
  (`compter`, `generations`, `creaturesInvoquees`), scénarios (`FICHES_SCENARIO`, progrès 0..1
  et texte, perdu à l'année limite ou à l'extinction), prophéties formulées au premier jour
  d'une saison (une chance sur deux, jamais deux ouvertes) et jugées chaque aube ; tout dans
  `EtatObjectifs`, sauvé et migré. Le viewer n'évalue rien : `ButsEtat` arrive tout jugé.
- **Échelle** : la simulation tourne dans un Web Worker (`travailleur.ts`, inclus dans le
  paquet pour la page à fichier unique) et parle le protocole du serveur par `postMessage` ;
  la page garde la même `Liaison`. **[DÉCISION]** Pas de niveau de détail par distance : un
  cerveau allégé hors champ rendrait le monde dépendant de la caméra ; l'échelle se gagne par
  le travailleur et par le coût du tick (droits d'accès en un passage, parcours par morceau
  dans l'ordre d'avant, distances calculées une fois). Les peuples rivaux ont chacun un
  berceau (`OptionsGeneration.foyers`, sites tirés de la graine par `sitesDesPeuples`) ;
  `monde.foyers` vaut faux dans les sauvegardes d'avant (version 6), pour leur garder leur
  terrain.
- **Distribution** : manifeste, icône SVG et service worker dans `public/` (enregistré seulement
  en https hors de claude.ai) ; `dist:itch` fait le zip d'itch.io.

## 8 sexies. De vraies tuiles libres de droits telles que réalisées (M27)

M26 notait que les banques d'images libres de droits n'étaient pas joignables depuis
l'environnement ; l'utilisateur a déposé deux planches Kenney directement dans la session, ce
qui a levé le blocage.

- **Assets** (`assets/tuiles/`) : deux planches CC0 telles que téléchargées (aucune retouche),
  `roguelike/roguelikeSheet_transparent.png` (57×31 tuiles de 16 px, pas de 17 px) et
  `tiny-town/tilemap_packed.png` (12×11 tuiles de 16 px, sans pas) ; crédits et licence dans
  `assets/tuiles/CREDITS.md`.
- **Atlas** (`atlas.ts`) : chaque planche s'importe en `?inline` (force une URL `data:` quelle
  que soit sa taille, cf. `vite-env.d.ts`) et se charge une fois dans une `Image` ; `atlasPret()`
  vaut vrai une fois les deux décodées. `tuile(ctx, feuille, col, row, x, y, w, h)` découpe et
  dessine une case ; les fonctions exportées (`pin`, `pommier`, `buissonBaies`, `tasDePierre`,
  `tasDArgile`, `gemmes`, `mousserons`) fixent juste les coordonnées de grille et la taille.
- **Intégration** : `fond.ts` (forêt, collines givrées) et `sprites.ts` (`gisement()` pour
  pierre, argile, minerai, baies) appellent l'atlas à la place des anciennes formes vectorielles
  pour ces éléments précis ; bâtiments et gisements sans icône Kenney nette (poisson, gibier,
  fibres) restent en vectoriel. **[DÉCISION]** Le chargement étant asynchrone,
  `Rendu.fondMorceau()` ne met un morceau en cache que si `atlasPret()` — sinon le fond se
  redessine (sans les tuiles) à chaque image jusqu'au décodage, pour ne jamais figer un rendu
  incomplet.

## 8 octies. Demander conseil sans Claude telle que réalisée (M28)

Chaque appel à Claude (cerveau ambiant du §8 bis, demander conseil du §8 ter) coûte du crédit sur
le compte de la personne qui regarde la page ; à l'usage, ça en consommait trop. **[DÉCISION]**
Le moteur ne change pas (il validait déjà tout choix contre les options de la question ouverte,
quelle que soit leur origine) ; seule la page change de méthode pour répondre.

- **Le cerveau ambiant disparaît** : `claude.ts` (pensées, épitaphes, récits, boutons 🧠 Claude et
  💬 Conseils) est retiré du viewer avec son test. Chaque personnage garde sa pensée par défaut,
  écrite par le moteur (`p.pensee`, inchangée) ; plus aucun appel réseau ni capacité `sample`
  utilisée nulle part dans le viewer.
- **Demander conseil se répond au hasard dans la page** (`conseilLocal.ts`) : dès qu'une
  question s'ouvre (`magasin.etat.questions[0]`, lu au rafraîchissement du panneau), une option
  du catalogue est tirée au sort (uniforme, ou « aucun » s'il est vide) et envoyée comme
  `{type: "conseil", choix, pensee: ""}`, exactement ce qu'envoyait Claude — le moteur ne sait
  pas d'où vient le choix. Une question n'est répondue qu'une fois (dernier identifiant retenu),
  même si l'état la porte encore quelques rafraîchissements. **[DÉCISION]** Une première version
  laissait l'observateur choisir dans un dialogue modal, avec le tirage au sort après cinq
  secondes ; le dialogue encombrait l'écran à chaque question, il est retiré : ni réponse
  humaine, ni attente.
- Les textes de l'interface qui mentionnaient Claude pour les conseils (fiche personnage,
  journal, onglet Statistiques) sont reformulés ; ceux du cerveau ambiant disparaissent avec les
  boutons.

## 8 nonies. L'interface refaite telle que réalisée (M29)

Le diagnostic (captures ordi 1400×900 et téléphone 390×780) : densité, pas style. En-tête sur
deux rangées, quinze commandes toujours visibles, fil d'événements en quatre cartes qui
masquaient la carte (tout l'écran sur téléphone), huit onglets sur deux rangées, légende de six
lignes en permanence. **[DÉCISION]** L'ancien mode « plein écran » de la page (carte pleine,
barre et panneau flottants) était déjà la bonne cible : il devient l'unique disposition, fini
proprement, et les dispositions à colonnes disparaissent.

- **Structure** (`index.html`) : `#zone-carte` couvre la page (`inset: 0`, moins la barre du bas
  sur téléphone) ; dessus flottent `#hud` (une rangée : ☰, ⏸, vitesse, pastille
  `#horloge · #meteo · #vivants`, `#conteur`, `#btn-question`, ✨, 📋), `#calques`, `#prieres`,
  `#fil`, `#lois`, `#legende` + « ? », `#pouvoirs`. À côté : `#panneau` (le volet, `.ouvert`
  l'affiche), `#menu` (formulaire « Nouveau monde », 💾, +1 tick, → aube, `#vitesses`, ⚖️ Lois,
  ⛶ plein écran du navigateur, `#resume`, `#connexion`) et `#nav-bas` (téléphone seulement).
  Les identifiants que `main.ts` et `panneaux.ts` lisaient sont conservés ; seuls les doublons
  (`flot-*`, `btn-poignee`) et le titre sont retirés.
- **Règles** (`main.ts`) : `ouvrirMenu()` et `ouvrirVolet()` s'excluent ; `Panneaux.deplier()`
  ouvre le volet (sélection sur la carte, onglet demandé) et ferme le menu ; Échap ferme le menu
  s'il est ouvert, sinon désélectionne et ferme le volet ; ✕ de la fiche ferme le volet ; les
  boutons `[data-onglet]` sont lus dans toute la page, donc la barre du bas et les onglets du
  volet partagent le même état actif ; `#nav-carte` ferme tout. Le bouton ouvert se colore par
  `#app:has(#panneau.ouvert) #btn-panneau` (idem ☰).
- **Fil** : deux lignes (`li:nth-child(n+3)` masqué, une sur téléphone), chaque entrée sur une
  ligne avec points de suspension ; « aller voir » inchangé.
- **Téléphone** (`max-width: 900px`) : `--nav: 56px` ; `.ordi` masque ce qui n'a pas sa place
  (conteur) ; la pastille d'état passe en bloc sur deux lignes à 11 px sans météo ni vivants ;
  `#panneau` couvre l'écran entre la barre du haut et celle du bas ; `.pouvoirs` s'étire sur la
  largeur en deux rangées (`order`), pouvoirs puis outils, chacune défilant ; les prières en
  bandeau sous les calques repoussent le fil (`.prieres:not([hidden]) ~ .fil`).
- `panneaux.ts` n'écrase plus la classe du conteur (qui porte `ordi`) : il bascule la phase par
  `classList`.

## 8 decies. L'eau telle que réalisée (M30)

Avant : `eau_peu_profonde` praticable (coût 2,5), donc un gué partout, et chaque lac en est
ceinturé ; `eau_profonde` infranchissable sauf pirogue (objet en poche, `traverseEau` dans
l'A\*). **[DÉCISION]** L'eau peu profonde devient infranchissable à pied ; trois façons de
traverser, dans l'ordre où une colonie les gagne : le gué (donné), la pirogue (une invention),
le port (un bâtiment qui sert à tous). Le « radeau » envisagé n'apportait rien de plus que la
pirogue dans ce moteur ; il est écarté.

- **Biome `gue`** (`biomes.ts`, ajouté en fin de liste pour garder les codes) : praticable
  (coût 2), non constructible, sans gisement. Posé à la génération (`generation.ts`) : l'altitude
  devient une fonction `altitudeEn(x, y)` avec un cache par morceau, car `estGue` regarde
  jusqu'à trois tuiles au-delà du bord ; une tuile d'eau peu profonde est un gué si, sur un axe,
  son rang est le rang élu de sa bande de douze (`rangDeGue`, haché de la graine) et si la terre
  (altitude ≥ `SEUILS.mer`) est à trois pas au plus de chaque côté, sans eau profonde entre :
  toute la traversée est alors gué, en ligne droite. Le pinceau « eau » du ciel n'en pose pas.
- **A\*** (`chemin.ts`) : `OptionsChemin.ports` ; d'un port, la barque mène à tout autre port
  (un saut de coût distance × `COUT_EAU_PIROGUE`, admissible pour l'heuristique de Tchebychev) ;
  `coutChemin` et l'exécuteur paient le saut à la distance. `trouverCheminVers(grille, depart,
  estArrivee)` : la même recherche, heuristique nulle, vers la première tuile qui satisfait un
  prédicat ; `trouverChemin` en est un cas particulier (`chercher`).
- **Boire** (`planificateur.ts`) : `trouverCheminVers` jusqu'à une `riveConnue` (voisine d'une
  eau connue de la personne, ou d'un puits), 6 000 nœuds au plus. **[DÉCISION]** Avant, les
  trois tuiles d'eau connues les plus proches à vol d'oiseau, et abandon ; avec l'eau peu
  profonde fermée, leur « rive praticable » était parfois un îlot ou l'autre berge : quatre
  morts de soif sur la graine 7. Récolter saute de même les gisements sans terre à portée avant
  de compter ses essais.
- **Pêche** : `porteeRecolte("poisson") = 2` (`ressources.ts`), lue par `destinationPourAtteindre`
  (rayon paramétré), `allerPresDe` et `tickRecolter`.
- **Port** (`batiments.ts`) : bois 20, pierre 6, corde 4, travail 60. `prochainBatimentNecessaire`
  le propose après le four : pirogue maîtrisée (force 1), `lieuxEauConnus ≥ 25`, aucun port à
  moins de 40 tuiles. `sitePortuaire` : terre constructible libre voisine d'eau à douze tuiles
  des bâtiments familiaux, l'eau profonde à côté préférée. `portsDe(monde)` liste les ports
  achevés pour l'A\* (exécuteur, `allerPresDe`, `allerSur`, exploration). Le conseil propose
  « bâtir : port ». Viewer : `sprites.port` (ponton, barque), couleurs et libellés.
- Tests (`eau.test.ts`) : eau peu profonde fermée, gué ouvert ; pirogue ; saut de port à port
  (chemin, coût, port seul) ; `trouverCheminVers` (rive atteignable, pas l'îlot) ; génération
  (gués présents, rares, étroits, rive à rive). `actions.test.ts` ne marche plus sur l'eau.
  Calibration graine 7, 240 jours : ≥ 12 vivants tenus ; poisson −28 %.

## 8 undecies. Bâtiments et personnages en sprites tels que réalisés (M31)

Deux planches CC0 de plus dans `assets/tuiles/` (voir `CREDITS.md`), importées en `?inline`
comme celles de M27 : `medieval-rts/medievalRTS_spritesheet.png` (atlas 550 × 550, rectangles
recopiés de son XML) et `roguelike-characters/roguelikeChar_transparent.png` (54 × 12 tuiles de
16 px, pas 17). `atlasPret()` attend les quatre planches avant de mettre un fond en cache.

- **Bâtiments** (`atlas.ts` `structure(ctx, nom, x, y, largeur)`) : le sprite est ancré au sol
  (bas à y + 0,98), `largeur` tuiles de large, hauteur proportionnelle ; `rendu.ts` pose d'abord
  `sprites.ombreSol` puis le sprite, et retombe sur le vectoriel si la planche n'est pas décodée.
  Correspondances : abri → Structure_08 (tente, 0,9), maison → 17 ou 18 selon `bruit(x, y, 31)`
  (1,0), entrepôt → 09 (grange, 1,15), four → 19 (1,05), fumoir → 20 (1,05 ; `sprites.fumee`
  reste, sur la cheminée), puits → 12 (0,55), autel → 23 (sanctuaire, 0,95). **[DÉCISION]**
  Tombe, stèle, enclos, champ, palissade, feu de camp, port et chantiers restent vectoriels :
  animés (feu, champ par stade) ou sans équivalent dans la planche.
- **Personnages** (`atlas.ts` `spritePersonnage(couches)`) : un canevas 16 × 16 composé une
  fois par apparence et mis en cache (clé = teint, cheveux, sexe, coiffure, couleur, outil,
  malade, banni ; vidé au-delà de 2 000). Couches, dans l'ordre : corps (colonne 0, ligne 0 clair,
  1 hâlé, 2 mat ; foncé = ligne 2 multipliée par `#a07858` ; malade = multiplié par `#c9d8c6`),
  tunique blanche (10, 4) multipliée par la couleur de famille, cheveux (blocs de 4 × 4 : bruns et
  châtains (19, 0) — châtains éclaircis —, roux (23, 0), blonds (19, 4), noirs (23, 4), gris
  (19, 8) ; coiffure = `coiffureDe(id)` ∈ 0..2, hommes (0,0) (2,0) (3,0), femmes (1,0) (1,1)
  (3,1)), outil (hache 51, pioche 50, lance 42, arc 52, canne 44 (bâton), marteau 49 ; ligne 0
  pierre, ligne 7 cuivre). Banni : le composé multiplié par `#8a8a90` sous son propre pochoir.
  La teinte se fait par `multiply` puis `destination-in` sur un brouillon partagé.
- **Dessin** (`sprites.personnage`) : si `couches` est donné et la planche décodée,
  `personnageEnPixels` : 1,05 × échelle de côté, pieds au sol ; endormi = tourné de −90° et un
  « z » ; en marche, montée de 0,05 × |sin| et roulis de ±0,07 rad ; ventre de grossesse, bandeau
  de blessure, « ! » et étoile (`insignes`) par-dessus. Sinon la figure vectorielle d'avant.
  `rendu.ts` met `imageSmoothingEnabled` à faux à partir de `SEUIL_PIXELS = 14` px par tuile
  autour des boucles de personnages et de bandes (les bandes : hâlé, noirs, tunique `#5a5a60`,
  lance).
- **Protocole** : `PersonnageEtat.outil: string | null`, calculé par `outilEnMain` dans
  `instantane.ts` (donc pour le serveur comme pour le mode local) : recolter bois → hache
  (cuivre si possédée, sinon pierre) ; pierre, minerai, cuivre → pioche ; poisson → canne (canne
  ou filet) ; gibier, abattre, défendre, veiller → arc puis lance ; construire, réparer →
  marteau ; sinon null.
- Pas de test de rendu (le viewer se teste sans DOM) ; vérifié par captures Playwright, ordi et
  téléphone, jour et nuit.

## 8 duodecies. La guerre qui se voit telle que réalisée (M32)

Avant : `villages.ts:bataille()` mesurait deux forces à l'aube et appliquait blessures, un mort
au plus, butin et peur, en un tick. **[DÉCISION]** La bataille devient un objet du monde qui
dure (`monde/bataille.ts`, `EtatVillages.batailles`), les combattants de vrais personnages qui
marchent et frappent ; le viewer anime les coups. Déterministe (les frappes tirent sur le
générateur du personnage), sauvegardé structurellement (drapeau `bataille` par personnage,
`batailles` par défaut sur les mondes d'avant).

- **Levée** (`aubeBatailles`, après `aubeVillages`) : pour chaque relation en guerre sous
  `BATAILLES_MAX`, dix jours après la précédente et trois après la déclaration, `leverTroupe` :
  le camp le plus fort (`forceDe` × 0,8–1,2) attaque ; `guerriersDisponibles` (adultes, santé
  ≥ 60, ni malade ni enceinte, sans plaie qui saigne, triés par force) → 60 % d'entre eux, de
  deux à `GUERRIERS_MAX = 12`. Une bataille à la fois. Sans troupe : `faireLaPaix`. Événement
  `village/marche`.
- **Marche** : `drapeaux.bataille` ; `RuleBrain.urgence` renvoie `combattre` avant tout ;
  `planifierCombat` → `marcherVers(lieu, RAYON_ASSAUT = 6)` (chemin d'un coup ou vingt tuiles
  dans la direction, comme `migrer`). Deux jours au plus (`DUREE_MARCHE_MAX`), sinon trêve.
- **Assaut** (`tickBatailles`, chaque tick avant les personnages) : un attaquant à six tuiles du
  lieu → phase `combat`, `leverLaDefense` à `RAYON_DEFENSE = 40` (les plus proches d'abord,
  plafond `RATIO_DEFENSE = 1,5` × troupe, cumulé sur la bataille), alerte et stress du
  village, événement `village/assaut`. Les retardataires s'enrôlent chaque tick jusqu'au
  plafond.
- **Combat** : sur le champ (`RAYON_CHAMP = 8` autour du lieu ; hors du champ, on y revient ;
  un adversaire hors du champ n'est pas poursuivi), `adversaireLePlusProche`, `allerPresDe`
  tronqué à deux pas, puis action `combattre` (`CADENCE_FRAPPE = 3` ticks) → `frapper` :
  chance = 0,35 + `bonusArme` (lance 0,2, hache de cuivre 0,15, arc 0,12, hache 0,1) + 0,03 ×
  niveau de chasse − 0,05 si cuir − 0,1 si le défenseur est à trois tuiles d'une palissade,
  bornée à [0,1 ; 0,85] ; touché : `blesser` coupure de gravité 1/2/3 (60/35/5 %) ; mort si
  santé ≤ 15 après un coup de gravité ≥ 2, une fois sur deux. Chaque coup, manqué ou non, va
  dans `frappes` (quarante gardés). L'adversaire qui a bougé termine l'action sans échec.
- **Retrait** : chaque tick, morts et blessés sous `SANTE_FUITE = 40` quittent leur camp,
  drapeau levé, intention `fuir`. Non-combattants à douze tuiles d'un combat : `menacePercue`
  renvoie une menace sans cible → `fuir`.
- **Fin** (`conclure`) : camp vide ; **déroute** (au quart de la force, ou un seul) face à un
  camp qui tient ; avant tout contact, `DUREE_COMBAT_MAX = 72` ticks → le camp sur le champ
  l'emporte (village désert pris, troupe dispersée) ; après contact, `TICKS_SANS_CONTACT = 24`
  sans les deux camps sur le champ → celui qui reste l'emporte, ou trêve ; 72 ticks de contact
  → trêve. Puis les effets de M21 : `r.batailles`, compteurs, butin (20 % des vivres du perdant
  vers le stock du gagnant, plafonné à vingt), bâtiments à huit tuiles −20 de solidité,
  stress 15 et sécurité −25 pour tous, attitude −10 ; événement `village/bataille` (`issue`,
  `gagnant` nullable, `blesses` = coups portés, `morts`, `butin`, `numero`, `duree`). Les
  batailles finies restent un jour dans l'état (`REMANENCE`), puis s'effacent.
- **Camps virtuels (M32c)** : un `Camp` porte `bande` ou `meute` et des `membres`
  (`{id, x, y, sante, santeMax, cadence}`) ; `positionDe` et `adversaireLePlusProche` lisent
  indifféremment un personnage ou un membre, `frapper(monde, b, de, vers)` aussi (un membre
  frappe à 0,3 de chance ; morsure des loups avec la gravité et le cuir de M10 ; un personnage
  inflige à un membre 10 + 50 × bonus d'arme + 2 × niveau de chasse). `agirMembres` chaque
  tick : un pas (Tchebychev, sans quitter le champ) vers l'adversaire le plus proche, puis un
  coup à la cadence. `lancerRaid` (depuis `heureVillages`, à la place du pillage instantané,
  quand aucune bataille ne court) : phase `combat` d'emblée, pillards à `SANTE_PILLARD = 60`,
  bande en état `combat` (ignorée par `heureVillages`), défense levée à quarante tuiles ;
  `conclureRaid` : vainqueurs → le pillage de M21 (`PART_PILLAGE`, bâtiment ébranlé, peur) et
  état `pille` ; sinon état `repousse`, compteur `raidsRepousses`, événement `raid/repousse`.
  `lancerBatailleMeute` (depuis `heureDeDanger`, à la place de `combattre`) : loups à
  `SANTE_LOUP = 30`, défenseurs = `defenseursAutour` de la proie, retardataires à dix tuiles,
  la meute suit le barycentre de ses membres ; `conclureMeute` : `taille` = survivants,
  `faireFuir`, faim, un événement `combat` (`issue` repoussés / fuite / mort selon les morts,
  `rounds` = durée / cadence, `loupsTues`, `victime`). Les troupeaux à zéro s'effacent au tick.
  `combattre` de M10 reste (tests) mais n'est plus appelé par la simulation.
- **Protocole** : `BatailleEtat` (`CampEtat` avec `nom`, `guerriers`, `forceInitiale`,
  `blesses`, `morts` ; `x`, `y`, `rayon` ; ticks ; `issue` ; `frappes`). `declarerGuerre`
  (exporté, `?guerre` du mode local) déclare et date la guerre pour qu'une troupe parte à
  l'aube suivante ; le mode local la lève sur-le-champ.
- **Viewer** : `Magasin.coups` (les frappes nouvelles par bataille, échelonnées de 90 ms,
  520 ms chacune ; pas d'animation à plus de vingt-quatre ticks du présent), `batailleActive`,
  `combattants`. `rendu.ts` : cercle du champ, anneaux de camp, élan (0,38 tuile vers
  l'adversaire sur les six premiers dixièmes), éclat à l'impact (blanc manqué, rouge porté),
  barre de vie en pixels (26 × 4, vert/jaune/rouge, tiret de camp) dès cinq pixels par tuile,
  chiffre des dégâts qui monte et s'efface. Les membres virtuels (`CampEtat.membres`, avec
  `bande`/`meute`) ont leurs trajets interpolés, se dessinent un par un (pillards gris lance au
  poing, loups) avec anneau et barre de vie, et le groupe (bande, meute) se cache pendant la
  bataille (`groupesEnBataille`). `panneaux.ts:jauge()` → `#bataille` (titre
  cliquable « aller voir », deux barres de force, morts), gardée trente-six ticks après la fin.
- Tests : `core/test/bataille.test.ts` (levée, marche, assaut, conclusion, drapeaux levés,
  journal ; même graine, même bataille ; sauvegarde en cours de route), `viewer/test/bataille.test.ts`
  (coups animés une fois, échelonnés, effacés ; rattrapage muet ; camps).

## 8 terdecies. Le dieu et la guerre tel que réalisé (M33)

- **Pouvoirs** (`protocole` : `POUVOIRS` + `guerre`, `apaiser` ; fiches ; `NIVEAU_POUVOIR`
  2 et 1 ; `FICHES_DOMAINE` : `guerre` favori du Feu, `apaiser` des Songes) ; `divin.ts` :
  `sonnerLaGuerre(monde, pos, rng)` — `villageLePlusProche` (trente tuiles), le pire voisin par
  attitude puis distance, `declarerGuerre` puis `leverTroupe(…, attaquantForce = a)` (nouveau
  paramètre : le village visé attaque, quel que soit le rapport de forces) ; refus
  `sans_effet` si la loi dort, si une bataille court, s'il n'y a qu'un village ;
  `apaiser(monde, pos)` — `conclure(b, "treve")` sur la bataille active (tout genre), sinon
  `faireLaPaix` sur chaque relation en guerre du village le plus proche, sinon `sans_effet`.
  Après un `foudre` réussi, `frappeDuCiel(monde, pos)` : sur la bataille active en combat, tout
  combattant à deux tuiles reçoit une frappe `de: "ciel"` (membre : −40 de santé, retiré à
  zéro ; personnage : 20 consignés, la brûlure venant du pouvoir lui-même), et l'effet s'en
  fait l'écho.
- **Gardien** : `gardienRepousse(monde, creatures)` au tick, après `tickBatailles` : un gardien
  à dix tuiles du lieu d'un raid ou d'une meute en combat conclut en faveur des défenseurs,
  `faits += 1`, événement `divin` de pouvoir `gardien_repousse`.
- **Loi `guerres`** (`LOIS`, `FICHES_LOI`, `loisParDefaut`, migration par défaut) : `aubeVillages`
  reçoit `lois.guerres` ; `diplomatie` ne déclare rien et fait la paix des guerres en cours
  quand elle dort ; `aubeBatailles` n'est pas appelée.
- Viewer : `dessinerEffet` pour `guerre` et `apaiser` ; la barre des pouvoirs et la liste des
  lois se construisent des catalogues, rien d'autre à câbler.
- Tests (`guerre-divine.test.ts`) : Sonner la guerre (guerre déclarée, troupe en marche, le
  village visé attaque, sans effet pendant la bataille) ; Apaiser (trêve, drapeaux levés, puis
  paix, puis sans effet) ; loi suspendue (refus du pouvoir, paix à l'aube, rien ne se déclare) ;
  foudre sur un pillard (frappe du ciel, santé 20) et gardien qui repousse le raid.

## 8 quaterdecies. Écussons et fanfare tels que réalisés (M34)

- `format.ts` : `emblemeVillage(id)` (huit signes, indexés par la teinte du village) à côté de
  `couleurVillage`. `rendu.ts` : `fanion(ctx, x, y, couleur, hauteur, embleme?)` (hampe,
  triangle, emblème blanc) ; une bannière de 0,7 tuile au centre de chaque village dès quatre
  pixels par tuile, un fanion de 0,32 sur maison, entrepôt et abri dès huit pixels par tuile
  (famille → village par `villages[].familles`), l'emblème à la couleur du village devant
  l'étiquette du nom, un liseré de village à droite de la barre de vie. Tout cela seulement
  quand le monde compte plus d'un village.
- `main.ts` : `fanfare(m)` après chaque état : une bataille en phase `combat` dont
  `combatTick` est à six ticks au plus de l'état, jamais vue (`bataillesVues`), déclenche
  `allerVoir(x, y)` et, si le monde n'est pas en pause, une commande `pause` puis `reprendre`
  une seconde plus tard. Case `#fanfare-case` dans le menu, persistée sous `sdv.fanfare`.
- Pas de test (rendu et câblage DOM) ; vérifié par captures.

## 8 quindecies. Pillage complet et conquête tels que réalisés (M35)

- `conclureGuerre` : `pris = issue === "attaquant"` ; `piller(monde, camp, gagnant, perdant, part,
  outilsAussi)` retire de chaque stock du perdant `part` de chaque nourriture
  (`PART_PILLAGE_PRIS = 0,5` pris, `PART_RAZZIA = 0,2` sinon) et, si pris, tous ses `objets` ;
  le butin va d'abord dans les inventaires des guerriers vainqueurs vivants (`ajouter`,
  `ajouterObjet`, dans l'ordre du camp), le reste au premier stock du vainqueur ; l'événement
  `bataille` porte `butin`, `outils`, `pris`. **[DÉCISION]** Plus de plafond à vingt ni de
  conversion en poisson fumé : on rapporte ce qu'on a pris.
- `peutConquerir(monde, gagnant, perdant)` : au moins deux villages, `jour −
  derniereConqueteJour ≥ JOURS_ENTRE_CONQUETES = 360`, `forceDe(perdant) × RAPPORT_CONQUETE (2)
  ≤ forceDe(gagnant)`, appelé seulement quand le village est pris. `conquerir` : pour chaque
  habitant du vaincu, prestige 0, stress 20, sécurité −30, ambition `migrer` (cible le
  vainqueur, destination `siteLibre(centre, 6)` ou le centre), plan et projet remis à zéro, un
  souvenir ; `gagnant.enRoute` reçoit leurs identifiants (le recentrage attend leur arrivée,
  `arriveeDesMigrants` émet `fonde` quand tous sont là) ; familles ajoutées au vainqueur,
  village retiré de `villages`, relations qui le nomment retirées, bandes qui le visent
  parties, caravanes qui le touchent perdues ; `derniereConqueteJour`, `compteurs.conquetes`,
  `societe.tension + 15` ; événement `village/conquete` (`familles`, `habitants`, site).
  Sauvegarde : valeurs par défaut sur les mondes d'avant. Les anciens bâtiments restent aux
  familles (loin du nouveau centre, hors des stocks du village) et s'usent.
- Viewer : textes `bataille` (outils, « le village est pris ») et `conquete`.
- Tests (`bataille.test.ts`) : village pris → moitié des vivres et les outils dans les poches
  des vainqueurs ou leur stock, conquête (village disparu, familles passées, migrants en
  route, ambitions, événement, compteur) ; `peutConquerir` refuse une seconde conquête dans
  l'année et un vaincu trop fort.

## 8 sedecies. La rancune des vaincus telle que réalisée (M37)

- `conquerir(monde, gagnant, perdant, vainqueurs)` reçoit les guerriers du camp gagnant : chaque
  habitant conquis prend `relationAvec(p, id).rancune += RANCUNE_CONQUETE (40)` envers chacun
  d'eux ; puis pour chaque famille du vaincu, `villages.vaincus` reçoit `{ famille,
  ancienVillage, ancienNom, site, vainqueur, jour }` (type `Vaincu`, exposé au viewer en
  `VaincuEtat { famille, ancienNom, vainqueur, jour }`).
- `peutSeRevolter(monde, v)` : `jour − v.jour ≥ JOURS_AVANT_REVOLTE (60)` ; la famille est
  encore dans `vainqueur.familles` ; `vainqueur.enRoute` vide et aucune bataille active ; au
  moins trois adultes vivants de la famille ; et `societe.tension ≥ TENSION_REVOLTE (60)` ou
  force des siens (2 par lance ou arc, 1 sinon) `≥ RAPPORT_REVOLTE (0,5) ×` force du reste du
  village ; moins de huit villages. Une entrée dont la famille a disparu ou dont le vainqueur
  n'existe plus est purgée.
- `revolter(monde, v)` : nouveau village `v-N` au nom `ancienNom` et au site d'avant, familles
  de l'entrée (et toute autre entrée du même ancien village chez le même vainqueur) retirées
  du vainqueur ; chaque habitant reçoit une ambition `migrer` vers le site (comme un schisme),
  `enRoute` du nouveau village ; `relationEntre` attitude −60, casus belli « la conquête » ;
  `societe.tension − 20` ; `compteurs.revoltes` ; événement `village/revolte` (`village`,
  `nom`, `de`, `deNom`, `famille`, `partants`, site). `aubeRevoltes(monde)` (appelé à chaque
  aube par `nouveauJour`) purge et déclenche au plus une révolte.
- Viewer : texte `revolte`, paragraphe « 🏴 Vaincus qui rongent leur frein » du panneau
  Villages. Sauvegarde : `defauts(brut.villages, { vaincus: [] })`, `compteurs.revoltes`.
- Tests (`bataille.test.ts`, « M37 ») : conquête → entrée `vaincus` (nom et site), rancune ≥ 40
  envers un guerrier vainqueur, pas de révolte avant le délai ; entrée vieillie et tension à
  100 → `revolter` recrée le village au nom et au site d'avant, familles passées, ambitions,
  relation −60 et casus belli, événement, compteur.

## 8 septdecies. La grammaire d'invention telle que réalisée (M38)

- **Matières** (`savoirs/grammaire.ts`, `FicheMatiere`) : `id`, `nom`, `ressource` (la ressource
  du monde qui la porte, `null` si dérivée), `parents`, `procede`, `durete`, `tenue`,
  `isolation`, `souplesse`, `rarete`, `couleur`, `rang`, `fusible`. Huit brutes :
  bois, pierre, fibres, argile, cuir, corde, minerai, cuivre (les deux dernières fusibles).
- **Procédés** (`PROCEDE`) : tailler, tresser, assembler, cuire, fondre, allier, tremper,
  polir. Chacun porte ses facteurs sur les quatre propriétés, son atelier (`null`, `feu`,
  `four`), son niveau d'artisanat, une exigence (`{propriete, seuil}`) et `derive` (fondre,
  allier, tremper produisent une matière au lieu d'un objet).
- **Fonctions** (`FONCTION`) : couper, creuser, pêcher, chasser, porter, tenir chaud, conserver,
  soigner, frapper, bâtir. Chacune nomme son **levier**, la **propriété** qui décide de sa
  valeur, un `gainMax` et les procédés qui peuvent la servir. Douze leviers : `recolte_bois`,
  `recolte_pierre`, `recolte_poisson`, `recolte_gibier`, `recolte_minerai`, `solidite`,
  `conservation`, `chaleur`, `soin`, `combat`, `portage`, `batisse`.
- **`deriverMatiere(e, rng, procede, parents)`** : refuse un procédé non dérivant, un parent non
  fusible, ou une matière sous le seuil du procédé ; les propriétés tiennent des parents (la
  meilleure tirée vers la moyenne) puis du procédé, avec une part de hasard (−10 % à +25 %) ;
  le nom vient de `NOMS_METAUX` (bronze, laiton, fer, acier…) puis d'un générateur racine +
  suffixe sans répétition ; `rang = max(parents) + 1`, `fusible` toujours vrai, teinte moyennée.
- **`composerTrouvaille(e, fonction, procede, matiere)`** : `combinaisonValide` exige que le
  procédé serve la fonction, ne dérive pas, et que la propriété qui décide, une fois le procédé
  appliqué, atteigne 40. Le gain vaut `gainMax × part² × avancement`, où `part` est cette
  propriété sur 100 et `avancement = 0,55 + 0,45 × min(1, rang/3)` — **[DÉCISION]** une matière
  brute ne donne qu'une part du gain possible, la chaîne fait le reste. Coût :
  `ingredientsDe` remonte la chaîne jusqu'aux ressources brutes, moitié plus cher à chaque
  niveau, plafonné à douze par ressource. **L'identifiant est le triplet**
  (`t:<fonction>.<procede>.<matiere>`) : deux personnes qui ont la même idée ont la même.
- **Effets** : `bonusPorte(e, inv, levier)` (le meilleur objet en main, jamais cumulé),
  `bonusSu(e, savoirs, levier)` (ce qu'un groupe sait, pour un bâtiment), `objetDuLevier`
  (l'objet qui sert, pour l'user). Branchés sur la récolte (rendement et usure), la chasse
  (portée, chance de toucher, usure), `bonusArme` au combat, la pourriture des stocks et du sac,
  la perte de chaleur, le soin (un bon pansement assainit la plaie) et le travail de chantier.
- **Recherche** (`savoirs/recherche.ts`) : `problemes(monde, p)` rend les ennuis mesurables
  triés par poids (faim selon les gisements vus, froid, pourriture, plaies, mains pleines,
  guerre, bois, roche, chantier), chacun lié à une fonction et à une plainte. `matieresConnues`
  (en poche, en stock accessible, ou vues ; les dérivées seulement si `p.matieresSues` les
  porte), `procedesPossibles` (niveau et ateliers). `chercher` raisonne d'abord
  (`meilleurRemede`, sans hasard), puis tire **une seule fois** ; l'idée est retenue à force
  `SEUIL_SAVOIR`, avec `probleme`, `inventeur`, `village`, `jour`. `oublierIdees` efface au bout
  de `JOURS_IDEE` (30, porté à 90 en M41). `melanger` : devant un four, un curieux (ouverture ≥ 0,45) mêle deux
  matières qu'il a en quantité, la coulée les consomme, la famille apprend la matière.
- **Fabrication** : `recetteDeTrouvaille` rend une `Recette` ordinaire ; `planifierFabrication`
  et `tickFabriquerTrouvaille` suivent le chemin du catalogue (idée requise, niveau, matières,
  atelier), un prototype sur trois rate **sans consommer les matières**, la réussite met le
  savoir à 1 pour la personne et sa famille, émet `invention`, et `apprendreMatiere` transmet la
  matière avec la trouvaille (au four comme au dialogue).
- **Cerveau** : `perception.moi.trouvaillesAFaire` ne propose que ce qu'on sait mener (niveau,
  atelier) et dont **on a les matières en poche** — **[DÉCISION]** sans cela, les gens
  passent leurs journées à courir après des matières au lieu de manger, et la colonie y perd.
  M41 rouvre la porte, mais seulement pour sa propre idée et quand on ne manque de rien.
- **Viewer** : onglet Inventions (arbre des matières, trouvailles éprouvées, idées en chantier et idées perdues,
  avec gain, levier en clair, plainte d'origine, inventeur, prototypes ratés, coût, porteurs),
  icône 🛠️ dans la fiche et les statistiques, `PersonnageEtat.outilCouleur` qui teinte le sprite
  de l'outil à la couleur de sa matière, textes `idee` (avec la plainte), `matiere`.
- **Tests** : `grammaire.test.ts` (11 : matières brutes, alliage plus dur et chaîne qui
  continue, refus d'un procédé ou d'une matière qui ne s'y prête pas, nom et recette déduits du
  triplet, coût de la chaîne, meilleure matière = meilleur gain, levier qui ne joue que pour qui
  porte, fabrication réelle dans le monde, déterminisme, sauvegarde, migration) ;
  `recherche.test.ts` (10 : rien à signaler chez qui ne manque de rien, froid traduit en fonction,
  idée née d'un ennui avec son inventeur, pas deux fois la même ni moins bien, idée qui s'efface,
  matière tirée du four qui coûte ce qu'on y met, et une colonie sur deux cents jours qui trouve,
  rate et finit par réussir) ; `instantane.test.ts` (2 : l'état envoyé au viewer).

## 8 octodecies. L'enceinte, les enclos et les sprites de ferme tels que réalisés (M39)

- **Enceinte** (`monde.ts`) : `enceinteDe(monde, p)` rend l'enceinte du village de la personne,
  et la **fige** dans `Village.enceinte = { centre, rayon }` au premier appel — **[DÉCISION]**
  sans cela le centre du village bouge quand il grandit, le rayon aussi, et l'on dresse un
  nouvel anneau en laissant l'ancien debout : ce sont ces anneaux empilés qui donnaient des
  pieux partout. `rayonEnceinte` prend le rayon où se tient déjà le plus de pieux, sinon de quoi
  contenir ce qu'on a bâti (`RAYON_ENCEINTE = 3` à `RAYON_ENCEINTE_MAX = 7`).
  `tuilesEnceinte(monde, centre, rayon)` parcourt l'anneau dans le sens des aiguilles d'une
  montre et **rattrape d'un pas** (intérieur puis extérieur) toute tuile qu'on ne peut pas bâtir,
  sans doublon ; l'eau et la montagne ferment d'elles-mêmes et ne sont pas rattrapées.
  `tuileEnceinteManquante` rend la plus proche du bâtisseur.
- **Portail** : bâtiment `portail` (bois 3, fibres 2, travail 5, ascii `=`).
  `siteDuPortail(monde, p)` attend `PART_ENCEINTE_POUR_PORTAIL = 0,6` de l'anneau dressé, refuse
  s'il en existe déjà un, et choisit le pan le plus proche de l'eau connue du centre.
  `prochainBatimentNecessaire` rend `palissade` tant qu'il manque un pan, puis `portail`. Il
  compte comme un mur pour `enclos()` (tout bâtiment terminé ferme), et les bâtiments ne
  bloquent pas les déplacements : un anneau clos n'enferme personne.
- **Enclos** : le site préfère une tuile aux voisines libres (`(8 − libres) × 3` au score), pour
  que le parc de trois tuiles de côté tienne. `placeAuParc` répartit les bêtes sur les huit
  cases du piquet, dans l'ordre de leurs identifiants.
- **Sprites de ferme** (`atlas.ts`, planche *Tiny Farm*, 12×11 tuiles de 16 px sans pas) :
  `solLaboure` (0, 4), `culture(stade 1..3, variante)` (colonnes 4 à 6, lignes 0, 2, 3, 4, 5),
  `beteFerme` (mouton (0, 10), vache (1, 10)). `atlasPret()` attend les cinq planches.
- **Dessins** (`sprites.ts`) : `champ(..., variante)` pose le sol puis la culture ;
  `palissade(ctx, x, y, liens)` prend les côtés par lesquels le mur se raccorde (`rendu.ts`
  indexe les pans de la trame dans `murs` et les lit par `liensMur`) ; `portail` ; `parc` (une
  clôture close de trois tuiles de côté, portillon au sud, mangeoire au piquet) ; `bete` choisit
  le sprite de ferme s'il existe, sinon dessine l'espèce (cerf, sanglier, lièvre, loup).
- **Planche d'essai** : `packages/viewer/essai/index.html` (source `src/essai/planche.ts`),
  bâtie à part (`vite build essai`), affiche champs, murs, parc et bêtes côte à côte.
- **Figures** (M40, `atlas.ts`) : `figure(ctx, nom, x, y, w, h)` tire de la planche *Tiny
  Dungeon* (12×11 tuiles de 16 px, sans pas) le gardien (0, 8), le fléau (1, 10) et le pillard
  (3, 7) ; faux si la planche n'est pas prête, l'appelant garde alors son dessin.
  `rendu.ts` remplace le glyphe des créatures du ciel et, par `dessinerPillard`, la silhouette
  grise des bandes — sur la carte comme parmi les combattants virtuels d'une bataille.
  **[DÉCISION]** Trois tuiles seulement : les sorciers et les monstres de cette planche
  feraient basculer un monde d'âge de pierre dans la fantasy.
- **Interface** (M39c, `style.css`) : quatre tuiles de l'*UI Pack Pixel Adventure* dans
  `src/assets/ui/`, posées en `border-image` (découpe à 8 px, `fill`, `image-rendering:
  pixelated`) sur `#hud > button`, `#pouvoirs button`, `#outils button`,
  `#btn-fermer-panneau`, `#aide` et `#bataille .barre`. **[DÉCISION]** Rien d'autre : sur le
  volet et les listes, le cadre mange le contraste.
- **Défricher** (M39d) : action et intention `defricher { cible }`. `tickDefricher` exige d'être
  à une tuile, l'outil du gisement (`outilSatisfait`), une tuile non bâtie ;
  `TICKS_DEFRICHAGE = 14` moins le niveau de récolte ; ramasse six unités au plus du gisement,
  puis `modifierBiome(..., "prairie")` si c'était de la forêt (il retire le gisement au passage),
  sinon retire le gisement seul ; événement `defrichage` (`ressource`, `quantite`, `ouvert`).
  `planifierFondation` se rabat sur `siteADefricher` quand `choisirSite` ne trouve rien :
  la tuile la plus proche du foyer, pondérée par ce qui reste au gisement
  (`distance + quantite × 0,35`) — **[DÉCISION]** on ne rase pas un gisement encore riche.
  Tests (`defrichage.test.ts`, 4) : l'outil et la distance ; la tuile dégagée, la forêt ouverte
  et le bois ramassé ; un tas de pierres qui ne change pas le sol ; le choix du plus maigre.
- **Tests** (`enceinte.test.ts`, 6) : le centre est celui du village ; le rayon contient ce qu'on
  a bâti sans dépasser sa borne ; l'anneau est continu, sans doublon, et rattrapé de deux pas au
  plus (M41) ; le portail attend que le mur tienne, se taille une fois, du côté de l'eau ; les bêtes du
  parc se répartissent autour du piquet. Le test des murs de M10 suit la nouvelle règle.

## 8 novodecies. Les idées qui aboutissent et le mur qui ferme (M41)

- **Quête de matières** (`cerveau/perception.ts`) : `trouvaillesAFaire` accepte qu'une matière
  manque en poche si un **stock accessible** la porte, à deux conditions —
  c'est **sa propre** idée (`acquis.force < 1`, donc pas une recette apprise de la famille) et
  l'on ne manque de rien (`faim ≥ 55`, `chaleur ≥ 45`, pas de `prudenceNourritureJusqua` en
  cours). **[DÉCISION]** La quête sans condition faisait passer les journées à bricoler au lieu
  de manger ; l'interdire tout à fait laissait mourir les idées qui demandaient cinq cuivres.
- **`JOURS_IDEE = 90`** (30 auparavant) : une idée retenue a trois mois pour trouver ses
  matières, sans quoi `oublierIdees` l'efface de la tête de qui l'a eue.
- **Choix réalisable** (`savoirs/recherche.ts`) : `matieresAPortee(monde, p, t)` dit si poche et
  stocks accessibles couvrent la recette. `meilleurRemede` note chaque candidate
  `gain × (à portée ? 1 : 0,6)` : à gain proche, on préfère ce qu'on peut réunir.
- **Registre purgé** (`oublierTrouvailles(monde)`, à l'aube dans `Simulation`) : une trouvaille
  qu'aucun vivant ne connaît (`force > 0`), dont aucun exemplaire ne traîne (poche ou stock), et
  née depuis plus de `JOURS_IDEE`, sort de `monde.trouvailles`. L'identifiant venant du triplet,
  la même idée peut renaître chez quelqu'un d'autre ; le nombre renvoyé sert aux tests.
- **Protocole et viewer** : `TrouvailleEtat.porteursIdee` (vivants qui l'ont en tête sans l'avoir
  réussie) ; l'onglet Inventions sépare **Idées en chantier** (`porteursIdee > 0`) et **Idées
  perdues** (personne).
- **`RAYON_ENCLOS` : 6 → 16** (`monde/danger.ts`). **[DÉCISION]** L'enceinte de M39a va jusqu'au
  rayon sept, et l'intérieur d'un tel anneau est à six tuiles de son centre : `enclos()`
  déclarait « dehors » quelqu'un debout au milieu d'un mur parfaitement clos, donc la palissade
  ne protégeait plus personne. La fouille reste bon marché : à ciel ouvert elle sort en seize
  pas, enfermée elle est bornée par l'aire de l'enceinte.
- **Anneau continu** (`tuilesEnceinte`, `monde.ts`) : le rattrapage se fait **perpendiculairement
  au mur** (sur un bord est ou ouest on ne bouge qu'en `x`, sur un bord nord ou sud qu'en `y`) —
  en diagonale, la tuile se détachait de ses voisines et ouvrait la brèche qu'on croyait boucher.
  **Deux pas** de rattrapage au lieu d'un. Une tuile **à gisement** reste de l'anneau (on la
  défriche avant d'y planter le pieu) et un **marais** aussi (constructible après assèchement) ;
  seules l'eau et la montagne ferment d'elles-mêmes.
- **Assécher un marais** (`tickDefricher`, `executeur.ts`) : une tuile de marais se défriche même
  sans gisement dessus, sans outil requis, et `modifierBiome(..., "prairie")` la rend bâtissable ;
  l'événement `defrichage` porte `marais: true`. `planifierFondation` route un site à gisement
  **ou** en marais vers `planifierDefrichage`, qui accepte les deux.

## 8 vicies. La soif : l'eau qu'on retient et le puits qui n'attend plus (M42)

- **Mémoire des lieux** (`agents/personnage.ts`) : `LieuConnu.eau?: boolean` et
  `estLieuEau(l)` (`l.type === "eau" || l.eau === true`). **[DÉCISION]** `type` ne tient qu'une
  ressource, et un bord de lac porte presque toujours un banc de poisson : la tuile était retenue
  comme « poisson », `lieuxConnusTries(p, "eau")` rendait une liste vide, et `planifierBoire`
  échouait sur « aucun point d'eau connu » — 209 fois sur la graine 7, à quatre tuiles du lac.
  Le champ est optionnel : les mondes d'avant M42 se relisent tels quels, et la première
  observation le repose.
- **Observation** (`cerveau/perception.ts`) : `observer` calcule `estTuileEau(t)` une fois et pose
  `eau` sur **toutes** les branches (gibier, gisement neuf, gisement mis à jour) ; une tuile d'eau
  sans rien dessus redevient un lieu `"eau"` même si l'on gardait un banc de poisson épuisé.
- **Lectures unifiées** : `lieuxConnusTries` (pour `"eau"` seulement), `riveConnue`,
  `lieuxEauConnus`, `siteDuPortail`, le partage de lieux au dialogue et le déclencheur de la
  pirogue passent tous par `estLieuEau`.
- **Élagage** (`elaguerConnaissance`) : l'eau rejoint le minerai parmi les lieux qu'on n'oublie
  jamais — on meurt de soif en trois jours, et un lieu d'eau oublié ne se retrouve qu'en explorant.
- **Puits** (`monde.ts`) : `distanceEauConnue(p)` (`Infinity` si l'on n'en connaît aucun) et
  `puitsProche(monde, pos, RAYON_PUITS = 24)`. `prochainBatimentNecessaire` décide `puits` quand
  il n'y en a pas à portée **et** que la leçon `puits_pres_du_village` est sue **ou** que
  une eau connue à `DISTANCE_EAU_POUR_PUITS = 12` ou plus (une distance **finie** : tant qu'on ne connaît aucune eau, on va la chercher plutôt que de creuser vingt pierres à l'aveugle). **[DÉCISION]** Douze : en deçà,
  l'aller-retour tient dans la journée ; au-delà, une saison de froid ou de maladie suffit à faire
  mourir de soif. Et un puits par quartier, non un pour toute la carte : la règle d'avant laissait
  un village lointain sans recours.
- **Tests** (`soif.test.ts`, 5) : une tuile d'eau à banc de poisson reste connue comme poisson
  *et* donne à boire ; on sait aller boire à ce lac-là au lieu d'échouer ; un lieu d'eau survit à
  un élagage de mille lieux plus récents ; l'eau à quarante tuiles décide un puits sans leçon, une
  fois la famille logée, chauffée et pourvue d'un stock ; l'eau à quatre tuiles n'en décide pas, et
  un puits voisin dispense du second.
- **Mesure** (12 graines, 360 jours, conteur allumé) : 146 survivants contre 101, trois mondes
  éteints contre quatre, **9 morts de soif contre 38**, 8 puits achevés contre 1. Le froid
  (24 morts) devient le premier tueur.

## 8 unvicies. Le froid : partir à temps, ou faire du feu (M43)

- **Perception** (`cerveau/perception.ts`) : deux champs nouveaux sur les deux perceptions (légère
  et complète) — `distanceChaleur` (pas jusqu'à la chaleur la plus proche qu'on puisse *gagner*,
  `Infinity` sinon) et `perteChaleurParTick` (points de chaleur perdus par tick à rester dehors,
  saison × météo, même formule que le bilan thermique de la simulation sans les atténuations
  personnelles). `perteChaleurParTick(monde)` est exportée. `moi.boisEnPoche` s'ajoute aussi.
- **`distanceChaleur(monde, p)`** (`monde.ts`) : le plus proche d'un abri des siens où il reste une
  place (`abriDisponible`) et d'un feu **allumé** (tout bâtiment `atelier: "feu"`).
- **`seuilRentrer(perception)`** (`cerveau/rule-brain.ts`) : `min(80, max(plancher, distance ×
  perte × 1,5))`, le plancher valant `SEUILS_URGENCE.chaleur` (25), ou 40 pour qui a retenu
  `rentrer_quand_on_gele`. **[DÉCISION]** Le seuil était fixe et ne disait rien de la distance :
  une nuit d'hiver coûte 1,1 point par tick et un pas prend un tick, si bien qu'à vingt pas on
  partait avec vingt-deux points pour un trajet qui en demandait vingt-deux — les vingt-sept morts
  de froid mesurés étaient tous dehors, éveillés, en route. Le plafond de quatre-vingts existe
  pour qu'on sorte encore de chez soi l'hiver ; sans chaleur connue, on en reste au plancher.
- **Trois règles corrigées** : l'urgence `se_rechauffer`, le candidat « se réchauffer quand on a
  froid » et celui de l'enfant lisaient `feuConnu` — vrai dès qu'un feu brûlait **n'importe où
  dans le monde**. Ils lisent `Number.isFinite(distanceChaleur)`, et leurs seuils passent par
  `seuilRentrer`.
- **Feu de fortune** (`planifierRechauffement`) : ni abri ni feu à vingt-cinq pas, mais cinq
  bûches en poche et l'âge de le faire → `planifierFondation(monde, p, "feu_de_camp")` sur place.
  Le plan rendait `echec("aucune source de chaleur connue")`, et l'on gelait avec le bois dans les
  bras.
- **Un essai rejeté** : déclencher la chasse au cuir sur la saison froide (au lieu de la seule
  leçon `vetements_chauds`, qui demande un mort) donne **145 survivants contre 169**, avec *plus*
  de morts de froid (12 contre 7) et de carence (16 contre 8). La mesure est notée dans le code à
  l'endroit de la tentation.
- **Tests** (`froid.test.ts`, 4) : le seuil grandit avec le trajet, reste au plancher à deux pas,
  plafonne à quatre-vingts, et la leçon relève le plancher sans toucher au plafond ; la perte
  perçue est plus forte par une nuit d'hiver qu'en été ; `distanceChaleur` compte l'abri et le feu
  allumé mais pas le feu éteint ; sans abri ni feu, le plan de réchauffement fonde un feu de camp
  si l'on a du bois, et échoue honnêtement sinon. `savoirs.test.ts` donne les deux champs
  nouveaux à sa perception de laboratoire.
- **Mesure** (12 graines, 360 jours, conteur allumé) : 169 survivants contre 146, **un** monde
  éteint contre trois, 15 morts de froid contre 27, 67 morts en tout contre 87. Restent en tête
  l'infection (12), la faim (11) et la carence (8).

## 8 duovicies. Le grain et le surplus agricole (M44)

- **Céréales sauvages** (`monde/ressources.ts`) : `GISEMENTS_PAR_BIOME.prairie` porte un gisement
  `graines` (probabilité 0,09, 4 à 10 unités, `tauxRegen` 0,4, sans outil). **[DÉCISION]** Les
  graines ne venaient que d'une chance sur dix en cueillant des baies, et comme le poisson nourrit
  mieux que la baie, personne ne cueillait : deux cent cinquante baies l'an pour tout un village,
  donc une trentaine de graines, donc pas un champ semé. Ce gisement **change le tirage des
  mondes** : toutes les graines de monde donnent un terrain différent d'avant M44.
- **Le grain se mange** (`agents/inventaire.ts`) : `NOURRITURE.graines = 30`, entre le repas cuit
  (25) et le poisson (35), avec `VIE_NOURRITURE.graines = 300` déjà en place — la seule nourriture
  qui passe l'hiver, et la seule qu'on doive choisir entre manger et semer. C'était la seule
  ressource qu'on récoltait sans pouvoir la manger.
- **Rendement** (`monde/village.ts`) : `RENDEMENT_CHAMP` passe de 24 à **300**, et un champ mûr
  pose un gisement `graines` (et non `baies`) sur sa tuile. À quinze points la baie, l'ancienne
  récolte valait sept jours de vivres pour une personne, une fois l'an, quand un village de seize
  consomme deux cent quatre-vingt-dix mille points dans l'année.
- **Autant de champs que de bouches** (`prochainBatimentNecessaire`) : la condition passe de
  « aucun champ dans la famille » à « moins de champs que de membres ». L'agriculture devient un
  métier qui se développe plutôt qu'un jardin d'agrément.
- **On va récolter le champ mûr** (`meilleureNourritureConnue`) : le grain passe **devant** le
  poisson. Il ne se régénère pas et pourrit sur pied, alors qu'un banc de poisson attendra ; sans
  cette ligne, un champ mûr n'était récolté par personne.
- **Tests** (`grain.test.ts`, 6) : le grain se mange, rassasie moins qu'un poisson et se garde le
  plus longtemps de toutes les nourritures ; la prairie porte des céréales sauvages sans outil et
  qui repoussent ; un champ mûr devient un gisement de grain ; un champ mûr passe devant un banc
  de poisson ; une famille de trois logée et pourvue décide un second champ ; le rendement baisse
  sans jachère mais reste d'un autre ordre qu'avant M44.
- **Mesures.** Sur un an, quatre graines : quinze à vingt-deux champs (contre zéro à deux),
  quarante-cinq à cinquante-deux récoltes, grain à 45–77 % des vivres. Sur mille huit cents jours,
  graine 9 : 19 → 24 habitants et un plateau dès le jour 720 sans le grain ; 21 → 33 et toujours
  en hausse avec, pour 26 naissances contre 19 et 42 champs contre 3. Sur la graine 2, le monde
  s'éteint vers le jour 900 **avec comme sans** (onze naissances, vingt-trois morts dans les deux
  cas) : les effondrements au long cours sont un sujet à part.

## 8 tervicies. Le moteur sans écran et la reprise d'un moment (M45)

- **`sim traverser`** (`packages/cli/src/main.ts`) : `--seed`, `--annees` (années du jeu, soit
  `4 × joursParSaison = 120` jours), `--jours` (l'emporte), `--population`, `--dossier` (défaut
  `chronique`), `--tous-les <jours>` (défaut 360), `--json`, `--sans-conteur`,
  `--sans-instantanes`. Une ligne par instantané (an, jour, vivants, naissances et morts depuis le
  précédent, bâtiments, champs, villages, trouvailles, fichier et poids) ; à la fin, la durée et
  le temps par année simulée, puis les causes de décès.
- **Les instantanés** : un fichier `jour-NNNNNN.json.gz` par moment, plus `chronique.json`
  (`seed`, `population`, `jours`, `pas`, `conteur`, `eteintAuJour`, `dureeMs`, `moments[]`).
  **[DÉCISION]** Un fichier par moment plutôt qu'un journal continu : une sauvegarde se recharge
  telle quelle par `Simulation.restaurer`, donc le moment est une **partie** et non une image — on
  la reprend, on la continue, on y joue au dieu. **[DÉCISION]** Comprimé par défaut : 10,9 Mo en
  clair contre 1,1 Mo en gzip à l'an cinq, et une traversée en sème des dizaines.
- **L'année vient de l'horloge** : `sim.config.monde.joursParSaison * 4`, et `Moment.an` est
  `horloge.moment().annee`. La première version comptait des années de 360 jours et annonçait
  « an 3 » quand le monde affichait « An 7 » ; les légendes en années de M42 à M44 ont été
  réécrites en jours (les mesures, elles, étaient déjà en jours).
- **Viewer** (`src/sauvegarde.ts`) : `lireFichierSauvegarde(fichier: File)` reconnaît le gzip **à
  ses deux premiers octets** (`0x1f 0x8b`) et non à l'extension — **[DÉCISION]** un système ou une
  messagerie renomment volontiers un fichier, et se tromper là donnerait « illisible » sur une
  sauvegarde valide — puis vérifie par `estSauvegarde` et rend un motif clair sinon.
  `exporter(s)` offre le fichier : **[DÉCISION]** dans la page publiée sur claude.ai un lien de
  téléchargement ne fait rien, seule la capacité `downloads` remet un fichier, et sa liste
  d'extensions ne contient pas `.gz` — on y envoie donc le JSON en clair par
  `claude.use("downloads").save({filename, data})` ; partout ailleurs (fichier local, application
  installée) `fichierDeSauvegarde(s)` rend `{ nom, blob }` comprimé et un lien le télécharge.
  L'artefact déclare donc `capabilities: {db:{}, downloads:true}`. `index.html` : `#fichier-sauvegarde` (caché derrière un label `.bouton-fichier`) et
  `#btn-exporter` dans la boîte des sauvegardes ; `main.ts` : `ouvrirFichier` (range sous
  « Fichier · jour N », puis `relancer`) et `exporterPartie`.
- **Tests** (`packages/viewer/test/sauvegarde.test.ts`, 14 en tout) : un instantané comprimé et
  renommé exprès se relit et le monde repart au bon tick ; un instantané en clair aussi ; un
  fichier qui n'est pas du JSON et un JSON qui n'est pas une sauvegarde sont refusés avec leur
  motif ; l'export est nommé par le jour, trois fois plus petit que le JSON, et se relit.

## 8 quatervicies. L'âge du bronze, enfin (M46)

- **Promotion d'un savoir** (`actions/executeur.ts`, `tickFabriquer`) : le bloc
  `apprendre(p, invention, 1, …)` vivait dans la branche `if ("objet" in recette.produit)`.
  **[DÉCISION]** Il en sort. Deux recettes du catalogue rendent une **ressource** et non un objet
  — `cuivre` (invention `fonte`) et `poisson_fume` (invention `fumoir`) — et ce sont exactement
  les deux que le verrou tenait : toute la métallurgie et la conservation par fumage restaient à
  force 0,6 à vie, donc ni transmises ni solides. Mesuré avant : **zéro porteur vivant de `fonte`
  sur six mondes de neuf cents jours**.
- **Prototype raté** : le tirage `p.rng.chance(0.35)` passe **avant** la dépense des ingrédients,
  comme le disait déjà son commentaire et comme le fait `tickFabriquerTrouvaille` depuis M41. Il
  consommait trois minerais par échec, sur les vingt-sept qu'un village récolte en cinq ans.
- **`melanger`** (`savoirs/recherche.ts`) : le dé se tire **après** le calcul des matières en main
  (l'inversion que M41 a corrigée dans `chercher`), et le filtre
  `tenue >= 40 || durete >= 40` disparaît au profit du seul `fusible` — **[DÉCISION]** c'était un
  doublon de ce que `deriverMatiere` vérifie déjà (`fusible` plus le seuil `exige` du procédé) et
  un doublon faux : le minerai vaut 25/28, or `fondre` n'exige rien.
- **Deux raffinements retirés, mesure en main** : appliquer au tirage le seuil `exige` du procédé,
  puis pondérer le tirage par la qualité (dureté + tenue). Les deux rendent un résultat
  **identique au bit près** sur six mondes : pondérer ou filtrer ne change rien à un seul
  candidat, et `fusibles` n'en contient presque jamais deux. La profondeur de la chaîne est bornée
  par la **quantité de métal en circulation**, pas par le choix. La mesure est inscrite dans le
  code à l'endroit de la tentation.
- **Tests** (`bronze.test.ts`, 5) : les deux seules recettes à ressource sont `fonte` et `fumoir` ;
  réussir l'une change l'idée en savoir ; un prototype raté ne consomme plus les matières ; le
  minerai est fusible et sous les deux anciens seuils, `fondre.exige` est `null` ; un curieux tire
  du minerai une matière de rang 1 plus dure et plus tenace que son parent.
- **Mesure** (6 graines, 900 jours) : `fonte` sue par 0 vivant avant, 11 à 18 après ; fours 5 → 11 ;
  matières dérivées 7 → 10 ; habitants 134 → 137. Rang maximal 2 → 1, expliqué ci-dessus.

## 15 bis. Savoirs : leçons et inventions

- **Leçon** : à chaque décès, autopsie de la situation → une ou deux morales d'un catalogue
  fermé (`provisions_hiver`, `rentrer_quand_on_gele`, `enfants_dabord`, `partager_en_hiver`,
  `puits_pres_du_village`, `vetements_chauds`). La famille, le partenaire, les amis et les témoins proches la
  retiennent ; une tombe porte l'épitaphe. Chaque leçon a un effet précis sur le cerveau
  (seuils, scores, bâtiment nécessaire).
- **Invention** : catalogue fermé d'inventions que le moteur sait appliquer (`filet`, `piege`,
  `arc`, `pirogue`, `traineau`, `fumoir`, `couche`, `vetement`, `osselets`, `flute`, et, dans
  le domaine `outillage`, `fonte` et `outils_de_cuivre`), chacune avec un besoin déclencheur,
  une recette et un effet. **[DÉCISION M23]** L'âge du cuivre : minerai (`montagne`, un peu en
  `colline`, à la pioche) → idée de la fonte (minerai vu, ouverture > 0,45, jour ≥ 60) → four
  (un par village) → lingot (`cuivre` : 3 minerais + 2 bois au four) → idée des outils de cuivre
  (au premier lingot) → `hache_cuivre` et `pioche_cuivre` (1 lingot + 2 bois ; solidité 160
  contre 40 ; rendement 3 contre 2 ; satisfont `hache_pierre` et `pioche` requis). Une idée
  d'outillage attend soixante jours avant de s'effacer, vingt pour les autres.
- **Berceau abondant** (**[DÉCISION M23]**) : `abondanceDuBerceau(population.initiale)` = une
  part pour douze habitants, quatre au plus ; `genererGrille` ajoute autant de mares (rayon 2,5,
  à quatorze tuiles, à l'opposé du rivage) que de parts au-delà de la première, et dans le rayon
  du berceau tire les gisements avec une probabilité × (1 + 0,5 × (parts − 1)) (plafond 0,9) et
  des quantités × √parts, avec le même nombre de tirages qu'à douze (les mondes à douze ne
  changent pas). Performance : bâtiments accessibles mémorisés une heure par personnage,
  observation des alentours seulement en bougeant (drapeaux `observeTick/X/Y`), repousse des
  gisements à l'heure ; la page borne la simulation à 22 ms par intervalle de 50 ms et affiche
  la vitesse effective quand elle est sous la vitesse demandée.
  Le soir, un adulte qui ressent le besoin peut avoir l'idée (curiosité = ouverture) ; il
  fabrique un prototype qui peut rater ; la réussite fait de l'idée un savoir de la famille.
- **Transmission** : par le dialogue (sujet `savoir`, avec l'origine), aux adolescents par
  leurs parents. **[DÉCISION]** Les savoirs ne s'oublient pas ; une idée non réalisée
  s'efface au bout de vingt jours.
- **Cerveau Claude (M5)** : la morale et le récit d'une invention peuvent être rédigés par
  Claude, mais le savoir appliqué est toujours l'un des identifiants du catalogue.

## 16. Configuration (`sim.config.json`)

```jsonc
{
  "seed": 42,
  "monde": { "joursParSaison": 30, "echelleRelief": 40, "echelleContinents": 220, "berceau": 28 },
  "population": { "initiale": 12, "familles": 3 },
  "temps": { "minutesParTick": 10, "snapshotTousLesTicks": 144 },
  "vie": {
    "joursParAnnee": 120,
    "gestationJours": 30,
    "probabiliteGrossesse": 0.25,
    "ageAdulte": 16,
    "ageAncien": 55
  },
  "brain": {
    "mode": "llm",                       // "llm" | "rules" | "replay"
    "model": "claude-opus-5",
    "modelDialogue": null,               // ex. "claude-haiku-4-5" — votre choix
    "modelReflexion": null,
    "effort": { "aube": "medium", "interruption": "medium", "dialogue": "low", "soir": "high" },
    "maxCallsPerDay": 12,
    "maxConcurrent": 4,
    "timeoutMs": 60000,
    "enfantsAvecLLM": false,
    "budgetUsdParJourSimule": 5.0       // au-delà : bascule en "rules" jusqu'au lendemain
  },
  "memoire": { "maxSouvenirs": 600, "topK": 20, "demiVieRecenceJours": 1 },
  "perception": { "rayonJour": 6, "rayonNuit": 3 },
  "social": { "monogamie": true, "nomFamille": "pere", "vouvoiementInconnus": true }
}
```

---

## Annexe A – Prompt de lancement pour Claude Code

Copier-coller ce texte comme premier message dans Claude Code, ouvert dans le dossier
qui contient `PROTOCOLE.md` :

```
Lis intégralement PROTOCOLE.md. C'est la spécification d'une simulation de vie avec des
personnages dotés chacun d'une IA et d'une identité propres.

Construis le projet en suivant strictement la roadmap de la section 15, phase par phase,
en commençant par M0. Pour chaque phase :
1. crée une branche `phase/<nom>` ;
2. implémente ce qui est décrit, en respectant l'architecture de la section 11 et les
   principes P1 à P6 de la section 1 ;
3. écris les tests listés en section 14 pour cette phase et fais-les passer ;
4. mets à jour CHANGELOG.md et commite avec un message clair ;
5. montre-moi un résumé, puis passe à la phase suivante sans attendre sauf si une
   décision marquée [DÉCISION] te semble devoir être remise en cause — dans ce cas, pose
   la question et continue avec la valeur par défaut en attendant.

Contraintes :
- TypeScript strict, pnpm, Vitest, aucun `any`.
- Le moteur (`packages/core`) ne doit jamais dépendre du SDK Anthropic.
- La simulation doit tourner sans clé API (mode "rules") dès M1.
- Pour le cerveau Claude (M5), utilise le SDK officiel @anthropic-ai/sdk, le modèle
  claude-opus-5 par défaut, les sorties structurées (client.messages.parse +
  zodOutputFormat), la réflexion adaptative, le cache de prompt sur le prompt système,
  et le repli serveur (fallbacks: "default" avec la beta server-side-fallback-2026-07-01).
- Journalise tout (événements, pensées, appels LLM) comme décrit en section 12.

Commence maintenant par M0.
```

---

## Annexe B – Exemple d'appel au cerveau Claude (TypeScript)

Référence pour `packages/brain-claude`. Le prompt système est figé et mis en cache ; le
message utilisateur contient la perception dans un ordre stable ; la réponse est validée
par un schéma zod.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const DecisionIASchema = z.object({
  penseeInterieure: z.string(),
  humeur: z.enum(["serein", "inquiet", "joyeux", "triste", "en_colere", "fatigue", "amoureux"]),
  intentions: z.array(
    z.object({
      type: z.string(),                    // remplacer par z.enum(TYPES_INTENTION)
      parametres: z.record(z.union([z.string(), z.number()])),
      priorite: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      raison: z.string(),
    }),
  ),
  souvenirsAEnregistrer: z.array(z.object({ texte: z.string(), importance: z.number() })),
});

const client = new Anthropic();

export async function deciderAube(promptSysteme: string, perceptionRendue: string) {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(DecisionIASchema),
    },
    system: [
      {
        type: "text",
        text: promptSysteme,                       // identique pour tous les agents
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: perceptionRendue }],
  });

  if (response.stop_reason === "refusal") {
    return null;                                   // → RuleBrain prend le relais
  }
  return response.parsed_output;                   // null si le JSON n'a pas validé
}
```

Le repli serveur (`fallbacks: "default"` + beta `server-side-fallback-2026-07-01`) se
déclare sur `client.beta.messages` ; Claude Code l'ajoutera lors de M5 en suivant la
documentation du SDK, puis vérifiera `usage.cache_read_input_tokens` sur deux appels
successifs pour confirmer que le cache fonctionne.

---

## Annexe C – Questions ouvertes (à trancher par vous, valeurs par défaut appliquées sinon)

| Question | Défaut |
|----------|--------|
| Langue des dialogues et pensées | français |
| Monogamie stricte ? | oui, sauf trait `volage` |
| Les enfants ont-ils un cerveau LLM ? | non avant l'adolescence |
| Modèle pour les dialogues (volume élevé) | `claude-opus-5` (même modèle partout) |
| Taille du monde / population initiale | 96×64 / 12 |
| Monnaie | non (troc + dette) |
| Intervention de l'observateur | non avant M7 |
