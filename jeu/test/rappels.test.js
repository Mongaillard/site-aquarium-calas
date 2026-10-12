// Les rappels du téléphone (js/rappels.js) : sobres, et dans l'application seulement.
// Un par jour au plus, trois d'avance au plus, jamais la nuit, jamais pour vendre ; la permission se demande
// une fois, après une première victoire. Le téléphone est ici un faux : l'essai sur un vrai appareil reste à faire.
// Lancement : node test/rappels.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGLES, SORTES, CLE_RAPPELS, reglagesNeufs, lireReglages, ecrireReglages, horsDuSilence, rappelsAProgrammer, fautIlDemander,
  hoteDesRappels, quitterLeJeu, revenirAuJeu,
} from '../js/rappels.js';
import { profilNeuf, prochainPalierDeSaison } from '../js/progression.js';
import { PROGRESSION as R } from '../js/progression-config.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const le = (jour, heure, minute = 0) => new Date(2026, 9, jour, heure, minute, 0, 0).getTime();   // octobre 2026, heure locale
const heureDe = (instant) => new Date(instant).getHours();
const jourDe = (instant) => new Date(instant).getDate();
const oui = () => ({ demande: true, actifs: { partie: true, saison: true, retour: true } });
const dansLeSilence = (instant) => heureDe(instant) >= REGLES.silence.de || heureDe(instant) < REGLES.silence.a;

// --- Les règles -----------------------------------------------------------------------------
console.log('--- Les règles ---');
check('trois sortes de rappels, et des règles en nombres entiers', egal(SORTES, ['partie', 'saison', 'retour'])
  && [REGLES.silence.de, REGLES.silence.a, REGLES.heure, REGLES.partieApres, REGLES.finDeSaison, REGLES.pointsProches, REGLES.enAvance, ...REGLES.absences].every(Number.isInteger));
check('le silence va de 21 h à 9 h, et l’heure des rappels datés n’y tombe pas', REGLES.silence.de === 21 && REGLES.silence.a === 9 && REGLES.heure >= 9 && REGLES.heure < 21);
check('jamais plus de trois rappels d’avance : trois restés sans réponse, et plus rien', REGLES.enAvance === 3 && REGLES.absences.length === 2);
check('hors du silence, un instant ne bouge pas', horsDuSilence(le(12, 14, 30)) === le(12, 14, 30) && horsDuSilence(le(12, 9)) === le(12, 9) && horsDuSilence(le(12, 20, 59)) === le(12, 20, 59));
check('le soir, il attend 9 h le lendemain ; la nuit, 9 h le matin même', horsDuSilence(le(12, 21)) === le(13, 9) && horsDuSilence(le(12, 23, 40)) === le(13, 9) && horsDuSilence(le(12, 3, 15)) === le(12, 9));

