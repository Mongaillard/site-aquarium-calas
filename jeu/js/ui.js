// ---------------------------------------------------------------------------
// Interface de jeu (DOM) : barre de ressources, panneau de sélection
// contextuel, menu de construction, files de production, notifications.
// Le DOM est privilégié au canvas pour l'UI : cibles tactiles larges,
// accessibilité et zoom navigateur gratuits.
// ---------------------------------------------------------------------------

import {
  AGES, UNIT_TYPES, BUILDING_TYPES, TECHS, RESOURCE_ICONS, STANCES, GAME_SPEEDS,
  ficheDe, nomDe, portraitDe,
} from './config.js';
import { TILE, CIVILISATIONS, GAME_MODES, DIFFICULTIES, MAP_SIZES, civDe } from './config.js';
import { formatNumber, formatTime, costLabel, canAfford } from './utils.js';
import { iconeSVG, ICONES_LICENCE } from './icones.js';
import { STYLES, etatModeles3d, portraitAdverse } from './sprites.js';
import { ficheCiv, spriteDe, imagePourJoueur } from './sprites.js';
import { resumeIncident } from './save.js';

const el = (id) => document.getElementById(id);

/** Icône en ligne dans une phrase, calée sur la taille du texte. */
const ic = (cle) => iconeSVG(cle, 13, 'inline');

/** Remplace les marqueurs de coût (`<i data-cout="wood">`) par leur pictogramme. */
function poserIconesDeCout(racine) {
  for (const marqueur of racine.querySelectorAll('[data-cout]')) {
    marqueur.innerHTML = iconeSVG(marqueur.dataset.cout, 12, 'inline');
  }
}

/**
 * Portrait d'une unité adverse : seules les couleurs de son camp passent au
 * rouge (la règle de son modèle), sur une toile qui remplace l'image. Sans
 * règle connue, on retombe sur l'ancien filtre de teinte.
 */
function teinterPortrait(img, type) {
  const poser = () => {
    if (!img.isConnected) return;
    const toile = portraitAdverse(type, img);
    if (toile) img.replaceWith(toile); else img.classList.add('adverse');
  };
  if (img.complete && img.naturalWidth) poser();
  else img.addEventListener('load', poser, { once: true });
}

// --- Les images du jeu dans l'interface ---------------------------------------

/**
 * L'illustration d'un bâtiment dans cette civilisation : le fichier même que
 * la carte dessine. Null pour tout le reste (une troupe, un type inconnu) et
 * tant que l'image atlante n'est pas arrivée : l'appelant garde le pictogramme.
 */
export function imageBatiment(type, civ) {
  if (!BUILDING_TYPES[type]) return null;
  const propre = ficheCiv(type, civ);
  if (propre) return propre.src;
  const sprite = spriteDe(type);   // atlante : chargé dès l'accueil, avec le reste de la carte
  return sprite ? sprite.def.src : null;
}

/**
 * La même illustration aux couleurs d'un camp, en petit, pour le cadre du
 * portrait — ou null quand l'image d'origine fait déjà l'affaire (le camp
 * bleu) ou n'est pas prête. Une toile par bâtiment et par camp, gardée : le
 * panneau se reconstruit à chaque coup reçu.
 */
const vignettesDeCamp = new Map();
function vignetteDeCamp(type, civ, joueur) {
  const cle = `${type}|${civ}|${joueur}`;
  if (vignettesDeCamp.has(cle)) return vignettesDeCamp.get(cle);
  const sprite = spriteDe(type, civ);
  const propre = ficheCiv(type, civ);
  if (!sprite || (propre && sprite.def !== propre)) return null;   // l'image de ce peuple est encore en route
  const source = imagePourJoueur(sprite, joueur);
  if (!source || !source.getContext) return null;
  const cote = 138;   // le cadre fait 46 points : trois pixels par point
  const toile = document.createElement('canvas');
  toile.width = toile.height = cote;
  const echelle = Math.min(cote / source.width, cote / source.height);
  const l = source.width * echelle, h = source.height * echelle;
  toile.getContext('2d').drawImage(source, (cote - l) / 2, (cote - h) / 2, l, h);
  vignettesDeCamp.set(cle, toile);
  return toile;
}

/**
 * L'image de l'écran de fin : la capitale du joueur — debout pour une
 * victoire, éteinte pour une défaite. Rien pour une égalité.
 */
export function illustrationDeFin(result, civ) {
  if (!result || result.winner === -1) return null;
  const src = imageBatiment('towncenter', civ);
  return src ? { src, classe: result.victory ? 'debout' : 'tombe' } : null;
}

/**
 * Les réglages repliés de l'accueil, en une ligne : « Solariens en face ·
 * Classique · Normal · carte moyenne · ×1 ». Un réglage inconnu est passé.
 * Les espaces sont insécables à l'intérieur d'une mention et devant le point
 * qui la suit : si la ligne se replie, c'est entre deux mentions, et jamais
 * un point ne commence une ligne.
 */
export function resumeReglages(reglages) {
  const vitesse = GAME_SPEEDS.find((v) => v.id === reglages.speed);
  const carte = MAP_SIZES[reglages.mapSize];
  return [
    `${CIVILISATIONS[civDe(reglages.civAdverse)].name} en face`,
    GAME_MODES[reglages.mode]?.name,
    DIFFICULTIES[reglages.difficulty]?.name,
    carte && `carte ${carte.name.toLowerCase()}`,
    vitesse && `vitesse ${vitesse.short}`,
  ].filter(Boolean).map((mention) => mention.replace(/ /g, '\u00a0')).join('\u00a0· ');
}

/** « Nouvelle partie » touché alors qu'une partie dort : le temps laissé au second toucher, comme pour « Détruire ». */
export const DELAI_EFFACER = 3000;

/**
 * Un toucher sur « Jouer » : lancer, ou demander confirmation ? Sans partie à
 * reprendre, on lance. Quand une partie dort, la lancer l'efface : le premier
 * toucher arme le bouton (il demande « Effacer la partie en cours ? ») et seul
 * un second, avant `armeJusqua`, lance pour de bon. Passé ce délai, tout est
 * à refaire. Rend ce qu'il faut faire et la nouvelle échéance (0 : désarmé).
 */
export function toucherNouvellePartie(partieEnCours, armeJusqua, maintenant) {
  if (!partieEnCours || maintenant < armeJusqua) return { lancer: true, armeJusqua: 0 };
  return { lancer: false, armeJusqua: maintenant + DELAI_EFFACER };
}

// --- Alerte d'attaque et armée : la logique, sans DOM (vérifiée sous node) ---

/** Au-delà de cette distance d'une alerte encore chaude, c'est une autre attaque : à peu près un écran. */
const RAYON_FOYER = 16 * TILE;
/** Secondes pendant lesquelles un foyer annoncé ne redit rien (le délai d'avant, mais par foyer). */
const SILENCE_FOYER = 12;
/** Secondes pendant lesquelles son repère pulse sur la mini-carte — et son message reste à toucher. */
export const DUREE_REPERE = 6;
/** Secondes entre deux alertes, tous foyers confondus : deux attaques à la fois ne sonnent pas en chœur. */
const ECART_ALERTES = 3;

/**
 * Alertes d'attaque : une par FOYER. Un seul délai pour toute la carte faisait
 * taire douze secondes le raid sur le village pendant que l'armée se battait
 * au loin. Chaque alerte garde donc son lieu : les coups reçus autour d'elle
 * ne redisent rien tant qu'elle est chaude, une attaque ailleurs a droit à la
 * sienne. `liste` sert aussi à la mini-carte (Renderer.drawMinimap).
 */
export class FoyersAttaque {
  constructor() {
    this.liste = [];     // { x, y, repere, silence } : secondes qu'il reste à chacun
    this.attente = 0;    // secondes avant qu'une autre alerte puisse sonner
  }

  /** Un coup reçu en (x, y) : vrai s'il ouvre un foyer, donc s'il faut l'annoncer. */
  signaler(x, y) {
    if (this.attente > 0) return false;
    if (this.liste.some((f) => Math.hypot(f.x - x, f.y - y) < RAYON_FOYER)) return false;
    this.liste.push({ x, y, repere: DUREE_REPERE, silence: SILENCE_FOYER });
    this.attente = ECART_ALERTES;
    return true;
  }

