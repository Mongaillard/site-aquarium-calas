// ---------------------------------------------------------------------------
// Les écrans de la campagne et des défis : la tuile de l'accueil, l'écran
// « Campagne et défis » (les chapitres de la campagne, le défi du jour, puis
// les scénarios qui portent un nom), l'écran d'une mission — son récit avant
// la partie — et ce que la fin d'une partie de scénario annonce. Branché sur
// les écrans de la progression (js/progression-ecrans.js), comme ceux des
// collections.
//
// Aucune règle ici : les scénarios sont dans js/scenarios.js, ce qu'ils
// donnent dans js/progression.js (appliquerScenario, etatDeLaCampagne).
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { etatDeScenario, etatDeLaCampagne } from './progression.js';
import { SCENARIOS, SCENARIOS_LIBRES, CHAPITRES, REGLES, scenarioDe, butsDe, nomDuChef, recitDe } from './scenarios.js';
import { GAME_MODES, nomDe, portraitDe } from './config.js';
import { iconeSVG } from './icones.js';
import { htmlMedaillon, titreDuBlason } from './blason.js';
import { pieceEnPhrase } from './collections-ecrans.js';
import { txt } from './langue.js';

/** Les outils prêtés par js/progression-ecrans.js : montrer, fermer, nombre, duree, jour, peuple, et `lancer` (main.js). */
let o = null;
export function brancherDefis(outils) { o = outils; }

const minutes = (secondes) => Math.round(secondes / 60);
/** Le peuple du joueur, tel que l'accueil l'a réglé : il dit qui raconte, et qui est en face. */
const peuple = () => (o && o.peuple ? o.peuple() : undefined);

/** Trois étoiles, pleines ou creuses, dans l'ordre des buts. */
export function htmlEtoiles(acquis, taille = 16) {
  return `<span class="defi-etoiles" aria-label="${txt`Étoiles : ${acquis.filter(Boolean).length} sur 3`}">${acquis.map((oui) => `<i class="${oui ? 'pleine' : ''}">${iconeSVG('etoile', taille)}</i>`).join('')}</span>`;
}

/** Le titre d'un scénario tel qu'on le lit : « Défi du jour · Mur de lances », « Tenir le Fort ». */
export function titreDeScenario(def) {
  return def.id === 'defi' ? txt`Défi du jour · ${txt(def.nom)}` : txt(def.nom);
}

/** Ce qu'est la partie, en une ligne : son format et sa durée, ses vagues, son monstre. */
function enBref(def) {
  if (def.chef) return txt`${nomDuChef(def, peuple())} · ${o.nombre(def.chef.vie)} points de vie · ${minutes(def.but.avant)} min`;
  if (def.vagues) return txt`${def.vagues.length} vagues · une par minute`;
  const format = GAME_MODES[def.base];
  return txt`${format.name} · ${minutes(format.timeLimit)} min · contre l’ordinateur`;
}

/** Le record d'un scénario, en une phrase, ou rien. */
function phraseDuRecord(def, record) {
  if (!record) return '';
  if (def.record === 'vague') return txt`Ton record : vague ${record} sur ${def.vagues.length}`;
  if (def.record === 'temps') return txt`Ton record : ${o.duree(record)}`;
  return '';
}

/** Les trois buts à étoile d'un scénario, chacun avec ce qu'il rapporte encore. */
function htmlButs(def, acquis) {
  return `<ul class="defi-buts">${butsDe(def, peuple()).map((but, i) => `
        <li class="${acquis[i] ? 'fait' : ''}"><i class="${acquis[i] ? 'pleine' : ''}">${iconeSVG('etoile', 18)}</i><span>${but}</span><b>${acquis[i] ? '' : `+${o.nombre(R.defis.points.etoile)}`}</b></li>`).join('')}
      </ul>`;
}

/** Le bouton qui lance un scénario : « Jouer », « Rejouer », ou la confirmation quand une partie dort. */
function boutonJouer(arg, etat, confirmer) {
  return `<button class="btn ${confirmer === arg ? 'arme' : 'primary'}" data-act="jouerScenario" data-arg="${arg}" ${confirmer === arg ? 'data-i="1"' : ''}>${confirmer === arg ? txt('Effacer la partie en cours ?') : etat.etoiles === 3 ? txt('Rejouer') : txt('Jouer')}</button>`;
}

