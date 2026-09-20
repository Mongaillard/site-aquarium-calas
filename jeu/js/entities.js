// ---------------------------------------------------------------------------
// Entités : unités (avec leur machine à états), bâtiments et projectiles.
// Aucune dépendance au rendu : ce module doit pouvoir tourner sans navigateur.
// ---------------------------------------------------------------------------

import { TILE, UNIT_TYPES, BUILDING_TYPES } from './config.js';
import { dist, dist2, clamp } from './utils.js';
import { BLOCK } from './map.js';

export const STATE = {
  IDLE: 'idle',
  MOVE: 'move',
  ATTACK_MOVE: 'attackMove',
  ATTACK: 'attack',
  GATHER: 'gather',
  RETURN: 'return',
  BUILD: 'build',
};

/** Au bout de ce nombre de secondes sans progrès, une cible est déclarée inatteignable. */
const UNREACHABLE_AFTER = 7;

let nextId = 1;
export function resetEntityIds() { nextId = 1; }

/**
 * Métier courant d'un villageois : 'food' | 'wood' | 'gold' | 'build'
 * | 'move' (en route sur ordre) | 'idle'. Sert à l'affichage comme à l'IA.
 */
export function villagerTask(unit) {
  if (!unit || !unit.isVillager) return null;
  // L'état prime : un villageois à l'arrêt peut conserver la mémoire de son
  // ancien gisement, et le compter comme actif le rendrait invisible.
  if (unit.state === STATE.IDLE) return 'idle';
  if (unit.state === STATE.BUILD) return 'build';
  if (unit.resourceTile) {
    const res = unit.world.map.resourceAt(unit.resourceTile.tx, unit.resourceTile.ty);
    if (res) return res.type;
  }
  if (unit.target && unit.target.type === 'farm') return 'food';
  if ((unit.state === STATE.GATHER || unit.state === STATE.RETURN) && unit.carry.type) return unit.carry.type;
  if (unit.state === STATE.IDLE) return 'idle';
  return 'move';
}

/** Dégâts infligés par `attackerDef` (appartenant à `player`) à `target`. */
export function computeDamage(attackerDef, player, target) {
  const type = attackerDef.attackType || 'melee';
  const mods = player.mods;
  let atk = (attackerDef.attack || 0) + (type === 'melee' ? mods.attackMelee : mods.attackPierce);
  if (attackerDef.bonus) {
    const cls = target.combatClass;
    if (attackerDef.bonus[cls]) atk += attackerDef.bonus[cls];
  }
  const armor = type === 'melee' ? target.meleeArmor() : target.pierceArmor();
  return Math.max(1, atk - armor);
}

class Entity {
  constructor(world, playerIndex, def, x, y) {
    this.id = nextId++;
    this.world = world;
    this.playerIndex = playerIndex;
    this.def = def;
    this.type = def.id;
    this.x = x;
    this.y = y;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.dead = false;
    this.selected = false;
    this.lastHitAt = -999;
  }
  get player() { return this.world.players[this.playerIndex]; }
  meleeArmor() { return (this.def.meleeArmor || 0) + this.player.mods.meleeArmor; }
  pierceArmor() { return (this.def.pierceArmor || 0) + this.player.mods.pierceArmor; }
  get combatClass() { return this.kind === 'building' ? 'building' : this.def.class; }
  distanceTo(other) { return dist(this.x, this.y, other.x, other.y); }

  /**
   * Distance d'un point au bord de l'entité (0 si le point est dedans).
   * Mesurer jusqu'au centre d'un bâtiment 3x3 rendrait toute action impossible.
   */
  edgeDistanceTo(x, y) {
    if (this.kind === 'building') {
      const half = (this.size * TILE) / 2;
      const dx = Math.max(Math.abs(x - this.x) - half, 0);
      const dy = Math.max(Math.abs(y - this.y) - half, 0);
      return Math.hypot(dx, dy);
    }
    return Math.max(0, dist(this.x, this.y, x, y) - this.radius);
  }

  takeDamage(amount, source) {
    if (this.dead) return;
    this.hp -= amount;
    this.lastHitAt = this.world.time;
    this.world.onDamaged(this, source, amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.world.killEntity(this, source);
    }
  }
}

// ===========================================================================
// UNITÉS
// ===========================================================================

