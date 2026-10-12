// Les objectifs du jour et de la semaine, le compteur de jours joués, le bon retour : des raisons de revenir
// demain (état des lieux du 12/10/2026), sans rien qui se perde et sans un Éclat de plus.
// Lancement : node test/objectifs.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESSION as R } from '../js/progression-config.js';
import { CIVILISATIONS } from '../js/config.js';
import {
  profilNeuf, migrerProfil, appliquerResultat, objectifsDuJour, objectifDeLaSemaine, etatDesObjectifs, semaineDuJour,
} from '../js/progression.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const O = R.objectifs;
const TOUS = [...O.faciles, ...O.moyens];
/** Le jour qui suit de `n` jours. */
function plus(jour, n) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DEPART = '2026-10-12';   // un lundi
/** Le premier jour, à partir de DEPART, dont les objectifs remplissent la condition. */
function jourOu(condition, depart = DEPART) {
  for (let i = 0; i < 400; i++) { const j = plus(depart, i); if (condition(objectifsDuJour(j), objectifDeLaSemaine(j), j)) return j; }
  throw new Error('aucun jour ne convient');
}
let numero = 0;
/** Une partie classée finie : son issue, son jour, ce que le joueur y a fait. */
function jouer(profil, issue, jour, faits = {}, extra = {}) {
  numero++;
  return appliquerResultat(profil, { issue, duree: 280, contreOrdinateur: 'echelle', jour, instant: 1_800_000_000 + numero * 600, id: `objectif-${numero}`, format: 'escarmouche', faits, ...extra });
}
const parType = (evenements, type) => evenements.filter((e) => e.type === type);
/** Un joueur d'après ses premiers jours : ses points de saison ne comptent plus double (voir « Les premiers jours », plus bas). */
const rode = () => ({ ...profilNeuf(), premierJour: '2026-01-01' });

// --- Les réglages -----------------------------------------------------------------------
console.log('--- Les réglages ---');
const GENRES_DU_JOUR = ['jouer', 'gagner', 'former', 'abattre', 'batir', 'pertes'];
check('deux listes pour le jour — des faciles, des moins faciles — et une pour la semaine', O.faciles.length >= 3 && O.moyens.length >= 5 && O.semaine.length >= 3);
check('chaque objectif a un identifiant à lui, un nom, et un genre que les règles connaissent',
  new Set([...TOUS, ...O.semaine].map((o) => o.id)).size === TOUS.length + O.semaine.length
  && TOUS.every((o) => GENRES_DU_JOUR.includes(o.genre) && typeof o.nom === 'string' && o.nom.length > 8)
  && O.semaine.every((o) => ['victoires', 'jours', 'peuples'].includes(o.genre) && Number.isInteger(o.seuil) && o.seuil > 1));
check('les seuils sont des nombres entiers, et un peuple nommé existe',
  TOUS.every((o) => (o.seuil === undefined || (Number.isInteger(o.seuil) && o.seuil > 0)) && (o.civ === undefined || !!CIVILISATIONS[o.civ])));
check('un nombre écrit dans le nom d’un objectif est son seuil', [...TOUS, ...O.semaine].every((o) => { const n = (o.nom.match(/\d+/) || [])[0]; return n === undefined || Number(n) === o.seuil; }));
check('les faciles ne demandent pas de gagner : perdre n’empêche pas d’en faire un', O.faciles.every((o) => o.genre !== 'gagner' && o.genre !== 'pertes'));
check('ils paient en points de saison, des nombres entiers — la semaine plus que le jour', Number.isInteger(O.points.jour) && O.points.jour > 0 && Number.isInteger(O.points.semaine) && O.points.semaine > O.points.jour);
check('la semaine entière d’objectifs ne vaut pas un mois de route : la partie reste la première source de points',
  (7 * 2 * O.points.jour + O.points.semaine) * 4 < R.saisons.paliers * R.saisons.pointsParPalier);
check('le peuple qu’il faut pour « les deux peuples » : il y en a bien deux', O.semaine.filter((o) => o.genre === 'peuples').every((o) => o.seuil === Object.keys(CIVILISATIONS).length));

