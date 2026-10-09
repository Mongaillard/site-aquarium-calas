// ---------------------------------------------------------------------------
// Point d'entrée : écrans, boucle de jeu à pas fixe, sélection et ordres.
// ---------------------------------------------------------------------------

import {
  TILE, TICKS_PER_SECOND, AGES, DIFFICULTIES, MAP_SIZES, BUILDING_TYPES,
  GAME_MODES, DEFAULT_MODE, GAME_SPEEDS, DEFAULT_SPEED,
  CIVILISATIONS, civDe, ficheDe, nomDe, UNIT_TYPES,
} from './config.js';
import { World, ESSAI_NOMBRE } from './game.js';
import {
  saveGame, loadSave, clearSave, restoreWorld,
  lirePalmares, lignePalmares, inscrireAuPalmares, resumePalmares,
  lireProgression, ecrireProgression, quandLaProgressionSEcrit,
} from './save.js';
import { brancher as brancherRangementDurable, hoteDeLApplication } from './rangement-durable.js';
import { appliquerResultat, reglagesDePartie, issueDePartie } from './progression.js';
import { matiereDe } from './collections-config.js';
import { EN_MAGASIN, NOM_DU_JEU, nomComplet } from './edition.js';
import { guichetParDefaut } from './achats.js';
import { installerProgression, reglerPeuple, htmlBandeau, htmlFinDePartie, jourLocal } from './progression-ecrans.js';
import { etatTemoin, lireTemoin, ecrireTemoin, fermerTemoin, releverTemoin, incidentNonLu, marquerIncidentsLus, phraseIncident } from './save.js';
import { Camera, Renderer } from './render.js';
import { InputController } from './input.js';
import { UI, FoyersAttaque, toucherArmee, resumeReglages, toucherNouvellePartie, texteDeConsigne } from './ui.js';
import { AudioEngine } from './audio.js';
import { Musique } from './musique.js';
import { villagerTask } from './entities.js';
import { dist2, clamp } from './utils.js';
import { iconeSVG } from './icones.js';
import { setStyleUnites, styleUnites, spriteDe, chargerSprites, chargerCivilisation, prevoirTroupe, etatModeles3d } from './sprites.js';
import { memoireTroupes, entretenirMemoire, rendreVariantes, troupesSelonStyle, ficheCiv } from './sprites.js';
import { webglDisponible } from './rendu3d.js';
import { DENSITE } from './modele3d.js';

const DT = 1 / TICKS_PER_SECOND;
const MAX_CATCHUP = 5;
/** Images par seconde quand rien ne bouge : menu de pause ouvert, partie finie (voir Game.imageDue). */
const IMAGES_FIGEES = 4;

const audio = new AudioEngine();
// La musique de fond passe par le même contexte audio : elle s'accorde à chaque reprise (premier geste, retour sur la page).
const musique = new Musique(audio);
audio.apresReprise = () => musique.accorder();

// Préférence « réaffectation automatique » : conservée d'une partie à l'autre.
const AUTO_WORKERS_KEY = 'aem.autoWorkers';
const SPEED_KEY = 'aem.vitesse';
const SETUP_KEY = 'aem.reglages';
// v2 : le style « 3D » (les modèles de l'auteur) arrive par défaut une fois,
// même chez qui avait retenu un autre style — dont les essais de 3D.
const STYLE_KEY = 'aem.styleUnites.v2';
const FINESSE_KEY = 'aem.finesse.v1';
/** Intervalle de sauvegarde automatique, en secondes réelles. */
const AUTOSAVE_INTERVAL = 30;
/** Intervalle du témoin de coupure (js/save.js), en secondes réelles. */
const TEMOIN_INTERVAL = 5;

function loadAutoWorkers() {
  try { return localStorage.getItem(AUTO_WORKERS_KEY) === '1'; } catch { return false; }
}

function saveAutoWorkers(on) {
  try { localStorage.setItem(AUTO_WORKERS_KEY, on ? '1' : '0'); } catch { /* stockage indisponible */ }
}

function loadSpeed() {
  try {
    const id = localStorage.getItem(SPEED_KEY);
    return GAME_SPEEDS.some((s) => s.id === id) ? id : DEFAULT_SPEED;
  } catch { return DEFAULT_SPEED; }
}

function storeSpeed(id) {
  try { localStorage.setItem(SPEED_KEY, id); } catch { /* stockage indisponible */ }
}

/** Réglages de l'écran d'accueil, retenus d'une partie à l'autre. */
function loadSetup() {
  try { return JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') || {}; } catch { return {}; }
}

function storeSetup(setup) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* stockage indisponible */ }
}

/**
 * Finesse de l'image : « fine » (tous les pixels de l'écran, jusqu'à trois par
 * point) ou « legere » (deux au plus, si le jeu rame ou chauffe). Le choix du
 * joueur est conservé ; le garde-fou automatique, lui, ne retient rien.
 */
function loadFinesse() {
  try { return localStorage.getItem(FINESSE_KEY) === 'legere' ? 'legere' : 'fine'; } catch { return 'fine'; }
}

/** Style des personnages (animé, peint, ou l'un des deux essais de 3D) : conservé d'une partie à l'autre. */
function loadStyle() {
  try { return localStorage.getItem(STYLE_KEY) || '3d'; } catch { return '3d'; }
}

export function speedDef(id) {
  return GAME_SPEEDS.find((s) => s.id === id) || GAME_SPEEDS.find((s) => s.id === DEFAULT_SPEED);
}

/**
 * Le pixel (u, v) de l'atlas est-il opaque ? L'illustration d'origine est une
 * <img>, illisible pixel à pixel ; sa variante recolorée est un canvas au même
 * alpha : c'est elle qu'on interroge. Sans canvas du tout, on dit oui.
 */
function pixelOpaque(sprite, u, v) {
  // (Sans déstructurer : l'autre camp d'un modèle cuit se fabrique à la lecture.)
  const { bleu } = sprite.variantes;
  const image = bleu && bleu.getContext ? bleu : sprite.variantes.rouge;
  if (!image || !image.getContext) return true;
  // Un canvas verrouillé (image d'une autre origine) refuse la lecture : on
  // retombe alors sur le rectangle entier, comme avant.
  try {
    return image.getContext('2d').getImageData(u | 0, v | 0, 1, 1).data[3] > 40;
  } catch {
    return true;
  }
}

class Game {
  constructor(options) {
    this.options = options;
    // Reprise d'une partie interrompue : le monde vient de la sauvegarde.
    const repris = options.restore ? restoreWorld(options.restore) : null;
    this.world = repris || new World(options);
    // Partie classée (elle compte pour l'Elo, la ligue et les coffres) : dit au
    // lancement, et gardé par la sauvegarde pour une partie reprise.
    this.classee = !!(options.classee || (options.restore && options.restore.classee));
    // Son identifiant : la même partie, reprise dans un autre onglet, ne se compte qu'une fois.
    this.partieId = options.partieId || (options.restore && options.restore.partieId) || null;
    // Partie d'essai d'une troupe à débloquer : elle ne compte nulle part.
    this.essai = this.world.essai;
    // Les images propres à chaque camp (partie neuve ou reprise) ; sans effet pour les Atlantes.
    for (const p of this.world.players) chargerCivilisation(p.civ);
    this.canvas = document.getElementById('game');
    // Tous les écouteurs posés sur le DOM partagé (canvas, boutons du HUD,
    // clavier, fenêtre) : une partie terminée les retire d'un coup, sinon elle
    // continue de réagir aux gestes de la suivante.
    this.ecouteurs = new AbortController();
    this.camera = new Camera(this.world);
    this.renderer = new Renderer(this.canvas, this.world, this.camera);
    // La teinture que le joueur a choisie pour ses troupes (js/teintures.js) : de l'apparence, lue au lancement.
    this.renderer.teinture = matiereDe(lireProgression().blason);
    // Les gestes des ouvriers à l'écran s'entendent : la hache au bois, la pioche à l'or, la cueillette, le marteau au chantier.
    const GESTES = { wood: 'chop', gold: 'mine', food: 'pick', build: 'hammer' };
    this.renderer.surGeste = (quoi) => { if (GESTES[quoi]) audio.play(GESTES[quoi]); };
    this.finesse = loadFinesse();
    this.renderer.reglerFinesse(this.finesse === 'legere' ? 2 : 3);
    // Le garde-fou de cadence a réduit la toile : le zoom de départ, s'il n'a
    // pas été touché, se recale sur le zoom net de cette toile-là.
    this.renderer.surToileReduite = () => this.recalerZoom();
    this.renderer.initMinimap(document.getElementById('minimap'));
    this.audio = audio;
    this.musique = musique;
    this.ui = new UI(this);
    this.input = new InputController(this.canvas, this);
    this.selection = [];
    this.buildMode = null;
    this.attackMoveArmed = false;
    this.rallyArmed = false;
    this.demolitionArmee = null;   // « Détruire » touché une fois : { id, jusqua } (voir demolish)
    this.garrisonArmed = false;
    this.gestesDits = new Set();   // gestes déjà expliqués d'un message dans cette partie (voir tapAt)
    this.paused = false;
    this.speedId = options.speed || (options.restore && options.restore.speed) || loadSpeed();
    this.speed = speedDef(this.speedId).mult;
    // Le rendu juge « en marche » sur la vitesse à l'écran : elle suit la vitesse de jeu.
    this.renderer.vitesseJeu = this.speed;
    this.accumulator = 0;
    this.saveTimer = AUTOSAVE_INTERVAL;
    this.prochaineVeille = 0;   // voir veiller
    this.prochainTemoin = 0;
    this.instants = [];         // heures des dernières images dessinées en jeu (voir noterImage)
    this.sansImage = 0;         // secondes depuis la dernière image dessinée (voir imageDue)
    this.vueDessinee = '';      // ce que montrait la dernière image d'une partie figée
    this.masquee = false;
    setStyleUnites(loadStyle());
    this.lastFrame = performance.now();
    // Alertes d'attaque, une par foyer ; la mini-carte lit la même liste pour ses repères.
    this.foyers = new FoyersAttaque();
    this.renderer.alertes = this.foyers.liste;
    this.idleNoticeCooldown = 0;
    this.running = true;
    this.world.players[this.world.humanIndex].autoWorkers = loadAutoWorkers();

    const home = this.world.buildings.find(
      (b) => b.playerIndex === this.world.humanIndex && b.type === 'towncenter');
    if (home) this.camera.centerOn(home.x, home.y);
    this.zoomInitial = this.camera.zoom = this.zoomDeDepart();

    // (Redimensionner vide la toile : une partie figée la redessine aussitôt.)
    window.addEventListener('resize', () => { this.renderer.resize(); this.vueDessinee = ''; }, { signal: this.ecouteurs.signal });
    // Le téléphone peut couper l'onglet sans prévenir : on écrit avant de partir,
    // et on met la partie en pause plutôt que de la laisser tourner sans être vue.
    this.onHide = () => {
      // (De retour : la marque du témoin se rouvre et l'image se redessine, sans attendre leur tour.)
      if (document.visibilityState !== 'hidden') { this.masquee = false; this.vueDessinee = ''; this.marquer(); return; }
      this.saveNow();
      this.fermerMarque('masquee');
      this.masquee = true;
      // Masquée, la page ne dessine plus : le sol en cache et les copies de
      // l'autre camp sont rendus (ils se refont au retour, derrière le menu de
      // pause). Une page légère en arrière-plan risque moins d'être coupée.
      try { this.renderer.viderTroncons(); rendreVariantes(); } catch { /* jamais au prix de la partie */ }
      if (!this.paused && !this.world.gameOver) this.togglePause();
    };
    this.onLeave = () => { this.saveNow(); this.fermerMarque('quittee'); };
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onLeave);
    // Le conseil de départ, pour une partie neuve seulement : à la reprise,
    // les villageois travaillent déjà.
    if (!repris) this.ui.toast(`Affectez vos ${this.ouvrier(2)} : touchez-les, puis touchez un arbre, un buisson ou un filon.`);
    if (!repris && this.world.essai) this.ui.toast(`Partie d’essai : ${ESSAI_NOMBRE} ${nomDe(this.world.essai, this.civ, ESSAI_NOMBRE)} t’attendent près de ton centre.`, 'good');
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /**
   * Le zoom de départ : une vingtaine de cases en largeur, mais calé sur un
   * zoom NET — celui où une case d'atlas d'une troupe (DENSITE pixels par
   * pixel monde) couvre exactement ses pixels d'écran, ou exactement la
   * moitié. Sur un iPhone (trois pixels par point) : 2/3, dix-huit cases en
   * largeur, un fantassin de 84 pixels réels au lieu de 43 étirés à 64.
   */
  zoomDeDepart() {
    const cam = this.camera;
    const voulu = clamp(cam.viewWidth / (20 * TILE), cam.minZoom, 1.1);
    let net = DENSITE / this.renderer.dpr;
    while (net > voulu * 1.42) net /= 2;
    return clamp(net, cam.minZoom, 1.1);
  }

