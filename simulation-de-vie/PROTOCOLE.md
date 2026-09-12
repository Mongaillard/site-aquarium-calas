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
   autorisé, besoins de base > 40, femme non enceinte, âge 16–45 pour la mère.
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

- Enfant (0–12 ans) : ne peut pas récolter de ressources lourdes, ni construire, ni se
  battre ; mange à partir des stocks familiaux ; suit un parent ou joue ; apprend par
  observation (5.3).
- Adolescent (12–16) : actions d'adulte avec rendement ×0,6 ; commence à avoir son propre
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
en phase 6.

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

## 15 bis. Savoirs : leçons et inventions

- **Leçon** : à chaque décès, autopsie de la situation → une ou deux morales d'un catalogue
  fermé (`provisions_hiver`, `rentrer_quand_on_gele`, `enfants_dabord`, `partager_en_hiver`,
  `puits_pres_du_village`, `vetements_chauds`). La famille, le partenaire, les amis et les témoins proches la
  retiennent ; une tombe porte l'épitaphe. Chaque leçon a un effet précis sur le cerveau
  (seuils, scores, bâtiment nécessaire).
- **Invention** : catalogue fermé d'inventions que le moteur sait appliquer (`filet`, `piege`,
  `arc`, `pirogue`, `traineau`, `fumoir`, `couche`, `vetement`, `osselets`, `flute`), chacune
  avec un besoin déclencheur, une recette et un effet.
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
  "memoire": { "maxSouvenirs": 2000, "topK": 20, "demiVieRecenceJours": 1 },
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