// --- Tirés de la date -----------------------------------------------------------------------
console.log('--- Tirés de la date ---');
{
  const j = objectifsDuJour(DEPART);
  check('chaque jour a deux objectifs : un facile, puis un moins facile', j.length === 2 && O.faciles.includes(j[0]) && O.moyens.includes(j[1]));
  check('les mêmes pour tous : la date seule les décide', egal(objectifsDuJour(DEPART), objectifsDuJour(DEPART)) && egal(objectifsDuJour('2031-03-03'), objectifsDuJour('2031-03-03')));
  check('d’un jour au suivant, les deux changent', objectifsDuJour(plus(DEPART, 1))[0] !== j[0] && objectifsDuJour(plus(DEPART, 1))[1] !== j[1]);
  const vus = new Set();
  for (let i = 0; i < O.faciles.length * O.moyens.length; i++) for (const o of objectifsDuJour(plus(DEPART, i))) vus.add(o.id);
  check('au fil des jours, tous les objectifs passent', vus.size === TOUS.length);
  check('une date illisible ne donne rien, sans erreur', objectifsDuJour('demain').length === 0 && objectifsDuJour(undefined).length === 0 && objectifDeLaSemaine('') === null);
  const lundi = objectifDeLaSemaine(DEPART);
  check('l’objectif de la semaine tient du lundi au dimanche, et change le lundi suivant',
    [1, 2, 3, 4, 5, 6].every((i) => objectifDeLaSemaine(plus(DEPART, i)) === lundi) && objectifDeLaSemaine(plus(DEPART, 7)) !== lundi && semaineDuJour(plus(DEPART, 7)) === semaineDuJour(DEPART) + 1);
}

