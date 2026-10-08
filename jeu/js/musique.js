// ---------------------------------------------------------------------------
// Musique de fond. Trois ambiances, un morceau chacune (assets/musique/*.mp4,
// de l'AAC mono ; domaine public, CC0 : voir assets/musique/SOURCES.md) :
//   menu     — l'accueil ;
//   partie   — la partie, en boucle ;
//   bataille — prend le relais quand un combat commence, s'efface quand il
//              finit, et la musique de la partie revient là où elle en était.
// Les morceaux passent par le même chemin que les bruitages (js/audio.js) :
// lus en entier, décodés par Web Audio, joués en boucle. C'est le seul chemin
// éprouvé sur iPhone, où le volume d'une balise <audio> ne se règle pas — donc
// pas de fondu. Un morceau décodé pèse lourd en mémoire (une vingtaine de Mo
// par minute) : ceux qui ne servent pas à la scène en cours sont rendus.
// ---------------------------------------------------------------------------

/** Les morceaux. `gain` met les trois au même niveau d'écoute, sous les bruitages. */
export const MORCEAUX = {
  menu: { gain: 0.3 },
  partie: { gain: 0.22 },
  bataille: { gain: 0.27 },
};

/** Les scènes, et les morceaux que chacune garde en mémoire. */
export const SCENES = { silence: [], menu: ['menu'], partie: ['partie', 'bataille'] };

/** Le chemin d'un morceau. */
export const cheminDeLaMusique = (nom) => `assets/musique/${nom}.mp4`;

/**
 * La bascule en bataille, en secondes de temps réel. Un combat commence quand
 * `coups` coups sont échangés en moins de `fenetre` (un loup, une flèche de
 * tour, une escarmouche d'éclaireurs ne suffisent pas) ; il est fini quand
 * plus rien ne s'échange depuis `calme`. `entree` et `sortie` : les fondus.
 */
export const BATAILLE = { coups: 6, fenetre: 5, calme: 8, entree: 1, sortie: 3.5 };

/** Les fondus des changements de scène. */
const FONDU = { arrivee: 1.5, depart: 1.2 };

/** Dit, coup après coup, si une bataille est en cours. Ne connaît que des instants : il se teste sans navigateur. */
export class VeilleurDeBataille {
  constructor(regles = BATAILLE) {
    this.regles = regles;
    this.coups = [];
    this.enCours = false;
  }

  /** Un coup vient d'être porté ou reçu, à l'instant `t` (secondes). */
  coup(t) {
    this.coups.push(t);
    const depuis = t - this.regles.fenetre;
    while (this.coups.length && this.coups[0] < depuis) this.coups.shift();
    if (this.coups.length >= this.regles.coups) this.enCours = true;
  }

  /** Y a-t-il bataille à l'instant `t` ? */
  bataille(t) {
    if (this.enCours && (!this.coups.length || t - this.coups[this.coups.length - 1] >= this.regles.calme)) {
      this.enCours = false;
      this.coups.length = 0;
    }
    return this.enCours;
  }

  oublier() { this.coups.length = 0; this.enCours = false; }
}

/** Le morceau qu'on doit entendre : rien, ou un seul. */
export function morceauVoulu(scene, bataille) {
  if (scene === 'menu') return 'menu';
  if (scene === 'partie') return bataille ? 'bataille' : 'partie';
  return null;
}

/** Le volume d'une voie à l'instant `t`, au milieu d'un fondu ou non. */
export function niveauDe(voie, t) {
  if (!voie.duree) return voie.cible;
  const part = Math.max(0, Math.min(1, (t - voie.t0) / voie.duree));
  return voie.de + (voie.cible - voie.de) * part;
}

const CLE = 'aem.musique';

/** Le joueur veut-il de la musique ? (Oui tant qu'il n'a pas dit non.) */
export function musiqueVoulue() {
  try { return localStorage.getItem(CLE) !== 'non'; } catch { return true; }
}

export class Musique {
  /** `audio` : le moteur des bruitages (js/audio.js) — son contexte, et son interrupteur, qui coupe aussi la musique. */
  constructor(audio) {
    this.audio = audio;
    this.voulue = musiqueVoulue();
    this.scene = 'silence';
    this.veilleur = new VeilleurDeBataille();
    this.bataille = false;
    this.tampons = new Map();    // morceau → AudioBuffer décodé
    this.demandes = new Set();   // morceaux en cours de chargement
    this.voies = new Map();      // morceau → { source, volume, … } en train de jouer
    this.horloge = () => performance.now() / 1000;   // le temps réel, en secondes
  }

  /** Change de scène : 'menu', 'partie' ou 'silence'. */
  mettre(scene) {
    if (!SCENES[scene]) return;
    if (scene !== this.scene) { this.veilleur.oublier(); this.bataille = false; }
    this.scene = scene;
    this.accorder();
  }

