// Le second rangement du profil (js/rangement-durable.js) : là où la page offre
// une base par personne, le profil y est gardé aussi, et le plus avancé des
// deux l'emporte au lancement. Ici l'hôte est simulé : une base en mémoire.
// Lancement : node test/rangement-durable.test.js

import { brancher, plusAvance, hoteDeLApplication } from '../js/rangement-durable.js';
import { profilNeuf, appliquerResultat, migrerProfil } from '../js/progression.js';

let failures = 0;
function check(label, condition, detail = '') {
  const status = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ' — ' + detail : ''}`);
}
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tour = () => new Promise((ok) => setTimeout(ok, 0));

/** Un profil après `n` victoires classées. */
function profilApres(n) {
  let p = profilNeuf();
  for (let i = 0; i < n; i++) p = appliquerResultat(p, { issue: 'victoire', duree: 600, contreOrdinateur: 'echelle', jour: '2026-10-07' }).profil;
  return p;
}
/** Un hôte simulé : `claude.use('db')` et `claude.use('user')` sur une base en mémoire. */
function hoteSimule({ id = 'u_abc', contenu = {}, refuse = null, sansDb = false, lenteur = 0, pendantLaLecture = null } = {}) {
  const ecritures = [];
  let enVol = 0, simultanees = 0;
  const db = {
    doc(chemin) {
      if (chemin.split('/').length % 2) throw new TypeError('chemin impair');
      return {
        async get() {
          const image = { exists: chemin in contenu, data: () => contenu[chemin] };
          if (pendantLaLecture) { const f = pendantLaLecture; pendantLaLecture = null; await tour(); f(); }
          return image;
        },
        async set(corps) {
          enVol++; simultanees = Math.max(simultanees, enVol);
          if (lenteur) await new Promise((ok) => setTimeout(ok, lenteur));
          enVol--;
          if (refuse) throw { code: refuse, message: 'refusé' };
          contenu[chemin] = JSON.parse(JSON.stringify(corps));
          ecritures.push(chemin);
        },
      };
    },
  };
  return {
    hote: { use: async (nom) => (nom === 'db' ? (sansDb ? null : db) : nom === 'user' ? { id: async () => id } : null) },
    contenu, ecritures, simultanees: () => simultanees,
  };
}
/** Le stockage du navigateur, simulé. */
function local(profil) {
  const boite = { profil: profil || profilNeuf(), ecrits: 0 };
  return { boite, lire: () => boite.profil, ecrire: (p) => { boite.profil = migrerProfil(p); boite.ecrits++; return true; } };
}
const CHEMIN = 'data/users/u_abc/progression';

console.log('=== Rangement durable du profil ===');
{
  check('sans hôte, pas de rangement durable', await brancher({ hote: undefined, ...local() }) === null && await brancher({ hote: {}, ...local() }) === null);
  check('hôte sans base de données : rien', await brancher({ hote: hoteSimule({ sansDb: true }).hote, ...local() }) === null);
  check('visiteur sans identité : rien, et rien n’est écrit ailleurs', await (async () => {
    const h = hoteSimule({ id: null });
    return await brancher({ hote: h.hote, ...local(profilApres(2)) }) === null && h.ecritures.length === 0;
  })());
  check('un hôte qui lève une erreur ne casse rien', await brancher({ hote: { use: async () => { throw new Error('panne'); } }, ...local() }) === null);
}
{
  // Première fois : le navigateur a un profil, la base est vide.
  const h = hoteSimule(), l = local(profilApres(3));
  const r = await brancher({ hote: h.hote, ...l });
  await tour();
  check('base vide : le profil du navigateur y est recopié', !!r && r.adopte === false && egal(h.contenu[CHEMIN].profil, l.boite.profil) && h.contenu[CHEMIN].operations === l.boite.profil.operations);
  check('… dans le sous-arbre privé de la personne, et nulle part ailleurs', egal(Object.keys(h.contenu), [CHEMIN]));
  const neuf = hoteSimule(), ln = local();
  await brancher({ hote: neuf.hote, ...ln }); await tour();
  check('profil neuf et base vide : rien à écrire', neuf.ecritures.length === 0);
}
{
  // Le stockage du téléphone a été effacé : le profil revient de la base.
  const garde = profilApres(5);
  const h = hoteSimule({ contenu: { [CHEMIN]: { profil: garde, operations: garde.operations } } }), l = local();
  const r = await brancher({ hote: h.hote, ...l });
  check('stockage effacé : le profil durable revient', r.adopte === true && egal(l.boite.profil, garde) && l.boite.ecrits === 1 && h.ecritures.length === 0);
  // L'inverse : on a joué hors de l'hôte, le navigateur est en avance.
  const vieux = profilApres(2), avance = profilApres(6);
  const h2 = hoteSimule({ contenu: { [CHEMIN]: { profil: vieux, operations: vieux.operations } } }), l2 = local(avance);
  const r2 = await brancher({ hote: h2.hote, ...l2 }); await tour();
  check('navigateur en avance : c’est lui qui met la base à jour', r2.adopte === false && l2.boite.ecrits === 0 && egal(h2.contenu[CHEMIN].profil, avance));
  const h3 = hoteSimule({ contenu: { [CHEMIN]: { profil: avance, operations: avance.operations } } }), l3 = local(avance);
  await brancher({ hote: h3.hote, ...l3 }); await tour();
  check('à égalité : rien ne bouge', l3.boite.ecrits === 0 && h3.ecritures.length === 0);
  check('des deux profils, le plus avancé est celui qui a le plus d’opérations', egal(plusAvance(vieux, avance), avance) && egal(plusAvance(avance, vieux), avance) && egal(plusAvance(null, avance), avance));
  const abime = hoteSimule({ contenu: { [CHEMIN]: { profil: 'n’importe quoi' } } }), l4 = local(profilApres(1));
  const r4 = await brancher({ hote: abime.hote, ...l4 }); await tour();
  check('un document abîmé dans la base ne remplace pas le profil du navigateur', r4.adopte === false && l4.boite.ecrits === 0 && egal(abime.contenu[CHEMIN].profil, l4.boite.profil));
}
{
  // Chaque écriture locale est recopiée, une à la fois, la dernière gagne.
  const h = hoteSimule({ lenteur: 5 }), l = local();
  const r = await brancher({ hote: h.hote, ...l });
  const suite = [1, 2, 3, 4, 5].map(profilApres);
  for (const p of suite) r.recopier(p);
  await new Promise((ok) => setTimeout(ok, 60));
  check('cinq écritures coup sur coup : jamais deux à la fois, la dernière est gardée',
    h.simultanees() === 1 && egal(h.contenu[CHEMIN].profil, suite[4]) && h.ecritures.length === 2, `${h.ecritures.length} écritures`);
  const ferme = hoteSimule({ refuse: 'invalid_argument' }), lf = local(profilApres(1));
  const rf = await brancher({ hote: ferme.hote, ...lf }); await tour();
  rf.recopier(profilApres(2)); rf.recopier(profilApres(3)); await tour();
  check('un visiteur qui ne peut pas écrire : on s’en tient au navigateur, sans erreur', ferme.ecritures.length === 0 && egal(lf.boite.profil, profilApres(1)));
}

{
  // Deux appareils. Celui-ci est resté ouvert à trois opérations ; l'autre a
  // porté la base à dix. Une écriture d'ici ne doit pas la ramener en arrière.
  const loin = profilApres(10), ici = profilApres(3);
  const h = hoteSimule({ contenu: { [CHEMIN]: { profil: ici, operations: ici.operations } } }), l = local(ici);
  const r = await brancher({ hote: h.hote, ...l });
  h.contenu[CHEMIN] = { profil: loin, operations: loin.operations };   // l'autre appareil vient d'écrire
  r.recopier(profilApres(4)); await tour(); await tour();
  check('un appareil en retard n’écrase pas la base, plus avancée', egal(h.contenu[CHEMIN].profil, loin) && h.ecritures.length === 0);
  r.recopier(profilApres(12)); await tour(); await tour();
  check('… une fois en avance, il l’écrit', egal(h.contenu[CHEMIN].profil, profilApres(12)));

  // Ce qui se joue pendant que la base répond n'est pas perdu.
  const base = profilApres(6), l2 = local(profilApres(1));
  const h2 = hoteSimule({ contenu: { [CHEMIN]: { profil: base, operations: base.operations } }, pendantLaLecture: () => { l2.boite.profil = profilApres(8); } });
  const r2 = await brancher({ hote: h2.hote, ...l2 }); await tour(); await tour();
  check('une partie finie pendant la lecture de la base n’est pas écrasée par elle',
    r2.adopte === false && egal(l2.boite.profil, profilApres(8)) && egal(h2.contenu[CHEMIN].profil, profilApres(8)));
}

// --- L'application : les préférences de l'appareil ------------------------------------------
console.log('\n--- L’application ---');
{
  const coffre = new Map();
  const preferences = { get: async ({ key }) => ({ value: coffre.has(key) ? coffre.get(key) : null }), set: async ({ key, value }) => { coffre.set(key, value); } };
  const capacitor = { Plugins: { Preferences: preferences } };
  check('hors de l’application, ou sans l’extension : pas d’hôte', hoteDeLApplication(null) === null && hoteDeLApplication({ Plugins: {} }) === null && hoteDeLApplication({}) === null);
  // Premier lancement : rien dans l'appareil ; le profil local y est recopié à la première écriture.
  let local = profilApres(3);
  const r1 = await brancher({ hote: hoteDeLApplication(capacitor), lire: () => local, ecrire: (p) => { local = p; return true; } });
  await tour(); await tour();
  const cle = [...coffre.keys()][0];
  check('dans l’application : le profil est recopié dans les préférences de l’appareil, sous une clé du jeu',
    !!r1 && r1.adopte === false && coffre.size === 1 && cle.startsWith('aem.') && egal(JSON.parse(coffre.get(cle)).profil, profilApres(3)));
  r1.recopier(profilApres(5));
  await tour(); await tour();
  check('… chaque écriture suit', JSON.parse(coffre.get(cle)).profil.operations === profilApres(5).operations);
  // La vue web a perdu son stockage : le profil revient de l'appareil.
  let perdu = profilNeuf();
  const r2 = await brancher({ hote: hoteDeLApplication(capacitor), lire: () => perdu, ecrire: (p) => { perdu = p; return true; } });
  check('la vue web a perdu son stockage : le profil — et ce qui a été acheté — revient de l’appareil', r2.adopte === true && egal(perdu, profilApres(5)));
  coffre.set(cle, '{ pas du JSON');
  let sain = profilApres(2);
  const r3 = await brancher({ hote: hoteDeLApplication(capacitor), lire: () => sain, ecrire: (p) => { sain = p; return true; } });
  await tour(); await tour();
  check('des préférences illisibles ne cassent rien : le profil local reste, et les remplace', !!r3 && r3.adopte === false && egal(sain, profilApres(2)) && JSON.parse(coffre.get(cle)).profil.operations === profilApres(2).operations);
}

console.log(`\n${failures === 0 ? 'Tous les tests passent' : failures + ' test(s) en échec'}`);
process.exit(failures === 0 ? 0 : 1);
