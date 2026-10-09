#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Prépare le dossier de l'application des magasins (App Store, Google Play) :
// ce que l'enveloppe native (Capacitor) embarque comme contenu web.
//
//     npm run magasin                  → magasin/www
//     node outils/magasin.mjs --sortie <dossier> [--quand-meme]
//
// Ce qu'il fait :
//   1. refuse de continuer tant que le jeu n'est pas présentable aux magasins
//      (nom qui reprend une marque, éditeur non renseigné : voir
//      js/edition.js) — `--quand-meme` passe outre, pour un essai ;
//   2. copie le jeu, sans ce qui ne sert qu'à la page web ou au développement
//      (service worker, manifeste web, essais, notes) ;
//   3. marque la page « édition magasin » : ni bouton d'essai, ni article
//      annoncé « bientôt », ni réglage de mise au point ;
//   4. retire toute adresse extérieure que la page pourrait appeler d'elle-même
//      (la seconde source des caractères, chez Google) : l'application ne
//      parle à personne, et sa fiche de confidentialité peut le dire ;
//   5. écrit la politique de confidentialité, en français et en anglais
//      (confidentialite.html) — la même page est à publier à une adresse
//      publique pour la fiche des magasins ;
//   6. écrit, à côté, les réglages de l'enveloppe native : capacitor.config.json
//      (nom, identifiant, extensions) et, s'il manque, package.json (les
//      paquets de Capacitor, versions fixées).
//
// L'enveloppe se fabrique ensuite dans magasin/, avec Node 22 (Capacitor 8) :
//     npm install ; npx cap add ios ; npx cap add android ; npx cap sync
//
// Aucune dépendance : Node seul.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOM_DU_JEU, EDITEUR, IDENTIFIANT, nomComplet, manquesAvantMagasin } from '../js/edition.js';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const quandMeme = args.includes('--quand-meme');
const rangSortie = args.indexOf('--sortie');
const SORTIE = path.resolve(rangSortie >= 0 && args[rangSortie + 1] ? args[rangSortie + 1] : path.join(RACINE, 'magasin', 'www'));

