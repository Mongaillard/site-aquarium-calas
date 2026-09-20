// ---------------------------------------------------------------------------
// IA adverse : une machine à états simple mais crédible.
//   1. économie   : produire des villageois, les répartir sur les ressources
//   2. bâtiments  : maisons, dépôts, casernes, fermes, passage d'âge
//   3. militaire  : composition d'armée, défense de la base, vagues d'attaque
// ---------------------------------------------------------------------------

import { TILE, BUILDING_TYPES, UNIT_TYPES, POP_MAX, AGES } from './config.js';
import { dist2, canAfford, RNG } from './utils.js';
import { STATE, villagerTask } from './entities.js';

const JOB_RATIOS = [
  { food: 0.45, wood: 0.40, gold: 0.15 }, // Âge Sombre
  { food: 0.40, wood: 0.35, gold: 0.25 }, // Âge Féodal
  { food: 0.38, wood: 0.32, gold: 0.30 }, // Âge des Châteaux
];

const ARMY_COMPOSITION = [
  ['militia'],
  ['archer', 'spearman', 'archer'],
  ['knight', 'archer', 'knight', 'ram'],
];

export class AIPlayer {
  constructor(world, playerIndex, difficulty) {
    this.world = world;
    this.index = playerIndex;
    this.difficulty = difficulty;
    // Générateur dédié, dérivé de la graine de la partie : l'IA reste
    // imprévisible d'une partie à l'autre, mais rejouable à l'identique.
    this.rng = new RNG((world.seed || 1) + 7919 * (playerIndex + 1));
    this.timer = 1 + this.rng.next();
    this.attackTimer = difficulty.attackDelay * 0.35;
    this.armyTarget = difficulty.armyTrigger;
    this.waveCount = 0;
    this.defendUntil = 0;
    this.lastHouseAt = -99;
    this.compositionIndex = 0;
    this.badSpots = new Set();   // emplacements où un chantier s'est révélé inaccessible
  }

  get player() { return this.world.players[this.index]; }

  update(dt) {
    if (this.player.defeated || this.world.gameOver) return;
    this.timer -= dt;
    this.attackTimer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.7;

    this.survey();
    if (!this.townCenter && !this.tryRebuildTownCenter()) {
      this.lastStand();
      return;
    }
    this.manageEconomy();
    this.manageConstruction();
    this.manageResearch();
    this.manageMilitary();
  }

  /** Photographie de l'état courant, refaite à chaque réflexion. */
  survey() {
    const world = this.world;
    this.buildings = world.buildings.filter((b) => !b.dead && b.playerIndex === this.index);
    this.units = world.units.filter((u) => !u.dead && u.playerIndex === this.index);
    this.villagers = this.units.filter((u) => u.isVillager);
    this.army = this.units.filter((u) => !u.isVillager);
    this.townCenter = this.buildings.find((b) => b.type === 'towncenter' && b.complete)
      || this.buildings.find((b) => b.type === 'towncenter');
    this.completed = this.buildings.filter((b) => b.complete);
    this.counts = {};
    for (const b of this.buildings) this.counts[b.type] = (this.counts[b.type] || 0) + 1;

    const player = this.player;
    const nextAge = AGES[player.age + 1];
    this.ageTarget = null;
    this.savingForAge = false;
    if (nextAge && this.townCenter && this.townCenter.complete && !player.ageProgress) {
      const needed = player.age === 0
        ? Math.min(11, this.difficulty.maxVillagers - 2)
        : Math.min(16, this.difficulty.maxVillagers);
      if (this.villagers.length >= needed) {
        this.ageTarget = nextAge;
        // Une fois la moitié du coût réunie, on met l'économie en réserve.
        this.savingForAge = Object.keys(nextAge.cost)
          .every((k) => player.resources[k] >= nextAge.cost[k] * 0.5);
      }
    }
  }

  has(type, min = 1) { return (this.counts[type] || 0) >= min; }

  // --- Économie -------------------------------------------------------------