/** La carte d'un scénario : ce qu'il est, ses trois buts, ce qu'ils rapportent, et le bouton. */
function carte(ref, etat, confirmer) {
  const def = scenarioDe(ref);
  if (!def) return '';
  const arg = def.id === 'defi' ? 'defi' : def.id;
  const record = phraseDuRecord(def, etat.record);
  return `
    <section class="defi-carte">
      <p class="defi-tete">${iconeSVG(def.icone || 'attaquer', 26, 'inline')}<b>${titreDeScenario(def)}</b>${htmlEtoiles(etat.acquis)}</p>
      <p class="defi-resume">${txt(def.resume)}</p>
      <p class="defi-bref">${enBref(def)}</p>
      ${htmlButs(def, etat.acquis)}
      ${record ? `<p class="defi-record">${record}</p>` : ''}
      ${boutonJouer(arg, etat, confirmer)}
    </section>`;
}

// --- La campagne ---------------------------------------------------------------------

/** Une mission dans la liste de son chapitre : son rang, son nom, ses étoiles — ou son cadenas, tant que la précédente n'est pas gagnée. */
function ligneDeMission(m) {
  const def = SCENARIOS[m.id];
  if (!def) return '';
  if (!m.ouverte) {
    return `<li class="mission fermee"><span class="mission-rang">${iconeSVG('cadenas', 14)}</span><span class="mission-texte"><b>${txt(def.nom)}</b><small>${txt`Gagne d’abord la mission ${m.rang - 1}`}</small></span></li>`;
  }
  return `<li class="mission ${m.gagnee ? 'gagnee' : 'a-jouer'}"><button class="btn mission-bouton" data-ecran="mission" data-arg="${m.id}">
        <span class="mission-rang">${m.rang}</span>
        <span class="mission-texte"><b>${txt(def.nom)}</b><small>${txt(def.resume)}</small></span>
        ${htmlEtoiles(m.acquis)}
      </button></li>`;
}

/** Ce qu'un chapitre donne, et si c'est déjà gagné : un mot de titre pour le chapitre fini, sa suite pour toutes ses étoiles. */
function htmlPrixDuChapitre(c) {
  const ligne = (piece, phrase) => (piece ? `<li class="${piece.acquise ? 'fait' : ''}"><i class="${piece.acquise ? 'pleine' : ''}">${iconeSVG('etoile', 16)}</i><span>${phrase}</span></li>` : '');
  const lignes = ligne(c.pieces.fini, c.pieces.fini ? txt`Chapitre fini : ${pieceEnPhrase(c.pieces.fini.id)}` : '')
    + ligne(c.pieces.etoiles, c.pieces.etoiles ? txt`Ses ${c.total} étoiles : ${pieceEnPhrase(c.pieces.etoiles.id)}` : '');
  return lignes ? `<ul class="campagne-prix">${lignes}</ul>` : '';
}

/** La campagne, en tête de l'écran : chaque chapitre, ses missions dans l'ordre, ce qu'il donne. */
function htmlCampagne(profil) {
  return etatDeLaCampagne(profil).map((c, i) => {
    const chapitre = CHAPITRES[c.id];
    if (!chapitre) return '';
    return `
    <section class="defi-carte campagne">
      <p class="defi-tete">${iconeSVG('ralliement', 26, 'inline')}<b>${txt`Chapitre ${i + 1} · ${txt(chapitre.nom)}`}</b><span class="campagne-compte">${iconeSVG('etoile', 16, 'inline')} ${c.etoiles}/${c.total}</span></p>
      <p class="defi-resume">${txt(chapitre.resume)}</p>
      <ol class="campagne-missions">${c.missions.map(ligneDeMission).join('')}</ol>
      ${htmlPrixDuChapitre(c)}
    </section>`;
  }).join('');
}

/** Où est une mission dans la campagne : son chapitre, son état, et la suivante — ou null si ce n'en est pas une. */
function placeDeMission(profil, id) {
  for (const c of etatDeLaCampagne(profil)) {
    const i = c.missions.findIndex((m) => m.id === id);
    if (i >= 0) return { chapitre: c, mission: c.missions[i], suivante: c.missions[i + 1] || null };
  }
  return null;
}

/** Ce que dit la narratrice — le prêtre ou la prêtresse du peuple du joueur : son portrait, son nom, ses phrases. */
function htmlRecit(def, moment) {
  const civ = peuple(), phrases = recitDe(def, moment, civ);
  if (!phrases.length) return '';
  const portrait = portraitDe('priest', civ);
  return `
    <div class="recit">
      ${portrait ? `<img class="recit-portrait" src="${portrait}" alt="" width="64" height="64">` : ''}
      <div class="recit-bulle"><b>${nomDe('priest', civ)}</b><p>${phrases.join(' ')}</p></div>
    </div>`;
}

