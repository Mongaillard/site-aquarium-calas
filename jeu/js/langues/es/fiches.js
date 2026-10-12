// Español — les fiches des troupes (js/fiches-troupes.js) : le titre des quatre
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
  "Rôle": "Función",
  "Bat": "Fuerte contra",
  "Craint": "Débil contra",
  "Conseil": "Consejo",
  // villager
  "Récolte le bois, les vivres et l’or, construit et répare : sans ouvriers, ni cité ni armée.": "Recolecta madera, comida y oro, construye y repara: sin trabajadores no hay ciudad ni ejército.",
  "Personne : au combat, un ouvrier ne vaut que contre un autre ouvrier.": "Nadie: en combate, un trabajador solo se mide con otro trabajador.",
  "Tout soldat, et d’abord la cavalerie, qui le rattrape.": "Cualquier soldado y, sobre todo, la caballería, que lo alcanza.",
  "Formes-en sans arrêt au début, garde-les près d’une tour, et sonne la cloche quand l’ennemi approche.": "Forma sin parar al principio, mantenlos cerca de una torre y toca la campana cuando se acerque el enemigo.",
  // militia
  "Le fantassin de base : bon marché, disponible dès le premier âge, il tient la ligne.": "El soldado de infantería básico: barato, disponible desde la primera edad, mantiene la línea.",
  "Les {spearman:p}, et les tireurs dès qu’il arrive au contact.": "{spearman:p}, y los tiradores en cuanto llega hasta ellos.",
  "Les {knight:p}, les {champion:p} et les {crossbowman:p}, qui percent son armure.": "{knight:p}, {champion:p} y {crossbowman:p}, que le perforan la armadura.",
  "En nombre et tôt : c’est ta première armée. À l’Âge des Châteaux, passe aux {champion:p}.": "En número y pronto: es tu primer ejército. En la Edad de los Castillos, pasa a {champion:p}.",
  // spearman
  "Le tueur de cavalerie : bon marché, et sans or.": "El azote de la caballería: barato y sin oro.",
  "Toute la cavalerie (+10) et les engins de siège (+6).": "Toda la caballería (+10) y las máquinas de asedio (+6).",
  "Les {militia:p}, les {champion:p} et les tireurs : il n’a aucune armure.": "{militia:p}, {champion:p} y tiradores: no tiene ninguna armadura.",
  "Place-le devant tes tireurs et tes engins, là où la cavalerie viendra charger.": "Colócalo delante de tus tiradores y tus máquinas, donde cargará la caballería.",
  // archer
  "Le tireur de base : il frappe à 5 cases, avant que l’ennemi ne le touche.": "El tirador básico: golpea a 5 casillas, antes de que el enemigo lo toque.",
  "L’infanterie sans armure tenue à distance : {spearman:p}, {sapeur:p}, {militia:p}.": "La infantería sin armadura mantenida a distancia: {spearman:p}, {sapeur:p}, {militia:p}.",
  "La cavalerie qui lui tombe dessus, les {frondeur:p}, et les {pavoisier:p}, que ses flèches n’entament pas.": "La caballería que se le echa encima, {frondeur:p} y {pavoisier:p}, a los que sus flechas no hacen mella.",
  "Toujours derrière une ligne de fantassins ; recule dès qu’on arrive au contact.": "Siempre detrás de una línea de infantería; retrocede en cuanto lleguen hasta ti.",
  // scout
  "Le plus rapide, et celui qui voit le plus loin : il explore et repère l’ennemi.": "El más rápido y el que ve más lejos: explora y localiza al enemigo.",
  "Les ouvriers isolés et les tireurs sans escorte.": "Trabajadores aislados y tiradores sin escolta.",
  "Les {spearman:p} et tout vrai soldat : il frappe peu.": "{spearman:p} y cualquier soldado de verdad: pega poco.",
  "Fais-lui faire le tour de la carte dès le début ; ensuite, poste-le sur les routes d’attaque.": "Hazle dar la vuelta al mapa desde el principio; después, colócalo en las rutas de ataque.",
  // knight
  "La cavalerie lourde : rapide, solide, elle frappe fort.": "La caballería pesada: rápida, resistente y de golpe fuerte.",
  "Les tireurs (+4), les ouvriers, les engins de siège (+5) et les {pavoisier:p}.": "Tiradores (+4), trabajadores, máquinas de asedio (+5) y {pavoisier:p}.",
  "Les {spearman:p} avant tout (+10 contre la cavalerie), et les {triton:p} (+6).": "{spearman:p} ante todo (+10 contra la caballería) y {triton:p} (+6).",
  "Contourne la ligne adverse et fonce sur ses tireurs et ses engins ; évite les lances.": "Rodea la línea adversaria y lánzate contra sus tiradores y sus máquinas; evita las lanzas.",
  // champion
  "L’infanterie lourde : beaucoup de points de vie, une bonne armure, de gros dégâts.": "La infantería pesada: muchos puntos de vida, buena armadura y mucho daño.",
  "Les {militia:p}, les {spearman:p}, les {pavoisier:p}, et les tireurs une fois au contact.": "{militia:p}, {spearman:p}, {pavoisier:p} y los tiradores una vez en contacto.",
  "Les {crossbowman:p} (+8 contre l’infanterie), les {catapult:p} s’il reste groupé, les {hydra:p}.": "{hydra:p}, {crossbowman:p} (+8 contra la infantería) y {catapult:p} si va agrupado.",
  "Le cœur de ton armée à l’Âge des Châteaux : fais-le avancer en premier, les tireurs derrière.": "El núcleo de tu ejército en la Edad de los Castillos: hazlo avanzar primero, con los tiradores detrás.",
  // crossbowman
  "Le tireur lourd : 6 cases de portée, et un carreau qui perce l’armure.": "El tirador pesado: 6 casillas de alcance y un virote que perfora la armadura.",
  "Toute l’infanterie (+8), jusqu’aux {champion:p} et aux {pavoisier:p}.": "Toda la infantería (+8), incluidos {champion:p} y {pavoisier:p}.",
  "La cavalerie, les {frondeur:p} (+6 contre les tireurs), et tout ce qui arrive pendant qu’il recharge.": "La caballería, {frondeur:p} (+6 contra tiradores) y todo lo que llegue mientras recarga.",
  "Peu nombreux mais bien protégés : il recharge lentement, chaque carreau doit porter.": "Pocos pero bien protegidos: recarga despacio, así que cada virote debe dar en el blanco.",
  // priest
  "Soigne tes troupes blessées, à 4 cases : 8 points de vie par geste.": "Cura a tus tropas heridas, a 4 casillas: 8 puntos de vida por cada curación.",
  "Personne : pas d’arme, pas d’attaque.": "Nadie: sin arma y sin ataque.",
  "Tout ce qui l’atteint : cavalerie, tireurs, engins.": "Todo lo que se le acerque: caballería, tiradores, máquinas.",
  "Deux ou trois derrière ta ligne font durer ton armée bien plus longtemps ; jamais devant.": "Dos o tres detrás de tu línea hacen que tu ejército dure mucho más; nunca delante.",
  // ram
  "L’engin qui abat les bâtiments (+35) et encaisse les flèches.": "La máquina que derriba edificios (+35) y aguanta las flechas.",
  "Les bâtiments et les tours, dont les flèches ne lui font presque rien.": "Edificios y torres, cuyas flechas casi no le hacen nada.",
  "Les {spearman:p} (+6), les {knight:p} (+5) et les {sapeur:p} (+8) : au contact, il est sans défense.": "{spearman:p} (+6), {knight:p} (+5) y {sapeur:p} (+8): en el cuerpo a cuerpo, está indefenso.",
  "Escorte-le jusqu’aux murs, puis vise les tours et les bâtiments qui forment des troupes.": "Escóltalo hasta las murallas y apunta después a las torres y a los edificios que forman tropas.",
  // triton
  "Un fantassin robuste au trident, entre les {militia:p} et les {champion:p}.": "Un soldado de infantería robusto con tridente, a medio camino entre {militia:p} y {champion:p}.",
  "La cavalerie (+6), les {militia:p}, les {spearman:p}.": "La caballería (+6), {militia:p}, {spearman:p}.",
  "Les {champion:p}, les {crossbowman:p}, les tireurs en nombre.": "{champion:p}, {crossbowman:p}, tiradores en masa.",
  "Mêle-le à ta première ligne dès l’Âge Féodal : il arrête les charges que les {militia:p} ne tiennent pas.": "Intégralo en tu primera línea desde la Edad Feudal: detiene las cargas que {militia:p} no aguantan.",
  // horseArcher
  "Un tireur à cheval : la portée des {archer:p}, la vitesse de la cavalerie.": "Un tirador a caballo: el alcance de {archer:p} y la velocidad de la caballería.",
  "Les fantassins lents, qu’il harcèle sans se laisser rattraper, et les ouvriers.": "Infantería lenta, a la que hostiga sin dejarse alcanzar, y trabajadores.",
  "Les {frondeur:p} (+6), les {spearman:p} s’ils l’accrochent, les tireurs en nombre : il a peu d’armure.": "{frondeur:p} (+6), {spearman:p} si lo enganchan, tiradores en masa: tiene poca armadura.",
  "Tire, recule, recommence : ne le laisse jamais immobile au contact.": "Dispara, retrocede y repite: nunca lo dejes quieto en pleno cuerpo a cuerpo.",
  // catapult
  "L’artillerie : un boulet qui frappe toute une zone, à 7 cases.": "La artillería: una piedra que golpea toda una zona, a 7 casillas.",
  "Les bâtiments (+34) et les troupes groupées à l’arrêt.": "Edificios (+34) y tropas agrupadas que están paradas.",
  "Tout ce qui arrive au contact : {knight:p}, {champion:p}, {sapeur:p}. Une troupe en marche esquive le boulet.": "Todo lo que llega al cuerpo a cuerpo: {knight:p}, {champion:p}, {sapeur:p}. Una tropa en marcha esquiva la piedra.",
  "Loin derrière, bien gardée. Ne tire jamais dans une mêlée où tu as des hommes : le boulet les blesse aussi.": "Muy atrás y bien protegida. No dispares nunca a una refriega donde tengas hombres: la piedra también los hiere.",
  // hydra
  "Un monstre qui encaisse comme une escouade et mord 3 ennemis à la fois.": "Un monstruo que aguanta como un escuadrón y muerde a 3 enemigos a la vez.",
  "Les mêlées serrées, l’infanterie légère, les bâtiments (+9).": "Refriegas apretadas, infantería ligera, edificios (+9).",
  "Les tireurs en nombre qui la visent ensemble, et le harcèlement : elle est lente.": "Muchos tiradores apuntándole a la vez y el hostigamiento: es lenta.",
  "Lance-la au cœur de la mêlée, des {priest:p} derrière : c’est là que ses morsures comptent. Elle occupe 3 places.": "Lánzala al corazón de la refriega, con {priest:p} detrás: ahí es donde cuentan sus mordiscos. Ocupa 3 plazas.",
  // pavoisier
  "Un mur : son grand bouclier arrête presque toutes les flèches.": "Un muro: su gran escudo detiene casi todas las flechas.",
  "Les {archer:p}, les {frondeur:p} et les tours.": "{archer:p}, {frondeur:p} y torres.",
  "Les {knight:p}, les {champion:p}, les {catapult:p} — et les {crossbowman:p}, qui percent son bouclier.": "{knight:p}, {champion:p}, {catapult:p} — y {crossbowman:p}, que le perforan el escudo.",
  "Devant, face aux tireurs et aux tours : il encaisse pendant que le reste de l’armée frappe. Seul, il ne tue rien.": "Delante, frente a tiradores y torres: aguanta mientras el resto del ejército golpea. Solo, no mata a nadie.",
  // frondeur
  "Le tireur sans or : une portée courte, mais il chasse les autres tireurs.": "El tirador sin oro: alcance corto, pero da caza a los demás tiradores.",
  "Les {archer:p}, les {crossbowman:p} et les {horseArcher:p} (+6).": "{archer:p}, {crossbowman:p} y {horseArcher:p} (+6).",
  "Tout ce qui arrive au contact, et les {pavoisier:p}.": "Todo lo que llega al cuerpo a cuerpo y {pavoisier:p}.",
  "Poste-le face aux tireurs adverses, derrière tes fantassins. Il coûte peu : formes-en beaucoup.": "Colócalo frente a los tiradores adversarios, detrás de tu infantería. Cuesta poco: forma muchos.",
  // sapeur
  "Un coureur qui s’en prend aux murs et aux engins.": "Un corredor que va a por los muros y las máquinas.",
  "Les bâtiments (+10) et les engins de siège (+8).": "Edificios (+10) y máquinas de asedio (+8).",
  "Tout soldat, et les tours : ni armure, ni points de vie.": "Cualquier soldado y las torres: ni armadura ni puntos de vida.",
  "Fais-le passer pendant que ton armée occupe l’ennemi, droit sur ses engins ou sur un bâtiment isolé.": "Cuélalo mientras tu ejército entretiene al enemigo, directo a sus máquinas o a un edificio aislado.",
  // hydra, chez les solariens
  "Un monstre qui encaisse comme une escouade et frappe 3 ennemis à la fois.": "Un monstruo que aguanta como un escuadrón y golpea a 3 enemigos a la vez.",
  "Les tireurs en nombre qui le visent ensemble, et le harcèlement : il est lent.": "Muchos tiradores apuntándole a la vez y el hostigamiento: avanza despacio.",
  "Lance-le au cœur de la mêlée, des {priest:p} derrière : c’est là que ses coups comptent. Il occupe 3 places.": "Lánzalo al corazón de la refriega, con {priest:p} detrás: ahí es donde cuentan sus golpes. Ocupa 3 plazas.",
};