  manageEconomy() {
    const player = this.player;
    const tc = this.townCenter;

    // Production continue de villageois.
    if (tc && tc.complete && this.villagers.length < this.difficulty.maxVillagers
        && tc.queue.length < 2 && player.pop < player.popCap && !this.savingForAge) {
      this.world.trainUnit(tc, 'villager');
    }

    // Répartition : on vise des proportions par ressource selon l'âge.
    const ratios = JOB_RATIOS[Math.min(player.age, JOB_RATIOS.length - 1)];
    const jobs = { food: 0, wood: 0, gold: 0 };
    const idle = [];
    const now = this.world.time;
    for (const v of this.villagers) {
      if (v.fleeUntil > now) continue;          // en train de se mettre à l'abri
      const job = this.jobOf(v);
      if (job) jobs[job]++;
      else idle.push(v);
    }
    // Le total de référence exclut les bâtisseurs : sinon les quotas dérivent
    // et plus personne ne va à l'or dès qu'un chantier est ouvert.
    const workforce = Math.max(1, jobs.food + jobs.wood + jobs.gold + idle.length);
    for (const v of idle) {
      const want = this.mostNeeded(jobs, ratios, workforce);
      if (this.assignJob(v, want)) jobs[want]++;
    }

    // Rééquilibrage doux : un villageois change de métier si un besoin est criant.
    if (idle.length === 0 && this.villagers.length >= 6) {
      const want = this.mostNeeded(jobs, ratios, workforce);
      const surplus = Object.keys(jobs)
        .reduce((a, b) => (jobs[a] - ratios[a] * workforce > jobs[b] - ratios[b] * workforce ? a : b));
      if (surplus !== want && jobs[surplus] - ratios[surplus] * workforce > 0.9) {
        const mover = this.villagers.find((v) => this.jobOf(v) === surplus && v.carry.amount < 1);
        if (mover) this.assignJob(mover, want);
      }
    }
  }

  jobOf(v) {
    const task = villagerTask(v);
    return task === 'idle' || task === 'move' ? null : task;
  }

  mostNeeded(jobs, ratios, total) {
    const res = this.player.resources;
    let best = 'food', bestScore = -Infinity;
    for (const type of ['food', 'wood', 'gold']) {
      let score = ratios[type] * total - jobs[type];
      if (res[type] < 120) score += 1.2;         // pénurie : on renforce
      if (res[type] > 700) score -= 1.5;         // stock pléthorique : on lève le pied
      if (score > bestScore) { bestScore = score; best = type; }
    }
    return best;
  }

  /**
   * Envoie un villageois sur la ressource demandée. Si elle a disparu des
   * environs, on se rabat sur une autre plutôt que de le laisser bras ballants.
   */
  assignJob(villager, type) {
    const world = this.world;
    const from = this.townCenter || villager;
    const order = [type, ...['food', 'wood', 'gold'].filter((t) => t !== type)];
    for (const candidate of order) {
      const target = world.findNearestResource(villager.x, villager.y, candidate, 26 * TILE, this.index)
        || world.findNearestResource(from.x, from.y, candidate, 45 * TILE, this.index);
      if (!target) {
        if (candidate === 'food') this.wantFarm = true;
        continue;
      }
      if (target.kind === 'building') villager.gatherFarm(target);
      else villager.gatherAt(target.tx, target.ty);
      return candidate === type;
    }
    return false;
  }

  // --- Construction ---------------------------------------------------------

  manageConstruction() {
    const player = this.player;
    // Le passage d'âge se décide en premier : le tester après la gestion des
    // chantiers revenait à ne jamais l'atteindre tant que deux fermes étaient
    // en cours de replantation.
    const tc = this.townCenter;
    if (tc && this.ageTarget && this.world.canAdvanceAge(tc).ok) this.world.advanceAge(tc);

    // Un chantier qu'aucun villageois ne peut rejoindre est annulé (et remboursé).
    for (const site of this.buildings.filter((b) => !b.complete && b.unreachable)) {
      this.badSpots.add(site.tx + ',' + site.ty);
      this.world.cancelConstruction(site);
    }
    const inProgress = this.buildings.filter((b) => !b.complete && !b.dead);
    if (inProgress.length >= 2) { this.assignBuilders(inProgress); return; }

    const plan = this.nextBuilding();
    if (plan && canAfford(player.resources, BUILDING_TYPES[plan].cost)) {
      const spot = this.findSpot(plan);
      if (spot) {
        const site = this.world.placeBuilding(this.index, plan, spot.tx, spot.ty, []);
        if (site) {
          const builders = this.pickBuilders(site, plan === 'towncenter' ? 3 : 2);
          for (const b of builders) b.buildAt(site);
        }
      }
    }
    this.assignBuilders(this.buildings.filter((b) => !b.complete));
  }

