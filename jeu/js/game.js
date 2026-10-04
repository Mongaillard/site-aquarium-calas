// ---------------------------------------------------------------------------
// Le monde : état de la partie, ordres, économie, combat, brouillard, victoire.
// Ce module est volontairement « sans navigateur » : il tourne aussi en Node,
// ce qui permet de tester la simulation sans rendu (voir test/simulation.test.js).
// ---------------------------------------------------------------------------

import {
  TILE, POP_MAX, AGES, UNIT_TYPES, BUILDING_TYPES, TECHS,
  START_RESOURCES, MAP_SIZES, DIFFICULTIES, PLAYER_COLORS, GAME_MODES, DEFAULT_MODE,
  DEFAULT_CIV, civDe, nomDe,
} from './config.js';
import { GameMap, BLOCK } from './map.js';
import { PathFinder } from './pathfinding.js';
import { Unit, Animal, Building, Projectile, STATE, computeDamage } from './entities.js';
import { SpatialGrid, RNG, dist, dist2, canAfford, payCost, clamp } from './utils.js';
import { AIPlayer } from './ai.js';

const PATHS_PER_TICK = 10;
const FOG_INTERVAL = 0.25;

function makePlayer(index, name, isAI, civ = DEFAULT_CIV) {
  return {
    index, name, isAI,
    // La civilisation : ce que l'on voit et ce que l'interface nomme (voir CIVILISATIONS).
    civ,
    // Réaffectation automatique des villageois quand un gisement s'épuise.
    // Toujours active pour l'IA ; côté joueur c'est un choix, désactivé par
    // défaut : les ouvriers sont affectés à la main.
    autoWorkers: isAI,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    resources: { ...START_RESOURCES },
    pop: 0,
    popCap: 0,
    age: 0,
    ageProgress: null,
    techs: new Set(),
    defeated: false,
    mods: {
      attackMelee: 0, attackPierce: 0, meleeArmor: 0, pierceArmor: 0,
      villagerSpeed: 1, villagerCarry: 0, range: 0, gatherRate: 1,
    },
    stats: { gathered: { food: 0, wood: 0, gold: 0 }, trained: 0, lost: 0, built: 0, killed: 0 },
  };
}

export class World {
  constructor(options = {}) {
    this.nextId = 1;            // identifiants d'entités, propres à cette partie
    // Les identifiants des réglages sont conservés tels quels : une sauvegarde
    // doit pouvoir recréer exactement le même monde (voir save.js).
    this.modeId = GAME_MODES[options.mode] ? options.mode : DEFAULT_MODE;
    this.mode = GAME_MODES[this.modeId];
    this.mapSizeId = MAP_SIZES[options.mapSize] ? options.mapSize : this.mode.mapSize;
    this.difficultyId = DIFFICULTIES[options.difficulty] ? options.difficulty : 'normal';
    const mapSize = MAP_SIZES[this.mapSizeId];
    this.popMax = this.mode.popMax || POP_MAX;
    this.seed = options.seed || Math.floor(Math.random() * 1e9);
    this.rng = new RNG(this.seed);
    this.map = new GameMap(mapSize.tiles, this.seed);
    this.pathfinder = new PathFinder(this.map);
    this.difficulty = DIFFICULTIES[this.difficultyId];
    this.time = 0;
    this.entities = [];
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.byId = new Map();
    this.grid = new SpatialGrid(this.map.pixelWidth, this.map.pixelHeight, 64);
    this.pathQueue = [];
    this.events = [];
    this.effects = [];
    this.gameOver = null;      // {winner, reason}
    this.fogTimer = 0;
    this.popWarnCooldown = 0;
    this.humanIndex = 0;

    const civs = Array.isArray(options.civs) ? options.civs : [];
    this.players = [
      makePlayer(0, options.playerName || 'Vous', false, civDe(civs[0])),
      makePlayer(1, 'Adversaire', true, civDe(civs[1])),
    ];
    this.players[1].mods.gatherRate = this.difficulty.gatherBonus;
    // « La nature » : le camp des animaux sauvages, qui n'est pas un joueur.
    this.gaia = makePlayer(-1, 'Nature', false);
    this.gaia.color = { main: '#8b7d66', light: '#c2b59f', dark: '#5c5142', name: 'Nature' };

    this.fog = this.createFog();
    this.ais = [];

    // Reprise d'une partie : le contenu du monde vient de la sauvegarde, pas
    // d'une mise en place neuve.
    if (options.restoring) return;
    this.setupStartingPositions();
    this.updateFog(true);
  }

  // --- Mise en place --------------------------------------------------------

  createFog() {
    const n = this.map.w * this.map.h;
    return { explored: new Uint8Array(n), visible: new Uint8Array(n), dirty: true };
  }

  setupStartingPositions() {
    const villagers = this.mode.villagers || 4;
    for (const p of this.players) {
      p.resources = { ...(this.mode.resources || START_RESOURCES) };
      p.age = this.mode.startAge || 0;
    }
    this.map.startPositions.forEach((start, index) => {
      const tc = this.spawnBuilding(index, 'towncenter', start.tx - 1, start.ty - 1, true);
      const spawn = tc.spawnPoint();
      for (let i = 0; i < villagers; i++) {
        const angle = (Math.PI * 2 * i) / villagers + 0.6;
        this.spawnUnit(index, 'villager',
          spawn.x + Math.cos(angle) * TILE * 1.6,
          spawn.y + Math.sin(angle) * TILE * 1.6);
      }
      this.spawnUnit(index, 'scout', spawn.x + TILE * 2.5, spawn.y + TILE * 1.2);
    });
    this.addAI(1);
    this.spawnHerds();
    this.recomputePopulation();
  }

