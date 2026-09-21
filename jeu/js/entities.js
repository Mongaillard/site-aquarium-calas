// ---------------------------------------------------------------------------
// Entités : unités (avec leur machine à états), bâtiments et projectiles.
// Aucune dépendance au rendu : ce module doit pouvoir tourner sans navigateur.
// ---------------------------------------------------------------------------

import {
  TILE, UNIT_TYPES, BUILDING_TYPES, STANCES, DEFAULT_STANCE, BUILDER_EXPONENT,
} from './config.js';
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
  GARRISON: 'garrison',
};

// Suivi de chemin. BODY : demi-côté du corps en fraction du rayon (l'unité est
// dessinée plus large qu'elle ne se cogne, comme dans AoE). LOOKAHEAD : nœuds
// examinés devant soi pour couper au plus court. MAX_REPATHS : relances de
// trajet par ordre, toutes causes confondues ; au-delà, l'unité s'arrête là où
// elle est plutôt que de tourner en rond.
const BODY = 0.6;
const LOOKAHEAD = 12;
const MAX_REPATHS = 10;

/** Au bout de ce nombre de secondes sans progrès, une cible est déclarée inatteignable. */
const UNREACHABLE_AFTER = 7;

/** Même chose pour un gisement : on réagit plus vite, il y a un plan B. */
const GATHER_RETRY_AFTER = 3;