  /** Ordre de construction, réévalué à chaque cycle selon les besoins. */
  nextBuilding() {
    const player = this.player;
    const popRoom = player.popCap - player.pop;
    if (popRoom <= 3 && player.popCap < POP_MAX) return 'house';
    if (!this.has('lumbercamp') && this.villagers.length >= 4) return 'lumbercamp';
    if (!this.has('mill') && this.villagers.length >= 6) return 'mill';
    if (!this.has('barracks') && this.villagers.length >= 8) return 'barracks';
    if (!this.has('miningcamp') && this.villagers.length >= 9) return 'miningcamp';
    // Les fermes stabilisent la nourriture bien avant l'Âge Féodal : les
    // buissons s'épuisent et les villageois marchent de plus en plus loin.
    // On en veut d'autant plus qu'on a des bras et du bois qui dort.
    const farmTarget = Math.min(8, Math.floor(this.villagers.length / 4)
      + (player.resources.wood > 400 ? 2 : 0));
    if (this.has('mill') && this.villagers.length >= 10 && this.countFarms() < farmTarget) return 'farm';

    if (player.age >= 1) {
      if (!this.has('archery')) return 'archery';
      if (!this.has('stable')) return 'stable';
      if (!this.has('blacksmith')) return 'blacksmith';
      if (this.countFarms() < 4 && this.has('mill')) return 'farm';
      if (!this.has('tower') && this.villagers.length >= 14) return 'tower';
    }
    if (player.age >= 2) {
      if (!this.has('siege')) return 'siege';
      if (this.countFarms() < 8) return 'farm';
      if (!this.has('towncenter', 2) && player.resources.wood > 400) return 'towncenter';
      if (!this.has('tower', 2)) return 'tower';
    }
    if (this.wantFarm && this.has('mill') && this.countFarms() < 10) { this.wantFarm = false; return 'farm'; }
    // Maison d'avance seulement quand la marge de population se réduit :
    // sinon l'IA couvre la carte de maisons inutiles.
    if (popRoom <= 7 && player.resources.wood > 250 && player.popCap < POP_MAX) return 'house';
    return null;
  }

  countFarms() { return this.counts.farm || 0; }

  pickBuilders(site, count) {
    const candidates = this.villagers
      .filter((v) => v.state !== STATE.BUILD && v.carry.amount < v.carryCapacity() * 0.8)
      .sort((a, b) => dist2(a.x, a.y, site.x, site.y) - dist2(b.x, b.y, site.x, site.y));
    return candidates.slice(0, count);
  }

  assignBuilders(sites) {
    for (const site of sites) {
      const workers = this.villagers.filter((v) => v.state === STATE.BUILD && v.target === site);
      const wanted = site.type === 'farm' ? 1 : 2;
      if (workers.length >= wanted) continue;
      for (const b of this.pickBuilders(site, wanted - workers.length)) b.buildAt(site);
    }
  }

