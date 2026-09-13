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
  tronqué à ses trois mille derniers événements (compteurs conservés).
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
  que l'encodage reste sous un quarantième du temps), plus l'aube, la mise en pause et la mise à
  l'arrière-plan ; la plus récente reprend d'elle-même au chargement si elle a moins de douze
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
