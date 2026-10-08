// ---------------------------------------------------------------------------
// Sons du jeu. Des échantillons (assets/sons/*.m4a, tirés des paquets de
// Kenney, licence CC0 : voir assets/sons/SOURCES.md) joués par Web Audio. Tant
// qu'un échantillon n'est pas arrivé — première visite hors ligne, navigateur
// qui ne sait pas le décoder —, le son de synthèse d'origine sert de repli :
// le jeu ne dépend d'aucun fichier pour se faire entendre.
// ---------------------------------------------------------------------------

/**
 * Chaque son du jeu. `fichiers` : ses échantillons, l'un est tiré au hasard à
 * chaque fois ; `avec` : ceux qui le doublent, un instant après (un mur qui
 * tombe : le bois, puis la masse) ; `gain` : son volume ; `ecart` : le temps
 * minimal entre deux, en millisecondes (trente archers ne doivent pas
 * saturer) ; `hauteur` : de combien sa hauteur varie d'un coup à l'autre (dix
 * coups de hache identiques sonnent comme une machine).
 */
export const BANQUE = {
  click: { fichiers: ['clic-1', 'clic-2'], gain: 0.5 },
  select: { fichiers: ['selection-1', 'selection-2'], gain: 0.5 },
  order: { fichiers: ['ordre-1', 'ordre-2'], gain: 0.55 },
  place: { fichiers: ['pose-1', 'pose-2'], gain: 0.6 },
  built: { fichiers: ['construit-1'], gain: 0.6 },
  trained: { fichiers: ['formee-1'], gain: 0.4, ecart: 220 },
  melee: { fichiers: ['epee-1', 'epee-2', 'epee-3', 'epee-4', 'epee-5'], gain: 0.42, ecart: 110, hauteur: 0.08 },
  shoot: { fichiers: ['tir-1', 'tir-2'], gain: 0.5, ecart: 130, hauteur: 0.1 },
  destroyed: { fichiers: ['effondrement-1'], avec: ['effondrement-2'], gain: 0.8, ecart: 200 },
  death: { fichiers: ['chute-1', 'chute-2', 'chute-3'], gain: 0.45, ecart: 160, hauteur: 0.08 },
  alert: { fichiers: ['cloche-1', 'cloche-2'], gain: 0.7, ecart: 900 },
  age: { fichiers: ['age-1'], gain: 0.7 },
  victory: { fichiers: ['victoire-1'], gain: 0.8 },
  defeat: { fichiers: ['defaite-1'], gain: 0.8 },
  error: { fichiers: ['erreur-1'], gain: 0.45 },
  // Les gestes des ouvriers (voir Renderer.eclatsDeTravail) : discrets, ils font le fond sonore d'une cité.
  chop: { fichiers: ['hache-1', 'hache-2', 'hache-3'], gain: 0.3, ecart: 240, hauteur: 0.1 },
  mine: { fichiers: ['pioche-1', 'pioche-2', 'pioche-3', 'pioche-4'], gain: 0.28, ecart: 300, hauteur: 0.08 },
  pick: { fichiers: ['cueillette-1', 'cueillette-2'], gain: 0.3, ecart: 420, hauteur: 0.1 },
  hammer: { fichiers: ['marteau-1', 'marteau-2', 'marteau-3'], gain: 0.3, ecart: 230, hauteur: 0.1 },
};

/** Le chemin d'un échantillon. */
export const cheminDuSon = (nom) => `assets/sons/${nom}.m4a`;

/** Tous les échantillons que la banque demande, une fois chacun. */
export function fichiersDeLaBanque() {
  return [...new Set(Object.values(BANQUE).flatMap((s) => [...s.fichiers, ...(s.avec || [])]))];
}

