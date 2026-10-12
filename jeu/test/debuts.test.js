// Les débuts : la première heure doit être courte (état des lieux du 12/10/2026).
//   - tant que le joueur n'a pas choisi son format, l'accueil lui en conseille un court pour ses
//     premières parties classées, puis celui de tous les jours ;
//   - la fin de la partie guidée donne un coffre de recrue, une seule fois ;
//   - la fin d'une partie classée dit ce qui sépare de la ligue suivante, et propose de rejouer.
// Lancement : node test/debuts.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRESSION as R } from '../js/progression-config.js';
import { GAME_MODES } from '../js/config.js';
import {
  profilNeuf, migrerProfil, appliquerResultat, formatConseille, debutant, prochainPalier, prendreCoffreDeRecrue, ouvrirCoffre, aleaDeGraine,
} from '../js/progression.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${!condition && detail ? ' — ' + detail : ''}`);
}
const JOUR = '2026-10-12';
/** Le profil après `n` victoires classées de suite. */
function apres(n, issue = 'victoire', depart = profilNeuf()) {
  let p = depart;
  for (let i = 0; i < n; i++) p = appliquerResultat(p, { issue, duree: 290, contreOrdinateur: 'echelle', jour: JOUR, instant: 1_800_000_000 + i * 600, id: `debut-${issue}-${i}`, format: 'escarmouche' }).profil;
  return p;
}

// --- Les réglages -----------------------------------------------------------------------
console.log('--- Les réglages ---');
const D = R.debut;
check('les débuts ont leurs réglages : un nombre de parties, deux formats qui existent, un coffre et des Éclats entiers',
  Number.isInteger(D.parties) && D.parties > 0 && !!GAME_MODES[D.format] && !!GAME_MODES[D.ensuite] && D.format !== D.ensuite
  && !!R.coffres[D.recrue.coffre] && Number.isInteger(D.recrue.eclats) && D.recrue.eclats > 0);
check('le format des débuts est court : un chronomètre de cinq minutes au plus, et jamais par équipes (il est classé)',
  GAME_MODES[D.format].timeLimit > 0 && GAME_MODES[D.format].timeLimit <= 300 && !GAME_MODES[D.format].equipes);
check('le format qui suit a son chronomètre aussi, plus long, et se joue classé',
  GAME_MODES[D.ensuite].timeLimit > GAME_MODES[D.format].timeLimit && !GAME_MODES[D.ensuite].equipes);
check(`gagner ses ${D.parties} premières parties mène à la ligue suivante : la promesse de l’accueil est tenue`,
  apres(D.parties).ligue === 2 && D.parties * R.elo.victoire >= R.ligues[1].seuil);

// --- Le format conseillé ------------------------------------------------------------------
console.log('--- Le format conseillé ---');
check('un joueur neuf débute : on lui conseille le format court', debutant(profilNeuf()) && formatConseille(profilNeuf()) === D.format);
check(`… jusqu’à sa partie n° ${D.parties} comprise`, formatConseille(apres(D.parties - 1)) === D.format && debutant(apres(D.parties - 1)));
check(`… ensuite, le format de tous les jours — gagnées ou perdues, ce sont les parties jouées qui comptent`,
  formatConseille(apres(D.parties)) === D.ensuite && formatConseille(apres(D.parties, 'defaite')) === D.ensuite && !debutant(apres(D.parties, 'defaite')));
check('une fiche abîmée ou vide se lit comme celle d’un débutant, sans erreur', formatConseille(null) === D.format && formatConseille({ parties: 'beaucoup' }) === D.format);

// --- Ce qui sépare de la ligue suivante ------------------------------------------------------
console.log('--- La ligue suivante ---');
{
  const neuf = prochainPalier(profilNeuf());
  check('au départ : la ligue 2, tout son seuil à faire, en victoires entières',
    neuf.ligue.numero === 2 && neuf.manque === R.ligues[1].seuil && neuf.victoires === Math.ceil(R.ligues[1].seuil / R.elo.victoire) && Number.isInteger(neuf.victoires));
  const un = prochainPalier(apres(1));
  check('après une victoire, il en faut une de moins', un.victoires === neuf.victoires - 1 && un.manque === neuf.manque - R.elo.victoire);
  const juste = prochainPalier({ ...profilNeuf(), elo: R.ligues[1].seuil - 1 });
  check('à un point du seuil : encore une victoire, jamais zéro', juste.victoires === 1 && juste.manque === 1);
  const promu = prochainPalier(apres(D.parties));
  check('une fois promu, c’est la ligue d’après qui est visée', promu.ligue.numero === 3 && promu.manque === R.ligues[2].seuil - apres(D.parties).elo);
  check('dans la plus haute ligue, plus rien à viser', prochainPalier({ ...profilNeuf(), elo: 99999, ligue: R.ligues.length, plusHauteLigue: R.ligues.length }) === null);
}