// --- Les objectifs du jour --------------------------------------------------------------------
console.log('--- Les objectifs du jour ---');
{
  const jJouer = jourOu((d) => d[0].genre === 'jouer');
  const perdue = jouer(rode(), 'defaite', jJouer);
  const o = parType(perdue.evenements, 'objectif');
  check('« Jouer une partie classée » : une défaite jouée jusqu’au bout suffit, et paie ses points de saison',
    o.length === 1 && o[0].portee === 'jour' && o[0].objectif === 'jouer' && o[0].points === O.points.jour && perdue.profil.objectifs.faits.includes('jouer')
    && perdue.profil.route.points === R.saisons.points.partie + O.points.jour);
  check('… pas un Éclat, pas une Couronne : seulement des points de saison', perdue.profil.eclats === 0 && perdue.profil.couronnes === 0);
  const encore = jouer(perdue.profil, 'defaite', jJouer);
  check('… une seule fois par jour', parType(encore.evenements, 'objectif').length === 0 && encore.profil.route.points === perdue.profil.route.points + R.saisons.points.partie);
  const lendemain = jouer(encore.profil, 'defaite', plus(jJouer, O.faciles.length));
  check('… et il revient le jour où la date le ramène', parType(lendemain.evenements, 'objectif').some((e) => e.objectif === 'jouer') && egal(lendemain.profil.objectifs.faits, ['jouer']));
  const eclair = jouer(rode(), 'defaite', jJouer, {}, { duree: 30 });
  check('une défaite d’avant deux minutes n’atteint aucun objectif', parType(eclair.evenements, 'objectif').length === 0 && eclair.profil.objectifs.faits.length === 0);
  const annulee = jouer(rode(), 'annulee', jJouer);
  check('une partie annulée non plus', parType(annulee.evenements, 'objectif').length === 0);

  const jGagner = jourOu((d) => d[1].id === 'gagner');
  check('« Gagner une partie classée » : une défaite ne le fait pas, une victoire oui',
    !jouer(rode(), 'defaite', jGagner).profil.objectifs.faits.includes('gagner') && jouer(rode(), 'victoire', jGagner).profil.objectifs.faits.includes('gagner'));
  const jSolarien = jourOu((d) => d[1].id === 'gagnerSolarien');
  check('« Gagner avec les Solariens » : gagner avec les Atlantes ne compte pas',
    !jouer(rode(), 'victoire', jSolarien, { civ: 'atlante' }).profil.objectifs.faits.includes('gagnerSolarien')
    && jouer(rode(), 'victoire', jSolarien, { civ: 'solarien' }).profil.objectifs.faits.includes('gagnerSolarien')
    && !jouer(rode(), 'defaite', jSolarien, { civ: 'solarien' }).profil.objectifs.faits.includes('gagnerSolarien'));
  const jFormer = jourOu((d) => d[0].id === 'former12');
  check('« Former 12 unités » : onze ne suffisent pas, douze oui — même en perdant',
    !jouer(rode(), 'defaite', jFormer, { formees: 11 }).profil.objectifs.faits.includes('former12') && jouer(rode(), 'defaite', jFormer, { formees: 12 }).profil.objectifs.faits.includes('former12'));
  const jPertes = jourOu((d) => d[1].id === 'pertes6');
  check('« Gagner en perdant moins de 6 unités » : il faut gagner, et que les pertes soient dites',
    jouer(rode(), 'victoire', jPertes, { perdues: 5 }).profil.objectifs.faits.includes('pertes6') && !jouer(rode(), 'victoire', jPertes, { perdues: 6 }).profil.objectifs.faits.includes('pertes6')
    && !jouer(rode(), 'defaite', jPertes, { perdues: 0 }).profil.objectifs.faits.includes('pertes6') && !jouer(rode(), 'victoire', jPertes, {}).profil.objectifs.faits.includes('pertes6'));
  const jDeux = jourOu((d) => d[0].id === 'abattre8' && d[1].genre === 'gagner' && !d[1].civ);
  const doublee = jouer(rode(), 'victoire', jDeux, { abattus: 9 });
  check('une même partie peut atteindre les deux objectifs du jour', parType(doublee.evenements, 'objectif').length === 2 && doublee.profil.objectifs.faits.length === 2);
  check('des faits illisibles ne font rien gagner, sans erreur',
    jouer(rode(), 'victoire', jFormer, { formees: 'beaucoup', abattus: -4, baties: NaN }).profil.objectifs.faits.every((id) => TOUS.find((x) => x.id === id).genre === 'gagner')
    && !jouer(rode(), 'defaite', jFormer, null).erreur);
  const auBout = jouer({ ...rode(), route: { points: R.saisons.paliers * R.saisons.pointsParPalier - R.saisons.points.partie - 10, passe: false, pris: { gratuit: [], passe: [] } } }, 'defaite', jJouer);
  check('au bout de la route, un objectif ne la fait pas déborder', auBout.profil.route.points === R.saisons.paliers * R.saisons.pointsParPalier && parType(auBout.evenements, 'objectif')[0].points === 10);
}

