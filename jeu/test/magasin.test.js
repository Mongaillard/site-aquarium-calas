// Ce que les magasins d'applications demandent, et que le jeu doit tenir :
// l'écran « Confidentialité » et l'effacement des données, l'édition
// « magasin » (sans bouton d'essai, sans article « bientôt », sans réglage de
// mise au point, sans prix en euros tant que rien ne s'achète), le nom et
// l'éditeur à renseigner, et la préparation du dossier de l'application.
// Lancement : node test/magasin.test.js

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EDITION, EN_MAGASIN, NOM_DU_JEU, EDITEUR, nomComplet, manquesAvantMagasin } from '../js/edition.js';
import { PROGRESSION as R } from '../js/progression-config.js';
import { profilNeuf, migrerProfil, appliquerResultat } from '../js/progression.js';
import { plusAvance } from '../js/rangement-durable.js';
import { PROGRESSION_KEY, SAVE_KEY, PALMARES_KEY, effacerLesDonnees, lireProgression, phraseIncident } from '../js/save.js';
import { ouvrirProgression, installerProgression } from '../js/progression-ecrans.js';
import { preparer, pageDeConfidentialite } from '../outils/magasin.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const texte = (html) => html.replace(/<[^>]*>/g, ' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');

// --- L'édition, le nom, l'éditeur ---------------------------------------------------------
console.log('--- L’édition, le nom, l’éditeur ---');
{
  check('sans enveloppe native ni marque, le jeu est en édition « web »', EDITION === 'web' && EN_MAGASIN === false && R.boutique.essai && R.boutique.essai.couronnes === 500);
  check('le nom du jeu est le même partout : js/edition.js, le titre de la page, le manifeste',
    lire('index.html').includes(`<title>${nomComplet()}</title>`) && JSON.parse(lire('manifest.webmanifest')).name === nomComplet()
    && lire('index.html').includes(`<h1>${NOM_DU_JEU.titre} <em>${NOM_DU_JEU.suite}</em></h1>`));
  check('un nom qui reprend « Age of Empires » est signalé, avec ou sans accent',
    ['Âge des Empires', 'Age des Empires', 'Age of Empires', 'L’Âge des empires'].every((titre) => manquesAvantMagasin({ titre, suite: 'Mobile' }, { nom: 'Moi', courriel: 'moi@exemple.fr', mentions: '' }).length === 1)
    && manquesAvantMagasin({ titre: 'Sable et Marée', suite: '' }, { nom: 'Moi', courriel: 'moi@exemple.fr', mentions: '' }).length === 0
    && manquesAvantMagasin({ titre: 'Petits Empires', suite: '' }, { nom: 'Moi', courriel: 'moi@exemple.fr', mentions: '' }).length === 0);
  check('un éditeur sans nom ou sans adresse lisible est signalé',
    manquesAvantMagasin({ titre: 'Sable et Marée', suite: '' }, { nom: ' ', courriel: '', mentions: '' }).length === 2
    && manquesAvantMagasin({ titre: 'Sable et Marée', suite: '' }, { nom: 'Moi', courriel: 'pas une adresse', mentions: '' }).length === 1);
  // (Ce contrôle dit l'état du dépôt : il changera de sens le jour où le nom et l'éditeur seront renseignés.)
  const manques = manquesAvantMagasin();
  check(`état du jeu aujourd’hui : ${manques.length ? `${manques.length} point(s) à régler avant de soumettre` : 'prêt à être soumis'}`, Array.isArray(manques), manques.join(' '));
  check('… et tant qu’il en reste, la préparation de l’application refuse de continuer',
    manques.length === 0 || (() => { try { preparer({ sortie: path.join(os.tmpdir(), 'aem-magasin-refus'), force: false }); return false; } catch (e) { return egal(e.manques, manques) && !fs.existsSync(path.join(os.tmpdir(), 'aem-magasin-refus', 'index.html')); } })());
}