const VOLUME_SYNTHESE = 0.35;   // les ondes de synthèse sont pleines : elles passent par un volume à part
const VOIX_MAX = 14;            // au-delà, un son de plus n'ajoute que de la bouillie

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastPlayed = new Map();
    this.tampons = new Map();   // nom d'échantillon → AudioBuffer décodé
    this.voix = 0;              // échantillons en train de jouer
    this.demandes = false;      // le chargement des échantillons a été lancé
  }

  /** À appeler depuis un geste utilisateur (politique autoplay des navigateurs). */
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this.enabled = false; return; }
      this.ctx = new Ctx();
      this.sortie = this.ctx.createGain();          // l'interrupteur du son
      this.sortie.gain.value = this.enabled ? 1 : 0;
      this.sortie.connect(this.ctx.destination);
      this.master = this.ctx.createGain();          // la synthèse
      this.master.gain.value = VOLUME_SYNTHESE;
      this.master.connect(this.sortie);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.charger();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.sortie) this.sortie.gain.value = on ? 1 : 0;
  }

  /**
   * Va chercher et décode les échantillons, une fois, sans rien bloquer : un
   * fichier qui manque ou ne se décode pas laisse simplement sa place au son
   * de synthèse.
   */
  charger() {
    if (this.demandes || !this.ctx || typeof fetch !== 'function') return;
    this.demandes = true;
    for (const nom of fichiersDeLaBanque()) {
      fetch(cheminDuSon(nom))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        // (Forme à rappels : les Safari d'avant 14.5 ne rendent pas de promesse.)
        .then((octets) => new Promise((oui, non) => { this.ctx.decodeAudioData(octets, oui, non); }))
        .then((tampon) => { this.tampons.set(nom, tampon); })
        .catch(() => { /* repli sur la synthèse */ });
    }
  }

  /** Limite les répétitions : 30 archers qui tirent ne doivent pas saturer. */
  throttle(name, ms) {
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  /** Joue un échantillon décodé. */
  lancer(nom, gain, hauteur = 0, retard = 0) {
    if (this.voix >= VOIX_MAX) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.tampons.get(nom);
    if (hauteur) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * hauteur;
    const volume = this.ctx.createGain();
    volume.gain.value = gain;
    source.connect(volume).connect(this.sortie);
    this.voix++;
    source.onended = () => { this.voix--; };
    source.start(this.ctx.currentTime + retard);
  }

  /** Joue l'un des échantillons de ce son ; false si aucun n'est encore là. */
  echantillon(son) {
    const prets = son.fichiers.filter((f) => this.tampons.has(f));
    if (!prets.length) return false;
    this.lancer(prets[Math.floor(Math.random() * prets.length)], son.gain, son.hauteur);
    for (const f of son.avec || []) if (this.tampons.has(f)) this.lancer(f, son.gain, 0, 0.05);
    return true;
  }

  tone({ freq = 440, type = 'sine', duration = 0.15, gain = 0.3, slide = 0, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  noise({ duration = 0.18, gain = 0.25, filter = 1200, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = filter;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(bp).connect(env).connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const son = BANQUE[name];
    if (son && son.ecart && !this.throttle(name, son.ecart)) return;
    if (son && this.echantillon(son)) return;
    this.synthese(name);
  }

  /** Les sons d'origine, fabriqués à la volée : le repli de chaque échantillon. Les gestes des ouvriers n'en ont pas. */
  synthese(name) {
    switch (name) {
      case 'click': this.tone({ freq: 620, type: 'triangle', duration: 0.06, gain: 0.16 }); break;
      case 'select': this.tone({ freq: 760, type: 'triangle', duration: 0.07, gain: 0.14, slide: 180 }); break;
      case 'order':
        this.tone({ freq: 480, type: 'square', duration: 0.05, gain: 0.1 });
        this.tone({ freq: 720, type: 'square', duration: 0.06, gain: 0.08, delay: 0.05 });
        break;
      case 'place': this.noise({ duration: 0.22, gain: 0.2, filter: 800 }); break;
      case 'built':
        this.tone({ freq: 520, type: 'sine', duration: 0.14, gain: 0.2 });
        this.tone({ freq: 780, type: 'sine', duration: 0.18, gain: 0.18, delay: 0.1 });
        break;
      case 'trained': this.tone({ freq: 660, type: 'sine', duration: 0.1, gain: 0.14 }); break;
      case 'melee': this.noise({ duration: 0.1, gain: 0.16, filter: 2600 }); break;
      case 'shoot': this.tone({ freq: 320, type: 'sawtooth', duration: 0.07, gain: 0.08, slide: 420 }); break;
      case 'destroyed': this.noise({ duration: 0.4, gain: 0.3, filter: 500 }); break;
      case 'alert':
        this.tone({ freq: 380, type: 'square', duration: 0.16, gain: 0.2 });
        this.tone({ freq: 300, type: 'square', duration: 0.22, gain: 0.2, delay: 0.16 });
        break;
      case 'age':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.3, gain: 0.18, delay: i * 0.13 }));
        break;
      case 'victory':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.45, gain: 0.2, delay: i * 0.16 }));
        break;
      case 'defeat':
        [440, 370, 294, 220].forEach((f, i) => this.tone({ freq: f, type: 'sine', duration: 0.5, gain: 0.2, delay: i * 0.2 }));
        break;
      case 'error': this.tone({ freq: 200, type: 'square', duration: 0.12, gain: 0.14 }); break;
      default: break;
    }
  }
}