// --- Le coffre de recrue --------------------------------------------------------------------
console.log('--- Le coffre de recrue ---');
{
  const neuf = profilNeuf();
  const copie = JSON.stringify(neuf);
  const r = prendreCoffreDeRecrue(neuf);
  check('il donne son coffre et ses Éclats, et le dit par deux événements',
    !r.erreur && r.profil.coffres.length === 1 && r.profil.coffres[0].type === D.recrue.coffre && r.profil.coffres[0].origine === 'recrue'
    && r.profil.eclats === D.recrue.eclats && r.evenements.length === 2 && r.evenements[0].type === 'coffre' && r.evenements[1].type === 'eclats' && r.evenements[1].variation === D.recrue.eclats);
  check('la fiche qu’on lui a donnée n’est pas touchée', JSON.stringify(neuf) === copie && neuf.recrue === false);
  check('il se note au journal', r.profil.journal.length === 1 && r.profil.journal[0].op === 'recrue' && r.profil.operations === 1);
  check('une seule fois : le guide se rejoue, le cadeau non', prendreCoffreDeRecrue(r.profil).erreur === 'dejaPris');
  check('… même après un aller-retour par la sauvegarde', prendreCoffreDeRecrue(migrerProfil(JSON.parse(JSON.stringify(r.profil)))).erreur === 'dejaPris'
    && migrerProfil(JSON.parse(JSON.stringify(r.profil))).coffres[0].origine === 'recrue');
  check('une fiche d’avant cette version n’a pas eu le sien : elle y a droit', migrerProfil({ elo: 300, ligue: 3, parties: 40, victoires: 25, defaites: 15 }).recrue === false
    && !prendreCoffreDeRecrue({ elo: 300, ligue: 3, parties: 40, victoires: 25, defaites: 15 }).erreur);
  check('il ne compte pas comme une partie : le joueur débute encore', debutant(r.profil) && r.profil.parties === 0 && r.profil.elo === R.elo.depart);
  const ouvert = ouvrirCoffre(r.profil, 0, aleaDeGraine(7));
  check('il s’ouvre comme un autre : son contenu entre dans la fiche', !ouvert.erreur && ouvert.profil.coffres.length === 0 && ouvert.evenements.length > 0);
  check('rien ne se vend ici : aucune Couronne donnée ni prise', r.profil.couronnes === 0 && ouvert.profil.couronnes === 0);
}

// --- Les écrans -------------------------------------------------------------------------------
console.log('--- Les écrans ---');
{
  const memoire = new Map();
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } }, configurable: true, writable: true });
  const { htmlFinDePartie, versLaLigueSuivante, phraseDuCoffreDeRecrue } = await import('../js/progression-ecrans.js');
  const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  const nomDeLaDeuxieme = R.ligues[1].nom;

  check('la distance se dit en victoires, au pluriel puis au singulier',
    versLaLigueSuivante(profilNeuf()) === `Encore ${prochainPalier(profilNeuf()).victoires} victoires pour la ligue de ${nomDeLaDeuxieme}`
    && versLaLigueSuivante({ ...profilNeuf(), elo: R.ligues[1].seuil - R.elo.victoire }) === `Encore une victoire pour la ligue de ${nomDeLaDeuxieme}`,
    versLaLigueSuivante(profilNeuf()));
  check('… et ne dit rien dans la plus haute ligue', versLaLigueSuivante({ ...profilNeuf(), elo: 99999, ligue: R.ligues.length, plusHauteLigue: R.ligues.length }) === '');

  const partie = appliquerResultat(profilNeuf(), { issue: 'victoire', duree: 280, contreOrdinateur: 'echelle', jour: JOUR, instant: 1_800_000_000, id: 'fin-1', format: 'escarmouche' });
  const fin = htmlFinDePartie(partie.evenements, partie.profil);
  check('la fin d’une partie classée dit ce qui sépare de la ligue suivante…',
    /class="prog-fin-suite"/.test(fin) && texte(fin).includes(`Encore ${prochainPalier(partie.profil).victoires} victoires pour la ligue de ${nomDeLaDeuxieme}`), texte(fin).slice(0, 240));
  check('… et ce qu’elle donne : son coffre, sa troupe, ses Couronnes',
    texte(fin).includes(R.coffres[R.ligues[1].promotion.coffre].nom) && texte(fin).includes(`${R.boutique.parLigue} Couronnes`));
  const defaite = appliquerResultat(profilNeuf(), { issue: 'defaite', duree: 280, contreOrdinateur: 'echelle', jour: JOUR, instant: 1_800_000_000, id: 'fin-2', format: 'escarmouche' });
  check('une défaite le dit aussi : c’est la raison de rejouer', /class="prog-fin-suite"/.test(htmlFinDePartie(defaite.evenements, defaite.profil)));
  const annulee = appliquerResultat(profilNeuf(), { issue: 'annulee', duree: 10, contreOrdinateur: 'echelle', jour: JOUR, instant: 1_800_000_000, id: 'fin-3', format: 'escarmouche' });
  check('une partie annulée ne promet rien', !/prog-fin-suite/.test(htmlFinDePartie(annulee.evenements, annulee.profil)));
  check('rien d’étrange à l’écran : ni « undefined », ni « NaN »', !/undefined|NaN|\[object/.test(fin));

  const cadeau = phraseDuCoffreDeRecrue(prendreCoffreDeRecrue(profilNeuf()).evenements);
  check('le coffre de recrue s’annonce en une phrase : ses Éclats et son coffre',
    cadeau.startsWith('Cadeau de recrue : ') && cadeau.includes(`${D.recrue.eclats} Éclats`) && cadeau.includes(R.coffres[D.recrue.coffre].nom.toLowerCase()) && cadeau.endsWith('.'), cadeau);
}

