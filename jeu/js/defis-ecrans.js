// ---------------------------------------------------------------------------
// Les écrans des défis : la tuile de l'accueil, l'écran « Défis » (le défi du
// jour, puis les scénarios qui portent un nom) et ce que la fin d'une partie
// de scénario annonce. Branché sur les écrans de la progression
// (js/progression-ecrans.js), comme ceux des collections.
//
// Aucune règle ici : les scénarios sont dans js/scenarios.js, ce qu'ils
// donnent dans js/progression.js (appliquerScenario).
// ---------------------------------------------------------------------------

import { PROGRESSION as R } from './progression-config.js';
import { etatDeScenario } from './progression.js';
import { SCENARIOS, REGLES, scenarioDe, butsDe, nomDuChef } from './scenarios.js';
import { GAME_MODES } from './config.js';
import { iconeSVG } from './icones.js';
import { htmlMedaillon, titreDuBlason } from './blason.js';
import { txt } from './langue.js';

/** Les outils prêtés par js/progression-ecrans.js : montrer, fermer, nombre, jour, et `lancer` (main.js). */
let o = null;
export function brancherDefis(outils) { o = outils; }

const minutes = (secondes) => Math.round(secondes / 60);

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
  if (def.chef) return txt`${nomDuChef(def)} · ${o.nombre(def.chef.vie)} points de vie · ${minutes(def.but.avant)} min`;
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

/** La carte d'un scénario : ce qu'il est, ses trois buts, ce qu'ils rapportent, et le bouton. */
function carte(ref, etat, confirmer) {
  const def = scenarioDe(ref);
  if (!def) return '';
  const buts = butsDe(def);
  const arg = def.id === 'defi' ? 'defi' : def.id;
  const record = phraseDuRecord(def, etat.record);
  return `
    <section class="defi-carte">
      <p class="defi-tete">${iconeSVG(def.icone || 'attaquer', 26, 'inline')}<b>${titreDeScenario(def)}</b>${htmlEtoiles(etat.acquis)}</p>
      <p class="defi-resume">${txt(def.resume)}</p>
      <p class="defi-bref">${enBref(def)}</p>
      <ul class="defi-buts">${buts.map((but, i) => `
        <li class="${etat.acquis[i] ? 'fait' : ''}"><i class="${etat.acquis[i] ? 'pleine' : ''}">${iconeSVG('etoile', 18)}</i><span>${but}</span><b>${etat.acquis[i] ? '' : `+${o.nombre(R.defis.points.etoile)}`}</b></li>`).join('')}
      </ul>
      ${record ? `<p class="defi-record">${record}</p>` : ''}
      <button class="btn ${confirmer === arg ? 'arme' : 'primary'}" data-act="jouerScenario" data-arg="${arg}" ${confirmer === arg ? 'data-i="1"' : ''}>${confirmer === arg ? txt('Effacer la partie en cours ?') : etat.etoiles === 3 ? txt('Rejouer') : txt('Jouer')}</button>
    </section>`;
}

/** L'écran « Défis » : le défi du jour, puis les scénarios qui portent un nom. */
function ecranDefis(profil, confirmer = '') {
  const jour = o.jour();
  const duJour = carte({ id: 'defi', jour }, etatDeScenario(profil, 'defi', jour), confirmer);
  const autres = Object.keys(SCENARIOS).map((id) => carte({ id }, etatDeScenario(profil, id), confirmer)).join('');
  o.montrer(txt('Défis'), `
    <p class="hint">${iconeSVG('saison', 14, 'inline')} ${txt`Chaque étoile rapporte ${o.nombre(R.defis.points.etoile)} points de saison : une fois par jour pour le défi du jour, la première fois pour les autres.`}</p>
    ${duJour}
    <p class="defi-demain">${txt('Un nouveau défi chaque jour : la règle suit le jour de la semaine, la carte change.')}</p>
    ${autres}`, { surPlace: !!confirmer });
}

export const ECRANS_DES_DEFIS = {
  defis: (p) => ecranDefis(p),
};

/** Les boutons de l'écran « Défis ». Rend vrai si l'action était pour lui. */
export function agirSurLesDefis(act, arg, i, profil) {
  if (act !== 'jouerScenario') return false;
  const ref = arg === 'defi' ? { id: 'defi', jour: o.jour() } : { id: arg };
  // (main.js répond « confirmer » quand une partie dort : un second toucher est demandé, comme pour « Jouer ».)
  const reponse = o.lancer ? o.lancer(ref, i === '1') : 'refus';
  if (reponse === 'confirmer') ecranDefis(profil, arg);
  else if (reponse === 'lancee') o.fermer();
  else ecranDefis(profil);
  return true;
}

/**
 * La tuile de l'accueil : « Défis », et le défi du jour en une ligne avec ses étoiles. Large, au-dessus des
 * autres tuiles (voir css/boite.css).
 */
export function htmlTuileDesDefis(profil, jour) {
  const def = scenarioDe({ id: 'defi', jour });
  if (!def) return '';
  const etat = etatDeScenario(profil, 'defi', jour);
  return `<button class="btn tuile-defis" data-ecran="defis">
      ${iconeSVG('etoile', 16, 'inline')}
      <span class="tuile-defis-texte"><b>${txt('Défis')}</b><small>${txt`Aujourd’hui : ${txt(def.nom)}`}</small></span>
      ${htmlEtoiles(etat.acquis, 18)}
    </button>`;
}

/**
 * La fin d'une partie de scénario : ses trois buts — atteints à l'instant, déjà gagnés, manqués —, les points
 * de saison qu'elle donne, le record. `evenements` : ceux d'appliquerScenario.
 */
export function htmlFinDeScenario(def, bilan, evenements, profil = null) {
  const e = (evenements || []).find((x) => x.type === 'etoiles');
  if (!e) return '';
  // (Le joueur d'abord, comme à la fin d'une partie classée : son médaillon et son titre.)
  const joueur = profil ? `<p class="prog-fin-joueur">${htmlMedaillon(profil.blason)}<b>${titreDuBlason(profil.blason)}</b></p>` : '';
  const buts = butsDe(def);
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
  return `
    <div class="prog-fin defi-fin">
      ${joueur}
      <p class="defi-fin-titre"><b>${titreDeScenario(def)}</b>${htmlEtoiles(e.acquis, 20)}</p>
      <ul class="defi-buts">${lignes}</ul>
      ${points}
      ${phrase ? `<p class="record">${phrase}</p>` : ''}
    </div>`;
}

/** Les règles et les scénarios connus de cet écran (pour les essais). */
export const CONNUS = { regles: Object.keys(REGLES), scenarios: Object.keys(SCENARIOS) };