/**
 * L'écran d'une mission : ce que la narratrice en dit, ses trois buts à étoile — le premier dit ce qu'il faut
 * faire —, et le bouton. Une mission encore fermée renvoie à la campagne.
 */
function ecranMission(profil, id, confirmer = '') {
  const def = SCENARIOS[id], place = def ? placeDeMission(profil, id) : null;
  if (!place || !place.mission.ouverte) { ecranDefis(profil); return; }
  const m = place.mission;
  const record = phraseDuRecord(def, m.record);
  o.montrer(txt`Mission ${m.rang} · ${txt(def.nom)}`, `
    ${htmlRecit(def, 'avant')}
    <section class="defi-carte">
      ${htmlButs(def, m.acquis)}
      ${record ? `<p class="defi-record">${record}</p>` : ''}
      ${boutonJouer(id, m, confirmer)}
    </section>`, { retour: 'defis', surPlace: !!confirmer });
}

/** L'écran « Campagne et défis » : la campagne, le défi du jour, puis les scénarios qui portent un nom. */
function ecranDefis(profil, confirmer = '') {
  const jour = o.jour();
  const duJour = carte({ id: 'defi', jour }, etatDeScenario(profil, 'defi', jour), confirmer);
  const autres = SCENARIOS_LIBRES.map((id) => carte({ id }, etatDeScenario(profil, id), confirmer)).join('');
  o.montrer(txt('Campagne et défis'), `
    <p class="hint">${iconeSVG('saison', 14, 'inline')} ${txt`Chaque étoile rapporte ${o.nombre(R.defis.points.etoile)} points de saison : une fois par jour pour le défi du jour, la première fois pour les autres.`}</p>
    ${htmlCampagne(profil)}
    ${duJour}
    <p class="defi-demain">${txt('Un nouveau défi chaque jour : la règle suit le jour de la semaine, la carte change.')}</p>
    ${autres}`, { surPlace: !!confirmer });
}

export const ECRANS_DES_DEFIS = {
  defis: (p) => ecranDefis(p),
  mission: (p, arg) => ecranMission(p, arg),
};

/** Les boutons de ces écrans. Rend vrai si l'action était pour eux. */
export function agirSurLesDefis(act, arg, i, profil) {
  if (act !== 'jouerScenario') return false;
  const ref = arg === 'defi' ? { id: 'defi', jour: o.jour() } : { id: arg };
  const mission = !!(SCENARIOS[arg] && SCENARIOS[arg].chapitre);
  // (main.js répond « confirmer » quand une partie dort : un second toucher est demandé, comme pour « Jouer ».)
  const reponse = o.lancer ? o.lancer(ref, i === '1') : 'refus';
  if (reponse === 'lancee') o.fermer();
  else if (mission) ecranMission(profil, arg, reponse === 'confirmer' ? arg : '');
  else ecranDefis(profil, reponse === 'confirmer' ? arg : '');
  return true;
}

/**
 * La tuile de l'accueil : « Campagne et défis », et en une ligne ce qui attend — la mission de campagne à jouer,
 * sinon le défi du jour —, avec les étoiles du défi du jour. Large, au-dessus des autres tuiles (voir css/defis.css).
 */
export function htmlTuileDesDefis(profil, jour) {
  const def = scenarioDe({ id: 'defi', jour });
  if (!def) return '';
  const etat = etatDeScenario(profil, 'defi', jour);
  // (La première mission ouverte et pas encore gagnée : c'est elle que la tuile annonce.)
  let aJouer = null;
  for (const c of etatDeLaCampagne(profil)) {
    aJouer = aJouer || c.missions.find((m) => m.ouverte && !m.gagnee && SCENARIOS[m.id]) || null;
  }
  const ligne = aJouer ? txt`Mission ${aJouer.rang} : ${txt(SCENARIOS[aJouer.id].nom)}` : txt`Aujourd’hui : ${txt(def.nom)}`;
  return `<button class="btn tuile-defis" data-ecran="defis">
      ${iconeSVG('etoile', 16, 'inline')}
      <span class="tuile-defis-texte"><b>${txt('Campagne et défis')}</b><small>${ligne}</small></span>
      ${htmlEtoiles(etat.acquis, 18)}
    </button>`;
}