  /** Le temps passe, en secondes réelles : un foyer refroidi pourra de nouveau alerter. */
  vieillir(dt) {
    if (this.attente > 0) this.attente -= dt;
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const f = this.liste[i];
      f.repere -= dt;
      f.silence -= dt;
      if (f.silence <= 0) this.liste.splice(i, 1);   // sur place : le rendu tient la même liste
    }
  }
}

/** L'armée d'un joueur : toutes ses unités qui ne sont ni des ouvriers ni des animaux, abritées comprises. */
export function armeeDe(world, joueur) {
  return world.units.filter((u) => !u.dead && u.playerIndex === joueur && !u.isVillager && !u.isAnimal);
}

/**
 * Où poser la vue pour voir une armée : sur le soldat le plus proche de son
 * centre. Le centre lui-même tombe en rase campagne dès que l'armée est en
 * deux groupes ; le soldat qui en est le plus près est dans le plus gros.
 */
export function coeurDe(unites) {
  if (unites.length === 0) return null;
  let cx = 0, cy = 0;
  for (const u of unites) { cx += u.x; cy += u.y; }
  cx /= unites.length; cy /= unites.length;
  let coeur = unites[0];
  for (const u of unites) {
    if (Math.hypot(u.x - cx, u.y - cy) < Math.hypot(coeur.x - cx, coeur.y - cy)) coeur = u;
  }
  return coeur;
}

/**
 * Un toucher sur la pastille « Armée » : que faire ? Prendre toute l'armée en
 * main, où qu'elle soit (`prendre`) ; si elle y est déjà, y amener la vue
 * (`voir`) ; si elle est tout entière à l'abri, montrer l'abri (`abri`) : on
 * ne commande pas une troupe abritée. Null sans un seul soldat.
 */
export function toucherArmee(world, joueur, selection) {
  const armee = armeeDe(world, joueur);
  if (armee.length === 0) return null;
  const dehors = armee.filter((u) => !u.garrisonedIn);
  if (dehors.length === 0) return { abri: armee[0].garrisonedIn };
  const enMain = selection.length === dehors.length && dehors.every((u) => selection.includes(u));
  return enMain ? { voir: coeurDe(dehors) } : { prendre: dehors };
}