  /**
   * Les hardes : quatre cochons à sept ou huit cases de chaque Centre-Ville,
   * à capturer, et des hardes de cerfs loin des bases. Un tirage à part de la
   * graine : la mise en place du reste ne bouge pas d'un pixel.
   */
  spawnHerds() {
    const map = this.map;
    const rng = new RNG((this.seed ^ 0x5eed) >>> 0 || 1);
    const bases = map.startPositions;
    const loinDesBases = (tx, ty, min) => bases.every((b) => Math.hypot(tx - b.tx, ty - b.ty) >= min);
    const poserHarde = (type, cx, cy, n) => {
      let poses = 0;
      for (let k = 0; k < n * 6 && poses < n; k++) {
        const a = rng.next() * Math.PI * 2, r = rng.next() * 1.8;
        const tx = Math.round(cx + Math.cos(a) * r), ty = Math.round(cy + Math.sin(a) * r);
        if (!map.isOpenTile(tx, ty)) continue;
        const animal = this.spawnAnimal(type, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        animal.home = { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
        poses++;
      }
      return poses;
    };
    for (const b of bases) {
      for (let essai = 0; essai < 40; essai++) {
        const a = rng.next() * Math.PI * 2, d = 6 + rng.next() * 3;
        const tx = Math.round(b.tx + Math.cos(a) * d), ty = Math.round(b.ty + Math.sin(a) * d);
        if (!map.isOpenTile(tx, ty) || map.floodSize(tx, ty, 30) < 30) continue;
        if (poserHarde('pig', tx, ty, 4) >= 3) break;
      }
    }
    const hardes = Math.max(3, Math.round((map.w * map.h) / 1400));
    let posees = 0;
    for (let essai = 0; essai < hardes * 40 && posees < hardes; essai++) {
      const tx = 3 + Math.floor(rng.next() * (map.w - 6)), ty = 3 + Math.floor(rng.next() * (map.h - 6));
      if (!map.isOpenTile(tx, ty) || !loinDesBases(tx, ty, 14) || map.floodSize(tx, ty, 40) < 40) continue;
      if (poserHarde('deer', tx, ty, 3 + Math.floor(rng.next() * 3)) >= 2) posees++;
    }
  }

  spawnAnimal(type, x, y, playerIndex = -1) {
    const animal = new Animal(this, type, x, y, playerIndex);
    this.entities.push(animal);
    this.units.push(animal);
    this.byId.set(animal.id, animal);
    return animal;
  }

  onAnimalCaptured(animal) {
    if (animal.playerIndex === this.humanIndex) {
      this.pushEvent({ type: 'notice', text: `Cochon capturé : menez-le au village, un ${nomDe('villager', this.players[this.humanIndex].civ).toLowerCase()} l’abattra.` });
    }
  }

  /**
   * L'unité (pas un animal) la plus proche dans le rayon : tous camps
   * confondus, ou seulement celles du joueur `playerIndex`.
   */
  unitePres(entity, radius, playerIndex = null) {
    let best = null, bestD = Infinity;
    this.grid.forEachNear(entity.x, entity.y, radius, (other) => {
      if (other.dead || other.kind !== 'unit' || other.isAnimal || other.garrisonedIn) return;
      if (playerIndex !== null && other.playerIndex !== playerIndex) return;
      const d = dist(entity.x, entity.y, other.x, other.y);
      if (d <= radius && d < bestD) { bestD = d; best = other; }
    });
    return best;
  }

  /**
   * Un animal abattu laisse sa carcasse : une case de nourriture qui ne bloque
   * pas le passage, posée là où il est tombé (ou tout à côté). Les villageois
   * qui le chassaient enchaînent dessus.
   */
  deposerCarcasse(animal) {
    const map = this.map;
    let tx = Math.floor(animal.x / TILE), ty = Math.floor(animal.y / TILE);
    if (!map.inBounds(tx, ty) || map.resources.has(map.idx(tx, ty)) || (map.blocked[map.idx(tx, ty)] & (BLOCK.BUILDING | BLOCK.TERRAIN))) {
      // Pas findFreeTile : une carcasse déjà là ne bloque pas le passage, il
      // rendrait sa case, qu'addResource refuserait — la nourriture perdue.
      let libre = null;
      for (let r = 1; r <= 3 && !libre; r++) {
        for (let dy = -r; dy <= r && !libre; dy++) {
          for (let dx = -r; dx <= r && !libre; dx++) {
            const x = tx + dx, y = ty + dy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !map.isBlocked(x, y)
                && !map.resources.has(map.idx(x, y))) libre = { tx: x, ty: y };
          }
        }
      }
      if (!libre) return null;
      tx = libre.tx; ty = libre.ty;
    }
    const res = map.addResource(tx, ty, 'food', this.rng, { amount: animal.def.food, gibier: animal.type });
    if (!res) return null;
    for (const u of this.units) {
      if (u.dead || !u.isVillager || u.target !== animal) continue;
      u.gatherAt(tx, ty);
    }
    return res;
  }

  newEntityId() { return this.nextId++; }

  /** Branche une intelligence artificielle sur un joueur (mise en place ou reprise). */
  addAI(playerIndex) {
    const ai = new AIPlayer(this, playerIndex, this.difficulty);
    this.ais.push(ai);
    return ai;
  }

  spawnUnit(playerIndex, type, x, y) {
    const free = this.map.findFreeTile(Math.floor(x / TILE), Math.floor(y / TILE), 10);
    const px = free ? free.tx * TILE + TILE / 2 : x;
    const py = free ? free.ty * TILE + TILE / 2 : y;
    const unit = new Unit(this, playerIndex, type, px, py);
    this.entities.push(unit);
    this.units.push(unit);
    this.byId.set(unit.id, unit);
    this.recomputePopulation();
    return unit;
  }

  /**
   * Sort de l'emprise d'un bâtiment les unités qui s'y trouvent — et celles
   * qu'il vient d'enfermer : posé contre des arbres, il peut clore une poche
   * de quelques cases autour d'un villageois, qui y restait ensuite, sac
   * plein, sans chemin vers aucun dépôt.
   */
  evictUnitsFrom(building) {
    const { tx, ty, size } = building;
    const MARGE = 6;
    for (const u of this.units) {
      if (u.dead || u.garrisonedIn) continue;
      const utx = Math.floor(u.x / TILE), uty = Math.floor(u.y / TILE);
      const dessous = utx >= tx && utx < tx + size && uty >= ty && uty < ty + size;
      if (!dessous) {
        if (utx < tx - MARGE || utx >= tx + size + MARGE || uty < ty - MARGE || uty >= ty + size + MARGE) continue;
        if (this.map.isBlocked(utx, uty) || this.map.floodSize(utx, uty, 40) >= 40) continue;
      }
      // Une case OUVERTE : la plus proche des cases libres peut être une poche
      // fermée de la forêt voisine, d'où l'unité ne sortirait jamais.
      const free = this.map.findOpenTile(utx, uty, 8);
      if (!free) continue;
      u.x = free.tx * TILE + TILE / 2;
      u.y = free.ty * TILE + TILE / 2;
      u.path = null; u.pathIndex = 0; u.stuckTime = 0;
      if (u.destination) u.requestPathTo(u.destination.x, u.destination.y);
    }
  }

  spawnBuilding(playerIndex, type, tx, ty, complete = false) {
    const size = BUILDING_TYPES[type].size;
    tx = clamp(tx, 0, this.map.w - size);
    ty = clamp(ty, 0, this.map.h - size);
    const b = new Building(this, playerIndex, type, tx, ty, complete);
    // Format de partie : en Express, le Centre-Ville est l'objectif, il ne peut
    // pas être une forteresse imprenable.
    const facteur = type === 'towncenter' ? (this.mode.townCenterHp || 1) : 1;
    if (facteur !== 1) { b.maxHp = Math.round(b.maxHp * facteur); b.hp = Math.min(b.hp, b.maxHp); }
    this.entities.push(b);
    this.buildings.push(b);
    this.byId.set(b.id, b);
    if (complete) this.recomputePopulation();
    this.map.dirty = true;
    return b;
  }

  // --- Affichage lissé ------------------------------------------------------

  /**
   * La simulation avance par pas de 1/20 s ; l'écran, lui, affiche soixante
   * images par seconde. Le temps d'un dessin, unités et projectiles sont placés
   * ENTRE leur position d'avant le dernier pas et l'actuelle (`a` : part du pas
   * suivant déjà écoulée, de 0 à 1) — ils glissent au lieu d'avancer par
   * à-coups. `delisser` remet aussitôt les vraies positions : la simulation
   * ne voit jamais rien de tout cela.
   */
  lisser(a) {
    const t = a < 0 ? 0 : a > 1 ? 1 : a;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      u.rx = u.x; u.ry = u.y;
      if (u.px === undefined) continue;
      u.x = u.px + (u.x - u.px) * t;
      u.y = u.py + (u.y - u.py) * t;
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      p.rx = p.x; p.ry = p.y; p.rTravel = p.travel;
      if (p.px === undefined) continue;
      p.x = p.px + (p.x - p.px) * t;
      p.y = p.py + (p.y - p.py) * t;
      p.travel = p.pTravel + (p.travel - p.pTravel) * t;
    }
  }

  delisser() {
    for (let i = 0; i < this.units.length; i++) { const u = this.units[i]; u.x = u.rx; u.y = u.ry; }
    for (let i = 0; i < this.projectiles.length; i++) { const p = this.projectiles[i]; p.x = p.rx; p.y = p.ry; p.travel = p.rTravel; }
  }

  // --- Boucle de simulation -------------------------------------------------