// --- L'objectif de la semaine -------------------------------------------------------------------
console.log('--- L’objectif de la semaine ---');
{
  const jV = jourOu((d, s, j) => s.genre === 'victoires' && semaineDuJour(plus(j, 6)) === semaineDuJour(j));   // un lundi
  const seuil = objectifDeLaSemaine(jV).seuil;
  let p = rode(), paye = [];
  for (let i = 0; i < seuil; i++) { const r = jouer(p, 'victoire', plus(jV, i % 3)); p = r.profil; paye.push(parType(r.evenements, 'objectif').filter((e) => e.portee === 'semaine').length); }
  check(`« Gagner ${seuil} parties classées » : la dernière victoire le paie, pas avant`, egal(paye, [...Array(seuil - 1).fill(0), 1]) && p.objectifs.semaine.fait && p.objectifs.semaine.avance === seuil);
  const apresCoup = jouer(p, 'victoire', plus(jV, 3));
  check('… une seule fois dans la semaine', parType(apresCoup.evenements, 'objectif').every((e) => e.portee !== 'semaine'));
  check('… une défaite ne l’avance pas', jouer(rode(), 'defaite', jV).profil.objectifs.semaine.avance === 0);
  check('… ce qu’il rapporte est dit, en points de saison', parType(jouer({ ...p, objectifs: { ...p.objectifs, semaine: { ...p.objectifs.semaine, fait: false, avance: seuil - 1 } } }, 'victoire', jV).evenements, 'objectif').some((e) => e.portee === 'semaine' && e.points === O.points.semaine));
  const semaineSuivante = jouer(p, 'defaite', plus(jV, 7));
  check('le lundi suivant, la semaine repart de zéro', semaineSuivante.profil.objectifs.semaine.fait === false && semaineSuivante.profil.objectifs.semaine.numero === semaineDuJour(jV) + 1);

  const jJ = jourOu((d, s, j) => s.genre === 'jours' && semaineDuJour(plus(j, 6)) === semaineDuJour(j));
  const quatre = objectifDeLaSemaine(jJ).seuil;
  p = rode(); paye = [];
  for (let i = 0; i < quatre; i++) { const r = jouer(p, 'defaite', plus(jJ, i)); p = jouer(r.profil, 'defaite', plus(jJ, i)).profil; paye.push(parType(r.evenements, 'objectif').filter((e) => e.portee === 'semaine').length); }
  check(`« Jouer ${quatre} jours différents » : deux parties le même jour comptent pour un jour`, egal(paye, [...Array(quatre - 1).fill(0), 1]) && p.objectifs.semaine.avance === quatre);

  const jP = jourOu((d, s) => s.genre === 'peuples');
  const a1 = jouer(rode(), 'victoire', jP, { civ: 'atlante' });
  const a2 = jouer(a1.profil, 'victoire', jP, { civ: 'atlante' });
  const s1 = jouer(a2.profil, 'victoire', jP, { civ: 'solarien' });
  check('« Gagner avec les deux peuples » : deux victoires avec le même n’en font qu’une, l’autre peuple le finit',
    a2.profil.objectifs.semaine.avance === 1 && !a2.profil.objectifs.semaine.fait && s1.profil.objectifs.semaine.fait && egal(s1.profil.objectifs.semaine.vus, ['atlante', 'solarien']));
}

// --- Les jours joués et le bon retour -----------------------------------------------------------------
console.log('--- Les jours joués, le bon retour ---');
{
  const a = jouer(profilNeuf(), 'defaite', DEPART);
  const b = jouer(a.profil, 'victoire', DEPART);
  const c = jouer(b.profil, 'defaite', plus(DEPART, 1));
  check('le compteur de jours joués : un par jour où l’on joue, jamais deux', a.profil.joursJoues === 1 && b.profil.joursJoues === 1 && c.profil.joursJoues === 2);
  check('… il garde le premier et le dernier jour', c.profil.premierJour === DEPART && c.profil.dernierJour === plus(DEPART, 1));
  const absent = jouer(c.profil, 'defaite', plus(DEPART, 40));
  check('… il ne retombe jamais : quarante jours d’absence n’enlèvent rien', absent.profil.joursJoues === 3);
  check('… et une partie d’avant deux minutes ne fait pas un jour joué', jouer(profilNeuf(), 'defaite', DEPART, {}, { duree: 20 }).profil.joursJoues === 0);

  const n = R.retour.apres;
  const juste = jouer(c.profil, 'defaite', plus(DEPART, 1 + n));   // n − 1 jours sans jouer
  check(`après ${n - 1} jours sans jouer : rien de spécial`, parType(juste.evenements, 'bonRetour').length === 0 && !juste.profil.coffres.some((x) => x.origine === 'retour'));
  const retour = jouer(c.profil, 'defaite', plus(DEPART, 2 + n));  // n jours sans jouer
  check(`après ${n} jours sans jouer : un coffre de plus, et l’événement « bon retour » dit l’absence`,
    parType(retour.evenements, 'bonRetour').length === 1 && parType(retour.evenements, 'bonRetour')[0].jours === n
    && retour.profil.coffres.filter((x) => x.origine === 'retour').length === 1 && retour.profil.coffres.find((x) => x.origine === 'retour').type === R.retour.coffre);
  check('… une seule fois par retour : la partie suivante n’en redonne pas', parType(jouer(retour.profil, 'defaite', plus(DEPART, 2 + n)).evenements, 'bonRetour').length === 0);
  check('un joueur neuf n’a pas de retour à fêter', parType(a.evenements, 'bonRetour').length === 0);
  const ancienne = migrerProfil({ parties: 40, victoires: 25, defaites: 15, jour: { date: DEPART, parties: 2, abandonsPrecoces: 0, victoires: 1 } });
  check('une fiche d’avant ces compteurs : son dernier jour de jeu se lit dans ses compteurs du jour', ancienne.dernierJour === DEPART && ancienne.joursJoues === 0);
  check('… elle a donc droit au bon retour', parType(jouer(ancienne, 'defaite', plus(DEPART, 30)).evenements, 'bonRetour').length === 1);

  const v = jouer(jouer(profilNeuf(), 'victoire', DEPART, { civ: 'atlante' }).profil, 'victoire', DEPART, { civ: 'solarien' }, { format: 'express' });
  check('les victoires se comptent par peuple et par format (pour la maîtrise, plus tard)',
    egal(v.profil.victoiresPar, { civ: { atlante: 1, solarien: 1 }, format: { escarmouche: 1, express: 1 } }) && egal(jouer(profilNeuf(), 'defaite', DEPART, { civ: 'atlante' }).profil.victoiresPar, { civ: {}, format: {} }));
}

