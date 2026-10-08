// ---------------------------------------------------------------------------
// La fiche de chaque troupe : quatre phrases courtes, lues sur l'écran de la
// collection (js/progression-ecrans.js) — son rôle, ce qu'elle bat, ce qu'elle
// craint, comment bien s'en servir.
//
// Les autres troupes y sont citées par un jeton, `{militia}` ou `{militia:p}`
// (pluriel), remplacé par le nom que le peuple du joueur leur donne : un
// Solarien lit « Méharistes » là où un Atlante lit « Cavaliers ». On écrit donc
// les jetons au pluriel derrière « les », « des », « aux », « tes » — jamais
// derrière un article qui s'accorde ou s'élide. Les chiffres cités sont ceux de
// js/config.js (bonus, portée) : test/fiches-coffres.test.js les recoupe.
// ---------------------------------------------------------------------------

import { nomDe } from './config.js';

export const RUBRIQUES = [['role', 'Rôle'], ['bat', 'Bat'], ['craint', 'Craint'], ['conseil', 'Conseil']];

export const FICHES = {
  villager: {
    role: 'Récolte le bois, les vivres et l’or, construit et répare : sans ouvriers, ni cité ni armée.',
    bat: 'Personne : au combat, un ouvrier ne vaut que contre un autre ouvrier.',
    craint: 'Tout soldat, et d’abord la cavalerie, qui le rattrape.',
    conseil: 'Formes-en sans arrêt au début, garde-les près d’une tour, et sonne la cloche quand l’ennemi approche.',
  },
  militia: {
    role: 'Le fantassin de base : bon marché, disponible dès le premier âge, il tient la ligne.',
    bat: 'Les {spearman:p}, et les tireurs dès qu’il arrive au contact.',
    craint: 'Les {knight:p}, les {champion:p} et les {crossbowman:p}, qui percent son armure.',
    conseil: 'En nombre et tôt : c’est ta première armée. À l’Âge des Châteaux, passe aux {champion:p}.',
  },
  spearman: {
    role: 'Le tueur de cavalerie : bon marché, et sans or.',
    bat: 'Toute la cavalerie (+10) et les engins de siège (+6).',
    craint: 'Les {militia:p}, les {champion:p} et les tireurs : il n’a aucune armure.',
    conseil: 'Place-le devant tes tireurs et tes engins, là où la cavalerie viendra charger.',
  },
  archer: {
    role: 'Le tireur de base : il frappe à 5 cases, avant que l’ennemi ne le touche.',
    bat: 'L’infanterie sans armure tenue à distance : {spearman:p}, {sapeur:p}, {militia:p}.',
    craint: 'La cavalerie qui lui tombe dessus, les {frondeur:p}, et les {pavoisier:p}, que ses flèches n’entament pas.',
    conseil: 'Toujours derrière une ligne de fantassins ; recule dès qu’on arrive au contact.',
  },
  scout: {
    role: 'Le plus rapide, et celui qui voit le plus loin : il explore et repère l’ennemi.',
    bat: 'Les ouvriers isolés et les tireurs sans escorte.',
    craint: 'Les {spearman:p} et tout vrai soldat : il frappe peu.',
    conseil: 'Fais-lui faire le tour de la carte dès le début ; ensuite, poste-le sur les routes d’attaque.',
  },
  knight: {
    role: 'La cavalerie lourde : rapide, solide, elle frappe fort.',
    bat: 'Les tireurs (+4), les ouvriers, les engins de siège (+5) et les {pavoisier:p}.',
    craint: 'Les {spearman:p} avant tout (+10 contre la cavalerie), et les {triton:p} (+6).',
    conseil: 'Contourne la ligne adverse et fonce sur ses tireurs et ses engins ; évite les lances.',
  },
  champion: {
    role: 'L’infanterie lourde : beaucoup de points de vie, une bonne armure, de gros dégâts.',
    bat: 'Les {militia:p}, les {spearman:p}, les {pavoisier:p}, et les tireurs une fois au contact.',
    craint: 'Les {crossbowman:p} (+8 contre l’infanterie), les {catapult:p} s’il reste groupé, les {hydra:p}.',
    conseil: 'Le cœur de ton armée à l’Âge des Châteaux : fais-le avancer en premier, les tireurs derrière.',
  },
  crossbowman: {
    role: 'Le tireur lourd : 6 cases de portée, et un carreau qui perce l’armure.',
    bat: 'Toute l’infanterie (+8), jusqu’aux {champion:p} et aux {pavoisier:p}.',
    craint: 'La cavalerie, les {frondeur:p} (+6 contre les tireurs), et tout ce qui arrive pendant qu’il recharge.',
    conseil: 'Peu nombreux mais bien protégés : il recharge lentement, chaque carreau doit porter.',
  },
  priest: {
    role: 'Soigne tes troupes blessées, à 4 cases : 8 points de vie par geste.',
    bat: 'Personne : pas d’arme, pas d’attaque.',
    craint: 'Tout ce qui l’atteint : cavalerie, tireurs, engins.',
    conseil: 'Deux ou trois derrière ta ligne font durer ton armée bien plus longtemps ; jamais devant.',
  },
  ram: {
    role: 'L’engin qui abat les bâtiments (+35) et encaisse les flèches.',
    bat: 'Les bâtiments et les tours, dont les flèches ne lui font presque rien.',
    craint: 'Les {spearman:p} (+6), les {knight:p} (+5) et les {sapeur:p} (+8) : au contact, il est sans défense.',
    conseil: 'Escorte-le jusqu’aux murs, puis vise les tours et les bâtiments qui forment des troupes.',
  },
  triton: {
    role: 'Un fantassin robuste au trident, entre les {militia:p} et les {champion:p}.',
    bat: 'La cavalerie (+6), les {militia:p}, les {spearman:p}.',
    craint: 'Les {champion:p}, les {crossbowman:p}, les tireurs en nombre.',
    conseil: 'Mêle-le à ta première ligne dès l’Âge Féodal : il arrête les charges que les {militia:p} ne tiennent pas.',
  },
  horseArcher: {
    role: 'Un tireur à cheval : la portée des {archer:p}, la vitesse de la cavalerie.',
    bat: 'Les fantassins lents, qu’il harcèle sans se laisser rattraper, et les ouvriers.',
    craint: 'Les {frondeur:p} (+6), les {spearman:p} s’ils l’accrochent, les tireurs en nombre : il a peu d’armure.',
    conseil: 'Tire, recule, recommence : ne le laisse jamais immobile au contact.',
  },
  catapult: {
    role: 'L’artillerie : un boulet qui frappe toute une zone, à 7 cases.',
    bat: 'Les bâtiments (+34) et les troupes groupées à l’arrêt.',
    craint: 'Tout ce qui arrive au contact : {knight:p}, {champion:p}, {sapeur:p}. Une troupe en marche esquive le boulet.',
    conseil: 'Loin derrière, bien gardée. Ne tire jamais dans une mêlée où tu as des hommes : le boulet les blesse aussi.',
  },
  hydra: {
    role: 'Un monstre qui encaisse comme une escouade et mord 3 ennemis à la fois.',
    bat: 'Les mêlées serrées, l’infanterie légère, les bâtiments (+9).',
    craint: 'Les tireurs en nombre qui la visent ensemble, et le harcèlement : elle est lente.',
    conseil: 'Lance-la au cœur de la mêlée, des {priest:p} derrière : c’est là que ses morsures comptent. Elle occupe 3 places.',
  },
  pavoisier: {
    role: 'Un mur : son grand bouclier arrête presque toutes les flèches.',
    bat: 'Les {archer:p}, les {frondeur:p} et les tours.',
    craint: 'Les {knight:p}, les {champion:p}, les {catapult:p} — et les {crossbowman:p}, qui percent son bouclier.',
    conseil: 'Devant, face aux tireurs et aux tours : il encaisse pendant que le reste de l’armée frappe. Seul, il ne tue rien.',
  },
  frondeur: {
    role: 'Le tireur sans or : une portée courte, mais il chasse les autres tireurs.',
    bat: 'Les {archer:p}, les {crossbowman:p} et les {horseArcher:p} (+6).',
    craint: 'Tout ce qui arrive au contact, et les {pavoisier:p}.',
    conseil: 'Poste-le face aux tireurs adverses, derrière tes fantassins. Il coûte peu : formes-en beaucoup.',
  },
  sapeur: {
    role: 'Un coureur qui s’en prend aux murs et aux engins.',
    bat: 'Les bâtiments (+10) et les engins de siège (+8).',
    craint: 'Tout soldat, et les tours : ni armure, ni points de vie.',
    conseil: 'Fais-le passer pendant que ton armée occupe l’ennemi, droit sur ses engins ou sur un bâtiment isolé.',
  },
};