export class Unit extends Entity {
  constructor(world, playerIndex, type, x, y) {
    super(world, playerIndex, UNIT_TYPES[type], x, y);
    this.kind = 'unit';
    this.radius = this.def.radius;
    this.state = STATE.IDLE;
    this.path = null;
    this.pathIndex = 0;
    this.destination = null;      // {x, y} final
    this.target = null;           // entité visée (combat, construction, ferme)
    this.resourceTile = null;     // {tx, ty} en cours de récolte
    this.carry = { type: null, amount: 0 };
    this.attackCooldown = 0;
    // Toute l'aléa de simulation passe par le générateur du monde : une même
    // graine rejoue exactement la même partie (tests reproductibles).
    this.facing = world.rng.next() * Math.PI * 2;
    this.stuckTime = 0;
    this.repathCooldown = 0;
    this.scanCooldown = world.rng.next() * 0.5;
    this.aggressive = type !== 'villager';
    this.gatherAnim = 0;
    this.pathPending = false;
    this.pendingJob = null; // poste à prendre après la livraison en cours
    this.blockedTime = 0;   // temps passé sans pouvoir atteindre sa cible
    this.fleeUntil = 0;     // mise à l'abri en cours (piloté par l'IA)
    this.spawnTime = world.time;
  }

  get isVillager() { return this.type === 'villager'; }

  speedPx() {
    const mult = this.isVillager ? this.player.mods.villagerSpeed : 1;
    return this.def.speed * TILE * mult;
  }

  rangePx() {
    let r = this.def.range;
    if (this.def.attackType === 'pierce' && this.def.projectile) r += this.player.mods.range;
    return r * TILE;
  }

  carryCapacity() {
    return this.def.carry + (this.isVillager ? this.player.mods.villagerCarry : 0);
  }

  // --- Ordres --------------------------------------------------------------

  stop() {
    this.state = STATE.IDLE;
    this.path = null;
    this.target = null;
    this.destination = null;
    this.resourceTile = null;
    this.pendingJob = null;
  }

  /**
   * Nouveau métier alors que les bras sont pleins d'une autre ressource :
   * on passe d'abord par l'entrepôt, puis on prend le poste demandé.
   * Le travail déjà fourni n'est jamais jeté.
   * @returns {boolean} true si l'ordre a été différé le temps de la livraison.
   */
  deliverBeforeJob(job) {
    if (this.carry.amount < 3 || this.carry.type === job.resType) return false;
    const drop = this.world.findNearestDropoff(this, this.carry.type);
    if (!drop) return false;
    this.pendingJob = job;
    this.resourceTile = null;
    this.target = null;
    this.returnTo = drop;
    this.state = STATE.RETURN;
    this.requestPathToEntity(drop);
    return true;
  }

  moveTo(x, y, aggressive = false) {
    this.target = null;
    this.resourceTile = null;
    this.destination = { x, y };
    this.state = aggressive ? STATE.ATTACK_MOVE : STATE.MOVE;
    this.requestPathTo(x, y);
  }

  attackEntity(target) {
    if (!target || target.dead) return;
    this.target = target;
    this.resourceTile = null;
    this.destination = null;
    this.state = STATE.ATTACK;
    this.requestPathTo(target.x, target.y, true);
  }

  gatherAt(tx, ty) {
    const res = this.world.map.resourceAt(tx, ty);
    if (!res || !this.isVillager) return;
    if (this.deliverBeforeJob({ kind: 'tile', tx, ty, resType: res.type })) return;
    if (this.carry.type && this.carry.type !== res.type) this.carry = { type: null, amount: 0 };
    this.pendingJob = null;
    this.resourceTile = { tx, ty };
    this.target = null;
    this.state = STATE.GATHER;
    this.requestPathToTile(tx, ty, true);
  }

  gatherFarm(farm) {
    if (!this.isVillager || !farm || farm.dead) return;
    if (this.deliverBeforeJob({ kind: 'farm', farm, resType: 'food' })) return;
    if (this.carry.type && this.carry.type !== 'food') this.carry = { type: null, amount: 0 };
    this.pendingJob = null;
    this.target = farm;
    this.resourceTile = null;
    this.state = STATE.GATHER;
    this.requestPathToEntity(farm);
  }

  buildAt(building) {
    if (!this.isVillager || !building || building.dead) return;
    this.target = building;
    this.resourceTile = null;
    this.state = STATE.BUILD;
    this.requestPathToEntity(building);
  }

