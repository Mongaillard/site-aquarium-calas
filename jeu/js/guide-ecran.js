// ---------------------------------------------------------------------------
// L'écran de la partie guidée : la bulle de consigne, le doigt qui montre où
// toucher, et la voix. La logique est dans js/guide.js ; ici, on ne fait que
// montrer et dire.
// ---------------------------------------------------------------------------

import { cheminDeLaVoix, LANGUES_DITES } from './guide.js';
import { txt, LANGUE } from './langue.js';

/** Où est le bout du doigt dans le dessin (assets/guide/doigt.webp), en fraction de sa largeur et de sa hauteur. */
const BOUT_DU_DOIGT = { x: 0.015, y: 0.215 };
/** La marge qui garde le doigt à l'écran quand sa cible est hors champ. */
const MARGE = 30;

const html = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class EcranDuGuide {
  /**
   * `jeu` : la partie (son canevas, sa caméra, son interface, son moteur audio).
   * `sorties` : `passer()` (le joueur quitte le guide), `jouer()` et `accueil()` (les deux boutons de la fin),
   * `duree()` (les minutes de la première partie, 0 si elle n'a pas de chronomètre).
   */
  constructor(jeu, guide, sorties) {
    this.jeu = jeu;
    this.guide = guide;
    this.sorties = sorties;
    this.texte = null;
    this.geste = '';
    this.degagee = '';   // la dernière cible vers laquelle la vue est allée d'elle-même
    const racine = document.createElement('div');
    racine.id = 'guide';
    racine.innerHTML = `
      <div class="guide-voile hidden"></div>
      <div class="guide-bulle" role="status" aria-live="polite">
        <div class="guide-tete">
          <span class="guide-pas"></span>
          <button class="guide-passer" type="button">${html(txt('Passer le guide'))}</button>
        </div>
        <p class="guide-texte"></p>
        <p class="guide-cadeau hidden"></p>
        <div class="guide-boutons"></div>
      </div>
      <div class="guide-anneau hidden"></div>
      <div class="guide-trace hidden"></div>
      <div class="guide-doigt hidden"><div class="guide-main"><img src="assets/guide/doigt.webp" alt="" decoding="async"></div></div>`;
    document.body.appendChild(racine);
    this.racine = racine;
    this.noeuds = {
      voile: racine.querySelector('.guide-voile'), bulle: racine.querySelector('.guide-bulle'),
      pas: racine.querySelector('.guide-pas'), texte: racine.querySelector('.guide-texte'), cadeau: racine.querySelector('.guide-cadeau'),
      boutons: racine.querySelector('.guide-boutons'), anneau: racine.querySelector('.guide-anneau'),
      trace: racine.querySelector('.guide-trace'), doigt: racine.querySelector('.guide-doigt'),
    };
    racine.querySelector('.guide-passer').addEventListener('click', () => { jeu.audio.play('click'); sorties.passer(); });
    document.getElementById('hud').classList.add('avec-guide');
  }

  /**
   * Une étape commence : son bouton s'il y en a un, et sa phrase dite. `cadeau` : à la dernière étape, la phrase
   * du coffre de recrue qui vient d'être donné (rien s'il l'avait déjà été) — il s'ouvre d'ici.
   */
  etape(etape, cadeau = null) {
    const { noeuds, guide, jeu } = this;
    noeuds.pas.textContent = `${guide.numero + 1} / ${guide.total}`;
    const boutons = [];
    if (etape.suite) boutons.push({ mot: etape.suite(), fait: () => guide.continuer() });
    if (etape.fin) {
      const minutes = this.sorties.duree ? this.sorties.duree() : 0;
      // (Le coffre s'ouvre par l'écran des coffres : c'est `data-ecran` qui l'appelle, js/progression-ecrans.js.)
      if (cadeau) boutons.push({ mot: txt('Ouvrir mon coffre'), ecran: 'coffres', fait: () => {} });
      boutons.push({ mot: minutes ? txt`Jouer ma première partie · ${minutes} min` : txt('Jouer ma première partie'), second: !!cadeau, fait: () => this.sorties.jouer() });
      boutons.push({ mot: txt('Retour à l’accueil'), discret: true, fait: () => this.sorties.accueil() });
    }
    noeuds.cadeau.textContent = cadeau || '';
    noeuds.cadeau.classList.toggle('hidden', !cadeau);
    noeuds.boutons.innerHTML = boutons.map((b, i) => `<button type="button" class="btn ${b.discret ? 'ghost' : b.second ? 'second' : 'primary'}" data-bouton="${i}"${b.ecran ? ` data-ecran="${b.ecran}"` : ''}>${html(b.mot)}</button>`).join('');
    noeuds.boutons.querySelectorAll('[data-bouton]').forEach((noeud) => {
      noeud.addEventListener('click', () => { jeu.audio.resume(); jeu.audio.play('click'); boutons[Number(noeud.dataset.bouton)].fait(); });
    });
    // Une étape à lire arrête le doigt sur la carte : on lit, puis on continue.
    const aLire = !!(etape.suite || etape.fin);
    noeuds.voile.classList.toggle('hidden', !aLire);
    noeuds.bulle.classList.toggle('a-lire', aLire);
    this.racine.querySelector('.guide-passer').classList.toggle('hidden', !!etape.fin);
    this.texte = null;
    this.dire(etape);
    this.dessiner();
  }

  /** La phrase de l'étape, dans la langue du joueur si elle y existe : sinon le texte suffit. */
  dire(etape) {
    const audio = this.jeu.audio;
    if (!audio.dire) return;
    if (etape.voix && LANGUES_DITES.includes(LANGUE)) audio.dire(cheminDeLaVoix(LANGUE, etape.voix)); else audio.taire();
  }

  /**
   * Ce que le joueur voit de la carte : entre la bulle, en haut, et la barre
   * des ouvriers, en bas (en pixels du canevas). La caméra l'apprend : le bord
   * de la carte peut alors sortir de sous les panneaux.
   */
  zoneLibre() {
    const cadre = this.jeu.canvas.getBoundingClientRect();
    const barre = document.getElementById('worker-bar');
    const haut = this.noeuds.bulle.classList.contains('a-lire') ? 0 : this.noeuds.bulle.getBoundingClientRect().bottom - cadre.top + 10;
    const bas = (barre && barre.getClientRects().length ? barre.getBoundingClientRect().top : cadre.bottom) - cadre.top - 10;
    this.jeu.camera.hautOccupe = Math.max(0, haut);
    this.jeu.camera.basOccupe = Math.max(0, cadre.height - bas);
    return { haut, bas, milieu: (haut + bas) / 2, hauteur: cadre.height };
  }

  /** Amène un point de la carte au milieu de la zone libre. */
  amener(point) {
    const zone = this.zoneLibre(), camera = this.jeu.camera;
    camera.centerOn(point.x, point.y + (zone.hauteur / 2 - zone.milieu) / camera.zoom);
  }

  /**
   * Une cible de la carte cachée par un panneau, ou hors de l'écran : la vue
   * y va d'elle-même, une fois par cible — ensuite le joueur reste libre de
   * déplacer la carte, le doigt le suit au bord de l'écran.
   */
  degager(cible) {
    const zone = this.zoneLibre();
    if (!cible || !cible.monde) return;
    const milieu = cible.vers ? { x: (cible.monde.x + cible.vers.x) / 2, y: (cible.monde.y + cible.vers.y) / 2 } : cible.monde;
    // (La clé porte aussi le bas de la zone : un panneau qui s'ouvre sous la cible la fait dégager de nouveau.)
    const cle = `${this.guide.numero}:${Math.round(milieu.x)}:${Math.round(milieu.y)}:${Math.round(zone.bas / 24)}`;
    if (cle === this.degagee) return;
    const camera = this.jeu.camera, marge = 44;
    const visibles = [cible.monde, cible.vers || cible.monde].every((p) => {
      const s = camera.worldToScreen(p.x, p.y);
      return s.y > zone.haut + marge && s.y < zone.bas - marge && s.x > marge && s.x < camera.viewWidth - marge;
    });
    this.degagee = cle;
    if (!visibles) this.amener(milieu);
  }

  /** Le point de l'écran qu'une cible désigne, ou rien si elle n'y est pas. */
  point(cible) {
    if (cible.monde) {
      const cadre = this.jeu.canvas.getBoundingClientRect();
      const versEcran = (p) => { const s = this.jeu.camera.worldToScreen(p.x, p.y); return { x: cadre.left + s.x, y: cadre.top + s.y }; };
      return { ...versEcran(cible.monde), ...(cible.vers ? { vers: versEcran(cible.vers) } : {}) };
    }
    let noeud = null;
    if (cible.element) noeud = document.querySelector(cible.element);
    else if (cible.commande) {
      const i = (this.jeu.ui.commandButtons || []).findIndex(cible.commande);
      noeud = i >= 0 ? this.jeu.ui.commandNodes[i] : null;
    }
    if (!noeud || !noeud.getClientRects().length) return null;
    const r = noeud.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** À chaque image : le texte s'il a changé, et le doigt là où est sa cible. */
  dessiner() {
    const { noeuds, guide, jeu } = this;
    // Menu de pause, écran de fin : le guide s'efface.
    const cache = jeu.paused || !!jeu.world.gameOver || guide.fini;
    this.racine.classList.toggle('hidden', cache);
    if (cache) return;

    const texte = guide.texte();
    if (texte !== this.texte) {
      this.texte = texte;
      noeuds.texte.textContent = texte;
      // (Les notifications de la partie se rangent sous la bulle.)
      document.getElementById('hud').style.setProperty('--guide-bas', `${Math.round(noeuds.bulle.getBoundingClientRect().bottom)}px`);
    }

    const cible = guide.cible();
    this.degager(cible);
    const geste = (cible && cible.geste) || 'toucher';
    let point = null;
    if (cible && geste === 'glisser') point = { x: window.innerWidth / 2, y: window.innerHeight * 0.56 };
    else if (cible) point = this.point(cible);
    const montre = !!point;
    noeuds.doigt.classList.toggle('hidden', !montre);
    noeuds.anneau.classList.toggle('hidden', !montre || geste === 'glisser' || geste === 'rectangle');
    noeuds.trace.classList.toggle('hidden', !montre || geste !== 'rectangle');
    if (!montre) return;

    if (geste !== this.geste) {
      this.geste = geste;
      noeuds.doigt.dataset.geste = geste;
      noeuds.trace.dataset.geste = geste;
    }
    // Une cible hors champ : le doigt reste au bord de l'écran, du côté où elle est.
    const x = Math.min(window.innerWidth - MARGE, Math.max(MARGE, point.x));
    const y = Math.min(window.innerHeight - MARGE, Math.max(MARGE, point.y));
    noeuds.doigt.classList.toggle('hors-champ', x !== point.x || y !== point.y);
    noeuds.doigt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    noeuds.anneau.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (geste === 'rectangle' && point.vers) {
      const dx = point.vers.x - point.x, dy = point.vers.y - point.y;
      for (const noeud of [noeuds.doigt, noeuds.trace]) {
        noeud.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        noeud.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      }
      noeuds.trace.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  /** La partie guidée s'en va : plus rien à l'écran, plus un mot. */
  retirer() {
    if (this.jeu.audio.taire) this.jeu.audio.taire();
    this.racine.remove();
    const hud = document.getElementById('hud');
    hud.classList.remove('avec-guide');
    this.jeu.camera.hautOccupe = 0;
    this.jeu.camera.basOccupe = 0;
    hud.style.removeProperty('--guide-bas');
  }
}

export { BOUT_DU_DOIGT };