// Les identifiants sont distribués par le monde lui-même : un compteur global
// serait partagé entre deux parties vivant dans le même processus (test de
// sauvegarde, vérification d'une reprise) et les ferait diverger.

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
    this.id = world.newEntityId();
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
  get player() { return this.world.players[this.playerIndex] || this.world.gaia; }
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
    this.gatherSpot = null;       // {x, y, tx, ty, cote} où se tenir pour la récolter
    this.snugTime = 0;            // temps passé à essayer de s'y coller
    this.carry = { type: null, amount: 0 };
    this.attackCooldown = 0;
    // Toute l'aléa de simulation passe par le générateur du monde : une même
    // graine rejoue exactement la même partie (tests reproductibles).
    this.facing = world.rng.next() * Math.PI * 2;
    this.stuckTime = 0;       // temps sans progresser vers le point de passage
    this.repathAttempts = 0;  // relances de trajet pour atteindre la destination
    this.repathCooldown = 0;
    this.scanCooldown = world.rng.next() * 0.5;
    // Attitude à la manière d'AoE : décide si l'unité engage d'elle-même,
    // jusqu'où elle poursuit, et si elle revient à son poste.
    this.stance = UNIT_TYPES[type].class === 'villager' ? DEFAULT_STANCE.villager : DEFAULT_STANCE.military;
    this.guardPoint = null;      // poste à tenir
    this.autoTarget = false;     // cible prise d'initiative (poursuite limitée)
    this.groupSpeed = 0;         // vitesse imposée par le groupe (0 = libre)
    this.garrisonedIn = null;    // bâtiment qui l'abrite
    this.gatherAnim = 0;
    this.pathPending = false;
    this.pendingJob = null; // poste à prendre après la livraison en cours
    this.buildQueue = [];   // chantiers à enchaîner après celui en cours
    this.failedDropoffs = null; // dépôts que CE villageois n'a pas pu rejoindre
    this.lastResourceTile = null; // dernière case réellement exploitée
    this.blockedTime = 0;   // temps passé sans pouvoir atteindre sa cible
    this.fleeUntil = 0;     // mise à l'abri en cours (piloté par l'IA)
    this.spawnTime = world.time;
  }

  get isVillager() { return this.type === 'villager'; }

  speedPx() {
    const mult = this.isVillager ? this.player.mods.villagerSpeed : 1;
    const own = this.def.speed * TILE * mult;
    // En groupe, tout le monde va au rythme du plus lent (principe d'AoE :
    // une armée arrive ensemble, pas en file indienne).
    return this.groupSpeed > 0 ? Math.min(own, this.groupSpeed) : own;
  }

  get stanceDef() { return STANCES[this.stance] || STANCES.aggressive; }

  setStance(id) {
    // Réappliquer l'attitude en place redéfinirait le poste de garde à chaque
    // appel : l'IA le fait à chaque cycle de réflexion.
    if (!STANCES[id] || this.stance === id) return;
    this.stance = id;
    this.guardPoint = { x: this.x, y: this.y };
    if (id === 'passive' && this.autoTarget) { this.target = null; this.state = STATE.IDLE; }
    if (id === 'standGround') { this.path = null; this.destination = null; }
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
    this.buildQueue.length = 0;
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
    this.autoTarget = false;
    this.groupSpeed = 0;   // un ordre individuel rend sa vitesse à l'unité
    this.buildQueue.length = 0;
    this.repathAttempts = 0;
    this.guardPoint = { x, y };   // le poste devient le point d'arrivée
    this.state = aggressive ? STATE.ATTACK_MOVE : STATE.MOVE;
    this.requestPathTo(x, y);
  }

  /**
   * @param {boolean} auto vrai si l'unité a choisi sa cible d'elle-même : la
   *   poursuite est alors limitée par l'attitude. Un ordre du joueur, lui,
   *   est suivi jusqu'au bout.
   */
  attackEntity(target, auto = false) {
    if (!target || target.dead) return;
    this.target = target;
    this.resourceTile = null;
    this.destination = null;
    this.autoTarget = auto;
    if (auto && !this.guardPoint) this.guardPoint = { x: this.x, y: this.y };
    if (!auto) { this.guardPoint = null; this.groupSpeed = 0; }
    this.state = STATE.ATTACK;
    if (this.stance === 'standGround' && auto) { this.path = null; return; }
    this.requestPathToEntity(target);
  }

  /** Rejoint son poste après un engagement. */
  returnToGuard() {
    this.target = null;
    this.autoTarget = false;
    const guard = this.guardPoint;
    if (!guard || dist(this.x, this.y, guard.x, guard.y) < TILE * 1.2) {
      this.state = STATE.IDLE;
      this.path = null;
      return;
    }
    this.destination = { x: guard.x, y: guard.y };
    this.state = STATE.MOVE;
    this.requestPathTo(guard.x, guard.y);
  }

  gatherAt(tx, ty) {
    const map = this.world.map;
    let res = map.resourceAt(tx, ty);
    if (!res || !this.isVillager) return;
    // Case cernée (arbre au milieu d'un bois) : personne ne peut venir la
    // travailler. On reporte l'ordre sur le gisement exploitable le plus
    // proche, plutôt que d'envoyer le villageois attendre devant.
    if (!map.hasOpenNeighbour(tx, ty)) {
      const reachable = this.world.findReachableResource(tx, ty, res.type);
      if (!reachable) {
        this.state = STATE.IDLE;
        this.resourceTile = null;
        this.world.notifyIdleWorker(this);
        return;
      }
      tx = reachable.tx; ty = reachable.ty; res = reachable;
    }
    if (this.deliverBeforeJob({ kind: 'tile', tx, ty, resType: res.type })) return;
    this.buildQueue.length = 0;
    if (this.carry.type && this.carry.type !== res.type) this.carry = { type: null, amount: 0 };
    this.pendingJob = null;
    this.resourceTile = { tx, ty };
    this.target = null;
    this.state = STATE.GATHER;
    this.gatherSpot = this.chooseGatherSpot(tx, ty);
    this.snugTime = 0;
    this.requestPathToSpot();
  }

  /**
   * Le point où se tenir pour récolter la case (tx, ty), collé à elle : le
   * corps touche la case, sur un de ses côtés. On préfère l'ouest ou l'est —
   * les poses de travail sont de profil, un villageois au nord regarderait à
   * côté —, puis le nord et le sud, puis les angles ; à préférence égale, le
   * plus proche. Un côté déjà pris par un autre récolteur de la même case est
   * laissé, tant qu'il en reste. Null si aucun côté n'est tenable.
   */
  chooseGatherSpot(tx, ty) {
    const map = this.world.map;
    const r = this.radius * BODY;
    const marge = TILE / 2 + r + 1;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    const cotes = [
      ['O', -1, 0, 0], ['E', 1, 0, 0], ['N', 0, -1, TILE], ['S', 0, 1, TILE],
      ['NO', -1, -1, 2 * TILE], ['NE', 1, -1, 2 * TILE], ['SO', -1, 1, 2 * TILE], ['SE', 1, 1, 2 * TILE],
    ];
    const pris = new Set();
    for (const u of this.world.units) {
      if (u === this || u.dead || !u.gatherSpot || !u.resourceTile) continue;
      if (u.resourceTile.tx === tx && u.resourceTile.ty === ty) pris.add(u.gatherSpot.cote);
    }
    let meilleur = null, meilleurCout = Infinity;
    for (let passe = 0; passe < 2 && !meilleur; passe++) {   // 2e passe : les côtés pris aussi
      for (const [cote, ox, oy, penalite] of cotes) {
        if (passe === 0 && pris.has(cote)) continue;
        const x = cx + ox * marge, y = cy + oy * marge;
        if (x < r || y < r || x > map.pixelWidth - r || y > map.pixelHeight - r || !map.canStand(x, y, r)) continue;
        const stx = Math.floor(x / TILE), sty = Math.floor(y / TILE);
        // un côté qui débouche sur un espace fermé (poche de forêt) passe après
        const enclave = map.floodSize(stx, sty, 40) < 40 ? 4 * TILE : 0;
        const cout = penalite + enclave + dist(this.x, this.y, x, y);
        if (cout < meilleurCout) { meilleurCout = cout; meilleur = { x, y, tx, ty, cote }; }
      }
    }
    return meilleur;
  }

  /** Chemin vers le point de récolte s'il y en a un, sinon vers une case voisine. */
  requestPathToSpot() {
    const spot = this.gatherSpot, tile = this.resourceTile;
    if (spot && tile && spot.tx === tile.tx && spot.ty === tile.ty) this.requestPathTo(spot.x, spot.y, false);
    else if (tile) this.requestPathToTile(tile.tx, tile.ty, true);
  }

  gatherFarm(farm) {
    if (!this.isVillager || !farm || farm.dead) return;
    if (this.deliverBeforeJob({ kind: 'farm', farm, resType: 'food' })) return;
    this.buildQueue.length = 0;
    if (this.carry.type && this.carry.type !== 'food') this.carry = { type: null, amount: 0 };
    this.pendingJob = null;
    this.target = farm;
    this.resourceTile = null;
    this.state = STATE.GATHER;
    this.requestPathToEntity(farm);
  }

  /**
   * @param {boolean} queue vrai quand l'ordre vient d'une nouvelle pose de
   *   bâtiment : l'ouvrier termine son chantier en cours puis enchaîne.
   *   Un ordre direct (appui sur un chantier) remplace au contraire la file.
   */
  buildAt(building, queue = false) {
    if (!this.isVillager || !building || building.dead) return;
    if (queue && this.state === STATE.BUILD && this.target && !this.target.dead
        && this.target !== building) {
      if (!this.buildQueue.includes(building)) this.buildQueue.push(building);
      return;
    }
    if (!queue) this.buildQueue.length = 0;
    this.target = building;
    this.resourceTile = null;
    this.state = STATE.BUILD;
    this.requestPathToEntity(building);
  }

  /** Passe au chantier suivant de la file. Renvoie false si elle est vide. */
  nextQueuedBuild() {
    while (this.buildQueue.length > 0) {
      const next = this.buildQueue.shift();
      if (next && !next.dead && !next.complete) { this.buildAt(next, true); return true; }
    }
    return false;
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
    if (this.dead || this.garrisonedIn) return;   // à l'abri : hors du jeu
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
      case STATE.GARRISON: this.updateGarrisonMove(dt); break;
    }
  }

  updateIdle(dt) {
    if (!this.guardPoint) this.guardPoint = { x: this.x, y: this.y };
    this.tryAcquireTarget(dt);
  }

  /**
   * Prise de cible d'initiative, réglée par l'attitude :
   *  - sans attaque : jamais
   *  - position tenue : uniquement ce qui entre à portée d'arme
   *  - défensif / agressif : tout ennemi dans le champ de vision
   */
  tryAcquireTarget(dt) {
    if (this.stance === 'passive') return false;
    this.scanCooldown -= dt;
    if (this.scanCooldown > 0) return false;
    this.scanCooldown = 0.4;
    const radius = this.stance === 'standGround'
      ? this.rangePx() + this.radius
      : this.def.los * TILE;
    const enemy = this.world.findEnemyNear(this, radius);
    if (!enemy) return false;
    this.attackEntity(enemy, true);
    return true;
  }

  updateMove(dt, aggressive) {
    // En déplacement offensif on engage ce qui se présente ; en déplacement
    // simple, seule une attitude agressive fait sortir du rang.
    if (aggressive || this.stance === 'aggressive') {
      const dest = this.destination;
      if (this.tryAcquireTarget(dt)) {
        this.rallyAfterFight = dest;
        return;
      }
    }
    if (this.followPath(dt)) {
      this.state = STATE.IDLE;
      this.destination = null;
      this.groupSpeed = 0;
      this.guardPoint = { x: this.x, y: this.y };
    }
  }

  updateAttack(dt) {
    const target = this.target;
    if (!target || target.dead || target.garrisonedIn) {
      this.target = null;
      const rally = this.rallyAfterFight;
      this.rallyAfterFight = null;
      if (rally) { this.moveTo(rally.x, rally.y, true); return; }
      // Cible abattue : on prend la suivante si l'attitude le permet, sinon
      // on regagne son poste.
      if (this.stance !== 'passive' && this.stance !== 'standGround') {
        const next = this.world.findEnemyNear(this, this.def.los * TILE * 0.8);
        if (next && this.withinChaseLimit(next)) { this.attackEntity(next, true); return; }
      }
      this.returnToGuard();
      return;
    }

    // La portée part du corps de l'attaquant : mesurée depuis son centre, un
    // fantassin s'arrête à portée de bras... sans pouvoir frapper.
    const reach = this.rangePx() + this.radius;
    const d = target.edgeDistanceTo(this.x, this.y);

    // Poursuite bornée : une cible prise d'initiative n'entraîne jamais
    // l'unité au-delà de ce que son attitude autorise.
    if (d > reach && this.autoTarget) {
      if (this.stance === 'standGround') { this.target = null; this.state = STATE.IDLE; return; }
      if (!this.withinChaseLimit(target)) { this.returnToGuard(); return; }
    }

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
      // Chemin épuisé mais toujours trop loin : les derniers pas se font en
      // ligne droite. Un chemin s'arrête sur une case voisine, ce qui peut
      // rester hors d'allonge — sans cela, l'unité reste plantée devant sa
      // cible sans jamais la toucher.
      if (!this.pathPending) this.stepToward(target.x, target.y, dt);
      if (this.repathCooldown <= 0) {
        this.repathCooldown = 0.6;
        this.requestPathToEntity(target);
      }
      return;
    } else if (target.kind === 'unit' && this.repathCooldown <= 0) {
      const last = this.path[this.path.length - 1];
      if (dist2(last.tx * TILE + TILE / 2, last.ty * TILE + TILE / 2, target.x, target.y) > (TILE * 2.5) ** 2) {
        this.repathCooldown = 0.7;
        this.requestPathTo(target.x, target.y, true);
      }
    }
    this.followPath(dt);
  }

  /** La cible reste-t-elle dans le rayon de poursuite autorisé ? */
  withinChaseLimit(target) {
    const limit = this.stanceDef.chase;
    if (limit <= 0) return false;
    const guard = this.guardPoint;
    if (!guard) return true;
    return dist(target.x, target.y, guard.x, guard.y) <= limit * TILE;
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

    // Collé au gisement : tant qu'on n'est pas au point choisi, on y va — droit
    // dessus quand il est tout près. Si on est à portée mais qu'on n'y arrive
    // pas (un coin, quelqu'un qui l'occupe), on se contente d'où l'on est.
    const spot = !farm && this.gatherSpot && this.gatherSpot.tx === this.resourceTile.tx && this.gatherSpot.ty === this.resourceTile.ty
      ? this.gatherSpot : null;
    if (spot && d <= limit && dist(this.x, this.y, spot.x, spot.y) > 2.5) {
      const enChemin = this.pathPending || (this.path && this.pathIndex < this.path.length);
      if (!enChemin) this.snugTime += dt;
      if (this.snugTime > 1.5) {
        this.gatherSpot = { ...spot, x: this.x, y: this.y };
      } else {
        if (this.approach(spot.x, spot.y, dt)) return;
        if (!this.followPath(dt)) return;
        if (this.stuckTime > 0.5) this.snugTime += dt;   // bloqué : le temps compte double
        return;
      }
    }
    if (d > limit) {
      // Approche finale : tout près mais pas encore à portée (arrêt au bord
      // d'une case, poussée par un voisin), on marche droit sur le gisement
      // plutôt que de redemander un chemin — qui reviendrait vide, la case
      // étant déjà adjacente.
      if (this.approach(spot ? spot.x : targetX, spot ? spot.y : targetY, dt, farm ? farm.radius : 0)) return;
      if (this.followPath(dt)) {
        // Chemin terminé mais cible toujours hors de portée : elle est
        // probablement enclavée (buisson cerné d'arbres). On insiste un peu,
        // puis on l'abandonne définitivement pour ne pas bloquer l'économie.
        this.blockedTime += dt;
        if (this.blockedTime > (farm ? UNREACHABLE_AFTER : GATHER_RETRY_AFTER)) {
          this.blockedTime = 0;
          if (farm) {
            farm.gatherUnreachable = true;
            this.findNextResource(resType);
            return;
          }
          // Le point choisi n'est peut-être pas joignable (une poche, un coin) :
          // avant de condamner la case, on accepte n'importe quel côté.
          if (this.gatherSpot) { this.gatherSpot = null; this.requestPathToSpot(); return; }
          // Case injoignable : on la marque, puis on reprend l'ordre du joueur
          // sur le gisement exploitable le plus proche. Ce n'est pas un
          // changement de métier, c'est l'ordre donné qui se poursuit.
          const tile = this.resourceTile;
          const res = this.world.map.resourceAt(tile.tx, tile.ty);
          if (res) res.inaccessible = true;
          const alt = this.world.findReachableResource(tile.tx, tile.ty, resType);
          if (alt && (alt.tx !== tile.tx || alt.ty !== tile.ty)) {
            this.gatherAt(alt.tx, alt.ty);
            return;
          }
          this.findNextResource(resType);
          return;
        }
        if (this.repathCooldown <= 0) {
          this.repathCooldown = 1.0;
          if (farm) this.requestPathToEntity(farm);
          else this.requestPathToSpot();
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
    if (!farm) this.lastResourceTile = { tx: this.resourceTile.tx, ty: this.resourceTile.ty };
    this.carry.amount += amount;
    this.gatherAnim = 0.4;

    if (this.carry.amount >= this.carryCapacity()) {
      this.carry.amount = this.carryCapacity();
      this.startReturn();
    }
  }

  startReturn() {
    let drop = this.world.findNearestDropoff(this, this.carry.type, this.failedDropoffs);
    if (!drop && this.failedDropoffs) {
      // Tous les dépôts ont échoué une fois : on repart de zéro plutôt que de
      // laisser le villageois planté avec un sac plein.
      this.failedDropoffs = null;
      drop = this.world.findNearestDropoff(this, this.carry.type);
    }
    if (!drop) {
      this.state = STATE.IDLE;
      this.world.notifyIdleWorker(this);
      return;
    }
    this.returnTo = drop;
    this.state = STATE.RETURN;
    this.requestPathToEntity(drop);
  }

  updateReturn(dt) {
    const drop = this.returnTo;
    if (!drop || drop.dead) { this.startReturn(); return; }
    if (drop.edgeDistanceTo(this.x, this.y) > TILE * 1.1) {
      if (this.approach(drop.x, drop.y, dt, drop.radius)) return;
      if (this.followPath(dt)) {
        this.blockedTime += dt;
        if (this.blockedTime > UNREACHABLE_AFTER) {
          this.blockedTime = 0;
          // Échec propre à ce trajet : on essaie un autre dépôt, sans pénaliser
          // le bâtiment pour les autres villageois.
          if (!this.failedDropoffs) this.failedDropoffs = new Set();
          this.failedDropoffs.add(drop.id);
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
    this.failedDropoffs = null;
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
      const { tx, ty } = this.resourceTile;
      if (!this.gatherSpot || this.gatherSpot.tx !== tx || this.gatherSpot.ty !== ty) this.gatherSpot = this.chooseGatherSpot(tx, ty);
      this.snugTime = 0;
      this.requestPathToSpot();
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
    const exhausted = this.lastResourceTile;
    this.resourceTile = null;
    this.target = null;

    // Le gisement désigné s'épuise : on enchaîne sur son voisin immédiat, comme
    // dans AoE — le joueur a choisi ce bosquet, pas cet arbre-là précisément.
    // Au-delà de deux cases, c'est un vrai changement de poste : il lui revient.
    if (exhausted) {
      const nearby = this.world.findReachableResource(exhausted.tx, exhausted.ty, type, 2);
      if (nearby) { this.gatherAt(nearby.tx, nearby.ty); return; }
    }

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
    if (!site || site.dead) {
      this.state = STATE.IDLE;
      this.target = null;
      this.nextQueuedBuild();   // le chantier a disparu : on passe au suivant
      return;
    }
    if (site.complete && site.hp >= site.maxHp) {
      const finished = site;
      this.target = null;
      this.state = STATE.IDLE;
      // Chantier suivant de la file avant tout le reste : c'est la suite des
      // ordres du joueur.
      if (this.nextQueuedBuild()) return;
      // Bâtir une ferme vaut ordre de la cultiver : c'est la suite directe de
      // l'ordre du joueur, pas une réaffectation décidée par le jeu.
      if (finished.type === 'farm') this.gatherFarm(finished);
      else this.world.notifyIdleWorker(this);
      return;
    }
    if (site.edgeDistanceTo(this.x, this.y) > TILE * 1.1) {
      if (this.approach(site.x, site.y, dt, site.radius)) return;
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
    site.activeBuilders++;
    if (!site.complete) site.addBuildProgress(dt);
    else site.hp = Math.min(site.maxHp, site.hp + site.maxHp * 0.02 * dt); // réparation
  }

  // --- Garnison -------------------------------------------------------------

  /** Ordre « va t'abriter » : l'unité rejoint le bâtiment puis y entre. */
  garrisonAt(building) {
    if (!building || !building.canGarrison(this)) return false;
    this.buildQueue.length = 0;
    this.target = building;
    this.resourceTile = null;
    this.destination = null;
    this.state = STATE.GARRISON;
    this.requestPathToEntity(building);
    return true;
  }

  updateGarrisonMove(dt) {
    const shelter = this.target;
    if (!shelter || shelter.dead || !shelter.canGarrison(this)) {
      this.target = null;
      this.state = STATE.IDLE;
      return;
    }
    if (shelter.edgeDistanceTo(this.x, this.y) <= TILE * 1.2) {
      shelter.addToGarrison(this);
      return;
    }
    if (this.followPath(dt) && this.repathCooldown <= 0) {
      this.repathCooldown = 1.0;
      this.requestPathToEntity(shelter);
    }
  }

  enterGarrison(building) {
    this.stop();
    this.garrisonedIn = building;
    this.selected = false;
    this.path = null;
  }

  leaveGarrison() {
    const building = this.garrisonedIn;
    this.garrisonedIn = null;
    if (!building) return;
    const spawn = building.spawnPoint();
    this.x = spawn.x;
    this.y = spawn.y;
    this.state = STATE.IDLE;
    this.guardPoint = { x: this.x, y: this.y };
  }

  // --- Déplacement ---------------------------------------------------------

  faceTowards(x, y) {
    this.facing = Math.atan2(y - this.y, x - this.x);
  }

  /** Approche directe, pour les derniers pas qu'un chemin ne couvre pas. */
  stepToward(x, y, dt) {
    const dx = x - this.x, dy = y - this.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    this.facing = Math.atan2(dy, dx);
    const step = this.speedPx() * dt;
    this.tryMove((dx / len) * step, (dy / len) * step);
  }

  /**
   * Approche finale : tout près de la cible (`extra` : rayon d'un bâtiment) et
   * sans chemin en cours, on marche droit dessus. L'obstacle — arbre, mur —
   * arrête le pas au bon endroit, et l'état appelant juge ensuite la portée.
   * Renvoie true si on s'en est chargé ce tick. Sans rapprochement pendant
   * 0,8 s (arbre derrière un angle), on rend la main à la logique de chemin
   * pour un moment : `stuckTime` et `repathCooldown` servent de compteurs,
   * ils sont déjà sauvegardés.
   */
  approach(targetX, targetY, dt, extra = 0) {
    if (this.pathPending || this.repathCooldown > 0) return false;
    if (this.path && this.pathIndex < this.path.length) return false;
    const d = dist(this.x, this.y, targetX, targetY);
    if (d > TILE * 2.5 + extra || d < 0.5) return false;
    this.faceTowards(targetX, targetY);
    const step = this.speedPx() * dt;
    this.tryMove(((targetX - this.x) / d) * step, ((targetY - this.y) / d) * step);
    const after = dist(this.x, this.y, targetX, targetY);
    if (after > d - step * 0.3) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.8) { this.stuckTime = 0; this.repathCooldown = 0.5; return false; }
    } else if (this.stuckTime > 0) {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    }
    return true;
  }

  /**
   * Avance le long du chemin. Renvoie true quand il est terminé (ou absent).
   *
   * Le chemin est la suite COMPLÈTE des cases de l'A*, et le lissage se fait
   * ici, à chaque tick, depuis la position réelle et avec le gabarit : on vise
   * le nœud le plus lointain atteignable en ligne droite, on coupe les angles
   * quand c'est ouvert, on passe de centre en centre quand c'est étroit.
   *
   * L'ancienne version lissait une fois pour toutes entre CENTRES de cases,
   * puis validait un nœud à 17 px de son centre — sans y être entré. L'unité
   * visait alors le nœud suivant depuis une case d'où la ligne droite était
   * bouchée, glissait du mauvais côté, ne progressait pas, recalculait… et
   * retombait sur le même chemin. C'était le « personnage coincé » : jusqu'à
   * cent recalculs pour un seul ordre.
   */
  followPath(dt) {
    if (this.pathPending) return false;
    const path = this.path;
    if (!path || this.pathIndex >= path.length) {
      // Chemin épuisé sans être arrivé : on relance, dans la limite du plafond.
      if (this.destination && dist(this.x, this.y, this.destination.x, this.destination.y) > TILE * 1.2
          && this.repathCooldown <= 0 && this.repathAttempts < MAX_REPATHS) {
        this.repathCooldown = 0.9;
        this.repathAttempts++;
        this.requestPathTo(this.destination.x, this.destination.y);
        return false;
      }
      return true;
    }

    const map = this.world.map;
    const r = this.radius * BODY;
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    const last = path.length - 1;

    // Entrer dans la case d'un nœud intermédiaire le valide — pas le frôler.
    // On prend le plus lointain des nœuds dont on occupe la case : on a pu
    // couper devant. Le DERNIER nœud, lui, se rejoint au centre : un villageois
    // arrêté au bord de la case voisine d'un arbre serait hors de portée.
    for (let j = Math.min(last - 1, this.pathIndex + LOOKAHEAD); j >= this.pathIndex; j--) {
      if (path[j].tx === tx && path[j].ty === ty) { this.pathIndex = j + 1; break; }
    }
    const goalX = path[last].tx * TILE + TILE / 2, goalY = path[last].ty * TILE + TILE / 2;
    const dGoal = Math.hypot(goalX - this.x, goalY - this.y);
    if (dGoal < TILE * 0.3) { this.pathIndex = path.length; return true; }
    // Destination encombrée par des camarades : à portée de bras et sans
    // progrès, on se considère arrivé — c'est ce que fait AoE.
    if (dGoal < TILE * 1.2 && this.stuckTime > 0.6) { this.pathIndex = path.length; return true; }

    // Lissage dynamique : le nœud le plus lointain visible, avec le gabarit.
    // Examen croissant depuis le nœud courant, arrêté au premier nœud caché :
    // un ou deux tests par tick dans le cas courant. Viser un nœud lointain
    // acquiert ceux d'avant — on n'a plus à passer par leurs cases.
    const fin = Math.min(last, this.pathIndex + LOOKAHEAD);
    let target = -1;
    for (let j = this.pathIndex; j <= fin; j++) {
      if (!map.segmentClear(this.x, this.y, path[j].tx * TILE + TILE / 2, path[j].ty * TILE + TILE / 2, r)) break;
      target = j;
    }
    // Rien devant (poussée hors du couloir par ses voisines, ou nœud courant
    // passé de biais) : le couloir est derrière, on y revient.
    if (target < 0) {
      for (let j = this.pathIndex - 1; j >= Math.max(0, this.pathIndex - LOOKAHEAD); j--) {
        if (map.segmentClear(this.x, this.y, path[j].tx * TILE + TILE / 2, path[j].ty * TILE + TILE / 2, r)) { target = j; break; }
      }
    }
    // Rien nulle part : on marche en aveugle vers le nœud courant — les
    // glissements font le reste — et le blocage compte double, pour recalculer
    // vite depuis ici plutôt que de rester planté.
    const aveugle = target < 0;
    if (aveugle) target = Math.min(last, this.pathIndex); else this.pathIndex = target;
    const nodeX = path[target].tx * TILE + TILE / 2;
    const nodeY = path[target].ty * TILE + TILE / 2;
    const dx = nodeX - this.x, dy = nodeY - this.y;
    const d = Math.hypot(dx, dy);
    if (aveugle) this.stuckTime += dt;

    let vx = dx / d, vy = dy / d;
    const sep = this.world.separationForce(this);
    vx += sep.x; vy += sep.y;
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;

    this.facing = Math.atan2(vy, vx);
    const step = this.speedPx() * dt;
    this.tryMove(vx * step, vy * step);

    // Ce qui compte n'est pas de bouger, mais de se RAPPROCHER du point visé :
    // en longeant un obstacle, une unité avance à pleine vitesse tout en
    // s'éloignant de sa cible. Sans progression réelle, on recalcule un chemin
    // depuis la position courante — un nombre borné de fois.
    const after = Math.hypot(nodeX - this.x, nodeY - this.y);
    if (after > d - step * 0.3) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.8 && this.repathCooldown <= 0) {
        this.repathCooldown = 0.8;
        this.stuckTime = 0;
        if (this.repathAttempts >= MAX_REPATHS) { this.pathIndex = path.length; return true; }
        this.repathAttempts++;
        this.requestPathToTile(path[last].tx, path[last].ty, this.state !== STATE.MOVE && this.state !== STATE.ATTACK_MOVE);
      }
    } else if (this.stuckTime > 0) {
      this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    }
    return false;
  }

  /**
   * Déplacement avec contournement des obstacles.
   *
   * L'ancienne version ne gardait que la composante non bloquée du pas : le
   * long d'un mur orienté nord-sud, une unité qui voulait monter n'avançait
   * plus que de la minuscule part est-ouest de son pas — elle rampait. On
   * glisse désormais à pleine vitesse le long de l'obstacle, et on s'en écarte
   * perpendiculairement si les deux axes sont bloqués.
   */
  tryMove(dx, dy) {
    const map = this.world.map;
    const r = this.radius * BODY;
    // Prise dans une case bloquée (bâtiment posé dessus, partie restaurée…) :
    // aucun pas n'y serait permis. On la remet sur la case libre la plus proche.
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (map.isBlocked(tx, ty)) {
      const free = map.findOpenTile(tx, ty, 6);
      if (free) { this.x = free.tx * TILE + TILE / 2; this.y = free.ty * TILE + TILE / 2; }
      return;
    }
    const apply = (ox, oy) => {
      if ((ox === 0 && oy === 0) || !map.canStand(this.x + ox, this.y + oy, r)) return false;
      this.x = clamp(this.x + ox, 2, map.pixelWidth - 2);
      this.y = clamp(this.y + oy, 2, map.pixelHeight - 2);
      return true;
    };

    if (apply(dx, dy)) return;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) return;
    const ux = dx / len, uy = dy / len;

    // Glissement le long de l'axe dominant, puis de l'autre.
    const slides = Math.abs(ux) >= Math.abs(uy)
      ? [[Math.sign(ux) * len, 0], [0, Math.sign(uy) * len]]
      : [[0, Math.sign(uy) * len], [Math.sign(ux) * len, 0]];
    for (const [ox, oy] of slides) if (apply(ox, oy)) return;

    // Coincé dans un angle : on s'écarte perpendiculairement pour le contourner.
    if (apply(-uy * len, ux * len)) return;
    apply(uy * len, -ux * len);
  }
}

// ===========================================================================
// ANIMAUX
// ===========================================================================

/**
 * Un animal : une unité sans camp (playerIndex -1, « la nature ») qui pâture
 * autour d'un point, détale quand on la frappe si elle est sauvage, et laisse
 * une carcasse à récolter (voir World.deposerCarcasse). Un cochon se capture :
 * il devient l'unité du premier joueur qui l'approche, cesse d'errer, se mène
 * comme une unité et s'abat au village. Toute l'aléa passe par le générateur
 * du monde : même graine, mêmes hardes, même pâture.
 */
export class Animal extends Unit {
  constructor(world, type, x, y, playerIndex = -1) {
    super(world, playerIndex, type, x, y);
    this.isAnimal = true;
    this.stance = 'passive';       // ni riposte, ni cible prise d'initiative
    this.home = { x, y };          // centre de pâture
    this.wanderTimer = 1 + world.rng.next() * 4;
    this.fleeTimer = 0;
    this.captureCooldown = 0;
  }

  get sauvage() { return this.playerIndex < 0; }

  speedPx() { return this.def.speed * TILE * (this.fleeTimer > 0 ? 1.6 : 1); }

  takeDamage(amount, source) {
    super.takeDamage(amount, source);
    // Frappé, un animal sauvage détale — quelques cases, puis il s'arrête :
    // le chasseur le rattrape à l'arrêt, comme dans AoE.
    if (!this.dead && this.def.sauvage && this.sauvage && source) this.fuir(source, 4);
  }

  update(dt) {
    if (this.dead) return;
    if (this.repathCooldown > 0) this.repathCooldown -= dt;
    if (this.fleeTimer > 0) this.fleeTimer -= dt;
    if (this.captureCooldown > 0) this.captureCooldown -= dt;
    if (this.state === STATE.IDLE) {
      const sep = this.world.separationForce(this);
      if (sep.x !== 0 || sep.y !== 0) this.tryMove(sep.x * 14 * dt, sep.y * 14 * dt);
    }
    if (this.state === STATE.MOVE) {
      if (this.followPath(dt)) { this.state = STATE.IDLE; this.destination = null; this.repathAttempts = 0; }
    } else if (this.state !== STATE.IDLE) {
      // Un animal ne connaît que l'arrêt et la marche.
      this.state = STATE.IDLE; this.target = null; this.path = null;
    }
    if (!this.sauvage) return;     // capturé : il attend les ordres de son maître
    if (this.def.capturable && this.captureCooldown <= 0) {
      this.captureCooldown = 0.5;
      const maitre = this.world.unitePres(this, TILE * 1.6);
      if (maitre) { this.capturer(maitre.playerIndex); return; }
    }
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 && this.state === STATE.IDLE) {
      this.wanderTimer = 4 + this.world.rng.next() * 7;
      this.brouter();
    }
  }

  /** Un pas de pâture : un point à portée du centre de la harde. */
  brouter() {
    const rng = this.world.rng;
    const a = rng.next() * Math.PI * 2, r = (0.4 + rng.next() * 0.6) * (this.def.patureCases || 2) * TILE;
    this.allerVers(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  fuir(menace, cases) {
    const dx = this.x - menace.x, dy = this.y - menace.y;
    const n = Math.hypot(dx, dy) || 1;
    this.fleeTimer = 1.5;
    this.wanderTimer = 3 + this.world.rng.next() * 3;
    const x = this.x + (dx / n) * cases * TILE, y = this.y + (dy / n) * cases * TILE;
    this.home = { x, y };          // la harde ne revient pas sous le couteau
    this.allerVers(x, y);
  }

  allerVers(x, y) {
    const map = this.world.map;
    const tx = Math.max(0, Math.min(map.w - 1, Math.floor(x / TILE)));
    const ty = Math.max(0, Math.min(map.h - 1, Math.floor(y / TILE)));
    const libre = map.isOpenTile(tx, ty) ? { tx, ty } : map.findFreeTile(tx, ty, 3);
    if (!libre) return;
    this.destination = { x: libre.tx * TILE + TILE / 2, y: libre.ty * TILE + TILE / 2 };
    this.state = STATE.MOVE;
    this.repathAttempts = 0;
    this.requestPathTo(this.destination.x, this.destination.y);
  }

  /** Le cochon change de camp : il cesse d'errer et se mène comme une unité. */
  capturer(playerIndex) {
    if (playerIndex < 0 || playerIndex === this.playerIndex) return;
    this.playerIndex = playerIndex;
    this.state = STATE.IDLE; this.path = null; this.destination = null;
    this.world.onAnimalCaptured(this);
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
    this.garrison = [];          // unités à l'abri à l'intérieur
    this.activeBuilders = 0;     // bâtisseurs présents ce tick
    this.builderCount = 0;       // relevé du tick précédent (rendement)
    this.assignedBuilders = 0;   // ouvriers affectés, y compris en chemin
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

  /**
   * Rendement décroissant des bâtisseurs, comme dans AoE : deux ouvriers vont
   * plus vite qu'un, mais pas deux fois plus.
   */
  buildEfficiency() {
    const n = Math.max(1, this.builderCount);
    return Math.pow(n, BUILDER_EXPONENT) / n;
  }

  addBuildProgress(dt) {
    if (this.complete) return;
    this.unreachable = false;
    this.buildProgress += dt * this.buildEfficiency();
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

  // --- Garnison ---------------------------------------------------------

  canGarrison(unit) {
    const g = this.def.garrison;
    if (!g || !this.complete || this.dead || !unit || unit.dead) return false;
    if (unit.playerIndex !== this.playerIndex) return false;
    if (this.garrison.length >= g.capacity) return false;
    return g.classes.includes(unit.def.class);
  }

  addToGarrison(unit) {
    if (!this.canGarrison(unit)) return false;
    this.garrison.push(unit);
    unit.enterGarrison(this);
    return true;
  }

  releaseGarrison() {
    const released = this.garrison.slice();
    this.garrison.length = 0;
    for (const unit of released) unit.leaveGarrison();
    return released;
  }

  /** Nombre de flèches par salve : une de base, plus une par occupant. */
  arrowCount() {
    if (!this.def.attack) return 0;
    const base = this.def.garrisonOnly ? 0 : 1;
    const g = this.def.garrison;
    const extra = g && g.arrows ? Math.min(this.garrison.length, 5) : 0;
    return base + extra;
  }

  update(dt) {
    if (this.dead || !this.complete) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.healGarrison(dt);
    this.updateProduction(dt);
    if (this.def.attack) this.updateDefense(dt);
  }

  healGarrison(dt) {
    const g = this.def.garrison;
    if (!g || !g.heal || this.garrison.length === 0) return;
    for (const unit of this.garrison) {
      if (unit.hp < unit.maxHp) unit.hp = Math.min(unit.maxHp, unit.hp + g.heal * dt);
    }
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
    if (this.arrowCount() <= 0) { this.target = null; return; }
    if (this.target && (this.target.dead || this.target.garrisonedIn
        || this.target.edgeDistanceTo(this.x, this.y) > this.rangePx() + TILE)) {
      this.target = null;
    }
    if (!this.target) {
      this.scanCooldown -= dt;
      if (this.scanCooldown > 0) return;
      this.scanCooldown = 0.4;
      this.target = this.world.findEnemyNear(this, this.rangePx());
    }
    if (this.target && this.attackCooldown <= 0) {
      const arrows = this.arrowCount();
      if (arrows <= 0) return;         // bâtiment vide : il n'y a personne pour tirer
      this.attackCooldown = this.def.attackSpeed;
      for (let i = 0; i < arrows; i++) this.world.performAttack(this, this.target);
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