  requestPathTo(x, y, adjacent = false) {
    this.world.requestPath(this, x, y, adjacent);
  }

  /** Variante « case » : convertit en coordonnées monde avant la requête. */
  requestPathToTile(tx, ty, adjacent = false) {
    this.world.requestPath(this, tx * TILE + TILE / 2, ty * TILE + TILE / 2, adjacent);
  }

  /** Chemin vers une entité : un bâtiment se rejoint par une case de son pourtour. */
  requestPathToEntity(entity, adjacent = true) {
    if (entity.kind === 'building') {
      const tile = entity.accessTile(this.x, this.y);
      if (tile) { this.requestPathToTile(tile.tx, tile.ty, false); return; }
    }
    this.requestPathTo(entity.x, entity.y, adjacent);
  }

  setPath(path) {
    this.path = path;
    this.pathIndex = 0;
    this.pathPending = false;
    this.stuckTime = 0;
  }

  // --- Mise à jour ---------------------------------------------------------

  update(dt) {
    if (this.dead) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.repathCooldown > 0) this.repathCooldown -= dt;
    if (this.gatherAnim > 0) this.gatherAnim -= dt;

    // Désempilement : les unités à l'arrêt ou au corps à corps se repoussent
    // doucement, sinon une escouade finit dessinée sur un seul pixel.
    if (this.state === STATE.IDLE || this.state === STATE.ATTACK) {
      const sep = this.world.separationForce(this);
      if (sep.x !== 0 || sep.y !== 0) this.tryMove(sep.x * 14 * dt, sep.y * 14 * dt);
    }