  update(dt) {
    if (this.gameOver) return;
    this.time += dt;
    // Où chacun se tenait avant ce pas : l'affichage glisse de là jusqu'à la
    // position nouvelle (voir lisser), au lieu de sauter vingt fois par seconde.
    for (let i = 0; i < this.units.length; i++) { const u = this.units[i]; u.px = u.x; u.py = u.y; }
    for (let i = 0; i < this.projectiles.length; i++) { const p = this.projectiles[i]; p.px = p.x; p.py = p.y; p.pTravel = p.travel; }
    if (this.popWarnCooldown > 0) this.popWarnCooldown -= dt;

    this.rebuildGrid();
    this.processPathQueue();

    // Relevé des bâtisseurs du tick précédent : sert au rendement décroissant.
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.complete) continue;
      b.builderCount = b.activeBuilders;
      b.activeBuilders = 0;
      b.assignedBuilders = 0;
    }
    // Et relevé des ouvriers affectés, ceux qui marchent encore compris : c'est
    // ce chiffre-là qu'on affiche, pour que le renfort se voie tout de suite.
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead || !u.isVillager || u.state !== STATE.BUILD) continue;
      if (u.target && u.target.kind === 'building' && !u.target.complete) u.target.assignedBuilders++;
    }

    for (let i = 0; i < this.units.length; i++) this.units[i].update(dt);
    for (let i = 0; i < this.buildings.length; i++) this.buildings[i].update(dt);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].life -= dt;
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }

    for (const player of this.players) this.updateAgeProgress(player, dt);
    for (const ai of this.ais) ai.update(dt);

    this.accessResetTimer = (this.accessResetTimer || 0) - dt;
    if (this.accessResetTimer <= 0) {
      this.accessResetTimer = 45;
      for (const res of this.map.resources.values()) res.inaccessible = false;
      for (const b of this.buildings) { b.unreachable = false; b.gatherUnreachable = false; }
    }

    this.fogTimer -= dt;
    if (this.fogTimer <= 0) {
      this.fogTimer = FOG_INTERVAL;
      this.updateFog();
    }

    this.checkVictory();
    this.checkTimeLimit();
  }

  rebuildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.dead && !e.garrisonedIn) this.grid.insert(e);
    }
  }

  // --- Chemins (budget par tick pour éviter les à-coups) ---------------------

  /**
   * @param rect emprise d'un bâtiment ({x0,y0,x1,y1}, en cases, bornes
   *   comprises) : le chemin mène alors à la case de son pourtour la plus
   *   proche PAR LE CHEMIN — pas à vol d'oiseau, qui peut être emmurée.
   */
  requestPath(unit, x, y, adjacent = false, rect = null) {
    // Déjà en attente : la demande est mise à jour sur place. Sinon l'unité
    // occuperait deux places dans la file et son chemin serait calculé deux fois.
    const dejaEnFile = unit.pathPending;
    unit.pathPending = true;
    unit.pathRequest = { x, y, adjacent, rect, seq: (unit.pathSeq = (unit.pathSeq || 0) + 1) };
    if (!dejaEnFile) this.pathQueue.push(unit);
  }

  processPathQueue() {
    let processed = 0;
    while (this.pathQueue.length > 0 && processed < PATHS_PER_TICK) {
      const unit = this.pathQueue.shift();
      // Une unité qui a reçu son chemin entre-temps (ou s'est arrêtée) n'attend plus rien.
      if (!unit || unit.dead || !unit.pathPending || !unit.pathRequest) continue;
      const req = unit.pathRequest;
      processed++;
      const sx = Math.floor(unit.x / TILE);
      const sy = Math.floor(unit.y / TILE);
      if (req.rect) {
        // Pourtour d'un bâtiment : le chemin le plus court vers l'une de ses
        // cases, ou au plus près si aucune n'est joignable.
        const r = req.rect;
        const gxr = clamp(Math.floor(req.x / TILE), r.x0, r.x1);
        const gyr = clamp(Math.floor(req.y / TILE), r.y0, r.y1);
        unit.setPath(this.pathfinder.find(sx, sy, gxr, gyr, { rect: r, smooth: false }) || []);
        continue;
      }
      let gx = clamp(Math.floor(req.x / TILE), 0, this.map.w - 1);
      let gy = clamp(Math.floor(req.y / TILE), 0, this.map.h - 1);
      let adjacent = req.adjacent;
      // Cible bloquée dont aucune case voisine n'est libre (centre d'un grand
      // bâtiment, par exemple) : l'A* explorerait toute la carte pour rien.
      // On vise alors directement la case libre la plus proche.
      if (adjacent && this.map.isBlocked(gx, gy) && !this.map.hasFreeNeighbour(gx, gy)) {
        const free = this.map.findFreeTile(gx, gy, 10);
        if (!free) { unit.setPath([]); continue; }
        gx = free.tx; gy = free.ty; adjacent = false;
      }
      // Chemin complet, sans lissage : l'unité lisse elle-même en marchant.
      let path = this.pathfinder.find(sx, sy, gx, gy, { adjacent, smooth: false });
      if (!path && !adjacent) {
        const free = this.map.findFreeTile(gx, gy, 6);
        if (free) path = this.pathfinder.find(sx, sy, free.tx, free.ty, { smooth: false });
      }
      unit.setPath(path || []);
    }
  }



  // --- Voisinage et recherche -----------------------------------------------

  separationForce(unit) {
    let fx = 0, fy = 0;
    const minDist = unit.radius * 1.9;
    this.grid.forEachNear(unit.x, unit.y, minDist, (other) => {
      if (other === unit || other.dead || other.kind !== 'unit') return;
      const dx = unit.x - other.x, dy = unit.y - other.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > minDist * minDist || d2 < 0.0001) return;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / minDist;
      fx += (dx / d) * push;
      fy += (dy / d) * push;
    });
    const len = Math.hypot(fx, fy);
    if (len > 1) { fx /= len; fy /= len; }
    return { x: fx * 0.85, y: fy * 0.85 };
  }

  findEnemyNear(entity, radius) {
    let best = null, bestScore = Infinity;
    this.grid.forEachNear(entity.x, entity.y, radius, (other) => {
      if (other.dead || other.playerIndex === entity.playerIndex || other.isAnimal) return;
      if (other.kind === 'building' && !other.complete && other.hp <= 1) return;
      const d = entity.kind === 'building' || other.kind === 'building'
        ? Math.max(entity.edgeDistanceTo(other.x, other.y), other.edgeDistanceTo(entity.x, entity.y))
        : dist(entity.x, entity.y, other.x, other.y);
      if (d > radius) return;
      const d2 = d * d;
      // Priorité aux unités : un bâtiment ne doit pas détourner une escouade.
      const score = d2 * (other.kind === 'unit' ? 1 : 3.2);
      if (score < bestScore) { bestScore = score; best = other; }
    });
    return best;
  }

  /**
   * @param {Set<number>} [exclude] entrepôts que CETTE unité n'a pas réussi à
   *   rejoindre. On n'utilise plus de drapeau global : l'échec d'un villageois
   *   ne doit pas priver tous les autres de leur dépôt.
   */
  findNearestDropoff(unit, resType, exclude) {
    let best = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.playerIndex !== unit.playerIndex || !b.complete) continue;
      if (exclude && exclude.has(b.id)) continue;
      if (!b.def.dropoff || !b.def.dropoff.includes(resType)) continue;
      const d = dist2(unit.x, unit.y, b.x, b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** Gisement le plus proche : case de ressource ou ferme alliée pour la nourriture. */
  findNearestResource(x, y, type, maxRadius, playerIndex) {
    const map = this.map;
    // Plusieurs passes : si le meilleur gisement s'avère enclavé, on le marque
    // et on relance la recherche sans lui.
    for (let attempt = 0; attempt < 4; attempt++) {
      let best = null, bestD = maxRadius * maxRadius;
      for (const res of map.resources.values()) {
        if (res.type !== type || res.inaccessible) continue;
        const d = dist2(x, y, res.tx * TILE + TILE / 2, res.ty * TILE + TILE / 2);
        if (d < bestD) { bestD = d; best = res; }
      }
      if (type === 'food') {
        for (const b of this.buildings) {
          if (b.dead || b.type !== 'farm' || b.playerIndex !== playerIndex || !b.complete) continue;
          if (b.foodLeft <= 0 || b.gatherUnreachable) continue;
          const d = dist2(x, y, b.x, b.y);
          if (d < bestD) { bestD = d; best = b; }
        }
      }
      if (!best) return null;
      if (best.kind === 'building' || map.hasOpenNeighbour(best.tx, best.ty)) return best;
      best.inaccessible = true;
    }
    return null;
  }

  /**
   * Gisement du même type réellement exploitable autour d'une case : un arbre
   * au cœur d'une forêt n'a aucune case voisine libre, donc personne ne peut
   * venir l'abattre. On reporte alors l'ordre sur le plus proche accessible,
   * comme le fait Age of Empires quand on clique au milieu d'un bois.
   */
  findReachableResource(tx, ty, type, maxRadius = 10) {
    const map = this.map;
    for (let r = 0; r <= maxRadius; r++) {
      let best = null, bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          const res = map.resourceAt(x, y);
          if (!res || res.type !== type || res.inaccessible) continue;
          if (!map.hasOpenNeighbour(x, y)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = res; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * L'allié blessé le plus mal en point à portée d'une soigneuse : une unité
   * de son camp (ni elle-même, ni une bête, ni un abrité), à qui il manque
   * des points de vie.
   */
  findWoundedAllyNear(entity, radius) {
    let best = null, bestRatio = 1;
    this.grid.forEachNear(entity.x, entity.y, radius, (other) => {
      if (other === entity || other.dead || other.kind !== 'unit' || other.isAnimal || other.garrisonedIn) return;
      if (other.playerIndex !== entity.playerIndex || other.hp >= other.maxHp) return;
      if (dist(entity.x, entity.y, other.x, other.y) > radius) return;
      const ratio = other.hp / other.maxHp;
      if (ratio < bestRatio) { bestRatio = ratio; best = other; }
    });
    return best;
  }

  entitiesOfPlayer(playerIndex, filter) {
    return this.entities.filter((e) => !e.dead && e.playerIndex === playerIndex && (!filter || filter(e)));
  }

  /**
   * Distance² si le point touche l'entité (tolérance comprise), sinon -1.
   * La tolérance existe pour le tactile : sans elle, une unité n'offre qu'une
   * cible de neuf pixels à l'écran, invisable au doigt.
   */
  hitTest(entity, x, y, tolerance = 0) {
    const d = dist2(x, y, entity.x, entity.y);
    if (entity.kind === 'building') {
      const half = (entity.size * TILE) / 2 + tolerance;
      const inside = x >= entity.x - half && x <= entity.x + half
        && y >= entity.y - half && y <= entity.y + half;
      return inside ? d : -1;
    }
    const r = entity.radius + 8 + tolerance;
    return d <= r * r ? d : -1;
  }

  entityAt(x, y, playerIndex = null, tolerance = 0) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.garrisonedIn) continue;
      if (playerIndex !== null && e.playerIndex !== playerIndex) continue;
      const d = this.hitTest(e, x, y, tolerance);
      if (d >= 0 && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** Cible hostile sous le doigt : sert à donner la priorité à l'attaque. */
  enemyAt(x, y, playerIndex, tolerance = 0) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.garrisonedIn || e.playerIndex === playerIndex) continue;
      const d = this.hitTest(e, x, y, tolerance);
      if (d >= 0 && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // --- Combat ---------------------------------------------------------------

  performAttack(attacker, target) {
    if (!target || target.dead) return;
    // Le geste d'une soigneuse rend des points de vie au lieu d'en ôter.
    if (attacker.def.heal) {
      if (target.playerIndex !== attacker.playerIndex) return;
      target.hp = Math.min(target.maxHp, target.hp + attacker.def.heal);
      this.effects.push({ kind: 'soin', x: target.x, y: target.y - 8, life: 0.7, max: 0.7 });
      this.pushEvent({ type: 'heal', x: target.x, y: target.y, player: attacker.playerIndex });
      return;
    }
    const damage = computeDamage(attacker.def, attacker.player, target);
    if (attacker.def.projectile) {
      this.projectiles.push(new Projectile(this, attacker, target, damage));
      this.pushEvent({ type: 'shoot', x: attacker.x, y: attacker.y, player: attacker.playerIndex });
    } else {
      target.takeDamage(damage, attacker);
      this.effects.push({ kind: 'hit', x: target.x, y: target.y - 6, life: 0.25, max: 0.25 });
      this.pushEvent({ type: 'melee', x: attacker.x, y: attacker.y, player: attacker.playerIndex });
    }
  }

  /**
   * Le boulet d'une catapulte touche le sol : tout ce qui n'est pas du camp
   * du tireur, dans son rayon, encaisse le coup (calculé pour chacun : armure
   * et bonus contre les bâtiments compris). Les bêtes sauvages sont épargnées.
   */
  impactDeZone(pr) {
    const rayon = pr.splash * TILE;
    const tireur = pr.source;
    const def = tireur.def, joueur = this.players[tireur.playerIndex] || this.gaia;
    const touches = [];
    this.grid.forEachNear(pr.x, pr.y, rayon + TILE * 2, (e) => {
      if (e.dead || e.garrisonedIn || e.playerIndex === tireur.playerIndex) return;
      if (e.isAnimal && e.playerIndex < 0) return;
      if (e.edgeDistanceTo(pr.x, pr.y) <= rayon) touches.push(e);
    });
    for (const e of touches) e.takeDamage(def ? computeDamage(def, joueur, e) : pr.damage, tireur);
    this.effects.push({ kind: 'impact', x: pr.x, y: pr.y, rayon, life: 0.5, max: 0.5 });
    this.pushEvent({ type: 'melee', x: pr.x, y: pr.y, player: tireur.playerIndex });
  }

  onDamaged(entity, source, amount) {
    // Riposte : une unité inoccupée rend les coups, sauf attitude « sans
    // attaque ». Les villageois ne se défendent que contre d'autres villageois
    // (comme dans AoE : face à un soldat, mieux vaut fuir ou se réfugier).
    if (entity.kind === 'unit' && source && !source.dead && !entity.garrisonedIn
        && entity.stance !== 'passive' && !entity.def.heal
        && (entity.state === STATE.IDLE || (entity.state === STATE.MOVE && !entity.destination))) {
      entity.attackEntity(source, true);
    } else if (entity.kind === 'unit' && entity.isVillager && source && !source.dead
        && source.kind === 'unit' && source.isVillager && entity.state === STATE.IDLE) {
      entity.attackEntity(source, true);
    }
    // Abattre son propre cochon n'est pas une attaque.
    const abattage = entity.isAnimal && source && source.playerIndex === entity.playerIndex;
    if (entity.playerIndex === this.humanIndex && !abattage) {
      this.pushEvent({ type: 'underAttack', x: entity.x, y: entity.y, entity });
    }
  }

  killEntity(entity, source, silent = false) {
    if (entity.dead) return;
    entity.dead = true;
    entity.selected = false;
    this.byId.delete(entity.id);
    const owner = this.players[entity.playerIndex] || this.gaia;

    if (entity.kind === 'unit') {
      const i = this.units.indexOf(entity);
      if (i >= 0) this.units.splice(i, 1);
      // Mort à l'abri (supprimé par le joueur, par exemple) : sa place se libère,
      // sinon il compterait encore comme occupant et comme archer.
      if (entity.garrisonedIn) {
        const g = entity.garrisonedIn.garrison;
        const k = g.indexOf(entity);
        if (k >= 0) g.splice(k, 1);
        entity.garrisonedIn = null;
      }
      if (!entity.isAnimal) {
        owner.stats.lost++;
        if (source && this.players[source.playerIndex]) this.players[source.playerIndex].stats.killed++;
      }
      this.effects.push({ kind: 'death', x: entity.x, y: entity.y, life: 1.2, max: 1.2, color: owner.color.main });
      // Le corps reste un moment à terre : une unité en 3D y joue sa chute
      // (voir Renderer.dessinerCadavres) ; les autres n'en dessinent rien.
      if (!entity.isAnimal) {
        this.effects.push({
          kind: 'cadavre', x: entity.x, y: entity.y, type: entity.type, facing: entity.facing,
          // La vue sous laquelle le rendu montrait la troupe (état d'affichage seul ; -1 sans rendu).
          vue: entity._vue3d ? entity._vue3d.k : -1,
          joueur: entity.playerIndex, life: 6, max: 6,
        });
      }
      if (entity.isAnimal) this.deposerCarcasse(entity);
    } else {
      const i = this.buildings.indexOf(entity);
      if (i >= 0) this.buildings.splice(i, 1);
      // La garnison périt avec le bâtiment (règle d'AoE).
      if (entity.garrison && entity.garrison.length > 0) {
        for (const occupant of entity.garrison.slice()) {
          occupant.garrisonedIn = null;
          this.killEntity(occupant, source);
        }
        entity.garrison.length = 0;
      }
      // Une ferme ne bloquait rien : « libérer » ses cases déboucherait celles
      // d'un voisin qui les occuperait.
      if (!entity.def.walkable) entity.releaseTiles();
      this.map.dirty = true;
      if (!silent) {
        this.effects.push({ kind: 'rubble', x: entity.x, y: entity.y, life: 12, max: 12, size: entity.size });
      }
      // Une ferme épuisée n'est replantée d'office que si l'automatisme est actif.
      // Une fondation annulée disparaît aussi en silence : elle n'est pas épuisée.
      if (silent && entity.type === 'farm' && entity.complete && entity.foodLeft <= 0) {
        if (owner.autoWorkers) this.reseedFarm(entity);
        else if (entity.playerIndex === this.humanIndex) {
          this.pushEvent({ type: 'notice', text: 'Ferme épuisée — reconstruisez-la pour continuer.' });
        }
      }
    }

    const e = this.entities.indexOf(entity);
    if (e >= 0) this.entities.splice(e, 1);
    this.recomputePopulation();
    if (!silent) this.pushEvent({ type: 'destroyed', entity, x: entity.x, y: entity.y, player: entity.playerIndex });
  }

  reseedFarm(farm) {
    const owner = this.players[farm.playerIndex];
    const cost = BUILDING_TYPES.farm.cost;
    if (!canAfford(owner.resources, cost)) return;
    // On ne replante que si un villageois travaillait encore dessus.
    const workers = this.units.filter((u) => u.playerIndex === farm.playerIndex && u.target === farm);
    if (workers.length === 0) return;
    payCost(owner.resources, cost);
    const site = this.spawnBuilding(farm.playerIndex, 'farm', farm.tx, farm.ty, false);
    for (const w of workers) w.buildAt(site);
  }

  // --- Économie -------------------------------------------------------------

  deposit(playerIndex, type, amount) {
    if (!type || amount <= 0) return;
    const p = this.players[playerIndex];
    p.resources[type] += amount;
    p.stats.gathered[type] += amount;
  }

  recomputePopulation() {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const u of this.units) if (!u.dead && !u.isAnimal) this.players[u.playerIndex].pop += u.def.pop || 1;
    for (const b of this.buildings) {
      if (b.dead || !b.complete || !b.def.popBonus) continue;
      this.players[b.playerIndex].popCap += b.def.popBonus;
    }
    const marge = this.mode.popStart || 0;
    for (const p of this.players) p.popCap = Math.min(this.popMax, p.popCap + marge);
  }

  /** Un villageois vient de se retrouver sans travail (gisement épuisé). */
  notifyIdleWorker(unit) {
    if (unit.playerIndex !== this.humanIndex) return;
    this.pushEvent({ type: 'idleWorker', unit, x: unit.x, y: unit.y });
  }

  /**
   * Affecte un villageois à une ressource : il rejoint le gisement le plus
   * proche de lui (ou une ferme alliée pour la nourriture).
   * @returns {boolean} false si plus rien à récolter de ce type dans la zone.
   */
  assignVillager(villager, type) {
    const target = this.findNearestResource(villager.x, villager.y, type, 40 * TILE, villager.playerIndex);
    if (!target) return false;
    // On passe par la répartition : un renfort évite les cases déjà occupées.
    if (target.kind === 'building') this.spreadFarmOrder([villager], target);
    else this.spreadGatherOrder([villager], target.tx, target.ty, type);
    return true;
  }

  /** Chantiers d'un joueur : bâtiments posés mais pas encore terminés. */
  constructionSites(playerIndex) {
    return this.buildings.filter((b) => !b.dead && !b.complete && b.playerIndex === playerIndex);
  }

  /**
   * Ouvriers affectés à un chantier — ceux qui frappent comme ceux qui y
   * marchent encore. `builderCount` ne compte que les premiers : il sert au
   * rendement, pas à savoir si un renfort est déjà en route.
   */
  buildersOn(site) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead || !u.isVillager) continue;
      if (u.state === STATE.BUILD && u.target === site) n++;
    }
    return n;
  }

  /**
   * Envoie un villageois prêter main-forte. À distance comparable, le chantier
   * qui manque de bras passe devant : le rendement décroît, un septième ouvrier
   * sur la même maison ne sert plus à grand-chose.
   */
  assignBuilder(villager, sites = null) {
    const list = (sites || this.constructionSites(villager.playerIndex))
      .filter((b) => !b.dead && !b.complete);
    if (list.length === 0) return null;
    const crowdPenalty = (6 * TILE) ** 2;
    let best = null, bestScore = Infinity;
    for (const site of list) {
      const score = dist2(villager.x, villager.y, site.x, site.y)
        + this.buildersOn(site) * crowdPenalty;
      if (score < bestScore) { bestScore = score; best = site; }
    }
    if (!best) return null;
    villager.buildAt(best);
    return best;
  }

  notifyPopBlocked(playerIndex) {
    if (playerIndex !== this.humanIndex || this.popWarnCooldown > 0) return;
    this.popWarnCooldown = 12;
    this.pushEvent({ type: 'notice', text: 'Population maximale atteinte — construisez des maisons.' });
  }

  // --- Production -----------------------------------------------------------

  canTrain(building, unitType) {
    const player = this.players[building.playerIndex];
    const def = UNIT_TYPES[unitType];
    if (!def || !building.complete) return { ok: false, reason: 'Bâtiment en construction' };
    if ((def.age || 0) > player.age) return { ok: false, reason: 'Âge requis : ' + AGES[def.age].name };
    if (building.queue.length >= 8) return { ok: false, reason: 'File d’attente pleine' };
    if (!canAfford(player.resources, def.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
    return { ok: true };
  }

  trainUnit(building, unitType) {
    const check = this.canTrain(building, unitType);
    if (!check.ok) {
      if (building.playerIndex === this.humanIndex) this.pushEvent({ type: 'notice', text: check.reason });
      return false;
    }
    const def = UNIT_TYPES[unitType];
    payCost(this.players[building.playerIndex].resources, def.cost);
    building.enqueue({ kind: 'unit', id: unitType, timeLeft: def.trainTime, total: def.trainTime, cost: def.cost });
    return true;
  }

  canResearch(building, techId) {
    const tech = TECHS[techId];
    const player = this.players[building.playerIndex];
    if (!tech || !building.complete) return { ok: false, reason: 'Indisponible' };
    if (player.techs.has(techId)) return { ok: false, reason: 'Déjà recherché' };
    // En cours dans N'IMPORTE LEQUEL de ses bâtiments : deux forges (ou deux
    // Centres-Villes) la paieraient et l'appliqueraient deux fois.
    if (this.buildings.some((b) => !b.dead && b.playerIndex === building.playerIndex
        && b.queue.some((q) => q.kind === 'tech' && q.id === techId))) {
      return { ok: false, reason: 'Déjà en cours' };
    }
    if (tech.age > player.age) return { ok: false, reason: 'Âge requis : ' + AGES[tech.age].name };
    if (building.queue.length >= 8) return { ok: false, reason: 'File d’attente pleine' };
    if (!canAfford(player.resources, tech.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
    return { ok: true };
  }

  researchTech(building, techId) {
    const check = this.canResearch(building, techId);
    if (!check.ok) {
      if (building.playerIndex === this.humanIndex) this.pushEvent({ type: 'notice', text: check.reason });
      return false;
    }
    const tech = TECHS[techId];
    payCost(this.players[building.playerIndex].resources, tech.cost);
    building.enqueue({ kind: 'tech', id: techId, timeLeft: tech.time, total: tech.time, cost: tech.cost });
    return true;
  }

  completeProduction(building, item) {
    if (item.kind === 'unit') {
      const spawn = building.spawnPoint();
      const unit = this.spawnUnit(building.playerIndex, item.id, spawn.x, spawn.y);
      this.players[building.playerIndex].stats.trained++;
      if (building.rally) {
        const rallyEntity = building.rallyEntity && !building.rallyEntity.dead ? building.rallyEntity : null;
        const r = building.rallyResource;
        if (unit.isVillager && rallyEntity && rallyEntity.kind === 'building'
            && rallyEntity.playerIndex === building.playerIndex
            && (!rallyEntity.complete || rallyEntity.type === 'farm')) {
          // Ralliement sur un chantier ou une ferme : le villageois s'y met
          // direct — une ferme encore en chantier se bâtit d'abord.
          if (rallyEntity.complete) unit.gatherFarm(rallyEntity);
          else unit.buildAt(rallyEntity);
        } else if (unit.isVillager && r && this.map.resourceAt(r.tx, r.ty)) {
          // Point de ralliement sur une ressource : le villageois s'y met direct.
          unit.gatherAt(r.tx, r.ty);
        } else {
          // Tout autre point (un camp, une maison, le sol) : on s'y rend.
          unit.moveTo(building.rally.x, building.rally.y, !unit.isVillager);
        }
      }
      this.pushEvent({ type: 'trained', unit, player: building.playerIndex });
    } else if (item.kind === 'tech') {
      this.applyTech(this.players[building.playerIndex], item.id);
      this.pushEvent({ type: 'tech', id: item.id, player: building.playerIndex });
    }
  }

  cancelProduction(building, index) {
    const item = building.queue[index];
    if (!item) return;
    building.queue.splice(index, 1);
    const stock = this.players[building.playerIndex].resources;
    for (const key in item.cost) stock[key] += item.cost[key];
  }

  applyTech(player, techId) {
    if (player.techs.has(techId)) return;   // une technologie ne s'applique qu'une fois
    player.techs.add(techId);
    const mods = player.mods;
    switch (techId) {
      case 'wheelbarrow': mods.villagerSpeed += 0.15; mods.villagerCarry += 3; break;
      case 'forging': mods.attackMelee += 1; break;
      case 'fletching': mods.attackPierce += 1; mods.range += 0.5; break;
      case 'scaleArmor': mods.meleeArmor += 1; mods.pierceArmor += 1; break;
    }
  }

  // --- Âges -----------------------------------------------------------------

  canAdvanceAge(building) {
    const player = this.players[building.playerIndex];
    const next = AGES[player.age + 1];
    if (!next) return { ok: false, reason: 'Âge maximal atteint' };
    if (player.ageProgress) return { ok: false, reason: 'Passage déjà en cours' };
    if (!building.complete || building.type !== 'towncenter') return { ok: false, reason: 'Centre-Ville requis' };
    if (!canAfford(player.resources, next.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
    return { ok: true };
  }

  advanceAge(building) {
    const check = this.canAdvanceAge(building);
    if (!check.ok) {
      if (building.playerIndex === this.humanIndex) this.pushEvent({ type: 'notice', text: check.reason });
      return false;
    }
    const player = this.players[building.playerIndex];
    const next = AGES[player.age + 1];
    payCost(player.resources, next.cost);
    player.ageProgress = { timeLeft: next.time, total: next.time, building };
    return true;
  }

  updateAgeProgress(player, dt) {
    if (!player.ageProgress) return;
    // Le Centre-Ville qui portait le passage est tombé : il s'arrête là, perdu
    // comme la file d'un bâtiment détruit. Avant, l'âge arrivait quand même.
    const porteur = player.ageProgress.building;
    if (porteur && porteur.dead) {
      player.ageProgress = null;
      if (player.index === this.humanIndex) {
        this.pushEvent({ type: 'notice', text: `Passage d’âge interrompu : votre ${nomDe('towncenter', player.civ)} est tombé.` });
      }
      return;
    }
    player.ageProgress.timeLeft -= dt;
    if (player.ageProgress.timeLeft > 0) return;
    player.ageProgress = null;
    player.age++;
    this.pushEvent({ type: 'age', player: player.index, age: player.age });
  }

  // --- Construction ---------------------------------------------------------

  canPlace(playerIndex, type, tx, ty, ignoreFog = false) {
    const def = BUILDING_TYPES[type];
    const player = this.players[playerIndex];
    if (!def) return false;
    if ((def.age || 0) > player.age) return false;
    if (def.requires && !this.buildings.some(
      (b) => b.playerIndex === playerIndex && b.type === def.requires && b.complete && !b.dead)) return false;
    if (def.limit) {
      const count = this.buildings.filter((b) => b.playerIndex === playerIndex && b.type === type && !b.dead).length;
      if (count >= def.limit) return false;
    }
    for (let y = ty; y < ty + def.size; y++) {
      for (let x = tx; x < tx + def.size; x++) {
        if (!this.map.inBounds(x, y)) return false;
        const i = this.map.idx(x, y);
        if (this.map.blocked[i] !== 0) return false;
        // Une carcasse ne bloque pas sa case : elle finissait sous le bâtiment.
        if (this.map.resources.has(i)) return false;
        if (!ignoreFog && playerIndex === this.humanIndex && !this.fog.explored[i]) return false;
      }
    }
    // Une ferme se traverse — elle ne bloque pas ses cases — mais elle occupe
    // le terrain : on ne bâtit pas dessus, pas même une autre ferme. Avant,
    // l'IA empilait ses fermes, et une maison posée sur une ferme devenait
    // traversable quand la ferme s'épuisait.
    if (this.buildings.some((b) => !b.dead && b.def.walkable
        && tx < b.tx + b.size && b.tx < tx + def.size && ty < b.ty + b.size && b.ty < ty + def.size)) return false;
    // Sans case libre sur le pourtour, personne ne pourrait venir le bâtir.
    if (!def.walkable && !this.hasAccessAround(tx, ty, def.size)) return false;
    return true;
  }

  /** Y a-t-il une case libre autour de l'emprise ? */
  hasAccessAround(tx, ty, size) {
    for (let y = ty - 1; y <= ty + size; y++) {
      for (let x = tx - 1; x <= tx + size; x++) {
        const inside = x >= tx && x < tx + size && y >= ty && y < ty + size;
        if (inside) continue;
        if (this.map.inBounds(x, y) && !this.map.isBlocked(x, y)) return true;
      }
    }
    return false;
  }

  /**
   * Rase un bâtiment sur ordre de son propriétaire : les occupants sortent
   * vivants, et ce qui était payé d'avance est rendu — la file, une recherche,
   * un passage d'âge en cours. Avant, « Détruire » tuait la garnison et
   * emportait la file sans rien rendre, quand annuler un chantier rend tout.
   * (Détruit par l'ennemi, le bâtiment emporte toujours sa garnison.)
   * @returns {{sortis: number, rembourse: boolean}}
   */
  raserBatiment(building) {
    if (!building || building.dead) return { sortis: 0, rembourse: false };
    const sortis = building.releaseGarrison().length;
    const player = this.players[building.playerIndex];
    let rembourse = building.queue.length > 0;
    while (building.queue.length > 0) this.cancelProduction(building, building.queue.length - 1);
    if (player && player.ageProgress && player.ageProgress.building === building) {
      const cost = AGES[player.age + 1].cost;
      for (const key in cost) player.resources[key] += cost[key];
      player.ageProgress = null;
      rembourse = true;
    }
    this.killEntity(building, null, false);
    return { sortis, rembourse };
  }

  /** Annule un chantier non terminé et rembourse sa mise. */
  cancelConstruction(site) {
    if (!site || site.dead || site.complete) return false;
    const stock = this.players[site.playerIndex].resources;
    for (const key in site.def.cost) stock[key] += site.def.cost[key];
    for (const u of this.units) {
      if (u.target !== site) continue;
      u.target = null;
      u.state = STATE.IDLE;
      if (u.nextQueuedBuild) u.nextQueuedBuild();   // on enchaîne sur la file
    }
    this.killEntity(site, null, true);
    return true;
  }

  placeBuilding(playerIndex, type, tx, ty, builders = []) {
    const def = BUILDING_TYPES[type];
    const player = this.players[playerIndex];
    if (!this.canPlace(playerIndex, type, tx, ty, playerIndex !== this.humanIndex)) {
      if (playerIndex === this.humanIndex) this.pushEvent({ type: 'notice', text: 'Emplacement impossible ici.' });
      return null;
    }
    if (!canAfford(player.resources, def.cost)) {
      if (playerIndex === this.humanIndex) this.pushEvent({ type: 'notice', text: 'Ressources insuffisantes.' });
      return null;
    }
    payCost(player.resources, def.cost);
    const site = this.spawnBuilding(playerIndex, type, tx, ty, false);
    // Poser un bâtiment sur des unités les emprisonnait : la grille se bloque
    // sous leurs pieds et plus aucun pas ne leur est permis. On les pousse dehors.
    // (Ici et pas dans spawnBuilding : la reprise d'une sauvegarde passe par
    // spawnBuilding, et elle doit rejouer l'état tel quel.)
    if (!def.walkable) this.evictUnitsFrom(site);
    player.stats.built++;
    // Pose d'un nouveau bâtiment : les ouvriers déjà sur un chantier
    // l'ajoutent à leur file au lieu d'abandonner ce qu'ils font.
    for (const b of builders) if (b.isVillager) b.buildAt(site, true);
    this.pushEvent({ type: 'placed', building: site, player: playerIndex });
    return site;
  }

  onBuildingCompleted(building) {
    this.recomputePopulation();
    this.map.dirty = true;
    this.pushEvent({ type: 'built', building, player: building.playerIndex });
    // Achevé sous les coups, il reste abîmé : ses bâtisseurs ont fini quand
    // même. Sans cela ils enchaînaient d'eux-mêmes sur la réparation, et les
    // coups reçus pendant le chantier s'effaçaient encore — un peu plus tard.
    if (building.hp < building.maxHp) {
      for (const u of this.units) {
        if (!u.dead && u.state === STATE.BUILD && u.target === building) u.chantierAcheve(building);
      }
    }
  }

  // --- Ordres du joueur -----------------------------------------------------

  /** Ordre contextuel : la cible détermine l'action (déplacer / attaquer / récolter / construire). */
  commandUnits(units, worldX, worldY, options = {}) {
    if (!units || units.length === 0) return null;
    const playerIndex = units[0].playerIndex;
    // Tolérance par défaut généreuse : le moteur doit rester jouable même
    // appelé sans contexte d'affichage (tests, IA). L'interface la remplace par
    // une valeur calculée sur le zoom courant.
    const tolerance = options.tolerance ?? TILE * 0.6;
    // Un ennemi sous le doigt l'emporte sur un allié : quand on a ses troupes
    // en main et qu'on touche une mêlée, l'intention est d'attaquer.
    // Un animal ne se vise qu'en le touchant vraiment : avec la tolérance du
    // doigt, un cerf qui passe transformerait chaque ordre de marche en chasse.
    const sansBeteFrolee = (e) => (e && e.isAnimal && this.hitTest(e, worldX, worldY, 0) < 0 ? null : e);
    const target = sansBeteFrolee(this.enemyAt(worldX, worldY, playerIndex, tolerance))
      || sansBeteFrolee(this.entityAt(worldX, worldY, null, tolerance));
    const res = this.resourceNear(worldX, worldY);

    // Sa propre bête sous le doigt : les villageois l'abattent — elle finit en
    // nourriture au village.
    if (target && target.isAnimal && target.playerIndex === playerIndex && !target.dead) {
      const villagers = units.filter((u) => u.isVillager);
      if (villagers.length) {
        for (const v of villagers) v.attackEntity(target);
        return { kind: 'hunt', target, workers: villagers.length };
      }
    }
    // Un allié blessé sous le doigt, une soigneuse en main : elle va le soigner.
    if (target && target.playerIndex === playerIndex && target.kind === 'unit' && !target.isAnimal
        && !target.dead && target.hp < target.maxHp) {
      const soigneuses = units.filter((u) => u.def.heal && u !== target);
      if (soigneuses.length) {
        for (const s of soigneuses) s.attackEntity(target);
        return { kind: 'heal', target };
      }
    }
    if (target && target.playerIndex !== playerIndex && !target.dead) {
      for (const u of units) {
        if (u.isVillager && target.kind === 'building' && !target.complete) continue;
        // Une soigneuse n'attaque pas : elle suit la troupe jusque-là.
        if (u.def.heal) { u.moveTo(worldX, worldY); continue; }
        u.attackEntity(target);
      }
      return { kind: target.isAnimal ? 'hunt' : 'attack', target, workers: units.filter((u) => u.isVillager).length };
    }
    if (target && target.playerIndex === playerIndex && target.kind === 'building') {
      const villagers = units.filter((u) => u.isVillager);
      if (!target.complete && villagers.length) {
        for (const v of villagers) v.buildAt(target);
        // Les soldats du groupe se rendent sur place : ils couvrent le chantier
        // au lieu de rester plantés là où ils étaient.
        for (const u of units) if (!u.isVillager) u.moveTo(worldX, worldY, options.aggressive);
        return { kind: 'build', target, workers: villagers.length };
      }
      // Bâtiment intact pouvant abriter : on s'y réfugie (règle d'AoE).
      if (target.complete && target.def.garrison && target.hp >= target.maxHp
          && units.some((u) => target.canGarrison(u))) {
        this.garrisonUnits(units, target);
        return { kind: 'garrison', target };
      }
      if (target.type === 'farm' && villagers.length) {
        const spread = this.spreadFarmOrder(villagers, target);
        return { kind: 'gather', target, workers: villagers.length, spread };
      }
      if (target.hp < target.maxHp && villagers.length) {
        for (const v of villagers) v.buildAt(target);
        return { kind: 'repair', target, workers: villagers.length };
      }
    }
    if (res) {
      const villagers = units.filter((u) => u.isVillager);
      if (villagers.length) {
        const spread = this.spreadGatherOrder(villagers, res.tx, res.ty, res.type);
        const others = units.filter((u) => !u.isVillager);
        for (const u of others) u.moveTo(worldX, worldY, options.aggressive);
        return { kind: 'gather', res, workers: villagers.length, spread };
      }
    }
    this.formationMove(units, worldX, worldY, options.aggressive);
    return { kind: 'move' };
  }

  /** Cases exploitables d'un type donné autour d'un point. */
  collectResourceTiles(tx, ty, type, radius) {
    const out = [];
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        const res = this.map.resourceAt(x, y);
        if (res && res.type === type && !res.inaccessible && this.map.hasOpenNeighbour(x, y)) {
          out.push({ tx: x, ty: y });
        }
      }
    }
    return out;
  }

  /**
   * Qui travaille déjà où : nombre de villageois par case de gisement et par
   * ferme. Sert à ne pas entasser tout le monde au même endroit.
   */
  gatherOccupancy(playerIndex, exclude) {
    const tiles = new Map();
    const farms = new Map();
    for (const u of this.units) {
      if (u.dead || u.playerIndex !== playerIndex || !u.isVillager) continue;
      if (exclude && exclude.has(u)) continue;
      if (u.resourceTile) {
        const key = u.resourceTile.tx + ',' + u.resourceTile.ty;
        tiles.set(key, (tiles.get(key) || 0) + 1);
      } else if (u.target && u.target.type === 'farm') {
        farms.set(u.target.id, (farms.get(u.target.id) || 0) + 1);
      }
    }
    return { tiles, farms };
  }

  /**
   * Gisement sous le doigt, avec une case de tolérance : au zoom d'un
   * téléphone, une case fait une vingtaine de pixels à l'écran et viser juste
   * est illusoire. Sans cela, un doigt qui rate l'arbre d'un cheveu donne un
   * ordre de déplacement, et le villageois reste planté à côté.
   */
  resourceNear(worldX, worldY) {
    const tx = Math.floor(worldX / TILE), ty = Math.floor(worldY / TILE);
    const exact = this.map.resourceAt(tx, ty);
    if (exact) return exact;
    let best = null, bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const res = this.map.resourceAt(tx + dx, ty + dy);
        if (!res) continue;
        const d = dist2(worldX, worldY, res.tx * TILE + TILE / 2, res.ty * TILE + TILE / 2);
        if (d < bestD) { bestD = d; best = res; }
      }
    }
    return best;
  }

  /**
   * Répartit un groupe de villageois sur un gisement.
   *
   * Chacun prend la case libre la plus proche de LUI (et non la n-ième case
   * dans l'ordre de la sélection), on élargit la zone tant qu'il n'y a pas
   * assez de cases pour tout le monde, et on ne double une case que lorsqu'il
   * n'y a plus de place ailleurs. Les villageois déjà au travail comptent :
   * un renfort ne vient pas se coller sur un arbre déjà occupé.
   */
  spreadGatherOrder(villagers, tx, ty, type) {
    if (villagers.length === 0) return;
    let tiles = [];
    for (let radius = 3; radius <= 12; radius += 3) {
      tiles = this.collectResourceTiles(tx, ty, type, radius);
      if (tiles.length >= villagers.length) break;
    }
    if (tiles.length === 0) {
      // Rien d'exploitable ici : gatherAt redirige chacun vers le plus proche.
      for (const v of villagers) v.gatherAt(tx, ty);
      return 1;
    }

    const excluded = new Set(villagers);
    const { tiles: occupancy } = this.gatherOccupancy(villagers[0].playerIndex, excluded);
    // Une case déjà prise coûte autant qu'un détour de sept cases : on préfère
    // marcher un peu plus loin plutôt que de se marcher dessus.
    const crowdPenalty = (7 * TILE) ** 2;
    const anchorX = tx * TILE + TILE / 2, anchorY = ty * TILE + TILE / 2;
    const pris = new Set();
    // Les plus proches du point visé choisissent en premier.
    const order = [...villagers].sort(
      (a, b) => dist2(a.x, a.y, anchorX, anchorY) - dist2(b.x, b.y, anchorX, anchorY));

    for (const v of order) {
      let best = null, bestScore = Infinity;
      for (const tile of tiles) {
        const key = tile.tx + ',' + tile.ty;
        const score = dist2(v.x, v.y, tile.tx * TILE + TILE / 2, tile.ty * TILE + TILE / 2)
          + (occupancy.get(key) || 0) * crowdPenalty;
        if (score < bestScore) { bestScore = score; best = tile; }
      }
      const key = best.tx + ',' + best.ty;
      occupancy.set(key, (occupancy.get(key) || 0) + 1);
      pris.add(key);
      v.gatherAt(best.tx, best.ty);
    }
    return pris.size;
  }

  /**
   * Même principe pour les fermes : une ferme nourrit un villageois. Un groupe
   * envoyé sur une ferme se répartit sur celles qui sont libres.
   */
  spreadFarmOrder(villagers, farm) {
    if (villagers.length === 0) return;
    const playerIndex = villagers[0].playerIndex;
    const farms = this.buildings.filter(
      (b) => !b.dead && b.complete && b.type === 'farm'
        && b.playerIndex === playerIndex && b.foodLeft > 0);
    if (farms.length <= 1) {
      for (const v of villagers) v.gatherFarm(farm);
      return 1;
    }
    const excluded = new Set(villagers);
    const { farms: occupancy } = this.gatherOccupancy(playerIndex, excluded);
    const crowdPenalty = (10 * TILE) ** 2;
    const order = [...villagers].sort(
      (a, b) => dist2(a.x, a.y, farm.x, farm.y) - dist2(b.x, b.y, farm.x, farm.y));
    const prises = new Set();
    let first = true;
    for (const v of order) {
      let best = null, bestScore = Infinity;
      for (const candidate of farms) {
        const occ = occupancy.get(candidate.id) || 0;
        // La ferme touchée revient au premier villageois, si elle est libre.
        const bonus = (first && candidate === farm && occ === 0) ? -crowdPenalty : 0;
        const score = dist2(v.x, v.y, candidate.x, candidate.y) + occ * crowdPenalty + bonus;
        if (score < bestScore) { bestScore = score; best = candidate; }
      }
      first = false;
      occupancy.set(best.id, (occupancy.get(best.id) || 0) + 1);
      prises.add(best.id);
      v.gatherFarm(best);
    }
    return prises.size;
  }

  /** Déplacement de groupe : les unités visent des points répartis autour de la cible. */
  formationMove(units, x, y, aggressive) {
    // Une unité à l'abri ne prend pas l'ordre (la sélection peut encore la
    // contenir) : elle n'a ni place dans la formation ni pas du groupe — elle
    // le gardait, et sortait au pas du bélier.
    units = units.filter((u) => !u.garrisonedIn);
    if (units.length === 1) { units[0].groupSpeed = 0; units[0].moveTo(x, y, aggressive); return; }
    // Le groupe avance au rythme du plus lent : l'armée arrive ensemble.
    let slowest = Infinity;
    for (const u of units) {
      const own = u.def.speed * TILE * (u.isVillager ? u.player.mods.villagerSpeed : 1);
      if (own < slowest) slowest = own;
    }
    const spacing = TILE * 1.15;
    const cols = Math.ceil(Math.sqrt(units.length));
    const sorted = [...units].sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
    sorted.forEach((u, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = (row - (Math.ceil(units.length / cols) - 1) / 2) * spacing;
      const px = clamp(x + ox, TILE, this.map.pixelWidth - TILE);
      const py = clamp(y + oy, TILE, this.map.pixelHeight - TILE);
      u.moveTo(px, py, aggressive);
      u.groupSpeed = slowest;
    });
  }

  /** Envoie des unités s'abriter dans un bâtiment. */
  garrisonUnits(units, building) {
    let sent = 0;
    for (const u of units) {
      if (u.kind !== 'unit' || u.garrisonedIn) continue;
      if (!building.canGarrison(u)) continue;
      if (u.garrisonAt(building)) sent++;
    }
    if (sent === 0 && building.playerIndex === this.humanIndex) {
      const g = building.def.garrison;
      this.pushEvent({
        type: 'notice',
        text: !g ? 'Ce bâtiment n’abrite personne.'
          : building.garrison.length >= g.capacity ? 'Bâtiment plein.'
            : 'Ces unités ne peuvent pas s’y abriter.',
      });
    }
    return sent;
  }

  releaseGarrison(building) {
    const released = building.releaseGarrison();
    if (released.length && building.playerIndex === this.humanIndex) {
      this.pushEvent({ type: 'notice', text: `${released.length} unité(s) sortie(s)` });
    }
    // « Libérer » lève l'alerte aussi bien que la cloche : plus aucun villageois
    // à l'abri ni en route sur son appel, ceux qui s'étaient arrêtés devant un
    // abri injoignable reprennent leur poste. Laissés là, leur poste noté
    // faisait de l'alerte suivante un « retour au travail », personne à l'abri.
    const appeles = this.units.filter((u) => !u.dead && u.playerIndex === building.playerIndex && u.posteAvantAbri);
    if (!appeles.some((u) => u.garrisonedIn || u.state === STATE.GARRISON)) {
      for (const u of appeles) {
        if (u.state === STATE.IDLE) u.reprendrePoste();
        else u.posteAvantAbri = null;
      }
    }
    return released;
  }

  /** Les abris d'un joueur : ses bâtiments achevés qui accueillent une garnison. */
  abrisDe(playerIndex) {
    return this.buildings.filter(
      (b) => !b.dead && b.complete && b.playerIndex === playerIndex && b.def.garrison);
  }

  /**
   * Cloche du village : les villageois restés dehors courent s'abriter. Quand
   * plus aucun ne peut l'être, le coup suivant renvoie au travail ceux qu'elle
   * a appelés — ils reprennent leur poste, pas n'importe lequel.
   * Elle ne regarde que les villageois, et ne fait sortir que ceux qu'elle a
   * abrités : ni les soldats, ni un villageois mis à l'abri à la main.
   * @returns {{sheltered: number, released: number, sansPlace: number, abris: number}}
   *   `sansPlace` : les villageois laissés dehors, abris pleins.
   */
  ringTownBell(playerIndex) {
    const shelters = this.abrisDe(playerIndex);
    const bilan = { sheltered: 0, released: 0, sansPlace: 0, abris: shelters.length };
    if (shelters.length === 0) return bilan;

    // Ceux que la cloche a appelés portent le poste qu'ils ont quitté : à
    // l'abri, encore en route, ou arrêtés devant un abri injoignable.
    // (Avant, des soldats abrités suffisaient à faire un second coup : la
    // cloche les sortait, sans abriter personne.)
    const villagers = this.units.filter((u) => !u.dead && u.playerIndex === playerIndex && u.isVillager);
    const appeles = [];
    for (const u of villagers) {
      if (!u.posteAvantAbri) continue;
      if (u.garrisonedIn || u.state === STATE.GARRISON || u.state === STATE.IDLE) appeles.push(u);
      // Occupé à autre chose (une riposte, un poste périmé dans une ancienne
      // sauvegarde) : la cloche ne le concerne plus.
      else u.posteAvantAbri = null;
    }
    // Tant qu'un villageois dehors peut être abrité, la cloche abrite : formé
    // pendant l'alerte ou envoyé ailleurs entre-temps, il ne fait pas sortir
    // tout le village sous l'attaque. Abris pleins, il ne bloque pas le
    // retour au travail des autres.
    const dehors = villagers.filter((u) => !u.garrisonedIn && u.state !== STATE.GARRISON && !u.posteAvantAbri);
    const partis = this.envoyerAuxAbris(playerIndex, dehors);
    if (partis > 0 || appeles.length === 0) {
      bilan.sheltered = partis;
      bilan.sansPlace = dehors.length - partis;
      return bilan;
    }
    for (const u of appeles) {
      const abri = u.garrisonedIn;
      if (abri) {
        // En sortant, chacun reprend le poste qu'il a quitté (voir leaveGarrison).
        const k = abri.garrison.indexOf(u);
        if (k >= 0) abri.garrison.splice(k, 1);
        u.leaveGarrison();
      } else {
        u.target = null; u.path = null; u.state = STATE.IDLE;
        u.reprendrePoste();
      }
    }
    bilan.released = appeles.length;
    return bilan;
  }

  /**
   * Envoie chacun de ces villageois au plus proche abri qui a encore une
   * place, le poste qu'il quitte noté pour le retour.
   * @returns {number} ceux qui sont partis ; les autres n'ont pas de place.
   */
  envoyerAuxAbris(playerIndex, villageois) {
    const shelters = this.abrisDe(playerIndex);
    // Les places de chaque abri, celles déjà promises à qui y court déduites :
    // sans ce compte, sept villageois partaient vers une tour de cinq places
    // et deux restaient plantés devant, le Centre-Ville vide à neuf cases.
    const places = new Map(shelters.map((b) => [b, b.def.garrison.capacity - b.garrison.length]));
    for (const u of this.units) {
      if (!u.dead && u.state === STATE.GARRISON && places.has(u.target)) places.set(u.target, places.get(u.target) - 1);
    }
    // Chacun va au plus proche abri qui a encore une place : les trajets les
    // plus courts sont servis d'abord.
    const trajets = [];
    for (const v of villageois) {
      for (const b of shelters) if (b.canGarrison(v)) trajets.push({ v, b, d: dist2(v.x, v.y, b.x, b.y) });
    }
    trajets.sort((p, q) => p.d - q.d);
    const partis = new Set();
    for (const { v, b } of trajets) {
      if (partis.has(v) || places.get(b) <= 0) continue;
      // Rappelé en route vers un abri tombé, il garde le poste du premier appel.
      const poste = v.posteAvantAbri || v.posteCourant();
      if (!v.garrisonAt(b)) continue;
      v.posteAvantAbri = poste;
      places.set(b, places.get(b) - 1);
      partis.add(v);
    }
    return partis.size;
  }

  setStance(units, stanceId) {
    for (const u of units) if (u.kind === 'unit') u.setStance(stanceId);
  }

  setRally(building, x, y) {
    building.rally = { x, y };
    building.rallyEntity = this.entityAt(x, y, building.playerIndex);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const res = this.map.resourceAt(tx, ty);
    building.rallyResource = res ? { tx, ty } : null;
  }

  // --- Brouillard de guerre -------------------------------------------------

  updateFog(initial = false) {
    const fog = this.fog;
    fog.visible.fill(0);
    const { w, h } = this.map;
    for (const e of this.entities) {
      if (e.dead || e.garrisonedIn || e.playerIndex !== this.humanIndex) continue;
      // Une fondation ne voit que ses abords : posée au loin puis annulée
      // (tout est rendu), elle explorait la carte sans rien coûter.
      const vue = e.kind === 'building' && !e.complete ? 1 : (e.def.los || 4);
      const radius = Math.round(vue + (e.kind === 'building' ? e.size / 2 : 0));
      const cx = Math.floor(e.x / TILE), cy = Math.floor(e.y / TILE);
      const r2 = radius * radius;
      for (let y = cy - radius; y <= cy + radius; y++) {
        if (y < 0 || y >= h) continue;
        const row = y * w;
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || x >= w) continue;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy > r2) continue;
          fog.visible[row + x] = 1;
          fog.explored[row + x] = 1;
        }
      }
    }
    fog.dirty = true;
    if (initial) fog.dirty = true;
  }

  isVisible(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.map.inBounds(tx, ty)) return false;
    return this.fog.visible[ty * this.map.w + tx] === 1;
  }

  isExplored(tx, ty) {
    if (!this.map.inBounds(tx, ty)) return false;
    return this.fog.explored[ty * this.map.w + tx] === 1;
  }

  // --- Fin de partie --------------------------------------------------------

  checkVictory() {
    // En Express, le dernier Centre-Ville tombé suffit : une partie courte se
    // joue sur un objectif clair, pas sur la chasse au dernier villageois.
    const parCentreVille = this.mode.victory === 'towncenter';
    for (const p of this.players) {
      if (p.defeated) continue;
      if (parCentreVille) {
        // Un Centre-Ville debout, pas des fondations : sans quoi un chantier
        // posé à la hâte sauverait la partie du camp qui vient de tomber.
        const hasTC = this.buildings.some(
          (b) => !b.dead && b.complete && b.playerIndex === p.index && b.type === 'towncenter');
        if (!hasTC) p.defeated = true;
        continue;
      }
      const hasBuildings = this.buildings.some((b) => !b.dead && b.playerIndex === p.index);
      const hasVillagers = this.units.some((u) => !u.dead && u.playerIndex === p.index && u.isVillager);
      if (!hasBuildings && !hasVillagers) p.defeated = true;
    }
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length <= 1 && !this.gameOver) {
      const winner = alive[0] || null;
      this.gameOver = {
        winner: winner ? winner.index : -1,
        victory: winner ? winner.index === this.humanIndex : false,
        time: this.time,
      };
      this.pushEvent({ type: 'gameOver', result: this.gameOver });
    }
  }

  /**
   * Score d'un joueur à la fin d'une partie limitée dans le temps : ce qu'il a
   * récolté, plus ce qui est encore debout. Lisible d'un coup d'œil, et
   * impossible à gonfler en se cachant.
   */
  score(player) {
    const g = player.stats.gathered;
    const unites = this.units.filter((u) => !u.dead && !u.isAnimal && u.playerIndex === player.index).length;
    const batiments = this.buildings.filter(
      (b) => !b.dead && b.complete && b.playerIndex === player.index).length;
    return Math.round(g.food + g.wood + g.gold + unites * 10 + batiments * 25);
  }

  /** Fin au temps imparti (mode Express) : le meilleur score l'emporte. */
  checkTimeLimit() {
    const limite = this.mode.timeLimit || 0;
    if (!limite || this.gameOver || this.time < limite) return;
    const scores = this.players.map((p) => this.score(p));
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const egalite = scores.filter((s) => s === scores[best]).length > 1;
    this.gameOver = {
      winner: egalite ? -1 : best,
      victory: !egalite && best === this.humanIndex,
      time: this.time,
      timeUp: true,
      scores,
    };
    this.pushEvent({ type: 'gameOver', result: this.gameOver });
  }

  resign() {
    if (this.gameOver) return;
    this.players[this.humanIndex].defeated = true;
    this.gameOver = { winner: 1, victory: false, time: this.time, resigned: true };
    this.pushEvent({ type: 'gameOver', result: this.gameOver });
  }

  pushEvent(event) {
    this.events.push(event);
    if (this.events.length > 200) this.events.shift();
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