// --- L'écran « Confidentialité » -------------------------------------------------------------
console.log('\n--- L’écran « Confidentialité » ---');
{
  const memoire = new Map();
  const store = {
    getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); },
    get length() { return memoire.size; }, key: (i) => [...memoire.keys()][i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
  let clic = null;
  Object.defineProperty(globalThis, 'document', { value: { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener: (t, f) => { if (t === 'click') clic = f; } }, configurable: true, writable: true });
  const toucher = (dataset) => clic({ target: { closest: () => ({ dataset }) } });
  let change = 0;
  installerProgression({ quandLeProfilChange: () => { change++; } });

  ouvrirProgression('confidentialite');
  const t = texte(noeud.innerHTML);
  check('il dit ce que le jeu garde (sur l’appareil) et ce qu’il ne fait pas : ni compte, ni publicité, ni traceur',
    /<h2>Confidentialité<\/h2>/.test(noeud.innerHTML) && /gardés sur cet appareil/.test(t) && /Aucun compte à créer/.test(t) && /Aucune publicité, aucun traceur, aucune mesure d’audience/.test(t));
  check('… il nomme les licences : pictogrammes et leurs auteurs, caractères, three.js, sons', /CC BY 3\.0/.test(t) && /Lorc/.test(t) && /SIL OFL/.test(t) && /three\.js, licence MIT/.test(t) && /CC0/.test(t));
  check('… sans emoji, et sans éditeur fantôme tant qu’il n’est pas renseigné', !/\p{Extended_Pictographic}/u.test(noeud.innerHTML) && (EDITEUR.nom ? /<h3>Éditeur<\/h3>/.test(noeud.innerHTML) : !/<h3>Éditeur<\/h3>/.test(noeud.innerHTML)));
  check('il s’ouvre depuis l’accueil et depuis le menu de pause',
    /id="btn-confidentialite"[^>]*data-ecran="confidentialite"/.test(lire('index.html')) && /data-ecran="confidentialite">Confidentialité<\/button>/.test(lire('js/ui.js')));

  // Effacer : deux touchers, tout part.
  const joue = appliquerResultat({ ...profilNeuf(), couronnes: 300, eclats: 80 }, { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-09', instant: 1e9, id: 'x' }).profil;
  memoire.set(PROGRESSION_KEY, JSON.stringify(joue));
  memoire.set(SAVE_KEY, '{"partie":1}'); memoire.set(PALMARES_KEY, '{"v":1}'); memoire.set('aem.reglages', '{}'); memoire.set('aem.nouveau', '1'); memoire.set('autre.application', 'à garder');
  toucher({ act: 'effacerDonnees' });
  check('« Effacer toutes mes données » : le premier toucher demande confirmation, rien ne bouge',
    /data-act="effacerDonnees" data-i="1">Toucher encore/.test(noeud.innerHTML) && lireProgression().elo === joue.elo && memoire.has(SAVE_KEY));
  toucher({ act: 'effacerDonnees', i: '1' });
  const apres = lireProgression();
  check('… le second efface tout : classement, coffres, monnaies, partie en cours, palmarès, réglages',
    apres.elo === 0 && apres.parties === 0 && apres.coffres.length === 0 && apres.couronnes === 0 && apres.eclats === 0 && egal(apres.pieces, profilNeuf().pieces)
    && !memoire.has(SAVE_KEY) && !memoire.has(PALMARES_KEY) && !memoire.has('aem.reglages') && !memoire.has('aem.nouveau') && /Tes données sont effacées/.test(texte(noeud.innerHTML)) && change > 0);
  check('… sans toucher à ce qui n’est pas au jeu', memoire.get('autre.application') === 'à garder');
  check('… et le second rangement, là où il existe, oubliera l’ancien profil : le profil effacé est le plus avancé des deux',
    apres.operations === joue.operations + 1 && plusAvance(joue, apres).elo === 0 && plusAvance(apres, joue).elo === 0);
  check('effacer un profil neuf ne casse rien, et un appareil sans stockage le dit', effacerLesDonnees() === true && (() => {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
    const r = effacerLesDonnees();
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
    return r === false;
  })());

  // La boutique en édition web : les prix en euros à côté des Couronnes.
  memoire.set(PROGRESSION_KEY, JSON.stringify(profilNeuf()));
  ouvrirProgression('boutique');
  const b = texte(noeud.innerHTML);
  check('édition web : chaque prix en Couronnes a son équivalent en euros — troupes, lot de troupes, Passe, collection',
    /Sinon offerte en ligue de Pierre · environ 1 €/.test(b) && /au lieu de 1 700 · environ 12 €/.test(b) && /500 Couronnes, environ 5 €/.test(b) && /environ 3 €/.test(b), b.match(/au lieu de [^.]{0,40}/)?.[0]);
  check('édition web : le porte-monnaie d’essai et les lots « à venir » se montrent', /Porte-monnaie d’essai/.test(b) && /arrivera avec l’application/.test(b));
}

// --- L'édition « magasin », dans un processus à part ------------------------------------------------
console.log('\n--- L’édition « magasin » ---');
{
  // (L'édition se lit au chargement des modules : il faut un Node neuf, marqué avant tout import.)
  const script = `
    globalThis.__EDITION = 'magasin';
    const memoire = new Map();
    globalThis.localStorage = { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } };
    const noeud = { innerHTML: '', classList: { add() {}, remove() {} }, querySelector: () => null };
    globalThis.document = { getElementById: (id) => (id === 'progression' ? noeud : null), addEventListener() {} };
    const E = await import('./js/edition.js');
    const { PROGRESSION: R } = await import('./js/progression-config.js');
    const P = await import('./js/progression.js');
    const S = await import('./js/save.js');
    const X = await import('./js/progression-ecrans.js');
    X.installerProgression({});
    const maintenant = Date.now() / 1000;
    memoire.set(S.PROGRESSION_KEY, JSON.stringify({ ...P.profilNeuf(), couronnes: 120, boutique: { offreLigue: { troupe: 'triton', jusqua: maintenant + 3600 }, bienvenueJusqua: maintenant + 7200, bienvenuePrise: false } }));
    X.ouvrirProgression('boutique'); const boutique = noeud.innerHTML;
    X.ouvrirProgression('saison'); const saison = noeud.innerHTML;
    X.ouvrirProgression('collection', 'cour'); const cour = noeud.innerHTML;
    X.ouvrirProgression('confidentialite'); const conf = noeud.innerHTML;
    console.log(JSON.stringify({ edition: E.EDITION, essai: R.boutique.essai, refus: P.prendreCouronnesDEssai(P.profilNeuf()).erreur, boutique, saison, cour, conf,
      incident: S.phraseIncident({ genre: 'rechargee', min: 3, mo: 120, unites: 40 }, E.EN_MAGASIN) }));`;
  const m = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 24 }));
  const b = texte(m.boutique);
  check('marquée « magasin », l’application n’a plus de porte-monnaie d’essai — ni bouton, ni règle', m.edition === 'magasin' && m.essai === null && m.refus === 'ferme' && !/essai/i.test(b));
  check('… plus aucun article annoncé « bientôt » : ni lot de Couronnes, ni offre en argent réel', !/Bientôt|arrivera|€/.test(b) && !/Offre de bienvenue/.test(b) && !/disabled/.test(m.boutique));
  check('… l’offre de ligue, qui se paie en Couronnes, reste', /Offre de ligue : \S.* à moitié prix/.test(b) && /data-act="acheter" data-arg="triton"/.test(m.boutique));
  check('… les Couronnes y sont dites pour ce qu’elles sont : gagnées en jouant', /Les Couronnes se gagnent aux ligues et sur la route de la saison/.test(b) && /Elles se gagnent en jouant : 50 à chaque nouvelle ligue/.test(b));
  check('… aucun prix en euros nulle part tant que rien ne s’achète en argent réel : boutique, Passe, collection',
    !/€/.test(b) && !/€/.test(texte(m.saison)) && !/€/.test(texte(m.cour)) && /500 Couronnes\. Acheté en cours de saison/.test(texte(m.saison)) && /pour 300 Couronnes\./.test(texte(m.cour)));
  check('… la confidentialité y dit qu’aucune donnée ne quitte l’appareil, sans parler de page web ni de compte',
    /Aucune donnée ne quitte ton appareil/.test(texte(m.conf)) && !/page web|ton compte/.test(texte(m.conf)));
  check('… après un incident, l’accueil parle au joueur, pas au développeur', m.incident === 'Le jeu s’est relancé en pleine partie : elle t’attend.' && /Mo d’images/.test(phraseIncident({ genre: 'rechargee', min: 3, mo: 120, unites: 40 })));
  const pause = lire('js/ui.js');
  check('… le menu de pause n’y montre ni le « Style des personnages » ni les mesures de mise au point',
    /\$\{EN_MAGASIN \? '' : `<h3 class="modal-sub">Style des personnages<\/h3>/.test(pause) && /\$\{EN_MAGASIN \? '' : `<p class="hint" data-role="mesures">/.test(pause));
}