/**
 * Les fiches qu'un peuple réécrit : sa troupe tient le même rôle (mêmes
 * chiffres, mêmes règles), mais ce n'est pas la même créature — le Sphinx des
 * Solariens n'est pas « elle », et il ne mord pas.
 */
export const FICHES_CIV = {
  solarien: {
    hydra: {
      role: 'Un monstre qui encaisse comme une escouade et frappe 3 ennemis à la fois.',
      bat: 'Les mêlées serrées, l’infanterie légère, les bâtiments (+9).',
      craint: 'Les tireurs en nombre qui le visent ensemble, et le harcèlement : il est lent.',
      conseil: 'Lance-le au cœur de la mêlée, des {priest:p} derrière : c’est là que ses coups comptent. Il occupe 3 places.',
    },
  },
};

/** Remplace les jetons `{type}` et `{type:p}` par le nom que ce peuple donne à la troupe. */
export function nommer(texte, civ) {
  return texte.replace(/\{([A-Za-z]+)(:p)?\}/g, (_, type, pluriel) => nomDe(type, civ, pluriel ? 2 : 1));
}

/**
 * La fiche d'une troupe pour ce peuple : `[{ cle, titre, texte }, …]` dans
 * l'ordre des rubriques, ou null si la troupe n'en a pas.
 */
export function ficheDeTroupe(type, civ) {
  const commune = Object.prototype.hasOwnProperty.call(FICHES, type) ? FICHES[type] : null;
  if (!commune) return null;
  const propres = Object.prototype.hasOwnProperty.call(FICHES_CIV, civ) ? FICHES_CIV[civ] : null;
  const fiche = propres && Object.prototype.hasOwnProperty.call(propres, type) ? propres[type] : commune;
  // (Une espace insécable devant « : » et « ; » : la ponctuation ne passe jamais seule à la ligne.)
  return RUBRIQUES.map(([cle, titre]) => ({ cle, titre, texte: nommer(fiche[cle], civ).replace(/ ([:;])/g, '\u00a0$1') }));
}