    switch (this.state) {
      case STATE.IDLE: this.updateIdle(dt); break;
      case STATE.MOVE: this.updateMove(dt, false); break;
      case STATE.ATTACK_MOVE: this.updateMove(dt, true); break;
      case STATE.ATTACK: this.updateAttack(dt); break;
      case STATE.GATHER: this.updateGather(dt); break;
      case STATE.RETURN: this.updateReturn(dt); break;
      case STATE.BUILD: this.updateBuild(dt); break;
    }
  }

  updateIdle(dt) {
    if (!this.aggressive) return;
    this.scanCooldown -= dt;
    if (this.scanCooldown > 0) return;
    this.scanCooldown = 0.5;
    const enemy = this.world.findEnemyNear(this, this.def.los * TILE);
    if (enemy) {
      const home = { x: this.x, y: this.y };
      this.attackEntity(enemy);
      this.guardPoint = home; // on revient sur place après le combat
    }
  }

  updateMove(dt, aggressive) {
    if (aggressive) {
      this.scanCooldown -= dt;
      if (this.scanCooldown <= 0) {
        this.scanCooldown = 0.4;
        const enemy = this.world.findEnemyNear(this, this.def.los * TILE);
        if (enemy) {
          const dest = this.destination;
          this.attackEntity(enemy);
          this.rallyAfterFight = dest;
          return;
        }
      }
    }
    if (this.followPath(dt)) {
      this.state = STATE.IDLE;
      this.destination = null;
    }
  }

  updateAttack(dt) {
    const target = this.target;
    if (!target || target.dead) {
      this.target = null;
      const rally = this.rallyAfterFight;
      this.rallyAfterFight = null;
      if (rally) { this.moveTo(rally.x, rally.y, true); return; }
      // Pas d'ordre en attente : on cherche un autre ennemi tout proche.
      const next = this.world.findEnemyNear(this, this.def.los * TILE * 0.8);
      if (next) { this.attackEntity(next); return; }
      const guard = this.guardPoint;
      this.guardPoint = null;
      if (guard && dist(this.x, this.y, guard.x, guard.y) > TILE * 3) {
        this.moveTo(guard.x, guard.y, false);
      } else {
        this.state = STATE.IDLE;
      }
      return;
    }

    const reach = this.rangePx();
    const d = target.edgeDistanceTo(this.x, this.y);
    if (d <= reach) {
      this.path = null;
      this.faceTowards(target.x, target.y);
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.def.attackSpeed;
        this.world.performAttack(this, target);
      }
      return;
    }
    // Cible hors de portée : on la poursuit (recalcul périodique si elle bouge).
    if (!this.path || this.path.length === 0 || this.pathIndex >= this.path.length) {
      if (this.repathCooldown <= 0) {
        this.repathCooldown = 0.6;
        this.requestPathToEntity(target);
      }
    } else if (target.kind === 'unit' && this.repathCooldown <= 0) {
      const last = this.path[this.path.length - 1];
      if (dist2(last.tx * TILE + TILE / 2, last.ty * TILE + TILE / 2, target.x, target.y) > (TILE * 2.5) ** 2) {
        this.repathCooldown = 0.7;
        this.requestPathTo(target.x, target.y, true);
      }
    }
    this.followPath(dt);
  }

  updateGather(dt) {
    // Récolte sur une ferme (bâtiment) ou sur une case de ressource.
    const farm = this.target && this.target.type === 'farm' ? this.target : null;
    if (farm && farm.dead) { this.findNextResource('food'); return; }

    let targetX, targetY, resType, reach;
    if (farm) {
      targetX = farm.x; targetY = farm.y; resType = 'food';
      reach = -1; // les fermes se travaillent depuis leur pourtour (voir plus bas)
    } else {
      const tile = this.resourceTile;
      if (!tile) { this.state = STATE.IDLE; return; }
      const res = this.world.map.resourceAt(tile.tx, tile.ty);
      if (!res) { this.findNextResource(this.carry.type); return; }
      targetX = tile.tx * TILE + TILE / 2;
      targetY = tile.ty * TILE + TILE / 2;
      resType = res.type;
      reach = TILE * 1.7; // case voisine, diagonale comprise
    }

    const d = farm ? farm.edgeDistanceTo(this.x, this.y) : dist(this.x, this.y, targetX, targetY);
    const limit = farm ? TILE * 1.1 : reach;
    if (d > limit) {
      if (this.followPath(dt)) {
        // Chemin terminé mais cible toujours hors de portée : elle est
        // probablement enclavée (buisson cerné d'arbres). On insiste un peu,
        // puis on l'abandonne définitivement pour ne pas bloquer l'économie.
        this.blockedTime += dt;
        if (this.blockedTime > UNREACHABLE_AFTER) {
          this.blockedTime = 0;
          if (farm) farm.gatherUnreachable = true;
          else {
            const res = this.world.map.resourceAt(this.resourceTile.tx, this.resourceTile.ty);
            if (res) res.inaccessible = true;
          }
          this.findNextResource(resType);
          return;
        }
        if (this.repathCooldown <= 0) {
          this.repathCooldown = 1.0;
          if (farm) this.requestPathToEntity(farm);
          else this.requestPathToTile(this.resourceTile.tx, this.resourceTile.ty, true);
        }
      }
      return;
    }

    this.blockedTime = 0;
    this.path = null;
    this.faceTowards(targetX, targetY);
    if (this.carry.type !== resType) this.carry = { type: resType, amount: 0 };

    const rate = this.def.gather[resType] * this.player.mods.gatherRate;
    let amount = rate * dt;
    if (farm) amount = farm.takeFarmFood(amount);
    else amount = this.world.map.harvest(this.resourceTile.tx, this.resourceTile.ty, amount);

    if (amount <= 0) { this.findNextResource(resType); return; }
    this.carry.amount += amount;
    this.gatherAnim = 0.4;

    if (this.carry.amount >= this.carryCapacity()) {
      this.carry.amount = this.carryCapacity();
      this.startReturn();
    }
  }

  startReturn() {
    const drop = this.world.findNearestDropoff(this, this.carry.type);
    if (!drop) { this.state = STATE.IDLE; return; }
    this.returnTo = drop;
    this.state = STATE.RETURN;
    this.requestPathToEntity(drop);
  }

  updateReturn(dt) {
    const drop = this.returnTo;
    if (!drop || drop.dead) { this.startReturn(); return; }
    if (drop.edgeDistanceTo(this.x, this.y) > TILE * 1.1) {
      if (this.followPath(dt)) {
        this.blockedTime += dt;
        if (this.blockedTime > UNREACHABLE_AFTER) {
          this.blockedTime = 0;
          drop.unreachable = true;
          this.startReturn();
          return;
        }
        if (this.repathCooldown <= 0) {
          this.repathCooldown = 1.0;
          this.requestPathToEntity(drop);
        }
      }
      return;
    }
    this.blockedTime = 0;
    // Dépôt
    this.world.deposit(this.playerIndex, this.carry.type, this.carry.amount);
    const resType = this.carry.type;
    this.carry = { type: resType, amount: 0 };
    this.path = null;
    // Poste demandé pendant le trajet : on l'honore maintenant.
    if (this.pendingJob) {
      const job = this.pendingJob;
      this.pendingJob = null;
      if (job.kind === 'farm' && !job.farm.dead) { this.gatherFarm(job.farm); return; }
      if (job.kind === 'tile' && this.world.map.resourceAt(job.tx, job.ty)) {
        this.gatherAt(job.tx, job.ty);
        return;
      }
      this.findNextResource(job.resType);
      return;
    }
    // Retour au travail
    if (this.target && this.target.type === 'farm' && !this.target.dead) {
      this.state = STATE.GATHER;
      this.requestPathToEntity(this.target);
    } else if (this.resourceTile && this.world.map.resourceAt(this.resourceTile.tx, this.resourceTile.ty)) {
      this.state = STATE.GATHER;
      this.requestPathToTile(this.resourceTile.tx, this.resourceTile.ty, true);
    } else {
      this.findNextResource(resType);
    }
  }

  /**
   * Le gisement est épuisé (ou inaccessible). Par défaut le villageois rapporte
   * son chargement puis attend les ordres : c'est au joueur d'affecter ses
   * ouvriers. La réaffectation automatique est une option, activée pour l'IA.
   */
  findNextResource(type) {
    if (!type) type = this.carry.type;            // on livre avant de s'arrêter
    if (!type) { this.state = STATE.IDLE; this.world.notifyIdleWorker(this); return; }
    if (this.carry.amount > 0) {
      // On rapporte d'abord ce qu'on a dans les bras.
      const drop = this.world.findNearestDropoff(this, type);
      if (drop) {
        this.resourceTile = null;
        this.target = null;
        this.returnTo = drop;
        this.state = STATE.RETURN;
        this.requestPathToEntity(drop);
        return;
      }
    }
    this.resourceTile = null;
    this.target = null;
    if (!this.player.autoWorkers) {
      this.state = STATE.IDLE;
      this.world.notifyIdleWorker(this);
      return;
    }
    const next = this.world.findNearestResource(this.x, this.y, type, 18 * TILE, this.playerIndex);
    if (!next) { this.state = STATE.IDLE; this.world.notifyIdleWorker(this); return; }
    if (next.kind === 'building') this.gatherFarm(next);
    else this.gatherAt(next.tx, next.ty);
  }

  updateBuild(dt) {
    const site = this.target;
    if (!site || site.dead) { this.state = STATE.IDLE; this.target = null; return; }
    if (site.complete && site.hp >= site.maxHp) {
      // Chantier terminé : on enchaîne sur la ferme qu'on vient de bâtir.
      const finished = site;
      this.target = null;
      this.state = STATE.IDLE;
      // Bâtir une ferme vaut ordre de la cultiver : c'est la suite directe de
      // l'ordre du joueur, pas une réaffectation décidée par le jeu.
      if (finished.type === 'farm') this.gatherFarm(finished);
      else this.world.notifyIdleWorker(this);
      return;
    }
    if (site.edgeDistanceTo(this.x, this.y) > TILE * 1.1) {
      if (this.followPath(dt)) {
        this.blockedTime += dt;
        if (this.blockedTime > UNREACHABLE_AFTER) {
          this.blockedTime = 0;
          site.unreachable = true;   // le chantier sera annulé par son propriétaire
          this.state = STATE.IDLE;
          this.target = null;
          return;
        }
        if (this.repathCooldown <= 0) {
          this.repathCooldown = 1.0;
          this.requestPathToEntity(site);
        }
      }
      return;
    }
    this.blockedTime = 0;
    this.path = null;
    this.faceTowards(site.x, site.y);
    this.gatherAnim = 0.4;
    if (!site.complete) site.addBuildProgress(dt);
    else site.hp = Math.min(site.maxHp, site.hp + site.maxHp * 0.02 * dt); // réparation
  }

  // --- Déplacement ---------------------------------------------------------

  faceTowards(x, y) {
    this.facing = Math.atan2(y - this.y, x - this.x);
  }

  /** Avance le long du chemin. Renvoie true quand il est terminé (ou absent). */
  followPath(dt) {
    if (this.pathPending) return false;
    if (!this.path || this.pathIndex >= this.path.length) {
      if (this.destination && dist(this.x, this.y, this.destination.x, this.destination.y) > TILE * 1.2
          && this.repathCooldown <= 0 && this.stuckTime < 4) {
        this.repathCooldown = 1.2;
        this.stuckTime += 1;
        this.requestPathTo(this.destination.x, this.destination.y);
        return false;
      }
      return true;
    }

    const node = this.path[this.pathIndex];
    const nodeX = node.tx * TILE + TILE / 2;
    const nodeY = node.ty * TILE + TILE / 2;
    const dx = nodeX - this.x, dy = nodeY - this.y;
    const d = Math.hypot(dx, dy);
    const last = this.pathIndex === this.path.length - 1;
    if (d < (last ? TILE * 0.3 : TILE * 0.55)) {
      this.pathIndex++;
      return this.pathIndex >= this.path.length;
    }

    let vx = dx / d, vy = dy / d;
    const sep = this.world.separationForce(this);
    vx += sep.x; vy += sep.y;
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;

    this.facing = Math.atan2(vy, vx);
    const step = this.speedPx() * dt;
    const before = this.x + this.y * 0.000001;
    this.tryMove(vx * step, vy * step);

    // Détection de blocage : si on n'avance pas, on recalcule.
    if (Math.abs((this.x + this.y * 0.000001) - before) < step * 0.15) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.2 && this.repathCooldown <= 0) {
        this.repathCooldown = 1.0;
        this.stuckTime = 0;
        const goal = this.path[this.path.length - 1];
        this.requestPathToTile(goal.tx, goal.ty, this.state !== STATE.MOVE && this.state !== STATE.ATTACK_MOVE);
      }
    } else if (this.stuckTime > 0) {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 0.5);
    }
    return false;
  }

  /** Déplacement avec glissement le long des obstacles. */
  tryMove(dx, dy) {
    const map = this.world.map;
    const r = this.radius * 0.6;
    const canStand = (x, y) => {
      const t1 = map.isBlocked(Math.floor((x - r) / TILE), Math.floor((y - r) / TILE));
      const t2 = map.isBlocked(Math.floor((x + r) / TILE), Math.floor((y - r) / TILE));
      const t3 = map.isBlocked(Math.floor((x - r) / TILE), Math.floor((y + r) / TILE));
      const t4 = map.isBlocked(Math.floor((x + r) / TILE), Math.floor((y + r) / TILE));
      return !(t1 || t2 || t3 || t4);
    };
    const nx = this.x + dx, ny = this.y + dy;
    if (canStand(nx, ny)) { this.x = nx; this.y = ny; }
    else if (canStand(nx, this.y)) { this.x = nx; }
    else if (canStand(this.x, ny)) { this.y = ny; }
    this.x = clamp(this.x, 2, this.world.map.pixelWidth - 2);
    this.y = clamp(this.y, 2, this.world.map.pixelHeight - 2);
  }
}