// --- Les premiers jours : des points doublés ----------------------------------------------------------
console.log('--- Les premiers jours ---');
{
  const { jours, facteur } = R.saisons.premiersJours;
  const base = R.saisons.points.partie + R.saisons.points.victoire + R.saisons.points.premiereVictoireDuJour;
  const jJouer = jourOu((d) => d[0].genre === 'jouer');
  const premiere = jouer(profilNeuf(), 'victoire', jJouer);
  const saison = parType(premiere.evenements, 'pointsDeSaison')[0], objectif = parType(premiere.evenements, 'objectif').find((e) => e.objectif === 'jouer');
  check(`un nouveau joueur gagne ses points de saison ${facteur} fois : la première victoire en vaut ${base * facteur}, et l’événement le dit`,
    Number.isInteger(facteur) && facteur > 1 && saison.variation === base * facteur && saison.facteur === facteur && premiere.profil.premierJour === jJouer);
  check('… ses objectifs aussi', objectif.points === O.points.jour * facteur);
  let p = premiere.profil;
  const dernier = jouer(p, 'defaite', plus(jJouer, jours - 1));
  check(`… jusqu’à son jour n° ${jours} compris`, parType(dernier.evenements, 'pointsDeSaison')[0].variation === R.saisons.points.partie * facteur);
  const apres = jouer(dernier.profil, 'defaite', plus(jJouer, jours));
  check('… le lendemain, les points reprennent leur valeur, et l’événement ne parle plus de facteur',
    parType(apres.evenements, 'pointsDeSaison')[0].variation === R.saisons.points.partie && parType(apres.evenements, 'pointsDeSaison')[0].facteur === undefined);
  const ancienne = migrerProfil({ parties: 40, victoires: 25, defaites: 15, jour: { date: DEPART, parties: 2, abandonsPrecoces: 0, victoires: 1 } });
  check('une fiche d’avant ces compteurs a déjà joué : elle ne passe pas pour un nouveau joueur', ancienne.premierJour === DEPART
    && parType(jouer(ancienne, 'defaite', plus(DEPART, jours + 3)).evenements, 'pointsDeSaison')[0].variation === R.saisons.points.partie);
  const auBout = jouer({ ...profilNeuf(), route: { points: R.saisons.paliers * R.saisons.pointsParPalier - 5, passe: false, pris: { gratuit: [], passe: [] } } }, 'victoire', jJouer);
  check('même doublés, les points ne font pas déborder la route', auBout.profil.route.points === R.saisons.paliers * R.saisons.pointsParPalier && parType(auBout.evenements, 'pointsDeSaison')[0].variation === 5);
  check(`la route d’un mois : ${R.saisons.paliers} paliers de ${R.saisons.pointsParPalier} points — un nouveau joueur assidu en voit le bout malgré tout`,
    R.saisons.pointsParPalier === 200 && R.saisons.paliers * R.saisons.pointsParPalier === 6000);
}

