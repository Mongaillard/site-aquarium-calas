// ---------------------------------------------------------------------------
// Les rappels du téléphone : quelques mots du jeu quand le joueur n'y est pas.
// Dans l'application seulement (extension « LocalNotifications » de Capacitor) :
// tout se programme sur l'appareil, rien n'en sort, aucun serveur. Dans un
// navigateur, il n'y a pas d'hôte : rien ne se demande, rien ne se programme.
//
// Les règles (état des lieux du 12/10/2026) :
//   - un rappel par jour au plus, trois programmés d'avance au plus ;
//   - jamais entre 21 h et 9 h ;
//   - jamais une offre, jamais un prix ;
//   - trois sortes, chacune avec son interrupteur : la partie qui attend, la
//     saison qui finit, le retour après une absence ;
//   - la permission se demande une seule fois, après une première victoire,
//     par une question du jeu avant celle du système ;
//   - trois rappels restés sans réponse, et plus rien : il n'y en a jamais
//     plus de trois d'avance, et seul un retour dans le jeu en programme d'autres.
// ---------------------------------------------------------------------------

import { txt } from './langue.js';

export const CLE_RAPPELS = 'aem.rappels';
export const SORTES = ['partie', 'saison', 'retour'];
export const REGLES = {
  silence: { de: 21, a: 9 },   // heures locales entre lesquelles rien ne sonne
  heure: 18,                   // l'heure des rappels datés (la saison, le retour)
  partieApres: 3,              // heures après avoir quitté une partie en cours
  absences: [2, 7],            // jours sans jouer : un rappel à chacun, puis plus rien
  finDeSaison: 3,              // jours avant la fin de la saison
  pointsProches: 300,          // … seulement si le palier suivant est à portée
  enAvance: 3,                 // jamais plus de rappels programmés à la fois
};

const HEURE = 3600000;

/** Les réglages d'un joueur à qui l'on n'a encore rien demandé : les trois sortes sont prêtes. */
export function reglagesNeufs() {
  return { demande: false, actifs: { partie: true, saison: true, retour: true } };
}

const stockageDuNavigateur = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** Les réglages gardés sur l'appareil ; ce qui manque ou ne tient pas debout reprend sa valeur de départ. */
export function lireReglages(stockage = stockageDuNavigateur()) {
  const r = reglagesNeufs();
  let lu = null;
  try { lu = stockage ? JSON.parse(stockage.getItem(CLE_RAPPELS) || 'null') : null; } catch { lu = null; }
  if (!lu || typeof lu !== 'object') return r;
  r.demande = lu.demande === true;
  if (lu.actifs && typeof lu.actifs === 'object') for (const sorte of SORTES) if (typeof lu.actifs[sorte] === 'boolean') r.actifs[sorte] = lu.actifs[sorte];
  return r;
}

export function ecrireReglages(reglages, stockage = stockageDuNavigateur()) {
  try { if (stockage) stockage.setItem(CLE_RAPPELS, JSON.stringify(reglages)); return true; } catch { return false; }
}

/** L'instant permis le plus proche : hors des heures de silence il ne bouge pas, dedans il attend le matin. */
export function horsDuSilence(instant) {
  const d = new Date(instant);
  const { de, a } = REGLES.silence;
  if (d.getHours() >= de) { d.setDate(d.getDate() + 1); d.setHours(a, 0, 0, 0); } else if (d.getHours() < a) d.setHours(a, 0, 0, 0);
  return d.getTime();
}

/** Dans `jours` jours, à l'heure des rappels datés. */
function aLHeure(instant, jours) {
  const d = new Date(instant);
  d.setDate(d.getDate() + jours);
  d.setHours(REGLES.heure, 0, 0, 0);
  return d.getTime();
}

/**
 * Les rappels à programmer au moment où le joueur quitte le jeu. `etat` :
 *   maintenant : l'instant (millisecondes) ; reglages : ceux du joueur ;
 *   partie     : `{ minutes }` si une partie en cours est sauvegardée, sinon rien ;
 *   saison     : `{ joursRestants, manque, palier }` — les jours avant la fin du mois, les points qui manquent
 *                pour le palier suivant et son numéro —, ou rien.
 * Rend au plus REGLES.enAvance rappels `{ id, genre, quand, titre, texte }`, un par jour au plus, dans l'ordre du temps.
 */
