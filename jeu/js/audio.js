// ---------------------------------------------------------------------------
// Sons générés à la volée (Web Audio) : pas un seul fichier à télécharger.
// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastPlayed = new Map();
  }

  /** À appeler depuis un geste utilisateur (politique autoplay des navigateurs). */
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this.enabled = false; return; }
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.35 : 0;
  }

  /** Limite les répétitions : 30 archers qui tirent ne doivent pas saturer. */
  throttle(name, ms) {
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(name, now);
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
      case 'trained': if (this.throttle('trained', 220)) this.tone({ freq: 660, type: 'sine', duration: 0.1, gain: 0.14 }); break;
      case 'melee': if (this.throttle('melee', 110)) this.noise({ duration: 0.1, gain: 0.16, filter: 2600 }); break;
      case 'shoot': if (this.throttle('shoot', 130)) this.tone({ freq: 320, type: 'sawtooth', duration: 0.07, gain: 0.08, slide: 420 }); break;
      case 'destroyed': if (this.throttle('destroyed', 200)) this.noise({ duration: 0.4, gain: 0.3, filter: 500 }); break;
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
    }
  }
}