// --- Ce qui se programme ----------------------------------------------------------------------
console.log('--- Ce qui se programme ---');
{
  const saison = { joursRestants: 19, manque: 120, palier: 8 };
  const tout = rappelsAProgrammer({ maintenant: le(12, 15), reglages: oui(), partie: { minutes: 6 }, saison });
  check('une partie laissée en cours : un rappel trois heures après, qui dit les minutes sauvegardées',
    tout[0].genre === 'partie' && tout[0].quand === le(12, 18) && /6 minutes de jeu sauvegardées/.test(tout[0].texte) && tout[0].titre === 'Ta partie t’attend');
  check('jamais plus de trois rappels d’avance, dans l’ordre du temps, avec chacun son numéro',
    tout.length === 3 && tout.every((r, i) => i === 0 || r.quand > tout[i - 1].quand) && new Set(tout.map((r) => r.id)).size === 3 && tout.every((r) => Number.isInteger(r.id)));
  check('un par jour au plus', new Set(tout.map((r) => new Date(r.quand).toDateString())).size === tout.length);
  check('aucun ne tombe la nuit', tout.every((r) => !dansLeSilence(r.quand)));
  const soir = rappelsAProgrammer({ maintenant: le(12, 19, 30), reglages: oui(), partie: { minutes: 6 }, saison: null });
  check('une partie quittée à 19 h 30 : son rappel attend 9 h le lendemain', soir[0].genre === 'partie' && soir[0].quand === le(13, 9));
  const sans = rappelsAProgrammer({ maintenant: le(12, 15), reglages: oui(), partie: null, saison: null });
  check('sans partie en cours : deux rappels de retour, après 2 puis 7 jours, à 18 h',
    egal(sans.map((r) => r.genre), ['retour', 'retour']) && jourDe(sans[0].quand) === 14 && jourDe(sans[1].quand) === 19 && sans.every((r) => heureDe(r.quand) === REGLES.heure));
  check('… puis plus rien : aucun rappel au-delà de la plus longue absence', Math.max(...sans.map((r) => r.quand)) <= le(12, 15) + (Math.max(...REGLES.absences) + 1) * 86400000);
  const fin = rappelsAProgrammer({ maintenant: le(12, 15), reglages: { demande: true, actifs: { partie: false, saison: true, retour: false } }, partie: null, saison });
  check('la fin de saison : trois jours avant, et le rappel dit les points qui manquent et le palier',
    fin.length === 1 && fin[0].genre === 'saison' && jourDe(fin[0].quand) === 12 + saison.joursRestants - REGLES.finDeSaison
    && fin[0].titre === 'La saison se termine dans 3 jours' && fin[0].texte === 'Il te manque 120 points pour le palier 8.');
  check('… seulement si le palier suivant est à portée', rappelsAProgrammer({ maintenant: le(12, 15), reglages: { demande: true, actifs: { partie: false, saison: true, retour: false } }, partie: null, saison: { ...saison, manque: REGLES.pointsProches + 1 } }).length === 0);
  const veille = rappelsAProgrammer({ maintenant: le(29, 15), reglages: { demande: true, actifs: { partie: false, saison: true, retour: false } }, partie: null, saison: { joursRestants: 2, manque: 40, palier: 30 } });
  check('à deux jours de la fin : « demain », le lendemain', veille.length === 1 && veille[0].titre === 'La saison se termine demain' && jourDe(veille[0].quand) === 30);
  check('le dernier jour, ou la route finie : plus de rappel de saison',
    rappelsAProgrammer({ maintenant: le(31, 15), reglages: { demande: true, actifs: { partie: false, saison: true, retour: false } }, partie: null, saison: { joursRestants: 1, manque: 40, palier: 30 } }).length === 0
    && prochainPalierDeSaison({ ...profilNeuf(), route: { points: R.saisons.paliers * R.saisons.pointsParPalier, passe: false, pris: { gratuit: [], passe: [] } } }) === null);
  check('chaque sorte a son interrupteur : éteinte, elle ne se programme pas',
    rappelsAProgrammer({ maintenant: le(12, 15), reglages: { demande: true, actifs: { partie: false, saison: false, retour: false } }, partie: { minutes: 6 }, saison }).length === 0
    && rappelsAProgrammer({ maintenant: le(12, 15), reglages: { demande: true, actifs: { partie: true, saison: false, retour: false } }, partie: { minutes: 6 }, saison }).every((r) => r.genre === 'partie'));
  check('LA RÈGLE : aucun rappel ne parle d’offre, de prix, de boutique ni de Couronnes — et aucun ne porte d’émoticône',
    [...tout, ...sans, ...fin, ...veille, ...soir].every((r) => !/offre|prix|boutique|couronne|€|promo|%/i.test(r.titre + r.texte) && !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(r.titre + r.texte)));
  check('des réglages illisibles, un instant illisible : rien, sans erreur', rappelsAProgrammer({ maintenant: le(12, 15), reglages: null }).length === 0 && rappelsAProgrammer({ maintenant: NaN, reglages: oui() }).length === 0);
  const palier = prochainPalierDeSaison({ ...profilNeuf(), route: { points: 2 * R.saisons.pointsParPalier + 50, passe: false, pris: { gratuit: [], passe: [] } } });
  check('ce qui manque pour le palier suivant se lit dans la fiche', palier.palier === 3 && palier.manque === R.saisons.pointsParPalier - 50);
}

// --- La question et les réglages -----------------------------------------------------------------
console.log('--- La question, les réglages ---');
{
  const memoire = new Map();
  const stockage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)) };
  check('au départ : rien n’a été demandé, les trois sortes sont prêtes', egal(lireReglages(stockage), reglagesNeufs()) && reglagesNeufs().demande === false);
  ecrireReglages({ demande: true, actifs: { partie: true, saison: false, retour: true } }, stockage);
  check('les réglages se gardent sur l’appareil', egal(lireReglages(stockage), { demande: true, actifs: { partie: true, saison: false, retour: true } }) && memoire.has(CLE_RAPPELS));
  memoire.set(CLE_RAPPELS, '{"demande":"oui","actifs":{"partie":"non","autre":true}}');
  check('des réglages abîmés reprennent leur valeur de départ', egal(lireReglages(stockage), reglagesNeufs()) && (memoire.set(CLE_RAPPELS, '{{{'), egal(lireReglages(stockage), reglagesNeufs())) && egal(lireReglages(null), reglagesNeufs()));
  check('la question ne se pose qu’après une première victoire classée', !fautIlDemander(reglagesNeufs(), profilNeuf()) && fautIlDemander(reglagesNeufs(), { ...profilNeuf(), victoires: 1 }));
  check('… et une seule fois', !fautIlDemander({ ...reglagesNeufs(), demande: true }, { ...profilNeuf(), victoires: 9 }));
}