  /**
   * En fin de pincement, si le zoom est à 7 % près d'un zoom NET (une case
   * d'atlas = ses pixels d'écran, leur double ou leur moitié), il s'y cale :
   * la scène retombe exactement pixel pour pixel au lieu de rester un peu
   * molle à 0,95 ou 1,05 fois ce zoom.
   */
  calerZoom(x, y) {
    const cam = this.camera, net = DENSITE / this.renderer.dpr;
    for (const z of [net, net * 2, net / 2]) {
      if (z < cam.minZoom || z > cam.maxZoom) continue;
      const r = cam.zoom / z;
      if (r > 0.93 && r < 1.07 && r !== 1) { cam.zoomBy(1 / r, x, y); cam.zoom = z; cam.clampPosition(); return; }
    }
  }

  /** Après un changement de finesse : le zoom de départ suit, sauf si le joueur l'a déjà réglé. */
  recalerZoom() {
    if (this.camera.zoom !== this.zoomInitial) return;
    this.zoomInitial = this.camera.zoom = this.zoomDeDepart();
    this.camera.clampPosition();
  }

  /** Finesse de l'image, choisie au menu de pause (voir loadFinesse). */
  setFinesse(id) {
    this.finesse = id === 'legere' ? 'legere' : 'fine';
    try { localStorage.setItem(FINESSE_KEY, this.finesse); } catch { /* stockage indisponible */ }
    this.renderer.reglerFinesse(this.finesse === 'legere' ? 2 : 3);
    this.recalerZoom();
    this.ui.toast(this.finesse === 'legere' ? 'Image légère : deux pixels par point' : 'Image fine : tous les pixels de l’écran');
  }

  // --- Mesures, mémoire et témoin de coupure ---------------------------------

  /**
   * Hors de la simulation, une fois par seconde à l'horloge réelle : le
   * plafond de mémoire des troupes (voir entretenirMemoire, js/sprites.js),
   * et le témoin de coupure, tenu à jour tant que la partie dure.
   */
  veiller(now) {
    try { entretenirMemoire(now / 1000, this.troupesEnJeu()); } catch { /* le ménage ne doit jamais arrêter la boucle */ }
    if (now >= this.prochainTemoin) { this.prochainTemoin = now + TEMOIN_INTERVAL * 1000; this.marquer(); }
  }

  /**
   * Les couples [type, civilisation] qui ont une unité en vie ou en formation,
   * dans les deux camps, vue ou non : leurs images restent en mémoire. (Une
   * file de production porte aussi des technologies : sprites.js les ignore.)
   * Un corps à terre compte aussi : il est encore dessiné, et partie figée
   * (pause, écran de fin) il ne vieillit plus — sa troupe déchargée était
   * relue du cache à l'image suivante, toutes les deux minutes, sans fin.
   */
  troupesEnJeu() {
    const couples = new Map();
    for (const u of this.world.units) {
      if (!u.dead) couples.set(`${u.type}|${u.player.civ}`, [u.type, u.player.civ]);
    }
    for (const b of this.world.buildings) {
      if (b.dead) continue;
      for (const q of b.queue) couples.set(`${q.id}|${b.player.civ}`, [q.id, b.player.civ]);
    }
    for (const fx of this.world.effects) {
      if (fx.kind !== 'cadavre') continue;
      const civ = this.world.players[fx.joueur]?.civ;
      couples.set(`${fx.type}|${civ}`, [fx.type, civ]);
    }
    return [...couples.values()];
  }

  /** Ce que le témoin retient de cet instant (js/save.js). */
  etatDuTemoin() {
    const m = memoireTroupes();
    return etatTemoin(this.world, {
      mo: m.mo, troupes: m.troupes, dpr: this.renderer.dpr, visible: document.visibilityState !== 'hidden',
    });
  }

  /** Tient la marque du témoin à jour. Rien de tout cela ne doit jamais gêner la partie. */
  marquer() {
    if (!this.running || this.world.gameOver) return;
    try { ecrireTemoin(this.etatDuTemoin()); } catch { /* stockage ou mesure indisponible */ }
  }

  /** Sortie normale (« fin », « accueil », « masquee », « quittee ») : la marque se ferme. */
  fermerMarque(raison) {
    try { fermerTemoin(raison, this.world.gameOver ? null : this.etatDuTemoin()); } catch { /* idem */ }
  }

  /**
   * Faut-il dessiner cette image ? En jeu, toujours. Menu de pause ouvert ou
   * partie finie, plus rien ne bouge, et redessiner tout l'écran soixante fois
   * par seconde vide la batterie pour rien : IMAGES_FIGEES images par seconde
   * suffisent — et une tout de suite si ce qu'on voit change (la vue qui
   * défile, l'écran qui tourne, la finesse, le style des troupes). Page
   * masquée, rien : ce qu’on vient de rendre à la mémoire y reviendrait.
   * `dtImage` : le temps que couvre l'image à dessiner.
   */
  imageDue(now, realDt) {
    this.sansImage += realDt;
    if (this.masquee && document.visibilityState === 'hidden') return false;
    const figee = this.paused || !!this.world.gameOver;
    if (figee) {
      const cam = this.camera;
      const vue = `${cam.x}|${cam.y}|${cam.zoom}|${this.canvas.width}|${this.canvas.height}|${styleUnites()}|${this.selection.length}`;
      if (vue === this.vueDessinee && this.sansImage < 1 / IMAGES_FIGEES) return false;
      this.vueDessinee = vue;
    } else {
      this.noterImage(now);
    }
    // (Figée : 0,2 s au plus, pour que le rendu ne prenne pas ses troupes pour des revenantes.)
    this.dtImage = figee ? Math.min(0.2, this.sansImage) : realDt;
    this.sansImage = 0;
    return true;
  }

  /** Une image vient d'être dessinée en jeu : on garde les heures des cinq dernières secondes. */
  noterImage(now) {
    const t = this.instants;
    // Un trou (pause, retour d'arrière-plan) : la mesure repart de zéro.
    if (t.length && now - t[t.length - 1] > 1000) t.length = 0;
    t.push(now);
    while (t[0] < now - 5000) t.shift();
  }

  /**
   * Ce que le jeu mesure de lui-même, pour la ligne « Mesures » du menu de
   * pause : images par seconde sur les dernières secondes de jeu (0 : pas
   * encore mesuré), mémoire et nombre des troupes cuites, pixels par point,
   * incidents relevés par le témoin.
   */
  mesures() {
    const t = this.instants, m = memoireTroupes();
    const duree = t.length > 1 ? t[t.length - 1] - t[0] : 0;
    const ips = duree > 0 ? ((t.length - 1) * 1000) / duree : 0;   // pas de cadence sans durée
    return { ips, mo: m.mo, troupes: m.troupes, dpr: this.renderer.dpr, incidents: lireTemoin().incidents };
  }

  // --- Boucle ---------------------------------------------------------------

