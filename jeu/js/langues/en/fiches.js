// English — les fiches des troupes (js/fiches-troupes.js) : le titre des quatre
// rubriques, puis les quatre phrases de chaque troupe — son rôle, ce qu'elle bat,
// ce qu'elle craint, un conseil.
// La clé est la phrase française, telle qu'elle est écrite dans le module.
//
// Les jetons `{militia}` et `{militia:p}` (pluriel) se gardent tels quels : le
// jeu y met le nom que le peuple du joueur donne à la troupe (« Knights » pour un
// Atlante, « Camel Riders » pour un Solarien). Les écrire au pluriel sans
// article, ou au singulier derrière « the » : jamais derrière « a » ou « an »
// si un des deux peuples a un nom qui commence par une voyelle. Une même troupe
// est un homme chez l'un et une bête ou une femme chez l'autre (Scout / Trained
// Jackal, Priestess / Sun Priest) : pas de « he » ni de « she » pour celles-là.
// Les chiffres (+10, 5 tiles…) sont ceux des règles : ils ne changent pas.
// (js/icones.js n'a aucun texte à traduire : noms d'auteurs et de licence.)
export default {
  // Les rubriques.
  "Rôle": "Role",
  "Bat": "Beats",
  "Craint": "Fears",
  "Conseil": "Tip",
  // villager
  "Récolte le bois, les vivres et l’or, construit et répare : sans ouvriers, ni cité ni armée.": "Gathers wood, food and gold, builds and repairs: no workers, no city, no army.",
  "Personne : au combat, un ouvrier ne vaut que contre un autre ouvrier.": "No one: in a fight, a worker is only a match for another worker.",
  "Tout soldat, et d’abord la cavalerie, qui le rattrape.": "Any soldier, and cavalry most of all, which runs workers down.",
  "Formes-en sans arrêt au début, garde-les près d’une tour, et sonne la cloche quand l’ennemi approche.": "Train them nonstop early on, keep them near a tower, and ring the bell when the enemy closes in.",
  // militia
  "Le fantassin de base : bon marché, disponible dès le premier âge, il tient la ligne.": "The basic foot soldier: cheap, available from the first age, he holds the line.",
  "Les {spearman:p}, et les tireurs dès qu’il arrive au contact.": "{spearman:p}, and ranged units once he gets in close.",
  "Les {knight:p}, les {champion:p} et les {crossbowman:p}, qui percent son armure.": "{knight:p}, {champion:p} and {crossbowman:p}, who pierce his armor.",
  "En nombre et tôt : c’est ta première armée. À l’Âge des Châteaux, passe aux {champion:p}.": "Early and in numbers: this is your first army. In the Castle Age, switch to {champion:p}.",
  // spearman
  "Le tueur de cavalerie : bon marché, et sans or.": "The cavalry killer: cheap, and no gold needed.",
  "Toute la cavalerie (+10) et les engins de siège (+6).": "All cavalry (+10) and siege engines (+6).",
  "Les {militia:p}, les {champion:p} et les tireurs : il n’a aucune armure.": "{militia:p}, {champion:p} and ranged units: he has no armor at all.",
  "Place-le devant tes tireurs et tes engins, là où la cavalerie viendra charger.": "Put him in front of your ranged units and siege engines, right where cavalry will charge.",
  // archer
  "Le tireur de base : il frappe à 5 cases, avant que l’ennemi ne le touche.": "The basic ranged unit: he hits from 5 tiles away, before the enemy can touch him.",
  "L’infanterie sans armure tenue à distance : {spearman:p}, {sapeur:p}, {militia:p}.": "Unarmored infantry kept at a distance: {spearman:p}, {sapeur:p}, {militia:p}.",
  "La cavalerie qui lui tombe dessus, les {frondeur:p}, et les {pavoisier:p}, que ses flèches n’entament pas.": "Cavalry crashing into him, {frondeur:p}, and {pavoisier:p}, who shrug off his arrows.",
  "Toujours derrière une ligne de fantassins ; recule dès qu’on arrive au contact.": "Always behind a line of foot soldiers; fall back as soon as anything gets close.",
  // scout
  "Le plus rapide, et celui qui voit le plus loin : il explore et repère l’ennemi.": "The fastest of all, and the one that sees the farthest: made to explore and spot the enemy.",
  "Les ouvriers isolés et les tireurs sans escorte.": "Lone workers and unescorted ranged units.",
  "Les {spearman:p} et tout vrai soldat : il frappe peu.": "{spearman:p} and any real soldier: built for speed, not for fighting.",
  "Fais-lui faire le tour de la carte dès le début ; ensuite, poste-le sur les routes d’attaque.": "Send it around the map right from the start; after that, post it on the attack routes.",
  // knight
  "La cavalerie lourde : rapide, solide, elle frappe fort.": "Heavy cavalry: fast, tough, and hard-hitting.",
  "Les tireurs (+4), les ouvriers, les engins de siège (+5) et les {pavoisier:p}.": "Ranged units (+4), workers, siege engines (+5) and {pavoisier:p}.",
  "Les {spearman:p} avant tout (+10 contre la cavalerie), et les {triton:p} (+6).": "{spearman:p} above all (+10 against cavalry), and {triton:p} (+6).",
  "Contourne la ligne adverse et fonce sur ses tireurs et ses engins ; évite les lances.": "Go around the enemy line and charge its ranged units and siege engines; steer clear of spears.",
  // champion
  "L’infanterie lourde : beaucoup de points de vie, une bonne armure, de gros dégâts.": "Heavy infantry: lots of hit points, good armor, big damage.",
  "Les {militia:p}, les {spearman:p}, les {pavoisier:p}, et les tireurs une fois au contact.": "{militia:p}, {spearman:p}, {pavoisier:p}, and ranged units once he gets in close.",
  "Les {crossbowman:p} (+8 contre l’infanterie), les {catapult:p} s’il reste groupé, les {hydra:p}.": "{crossbowman:p} (+8 against infantry), {catapult:p} if he stays bunched up, and the {hydra}.",
  "Le cœur de ton armée à l’Âge des Châteaux : fais-le avancer en premier, les tireurs derrière.": "The heart of your army in the Castle Age: send him in first, ranged units behind.",
  // crossbowman
  "Le tireur lourd : 6 cases de portée, et un carreau qui perce l’armure.": "The heavy ranged unit: 6 tiles of range, and a bolt that pierces armor.",
  "Toute l’infanterie (+8), jusqu’aux {champion:p} et aux {pavoisier:p}.": "All infantry (+8), all the way up to {champion:p} and {pavoisier:p}.",
  "La cavalerie, les {frondeur:p} (+6 contre les tireurs), et tout ce qui arrive pendant qu’il recharge.": "Cavalry, {frondeur:p} (+6 against ranged units), and anything that shows up while he reloads.",
  "Peu nombreux mais bien protégés : il recharge lentement, chaque carreau doit porter.": "Few in number but well protected: he reloads slowly, so every bolt has to count.",
  // priest
  "Soigne tes troupes blessées, à 4 cases : 8 points de vie par geste.": "Heals your wounded troops from 4 tiles away: 8 hit points per heal.",
  "Personne : pas d’arme, pas d’attaque.": "No one: no weapon, no attack.",
  "Tout ce qui l’atteint : cavalerie, tireurs, engins.": "Anything that gets within reach: cavalry, ranged units, siege engines.",
  "Deux ou trois derrière ta ligne font durer ton armée bien plus longtemps ; jamais devant.": "Two or three behind your line keep your army going much longer; never in front.",
  // ram
  "L’engin qui abat les bâtiments (+35) et encaisse les flèches.": "The siege engine that knocks down buildings (+35) and soaks up arrows.",
  "Les bâtiments et les tours, dont les flèches ne lui font presque rien.": "Buildings and towers, whose arrows barely scratch it.",
  "Les {spearman:p} (+6), les {knight:p} (+5) et les {sapeur:p} (+8) : au contact, il est sans défense.": "{spearman:p} (+6), {knight:p} (+5) and {sapeur:p} (+8): up close, it’s defenseless.",
  "Escorte-le jusqu’aux murs, puis vise les tours et les bâtiments qui forment des troupes.": "Escort it to the walls, then go for towers and the buildings that train troops.",
  // triton
  "Un fantassin robuste au trident, entre les {militia:p} et les {champion:p}.": "A sturdy foot soldier with a trident, somewhere between {militia:p} and {champion:p}.",
  "La cavalerie (+6), les {militia:p}, les {spearman:p}.": "Cavalry (+6), {militia:p}, {spearman:p}.",
  "Les {champion:p}, les {crossbowman:p}, les tireurs en nombre.": "{champion:p}, {crossbowman:p}, massed ranged units.",
  "Mêle-le à ta première ligne dès l’Âge Féodal : il arrête les charges que les {militia:p} ne tiennent pas.": "Mix him into your front line from the Feudal Age: he stops the charges that {militia:p} can’t hold.",
  // horseArcher
  "Un tireur à cheval : la portée des {archer:p}, la vitesse de la cavalerie.": "A ranged unit on horseback: the range of {archer:p}, the speed of cavalry.",
  "Les fantassins lents, qu’il harcèle sans se laisser rattraper, et les ouvriers.": "Slow foot soldiers he can harass without getting caught, and workers.",
  "Les {frondeur:p} (+6), les {spearman:p} s’ils l’accrochent, les tireurs en nombre : il a peu d’armure.": "{frondeur:p} (+6), {spearman:p} if they catch him, massed ranged units: he has little armor.",
  "Tire, recule, recommence : ne le laisse jamais immobile au contact.": "Shoot, fall back, repeat: never leave him standing still in melee.",
  // catapult
  "L’artillerie : un boulet qui frappe toute une zone, à 7 cases.": "The artillery: a stone that hits a whole area, from 7 tiles away.",
  "Les bâtiments (+34) et les troupes groupées à l’arrêt.": "Buildings (+34) and bunched-up troops standing still.",
  "Tout ce qui arrive au contact : {knight:p}, {champion:p}, {sapeur:p}. Une troupe en marche esquive le boulet.": "Anything that gets in close: {knight:p}, {champion:p}, {sapeur:p}. A troop on the move dodges the stone.",
  "Loin derrière, bien gardée. Ne tire jamais dans une mêlée où tu as des hommes : le boulet les blesse aussi.": "Far back, well guarded. Never fire into a melee where you have men: the stone hurts them too.",
  // hydra
  "Un monstre qui encaisse comme une escouade et mord 3 ennemis à la fois.": "A monster that soaks up damage like a whole squad and bites 3 enemies at once.",
  "Les mêlées serrées, l’infanterie légère, les bâtiments (+9).": "Tight melees, light infantry, buildings (+9).",
  "Les tireurs en nombre qui la visent ensemble, et le harcèlement : elle est lente.": "Massed ranged units all aiming at it, and hit-and-run attacks: it’s slow.",
  "Lance-la au cœur de la mêlée, des {priest:p} derrière : c’est là que ses morsures comptent. Elle occupe 3 places.": "Send it into the heart of the melee, with a {priest} or two behind: that’s where its bites count. It takes 3 population slots.",
  // pavoisier
  "Un mur : son grand bouclier arrête presque toutes les flèches.": "A wall: his great shield stops almost every arrow.",
  "Les {archer:p}, les {frondeur:p} et les tours.": "{archer:p}, {frondeur:p} and towers.",
  "Les {knight:p}, les {champion:p}, les {catapult:p} — et les {crossbowman:p}, qui percent son bouclier.": "{knight:p}, {champion:p}, {catapult:p} — and {crossbowman:p}, who pierce his shield.",
  "Devant, face aux tireurs et aux tours : il encaisse pendant que le reste de l’armée frappe. Seul, il ne tue rien.": "Up front, facing ranged units and towers: he takes the hits while the rest of the army strikes. Alone, he kills nothing.",
  // frondeur
  "Le tireur sans or : une portée courte, mais il chasse les autres tireurs.": "The ranged unit that costs no gold: short range, but he hunts other ranged units.",
  "Les {archer:p}, les {crossbowman:p} et les {horseArcher:p} (+6).": "{archer:p}, {crossbowman:p} and {horseArcher:p} (+6).",
  "Tout ce qui arrive au contact, et les {pavoisier:p}.": "Anything that gets in close, and {pavoisier:p}.",
  "Poste-le face aux tireurs adverses, derrière tes fantassins. Il coûte peu : formes-en beaucoup.": "Post him facing the enemy’s ranged units, behind your foot soldiers. He’s cheap: train plenty.",
  // sapeur
  "Un coureur qui s’en prend aux murs et aux engins.": "A runner who goes after walls and siege engines.",
  "Les bâtiments (+10) et les engins de siège (+8).": "Buildings (+10) and siege engines (+8).",
  "Tout soldat, et les tours : ni armure, ni points de vie.": "Any soldier, and towers: no armor, hardly any hit points.",
  "Fais-le passer pendant que ton armée occupe l’ennemi, droit sur ses engins ou sur un bâtiment isolé.": "Slip him through while your army keeps the enemy busy, straight at its siege engines or a lone building.",
  // hydra, chez les solariens
  "Un monstre qui encaisse comme une escouade et frappe 3 ennemis à la fois.": "A monster that soaks up damage like a whole squad and strikes 3 enemies at once.",
  "Les tireurs en nombre qui le visent ensemble, et le harcèlement : il est lent.": "Massed ranged units all aiming at it, and hit-and-run attacks: it’s slow.",
  "Lance-le au cœur de la mêlée, des {priest:p} derrière : c’est là que ses coups comptent. Il occupe 3 places.": "Send it into the heart of the melee, with a {priest} or two behind: that’s where its blows count. It takes 3 population slots.",
};
