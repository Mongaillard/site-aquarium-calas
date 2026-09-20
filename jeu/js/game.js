// ---------------------------------------------------------------------------
// Le monde : état de la partie, ordres, économie, combat, brouillard, victoire.
// Ce module est volontairement « sans navigateur » : il tourne aussi en Node,
// ce qui permet de tester la simulation sans rendu (voir test/simulation.test.js).
// ---------------------------------------------------------------------------

import {
  TILE, POP_MAX, AGES, UNIT_TYPES, BUILDING_TYPES, TECHS,
  START_RESOURCES, MAP_SIZES, DIFFICULTIES, PLAYER_COLORS,
} from './config.js';
import { GameMap } from './map.js';
import { PathFinder } from './pathfinding.js';
import { Unit, Building, Projectile, STATE, computeDamage, resetEntityIds } from './entities.js';
import { SpatialGrid, RNG, dist, dist2, canAfford, payCost, clamp } from './utils.js';
import { AIPlayer } from './ai.js';

const PATHS_PER_TICK = 10;
const FOG_INTERVAL = 0.25;

function makePlayer(index, name, isAI) {
  return {
    index, name, isAI,
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
    resetEntityIds();
    const mapSize = MAP_SIZES[options.mapSize || 'medium'];
    this.seed = options.seed || Math.floor(Math.random() * 1e9);
    this.rng = new RNG(this.seed);
    this.map = new GameMap(mapSize.tiles, this.seed);
    this.pathfinder = new PathFinder(this.map);
    this.difficulty = DIFFICULTIES[options.difficulty || 'normal'];
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

    this.players = [
      makePlayer(0, options.playerName || 'Vous', false),
      makePlayer(1, 'Adversaire', true),
    ];
    this.players[1].mods.gatherRate = this.difficulty.gatherBonus;

    this.fog = this.createFog();
    this.ais = [];

    this.setupStartingPositions();
    this.updateFog(true);
  }

  // --- Mise en place --------------------------------------------------------

  createFog() {
    const n = this.map.w * this.map.h;
    return { explored: new Uint8Array(n), visible: new Uint8Array(n), dirty: true };
  }

  setupStartingPositions() {
    this.map.startPositions.forEach((start, index) => {
      const tc = this.spawnBuilding(index, 'towncenter', start.tx - 1, start.ty - 1, true);
      const spawn = tc.spawnPoint();
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4 + 0.6;
        this.spawnUnit(index, 'villager',
          spawn.x + Math.cos(angle) * TILE * 1.6,
          spawn.y + Math.sin(angle) * TILE * 1.6);
      }
      this.spawnUnit(index, 'scout', spawn.x + TILE * 2.5, spawn.y + TILE * 1.2);
    });
    this.ais.push(new AIPlayer(this, 1, this.difficulty));
    this.recomputePopulation();
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

  spawnBuilding(playerIndex, type, tx, ty, complete = false) {
    const size = BUILDING_TYPES[type].size;
    tx = clamp(tx, 0, this.map.w - size);
    ty = clamp(ty, 0, this.map.h - size);
    const b = new Building(this, playerIndex, type, tx, ty, complete);
    this.entities.push(b);
    this.buildings.push(b);
    this.byId.set(b.id, b);
    if (complete) this.recomputePopulation();
    this.map.dirty = true;
    return b;
  }

  // --- Boucle de simulation -------------------------------------------------

  update(dt) {
    if (this.gameOver) return;
    this.time += dt;
    if (this.popWarnCooldown > 0) this.popWarnCooldown -= dt;

    this.rebuildGrid();
    this.processPathQueue();

    // Relevé des bâtisseurs du tick précédent : sert au rendement décroissant.
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.complete) continue;
      b.builderCount = b.activeBuilders;
      b.activeBuilders = 0;
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
  }

  rebuildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.dead && !e.garrisonedIn) this.grid.insert(e);
    }
  }

  // --- Chemins (budget par tick pour éviter les à-coups) ---------------------

  requestPath(unit, x, y, adjacent = false) {
    unit.pathPending = true;
    unit.pathRequest = { x, y, adjacent, seq: (unit.pathSeq = (unit.pathSeq || 0) + 1) };
    this.pathQueue.push(unit);
  }

  processPathQueue() {
    let processed = 0;
    while (this.pathQueue.length > 0 && processed < PATHS_PER_TICK) {
      const unit = this.pathQueue.shift();
      const req = unit.pathRequest;
      if (!unit || unit.dead || !req) continue;
      processed++;
      const sx = Math.floor(unit.x / TILE);
      const sy = Math.floor(unit.y / TILE);
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
      let path = this.pathfinder.find(sx, sy, gx, gy, { adjacent });
      if (!path && !adjacent) {
        const free = this.map.findFreeTile(gx, gy, 6);
        if (free) path = this.pathfinder.find(sx, sy, free.tx, free.ty, {});
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
      if (other.dead || other.playerIndex === entity.playerIndex) return;
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

  entitiesOfPlayer(playerIndex, filter) {
    return this.entities.filter((e) => !e.dead && e.playerIndex === playerIndex && (!filter || filter(e)));
  }

  entityAt(x, y, playerIndex = null) {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.dead || e.garrisonedIn) continue;
      if (playerIndex !== null && e.playerIndex !== playerIndex) continue;
      let hit = false, d = 0;
      if (e.kind === 'building') {
        const halfW = (e.size * TILE) / 2, halfH = (e.size * TILE) / 2;
        hit = x >= e.x - halfW && x <= e.x + halfW && y >= e.y - halfH && y <= e.y + halfH;
        d = dist2(x, y, e.x, e.y);
      } else {
        d = dist2(x, y, e.x, e.y);
        const r = e.radius + 8;
        hit = d <= r * r;
      }
      if (hit && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // --- Combat ---------------------------------------------------------------

  performAttack(attacker, target) {
    if (!target || target.dead) return;
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

  onDamaged(entity, source, amount) {
    // Riposte : une unité inoccupée rend les coups, sauf attitude « sans
    // attaque ». Les villageois ne se défendent que contre d'autres villageois
    // (comme dans AoE : face à un soldat, mieux vaut fuir ou se réfugier).
    if (entity.kind === 'unit' && source && !source.dead && !entity.garrisonedIn
        && entity.stance !== 'passive'
        && (entity.state === STATE.IDLE || (entity.state === STATE.MOVE && !entity.destination))) {
      entity.attackEntity(source, true);
    } else if (entity.kind === 'unit' && entity.isVillager && source && !source.dead
        && source.kind === 'unit' && source.isVillager && entity.state === STATE.IDLE) {
      entity.attackEntity(source, true);
    }
    if (entity.playerIndex === this.humanIndex) {
      this.pushEvent({ type: 'underAttack', x: entity.x, y: entity.y, entity });
    }
  }

  killEntity(entity, source, silent = false) {
    if (entity.dead) return;
    entity.dead = true;
    entity.selected = false;
    this.byId.delete(entity.id);
    const owner = this.players[entity.playerIndex];

    if (entity.kind === 'unit') {
      const i = this.units.indexOf(entity);
      if (i >= 0) this.units.splice(i, 1);
      owner.stats.lost++;
      if (source && this.players[source.playerIndex]) this.players[source.playerIndex].stats.killed++;
      this.effects.push({ kind: 'death', x: entity.x, y: entity.y, life: 1.2, max: 1.2, color: owner.color.main });
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
      entity.releaseTiles();
      this.map.dirty = true;
      if (!silent) {
        this.effects.push({ kind: 'rubble', x: entity.x, y: entity.y, life: 12, max: 12, size: entity.size });
      }
      // Une ferme épuisée n'est replantée d'office que si l'automatisme est actif.
      if (silent && entity.type === 'farm') {
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
    for (const u of this.units) if (!u.dead) this.players[u.playerIndex].pop++;
    for (const b of this.buildings) {
      if (b.dead || !b.complete || !b.def.popBonus) continue;
      this.players[b.playerIndex].popCap += b.def.popBonus;
    }
    for (const p of this.players) p.popCap = Math.min(POP_MAX, p.popCap);
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
    if (building.queue.some((q) => q.id === techId)) return { ok: false, reason: 'Déjà en cours' };
    if (tech.age > player.age) return { ok: false, reason: 'Âge requis : ' + AGES[tech.age].name };
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
        if (rallyEntity && rallyEntity.playerIndex === building.playerIndex && unit.isVillager) {
          // Point de ralliement sur une ressource : le villageois s'y met direct.
          if (rallyEntity.type === 'farm') unit.gatherFarm(rallyEntity);
        } else if (building.rallyResource && unit.isVillager) {
          const r = building.rallyResource;
          if (this.map.resourceAt(r.tx, r.ty)) unit.gatherAt(r.tx, r.ty);
          else unit.moveTo(building.rally.x, building.rally.y);
        } else {
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
        if (!ignoreFog && playerIndex === this.humanIndex && !this.fog.explored[i]) return false;
      }
    }
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

  /** Annule un chantier non terminé et rembourse sa mise. */
  cancelConstruction(site) {
    if (!site || site.dead || site.complete) return false;
    const stock = this.players[site.playerIndex].resources;
    for (const key in site.def.cost) stock[key] += site.def.cost[key];
    for (const u of this.units) {
      if (u.target === site) { u.target = null; u.state = STATE.IDLE; }
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
    player.stats.built++;
    for (const b of builders) if (b.isVillager) b.buildAt(site);
    this.pushEvent({ type: 'placed', building: site, player: playerIndex });
    return site;
  }

  onBuildingCompleted(building) {
    this.recomputePopulation();
    this.map.dirty = true;
    this.pushEvent({ type: 'built', building, player: building.playerIndex });
  }

  // --- Ordres du joueur -----------------------------------------------------

  /** Ordre contextuel : la cible détermine l'action (déplacer / attaquer / récolter / construire). */
  commandUnits(units, worldX, worldY, options = {}) {
    if (!units || units.length === 0) return null;
    const playerIndex = units[0].playerIndex;
    const target = this.entityAt(worldX, worldY);
    const res = this.resourceNear(worldX, worldY);

    if (target && target.playerIndex !== playerIndex && !target.dead) {
      for (const u of units) {
        if (u.isVillager && target.kind === 'building' && !target.complete) continue;
        u.attackEntity(target);
      }
      return { kind: 'attack', target };
    }
    if (target && target.playerIndex === playerIndex && target.kind === 'building') {
      const villagers = units.filter((u) => u.isVillager);
      if (!target.complete && villagers.length) {
        for (const v of villagers) v.buildAt(target);
        return { kind: 'build', target };
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
        return { kind: 'repair', target };
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
    return released;
  }

  /**
   * Cloche du village : tous les villageois courent s'abriter. Un second coup
   * les renvoie au travail — ils reprennent leur poste, pas n'importe lequel.
   */
  ringTownBell(playerIndex) {
    const shelters = this.buildings.filter(
      (b) => !b.dead && b.complete && b.playerIndex === playerIndex && b.def.garrison);
    if (shelters.length === 0) return { sheltered: 0, released: 0 };

    const occupied = shelters.reduce((sum, b) => sum + b.garrison.length, 0);
    if (occupied > 0) {
      let released = 0;
      for (const b of shelters) released += this.releaseGarrison(b).length;
      return { sheltered: 0, released };
    }

    let sheltered = 0;
    const villagers = this.units.filter(
      (u) => !u.dead && u.playerIndex === playerIndex && u.isVillager && !u.garrisonedIn);
    for (const v of villagers) {
      let best = null, bestD = Infinity;
      for (const b of shelters) {
        if (!b.canGarrison(v)) continue;
        const d = dist2(v.x, v.y, b.x, b.y);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) break;
      if (v.garrisonAt(best)) sheltered++;
    }
    return { sheltered, released: 0 };
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
      const radius = Math.round((e.def.los || 4) + (e.kind === 'building' ? e.size / 2 : 0));
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
    for (const p of this.players) {
      if (p.defeated) continue;
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