/** La politique de confidentialité, en une page autonome (français, puis anglais). */
export function pageDeConfidentialite(nom = nomComplet(), editeur = EDITEUR, date = new Date().toISOString().slice(0, 10)) {
  const qui = editeur.nom || '[éditeur à renseigner]';
  const ou = editeur.courriel || '[adresse à renseigner]';
  const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${echapper(nom)} — Politique de confidentialité</title>
<style>
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; font: 16px/1.55 system-ui, sans-serif; color: #17120e; background: #fff4dc; }
  h1 { font-size: 1.6rem; line-height: 1.2; } h2 { font-size: 1.15rem; margin-top: 2rem; } small { color: #4a3f33; }
</style>
</head>
<body>
<h1>${echapper(nom)} — Politique de confidentialité</h1>
<p><small>Dernière mise à jour : ${echapper(date)} · <a href="#english">English version below</a></small></p>

<h2>En bref</h2>
<p>${echapper(nom)} ne collecte aucune donnée personnelle. Le jeu fonctionne sans connexion, sans compte, sans publicité et sans traceur.</p>

<h2>Ce que le jeu garde, et où</h2>
<p>Votre progression (classement, coffres, troupes, collections, monnaies du jeu), votre partie en cours et vos réglages sont enregistrés uniquement sur votre appareil. Ils ne sont transmis ni à l’éditeur ni à un tiers.</p>

<h2>Ce que le jeu ne fait pas</h2>
<ul>
  <li>Il ne demande ni nom, ni adresse de courriel, ni numéro de téléphone, ni position.</li>
  <li>Il n’utilise aucun identifiant publicitaire et n’affiche aucune publicité.</li>
  <li>Il n’intègre aucun outil de mesure d’audience ni de suivi.</li>
  <li>Il ne partage aucune donnée avec un tiers.</li>
</ul>

<h2>Effacer vos données</h2>
<p>Dans le jeu : écran d’accueil, « Confidentialité et données », puis « Effacer toutes mes données ». Désinstaller l’application efface aussi tout ce qu’elle a enregistré.</p>

<h2>Achats</h2>
<p>Si le jeu propose des achats intégrés, ils sont traités par le magasin d’applications (Apple ou Google), selon sa propre politique de confidentialité. L’éditeur ne reçoit aucune donnée de paiement.</p>

<h2>Enfants</h2>
<p>Le jeu ne s’adresse pas spécifiquement aux enfants et ne collecte aucune donnée, quel que soit l’âge du joueur.</p>

<h2>Contact</h2>
<p>Éditeur : ${echapper(qui)}. Pour toute question : ${echapper(ou)}.${editeur.mentions ? `<br><small>${echapper(editeur.mentions)}</small>` : ''}</p>

<h1 id="english">${echapper(nom)} — Privacy Policy</h1>
<p><small>Last updated: ${echapper(date)}</small></p>
<p>${echapper(nom)} does not collect any personal data. The game works offline, with no account, no advertising and no tracking.</p>
<p>Your progress, your current game and your settings are stored on your device only. They are never sent to the publisher or to any third party. The game uses no advertising identifier and no analytics tool.</p>
<p>To erase your data: in the game, open “Confidentialité et données” on the home screen, then “Effacer toutes mes données”. Uninstalling the app also removes everything it stored.</p>
<p>In-app purchases, if any, are processed by the app store (Apple or Google) under its own privacy policy; the publisher receives no payment data.</p>
<p>Publisher: ${echapper(qui)}. Contact: ${echapper(ou)}.</p>
</body>
</html>
`;
}

/** Les paquets de l'enveloppe native, versions fixées (Capacitor 8 : Node 22, Xcode 26, Android API 36). */
export const PAQUETS = Object.freeze({
  '@capacitor/core': '8.5.3', '@capacitor/cli': '8.5.3', '@capacitor/ios': '8.5.3', '@capacitor/android': '8.5.3',
  '@capacitor/preferences': '8.0.1', '@capgo/native-purchases': '8.9.2',
});

/**
 * Les réglages de l'enveloppe native (capacitor.config.json). Tant que le nom
 * ou l'identifiant manquent, ce sont ceux d'un essai, qui ne se soumet pas.
 * L'extension d'achats ne clôt rien d'elle-même : c'est le jeu qui clôt, après
 * avoir livré (js/achats.js) — dit ici pour que l'iPhone le sache dès le lancement.
 */
export function configDeLApplication(nom = nomComplet(), identifiant = IDENTIFIANT, manques = manquesAvantMagasin()) {
  const essai = manques.length > 0;
  return {
    appId: essai ? 'fr.mongaillard.essai' : identifiant,
    appName: essai ? 'Essai du jeu' : nom,
    webDir: 'www',
    plugins: { NativePurchases: { autoFinishTransactions: false } },
  };
}

function copier(source, cible, garder) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(cible, { recursive: true });
    for (const nom of fs.readdirSync(source)) copier(path.join(source, nom), path.join(cible, nom), garder);
  } else if (garder(source)) {
    fs.copyFileSync(source, cible);
  }
}

function taille(dossier) {
  let octets = 0, fichiers = 0;
  for (const nom of fs.readdirSync(dossier)) {
    const chemin = path.join(dossier, nom);
    const stat = fs.statSync(chemin);
    if (stat.isDirectory()) { const t = taille(chemin); octets += t.octets; fichiers += t.fichiers; } else { octets += stat.size; fichiers++; }
  }
  return { octets, fichiers };
}

/** Prépare le dossier. Renvoie `{ sortie, fichiers, octets, manques }`, ou lève une erreur quand un manque interdit de continuer. */
export function preparer({ sortie = SORTIE, force = quandMeme, enveloppe = false } = {}) {
  const manques = manquesAvantMagasin();
  if (manques.length && !force) {
    const erreur = new Error(`Le jeu n’est pas prêt pour les magasins :\n${manques.map((m) => `  - ${m}`).join('\n')}\nCorrige js/edition.js (et le nom dans index.html et manifest.webmanifest), ou ajoute --quand-meme pour un essai.`);
    erreur.manques = manques;
    throw erreur;
  }
  fs.rmSync(sortie, { recursive: true, force: true });
  fs.mkdirSync(sortie, { recursive: true });
  // Ni notes, ni fichiers cachés ; les images et les modèles tels quels.
  const garder = (chemin) => !/(^|\/)\.|SOURCES\.md$|\.map$/.test(path.relative(RACINE, chemin));
  for (const dossier of ['css', 'js', 'assets', 'icons']) copier(path.join(RACINE, dossier), path.join(sortie, dossier), garder);

  // La page : sans manifeste web (donc sans service worker : l'application est déjà hors ligne), marquée « magasin ».
  let page = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  page = page.split('\n').filter((ligne) => !/<link rel="manifest"/.test(ligne)).join('\n');
  page = page.replace('<script type="module" src="js/main.js"></script>', '<script>window.__EDITION = \'magasin\';</script>\n<script type="module" src="js/main.js"></script>');
  if (!page.includes('window.__EDITION')) throw new Error('index.html : la balise du script principal a changé, la marque d’édition n’a pas pu être posée.');
  fs.writeFileSync(path.join(sortie, 'index.html'), page);

  // Les caractères : leurs fichiers sont dans l'application, la seconde source (chez Google) n'a plus lieu d'être.
  const feuille = path.join(sortie, 'css', 'boite.css');
  fs.writeFileSync(feuille, fs.readFileSync(feuille, 'utf8').replace(/,\s*url\("https:\/\/fonts\.gstatic\.com[^"]*"\)\s*format\("woff2"\)/g, ''));
  // Plus aucune adresse extérieure dans une feuille de style : une feuille appelle ce qu'elle nomme.
  for (const nom of fs.readdirSync(path.join(sortie, 'css'))) {
    const texte = fs.readFileSync(path.join(sortie, 'css', nom), 'utf8');
    if (/url\(\s*["']?https?:/i.test(texte)) throw new Error(`css/${nom} appelle encore une adresse extérieure.`);
  }

  fs.writeFileSync(path.join(sortie, 'confidentialite.html'), pageDeConfidentialite());

  // Les réglages de l'enveloppe native, à côté du contenu web.
  if (enveloppe) {
    const dossier = path.dirname(sortie);
    fs.writeFileSync(path.join(dossier, 'capacitor.config.json'), `${JSON.stringify({ ...configDeLApplication(), webDir: path.basename(sortie) }, null, 2)}\n`);
    const paquet = path.join(dossier, 'package.json');
    if (!fs.existsSync(paquet)) {
      fs.writeFileSync(paquet, `${JSON.stringify({ name: 'application-du-jeu', version: '1.0.0', private: true,
        description: 'L’enveloppe native du jeu (Capacitor) : App Store et Google Play.', dependencies: PAQUETS }, null, 2)}\n`);
    }
  }
  return { sortie, ...taille(sortie), manques };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = preparer({ enveloppe: true });
    console.log(`Application « ${nomComplet()} » préparée dans ${r.sortie}`);
    console.log(`  ${r.fichiers} fichiers, ${Math.round(r.octets / 1048576)} Mo`);
    if (r.manques.length) console.log(`  ATTENTION, préparée « quand même » : ce dossier ne doit pas être soumis.\n${r.manques.map((m) => `  - ${m}`).join('\n')}`);
    else console.log('  Prête à être embarquée (Capacitor : webDir = "magasin/www").');
    console.log(`  Nom : ${NOM_DU_JEU.titre}${NOM_DU_JEU.suite ? ` ${NOM_DU_JEU.suite}` : ''} · Éditeur : ${EDITEUR.nom || '(vide)'} · Identifiant : ${IDENTIFIANT || '(vide)'}`);
  } catch (erreur) {
    console.error(erreur.message);
    process.exit(1);
  }
}