export function rappelsAProgrammer(etat) {
  const { maintenant, reglages, partie, saison } = etat;
  if (!reglages || !reglages.actifs || !(maintenant > 0)) return [];
  const voulus = [];
  if (reglages.actifs.partie && partie && partie.minutes >= 1) {
    voulus.push({
      genre: 'partie', quand: horsDuSilence(maintenant + REGLES.partieApres * HEURE), titre: txt('Ta partie t’attend'),
      texte: partie.minutes > 1 ? txt`${Math.round(partie.minutes)} minutes de jeu sauvegardées : reprends où tu en étais.` : txt('Ta partie est sauvegardée : reprends où tu en étais.'),
    });
  }
  if (reglages.actifs.saison && saison && saison.joursRestants >= 2 && saison.manque > 0 && saison.manque <= REGLES.pointsProches) {
    const avant = Math.min(REGLES.finDeSaison, saison.joursRestants - 1);
    voulus.push({
      genre: 'saison', quand: aLHeure(maintenant, saison.joursRestants - avant),
      titre: avant > 1 ? txt`La saison se termine dans ${avant} jours` : txt('La saison se termine demain'),
      texte: txt`Il te manque ${saison.manque} points pour le palier ${saison.palier}.`,
    });
  }
  if (reglages.actifs.retour) {
    for (const jours of REGLES.absences) {
      const reste = saison ? saison.joursRestants - jours : 0;
      voulus.push({
        genre: 'retour', quand: aLHeure(maintenant, jours), titre: txt('Ton royaume t’attend'),
        texte: reste > 1 ? txt`La saison continue encore ${reste} jours.` : txt('Tes troupes n’ont pas bougé. Une partie de cinq minutes ?'),
      });
    }
  }
  // Un par jour au plus : dans l'ordre ci-dessus, le premier venu garde son jour. Puis l'ordre du temps.
  const jours = new Set(), gardes = [];
  for (const rappel of voulus) {
    const jour = new Date(rappel.quand).toDateString();
    if (!(rappel.quand > maintenant) || jours.has(jour)) continue;
    jours.add(jour);
    gardes.push(rappel);
  }
  return gardes.sort((a, b) => a.quand - b.quand).slice(0, REGLES.enAvance).map((rappel, i) => ({ id: 7100 + i, ...rappel }));
}

/** Faut-il poser la question des rappels ? Une seule fois, et pas avant une première victoire classée. */
export function fautIlDemander(reglages, profil) {
  return !!reglages && !reglages.demande && !!profil && profil.victoires >= 1;
}

/**
 * L'extension de rappels de l'application, sous une forme simple. Rend null hors de l'application, ou si
 * l'extension n'y est pas : alors le jeu ne demande rien et ne montre aucun réglage.
 */
export function hoteDesRappels(capacitor = typeof globalThis !== 'undefined' ? globalThis.Capacitor : null) {
  const n = capacitor && capacitor.Plugins ? capacitor.Plugins.LocalNotifications : null;
  if (!n || typeof n.schedule !== 'function' || typeof n.requestPermissions !== 'function') return null;
  const lue = (r) => (r && r.display === 'granted' ? 'accordee' : r && r.display === 'denied' ? 'refusee' : 'a-demander');
  return {
    async permission() { try { return lue(await n.checkPermissions()); } catch { return 'refusee'; } },
    async demander() { try { return lue(await n.requestPermissions()) === 'accordee'; } catch { return false; } },
    async annuler() {
      try {
        const attente = await n.getPending();
        const liste = attente && Array.isArray(attente.notifications) ? attente.notifications : [];
        if (liste.length) await n.cancel({ notifications: liste.map((x) => ({ id: x.id })) });
      } catch { /* rien n'était programmé */ }
    },
    async programmer(rappels) {
      if (!rappels.length) return;
      try { await n.schedule({ notifications: rappels.map((r) => ({ id: r.id, title: r.titre, body: r.texte, schedule: { at: new Date(r.quand) } })) }); } catch { /* le système a refusé : sans gravité */ }
    },
  };
}

/** Le joueur quitte le jeu : ce qui était programmé s'efface, et l'on reprogramme d'après ce qu'il laisse. Rend ce qui est programmé. */
export async function quitterLeJeu(hote, etat) {
  if (!hote) return [];
  await hote.annuler();
  if (!etat.reglages.demande || (await hote.permission()) !== 'accordee') return [];
  const rappels = rappelsAProgrammer(etat);
  await hote.programmer(rappels);
  return rappels;
}

/** Le joueur revient : plus rien à lui rappeler. */
export async function revenirAuJeu(hote) {
  if (hote) await hote.annuler();
}