// ===========================================================================
// BÂTIMENTS
// ===========================================================================

export class Building extends Entity {
  constructor(world, playerIndex, type, tx, ty, complete = false) {
    const def = BUILDING_TYPES[type];
    const size = def.size;
    super(world, playerIndex, def, (tx + size / 2) * TILE, (ty + size / 2) * TILE);
    this.kind = 'building';
    this.tx = tx;
    this.ty = ty;
    this.size = size;
    this.radius = (size * TILE) / 2;
    this.complete = complete;
    this.buildProgress = complete ? def.buildTime : 0;
    this.hp = complete ? def.hp : Math.max(1, def.hp * 0.05);
    this.queue = [];
    this.productionTime = 0;
    this.rally = null;
    this.attackCooldown = 0;
    this.scanCooldown = world.rng.next() * 0.5;
    this.target = null;
    this.foodLeft = def.farmFood || 0;
    this.createdAt = world.time;
    if (!def.walkable) this.occupyTiles();
  }

  occupyTiles() {
    const map = this.world.map;
    for (let y = this.ty; y < this.ty + this.size; y++) {
      for (let x = this.tx; x < this.tx + this.size; x++) map.block(x, y, BLOCK.BUILDING);
    }
  }

  releaseTiles() {
    const map = this.world.map;
    for (let y = this.ty; y < this.ty + this.size; y++) {
      for (let x = this.tx; x < this.tx + this.size; x++) map.unblock(x, y, BLOCK.BUILDING);
    }
  }

