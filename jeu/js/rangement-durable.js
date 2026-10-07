// ---------------------------------------------------------------------------
// Un second rangement pour le profil du joueur, là où la page en offre un.
//
// Le profil (classement, coffres, niveaux) vit dans le stockage du navigateur
// (js/save.js). Sur iPhone ce stockage peut s'effacer, et il ne suit pas le
// joueur d'un appareil à l'autre. Quand la page est servie par un hôte qui
// prête une base de données par personne (`claude.use('db')`), le profil y
// est rangé aussi : au lancement, le plus avancé des deux l'emporte ; ensuite
// chaque écriture locale y est recopiée. Sans cet hôte — page ouverte seule,
// application — rien ne change : `brancher` rend null et le jeu continue sur
// le stockage du navigateur.
//
// Ce n'est pas un serveur qui fait foi : il ne vérifie rien, il garde.
// ---------------------------------------------------------------------------

import { migrerProfil } from './progression.js';

/** Où le profil est rangé, dans le sous-arbre privé de chaque personne. */
const DOCUMENT = 'progression';

/** Des deux profils, le plus avancé : celui qui a fait le plus d'opérations. */
export function plusAvance(a, b) {
  const pa = migrerProfil(a), pb = migrerProfil(b);
  return pb.operations > pa.operations ? pb : pa;
}

/**
 * Branche le rangement durable. `lire` et `ecrire` sont ceux du stockage du
 * navigateur ; `hote` est `window.claude` (ou rien). Rend `null` s'il n'y a
 * pas de rangement durable ici, sinon `{ adopte, recopier }` : `adopte` dit si
 * le profil durable, plus avancé, vient de remplacer le profil local ;
 * `recopier(profil)` est à appeler après chaque écriture locale.
 */
export async function brancher({ hote, lire, ecrire }) {
  if (!hote || typeof hote.use !== 'function') return null;
  let db, personne;
  try { [db, personne] = await Promise.all([hote.use('db'), hote.use('user')]); } catch { return null; }
  if (!db || !personne) return null;
  let id = null;
  try { id = await personne.id(); } catch { id = null; }
  if (!id) return null;   // pas d'identité ici : pas de sous-arbre privé

  let doc;
  try { doc = db.doc(`data/users/${id}/${DOCUMENT}`); } catch { return null; }

  // Une écriture à la fois ; pendant qu'elle part, seule la dernière attend.
  let enCours = false, enAttente = null, refuse = false;
  async function envoyer(profil) {
    if (refuse) return;
    if (enCours) { enAttente = profil; return; }
    enCours = true;
    try {
      await doc.set({ profil: migrerProfil(profil), operations: migrerProfil(profil).operations });
    } catch (e) {
      // Ce visiteur ne peut pas écrire ici, ou l'accès est retiré : on s'en tient au navigateur.
      if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) refuse = true;
    }
    enCours = false;
    if (enAttente) { const suivant = enAttente; enAttente = null; envoyer(suivant); }
  }

  const local = migrerProfil(lire());
  let durable = null;
  try {
    const image = await doc.get();
    if (image && image.exists) durable = (image.data() || {}).profil || null;
  } catch { durable = null; }

  let adopte = false;
  if (durable && migrerProfil(durable).operations > local.operations) {
    adopte = ecrire(migrerProfil(durable)) !== false;
  } else if (!durable || local.operations > migrerProfil(durable).operations) {
    if (local.operations > 0) envoyer(local);
  }
  return { adopte, recopier: envoyer };
}