/**
 * La fin d'une partie de scénario : ses trois buts — atteints à l'instant, déjà gagnés, manqués —, les points
 * de saison qu'elle donne, le record. Pour une mission de la campagne gagnée : la suite de l'histoire, ce que
 * le chapitre vient de donner, et la mission suivante. `evenements` : ceux d'appliquerScenario ; `civ` : le
 * peuple avec lequel la partie s'est jouée.
 */
export function htmlFinDeScenario(def, bilan, evenements, profil = null, civ = undefined) {
  const e = (evenements || []).find((x) => x.type === 'etoiles');
  if (!e) return '';
  // (Le joueur d'abord, comme à la fin d'une partie classée : son médaillon et son titre.)
  const joueur = profil ? `<p class="prog-fin-joueur">${htmlMedaillon(profil.blason)}<b>${titreDuBlason(profil.blason)}</b></p>` : '';
  const buts = butsDe(def, civ === undefined ? peuple() : civ);
  const lignes = buts.map((but, i) => {
    const classe = e.gagnees[i] ? 'fait' : e.acquis[i] ? 'fait ancien' : '';
    return `<li class="${classe}"><i class="${e.gagnees[i] || e.acquis[i] ? 'pleine' : ''}">${iconeSVG('etoile', 20)}</i><span>${but}</span></li>`;
  }).join('');
  const aPrendre = e.paliersGagnes > 0 ? ` <button class="btn small prog-attend" data-ecran="saison">${txt`palier ${e.palier} à prendre`}</button>` : '';
  const points = e.points > 0 ? `<p class="prog-fin-saison">${iconeSVG('saison', 16, 'inline')} ${txt`<b>+${e.points}</b> points de saison`}${aPrendre}</p>`
    : !e.payees ? `<p class="fin-note">${txt('Ce défi était celui d’hier : ses étoiles ne rapportent plus de points.')}</p>`
      : e.gagnees.some(Boolean) ? `<p class="fin-note">${txt('Ces étoiles t’avaient déjà rapporté leurs points.')}</p>` : '';
  const record = (evenements || []).find((x) => x.type === 'record');
  let phrase = '';
  if (record && def.record === 'vague') {
    phrase = record.ancien ? txt`<b>Nouveau record !</b> Vague ${record.valeur} — le précédent était la vague ${record.ancien}` : txt`<b>Premier record :</b> vague ${record.valeur}`;
  } else if (record && def.record === 'temps') {
    phrase = record.ancien ? txt`<b>Nouveau record !</b> ${o.duree(record.valeur)} — le précédent était de ${o.duree(record.ancien)}` : txt`<b>Premier record :</b> ${o.duree(record.valeur)}`;
  }
  // La campagne : la narratrice reprend la parole après une victoire, le chapitre donne ce qu'il doit, et la
  // mission suivante attend sous le doigt.
  let recit = '', gagne = '', suite = '';
  if (def.chapitre && bilan && bilan.victoire) {
    const phrases = recitDe(def, 'apres', civ === undefined ? peuple() : civ);
    recit = phrases.length ? `<p class="recit-apres">${phrases.join(' ')}</p>` : '';
    const pieces = (evenements || []).filter((x) => x.type === 'piece' && x.origine === 'campagne' && !x.doublon);
    gagne = pieces.map((x) => `<p class="prog-fin-saison campagne-gain">${iconeSVG('etoile', 16, 'inline')} ${txt`Tu gagnes ${pieceEnPhrase(x.piece)}. À porter depuis ton blason.`}</p>`).join('');
    const place = profil ? placeDeMission(profil, def.id) : null;
    if (place && place.suivante && place.suivante.ouverte && SCENARIOS[place.suivante.id]) {
      suite = `<button class="btn primary campagne-suite" data-ecran="mission" data-arg="${place.suivante.id}">${txt`Mission ${place.suivante.rang} : ${txt(SCENARIOS[place.suivante.id].nom)}`}</button>`;
    }
  }
  return `
    <div class="prog-fin defi-fin">
      ${joueur}
      <p class="defi-fin-titre"><b>${titreDeScenario(def)}</b>${htmlEtoiles(e.acquis, 20)}</p>
      ${recit}
      ${suite}
      <ul class="defi-buts">${lignes}</ul>
      ${points}
      ${gagne}
      ${phrase ? `<p class="record">${phrase}</p>` : ''}
    </div>`;
}

/** Les règles et les scénarios connus de ces écrans (pour les essais). */
export const CONNUS = { regles: Object.keys(REGLES), scenarios: Object.keys(SCENARIOS) };