  rangePx() {
    return ((this.def.range || 0) + this.player.mods.range) * TILE;
  }

  addBuildProgress(dt) {
    if (this.complete) return;
    this.unreachable = false;
    this.buildProgress += dt;
    const ratio = clamp(this.buildProgress / this.def.buildTime, 0, 1);
    this.hp = Math.max(this.hp, this.maxHp * (0.05 + 0.95 * ratio));
    if (this.buildProgress >= this.def.buildTime) {
      this.complete = true;
      this.hp = this.maxHp;
      this.world.onBuildingCompleted(this);
    }
  }

  takeFarmFood(amount) {
    if (this.foodLeft <= 0) return 0;
    const taken = Math.min(this.foodLeft, amount);
    this.foodLeft -= taken;
    if (this.foodLeft <= 0) this.world.killEntity(this, null, true);
    return taken;
  }

  /** Case libre la plus proche sur le pourtour : point de rendez-vous des unités. */
  accessTile(fromX, fromY) {
    const map = this.world.map;
    let best = null, bestD = Infinity;
    for (let y = this.ty - 1; y <= this.ty + this.size; y++) {
      for (let x = this.tx - 1; x <= this.tx + this.size; x++) {
        if (!map.inBounds(x, y) || map.isBlocked(x, y)) continue;
        const d = dist2(fromX, fromY, x * TILE + TILE / 2, y * TILE + TILE / 2);
        if (d < bestD) { bestD = d; best = { tx: x, ty: y }; }
      }
    }
    return best;
  }