// --- Le branchement (lu dans le code : ces fichiers ont besoin d'un navigateur) ----------------------
console.log('--- Le branchement ---');
{
  const main = lire('js/main.js'), guide = lire('js/guide-ecran.js'), ui = lire('js/ui.js'), css = lire('css/boite.css') + lire('css/guide.css') + lire('css/progression.css');
  check('l’accueil part du format conseillé tant que le joueur n’a pas choisi le sien',
    /const formatDeDepart = formatChoisi \? stored\.mode : formatConseille\(lireProgression\(\)\);/.test(main) && /mode: formatDeDepart,\n  formatChoisi,/.test(main));
  check('… un réglage enregistré avant cette question vaut choix, sauf pour qui débute',
    /typeof stored\.formatChoisi === 'boolean' \? stored\.formatChoisi : !debutant\(lireProgression\(\)\)/.test(main));
  check('choisir un format à l’accueil le fixe : l’accueil ne propose plus le sien', /settings\.mode = btn\.dataset\.mode;\n\s+settings\.formatChoisi = true;/.test(main));
  check('à chaque retour à l’accueil, le format suit le conseil (il change après les premières parties)',
    /function showStartScreen\(\) \{\n  currentGame = null;\n  musique\.mettre\('menu'\);\n  suivreLeFormatConseille\(\);/.test(main)
    && /if \(!settings\.formatChoisi && settings\.mode !== conseille\) \{\n    settings\.mode = conseille;\n    settings\.mapSize = GAME_MODES\[conseille\]\.mapSize;/.test(main));
  check('le format conseillé porte sa mention, et elle seule se voit', /b\.classList\.toggle\('conseille', b\.dataset\.mode === conseille\)/.test(main)
    && /class="option-conseil">\$\{txt\('Conseillé'\)\}/.test(main) && /\.option \.option-conseil \{ display: none; \}/.test(css) && /\.option\.conseille \.option-conseil \{ display: inline-block;/.test(css));
  check('le bouton « Jouer » dit la promesse quand la ligue suivante est à portée, en partie classée seulement',
    /const profil = !arme && !partieEnAttente && partieClassee\(\) \? lireProgression\(\) : null;/.test(main) && /palier\.victoires <= VICTOIRES_A_PORTEE/.test(main)
    && /promesse\.textContent = versLaLigueSuivante\(profil\);/.test(main) && /#btn-play small \{/.test(css));
  check('la fin de la partie guidée donne le coffre de recrue et range la fiche',
    /etape\.fin \? this\.cadeauDeRecrue\(\) : null/.test(main) && /const r = prendreCoffreDeRecrue\(lireProgression\(\)\);\n    if \(r\.erreur\) return null;\n    ecrireProgression\(r\.profil\);/.test(main));
  check('… la bulle l’annonce, et « Ouvrir mon coffre » appelle l’écran des coffres',
    /noeuds\.cadeau\.textContent = cadeau \|\| '';/.test(guide) && /if \(cadeau\) boutons\.push\(\{ mot: txt\('Ouvrir mon coffre'\), ecran: 'coffres'/.test(guide) && /data-ecran="\$\{b\.ecran\}"/.test(guide) && /\.guide-cadeau \{/.test(css));
  check('… et la première partie dit sa durée sur son bouton', /txt`Jouer ma première partie · \$\{minutes\} min`/.test(guide) && /duree: \(\) => Math\.round\(\(GAME_MODES\[settings\.mode\]\.timeLimit \|\| 0\) \/ 60\)/.test(main));
  check('la fin de partie propose de rejouer, avec la durée du format quand il a un chronomètre',
    /data-act="again">\$\{this\.world\.mode\.timeLimit \? txt`Rejouer · \$\{Math\.round\(this\.world\.mode\.timeLimit \/ 60\)\} min` : txt\('Rejouer'\)\}/.test(ui));
  check('le script des essais lance aussi celui-ci', lire('package.json').includes('node test/debuts.test.js'));
}

console.log(failures ? `\n${failures} essai(s) en échec` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