// --- Le dossier de l'application -----------------------------------------------------------------------
console.log('\n--- Le dossier de l’application ---');
{
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-magasin-'));
  const r = preparer({ sortie, force: true });
  const page = fs.readFileSync(path.join(sortie, 'index.html'), 'utf8');
  check('la page est marquée « magasin » avant le chargement du jeu, et n’a plus de manifeste web (donc pas de service worker)',
    page.indexOf('window.__EDITION = \'magasin\'') > 0 && page.indexOf('window.__EDITION') < page.indexOf('js/main.js') && !/rel="manifest"/.test(page) && !fs.existsSync(path.join(sortie, 'sw.js')));
  check('rien de ce qui ne sert qu’au développement n’y est : ni essais, ni notes, ni outils',
    !fs.existsSync(path.join(sortie, 'test')) && !fs.existsSync(path.join(sortie, 'README.md')) && !fs.existsSync(path.join(sortie, 'outils')) && !fs.existsSync(path.join(sortie, 'assets', 'SOURCES.md')));
  const feuilles = fs.readdirSync(path.join(sortie, 'css')).map((f) => fs.readFileSync(path.join(sortie, 'css', f), 'utf8')).join('\n');
  check('aucune feuille de style n’appelle une adresse extérieure : les caractères viennent de l’application',
    !/https?:\/\//.test(feuilles.replace(/\/\*[\s\S]*?\*\//g, '')) && /assets\/polices\/lilita-one\.woff2/.test(feuilles) && /fonts\.gstatic\.com/.test(lire('css/boite.css')));
  // Tout ce que la page et le jeu nomment est dans le dossier.
  const cites = [...page.matchAll(/(?:src|href)="((?:css|js|assets|icons)\/[^"]+)"/g)].map((x) => x[1]);
  const modules = fs.readdirSync(path.join(RACINE, 'js')).filter((f) => f.endsWith('.js'));
  check(`les fichiers que la page cite (${cites.length}) et les ${modules.length} modules du jeu y sont, avec les planches, les modèles et les sons`,
    cites.every((f) => fs.existsSync(path.join(sortie, f))) && modules.every((f) => fs.existsSync(path.join(sortie, 'js', f)))
    && ['assets/collections/bassecour.webp', 'assets/teintures/jade-atlante.webp', 'assets/modeles/milicien.json', 'assets/polices/nunito.woff2', 'assets/musique/menu.mp4', 'icons/icone-512.png'].every((f) => fs.existsSync(path.join(sortie, f))));
  check('le compte est rendu : des fichiers, un poids', r.fichiers > 200 && r.octets > 50 * 1048576 && r.octets < 200 * 1048576, `${r.fichiers} fichiers, ${Math.round(r.octets / 1048576)} Mo`);
  const politique = fs.readFileSync(path.join(sortie, 'confidentialite.html'), 'utf8');
  check('la politique de confidentialité est écrite, en français et en anglais, au nom du jeu',
    politique.includes(`<title>${nomComplet()} — Politique de confidentialité</title>`) && /ne collecte aucune donnée personnelle/.test(politique) && /does not collect any personal data/.test(politique)
    && /Effacer toutes mes données/.test(politique));
  const exemple = pageDeConfidentialite('Sable et Marée', { nom: 'Jeux <Dupont>', courriel: 'contact@exemple.fr', mentions: 'SAS au capital de 1 000 €' }, '2026-10-09');
  check('… elle nomme l’éditeur et son adresse quand ils sont renseignés, sans laisser passer de balise',
    /Éditeur : Jeux &lt;Dupont&gt;\. Pour toute question : contact@exemple\.fr\./.test(exemple) && /SAS au capital/.test(exemple) && /Dernière mise à jour : 2026-10-09/.test(exemple) && !/à renseigner/.test(exemple));
  check('… et dit clairement ce qui manque quand ils ne le sont pas', EDITEUR.nom ? true : /\[éditeur à renseigner\]/.test(politique));
  fs.rmSync(sortie, { recursive: true, force: true });
  check('la commande existe : npm run magasin', JSON.parse(lire('package.json')).scripts.magasin === 'node outils/magasin.mjs' && JSON.parse(lire('package.json')).scripts.test.includes('test/magasin.test.js'));
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