export class UI {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.nodes = {
      food: el('res-food'), wood: el('res-wood'), gold: el('res-gold'),
      pop: el('res-pop'), age: el('age-label'), ageBar: el('age-bar'),
      timer: el('game-timer'),
      scoreBox: el('score-box'), scoreMoi: el('score-moi'), scoreAdverse: el('score-adverse'),
      selection: el('selection-panel'), commands: el('command-panel'),
      alerts: el('alerts'), buildMenu: el('build-menu'), modal: el('modal'),
      workerBar: el('worker-bar'), workerMenu: el('worker-menu'),
      workerList: el('worker-list'), autoWorkers: el('auto-workers'),
      workerCounts: {
        food: el('wk-food'), wood: el('wk-wood'), gold: el('wk-gold'),
        build: el('wk-build'), idle: el('wk-idle'),
      },
      bottombar: el('bottombar'),
      armee: el('wk-armee'), btnArmee: el('btn-armee'), lacher: el('btn-lacher'),
      minimap: el('minimap'), hud: el('hud'),
    };
    this.lastValues = {};
    this.selectionSignature = '';
    this.commandsSignature = '';   // les boutons ne se reconstruisent que si leur liste change
    this.workerRows = null;        // lignes du panneau d'affectation, construites une fois
    this.hudTimer = 0;
    this.bind();
  }

  bind() {
    // Pictogrammes fixes du HUD (ressources, boutons) : posés une fois ici,
    // plutôt qu'écrits en dur dans le HTML — une seule source pour les icônes.
    for (const node of document.querySelectorAll('[data-icone]')) {
      node.innerHTML = iconeSVG(node.dataset.icone, node.classList.contains('icon-btn') ? 19 : 17);
    }
    // Le moteur audio sert toute la session : coupé dans la partie précédente,
    // il l'est encore — le bouton doit le dire.
    if (!this.game.audio.enabled) el('btn-sound').innerHTML = iconeSVG('sonCoupe', 19);
    // Le score des deux camps ne s'affiche que sur un format qui se joue aussi
    // aux points, chacun à la couleur de son camp. (Le HUD survit à la partie :
    // on le remet dans l'état de celle qui commence.)
    if (this.nodes.scoreBox) {
      this.nodes.scoreBox.classList.toggle('hidden', !this.world.mode.timeLimit);
      this.nodes.scoreMoi.style.color = this.world.players[this.world.humanIndex].color.light;
      this.nodes.scoreAdverse.style.color = this.world.players[1 - this.world.humanIndex].color.light;
    }

    // Ces éléments survivent à la partie : leurs écouteurs partent avec elle
    // (voir Game.destroy), sinon la partie suivante hériterait des deux.
    const opts = { signal: this.game.ecouteurs?.signal };
    el('btn-menu').addEventListener('click', () => this.game.togglePause(), opts);
    el('btn-sound').addEventListener('click', () => this.game.toggleSound(), opts);
    el('btn-close-build').addEventListener('click', () => this.game.cancelBuild(), opts);

    // Barre des ouvriers : un appui sélectionne le groupe, le bouton ouvre le panneau.
    el('btn-workers').addEventListener('click', () => this.openWorkerMenu(), opts);
    el('btn-close-workers').addEventListener('click', () => this.closeWorkerMenu(), opts);
    this.nodes.workerBar.querySelectorAll('[data-task]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const task = chip.dataset.task;
        if (task === 'idle') this.game.focusIdleVillager();
        else this.game.selectWorkerGroup(task);
      }, opts);
    });
    // Pastille « Armée » : toute l'armée d'un toucher ; déjà en main, la vue va sur elle.
    this.nodes.btnArmee.addEventListener('click', () => this.game.selectArmy(), opts);
    // La croix du panneau : lâcher la sélection au doigt (au clavier, c'est Échap).
    this.nodes.lacher.addEventListener('click', () => {
      this.game.audio.play('click');
      this.game.lacherSelection();
    }, opts);
    this.nodes.autoWorkers.addEventListener('change', (e) => {
      this.game.setAutoWorkers(e.target.checked);
      this.renderWorkerRows();
    }, opts);

    const minimap = this.nodes.minimap;
    const handleMinimap = (e) => {
      const rect = minimap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      this.game.minimapJump(nx, ny);
    };
    minimap.addEventListener('pointerdown', (e) => {
      minimap.setPointerCapture?.(e.pointerId);
      this.minimapDragging = true;
      handleMinimap(e);
    }, opts);
    minimap.addEventListener('pointermove', (e) => { if (this.minimapDragging) handleMinimap(e); }, opts);
    minimap.addEventListener('pointerup', () => { this.minimapDragging = false; }, opts);
    minimap.addEventListener('pointercancel', () => { this.minimapDragging = false; }, opts);
  }

  // --- Rafraîchissement périodique -----------------------------------------

  update(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;           // 10 Hz : largement assez pour du texte
    const player = this.world.players[this.world.humanIndex];
    this.setText('food', this.nodes.food, formatNumber(player.resources.food));
    this.setText('wood', this.nodes.wood, formatNumber(player.resources.wood));
    this.setText('gold', this.nodes.gold, formatNumber(player.resources.gold));
    this.setText('pop', this.nodes.pop, `${player.pop}/${player.popCap}`);
    this.nodes.pop.classList.toggle('warn', player.pop >= player.popCap);

    const ageName = AGES[player.age].name;
    if (player.ageProgress) {
      const ratio = 1 - player.ageProgress.timeLeft / player.ageProgress.total;
      this.setText('age', this.nodes.age, `${AGES[player.age + 1].name}…`);
      this.nodes.ageBar.style.width = `${Math.round(ratio * 100)}%`;
      this.nodes.ageBar.parentElement.classList.remove('hidden');
    } else {
      this.setText('age', this.nodes.age, ageName);
      this.nodes.ageBar.parentElement.classList.add('hidden');
    }
    // Partie limitée dans le temps : c'est le temps qui reste qui compte.
    const limite = this.world.mode.timeLimit || 0;
    this.setText('timer', this.nodes.timer, limite
      ? formatTime(Math.max(0, limite - this.world.time))
      : formatTime(this.world.time));
    this.nodes.timer.classList.toggle('urgent', limite > 0 && limite - this.world.time < 60);
    // … et le score des deux camps : c'est lui qui tranchera au bout du temps.
    if (limite) {
      const adverse = this.world.players[1 - this.world.humanIndex];
      this.setText('scoreMoi', this.nodes.scoreMoi, String(this.world.score(player)));
      this.setText('scoreAdverse', this.nodes.scoreAdverse, String(this.world.score(adverse)));
    }

    this.refreshWorkerBar();
    this.refreshSelection();
    this.refreshDisabledStates();
    if (!this.nodes.workerMenu.classList.contains('hidden')) this.renderWorkerRows();
    if (!this.nodes.buildMenu.classList.contains('hidden')) this.refreshBuildMenu();
  }

  // --- Ouvriers -------------------------------------------------------------

  refreshWorkerBar() {
    const stats = this.game.workerStats();
    for (const task of ['food', 'wood', 'gold', 'build', 'idle']) {
      this.setText('wk' + task, this.nodes.workerCounts[task], String(stats[task] || 0));
    }
    this.nodes.workerBar.querySelector('[data-task="idle"]')
      .classList.toggle('has-idle', (stats.idle || 0) > 0);
    // L'armée, au bout de la barre : grisée tant qu'il n'y a pas un soldat.
    const soldats = armeeDe(this.world, this.world.humanIndex).length;
    this.setText('wkarmee', this.nodes.armee, String(soldats));
    this.nodes.btnArmee.classList.toggle('vide', soldats === 0);
  }

  openWorkerMenu() {
    this.nodes.autoWorkers.checked = this.game.autoWorkers();
    this.renderWorkerRows(true);
    this.nodes.workerMenu.classList.remove('hidden');
  }

  closeWorkerMenu() { this.nodes.workerMenu.classList.add('hidden'); }

  /**
   * Le panneau se rafraîchit dix fois par seconde : on ne reconstruit le DOM
   * qu'à l'ouverture, et on ne remplace ensuite que les chiffres. Sinon les
   * boutons étaient détruits sous le doigt et un appui sur deux se perdait.
   */
  renderWorkerRows(rebuild = false) {
    const stats = this.game.workerStats();
    const sites = this.game.constructionSites().length;
    const rows = [
      { task: 'food', icon: 'food', name: 'Nourriture', hint: 'buissons et fermes', assignable: true },
      { task: 'wood', icon: 'wood', name: 'Bois', hint: 'forêts', assignable: true },
      { task: 'gold', icon: 'gold', name: 'Or', hint: 'filons', assignable: true },
      {
        task: 'build', icon: 'chantier', name: 'Chantiers', assignable: true, noSource: sites === 0,
        hint: sites > 0
          ? `${sites} chantier${sites > 1 ? 's' : ''} ouvert${sites > 1 ? 's' : ''}`
          : 'aucun chantier ouvert',
      },
      { task: 'idle', icon: 'idle', name: 'Sans affectation', hint: 'en attente d’ordres', assignable: false },
    ];

    if (rebuild || !this.workerRows) {
      this.nodes.workerList.innerHTML = rows.map((row) => `
        <div class="worker-row" data-row="${row.task}">
          <button class="wr-label" data-select="${row.task}">
            <span class="wr-icon">${iconeSVG(row.icon, 22)}</span>
            <span>
              <span class="wr-name">${row.name}</span>
              <span class="wr-hint">${row.hint}</span>
            </span>
          </button>
          <div class="wr-controls">${row.assignable
            ? `<button class="wr-btn" data-take="${row.task}">−</button>
               <span class="wr-count">0</span>
               <button class="wr-btn" data-give="${row.task}">+</button>`
            : '<span class="wr-count">0</span>'}</div>
        </div>`).join('') + '<div class="wr-hint" data-moving style="padding-left:4px"></div>';

      this.workerRows = {};
      for (const row of rows) {
        const node = this.nodes.workerList.querySelector(`[data-row="${row.task}"]`);
        this.workerRows[row.task] = {
          count: node.querySelector('.wr-count'),
          hint: node.querySelector('.wr-hint'),
          give: node.querySelector('[data-give]'),
          take: node.querySelector('[data-take]'),
        };
      }
      this.workerMoving = this.nodes.workerList.querySelector('[data-moving]');

      // Les écouteurs ne sont posés qu'une fois, sur des boutons qui ne
      // sont plus jamais remplacés. Ces boutons survivent à la partie : sans
      // le signal, ils retiendraient toute l'ancienne partie en mémoire.
      const opts = this.ecoute();
      this.nodes.workerList.querySelectorAll('[data-give]').forEach((btn) => {
        btn.addEventListener('click', () => { this.game.assignWorker(btn.dataset.give); this.renderWorkerRows(); }, opts);
      });
      this.nodes.workerList.querySelectorAll('[data-take]').forEach((btn) => {
        btn.addEventListener('click', () => { this.game.unassignWorker(btn.dataset.take); this.renderWorkerRows(); }, opts);
      });
      this.nodes.workerList.querySelectorAll('[data-select]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.game.selectWorkerGroup(btn.dataset.select);
          this.closeWorkerMenu();
        }, opts);
      });
    }

    for (const row of rows) {
      const node = this.workerRows[row.task];
      const count = stats[row.task] || 0;
      node.count.textContent = String(count);
      node.hint.textContent = row.hint;
      if (node.take) node.take.disabled = count === 0;
      if (node.give) node.give.disabled = !!row.noSource;
    }
    // Ceux qui sont à l'abri (ou y courent) ne sont à aucun poste : on les
    // nomme ici, au lieu de les compter « sans affectation ».
    const moving = stats.move || 0, abrites = stats.abri || 0;
    this.workerMoving.textContent = [
      moving > 0 ? `${moving} en déplacement` : '',
      abrites > 0 ? `${abrites} à l’abri` : '',
    ].filter(Boolean).join(' · ');
  }

  /** La barre des ouvriers se cale au-dessus du panneau du bas, dont la hauteur varie. */
  measureBottomBar() {
    const height = this.nodes.bottombar.offsetHeight;
    if (height && height !== this.lastBottomHeight) {
      this.lastBottomHeight = height;
      document.documentElement.style.setProperty('--bottom-height', height + 6 + 'px');
    }
  }

  setText(key, node, value) {
    if (!node || this.lastValues[key] === value) return;
    this.lastValues[key] = value;
    node.textContent = value;
  }

  // --- Sélection ------------------------------------------------------------

  /** Signature légère : évite de reconstruire le DOM à chaque image. */
  signature(selection) {
    if (selection.length === 0) return 'none';
    const counts = {};
    for (const e of selection) counts[e.type] = (counts[e.type] || 0) + 1;
    const first = selection[0];
    const queue = first.kind === 'building'
      ? first.queue.map((q) => q.id + Math.ceil(q.timeLeft)).join(',') : '';
    return Object.entries(counts).map(([k, v]) => k + v).join('|')
      + '#' + selection.length + '#' + Math.round(first.hp) + '#' + queue
      + '#' + (first.stance || '') + '#' + (first.garrison ? first.garrison.length : '')
      + '#' + (first.buildQueue ? first.buildQueue.length : '')
      + '#' + (first.kind === 'building' && !first.complete ? this.world.buildersOn(first) : '')
      + '#' + (first.complete === false ? Math.round(first.progressRatio * 20) : '')
      + '#' + this.world.players[this.world.humanIndex].age
      // Ce que le panneau affiche et qui bouge sans toucher aux PV : la charge
      // d'un villageois, la réserve d'une ferme.
      + '#' + (selection.length === 1 && first.carry ? Math.floor(first.carry.amount) : '')
      + '#' + (first.type === 'farm' ? Math.round(first.foodLeft) : '');
  }

  /**
   * Signature des BOUTONS : uniquement ce qui change leur liste. Les PV, un
   * avancement de chantier ou une file de production évoluent en permanence —
   * s'ils entraînaient un nouveau rendu, le bouton disparaissait sous le doigt
   * et l'appui se perdait.
   */
  commandSignature(selection) {
    const player = this.world.players[this.world.humanIndex];
    const first = selection[0];
    return selection.map((e) => e.id + (e.stance || '')).join(',')
      + '#' + (first.kind === 'building' ? (first.complete ? 'fini' : 'chantier') : '')
      + '#' + (first.garrison ? first.garrison.length : '')
      + '#' + player.age + '#' + player.techs.size
      + '#' + [this.game.attackMoveArmed, this.game.garrisonArmed, this.game.rallyArmed].join('')
      // Le bouton « Détruire » armé se désarme seul au bout de trois secondes.
      + '#' + (first.kind === 'building' && this.game.demolitionEnAttente(first) ? 'armee' : '');
  }

  refreshSelection(force = false) {
    const selection = this.game.selection.filter((e) => !e.dead);
    const signature = this.signature(selection);
    const commands = selection.length > 0 ? this.commandSignature(selection) : 'none';
    if (!force && signature === this.selectionSignature && commands === this.commandsSignature) return;
    // La croix « lâcher » n'a de sens qu'avec quelque chose en main. Elle vit
    // hors du panneau, qui est reconstruit sans cesse : sous le doigt, un
    // bouton recréé perd l'appui.
    this.nodes.lacher.classList.toggle('hidden', selection.length === 0);

    if (selection.length === 0) {
      if (this.selectionSignature !== 'none' || force) {
        this.nodes.selection.innerHTML = '<div class="hint">Touchez une unité pour la sélectionner · appui long pour un rectangle</div>';
        this.nodes.commands.innerHTML = '';
        this.commandNodes = [];
        this.commandButtons = [];
        this.measureBottomBar();
      }
      this.selectionSignature = signature;
      this.commandsSignature = commands;
      return;
    }
    if (force || signature !== this.selectionSignature) this.renderSelectionPanel(selection);
    if (force || commands !== this.commandsSignature) this.renderCommands(selection);
    this.selectionSignature = signature;
    this.commandsSignature = commands;
    this.measureBottomBar();
  }

  renderSelectionPanel(selection) {
    const node = this.nodes.selection;
    const first = selection[0];
    const mine = first.playerIndex === this.world.humanIndex;

    if (selection.length === 1) {
      const def = first.def;
      // L'affichage suit la civilisation du PROPRIÉTAIRE (ennemi compris) ; les règles restent lues sur def.
      const fiche = ficheDe(first.type, first.player.civ);
      const portrait = portraitDe(first.type, first.player.civ);
      // Un bâtiment a pour portrait sa propre illustration, celle de la carte.
      const vignette = first.kind === 'building' ? imageBatiment(first.type, first.player.civ) : null;
      const rows = [];
      if (first.kind === 'unit' && first.isAnimal) {
        rows.push(`${ic('food')} ${def.food} de nourriture`);
        rows.push(first.playerIndex < 0
          ? (def.capturable ? `sauvage — approchez un ${this.game.ouvrier()}` : `gibier — envoyez des ${this.game.ouvrier(2)}`)
          : `capturé — un ${this.game.ouvrier()} l’abat`);
      } else if (first.kind === 'unit') {
        rows.push(def.heal
          ? `${ic('pointsDeVie')} +${def.heal} · ${ic('defensive')} ${first.meleeArmor()}/${first.pierceArmor()}`
          : `${ic('aggressive')} ${def.attack} · ${ic('defensive')} ${first.meleeArmor()}/${first.pierceArmor()}`);
        rows.push(`${ic(first.stanceDef.icon)} ${first.stanceDef.name}`);
        if (first.buildQueue && first.buildQueue.length > 0) {
          rows.push(`${ic('chantier')} ${first.buildQueue.length} chantier(s) en file`);
        }
        if (def.range > 1.5) rows.push(`${ic('attaquer')} portée ${def.range}`);
        if (first.isVillager && first.carry.amount > 0.5) {
          rows.push(`${ic(RESOURCE_ICONS[first.carry.type])} ${Math.floor(first.carry.amount)}/${first.carryCapacity()}`);
        }
      } else {
        if (def.attack) rows.push(`${ic('aggressive')} ${def.attack} · ${ic('attaquer')} ${def.range}`);
        if (def.popBonus) rows.push(`${ic('population')} +${def.popBonus}`);
        if (def.garrison) rows.push(`${ic('garrison')} ${first.garrison.length}/${def.garrison.capacity}`);
        if (first.type === 'farm') rows.push(`${ic('food')} ${Math.max(0, Math.round(first.foodLeft))}`);
        if (!first.complete) {
          rows.push(`${ic('chantier')} ${Math.round(first.progressRatio * 100)} %`);
          // On compte aussi ceux qui marchent vers le chantier : sinon le
          // renfort qu'on vient d'envoyer semble n'avoir servi à rien.
          const ouvriers = this.world.buildersOn(first);
          rows.push(ouvriers > 0
            ? `${ic('ouvriers')} ${ouvriers} ouvrier${ouvriers > 1 ? 's' : ''}`
            : `${ic('ouvriers')} aucun ouvrier — touchez le chantier avec des ${this.game.ouvrier(2)}`);
        }
      }
      node.innerHTML = `
        <div class="portrait${portrait ? ' illustre' : vignette ? ' batiment' : ''}" data-civ="${first.player.civ}" style="--team:${first.player.color.main}">${
          portrait
            // Un portrait peint est bleu : l'adversaire le porte en rouge —
            // voir teinterPortrait, plutôt qu'une seconde image à télécharger.
            ? `<img src="${portrait}" alt="" class="${mine ? '' : 'ennemi'}">`
            : vignette ? `<img src="${vignette}" alt="" decoding="sync">`
            : iconeSVG(def.icon, 30)}</div>
        <div class="info">
          <div class="name">${fiche.name}${mine ? '' : first.isAnimal && first.playerIndex < 0 ? ' <span class="enemy">(sauvage)</span>' : ' <span class="enemy">(ennemi)</span>'}</div>
          <div class="hp"><span style="width:${Math.round((first.hp / first.maxHp) * 100)}%"></span></div>
          <div class="stats">${ic('pointsDeVie')} ${Math.ceil(first.hp)}/${first.maxHp} · ${rows.join(' · ')}</div>
        </div>`;
      const portraitEnnemi = node.querySelector('.portrait img.ennemi');
      if (portraitEnnemi) teinterPortrait(portraitEnnemi, first.type);
      // Le bâtiment d'un autre camp que le bleu : sa toile recolorée, comme sur la carte.
      const duCamp = vignette && vignetteDeCamp(first.type, first.player.civ, first.playerIndex);
      if (duCamp) node.querySelector('.portrait img').replaceWith(duCamp);
      if (first.kind === 'building' && first.queue.length > 0) {
        node.insertAdjacentHTML('beforeend', this.renderQueue(first));
        // Les boutons de la file sont recréés à chaque rendu du panneau (le
        // temps restant y figure) : leurs écouteurs se posent ici, avec eux.
        node.querySelectorAll('[data-cancel]').forEach((btn) => {
          btn.addEventListener('click', () => {
            this.world.cancelProduction(first, Number(btn.dataset.cancel));
            this.refreshSelection(true);
          }, this.ecoute());
        });
      }
      return;
    }

    const counts = {};
    for (const e of selection) counts[e.type] = (counts[e.type] || 0) + 1;
    const chips = Object.entries(counts).map(([type, count]) => {
      const def = UNIT_TYPES[type] || BUILDING_TYPES[type];
      return `<button class="chip" data-filter="${type}">${this.visage(type, first.player.civ, def.icon, 17)}<span>${count}</span></button>`;
    }).join('');
    node.innerHTML = `<div class="multi"><div class="multi-title">${selection.length} unités sélectionnées</div>
      <div class="chips">${chips}</div></div>`;
    node.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.filterSelection(btn.dataset.filter), this.ecoute());
    });
  }

  /**
   * Ce qui représente une troupe sur un petit bouton (formation, file, pastille
   * de sélection) : son portrait dans ce peuple — le même que dans le cadre du
   * panneau. À défaut (technologie, troupe sans portrait), son pictogramme.
   */
  visage(type, civ, icone, taille) {
    const portrait = UNIT_TYPES[type] ? portraitDe(type, civ) : null;
    return portrait ? `<img class="visage" src="${portrait}" alt="" decoding="sync">` : iconeSVG(icone, taille);
  }

  renderQueue(building) {
    const items = building.queue.map((item, index) => {
      const def = UNIT_TYPES[item.id] || TECHS[item.id];
      const ratio = 1 - item.timeLeft / item.total;
      return `<button class="queue-item" data-cancel="${index}" title="Annuler">
        <span class="qicon">${this.visage(item.id, building.player.civ, def.icon, 17)}</span>
        <span class="qbar"><span style="width:${Math.round(ratio * 100)}%"></span></span>
      </button>`;
    }).join('');
    return `<div class="queue">${items}</div>`;
  }

  renderCommands(selection) {
    const node = this.nodes.commands;
    const first = selection[0];
    this.commandNodes = [];
    this.commandButtons = [];
    if (first.playerIndex !== this.world.humanIndex) { node.innerHTML = ''; return; }

    const buttons = [];
    // Un cochon capturé se mène au doigt ; il n'a ni attitude ni abri.
    const betes = selection.filter((e) => e.kind === 'unit' && e.isAnimal);
    const units = selection.filter((e) => e.kind === 'unit' && !e.isAnimal);
    if (betes.length > 0 && units.length === 0) {
      buttons.push({ icon: 'stop', label: 'Stop', action: () => this.game.stopSelection() });
    }
    const villagers = units.filter((u) => u.isVillager);
    const military = units.filter((u) => !u.isVillager);

    if (villagers.length > 0) {
      buttons.push({ icon: 'chantier', label: 'Construire', action: () => this.game.openBuildMenu() });
    }
    if (units.length > 0) {
      buttons.push({ icon: 'stop', label: 'Stop', action: () => this.game.stopSelection() });
    }
    if (military.length > 0) {
      buttons.push({
        icon: 'attaquer', label: 'Attaquer ici', toggled: this.game.attackMoveArmed,
        action: () => this.game.toggleAttackMove(),
      });
    }
    if (units.length > 0 && this.world.buildings.some(
      (b) => !b.dead && b.complete && b.playerIndex === this.world.humanIndex
        && b.def.garrison && units.some((u) => b.canGarrison(u)))) {
      buttons.push({
        icon: 'garrison', label: 'Abriter', toggled: this.game.garrisonArmed,
        action: () => this.game.toggleGarrison(),
      });
    }
    if (units.length > 0) {
      // Attitudes, comme dans AoE : c'est elles qui décident si l'unité engage
      // d'elle-même et jusqu'où elle poursuit.
      const current = units.every((u) => u.stance === units[0].stance) ? units[0].stance : null;
      for (const stance of Object.values(STANCES)) {
        buttons.push({
          icon: stance.icon, label: stance.short, title: stance.name + ' — ' + stance.desc,
          compact: true, toggled: current === stance.id,
          action: () => this.game.setStance(stance.id),
        });
      }
    }

    if (first.kind === 'building' && selection.length === 1) {
      const b = first;
      if (!b.complete) {
        buttons.push({
          icon: 'ouvriers', label: '+1 ouvrier',
          check: () => (this.game.hasSpareWorker()
            ? { ok: true } : { ok: false, reason: `Aucun ${this.game.ouvrier()} disponible` }),
          action: () => this.game.reinforceSite(b),
        });
        // Le chantier qui tient seul le camp en jeu s'annule en deux appuis (voir Game.cancelConstruction).
        const armee = this.game.demolitionEnAttente(b);
        buttons.push({ icon: 'annuler', label: armee ? 'Confirmer' : 'Annuler', danger: armee, action: () => this.game.cancelConstruction(b) });
      } else {
        const def = b.def;
        for (const unitType of def.trains || []) {
          const u = UNIT_TYPES[unitType];
          buttons.push({
            icon: u.icon, troupe: unitType, label: nomDe(unitType, this.game.civ), cost: costLabel(u.cost), time: u.trainTime,
            // Une troupe pas encore débloquée : montrée, sous cadenas (voir js/progression.js).
            verrou: this.world.players[this.world.humanIndex].interdites.has(unitType),
            check: () => (this.world.players[this.world.humanIndex].interdites.has(unitType)
              ? { ok: false, reason: `${nomDe(unitType, this.game.civ)} : troupe à débloquer — vois « Troupes » à l’accueil` }
              : this.world.canTrain(b, unitType)),
            action: () => this.game.trainUnit(b, unitType),
          });
        }
        for (const techId of def.techs || []) {
          const tech = TECHS[techId];
          if (this.world.players[this.world.humanIndex].techs.has(techId)) continue;
          buttons.push({
            icon: tech.icon, label: tech.name, cost: costLabel(tech.cost),
            check: () => this.world.canResearch(b, techId),
            action: () => this.game.researchTech(b, techId),
          });
        }
        if (b.type === 'towncenter') {
          const player = this.world.players[this.world.humanIndex];
          for (const techId of ['wheelbarrow']) {
            if (player.techs.has(techId) || TECHS[techId].age > player.age) continue;
            const tech = TECHS[techId];
            buttons.push({
              icon: tech.icon, label: tech.name, cost: costLabel(tech.cost),
              check: () => this.world.canResearch(b, techId),
              action: () => this.game.researchTech(b, techId),
            });
          }
          const next = AGES[player.age + 1];
          if (next) {
            buttons.push({
              icon: 'ageUp', label: next.name, cost: costLabel(next.cost), highlight: true,
              check: () => this.world.canAdvanceAge(b),
              action: () => this.game.advanceAge(b),
            });
          }
        }
        if (def.garrison) {
          if (b.type === 'towncenter') {
            buttons.push({
              icon: 'cloche', label: 'Cloche', action: () => this.game.ringTownBell(),
            });
          }
          buttons.push({
            icon: 'sortir', label: `Libérer (${b.garrison.length})`,
            check: () => (b.garrison.length > 0 ? { ok: true } : { ok: false, reason: 'Personne à l’intérieur' }),
            action: () => this.game.releaseGarrison(b),
          });
        }
        if (def.trains) {
          buttons.push({
            icon: 'ralliement', label: 'Ralliement', toggled: this.game.rallyArmed,
            action: () => this.game.toggleRally(),
          });
        }
        // Deux appuis pour détruire : le premier arme le bouton (voir Game.demolish).
        const armee = this.game.demolitionEnAttente(b);
        buttons.push({ icon: 'detruire', label: armee ? 'Confirmer' : 'Détruire', danger: armee, action: () => this.game.demolish(b) });
      }
    }

    node.innerHTML = buttons.map((b, i) => {
      const state = b.check ? b.check() : { ok: true };
      const classes = ['cmd'];
      if (!state.ok) classes.push('disabled');
      if (b.toggled) classes.push('toggled');
      if (b.highlight) classes.push('highlight');
      if (b.compact) classes.push('compact');
      if (b.danger) classes.push('danger');
      if (b.verrou) classes.push('verrou');
      const title = b.title ? ` title="${b.title}"` : '';
      return `<button class="${classes.join(' ')}" data-cmd="${i}"${title} ${state.ok ? '' : `data-reason="${state.reason}"`}>
        <span class="cmd-icon">${b.troupe ? this.visage(b.troupe, this.game.civ, b.icon, 22) : iconeSVG(b.icon, 22)}</span>
        <span class="cmd-label">${b.label}</span>
        ${b.cost ? `<span class="cmd-cost">${b.cost}</span>` : ''}
        ${b.verrou ? `<span class="cmd-verrou">${iconeSVG('cadenas', 13)}</span>` : ''}
      </button>`;
    }).join('');

    poserIconesDeCout(node);
    this.commandButtons = buttons;
    this.commandNodes = [...node.querySelectorAll('[data-cmd]')];
    this.commandNodes.forEach((btn) => {
      const command = buttons[Number(btn.dataset.cmd)];
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) {
          this.toast(btn.dataset.reason || 'Indisponible', 'error');
          this.game.audio.play('error');
          return;
        }
        this.game.audio.play('click');
        command.action();
        this.refreshSelection(true);
      }, this.ecoute());
    });
  }