// --- La fiche -----------------------------------------------------------------------------------
console.log('--- La fiche ---');
{
  const p = jouer(jouer(profilNeuf(), 'victoire', DEPART, { civ: 'atlante', formees: 30, abattus: 30, baties: 9, perdues: 0 }).profil, 'victoire', plus(DEPART, 1), { civ: 'solarien' }).profil;
  check('un aller-retour par la sauvegarde rend la même fiche', egal(migrerProfil(JSON.parse(JSON.stringify(p))), p));
  const abimee = migrerProfil({ objectifs: { jour: 'hier', faits: ['jouer', 'inconnu', 'jouer', 7], semaine: { numero: 'x', avance: -3, vus: ['atlante', '<script>', 'atlante', 12], fait: 'oui' } }, joursJoues: -4, premierJour: 12, dernierJour: 'x', victoiresPar: { civ: { atlante: 3, '<b>': 9, solarien: -1 }, format: 'tout' } });
  check('une fiche abîmée se lit sans erreur : ce qui ne tient pas debout reprend sa valeur de départ',
    abimee.objectifs.jour === '' && abimee.objectifs.faits.length === 0 && abimee.objectifs.semaine.numero === 0 && abimee.objectifs.semaine.avance === 0
    && egal(abimee.objectifs.semaine.vus, ['atlante']) && abimee.objectifs.semaine.fait === false && abimee.joursJoues === 0 && abimee.premierJour === '' && abimee.dernierJour === ''
    && egal(abimee.victoiresPar, { civ: { atlante: 3 }, format: {} }));
  const lue = migrerProfil({ objectifs: { jour: DEPART, faits: ['jouer', 'inconnu', 'jouer'] } });
  check('un objectif inconnu ou répété ne reste pas dans la fiche', egal(lue.objectifs.faits, ['jouer']));

  const etat = etatDesObjectifs(jouer(profilNeuf(), 'defaite', jourOu((d) => d[0].genre === 'jouer')).profil, jourOu((d) => d[0].genre === 'jouer'));
  check('l’état du jour : deux objectifs, celui qui est fait et l’autre, leurs points, la semaine, les jours joués',
    etat.duJour.length === 2 && etat.duJour[0].fait === true && etat.duJour[1].fait === false && etat.duJour.every((o) => o.points === O.points.jour)
    && etat.semaine && etat.semaine.points === O.points.semaine && Number.isInteger(etat.semaine.avance) && etat.joursJoues === 1);
  const demain = etatDesObjectifs(jouer(profilNeuf(), 'defaite', DEPART).profil, plus(DEPART, 1));
  check('le lendemain, sans avoir joué : rien n’est fait, et rien n’a été perdu', demain.duJour.every((o) => !o.fait) && demain.joursJoues === 1);
  check('l’état ne touche pas à la fiche', (() => { const f = profilNeuf(), avant = JSON.stringify(f); etatDesObjectifs(f, DEPART); return JSON.stringify(f) === avant; })());
}