  /** Le joueur coupe ou remet la musique ; son choix est retenu. */
  vouloir(oui) {
    this.voulue = !!oui;
    try { localStorage.setItem(CLE, oui ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
    this.accorder();
  }

  /** Un coup de combat qui concerne le joueur vient de tomber. */
  coup() {
    if (this.scene === 'partie') this.veilleur.coup(this.horloge());
  }

  /** À appeler à chaque image d'une partie : fait entrer et sortir la musique de bataille. */
  suivre() {
    const bataille = this.scene === 'partie' && this.veilleur.bataille(this.horloge());
    if (bataille === this.bataille) return;
    this.bataille = bataille;
    this.accorder();
  }

  /**
   * Met ce qui joue en accord avec ce qu'on veut entendre. Sans effet tant que
   * le contexte audio n'existe pas (il naît au premier geste du joueur) : à
   * rappeler alors — AudioEngine.resume() le fait.
   */
  accorder() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.audio.sortie) return;
    const garder = this.voulue ? SCENES[this.scene] : [];
    for (const nom of garder) this.charger(nom);
    const voulu = this.voulue ? morceauVoulu(this.scene, this.bataille) : null;
    const t = ctx.currentTime;
    for (const nom of Object.keys(MORCEAUX)) {
      const voie = this.voies.get(nom);
      if (nom === voulu) {
        if (!this.tampons.has(nom)) continue;   // il arrive : charger() rappellera accorder()
        // La bataille repart du début à chaque combat. Une voie déjà là, c'est la
        // musique de la partie restée en sourdine : elle revient au pas de la bataille qui sort.
        const duree = nom === 'bataille' ? BATAILLE.entree : voie ? BATAILLE.sortie : FONDU.arrivee;
        this.fondre(voie || this.lancer(nom), MORCEAUX[nom].gain, t, duree);
      } else if (voie) {
        // La musique de la partie se tait pendant la bataille sans s'arrêter : elle reprendra où elle en est.
        const enSourdine = nom === 'partie' && garder.includes(nom);
        const duree = enSourdine ? BATAILLE.entree : nom === 'bataille' && garder.includes(nom) ? BATAILLE.sortie : FONDU.depart;
        this.fondre(voie, 0, t, duree);
        if (!enSourdine) this.arreter(nom, t + duree);
      }
      // Un morceau qui ne sert pas à cette scène rend sa mémoire.
      if (!garder.includes(nom)) this.tampons.delete(nom);
    }
  }

  /** Va chercher et décode un morceau, une fois, sans rien bloquer ; s'il manque, la scène reste sans musique. */
  charger(nom) {
    if (this.tampons.has(nom) || this.demandes.has(nom) || typeof fetch !== 'function') return;
    this.demandes.add(nom);
    const ctx = this.audio.ctx;
    fetch(cheminDeLaMusique(nom))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      // (Forme à rappels : les Safari d'avant 14.5 ne rendent pas de promesse.)
      .then((octets) => new Promise((oui, non) => { ctx.decodeAudioData(octets, oui, non); }))
      .then((tampon) => {
        this.demandes.delete(nom);
        // (La scène a pu changer pendant le chargement : on ne garde que ce qui sert.)
        if (!this.voulue || !SCENES[this.scene].includes(nom)) return;
        this.tampons.set(nom, tampon);
        this.accorder();
      })
      .catch(() => { this.demandes.delete(nom); });
  }

  /** Lance un morceau en boucle, muet : le fondu le fait entendre. */
  lancer(nom) {
    const ctx = this.audio.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.tampons.get(nom);
    source.loop = true;
    const volume = ctx.createGain();
    volume.gain.value = 0;
    source.connect(volume).connect(this.audio.sortie);
    source.start();
    const voie = { source, volume, de: 0, cible: 0, t0: 0, duree: 0 };
    this.voies.set(nom, voie);
    return voie;
  }

  /**
   * Amène le volume d'une voie à `cible` en `duree` secondes, depuis là où il
   * est. (Où il est, on le calcule : tous les navigateurs ne le donnent pas
   * pendant un fondu.) Demander deux fois la même cible ne relance rien.
   */
  fondre(voie, cible, t, duree) {
    if (voie.cible === cible && voie.duree) return;
    const depuis = niveauDe(voie, t);
    Object.assign(voie, { de: depuis, cible, t0: t, duree });
    const g = voie.volume.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(depuis, t);
    g.linearRampToValueAtTime(cible, t + duree);
  }

  /** Arrête un morceau à l'instant `quand` (la fin de son fondu) et oublie sa voie. */
  arreter(nom, quand) {
    const voie = this.voies.get(nom);
    if (!voie) return;
    this.voies.delete(nom);
    try { voie.source.stop(quand); } catch { /* déjà arrêtée */ }
    voie.source.onended = () => { try { voie.volume.disconnect(); } catch { /* déjà débranchée */ } };
  }
}