// --- Le téléphone (un faux) ----------------------------------------------------------------------
console.log('--- Le téléphone ---');
{
  check('dans un navigateur, il n’y a pas d’hôte : rien ne se demande, rien ne se programme', hoteDesRappels(null) === null && hoteDesRappels({}) === null && hoteDesRappels({ Plugins: {} }) === null
    && hoteDesRappels({ Plugins: { LocalNotifications: {} } }) === null);
  /** Un faux téléphone : il retient ce qu'on lui programme, et sa permission se règle. */
  function telephone(permission = 'prompt', reponse = 'granted') {
    const t = { programmes: [], demandes: 0, permission };
    t.extension = {
      checkPermissions: async () => ({ display: t.permission }),
      requestPermissions: async () => { t.demandes++; t.permission = reponse; return { display: t.permission }; },
      getPending: async () => ({ notifications: t.programmes.map((n) => ({ id: n.id })) }),
      cancel: async ({ notifications }) => { const ids = notifications.map((n) => n.id); t.programmes = t.programmes.filter((n) => !ids.includes(n.id)); },
      schedule: async ({ notifications }) => { t.programmes.push(...notifications); return { notifications }; },
    };
    t.hote = hoteDesRappels({ Plugins: { LocalNotifications: t.extension } });
    return t;
  }
  const etat = (reglages) => ({ maintenant: le(12, 15), reglages, partie: { minutes: 4 }, saison: { joursRestants: 19, manque: 120, palier: 8 } });
  const t = telephone('granted');
  check('la permission se lit telle que le téléphone la dit', await t.hote.permission() === 'accordee' && await telephone('denied').hote.permission() === 'refusee' && await telephone('prompt').hote.permission() === 'a-demander');
  const poses = await quitterLeJeu(t.hote, etat(oui()));
  check('quitter le jeu programme les rappels : un titre, un texte, une date chacun',
    poses.length === 3 && t.programmes.length === 3 && t.programmes.every((n) => typeof n.title === 'string' && typeof n.body === 'string' && n.schedule.at instanceof Date));
  await quitterLeJeu(t.hote, etat(oui()));
  check('quitter deux fois ne les double pas : les anciens s’effacent d’abord', t.programmes.length === 3);
  await revenirAuJeu(t.hote);
  check('revenir dans le jeu les efface tous', t.programmes.length === 0);
  check('tant que la question n’a pas été posée, rien ne se programme', (await quitterLeJeu(t.hote, etat(reglagesNeufs()))).length === 0 && t.programmes.length === 0);
  const refuse = telephone('denied');
  check('permission refusée : rien ne se programme, et rien n’est redemandé', (await quitterLeJeu(refuse.hote, etat(oui()))).length === 0 && refuse.programmes.length === 0 && refuse.demandes === 0);
  const neuf = telephone('prompt', 'granted');
  check('demander la permission : une fois, et le oui du joueur se lit', await neuf.hote.demander() === true && neuf.demandes === 1 && await neuf.hote.permission() === 'accordee'
    && await telephone('prompt', 'denied').hote.demander() === false);
  const capricieux = hoteDesRappels({ Plugins: { LocalNotifications: { schedule: async () => { throw new Error('non'); }, requestPermissions: async () => { throw new Error('non'); }, checkPermissions: async () => { throw new Error('non'); }, getPending: async () => { throw new Error('non'); }, cancel: async () => {} } } });
  check('un téléphone qui refuse tout ne casse rien', await capricieux.permission() === 'refusee' && await capricieux.demander() === false && (await quitterLeJeu(capricieux, etat(oui()))).length === 0);
  check('sans hôte, quitter et revenir ne font rien, sans erreur', egal(await quitterLeJeu(null, etat(oui())), []) && (await revenirAuJeu(null)) === undefined);
}

// --- Le branchement -----------------------------------------------------------------------------
console.log('--- Le branchement ---');
{
  const main = lire('js/main.js'), index = lire('index.html'), sw = lire('sw.js'), module = lire('js/rappels.js');
  check('le jeu programme ses rappels quand la page passe à l’arrière-plan, et les efface au retour',
    /if \(document\.visibilityState === 'hidden'\) quitterLeJeu\(rappels, etatPourLesRappels\(\)\); else revenirAuJeu\(rappels\);/.test(main));
  check('sans l’application, le bouton des rappels reste caché et la question ne se pose pas',
    /bouton\.classList\.toggle\('hidden', !rappels\);/.test(main) && /if \(guideVu\(\) && rappels && fautIlDemander\(lireRappels\(\), lireProgression\(\)\)\)/.test(main)
    && /<button id="btn-rappels" class="btn ghost hidden"/.test(index));
  check('la réponse du joueur est gardée avant la fenêtre du système : la question ne revient pas',
    main.indexOf("ecrireRappels({ demande: true, actifs: { partie: oui, saison: oui, retour: oui } });") > 0
    && main.indexOf("ecrireRappels({ demande: true, actifs: { partie: oui, saison: oui, retour: oui } });") < main.indexOf('if (oui && !(await rappels.demander()))'));
  check('la question dit la règle avant de demander : un par jour, jamais la nuit, jamais pour vendre', /Un rappel par jour au plus, jamais la nuit, jamais pour vendre\./.test(main));
  check('le module ne parle à aucun serveur : ni requête, ni adresse', !/fetch\(|XMLHttpRequest|https?:\/\//.test(module));
  check('le jeu hors ligne garde le module', sw.includes("'./js/rappels.js'"));
  check('le script des essais lance aussi celui-ci', lire('package.json').includes('node test/rappels.test.js'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