/** Grise en direct ce qui n'est plus payable — sans reconstruire le panneau,
   *  pour ne pas recréer les boutons sous le doigt du joueur. */
  refreshDisabledStates() {
    if (!this.commandNodes || this.commandNodes.length === 0) return;
    for (const btn of this.commandNodes) {
      const command = this.commandButtons[Number(btn.dataset.cmd)];
      if (!command || !command.check) continue;
      const state = command.check();
      btn.classList.toggle('disabled', !state.ok);
      if (state.reason) btn.dataset.reason = state.reason;
    }
  }

  // --- Menu de construction -------------------------------------------------

  /** Pourquoi ce bâtiment ne peut pas être posé maintenant ('' s'il le peut). */
  raisonConstruction(def) {
    const player = this.world.players[this.world.humanIndex];
    if (def.requires && !this.world.buildings.some(
      (b) => b.playerIndex === player.index && b.type === def.requires && b.complete && !b.dead)) {
      return `Nécessite : ${nomDe(def.requires, this.game.civ)}`;
    }
    if (def.limit && this.world.buildings.filter(
      (b) => b.playerIndex === player.index && b.type === def.id && !b.dead).length >= def.limit) {
      return 'Nombre maximum atteint';
    }
    return canAfford(player.resources, def.cost) ? '' : 'Ressources insuffisantes';
  }

  /** La partie continue menu ouvert : les cartes suivent les ressources, sans être recréées. */
  refreshBuildMenu() {
    for (const btn of el('build-list').querySelectorAll('[data-type]')) {
      const reason = this.raisonConstruction(BUILDING_TYPES[btn.dataset.type]);
      btn.classList.toggle('disabled', reason !== '');
      btn.dataset.reason = reason;
    }
  }

  openBuildMenu() {
    const player = this.world.players[this.world.humanIndex];
    const list = el('build-list');
    const available = Object.values(BUILDING_TYPES).filter((def) => (def.age || 0) <= player.age);
    // La vignette, c'est l'illustration du bâtiment dans le peuple du joueur ; à défaut, son pictogramme.
    list.innerHTML = available.map((def) => { const f = ficheDe(def.id, this.game.civ), image = imageBatiment(def.id, this.game.civ); return `<button class="build-card" data-type="${def.id}">
        <span class="bc-icon${image ? ' vignette' : ''}">${image ? `<img src="${image}" alt="" decoding="async">` : iconeSVG(def.icon, 26)}</span>
        <span class="bc-body">
          <span class="bc-name">${f.name}</span>
          <span class="bc-desc">${f.desc}</span>
        </span>
        <span class="bc-cost">${costLabel(def.cost)}</span>
      </button>`; }).join('');
    poserIconesDeCout(list);
    this.refreshBuildMenu();
    // Les cartes restent dans le DOM après la partie : l'écouteur part avec elle.
    list.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) {
          this.toast(btn.dataset.reason || 'Indisponible', 'error');
          this.game.audio.play('error');
          return;
        }
        this.game.startBuildMode(btn.dataset.type);
      }, this.ecoute());
    });
    this.nodes.buildMenu.classList.remove('hidden');
  }

  closeBuildMenu() { this.nodes.buildMenu.classList.add('hidden'); }

  setBuildHint(text) {
    const hint = el('build-hint');
    hint.textContent = text || '';
    hint.classList.toggle('hidden', !text);
  }

  // --- Notifications --------------------------------------------------------

  /** Où en sont les personnages 3D, sous les styles du menu de pause. */
  texteModeles3d() {
    const e = etatModeles3d();
    const texte = {
      cuisson: 'Tes personnages 3D se préparent (au premier lancement seulement) : les dessins servent en attendant.',
      pret: e.alleges && e.alleges.length
        ? `Tes personnages 3D sont prêts, mais allégés faute de mémoire (${e.alleges.join(', ')}) : ils paraissent plus flous. Ferme les autres onglets puis relance le jeu.`
        : 'Tes personnages 3D sont prêts, à pleine finesse.',
      absent: `Tes personnages 3D n’ont pas pu se préparer sur cet appareil (${e.raison}) : les dessins les remplacent.`,
    }[e.etat];
    return texte ? `<p class="hint">${texte}</p>` : '';
  }

  /** La finesse réellement affichée : celle de l'écran, ou réduite (réglage, garde-fou de cadence). */
  texteFinesse() {
    const r = this.game.renderer;
    const ecran = Math.min(window.devicePixelRatio || 1, 3);
    const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    const px = (v) => `${n(v)} pixel${v >= 2 ? 's' : ''} par point`;
    if (r.dpr >= ecran) return `Affichée : ${px(r.dpr)}, toute la finesse de cet écran.`;
    // `fige` dit seulement « on ne surveille plus » : il est vrai aussi pour le
    // réglage « Légère » et pour « ?dpr= ». La cause se lit donc d'abord ailleurs.
    const cause = r.dprForce ? ' — imposée par « ?dpr= » dans l’adresse.'
      : this.game.finesse === 'legere' ? ' — c’est ton réglage « Légère ».'
      : r.cadence && r.cadence.fige ? ' — réduite automatiquement, le jeu ralentissait.'
      : '.';
    return `Affichée : ${px(r.dpr)} au lieu de ${n(ecran)}${cause}`;
  }

  /**
   * Ce que le jeu mesure de lui-même, à lire sur le téléphone : la cadence des
   * dernières secondes de jeu, ce que pèsent en mémoire les images des troupes,
   * la finesse — et la dernière coupure relevée par le témoin (js/save.js).
   * Une mesure qui échoue ne doit pas empêcher le menu de s'ouvrir.
   */
  texteMesures() {
    try {
      const m = this.game.mesures();
      const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
      const cadence = m.ips ? `${Math.round(m.ips)} images par seconde` : 'cadence pas encore mesurée';
      const mesures = `Mesures : ${cadence} · ${Math.round(m.mo)} Mo d’images de troupes`
        + ` (${m.troupes} troupe${m.troupes > 1 ? 's' : ''} en mémoire) · ${n(m.dpr)} pixel${m.dpr >= 2 ? 's' : ''} par point.`;
      const dernier = m.incidents[m.incidents.length - 1];
      if (!dernier) return mesures;
      const quand = new Date(dernier.h).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const titre = dernier.genre === 'rechargee' ? 'Dernier rechargement en pleine partie' : 'Dernière coupure relevée';
      const total = m.incidents.length > 1 ? ` (${m.incidents.length} incidents en tout)` : '';
      return `${mesures} ${titre} : le ${quand}, ${resumeIncident(dernier)}${total}.`;
    } catch {
      return '';
    }
  }

  toast(message, kind = 'info', action = null) {
    // Message identique déjà affiché : on incrémente plutôt que d'empiler.
    const last = this.nodes.alerts.lastElementChild;
    if (last && last.dataset.message === message && !last.classList.contains('leaving')) {
      const count = Number(last.dataset.count || 1) + 1;
      last.dataset.count = count;
      last.innerHTML = `${message} <span class="toast-count">×${count}</span>`;
      return;
    }
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.dataset.message = message;
    node.textContent = message;
    // Un message qui mène quelque part (l'alerte d'attaque) : il se touche, et
    // reste affiché le temps qu'on y porte le doigt.
    if (action) {
      node.classList.add('touchable');
      node.setAttribute('role', 'button');
      node.addEventListener('click', () => { node.remove(); action(); }, this.ecoute());
    }
    this.nodes.alerts.appendChild(node);
    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 400);
    }, action ? DUREE_REPERE * 1000 : 2600);
    while (this.nodes.alerts.children.length > 4) this.nodes.alerts.firstChild.remove();
  }

  // --- Fenêtres modales -----------------------------------------------------

  /**
   * Options d'un écouteur posé par l'interface : il part avec la partie (voir
   * Game.destroy). Un bouton détaché reste parfois tenu par le navigateur — le
   * dernier élément touché, par exemple « Rejouer » —, et son écouteur, avec
   * lui toute l'ancienne partie.
   */
  ecoute() { return { signal: this.game.ecouteurs?.signal }; }

  showModal(html, options = {}) {
    this.nodes.modal.innerHTML = `<div class="modal-card ${options.wide ? 'wide' : ''}${options.fin ? ' fin' : ''}">${html}</div>`;
    this.nodes.modal.classList.remove('hidden');
    return this.nodes.modal;
  }

  hideModal() { this.nodes.modal.classList.add('hidden'); this.nodes.modal.innerHTML = ''; }

  showPause() {
    const vitesses = GAME_SPEEDS.map((sp) => `
      <button class="option compact ${sp.id === this.game.speedId ? 'active' : ''}" data-speed="${sp.id}">
        <span class="option-name">${sp.name}</span>
        <span class="option-desc">${sp.short}</span>
      </button>`).join('');
    const styles = STYLES.map((st) => `
      <button class="option compact ${st.id === this.game.styleUnites() ? 'active' : ''}" data-style="${st.id}">
        <span class="option-name">${st.nom}</span>
        <span class="option-desc">${st.desc}</span>
      </button>`).join('');
    const finesses = [
      { id: 'fine', nom: 'Fine', desc: 'Tous les pixels de l’écran' },
      { id: 'legere', nom: 'Légère', desc: 'Si le jeu rame ou chauffe' },
    ].map((f) => `
      <button class="option compact ${f.id === this.game.finesse ? 'active' : ''}" data-finesse="${f.id}">
        <span class="option-name">${f.nom}</span>
        <span class="option-desc">${f.desc}</span>
      </button>`).join('');
    const modal = this.showModal(`
      <h2>Partie en pause</h2>
      <p class="hint">La partie est sauvegardée : vous pouvez fermer l'onglet et la reprendre plus tard.</p>
      <h3 class="modal-sub">Vitesse de jeu</h3>
      <div class="options row">${vitesses}</div>
      <h3 class="modal-sub">Style des personnages</h3>
      <div class="options row">${styles}</div>
      ${this.texteModeles3d()}
      <h3 class="modal-sub">Finesse de l’image</h3>
      <div class="options row">${finesses}</div>
      <p class="hint" data-role="finesse-reelle">${this.texteFinesse()}</p>
      <p class="hint" data-role="mesures">${this.texteMesures()}</p>
      <div class="modal-actions">
        <button class="btn primary" data-act="resume">Reprendre</button>
        <button class="btn" data-act="help">Comment jouer</button>
        <button class="btn" data-act="credits">Crédits</button>
        <button class="btn danger" data-act="resign">Abandonner</button>
      </div>`);
    modal.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.setSpeed(btn.dataset.speed);
        modal.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', b === btn));
      }, this.ecoute());
    });
    modal.querySelectorAll('[data-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.setStyleUnites(btn.dataset.style);
        modal.querySelectorAll('[data-style]').forEach((b) => b.classList.toggle('active', b === btn));
      }, this.ecoute());
    });
    modal.querySelectorAll('[data-finesse]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.setFinesse(btn.dataset.finesse);
        modal.querySelectorAll('[data-finesse]').forEach((b) => b.classList.toggle('active', b === btn));
        modal.querySelector('[data-role="finesse-reelle"]').textContent = this.texteFinesse();
        modal.querySelector('[data-role="mesures"]').textContent = this.texteMesures();
      }, this.ecoute());
    });
    modal.querySelector('[data-act="resume"]').addEventListener('click', () => this.game.togglePause(), this.ecoute());
    modal.querySelector('[data-act="help"]').addEventListener('click', () => this.showHelp(), this.ecoute());
    modal.querySelector('[data-act="credits"]').addEventListener('click', () => this.showCredits(), this.ecoute());
    modal.querySelector('[data-act="resign"]').addEventListener('click', () => this.game.resign(), this.ecoute());
  }

  showHelp() {
    const civAdverse = this.world.players[1 - this.world.humanIndex].civ;
    // Les bâtiments militaires : tout ce qui forme des troupes, hors Centre-Ville (voir World.checkVictory).
    const militaires = Object.values(BUILDING_TYPES)
      .filter((b) => b.trains && b.id !== 'towncenter').map((b) => nomDe(b.id, civAdverse)).join(', ');
    const modal = this.showModal(`
      <h2>Comment jouer</h2>
      <ul class="help">
        <li><b>Glisser</b> : déplacer la vue · <b>pincer</b> : zoomer</li>
        <li><b>Toucher</b> une unité : la sélectionner · <b>double tap</b> : toutes les unités du même type visibles</li>
        <li><b>Appui long puis glisser</b> : sélection rectangulaire</li>
        <li><b>${ic('forging')} Armée</b>, au bout de la barre des ouvriers : un toucher prend tous vos soldats, où qu'ils soient ; un second amène la vue sur eux. La <b>${ic('fermer')} croix</b> du panneau lâche la sélection</li>
        <li><b>« Vous êtes attaqué ! »</b> : touchez le message pour aller voir ; l'endroit pulse en rouge sur la mini-carte</li>
        <li>Avec une sélection, <b>toucher</b> le sol, un arbre, une mine ou un ennemi donne l'ordre correspondant. Un appui au sol se suit jusqu'au bout, même en plein combat : c'est le geste pour replier vos troupes</li>
        <li><b>Réparer</b> : des ${this.game.ouvrier(2)} sélectionnés, touchez un de vos bâtiments abîmés. <b>Soigner</b> : sélectionnez votre ${nomDe('priest', this.game.civ)}, puis touchez un allié blessé. (Double tap pour sélectionner à la place.)</li>
        <li><b>${ic('chantier')} Construire</b> : choisissez un bâtiment, puis touchez l'emplacement. Les ${this.game.ouvrier(2)} sélectionnés s'y mettent <b>tous</b> — à plusieurs, ça va bien plus vite. Enchaînez les poses : elles se mettent <b>en file</b> et l'ouvrier passe à la suivante en terminant</li>
        <li><b>Affecter quelqu'un à un chantier</b> : touchez un ${this.game.ouvrier()}, puis touchez le chantier — le même geste que pour l'envoyer au bois ou à la nourriture. La ligne <b>${ic('chantier')} Chantiers</b> de la barre <b>${ic('ouvriers')} Ouvriers</b> fait pareil avec ses <b>+ / −</b>, et un chantier sélectionné a son bouton <b>${ic('ouvriers')} +1 ouvrier</b>. (Double tap sur un chantier pour le sélectionner sans y envoyer personne.)</li>
        <li>Les ${this.game.ouvrier(2)} récoltent ${ic('food')} nourriture, ${ic('wood')} bois et ${ic('gold')} or ; il faut des <b>maisons</b> pour agrandir la population</li>
        <li><b>Attitudes</b> (unité sélectionnée) : ${ic('aggressive')} agressif poursuit loin, ${ic('defensive')} défensif revient à son poste, ${ic('standGround')} position tenue ne bouge pas, ${ic('passive')} sans attaque ignore l'ennemi</li>
        <li><b>Garnison</b> : des soldats sélectionnés s'abritent d'un appui sur votre ${nomDe('towncenter', this.game.civ)} ou une tour ; des ${this.game.ouvrier(2)}, par le bouton <b>${ic('garrison')} Abriter</b> puis l'abri. Les occupants s'y soignent et chacun ajoute une flèche. La <b>${ic('cloche')} cloche</b> y envoie tous les ${this.game.ouvrier(2)} d'un coup ; un second coup renvoie chacun à son poste</li>
        <li><b>C'est vous qui affectez vos ouvriers</b> : quand un gisement s'épuise, le ${this.game.ouvrier()} rapporte son chargement puis attend vos ordres. La barre <b>${ic('ouvriers')} Ouvriers</b> montre qui fait quoi et permet de réaffecter d'un doigt</li>
        <li>Passez les <b>âges</b> depuis le ${nomDe('towncenter', this.game.civ)} pour débloquer de nouvelles unités</li>
        <li><b>Vitesse de jeu</b> : réglable ici même (Tranquille à Blitz ×2) — et depuis l'écran d'accueil</li>
        <li><b>La partie se sauvegarde toute seule</b> toutes les 30 s et dès que vous quittez l'onglet : vous la retrouverez sur l'écran d'accueil, bouton <b>Reprendre</b></li>
        <li><b>Objectif</b> : ne laisser à l'adversaire ni ${nomDe('towncenter', civAdverse)} ni bâtiment militaire (${militaires}), achevé ou en chantier — inutile de raser la dernière ferme. En mode ${ic('modeExpress')} Express, son dernier ${nomDe('towncenter', civAdverse)} suffit ; sinon, au bout du temps, le meilleur score l'emporte</li>
        ${this.world.mode.timeLimit ? `<li><b>Score</b> ${ic('score')} : la moitié de ce que vous récoltez, le prix de vos troupes et bâtiments encore debout, et deux fois le prix de ce que vous abattez. Il s'affiche en haut, à côté du chrono : le vôtre, puis celui de l'adversaire</li>` : ''}
      </ul>
      <div class="modal-actions"><button class="btn primary" data-act="close">J'ai compris</button></div>`, { wide: true });
    modal.querySelector('[data-act="close"]').addEventListener('click', () => {
      if (this.game.paused) this.showPause(); else this.hideModal();
    }, this.ecoute());
  }

  /**
   * Crédits. La licence des icônes (CC BY 3.0) exige que leurs auteurs soient
   * cités et que la mention soit accessible depuis un menu : c'est ici.
   */
  showCredits() {
    const l = ICONES_LICENCE;
    const modal = this.showModal(`
      <h2>Crédits</h2>
      <ul class="help">
        <li><b>Icônes</b> — <a href="${l.url}" target="_blank" rel="noopener">${l.source}</a>,
          sous licence <a href="${l.licenceUrl}" target="_blank" rel="noopener">${l.licence}</a>.
          <small class="credits-auteurs">${l.auteurs.join(' · ')}</small></li>
        <li><b>Illustrations</b> (personnages, bâtiments, arbres, décor, textures de sol et
          d'eau) — générées par l'auteur du jeu, puis découpées et détourées pour le jeu.</li>
        <li><b>Chevalier, villageois, archer, lancier, Atlante, Champion, Arbalétrier, Archer monté, Éclaireur, Cavalier, Bélier, Catapulte, Prêtresse et Hydre 3D ; Fellah, Garde, Lancier, Archer, Chacal dressé, Méhariste, Garde masqué et Prêtre du Soleil des Solariens</b> — modèles et animations de l'auteur du
          jeu, faits dans son Atelier 3D ; icônes du trident, de l'Hydre et du Temple dessinées pour le jeu ; cuits par
          <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT).</li>
        <li><b>Chevalier 3D d'essai</b> (styles « 3D précalculée » et « 3D en direct ») — KayKit Adventurers, par
          <a href="https://www.kaylousberg.com" target="_blank" rel="noopener">Kay Lousberg</a>,
          domaine public (CC0) ; rendu en direct par
          <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT).</li>
        <li><b>Sons</b> — synthétisés au code, sans fichier audio.</li>
        <li><b>Jeu</b> — inspiré des principes d'Age of Empires, sans en reprendre
          aucun contenu : marques, ressources graphiques et sonores appartiennent
          à leurs propriétaires respectifs.</li>
      </ul>
      <div class="modal-actions"><button class="btn primary" data-act="close">Fermer</button></div>`,
      { wide: true });
    modal.querySelector('[data-act="close"]').addEventListener('click', () => {
      if (this.game.paused) this.showPause(); else this.hideModal();
    }, this.ecoute());
  }

  /** Pourquoi la partie s'arrête, en une phrase : la conquête n'attend plus la dernière ferme, autant dire ce qui a tranché. */
  raisonDeFin(result) {
    const duree = formatTime(result.time);
    if (result.timeUp) return `Temps écoulé après ${duree} — le score départage`;
    if (result.resigned) return `Vous avez abandonné après ${duree}`;
    if (result.winner === -1) return `Durée de la partie : ${duree}`;
    const moi = this.world.humanIndex;
    const centre = ficheDe('towncenter', this.world.players[result.victory ? 1 - moi : moi].civ);
    if (this.world.mode.victory === 'towncenter') {
      const tombe = `${centre.name}${result.victory ? ' adverse' : ''} est tombé${centre.fem ? 'e' : ''}`;
      return result.victory
        ? `${centre.fem ? 'La' : 'Le'} ${tombe} en ${duree}`
        : `Votre ${tombe} — durée de la partie : ${duree}`;
    }
    return `${result.victory ? 'L’adversaire n’a' : 'Vous n’avez'} plus ni ${centre.name} ni bâtiment militaire — durée de la partie : ${duree}`;
  }

  /**
   * Ce que la partie change au palmarès (voir inscrireAuPalmares, save.js) :
   * un record battu s'annonce, avec le précédent ; sinon on rappelle celui qui
   * tient, puis le compte des victoires et des défaites dans ce format.
   */
  textePalmares(palmares, exact) {
    if (!palmares) return '';
    const { ligne, temps, score } = palmares;
    const lignes = [];
    if (temps && temps.record) {
      lignes.push(`<p class="record">${temps.ancien
        ? `<b>Nouveau record !</b> Victoire en ${formatTime(temps.valeur)} — le précédent était de ${formatTime(temps.ancien)}`
        : `<b>Premier temps au palmarès :</b> victoire en ${formatTime(temps.valeur)}`}</p>`);
    } else if (temps) lignes.push(`<p>Meilleur temps à battre : ${formatTime(temps.ancien)}</p>`);
    if (score && score.record) {
      lignes.push(`<p class="record">${score.ancien
        ? `<b>Nouveau record !</b> ${exact(score.valeur)} points — le précédent était de ${exact(score.ancien)}`
        : `<b>Premier score au palmarès :</b> ${exact(score.valeur)} points`}</p>`);
    } else if (score && score.ancien) lignes.push(`<p>Meilleur score à battre : ${exact(score.ancien)} points</p>`);
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    lignes.push(`<p>${this.world.mode.name} · ${this.world.difficulty.name} : ${pluriel(ligne.victoires, 'victoire')}, ${pluriel(ligne.defaites, 'défaite')}</p>`);
    return `<div class="fin-palmares">${lignes.join('')}</div>`;
  }

  showGameOver(result, palmares = null, progression = '') {
    const player = this.world.players[this.world.humanIndex];
    const enemy = this.world.players[1 - this.world.humanIndex];
    const egalite = result.winner === -1;
    const title = egalite ? 'Égalité' : (result.victory ? 'Victoire !' : 'Défaite');
    // Chiffres exacts : arrondis (« 4,0k » contre « 4,0k »), un score serré
    // départagé au temps écoulé ne se lisait plus.
    const exact = (n) => Math.floor(n).toLocaleString('fr-FR');
    // D'où vient le score, part par part (formats chronométrés : voir World.detailScore).
    const part = (cle, libelle) => (result.detail ? `<tr><td>${libelle}</td>
          <td>${exact(result.detail[player.index][cle])}</td><td>${exact(result.detail[enemy.index][cle])}</td></tr>` : '');
    const summary = `
      <table class="scores">
        <tr><th></th><th>Vous</th><th>Adversaire</th></tr>
        <tr><td>Ressources récoltées</td>
            <td>${exact(this.total(player))}</td><td>${exact(this.total(enemy))}</td></tr>
        <tr><td>Unités formées</td><td>${player.stats.trained}</td><td>${enemy.stats.trained}</td></tr>
        <tr><td>Unités perdues</td><td>${player.stats.lost}</td><td>${enemy.stats.lost}</td></tr>
        <tr><td>Bâtiments construits</td><td>${player.stats.built}</td><td>${enemy.stats.built}</td></tr>
        <tr><td>Âge atteint</td><td>${AGES[player.age].name}</td><td>${AGES[enemy.age].name}</td></tr>
        ${part('recolte', 'Points de récolte')}
        ${part('debout', 'Troupes et bâtiments debout')}
        ${part('abattu', 'Ennemis abattus')}
        ${result.scores ? `<tr class="total"><td><b>Score final</b></td>
          <td><b>${exact(result.scores[player.index])}</b></td>
          <td><b>${exact(result.scores[enemy.index])}</b></td></tr>` : ''}
      </table>
      ${result.detail ? '<p class="fin-note">Score : la moitié des ressources récoltées, le prix de ce qui est encore debout, et deux fois le prix de ce qui a été abattu chez l’autre.</p>' : ''}`;
    // La capitale du joueur, telle que la carte la dessine : debout ou éteinte, pour les deux peuples.
    const image = illustrationDeFin(result, player.civ);
    const illustration = image
      ? `<img class="fin-illustration ${image.classe}" src="${image.src}" alt="" decoding="async">` : '';
    const modal = this.showModal(`
      ${illustration}
      <h2>${title}</h2>
      <p class="subtitle">${this.raisonDeFin(result)}</p>
      ${progression || ''}
      ${this.textePalmares(palmares, exact)}
      ${summary}
      <div class="modal-actions">
        <button class="btn primary" data-act="again">Nouvelle partie</button>
        <button class="btn" data-act="menu">Menu principal</button>
      </div>`, { wide: true, fin: true });   // « fin » : ces deux boutons restent à l'écran (voir la feuille de style)
    modal.querySelector('[data-act="again"]').addEventListener('click', () => this.game.restart(), this.ecoute());
    modal.querySelector('[data-act="menu"]').addEventListener('click', () => this.game.quitToMenu(), this.ecoute());
  }

  total(player) {
    const g = player.stats.gathered;
    return g.food + g.wood + g.gold;
  }
}