  /** Point d'apparition des unités : juste sous le bâtiment, sur une case libre. */
  spawnPoint() {
    const map = this.world.map;
    const free = map.findFreeTile(this.tx + Math.floor(this.size / 2), this.ty + this.size, 8)
      || map.findFreeTile(this.tx - 1, this.ty + this.size, 10);
    if (free) return { x: free.tx * TILE + TILE / 2, y: free.ty * TILE + TILE / 2 };
    return { x: this.x, y: this.y + this.radius + TILE };
  }

  enqueue(item) { this.queue.push(item); }

  update(dt) {
    if (this.dead || !this.complete) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.updateProduction(dt);
    if (this.def.attack) this.updateDefense(dt);
  }

  updateProduction(dt) {
    if (this.queue.length === 0) return;
    const item = this.queue[0];
    if (item.kind === 'unit' && this.player.pop >= this.player.popCap) {
      this.world.notifyPopBlocked(this.playerIndex);
      return;
    }
    item.timeLeft -= dt;
    if (item.timeLeft > 0) return;
    this.queue.shift();
    this.world.completeProduction(this, item);
  }

  updateDefense(dt) {
    if (this.target && (this.target.dead || this.target.edgeDistanceTo(this.x, this.y) > this.rangePx() + TILE)) {
      this.target = null;
    }
    if (!this.target) {
      this.scanCooldown -= dt;
      if (this.scanCooldown > 0) return;
      this.scanCooldown = 0.4;
      this.target = this.world.findEnemyNear(this, this.rangePx());
    }
    if (this.target && this.attackCooldown <= 0) {
      this.attackCooldown = this.def.attackSpeed;
      this.world.performAttack(this, this.target);
    }
  }

  get progressRatio() { return clamp(this.buildProgress / this.def.buildTime, 0, 1); }
}

// ===========================================================================
// PROJECTILES
// ===========================================================================

export class Projectile {
  constructor(world, source, target, damage) {
    this.world = world;
    this.x = source.x;
    this.y = source.y - (source.kind === 'building' ? 10 : 6);
    this.target = target;
    this.damage = damage;
    this.source = source;
    this.speed = 13 * TILE;
    this.dead = false;
    this.lastX = target.x;
    this.lastY = target.y;
    this.startX = this.x;
    this.startY = this.y;
    this.travel = 0;
    this.totalDist = Math.max(1, dist(this.x, this.y, target.x, target.y));
  }

  update(dt) {
    const tx = this.target && !this.target.dead ? this.target.x : this.lastX;
    const ty = this.target && !this.target.dead ? this.target.y : this.lastY;
    this.lastX = tx; this.lastY = ty;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.travel += step;
    if (d <= step) {
      this.x = tx; this.y = ty;
      this.dead = true;
      if (this.target && !this.target.dead) this.target.takeDamage(this.damage, this.source);
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.angle = Math.atan2(dy, dx);
    if (this.travel > this.totalDist * 3 + TILE * 10) this.dead = true;
  }
}