  loop(now) {
    if (!this.running) return;
    const realDt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!this.paused && !this.world.gameOver) {
      this.accumulator += realDt * this.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_CATCHUP) {
        this.world.update(DT);
        this.accumulator -= DT;
        steps++;
      }
      if (steps === MAX_CATCHUP) this.accumulator = 0;   // on ne rattrape pas l'irrattrapable
    }

    // Sauvegarde automatique : un appel qui arrive, l'onglet qui passe en
    // arrière-plan, et une partie de vingt minutes serait perdue.
    if (!this.world.gameOver) {
      this.saveTimer -= realDt;
      if (this.saveTimer <= 0) { this.saveTimer = AUTOSAVE_INTERVAL; this.saveNow(); }
    }
    if (now >= this.prochaineVeille) { this.prochaineVeille = now + 1000; this.veiller(now); }

    this.input.updateKeyboardPan(realDt);
    if (this.idleNoticeCooldown > 0) this.idleNoticeCooldown -= realDt;
    this.processEvents();
    this.pruneSelection();
    const image = this.imageDue(now, realDt);   // partie figée : quelques images par seconde seulement
    // Le dessin se fait entre deux pas de simulation (voir World.lisser).
    if (image) this.world.lisser(this.accumulator / DT);
    this.renderer.sousPas = this.accumulator;   // secondes de jeu écoulées depuis le dernier pas
    try {
      if (image) this.renderer.render(this.dtImage);
      if (image) this.renderer.drawMinimap();
    } catch (erreur) {
      // Une image ratée ne doit ni laisser les positions lissées en place, ni
      // arrêter la boucle : on le dit une fois, et la partie continue.
      if (!this.erreurDessin) { this.erreurDessin = true; console.error('Dessin interrompu :', erreur); }
    } finally {
      if (image) this.world.delisser();
    }
    this.ui.update(realDt);
    this.foyers.vieillir(realDt);
    this.musique.suivre();
    requestAnimationFrame(this.loop);
  }

  processEvents() {
    for (const event of this.world.drainEvents()) {
      const mine = event.player === this.world.humanIndex;
      switch (event.type) {
        case 'built':
          if (event.building.playerIndex === this.world.humanIndex) {
            this.audio.play('built');
            const f = ficheDe(event.building.type, event.building.player.civ);
            this.ui.toast(`${f.name} terminé${f.fem ? 'e' : ''}`);
          }
          break;
        case 'trained': if (mine) this.audio.play('trained'); break;
        // (Un coup échangé entre deux camps, porté par le joueur : la musique de bataille le compte — voir js/musique.js.)
        case 'melee': if (mine && event.combat) this.musique.coup(); if (this.world.isVisible(event.x, event.y)) this.audio.play('melee'); break;
        case 'shoot': if (mine && event.combat) this.musique.coup(); if (this.world.isVisible(event.x, event.y)) this.audio.play('shoot'); break;
        // (Un bâtiment s'effondre ; une troupe ou une bête tombe.)
        case 'destroyed': if (this.world.isVisible(event.x, event.y)) this.audio.play(event.entity && event.entity.kind === 'building' ? 'destroyed' : 'death'); break;
        case 'notice': this.ui.toast(event.text, 'warn'); break;
        case 'idleWorker':
          // On prévient sans harceler : le compteur des inactifs reste la source de vérité.
          if (this.idleNoticeCooldown <= 0) {
            this.idleNoticeCooldown = 15;
            const count = this.idleVillagers().length;
            this.ui.toast(count > 1
              ? `${count} ${this.ouvrier(count)} attendent vos ordres`
              : `Un ${this.ouvrier()} attend vos ordres`, 'warn');
          }
          break;
        case 'tech':
          if (mine) this.ui.toast('Technologie terminée', 'good');
          break;
        case 'age':
          if (mine) {
            this.audio.play('age');
            this.ui.toast(`Bienvenue dans l'${AGES[event.age].name} !`, 'good');
          } else {
            this.ui.toast(`L'adversaire atteint l'${AGES[event.age].name}`, 'warn');
          }
          break;
        case 'underAttack':
          if (event.combat) this.musique.coup();   // un coup reçu compte aussi
          // L'alerte dit où : son message se touche (voirAttaque) et l'endroit
          // pulse sur la mini-carte. Une par foyer, pour ne pas inonder.
          if (this.foyers.signaler(event.x, event.y)) {
            this.audio.play('alert');
            this.ui.toast('Vous êtes attaqué ! Touchez pour voir où', 'error', () => this.voirAttaque());
            this.lastAttackPoint = { x: event.x, y: event.y };
            this.vibrate([18, 60, 18]);
          }
          break;
        case 'campTombe': {
          // Par équipes : un camp vient de perdre son bâtiment principal. La partie continue tant que son équipe tient.
          const moi = this.world.humanIndex;
          if (event.player === moi) {
            this.audio.play('alert');
            this.ui.toast('Votre bâtiment principal est tombé : vos troupes se battent encore, votre allié tient', 'error');
          } else if (this.world.allies(event.player, moi)) {
            this.audio.play('alert');
            this.ui.toast('Votre allié a perdu son bâtiment principal', 'warn');
          } else this.ui.toast('Un adversaire est hors de combat', 'good');
          break;
        }
        case 'position': {
          // Prise de positions : une position change de mains. On dit laquelle des trois issues, et où.
          const moi = this.world.humanIndex;
          if (event.camp === moi) { this.audio.play('built'); this.ui.toast('Position prise !', 'good'); }
          else if (event.ancien === moi) {
            this.audio.play('alert');
            this.lastAttackPoint = { x: event.x, y: event.y };
            this.ui.toast('Position perdue ! Touchez pour voir où', 'error', () => this.voirAttaque());
            this.vibrate([18, 60, 18]);
          } else this.ui.toast('L’adversaire prend une position', 'warn');
          break;
        }
        case 'gameOver':
          this.musique.mettre('silence');   // la place au jingle de fin
          this.audio.play(event.result.victory ? 'victory' : 'defeat');
          clearSave();
          this.fermerMarque('fin');
          // La partie entre au palmarès (victoires, défaites, records) : l'écran
          // de fin dit ce qu'elle y change.
          // Une partie classée compte au classement, pas au palmarès : sa
          // difficulté est celle de la ligue, elle fausserait les records.
          if (this.classee) this.ui.showGameOver(event.result, null, this.compterPartieClassee(event.result));
          // Une partie d'essai (trois soldats offerts au départ) ne compte pas non plus au palmarès.
          else if (this.essai) this.ui.showGameOver(event.result, null, '<p class="fin-note">Partie d’essai : elle ne compte ni au classement ni au palmarès.</p>');
          else {
            this.ui.showGameOver(event.result, inscrireAuPalmares({
              mode: this.world.modeId, difficulty: this.world.difficultyId,
              humanIndex: this.world.humanIndex, result: event.result,
            }));
          }
          break;
      }
    }
  }

  /**
   * Une partie classée finie entre au classement : le score, la ligue, les
   * coffres, les troupes (js/progression.js). Rend le bloc de l'écran de fin.
   */
  compterPartieClassee(result) {
    const r = appliquerResultat(lireProgression(), {
      issue: issueDePartie(result), duree: this.world.time, contreOrdinateur: 'echelle',
      jour: jourLocal(), instant: Date.now() / 1000, id: this.partieId || undefined, format: this.world.modeId,
    });
    ecrireProgression(r.profil);
    return htmlFinDePartie(r.evenements, r.profil);
  }

  pruneSelection() {
    if (this.selection.some((e) => e.dead)) {
      this.selection = this.selection.filter((e) => !e.dead);
      this.ui.refreshSelection(true);
    }
  }

  // --- Sélection ------------------------------------------------------------

  setSelection(entities) {
    for (const e of this.selection) e.selected = false;
    this.selection = entities.filter((e) => e && !e.dead);
    for (const e of this.selection) e.selected = true;
    this.ui.refreshSelection(true);
  }

  setSelectionBox(box) { this.renderer.selectionBox = box; }

  tapAt(screenX, screenY, isDouble) {
    const p = this.camera.screenToWorld(screenX, screenY);
    this.audio.resume();

    // Par équipes : « Attaque ici » attend ce toucher — c'est le point donné à l'allié.
    if (this.consigneArmee) {
      this.consigneArmee = false;
      this.ui.setBuildHint('');
      const allie = this.allieOrdinateur();
      if (allie && this.world.consigner(this.world.humanIndex, allie.index, 'attaquer', p.x, p.y)) {
        this.audio.play('order');
        this.annoncerConsigne(allie, 'attaquer');
      } else this.audio.play('error');
      return;
    }
    if (this.rallyArmed && this.selection.length === 1 && this.selection[0].kind === 'building') {
      this.world.setRally(this.selection[0], p.x, p.y);
      this.rallyArmed = false;
      this.ui.setBuildHint('');   // la consigne restait affichée, par-dessus les notifications
      this.audio.play('order');
      this.ui.toast('Point de ralliement défini');
      this.ui.refreshSelection(true);
      return;
    }

    const ownUnits = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);

    if (this.attackMoveArmed && ownUnits.length > 0) {
      this.attackMoveArmed = false;
      this.ui.setBuildHint('');
      this.world.formationMove(ownUnits, p.x, p.y, true);
      this.pingOrder(p.x, p.y, '#ff9b6b');
      this.audio.play('order');
      this.ui.refreshSelection(true);
      return;
    }

    // Mode « abriter » armé : le prochain appui désigne le refuge.
    if (this.garrisonArmed) {
      this.garrisonArmed = false;
      this.ui.setBuildHint('');
      const shelter = this.devantSousLeDoigt(p, this.world.entityAt(p.x, p.y, this.world.humanIndex, this.tapTolerance()), this.world.humanIndex);
      if (shelter && shelter.kind === 'building' && shelter.def.garrison && ownUnits.length) {
        const sent = this.world.garrisonUnits(ownUnits, shelter);
        if (sent > 0) {
          this.ui.toast(`${sent} unité(s) se mettent à l'abri`);
          this.audio.play('order');
          this.vibrate(10);
        }
      } else {
        this.ui.toast(`Touchez un ${nomDe('towncenter', this.civ)} ou une tour`, 'error');
        this.audio.play('error');
      }
      this.ui.refreshSelection(true);
      return;
    }

    // Avec ses troupes en main, un ennemi sous le doigt passe avant un allié :
    // sinon, dans une mêlée, chaque appui change la sélection au lieu de donner
    // l'ordre d'attaquer.
    const tolerance = this.tapTolerance();
    // Exception : le doigt posé franchement sur un de ses bâtiments le
    // sélectionne quand même — en plein raid, il faut pouvoir produire.
    const ownBuilding = this.devantSousLeDoigt(p, this.world.entityAt(p.x, p.y, this.world.humanIndex, 0), this.world.humanIndex);
    // Autre exception : des soigneuses seules en main n'attaquent pas. Un allié
    // blessé sous le doigt passe alors avant l'ennemi : en mêlée — là où le
    // soin sert le plus — cet ennemi est à deux pas, il captait l'appui et la
    // soigneuse marchait dans le combat au lieu de soigner.
    const allie = this.world.entityAt(p.x, p.y, this.world.humanIndex, tolerance);
    const aSoigner = this.world.ordreSurAllie(ownUnits, allie) === 'heal' ? allie : null;
    let enemy = ownUnits.length > 0 && !aSoigner && !(ownBuilding && ownBuilding.kind === 'building')
      ? this.world.enemyAt(p.x, p.y, this.world.humanIndex, tolerance) : null;
    // Le doigt sur les toits d'un palais ennemi : c'est lui qu'on attaque, et
    // l'ordre vise son centre — le point touché, lui, est hors de l'emprise.
    let cible = p;
    if (!enemy && !aSoigner && ownUnits.length > 0 && !ownBuilding) {
      const illustre = this.batimentIllustreSous(p.x, p.y);
      if (illustre && illustre.playerIndex !== this.world.humanIndex) { enemy = illustre; cible = { x: illustre.x, y: illustre.y }; }
    }
    if (enemy && this.renderer.isEntityVisible(enemy)) {
      this.issueOrder(cible.x, cible.y);
      return;
    }

    const entity = aSoigner || this.devantSousLeDoigt(p, this.world.entityAt(p.x, p.y, null, tolerance));
    const isMine = entity && entity.playerIndex === this.world.humanIndex;
    const visible = entity && (isMine || this.renderer.isEntityVisible(entity));

    // Un cochon capturé sous le doigt, des villageois en main : on l'abat.
    if (entity && isMine && entity.isAnimal && !isDouble && ownUnits.some((u) => u.isVillager)) {
      this.issueOrder(entity.x, entity.y);
      return;
    }
    if (entity && isMine) {
      // Des soldats qui touchent un abri allié n'ont qu'une intention possible :
      // s'y réfugier. Pour les villageois on reste sur la sélection, qui sert
      // aussi à produire ou à passer un âge (l'abri a son bouton dédié).
      if (entity.kind === 'building' && entity.def.garrison && ownUnits.length > 0
          && ownUnits.every((u) => !u.isVillager && entity.canGarrison(u))) {
        const sent = this.world.garrisonUnits(ownUnits, entity);
        if (sent > 0) {
          this.ui.toast(`${sent} unité(s) se mettent à l'abri`);
          this.audio.play('order');
          this.pingOrder(entity.x, entity.y, '#c39bf6');
          this.ui.refreshSelection(true);
          return;
        }
      }
      // Des villageois en main + un chantier (ou une ferme) sous le doigt :
      // on les envoie travailler, exactement comme sur un arbre ou un buisson.
      // Sans cette règle, l'appui sélectionnait le bâtiment et l'ordre se
      // perdait — impossible d'affecter quelqu'un à une construction.
      // Le double appui reste la porte de sortie : il sélectionne le bâtiment
      // (pour suivre l'avancement ou annuler le chantier).
      if (entity.kind === 'building' && !isDouble && ownUnits.some((u) => u.isVillager)
          && (!entity.complete || entity.type === 'farm')) {
        this.issueOrder(p.x, p.y);
        return;
      }
      // Réparer et soigner au doigt : des ouvriers en main et un bâtiment
      // abîmé, des soigneuses et un allié blessé (voir World.ordreSurAllie).
      // Ces ordres n'existaient qu'au clic droit : l'appui sélectionnait, et un
      // bâtiment entamé ne remontait jamais. Le double appui sélectionne
      // toujours, comme pour un chantier — on le dit la première fois.
      const ordre = isDouble ? null : this.world.ordreSurAllie(ownUnits, entity);
      if (ordre) {
        this.issueOrder(entity.x, entity.y, entity);
        if (!this.gestesDits.has(ordre)) {
          this.gestesDits.add(ordre);
          this.ui.toast(ordre === 'repair'
            ? 'Double tap sur le bâtiment pour le sélectionner'
            : 'Soin lancé — double tap sur l’unité pour la sélectionner');
        }
        return;
      }
      if (isDouble && entity.kind === 'unit') {
        this.selectSameTypeOnScreen(entity);
      } else {
        this.setSelection([entity]);
      }
      this.audio.play('select');
      this.vibrate(8);
      return;
    }

    if (ownUnits.length > 0) { this.issueOrder(p.x, p.y); return; }

    if (entity && visible) { this.setSelection([entity]); this.audio.play('select'); return; }
    this.setSelection([]);
  }

  commandAt(screenX, screenY) {
    const ownUnits = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (ownUnits.length === 0) return;
    const p = this.camera.screenToWorld(screenX, screenY);
    this.issueOrder(p.x, p.y);
  }

  /**
   * Rayon de pointage en unités monde : on vise une cible d'environ 22 pixels
   * à l'écran quel que soit le zoom — la taille d'un bout de doigt.
   */
  /**
   * Le bâtiment illustré visible sous le point monde (x, y), ou null : parmi
   * ceux dont l'image contient le point — un pixel opaque, et pour un chantier
   * dans la partie déjà sortie de terre —, le dernier peint dans l'ordre du
   * peintre : bord nord le plus au sud, puis ordre de création.
   */
  batimentIllustreSous(x, y, playerIndex = null) {
    let meilleur = null;
    for (const b of this.world.buildings) {
      if (b.dead || (playerIndex !== null && b.playerIndex !== playerIndex)) continue;
      if (meilleur && b.ty < meilleur.ty) continue;   // peint avant : recouvert
      const s = spriteDe(b.type, b.player.civ);
      if (!s) continue;
      const { cellW, cellH, largeurMonde, sol } = s.def;
      const dw = largeurMonde, dh = (cellH / cellW) * dw;
      const dx = b.x - dw / 2, sud = (b.ty + b.size) * TILE, dy = sud - dh * (sol ?? 1);
      if (x < dx || x >= dx + dw || y < dy || y >= sud) continue;
      if (!b.complete && y < dy + dh * (1 - Math.max(0.12, b.progressRatio))) continue;
      if (!pixelOpaque(s, ((x - dx) / dw) * cellW, ((y - dy) / dh) * cellH)) continue;
      meilleur = b;   // à bord nord égal, le plus récent est peint en dernier
    }
    return meilleur;
  }

  /**
   * Ce qui est réellement sous le doigt, compte tenu des illustrations. Une
   * unité garde la priorité. Entre bâtiments, celui qu'on voit est celui peint
   * en dernier : une ferme plate au nord du palais est peinte AVANT ses dômes,
   * le joueur voit les dômes, il veut le palais. `playerIndex` restreint à un
   * camp, comme pour entityAt.
   */
  devantSousLeDoigt(p, trouve, playerIndex = null) {
    if (trouve && trouve.kind === 'unit') return trouve;
    const illustre = this.batimentIllustreSous(p.x, p.y, playerIndex);
    if (!illustre) return trouve;
    if (!trouve || trouve.kind !== 'building' || spriteDe(trouve.type, trouve.player.civ)) return illustre;
    // Un bâtiment plat sous le doigt : il gagne s'il est peint après l'illustré.
    const apres = trouve.ty > illustre.ty
      || (trouve.ty === illustre.ty && this.world.buildings.indexOf(trouve) > this.world.buildings.indexOf(illustre));
    return apres ? trouve : illustre;
  }

  tapTolerance() {
    return clamp(16 / this.camera.zoom, 10, 40);
  }

  /** @param cible l'entité déjà reconnue sous le doigt, quand l'ordre la vise elle (réparer, soigner). */
  issueOrder(worldX, worldY, cible = null) {
    const units = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (units.length === 0) return;
    const result = this.world.commandUnits(units, worldX, worldY, { tolerance: this.tapTolerance(), cible });
    // Retour explicite : sur un petit écran, on ne voit pas d'un coup d'œil
    // que le groupe s'est étalé sur plusieurs arbres.
    if (result && result.kind === 'gather' && result.workers > 1) {
      const lieux = { wood: 'arbres', gold: 'filons', food: 'sources de nourriture' };
      const type = result.res ? result.res.type : 'food';
      this.ui.toast(result.spread > 1
        ? `${result.workers} ${this.ouvrier(result.workers)} répartis sur ${result.spread} ${lieux[type]}`
        : `${result.workers} ${this.ouvrier(result.workers)} envoyé${result.workers > 1 ? 's' : ''} récolter`);
    }
    // Un chantier ne montre pas tout de suite qu'il a reçu du renfort : on le dit.
    if (result && (result.kind === 'build' || result.kind === 'repair') && result.workers > 0) {
      const verbe = result.kind === 'repair' ? 'à la réparation' : 'sur le chantier';
      this.ui.toast(result.workers > 1
        ? `${result.workers} ouvriers envoyés ${verbe}`
        : `Ouvrier envoyé ${verbe}`);
    }
    if (result && result.kind === 'hunt') {
      const bete = result.target;
      this.ui.toast(bete.playerIndex === this.world.humanIndex
        ? `${bete.def.name} : abattage, ${bete.def.food} de nourriture`
        : `Chasse au ${bete.def.name.toLowerCase()} : ${bete.def.food} de nourriture`);
    }
    const colors = {
      attack: '#ff6b6b', hunt: '#ff9b6b', gather: '#ffd166', build: '#8ecae6',
      repair: '#8ecae6', garrison: '#c39bf6', move: '#9bf6a0', heal: '#8ff0c0',
    };
    this.pingOrder(worldX, worldY, colors[result ? result.kind : 'move'] || '#9bf6a0');
    this.audio.play('order');
    this.vibrate(8);
  }

  pingOrder(x, y, color) {
    this.world.effects.push({ kind: 'ping', x, y, life: 0.6, max: 0.6, color });
  }

  boxSelect(box) {
    const a = this.camera.screenToWorld(box.x0, box.y0);
    const b = this.camera.screenToWorld(box.x1, box.y1);
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    const inBox = (e) => e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY;
    const mine = this.world.humanIndex;
    // Un rectangle sélectionne ce qu'il contient, sans filtrage malin : le
    // contraire surprend (un seul éclaireur retenu sur une dizaine de
    // villageois). Pour ne prendre qu'un type, le double tap est là.
    let picked = this.world.units.filter(
      (u) => !u.dead && !u.garrisonedIn && u.playerIndex === mine && inBox(u));
    if (picked.length === 0) {
      picked = this.world.buildings.filter((b) => !b.dead && b.playerIndex === mine && inBox(b)).slice(0, 1);
    }
    this.setSelection(picked);
    if (picked.length > 0) { this.audio.play('select'); this.vibrate(10); }
  }

  selectSameTypeOnScreen(entity) {
    const view = this.renderer.visibleTileRange();
    const same = this.world.units.filter((u) => !u.dead
      && u.playerIndex === entity.playerIndex && u.type === entity.type
      && u.x >= view.left && u.x <= view.right && u.y >= view.top && u.y <= view.bottom);
    this.setSelection(same.length ? same : [entity]);
    this.ui.toast(`${same.length} ${nomDe(entity.type, entity.player.civ, same.length)}`);
  }

  filterSelection(type) {
    const filtered = this.selection.filter((e) => e.type === type);
    if (filtered.length) this.setSelection(filtered);
  }

  /**
   * Plus aucun ordre en attente d'un appui (attaque, abri, ralliement) : sa
   * consigne s'efface avec lui — sauf pendant une pose, dont la consigne a
   * pris sa place et doit rester tant que le fantôme est là.
   */
  desarmer() {
    if (!this.attackMoveArmed && !this.rallyArmed && !this.garrisonArmed && !this.consigneArmee) return;
    this.attackMoveArmed = false; this.rallyArmed = false; this.garrisonArmed = false; this.consigneArmee = false;
    if (!this.buildMode) this.ui.setBuildHint('');
  }

  /**
   * La croix du panneau : tout lâcher d'un doigt. Sans elle, une sélection ne
   * se quittait qu'au clavier, et le moindre appui raté partait en ordre. La
   * pose en cours et l'ordre armé partent avec : après la croix, plus rien en main.
   */
  lacherSelection() {
    if (this.buildMode) this.cancelBuild();
    this.desarmer();
    this.ui.setBuildHint('');   // plus rien en main : aucune consigne ne reste
    this.setSelection([]);
  }

  /**
   * Pastille « Armée » : un toucher prend TOUTE l'armée, où qu'elle soit sur
   * la carte — la vue ne bouge pas, pour donner l'ordre là où l'on regarde ;
   * un second toucher (elle est déjà en main) amène la vue sur elle.
   */
  selectArmy() {
    const geste = toucherArmee(this.world, this.world.humanIndex, this.selection);
    if (!geste) { this.ui.toast('Aucun soldat pour l’instant'); this.audio.play('error'); return; }
    if (geste.voir) {
      this.camera.centerOn(geste.voir.x, geste.voir.y);
    } else {
      this.desarmer();
      this.setSelection(geste.prendre || [geste.abri]);
      if (geste.abri) {
        // Toute l'armée est à l'abri : on montre l'abri, son bouton « Libérer » est là.
        this.camera.centerOn(geste.abri.x, geste.abri.y);
        this.ui.toast('Vos soldats sont à l’abri : « Libérer » les fait sortir');
      }
    }
    this.audio.play('select');
  }

  /** Applique une attitude à toute la sélection. */
  setStance(stanceId) {
    const units = this.selection.filter(
      (e) => e.kind === 'unit' && e.playerIndex === this.world.humanIndex);
    if (units.length === 0) return;
    this.world.setStance(units, stanceId);
    this.audio.play('click');
    this.ui.refreshSelection(true);
  }

  /** Cloche du village : tout le monde à l'abri, ou tout le monde dehors. */
  ringTownBell() {
    const result = this.world.ringTownBell(this.world.humanIndex);
    if (result.sheltered > 0) {
      // Abris pleins : on dit combien restent dehors, au lieu de les compter à l'abri.
      const reste = result.sansPlace > 0 ? ` — ${result.sansPlace} sans place` : '';
      this.ui.toast(`${result.sheltered} ${this.ouvrier(result.sheltered)} à l'abri${reste}`, 'warn');
      this.audio.play('alert');
      this.vibrate([12, 40, 12]);
    } else if (result.released > 0) {
      this.ui.toast(`${result.released} ${this.ouvrier(result.released)} ${result.released > 1 ? 'retournent' : 'retourne'} au travail`);
      this.audio.play('order');
    } else {
      this.ui.toast(result.sansPlace > 0 ? 'Abris pleins'
        : result.abris > 0 ? `Aucun ${this.ouvrier()} à abriter` : 'Aucun abri disponible', 'error');
      this.audio.play('error');
    }
    this.ui.refreshSelection(true);
  }

  releaseGarrison(building) {
    const released = this.world.releaseGarrison(building);
    if (released.length === 0) this.audio.play('error');
    else this.audio.play('order');
    this.ui.refreshSelection(true);
  }

  stopSelection() {
    for (const e of this.selection) if (e.kind === 'unit') e.stop();
    this.desarmer();   // l'ordre armé tombe avec sa consigne (« Touchez la zone à attaquer » restait)
    this.ui.refreshSelection(true);
  }

  toggleAttackMove() {
    this.attackMoveArmed = !this.attackMoveArmed;
    this.rallyArmed = false;
    this.garrisonArmed = false;
    this.ui.setBuildHint(this.attackMoveArmed ? 'Touchez la zone à attaquer' : '');
    this.ui.refreshSelection(true);
  }

  toggleRally() {
    this.rallyArmed = !this.rallyArmed;
    this.attackMoveArmed = false;
    this.garrisonArmed = false;
    this.ui.setBuildHint(this.rallyArmed ? 'Touchez le point de ralliement' : '');
    this.ui.refreshSelection(true);
  }

  toggleGarrison() {
    this.garrisonArmed = !this.garrisonArmed;
    this.attackMoveArmed = false;
    this.rallyArmed = false;
    this.ui.setBuildHint(this.garrisonArmed ? `Touchez le ${nomDe('towncenter', this.civ)} ou la tour où s’abriter` : '');
    this.ui.refreshSelection(true);
  }

  // --- Construction ---------------------------------------------------------

  openBuildMenu() { this.ui.openBuildMenu(); }

  startBuildMode(type) {
    this.buildMode = { type, tx: 0, ty: 0, valid: false };
    this.ui.closeBuildMenu();
    this.ui.setBuildHint(`${ficheDe(type, this.civ).name} : touchez l'emplacement (2 doigts pour déplacer la vue)`);
    const center = this.camera.screenToWorld(this.camera.viewWidth / 2, this.camera.viewHeight / 2);
    this.updateGhostWorld(center.x, center.y);
  }

  updateGhost(screenX, screenY) {
    const p = this.camera.screenToWorld(screenX, screenY);
    this.updateGhostWorld(p.x, p.y);
  }

  updateGhostWorld(worldX, worldY) {
    if (!this.buildMode) return;
    const def = BUILDING_TYPES[this.buildMode.type];
    const tx = Math.round(worldX / TILE - def.size / 2);
    const ty = Math.round(worldY / TILE - def.size / 2);
    this.buildMode.tx = clamp(tx, 0, this.world.map.w - def.size);
    this.buildMode.ty = clamp(ty, 0, this.world.map.h - def.size);
    this.buildMode.valid = this.world.canPlace(
      this.world.humanIndex, this.buildMode.type, this.buildMode.tx, this.buildMode.ty);
    this.renderer.ghost = this.buildMode;
  }

  confirmBuild(screenX, screenY) {
    if (!this.buildMode) return;
    if (screenX !== undefined) this.updateGhost(screenX, screenY);
    const { type, tx, ty, valid } = this.buildMode;
    if (!valid) {
      this.ui.toast('Emplacement impossible ici', 'error');
      this.audio.play('error');
      return;
    }
    const builders = this.selection.filter((e) => e.kind === 'unit' && e.isVillager);
    const crew = builders.length ? builders : this.pickNearestVillagers(tx, ty, 2);
    // Qui était déjà sur un chantier ? Pour eux, la pose s'ajoute à la file.
    const dejaOccupes = crew.filter((v) => v.state === 'build').length;
    const site = this.world.placeBuilding(this.world.humanIndex, type, tx, ty, crew);
    if (site) {
      this.audio.play('place');
      this.vibrate(14);
      const fiche = ficheDe(type, this.civ);
      const nom = fiche.name;
      const ouvriers = `${crew.length} ouvrier${crew.length > 1 ? 's' : ''}`;
      this.ui.toast(dejaOccupes === crew.length && crew.length > 0
        ? `${nom} ajouté${fiche.fem ? 'e' : ''} à la file — ${ouvriers}`
        : `${nom} lancé${fiche.fem ? 'e' : ''} — ${ouvriers}`);
      this.cancelBuild();
    }
  }

  pickNearestVillagers(tx, ty, count) {
    const x = tx * TILE, y = ty * TILE;
    return this.world.units
      .filter((u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager
        && villagerTask(u) !== 'abri')   // à l'abri, il ne viendrait pas bâtir
      .sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y))
      .slice(0, count);
  }

  cancelBuild() {
    this.buildMode = null;
    this.renderer.ghost = null;
    this.ui.closeBuildMenu();
    this.ui.setBuildHint('');
  }

  cancelConstruction(building) {
    // Le chantier qui tient seul le camp en jeu (Classique : plus rien d'autre
    // qui forme des troupes) : deux appuis, comme pour « Détruire ».
    if (this.world.destructionFatale(building) && !this.demolitionEnAttente(building)) {
      this.demolitionArmee = { id: building.id, jusqua: performance.now() + 3000 };
      this.ui.toast('Ce chantier seul vous tient en jeu : l’annuler, c’est perdre la partie. Touchez « Confirmer » pour l’annuler.', 'error');
      this.ui.refreshSelection(true);
      return;
    }
    if (this.world.cancelConstruction(building)) {
      this.ui.toast('Chantier annulé, ressources rendues');
      this.setSelection([]);
    }
  }

  /** Destruction demandée une première fois, en attente de confirmation (sinon null). */
  demolitionEnAttente(building) {
    const d = this.demolitionArmee;
    return !!d && d.id === building.id && performance.now() < d.jusqua;
  }

  /**
   * Détruire un de ses bâtiments : deux appuis, trois secondes au plus
   * d'écart. Un seul appui rasait le Centre-Ville — en Express, la défaite
   * sur-le-champ, pour un doigt qui visait « Ralliement » juste à côté.
   */
  demolish(building) {
    if (!this.demolitionEnAttente(building)) {
      this.demolitionArmee = { id: building.id, jusqua: performance.now() + 3000 };
      // Celui qui tient seul le camp en jeu : le dernier Centre-Ville en
      // Express ; en Classique, le dernier Centre-Ville ou bâtiment militaire.
      const dernier = this.world.destructionFatale(building);
      this.ui.toast(dernier
        ? `Votre dernier ${building.type === 'towncenter' ? nomDe('towncenter', this.civ) : 'bâtiment militaire'} : le détruire, c’est perdre la partie. Touchez « Confirmer » pour le raser.`
        : `Touchez « Confirmer » pour raser : ${ficheDe(building.type, building.player.civ).name}.`, dernier ? 'error' : 'info');
      this.ui.refreshSelection(true);
      return;
    }
    this.demolitionArmee = null;
    // Les occupants sortent, la file payée est rendue (voir World.raserBatiment).
    const { sortis, rembourse } = this.world.raserBatiment(building);
    const fiche = ficheDe(building.type, building.player.civ);
    const suites = [];
    if (sortis > 0) suites.push(`${sortis} unité(s) sortie(s)`);
    if (rembourse) suites.push('file remboursée');
    this.ui.toast(`${fiche.name} détruit${fiche.fem ? 'e' : ''}${suites.length ? ' — ' + suites.join(', ') : ''}`);
    this.setSelection([]);
  }

  trainUnit(building, unitType) {
    this.world.trainUnit(building, unitType);
    prevoirTroupe(unitType, building.player.civ);   // son modèle se cuit pendant la formation
  }
  researchTech(building, techId) { this.world.researchTech(building, techId); }
  advanceAge(building) {
    if (this.world.advanceAge(building)) this.ui.toast('Passage à l’âge suivant lancé…', 'good');
  }

  // --- Ouvriers : c'est le joueur qui affecte -------------------------------

  humanVillagers() {
    return this.world.units.filter(
      (u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager);
  }

  /** Répartition des villageois par métier, pour la barre et le panneau. */
  workerStats() {
    const stats = { food: 0, wood: 0, gold: 0, build: 0, move: 0, idle: 0, total: 0 };
    for (const v of this.humanVillagers()) {
      const task = villagerTask(v);
      if (stats[task] === undefined) stats[task] = 0;
      stats[task]++;
      stats.total++;
    }
    return stats;
  }

  villagersWithTask(task) {
    return this.humanVillagers().filter((v) => villagerTask(v) === task);
  }

  selectWorkerGroup(task) {
    const group = this.villagersWithTask(task);
    if (group.length === 0) { this.ui.toast(`Aucun ${this.ouvrier()} à ce poste`); return; }
    this.setSelection(group);
    this.camera.centerOn(group[0].x, group[0].y);
    this.audio.play('select');
  }

  /**
   * Villageois qu'on peut détourner : les inactifs d'abord, puis ceux en
   * déplacement, enfin le métier le plus fourni — jamais les bâtisseurs, pour
   * ne pas abandonner un chantier en cours (la ligne « Chantiers » a son −).
   */
  availableWorkers(exclude) {
    let pool = this.villagersWithTask('idle');
    if (pool.length === 0) pool = this.villagersWithTask('move');
    if (pool.length === 0) {
      const stats = this.workerStats();
      const from = ['food', 'wood', 'gold']
        .filter((t) => t !== exclude && stats[t] > 0)
        .sort((a, b) => stats[b] - stats[a])[0];
      if (from) pool = this.villagersWithTask(from);
    }
    if (pool.length === 0) { this.ui.toast(`Aucun ${this.ouvrier()} disponible`); this.audio.play('error'); return null; }
    return pool;
  }

  /** Y a-t-il quelqu'un à détourner ? (pour griser un bouton, sans message) */
  hasSpareWorker() {
    const s = this.workerStats();
    return (s.idle + s.move + s.food + s.wood + s.gold) > 0;
  }

  constructionSites() { return this.world.constructionSites(this.world.humanIndex); }

  /**
   * Envoie un villageois de plus sur une ressource — ou sur un chantier, qui
   * est un poste comme un autre : même bouton, même geste.
   */
  assignWorker(type) {
    const pool = this.availableWorkers(type);
    if (!pool) return false;
    if (type === 'build') return this.assignWorkerToSite(pool);

    // On prend celui qui a le moins de chemin à faire.
    let best = null, bestD = Infinity;
    for (const v of pool) {
      const res = this.world.findNearestResource(v.x, v.y, type, 40 * TILE, this.world.humanIndex);
      if (!res) continue;
      const rx = res.kind === 'building' ? res.x : res.tx * TILE + TILE / 2;
      const ry = res.kind === 'building' ? res.y : res.ty * TILE + TILE / 2;
      const d = dist2(v.x, v.y, rx, ry);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (!best || !this.world.assignVillager(best, type)) {
      const labels = { food: 'nourriture', wood: 'bois', gold: 'or' };
      this.ui.toast(`Plus de ${labels[type]} à portée — construisez une ferme ou explorez`, 'warn');
      this.audio.play('error');
      return false;
    }
    this.audio.play('order');
    this.vibrate(8);
    return true;
  }

  /**
   * Renfort sur un chantier : exactement le même geste que « +1 sur le bois ».
   * `site` fixe la destination (bouton du panneau) ; sinon on laisse le monde
   * choisir le chantier qui manque le plus de bras.
   */
  assignWorkerToSite(pool, site = null) {
    const sites = site ? [site] : this.constructionSites();
    if (sites.length === 0) {
      this.ui.toast('Aucun chantier en cours — posez un bâtiment d’abord', 'warn');
      this.audio.play('error');
      return false;
    }
    // Celui qui a le moins de chemin à faire jusqu'à un chantier.
    let best = null, bestD = Infinity;
    for (const v of pool) {
      for (const s of sites) {
        const d = dist2(v.x, v.y, s.x, s.y);
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    if (!best || !this.world.assignBuilder(best, sites)) {
      this.ui.toast(`Aucun ${this.ouvrier()} ne peut rejoindre le chantier`, 'warn');
      this.audio.play('error');
      return false;
    }
    this.audio.play('order');
    this.vibrate(8);
    return true;
  }

  /** Bouton « +1 ouvrier » d'un chantier sélectionné. */
  reinforceSite(site) {
    const pool = this.availableWorkers('build');
    if (!pool) return false;
    if (!this.assignWorkerToSite(pool, site)) return false;
    const n = this.world.buildersOn(site);
    this.ui.toast(`Ouvrier envoyé — ${n} ouvrier${n > 1 ? 's' : ''} sur ce chantier`, 'good');
    return true;
  }

  /** Retire un villageois d'un poste : il redevient disponible. */
  unassignWorker(type) {
    const group = this.villagersWithTask(type);
    if (group.length === 0) return false;
    // On libère en priorité quelqu'un qui n'a rien dans les bras.
    const target = group.find((v) => v.carry.amount < 1) || group[0];
    target.stop();
    this.audio.play('click');
    return true;
  }

  autoWorkers() { return this.world.players[this.world.humanIndex].autoWorkers; }

  /** La civilisation du joueur : celle des menus et des messages qui lui parlent. */
  get civ() { return this.world.players[this.world.humanIndex].civ; }

  /** « villageois » ou « fellah(s) », pour les messages. */
  ouvrier(n = 1) { return nomDe('villager', this.civ, n).toLowerCase(); }

  setAutoWorkers(on) {
    this.world.players[this.world.humanIndex].autoWorkers = !!on;
    saveAutoWorkers(!!on);
    this.ui.toast(on
      ? 'Réaffectation automatique activée'
      : `Réaffectation manuelle : vos ${this.ouvrier(2)} attendront vos ordres`);
  }

  // --- Confort --------------------------------------------------------------

  idleVillagers() {
    return this.world.units.filter(
      (u) => !u.dead && u.playerIndex === this.world.humanIndex && u.isVillager && u.state === 'idle'
        && !u.garrisonedIn);   // à l'abri, il n'attend pas d'ordres
  }

  focusIdleVillager() {
    const idle = this.idleVillagers();
    if (idle.length === 0) { this.ui.toast(`Aucun ${this.ouvrier()} inactif`); return; }
    this.idleIndex = ((this.idleIndex || 0) + 1) % idle.length;
    const villager = idle[this.idleIndex];
    this.setSelection([villager]);
    this.camera.centerOn(villager.x, villager.y);
    this.audio.play('select');
  }

  focusTownCenter() {
    const tc = this.world.buildings.find(
      (b) => !b.dead && b.playerIndex === this.world.humanIndex && b.type === 'towncenter');
    if (tc) { this.camera.centerOn(tc.x, tc.y); this.setSelection([tc]); }
  }

  /** L'alerte d'attaque touchée : la vue va au dernier endroit où l'on a été frappé. */
  voirAttaque() {
    const lieu = this.lastAttackPoint;
    if (lieu) this.camera.centerOn(lieu.x, lieu.y);
  }

  minimapJump(nx, ny) {
    const map = this.world.map;
    this.camera.centerOn(clamp(nx, 0, 1) * map.pixelWidth, clamp(ny, 0, 1) * map.pixelHeight);
  }

  deleteSelected() {
    const mine = this.selection.filter((e) => e.playerIndex === this.world.humanIndex);
    // Un bâtiment passe par son bouton, garde-fous compris (« Détruire » en
    // deux appuis) : la touche rasait d'un coup jusqu'au dernier Centre-Ville.
    const batiment = mine.find((e) => e.kind === 'building');
    if (batiment) {
      if (batiment.complete) this.demolish(batiment); else this.cancelConstruction(batiment);
      return;
    }
    for (const e of mine) this.world.killEntity(e, null, false);
    this.setSelection([]);
  }

  onEscape() {
    if (!document.getElementById('worker-menu').classList.contains('hidden')) {
      this.ui.closeWorkerMenu();
      return;
    }
    if (this.buildMode) { this.cancelBuild(); return; }
    if (this.attackMoveArmed || this.rallyArmed || this.garrisonArmed || this.consigneArmee) {
      this.attackMoveArmed = false; this.rallyArmed = false; this.garrisonArmed = false; this.consigneArmee = false;
      this.ui.setBuildHint('');
      this.ui.refreshSelection(true);
      return;
    }
    if (this.selection.length) { this.setSelection([]); return; }
    this.togglePause();
  }

  togglePause() {
    if (this.world.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) this.ui.showPause(); else this.ui.hideModal();
  }

  /** Par équipes : l'allié du joueur que tient l'ordinateur — celui à qui l'on peut donner une consigne —, ou null. */
  allieOrdinateur() {
    const w = this.world;
    if (!w.parEquipes) return null;
    return w.coequipiersDe(w.humanIndex).find((p) => !p.defeated && w.ais.some((ia) => ia.index === p.index)) || null;
  }

  /** Donne une consigne à l'allié : 'attaquer' (le prochain toucher sur la carte dit où), 'defendre', 'libre'. */
  consigner(type) {
    const allie = this.allieOrdinateur();
    if (!allie) { this.ui.toast('Votre allié est hors de combat'); return; }
    if (type === 'attaquer') {
      this.consigneArmee = true;
      this.ui.setBuildHint('Touchez l’endroit que votre allié doit attaquer');
      return;
    }
    if (this.world.consigner(this.world.humanIndex, allie.index, type)) {
      this.audio.play('order');
      if (type === 'defendre') this.annoncerConsigne(allie, type);
      else this.ui.toast('Votre allié reprend sa conduite', 'good');
    } else this.audio.play('error');
  }

  /**
   * Dit ce que l'allié fait vraiment de la consigne : combien de soldats
   * partent — ou pourquoi aucun ne part tout de suite (il n'en a pas au camp,
   * ou il repousse lui-même une attaque). La consigne reste alors en attente.
   */
  annoncerConsigne(allie, type) {
    this.ui.toast(texteDeConsigne(this.world.ais.find((ia) => ia.index === allie.index), type), 'good');
  }

  toggleSound() {
    const on = !this.audio.enabled;
    this.audio.setEnabled(on);
    document.getElementById('btn-sound').innerHTML = iconeSVG(on ? 'son' : 'sonCoupe', 19);
    if (on) { this.audio.resume(); this.audio.play('click'); }
  }

  /** Écrit l'instantané de la partie en cours. */
  saveNow() {
    if (this.world.gameOver) { clearSave(); return false; }
    const ok = saveGame(this.world, { speed: this.speedId, ...(this.classee ? { classee: true, partieId: this.partieId } : {}) });
    // Navigation privée, quota plein : mieux vaut le dire une fois que laisser
    // croire que la partie sera retrouvée.
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.ui.toast('Sauvegarde impossible sur cet appareil : la partie ne pourra pas être reprise', 'warn');
    }
    return ok;
  }

  /** Style des personnages : modèle 3D, illustration animée ou peinture réduite. */
  setStyleUnites(id) {
    setStyleUnites(id);
    try { localStorage.setItem(STYLE_KEY, styleUnites()); } catch { /* stockage indisponible */ }
    // Une civilisation qui a ses propres modèles 3D ne suit pas le style : le
    // message ne doit pas annoncer un changement que l'écran ne montre pas.
    const moi = this.civ, adverse = this.world.adversaire(this.world.humanIndex).civ;
    const miennes = troupesSelonStyle(moi), adverses = troupesSelonStyle(adverse);
    // (Le chevalier d'essai n'habille que le milicien, sous le nom que lui donne la civilisation.)
    const essai = miennes.includes('militia') ? `${nomDe('militia', moi)} : chevalier d’essai` : null;
    const messages = {
      '3d': 'Personnages : tes modèles 3D animés',
      anime: 'Personnages : marche dessinée',
      peint: 'Personnages : illustration peinte',
      '3d-precalc': essai ? `${essai} rendu à l’avance` : 'Personnages : marche dessinée',
      '3d-direct': essai ? `${essai} animé en direct` : 'Personnages : marche dessinée',
    };
    if (miennes.length === 0) {
      this.ui.toast(adverses.length === 0
        ? 'Style : rien ne change, les troupes de cette partie n’ont que leur modèle 3D'
        : `Style : seules les troupes des ${CIVILISATIONS[adverse].name} changent, les tiennes n’ont que leur modèle 3D`);
    } else if (styleUnites() === '3d-direct' && !webglDisponible()) {
      this.ui.toast('3D en direct : WebGL indisponible ici — le rendu précalculé le remplace', 'warn');
    } else {
      this.ui.toast(messages[styleUnites()]);
    }
  }

  styleUnites() { return styleUnites(); }

  /** Vitesse de jeu : un multiplicateur sur la boucle, la simulation ne change pas. */
  setSpeed(id) {
    const def = speedDef(id);
    this.speedId = def.id;
    this.speed = def.mult;
    this.renderer.vitesseJeu = this.speed;
    this.accumulator = 0;
    storeSpeed(def.id);
    this.ui.toast(`Vitesse : ${def.name} (${def.short})`);
    this.ui.refreshSelection(true);
  }

  vibrate(pattern) {
    if (navigator.vibrate && this.options.haptics !== false) navigator.vibrate(pattern);
  }

  resign() {
    this.paused = false;
    this.ui.hideModal();
    this.world.resign();
    clearSave();
  }

  restart() {
    this.destroy();
    clearSave();
    // Après une reprise, `options` ne porte que la sauvegarde : on relit le
    // format, la carte et les civilisations sur la partie qui s'achève.
    const w = this.world;
    const suivante = avecProgression({
      ...this.options, restore: null,
      mode: w.modeId, difficulty: w.difficultyId, mapSize: w.mapSizeId,
      civs: w.players.map((p) => p.civ), speed: this.speedId,
      seed: Math.floor(Math.random() * 1e9),
    }, this.classee);
    // (Rejouer une partie d'essai : la même troupe attend de nouveau.)
    startGame(this.essai ? pourEssai(suivante, this.essai) : { ...suivante, essai: null });
  }

  quitToMenu() {
    this.destroy();
    showStartScreen();
  }

  destroy() {
    this.saveNow();
    this.fermerMarque('accueil');
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onLeave);
    this.ecouteurs.abort();
    this.running = false;
    this.renderer.viderTroncons();   // le sol de cette partie ne servira plus : sa mémoire tout de suite
    try { rendreVariantes(); } catch { /* idem */ }   // ni les copies de l'autre camp (refaites au premier dessin)
    this.ui.hideModal();
    this.ui.closeBuildMenu();
    this.ui.closeWorkerMenu();
    this.ui.setBuildHint('');   // une consigne en cours (ordre armé, pose) ne suit pas dans la partie suivante
    document.getElementById('hud').classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------

let currentGame = null;
const stored = loadSetup();
const settings = {
  mode: GAME_MODES[stored.mode] ? stored.mode : DEFAULT_MODE,
  difficulty: DIFFICULTIES[stored.difficulty] ? stored.difficulty : 'normal',
  mapSize: MAP_SIZES[stored.mapSize] ? stored.mapSize : GAME_MODES[DEFAULT_MODE].mapSize,
  speed: loadSpeed(),
  civ: civDe(stored.civ),
  civAdverse: civDe(stored.civAdverse),
  // « classe » : la partie compte pour l'Elo, la ligue et les coffres, et
  // l'adversaire a la force de la ligue ; « libre » : le joueur le règle.
  type: stored.type === 'libre' ? 'libre' : 'classe',
};

/**
 * Ce que la progression du joueur ajoute aux réglages d'une partie neuve :
 * les niveaux de ses troupes, celles qu'il n'a pas débloquées et, en partie
 * classée, la force de l'adversaire (js/progression.js, reglagesDePartie).
 */
function avecProgression(options, classee) {
  // Par équipes : jamais classée (tant que l'allié est l'ordinateur, le
  // résultat ne dit rien du joueur). Ce que la progression donne « au joueur »
  // vaut pour son équipe, ce qu'elle donne « à l'adversaire » pour celle d'en
  // face ; de même les deux peuples choisis à l'accueil.
  const equipes = (GAME_MODES[options.mode] || {}).equipes;
  if (equipes) {
    const r = reglagesDePartie(lireProgression(), 'libre');
    const parPlace = (paire) => (Array.isArray(paire) ? equipes.map((e) => paire[e === equipes[0] ? 0 : 1]) : paire);
    return {
      ...options, ...r, classee: false, partieId: null,
      civs: parPlace(options.civs), niveaux: parPlace(r.niveaux),
      troupesInterdites: parPlace(r.troupesInterdites), troupesEnPlus: parPlace(r.troupesEnPlus),
    };
  }
  return {
    ...options, ...reglagesDePartie(lireProgression(), classee ? 'classe' : 'libre'), classee: !!classee,
    partieId: classee ? `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}` : null,
  };
}

/** La partie que l'accueil s'apprête à lancer est-elle classée ? (Jamais par équipes.) */
function partieClassee() {
  return settings.type === 'classe' && !GAME_MODES[settings.mode].equipes;
}

/**
 * La même partie libre, où `type` — une troupe pas encore débloquée — peut être
 * formée par le joueur, et où trois exemplaires l'attendent (World, `essai`).
 */
function pourEssai(options, type) {
  const [siennes = [], autres = []] = options.troupesInterdites || [];
  return { ...options, essai: type, troupesInterdites: [siennes.filter((t) => t !== type), autres] };
}

/**
 * Le bouton « Essayer » d'une fiche de troupe : lance une partie libre d'essai
 * avec les réglages de l'accueil. Une partie qui dort serait effacée : la
 * première fois on répond « confirmer », et la fiche demande un second toucher.
 */
function essayerTroupe(type, sur) {
  if (!UNIT_TYPES[type]) return 'refus';
  if (currentGame && !currentGame.world.gameOver) return 'refus';   // une partie se joue : pas d'essai par-dessus
  if (loadSave() && !sur) return 'confirmer';
  if (currentGame) currentGame.destroy();
  abandonnerPartieClasseeEnCours();
  clearSave();
  startGame(pourEssai(avecProgression({
    mode: settings.mode, difficulty: settings.difficulty, mapSize: settings.mapSize,
    civs: [settings.civ, settings.civAdverse],
    speed: settings.speed, seed: Math.floor(Math.random() * 1e9),
  }, false), type));
  return 'lancee';
}

/**
 * Une partie classée laissée en plan — une autre est lancée, ou la sauvegarde
 * est jetée — compte comme un abandon : sans cela il suffirait de quitter une
 * partie mal engagée pour ne jamais perdre de points.
 */
function abandonnerPartieClasseeEnCours() {
  const save = loadSave();
  if (!save || !save.classee) return;
  const r = appliquerResultat(lireProgression(), {
    issue: 'abandon', duree: save.time || 0, contreOrdinateur: 'echelle', jour: jourLocal(), instant: Date.now() / 1000,
    id: save.partieId || undefined, format: save.mode,
  });
  ecrireProgression(r.profil);
}

/** Le bandeau de ligue de l'accueil : la ligue, le score, les coffres à ouvrir, les troupes à améliorer. */
function refreshLigue() {
  const box = document.getElementById('ligue-box');
  if (box) box.innerHTML = htmlBandeau(lireProgression());
}

/** En partie classée, la difficulté ne se choisit pas : l'adversaire suit la ligue. */
function refreshType() {
  const classee = partieClassee();
  // (Par équipes : la partie n'est jamais classée, et l'accueil le dit.)
  const equipes = document.getElementById('equipes-note');
  if (equipes) equipes.classList.toggle('hidden', !GAME_MODES[settings.mode].equipes);
  const note = document.getElementById('difficulte-classee');
  if (note) note.classList.toggle('hidden', !classee);
  const boite = document.getElementById('difficulty-options');
  if (boite) boite.classList.toggle('inactives', classee);
}

/**
 * La dernière partie a-t-elle été coupée ? (Le témoin de coupure, js/save.js.)
 * L'accueil le dit en une ligne discrète sous la carte de reprise, jusqu'à la
 * prochaine partie lancée — même si la page est relancée entre-temps, d'où
 * l'incident « non lu » ; le menu de pause garde la trace des suivantes.
 */
let incidentAccueil = releverTemoin() || incidentNonLu();

function afficherIncident() {
  const box = document.getElementById('resume-box');
  let ligne = document.getElementById('ligne-temoin');
  if (!incidentAccueil || !box) { if (ligne) ligne.remove(); return; }
  if (!ligne) {
    ligne = document.createElement('p');
    ligne.id = 'ligne-temoin';
    ligne.className = 'resume-info';
    box.insertAdjacentElement('afterend', ligne);
  }
  ligne.textContent = phraseIncident(incidentAccueil, EN_MAGASIN);
}

/**
 * L'habillage prend les couleurs d'un peuple : celui qu'on choisit à l'accueil,
 * puis celui qu'on joue (une partie reprise garde le sien). Tout le reste se
 * passe dans la feuille de style, sous body[data-civ] — qui attend ce premier
 * appel pour montrer la carte d'accueil.
 */
function habiller(civ) {
  document.body.dataset.civ = civDe(civ);
  // La barre du navigateur suit, là où il en dessine une.
  const meta = document.querySelector('meta[name="theme-color"]');
  const fond = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  if (meta && fond) meta.content = fond;
}

/** La capitale d'un peuple, pour sa tuile de l'accueil : son image propre, à défaut le Centre-Ville atlante. */
function capitaleDe(civ) {
  const propre = ficheCiv('towncenter', civ);
  return propre ? propre.src : 'assets/centre-ville.webp';
}

/** Les réglages repliés, résumés sur leur ligne. */
function refreshReglages() {
  const node = document.getElementById('reglages-resume');
  if (!node) return;
  const resume = resumeReglages(settings);
  // En partie classée, la difficulté choisie ne joue pas : elle sort du résumé.
  node.textContent = partieClassee()
    ? `Classée · ${resume.replace(` · ${DIFFICULTIES[settings.difficulty].name}`, '')}`
    : `Libre · ${resume}`;
}

function showStartScreen() {
  currentGame = null;
  musique.mettre('menu');
  habiller(settings.civ);
  document.getElementById('start-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  refreshResumeCard();
  afficherIncident();
  refreshPalmares();
  refreshReglages();
  reglerPeuple(settings.civ);
  refreshLigue();
  refreshType();
}

/**
 * Le palmarès du format et de la difficulté choisis, en une ligne sous le
 * bouton Jouer. Rien tant qu'il n'y a ni victoire ni score à montrer.
 */
function refreshPalmares() {
  const node = document.getElementById('palmares');
  if (!node) return;
  // (En partie classée, c'est le bandeau de ligue qui dit où l'on en est.)
  const resume = partieClassee() ? '' : resumePalmares(lignePalmares(lirePalmares(), settings.mode, settings.difficulty));
  node.textContent = resume
    ? `${GAME_MODES[settings.mode].name}, ${DIFFICULTIES[settings.difficulty].name} : ${resume}`
    : '';
  node.classList.toggle('hidden', !resume);
}

/**
 * « Jouer » quand une partie dort : la lancer efface l'autre, et le bouton est
 * resté sous le pouce. Il s'arme au premier toucher et n'efface qu'au second
 * (voir toucherNouvellePartie) ; passé le délai, il se désarme tout seul.
 */
let partieEnAttente = false;   // la carte « Reprendre » est affichée
let effacerJusqua = 0;         // « Nouvelle partie » armé jusqu'à cet instant (0 : au repos)
let minuterieEffacer = 0;

/** Le bouton dit ce qu'il fait : « Jouer », « Nouvelle partie » quand une partie dort — sans l'or, laissé à « Reprendre » —, et sa question quand il est armé. */
function refreshJouer() {
  const play = document.getElementById('btn-play');
  if (!play) return;
  const arme = partieEnAttente && performance.now() < effacerJusqua;
  play.textContent = arme ? 'Effacer la partie en cours ?' : partieEnAttente ? 'Nouvelle partie' : 'Jouer';
  play.classList.toggle('primary', !partieEnAttente);
  play.classList.toggle('arme', arme);
}

/** Arme « Nouvelle partie » jusqu'à l'instant donné, ou le désarme (0). */
function armerNouvellePartie(jusqua) {
  clearTimeout(minuterieEffacer);
  effacerJusqua = jusqua;
  if (jusqua) minuterieEffacer = setTimeout(() => armerNouvellePartie(0), Math.max(0, jusqua - performance.now()));
  refreshJouer();
}

/** Carte « reprendre » : n'apparaît que s'il y a vraiment une partie en cours. */
function refreshResumeCard() {
  const box = document.getElementById('resume-box');
  if (!box) return;
  const save = loadSave();
  // La carte change : le bouton du bas redit ce qu'il fait (« Jouer », ou
  // « Nouvelle partie » quand une partie dort), et s'il était armé, il ne le reste pas.
  partieEnAttente = !!save;
  armerNouvellePartie(0);
  if (!save) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const mode = GAME_MODES[save.mode] || GAME_MODES[DEFAULT_MODE];
  const player = save.players[save.humanIndex || 0];
  const age = AGES[player ? player.age : 0];
  const civs = save.players.map((p) => CIVILISATIONS[civDe(p && p.civ)].name);
  const moi = save.humanIndex || 0;
  // (Par équipes, le peuple d'en face est celui de la dernière place ; à deux camps, l'autre.)
  const face = save.players.length > 2 ? save.players.length - 1 : 1 - moi;
  box.classList.remove('hidden');
  // Sur un format chronométré, ce qui compte c'est le temps qu'il reste.
  const chrono = mode.timeLimit
    ? `reste ${formatClock(Math.max(0, mode.timeLimit - save.time))}`
    : formatClock(save.time);
  box.innerHTML = `
    <button id="btn-resume" class="btn primary large">Reprendre la partie</button>
    <p class="resume-info">${civs[moi]} contre ${civs[face]} · ${iconeSVG(mode.icon, 13, 'inline')} ${mode.name} · ${age.name} · ${chrono}
      · ${DIFFICULTIES[save.difficulty] ? DIFFICULTIES[save.difficulty].name : ''}</p>
    ${save.classee ? '<p class="resume-info">Partie classée : la quitter compte comme une défaite.</p>' : ''}
    <button id="btn-drop-save" class="btn ghost small">Abandonner cette partie</button>`;
  document.getElementById('btn-resume').addEventListener('click', () => {
    audio.resume(); audio.play('click');
    startGame({ restore: save, speed: settings.speed });
  });
  document.getElementById('btn-drop-save').addEventListener('click', () => {
    abandonnerPartieClasseeEnCours();
    clearSave();
    audio.play('click');
    refreshResumeCard();
    refreshLigue();
  });
}

function formatClock(seconds) {
  const m = Math.floor((seconds || 0) / 60), sec = Math.floor((seconds || 0) % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function startGame(options) {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  audio.resume();
  musique.mettre('partie');
  incidentAccueil = null;
  try { marquerIncidentsLus(); } catch { /* stockage indisponible */ }
  currentGame = new Game(options);
  habiller(currentGame.civ);
  reglerPeuple(currentGame.civ);
  window.__jeu = currentGame;   // pratique pour déboguer depuis la console
}

function setupStartScreen() {
  const modeBox = document.getElementById('mode-options');
  modeBox.innerHTML = Object.values(GAME_MODES).map((m) => `
    <button class="option ${m.id === settings.mode ? 'active' : ''}" data-mode="${m.id}">
      <span class="option-name">${iconeSVG(m.icon, 17, 'inline')} ${m.name}</span>
      <span class="option-desc">${m.desc}</span>
    </button>`).join('');

  const speedBox = document.getElementById('speed-options');
  speedBox.innerHTML = GAME_SPEEDS.map((sp) => `
    <button class="option compact ${sp.id === settings.speed ? 'active' : ''}" data-speed="${sp.id}">
      <span class="option-name">${sp.name}</span>
      <span class="option-desc">${sp.short}</span>
    </button>`).join('');

  const difficultyBox = document.getElementById('difficulty-options');
  difficultyBox.innerHTML = Object.values(DIFFICULTIES).map((d) => `
    <button class="option ${d.id === settings.difficulty ? 'active' : ''}" data-difficulty="${d.id}">
      <span class="option-name">${d.name}</span>
      <span class="option-desc">${d.desc}</span>
    </button>`).join('');

  const mapBox = document.getElementById('map-options');
  mapBox.innerHTML = Object.values(MAP_SIZES).map((m) => `
    <button class="option compact ${m.id === settings.mapSize ? 'active' : ''}" data-map="${m.id}">
      <span class="option-name">${m.name}</span>
      <span class="option-desc">${m.tiles}×${m.tiles}</span>
    </button>`).join('');

  const activate = (box, btn) => box.querySelectorAll('.option').forEach(
    (b) => b.classList.toggle('active', b === btn));

  // Classée ou libre.
  const typeBox = document.getElementById('type-options');
  typeBox.innerHTML = [
    { id: 'classe', name: 'Classée', desc: 'Elo, ligues et coffres' },
    { id: 'libre', name: 'Libre', desc: 'Tu règles l’adversaire' },
  ].map((t) => `
    <button class="option compact ${t.id === settings.type ? 'active' : ''}" data-type="${t.id}">
      <span class="option-name">${t.name}</span>
      <span class="option-desc">${t.desc}</span>
    </button>`).join('');
  typeBox.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.type = btn.dataset.type;
      storeSetup(settings);
      activate(typeBox, btn);
      refreshType();
      refreshPalmares();
      refreshReglages();
      audio.resume(); audio.play('click');
    });
  });

  // Civilisations : la sienne, puis celle de l'adversaire (mêmes règles, autres images, autres noms).
  // La sienne se choisit sur l'image de sa capitale, et l'accueil en prend aussitôt les couleurs.
  const choixCiv = (idBoite, cle, illustre) => {
    const box = document.getElementById(idBoite);
    box.innerHTML = Object.values(CIVILISATIONS).map((c) => `
    <button class="option compact ${illustre ? 'peuple ' : ''}${c.id === settings[cle] ? 'active' : ''}" data-civ="${c.id}">
      ${illustre ? `<img src="${capitaleDe(c.id)}" alt="" decoding="async">` : ''}
      <span class="option-name">${c.name}</span>
      <span class="option-desc">${c.desc}</span>
    </button>`).join('');
    box.querySelectorAll('[data-civ]').forEach((btn) => {
      btn.addEventListener('click', () => {
        settings[cle] = btn.dataset.civ;
        storeSetup(settings);
        activate(box, btn);
        if (illustre) habiller(settings[cle]);
        if (illustre) reglerPeuple(settings[cle]);   // les écrans des troupes en prennent les noms et les portraits
        refreshReglages();
        chargerCivilisation(settings[cle]);   // ses images arrivent pendant que le joueur finit de choisir
        audio.resume(); audio.play('click');
      });
    });
  };
  choixCiv('civ-options', 'civ', true);
  choixCiv('civ-adverse-options', 'civAdverse', false);

  modeBox.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.mode = btn.dataset.mode;
      // Chaque format a sa carte de prédilection ; rien n'empêche d'en changer.
      settings.mapSize = GAME_MODES[settings.mode].mapSize;
      storeSetup(settings);
      activate(modeBox, btn);
      mapBox.querySelectorAll('[data-map]').forEach(
        (b) => b.classList.toggle('active', b.dataset.map === settings.mapSize));
      refreshType();   // par équipes, la partie n'est pas classée : la note et la difficulté suivent
      refreshPalmares();
      refreshReglages();
      audio.resume(); audio.play('click');
    });
  });
  speedBox.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.speed = btn.dataset.speed;
      storeSpeed(settings.speed);
      storeSetup(settings);
      activate(speedBox, btn);
      refreshReglages();
      audio.resume(); audio.play('click');
    });
  });

  difficultyBox.querySelectorAll('[data-difficulty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.difficulty = btn.dataset.difficulty;
      storeSetup(settings);
      difficultyBox.querySelectorAll('.option').forEach((b) => b.classList.toggle('active', b === btn));
      refreshPalmares();
      refreshReglages();
      audio.resume(); audio.play('click');
    });
  });
  mapBox.querySelectorAll('[data-map]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.mapSize = btn.dataset.map;
      storeSetup(settings);
      mapBox.querySelectorAll('.option').forEach((b) => b.classList.toggle('active', b === btn));
      refreshReglages();
      audio.resume(); audio.play('click');
    });
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    // Une partie dort : deux touchers pour l'effacer, comme « Détruire » en
    // partie. Pas de boîte de confirmation : une fenêtre modale native peut
    // être bloquée selon l'hébergement.
    const toucher = toucherNouvellePartie(partieEnAttente, effacerJusqua, performance.now());
    armerNouvellePartie(toucher.armeJusqua);
    if (!toucher.lancer) { audio.resume(); audio.play('click'); return; }
    // (Si c'était une partie classée, l'effacer compte comme un abandon.)
    abandonnerPartieClasseeEnCours();
    clearSave();
    startGame(avecProgression({
      mode: settings.mode, difficulty: settings.difficulty, mapSize: settings.mapSize,
      civs: [settings.civ, settings.civAdverse],   // indice = numéro du joueur
      speed: settings.speed, seed: Math.floor(Math.random() * 1e9),
    }, partieClassee()));
  });
  // (Son pictogramme vient de la même source que les autres : js/icones.js.)
  const boutonAide = document.getElementById('btn-howto');
  boutonAide.insertAdjacentHTML('afterbegin', iconeSVG('info', 16, 'inline'));
  boutonAide.addEventListener('click', () => {
    const aide = document.getElementById('howto');
    aide.classList.toggle('hidden');
    boutonAide.setAttribute('aria-expanded', String(!aide.classList.contains('hidden')));
    // La liste s'ouvre sous les boutons, souvent hors de l'écran : on l'y amène.
    if (!aide.classList.contains('hidden')) aide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

installerProgression({ quandLeProfilChange: refreshLigue, quandOnEssaie: essayerTroupe, guichet: guichetParDefaut() });
// Là où la page offre un rangement par personne, le profil y est gardé aussi :
// s'il y est plus avancé qu'ici (autre appareil, stockage effacé), il revient.
brancherRangementDurable({ hote: window.claude || hoteDeLApplication(), lire: lireProgression, ecrire: ecrireProgression }).then((rangement) => {
  if (!rangement) return;
  quandLaProgressionSEcrit(rangement.recopier);
  if (rangement.adopte && !currentGame) refreshLigue();
}).catch(() => { /* sans rangement durable, le navigateur suffit */ });
setupStartScreen();
showStartScreen();
// Le son ne peut naître que d'un geste : le premier, où qu'il tombe, lance la musique de l'accueil.
for (const geste of ['pointerup', 'touchend', 'click', 'keydown']) {
  document.addEventListener(geste, function premierGeste() {
    audio.resume();
    if (audio.ctx && audio.ctx.state === 'running') document.removeEventListener(geste, premierGeste, true);
  }, true);
}
// Page à l'arrière-plan : plus un son, musique comprise ; au retour, tout reprend.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') audio.suspendre(); else if (audio.ctx) audio.resume();
});
// Le nom du jeu vient d'un seul endroit (js/edition.js) : le titre de la page et celui du couvercle le suivent.
{
  const titre = document.querySelector('#start-screen h1');
  if (titre) {
    titre.textContent = `${NOM_DU_JEU.titre} `;
    if (NOM_DU_JEU.suite) { const suite = document.createElement('em'); suite.textContent = NOM_DU_JEU.suite; titre.append(suite); }
  }
  document.title = nomComplet();
  // (L'application n'est pas une page web, et n'a pas de compte où ranger la progression.)
  const note = document.getElementById('note-autonome');
  if (note && EN_MAGASIN) note.textContent = 'Le jeu fonctionne sans connexion. Ta progression est gardée sur cet appareil.';
}
// Les illustrations se chargent — et les unités en 3D se cuisent — pendant
// que le joueur choisit sa partie : elles sont prêtes quand elle commence.
setStyleUnites(loadStyle());
chargerSprites();
// (Après : villageois et milicien atlantes, qui servent de repli, se cuisent d'abord.)
chargerCivilisation(settings.civ);
chargerCivilisation(settings.civAdverse);
// Si la cuisson finit en pleine partie, les personnages changent sous les
// yeux du joueur : on le lui dit, comme on lui dit si elle a échoué.
window.addEventListener('modeles3d', (ev) => {
  if (currentGame && currentGame.renderer) currentGame.renderer.cuissonVue();
  if (ev.detail && ev.detail.retour) return;   // une troupe déchargée revient du cache : rien à annoncer
  if (!currentGame || !currentGame.running || styleUnites() !== '3d') return;
  const e = etatModeles3d();
  if (e.etat === 'pret' && e.alleges && e.alleges.length) currentGame.ui.toast(`Personnages 3D allégés faute de mémoire (${e.alleges.join(', ')})`, 'warn');
  else if (e.etat === 'pret') currentGame.ui.toast('Tes personnages 3D sont prêts');
  else if (e.etat === 'absent') currentGame.ui.toast(`Personnages 3D indisponibles ici (${e.raison}) : dessins à la place`, 'warn');
});

// Mode hors ligne : uniquement là où le jeu est déployé en entier (le
// manifeste accompagne alors le service worker). Ailleurs — page embarquée,
// aperçu — on n'essaie même pas, pour ne pas laisser un 404 dans la console.
const deploiementComplet = document.querySelector('link[rel="manifest"]') !== null;
if (deploiementComplet && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* hors-ligne indisponible, sans gravité */ });
  });
}