  /** Cherche un emplacement : près des ressources pour les dépôts, près de la base sinon. */
  findSpot(type) {
    const def = BUILDING_TYPES[type];
    const tc = this.townCenter;
    if (!tc) return null;
    let anchorX = tc.x, anchorY = tc.y;
    let minR = 2, maxR = 13;

    const resourceFor = { lumbercamp: 'wood', miningcamp: 'gold' }[type];
    if (resourceFor) {
      const res = this.world.findNearestResource(tc.x, tc.y, resourceFor, 32 * TILE, this.index);
      if (res && res.tx !== undefined) { anchorX = res.tx * TILE; anchorY = res.ty * TILE; minR = 1; maxR = 5; }
    }
    if (type === 'tower') { minR = 5; maxR = 10; }

    const ax = Math.floor(anchorX / TILE), ay = Math.floor(anchorY / TILE);
    for (let r = minR; r <= maxR; r++) {
      const candidates = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          candidates.push({ tx: ax + dx, ty: ay + dy });
        }
      }
      // Un peu d'aléatoire : la base ne pousse pas toujours dans la même direction.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng.next() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const c of candidates) {
        if (this.badSpots.has(c.tx + ',' + c.ty)) continue;
        if (!this.world.canPlace(this.index, type, c.tx, c.ty, true)) continue;
        if (!this.hasRoomAround(c.tx, c.ty, def.size)) continue;
        return c;
      }
    }
    return null;
  }

  /** Évite de se murer : on exige une couronne majoritairement libre autour. */
  hasRoomAround(tx, ty, size) {
    const map = this.world.map;
    let free = 0, total = 0;
    for (let y = ty - 1; y <= ty + size; y++) {
      for (let x = tx - 1; x <= tx + size; x++) {
        if (x >= tx && x < tx + size && y >= ty && y < ty + size) continue;
        total++;
        if (map.inBounds(x, y) && !map.isBlocked(x, y)) free++;
      }
    }
    return total === 0 || free / total >= 0.55;
  }

  // --- Technologies ---------------------------------------------------------

  manageResearch() {
    const player = this.player;
    const tc = this.townCenter;
    if (tc && tc.complete && player.age >= 1 && !player.techs.has('wheelbarrow')
        && player.resources.food > 350 && this.world.canResearch(tc, 'wheelbarrow').ok) {
      this.world.researchTech(tc, 'wheelbarrow');
    }
    const forge = this.completed.find((b) => b.type === 'blacksmith');
    if (!forge || forge.queue.length > 0) return;
    for (const tech of ['forging', 'fletching', 'scaleArmor']) {
      if (player.techs.has(tech)) continue;
      if (this.world.canResearch(forge, tech).ok && player.resources.food > 250) {
        this.world.researchTech(forge, tech);
        break;
      }
    }
  }

  // --- Militaire ------------------------------------------------------------

  manageMilitary() {
    const player = this.player;
    const roster = ARMY_COMPOSITION[Math.min(player.age, ARMY_COMPOSITION.length - 1)];

    // Production militaire dans tous les bâtiments disponibles.
    for (const b of this.completed) {
      if (!b.def.trains || b.type === 'towncenter') continue;
      if (b.queue.length >= 2) continue;
      if (player.pop >= player.popCap) break;
      const options = b.def.trains.filter((t) => roster.includes(t) && UNIT_TYPES[t].age <= player.age);
      if (options.length === 0) continue;
      const pick = options[this.compositionIndex % options.length];
      this.compositionIndex++;
      // On garde une réserve de ressources pour l'économie au début.
      const reserve = player.age === 0 ? 120 : 60;
      const def = UNIT_TYPES[pick];
      // On s'autorise une garnison minimale, puis on met de côté le coût de
      // l'âge suivant : sans cette réserve l'armée mange tous les revenus et
      // l'IA reste bloquée au premier âge. Le plancher monte lentement avec le
      // temps, et la réserve saute net si la base est attaquée.
      const underThreat = this.world.time < this.defendUntil;
      const armyFloor = 3 + player.age * 3 + Math.floor(this.world.time / 420);
      // Hystérésis : une fois la moitié du coût réunie, on garde le cap même si
      // un soldat tombe. Sinon l'IA redépense sa cagnotte à deux doigts du but.
      const saving = !underThreat && this.ageTarget
        && (this.savingForAge || this.army.length >= armyFloor)
        ? this.ageTarget.cost : null;
      const affordable = Object.keys(def.cost).every((k) => {
        const keep = (k === 'wood' ? reserve : 0) + (saving && saving[k] ? saving[k] : 0);
        return player.resources[k] >= def.cost[k] + keep;
      });
      if (affordable) this.world.trainUnit(b, pick);
    }

    const threat = this.findThreat();
    if (threat) {
      this.defendUntil = this.world.time + 8;
      for (const u of this.army) {
        if (u.state === STATE.IDLE || u.state === STATE.MOVE || !u.target) u.attackEntity(threat);
      }
      // Les villageois vraiment menacés se réfugient — une seule fois, et
      // pour quelques secondes : les renvoyer au Centre-Ville à chaque cycle
      // reviendrait à saborder sa propre économie.
      const now = this.world.time;
      if (this.townCenter) {
        for (const v of this.villagers) {
          if (v.fleeUntil > now) continue;
          if (dist2(v.x, v.y, threat.x, threat.y) > (TILE * 3.5) ** 2) continue;
          v.fleeUntil = now + 6;
          v.moveTo(this.townCenter.x, this.townCenter.y + TILE * 2.5);
        }
      }
      return;
    }

    if (this.world.time < this.defendUntil) return;

    // Vague d'attaque quand l'armée est assez fournie.
    if (this.attackTimer <= 0 && this.army.length >= this.armyTarget) {
      const target = this.pickAttackTarget();
      if (target) {
        this.waveCount++;
        this.armyTarget = Math.min(24, this.difficulty.armyTrigger + this.waveCount * this.difficulty.armyStep);
        this.attackTimer = this.difficulty.attackDelay * 0.25 + 20;
        this.world.formationMove(this.army, target.x, target.y, true);
      }
    } else if (this.army.length > 0) {
      // Regroupement défensif autour du Centre-Ville.
      const tc = this.townCenter;
      if (!tc) return;
      for (const u of this.army) {
        if (u.state !== STATE.IDLE) continue;
        if (dist2(u.x, u.y, tc.x, tc.y) > (TILE * 11) ** 2) {
          u.moveTo(tc.x + (this.rng.next() - 0.5) * TILE * 6,
            tc.y + TILE * 4 + (this.rng.next() - 0.5) * TILE * 4, true);
        }
      }
    }
  }

  /** Ennemi présent dans la base ? (réaction plus ou moins rapide selon la difficulté) */
  findThreat() {
    const world = this.world;
    let best = null, bestD = Infinity;
    for (const e of world.entities) {
      if (e.dead || e.playerIndex === this.index) continue;
      if (e.kind === 'building') continue;
      for (const b of this.buildings) {
        const d = dist2(e.x, e.y, b.x, b.y);
        if (d < (TILE * 13) ** 2 && d < bestD) { bestD = d; best = e; }
      }
    }
    return best;
  }

  pickAttackTarget() {
    const world = this.world;
    const enemyIndex = this.index === 0 ? 1 : 0;
    const tc = this.townCenter;
    const targets = world.buildings.filter((b) => !b.dead && b.playerIndex === enemyIndex);
    if (targets.length === 0) {
      const units = world.units.filter((u) => !u.dead && u.playerIndex === enemyIndex);
      return units[0] || null;
    }
    // On vise en priorité ce qui produit, puis ce qui est proche.
    const priority = { towncenter: 0.6, barracks: 0.8, archery: 0.8, stable: 0.8, siege: 0.8 };
    let best = null, bestScore = Infinity;
    for (const b of targets) {
      const d = tc ? dist2(tc.x, tc.y, b.x, b.y) : 0;
      const score = d * (priority[b.type] || 1);
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  tryRebuildTownCenter() {
    const player = this.player;
    if (this.villagers.length === 0) return false;
    if (!canAfford(player.resources, BUILDING_TYPES.towncenter.cost)) return false;
    const v = this.villagers[0];
    const spot = this.findSpotNear(v, 'towncenter');
    if (!spot) return false;
    const site = this.world.placeBuilding(this.index, 'towncenter', spot.tx, spot.ty, this.villagers.slice(0, 3));
    return !!site;
  }

  findSpotNear(entity, type) {
    const ax = Math.floor(entity.x / TILE), ay = Math.floor(entity.y / TILE);
    for (let r = 2; r <= 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.world.canPlace(this.index, type, ax + dx, ay + dy, true)) return { tx: ax + dx, ty: ay + dy };
        }
      }
    }
    return null;
  }

  /** Plus de base : tout le monde au combat. */
  lastStand() {
    const enemyIndex = this.index === 0 ? 1 : 0;
    const target = this.world.entities.find((e) => !e.dead && e.playerIndex === enemyIndex);
    if (!target) return;
    for (const u of this.units) if (u.state === STATE.IDLE) u.attackEntity(target);
  }
}