// --- Les écrans -------------------------------------------------------------------------------
console.log('--- Les écrans ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const { htmlAujourdhui, htmlFinDePartie } = await import('../js/progression-ecrans.js');
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  const jour = jourOu((d) => d[0].genre === 'jouer');
  const neuve = htmlAujourdhui(rode(), jour);
  const [o1, o2] = objectifsDuJour(jour);
  check('la carte « Aujourd’hui » nomme les deux objectifs du jour et celui de la semaine, avec leurs points',
    texte(neuve).includes(o1.nom) && texte(neuve).includes(o2.nom) && texte(neuve).includes(objectifDeLaSemaine(jour).nom)
    && (neuve.match(new RegExp(`<b>\\+${O.points.jour}</b>`, 'g')) || []).length === 2 && neuve.includes(`<b>+${O.points.semaine}</b>`));
  check('… rien n’y est coché, et un joueur neuf n’y lit pas de jours joués', !/class="fait"/.test(neuve) && !/jours? joué/.test(texte(neuve)));
  const jouee = jouer(rode(), 'defaite', jour).profil;
  const cochee = htmlAujourdhui(jouee, jour);
  check('… après une partie : l’objectif atteint est coché, l’autre non, et le jour joué se lit', (cochee.match(/<li class="fait">/g) || []).length === 1 && /1 jour joué/.test(texte(cochee)));
  check('… l’avance de la semaine se lit en « fait / à faire »', new RegExp(`\\d+ / ${objectifDeLaSemaine(jour).seuil}`).test(texte(cochee)));
  check('… elle dit d’où viennent les points : de la saison, en partie classée', /points de saison/.test(texte(neuve)) && /partie classée/.test(texte(neuve)));
  check('… au pluriel après deux jours', /2 jours joués/.test(texte(htmlAujourdhui(jouer(jouee, 'defaite', plus(jour, 1)).profil, plus(jour, 1)))));
  check('rien d’étrange à l’écran : ni « undefined », ni « NaN »', !/undefined|NaN|\[object/.test(neuve + cochee));
  check('une date illisible : pas de carte', htmlAujourdhui(rode(), 'x') === '');

  const r = jouer(rode(), 'defaite', jour);
  const fin = texte(htmlFinDePartie(r.evenements, r.profil));
  check('la fin de partie dit l’objectif atteint et ce qu’il rapporte', fin.includes(`Objectif du jour : ${o1.nom} · +${O.points.jour} points de saison`), fin.slice(0, 300));
  const hebdo = htmlFinDePartie([{ type: 'objectif', portee: 'semaine', objectif: O.semaine[0].id, points: O.points.semaine, total: 100, palier: 1, paliersGagnes: 1 }], rode());
  check('… celui de la semaine aussi, et le palier qu’il ouvre se propose', texte(hebdo).includes(`Objectif de la semaine : ${O.semaine[0].nom} · +${O.points.semaine} points de saison`) && /data-ecran="saison">palier 1 à prendre/.test(hebdo));
  check('… et le bon retour', texte(htmlFinDePartie([{ type: 'bonRetour', jours: 9 }], rode())).includes('Bon retour ! Un coffre t’attendait.'));
}

// --- Le branchement -----------------------------------------------------------------------------
console.log('--- Le branchement ---');
{
  const main = lire('js/main.js'), index = lire('index.html'), css = lire('css/progression.css');
  check('la partie classée dit ce que le joueur y a fait : son peuple, ses unités formées, perdues, ses bâtiments, ses ennemis abattus',
    /faits: \{\n\s+civ: moi\.civ, formees: moi\.stats\.trained, perdues: moi\.stats\.lost, baties: moi\.stats\.built, abattus: moi\.stats\.killed,\n\s+\},/.test(main));
  check('l’accueil a sa carte « Aujourd’hui », redessinée avec le bandeau', /<div id="aujourdhui-box"><\/div>/.test(index) && /if \(box\) box\.innerHTML = htmlBandeau\(lireProgression\(\)\);\n  refreshAujourdhui\(\);/.test(main));
  check('une seule carte à la fois : tant que l’invitation à la partie guidée est là, celle-ci attend',
    /box\.innerHTML = guideVu\(\) \? htmlAujourdhui\(lireProgression\(\), jourLocal\(\)\) : '';/.test(main) && index.indexOf('id="invite-guide"') < index.indexOf('id="aujourdhui-box"') && index.indexOf('id="aujourdhui-box"') < index.indexOf('id="btn-play"'));
  check('la carte a son style, et sa case se coche sans image', /\.prog-aujourdhui \{/.test(css) && /li\.fait \.prog-auj-case::after \{/.test(css));
  check('le script des essais lance aussi celui-ci', lire('package.json').includes('node test/objectifs.test.js'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
