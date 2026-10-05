// ---------------------------------------------------------------------------
// IA adverse : une machine à états simple mais crédible.
//   1. économie   : produire des villageois, les répartir sur les ressources
//   2. bâtiments  : maisons, dépôts, casernes, fermes, passage d'âge
//   3. militaire  : composition d'armée, défense de la base, vagues d'attaque
// ---------------------------------------------------------------------------

import { TILE, BUILDING_TYPES, UNIT_TYPES, AGES, nomDe, ficheDe } from './config.js';
import { dist2, canAfford, RNG } from './utils.js';
import { STATE, villagerTask, computeDamage } from './entities.js';
import { BLOCK } from './map.js';

const JOB_RATIOS = [
  { food: 0.45, wood: 0.40, gold: 0.15 }, // Âge Sombre
  { food: 0.40, wood: 0.35, gold: 0.25 }, // Âge Féodal
  { food: 0.38, wood: 0.32, gold: 0.30 }, // Âge des Châteaux
];

const ARMY_COMPOSITION = [
  ['militia'],
  ['archer', 'spearman', 'archer'],
  // Âge des Châteaux : la caserne reprend du service (Champion), l'atelier alterne
  // bélier et catapulte, le Temple donne deux Prêtresses puis des Hydres.
  ['knight', 'archer', 'crossbowman', 'horseArcher', 'champion', 'knight', 'ram', 'catapult', 'priest', 'hydra'],
];
/** Au-delà, une soigneuse de plus ne sert à rien : elles ne se battent pas. */
const PRETRESSES_MAX = 2;
/**
 * Les unités chères ne sortent jamais si les fantassins boivent l'or au fur et
 * à mesure : l'IA en « commande » une à la fois et met son prix de côté. Tant
 * qu'elle n'a pas autant d'Hydres, puis autant d'engins de siège.
 */
const HYDRES_VOULUES = 2;
const ENGINS_VOULUS = 2;
/** Au-delà de ce rayon autour du Centre-Ville (en cases), une troupe est en campagne, plus au camp. */
const CAMP = 16;
/**
 * Une alerte sans combat ne dure pas (voir alerteFondee) : après tant de
 * secondes sans un coup porté ni reçu dans la base, elle est levée pour tant
 * de secondes.
 */
const ALERTE_CALME = 45;
const ALERTE_REPIT = 120;
/**
 * L'assaut d'un bâtiment ennemi qui tire sur la base (voir assiegerBatimentArme) :
 * la marge exigée sur les dégâts promis avant de partir, sa durée au plus (en
 * secondes), et combien on en donne par bâtiment et par âge — vagues lancées
 * sur lui comprises.
 */
const ASSAUT_MARGE = 1.15;
const ASSAUT_DUREE = 120;
const ASSAUT_MARCHE = 30;   // dont le trajet du camp jusqu'au pied du mur
const ASSAUT_LONG = 240;    // sa durée au plus quand le bâtiment est occupé ailleurs (voir occupeEncore)
const ASSAUTS_MAX = 3;
/**
 * Autour d'un bâtiment ennemi qui tire près de la base (voir releverZones), en
 * cases au-delà de sa portée : à moins de ZONE_BATTUE on est sous ses flèches ;
 * à moins de ZONE_EVITEE on ne prend ni poste ni chantier, et les chemins font
 * le tour (la marge couvre les angles que coupe une unité en marche).
 */
const ZONE_BATTUE = 1.5;
const ZONE_EVITEE = 3;

export class AIPlayer {
  constructor(world, playerIndex, difficulty) {
    this.world = world;
    this.index = playerIndex;
    this.difficulty = difficulty;
    // Générateur dédié, dérivé de la graine de la partie : l'IA reste
    // imprévisible d'une partie à l'autre, mais rejouable à l'identique.
    this.rng = new RNG((world.seed || 1) + 7919 * (playerIndex + 1));
    this.timer = 1 + this.rng.next();
    // Format de partie : en Express, une horloge d'attaque calée sur une partie
    // de trente minutes ne se déclencherait jamais.
    this.rush = (world.mode && world.mode.aiRush) || 1;
    this.attackTimer = difficulty.attackDelay * 0.35 * this.rush;
    this.armyTarget = Math.max(3, Math.round(difficulty.armyTrigger * this.rush));
    this.waveCount = 0;
    // Trêve du niveau Facile : aucune vague avant cette heure de jeu, et le
    // joueur prévenu une minute avant, une seule fois (voir annoncerAttaque).
    this.treve = (difficulty.treve && difficulty.treve[world.modeId]) || 0;
    this.annonceFaite = false;
    this.defendUntil = 0;
    this.alerteDepuis = 0;       // début de l'alerte en cours
    this.repit = 0;              // alerte levée faute de combat, jusqu'à cette heure
    this.intrus = [];            // troupes ennemies dans la base (voir findThreat)
    // Bâtiment ennemi qui tire sur la base : l'assaut en cours ({ cible, fin })
    // et ceux déjà donnés à cet âge, par bâtiment (voir assiegerBatimentArme).
    this.assaut = null;
    this.assauts = {};
    this.assautsAge = 0;
    // Bâtiments ennemis qui tirent près de la base : { id, x, y, portee } (voir releverZones).
    this.zones = [];
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

    this.annoncerAttaque();
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
    this.units = world.units.filter((u) => !u.dead && !u.isAnimal && u.playerIndex === this.index);
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
    this.releverZones();
  }

  /**
   * Les bâtiments ennemis qui tirent près de la base — une tour, un
   * Centre-Ville occupé — : à moins de treize cases d'un de ses bâtiments, ou
   * avec un de ses ouvriers à portée. Relevés une fois, ils le restent tant
   * qu'ils tiennent debout et qu'ils tirent. Autour de chacun, ses unités
   * évitent le terrain : le relevé par case est posé sur le joueur
   * (zoneEvitee), où le monde le consulte pour les chemins, les gisements et
   * les dépôts ; ici, pour les chantiers, les fermes et le camp. Avant, hors
   * alerte, les ouvriers retournaient un par un sous la tour — quarante-sept
   * morts dans une partie, plus de nourriture, et jamais de quoi donner
   * l'assaut — et les soldats au repos s'y faisaient abattre sans bouger.
   * Les défenses que l'adversaire a chez lui n'en sont pas (voir chezLui) :
   * là-bas, ses troupes doivent s'en prendre d'elles-mêmes à ce qu'elles
   * trouvent, tours comprises — sinon elles ne raseraient plus rien.
   */
  releverZones() {
    const zones = [];
    for (const b of this.world.buildings) {
      if (b.dead || b.playerIndex === this.index || !b.complete || b.arrowCount() <= 0) continue;
      const portee = b.rangePx();
      if (!this.zones.some((z) => z.id === b.id)) {
        if (this.chezLui(b)) continue;
        // La même mesure que le tir du bâtiment (voir World.findEnemyNear).
        const vise = (e) => Math.max(b.edgeDistanceTo(e.x, e.y), e.edgeDistanceTo(b.x, b.y)) <= portee;
        if (!this.presDeLaBase(b) && !this.villagers.some((v) => !v.garrisonedIn && vise(v))) continue;
      }
      zones.push({ id: b.id, x: b.x, y: b.y, portee });
    }
    const change = zones.length !== this.zones.length
      || zones.some((z, i) => z.id !== this.zones[i].id || z.portee !== this.zones[i].portee);
    this.zones = zones;
    if (change) this.poserZones();
  }

  /** Dans la base : à moins de treize cases d'un de ses bâtiments (la mesure de findThreat) ? */
  presDeLaBase(e) {
    return this.buildings.some((m) => dist2(m.x, m.y, e.x, e.y) < (TILE * 13) ** 2);
  }

  /**
   * Ce bâtiment ennemi est-il chez son propriétaire : plus près d'un de ses
   * Centres-Villes que du sien ? (Sans Centre-Ville à soi, tout est chez lui.)
   */
  chezLui(b) {
    const tc = this.townCenter;
    if (!tc) return true;
    const d = dist2(b.x, b.y, tc.x, tc.y);
    return this.world.buildings.some((m) => !m.dead && m.type === 'towncenter'
      && m.playerIndex === b.playerIndex && dist2(b.x, b.y, m.x, m.y) < d);
  }

  /** Pose sur le joueur le relevé par case des zones (voir releverZones) : 2 sous les flèches, 1 à éviter. */
  poserZones() {
    if (this.zones.length === 0) { this.player.zoneEvitee = null; return; }
    const map = this.world.map;
    const cases = new Uint8Array(map.w * map.h);
    for (const z of this.zones) {
      const large = z.portee + ZONE_EVITEE * TILE, court = z.portee + ZONE_BATTUE * TILE;
      const x0 = Math.max(0, Math.floor((z.x - large) / TILE)), x1 = Math.min(map.w - 1, Math.floor((z.x + large) / TILE));
      const y0 = Math.max(0, Math.floor((z.y - large) / TILE)), y1 = Math.min(map.h - 1, Math.floor((z.y + large) / TILE));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const d = dist2(tx * TILE + TILE / 2, ty * TILE + TILE / 2, z.x, z.y);
          if (d > large * large) continue;
          const i = map.idx(tx, ty);
          cases[i] = Math.max(cases[i], d <= court * court ? 2 : 1);
        }
      }
    }
    this.player.zoneEvitee = cases;
  }

  /** Ce point est-il dans une zone à éviter (1), sous les flèches (2) ? 0 sinon. */
  niveauZone(x, y) {
    const cases = this.player.zoneEvitee;
    if (!cases) return 0;
    const map = this.world.map;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return map.inBounds(tx, ty) ? cases[map.idx(tx, ty)] : 0;
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

    if (this.zones.length > 0) this.quitterZones();

    // Répartition : on vise des proportions par ressource selon l'âge.
    const ratios = JOB_RATIOS[Math.min(player.age, JOB_RATIOS.length - 1)];
    const jobs = { food: 0, wood: 0, gold: 0 };
    const idle = [];
    const now = this.world.time;
    for (const v of this.villagers) {
      // En train de se mettre à l'abri, ou déjà dedans : pas disponible.
      if (v.fleeUntil > now || v.garrisonedIn) continue;
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

  /**
   * Les ouvriers dont le poste — gisement, ferme — est pris dans une zone à
   * éviter (voir releverZones) en changent ; celui qui porte son chargement à
   * un dépôt battu le porte ailleurs, s'il en reste un autre. De même celui
   * dont le chemin passerait sous les flèches pour atteindre un poste situé
   * de l'autre côté : ce gisement-là (cette ferme, ce dépôt) est tenu pour
   * injoignable, comme s'il était enclavé, et il va ailleurs.
   */
  quitterZones() {
    const world = this.world, now = world.time;
    for (const v of this.villagers) {
      if (v.garrisonedIn || v.fleeUntil > now || v.state === STATE.GARRISON) continue;
      const job = v.pendingJob;
      const tile = v.resourceTile || (job && job.kind === 'tile' ? job : null);
      const farm = v.target && v.target.type === 'farm' ? v.target : (job && job.kind === 'farm' ? job.farm : null);
      const poste = tile ? { x: tile.tx * TILE + TILE / 2, y: tile.ty * TILE + TILE / 2 } : farm;
      const autreDepot = (exclus) => {
        const autre = v.returnTo && world.findNearestDropoff(v, v.carry.type, exclus);
        return autre && autre !== v.returnTo ? autre : null;
      };
      if (poste && this.niveauZone(poste.x, poste.y) > 0) {
        this.assignJob(v, this.jobOf(v) || 'food');
      } else if (v.state === STATE.RETURN && v.returnTo && world.batimentBattu(v.returnTo)) {
        if (autreDepot(v.failedDropoffs)) v.startReturn();
      } else if (this.traverseZone(v)) {
        if (v.state === STATE.RETURN) {
          const exclus = new Set(v.failedDropoffs || []).add(v.returnTo.id);
          if (autreDepot(exclus)) { v.failedDropoffs = exclus; v.startReturn(); }
        } else if (v.state === STATE.BUILD && v.target && !v.target.complete) {
          this.badSpots.add(v.target.tx + ',' + v.target.ty);
          world.cancelConstruction(v.target);
        } else if (v.state === STATE.GATHER && poste) {
          const res = tile && world.map.resourceAt(tile.tx, tile.ty);
          if (res) res.inaccessible = true; else if (farm) farm.gatherUnreachable = true;
          this.assignJob(v, this.jobOf(v) || 'food');
        }
      }
    }
  }

  /** Cet ouvrier, qui n'est pas sous les flèches, y passerait-il en suivant son chemin ? */
  traverseZone(v) {
    const cases = this.player.zoneEvitee;
    if (!cases || v.pathPending || !v.path || this.niveauZone(v.x, v.y) === 2) return false;
    const w = this.world.map.w;
    for (let j = v.pathIndex; j < v.path.length; j++) {
      if (cases[v.path[j].ty * w + v.path[j].tx] === 2) return true;
    }
    return false;
  }

  jobOf(v) {
    const task = villagerTask(v);
    return task === 'idle' || task === 'move' || task === 'abri' ? null : task;
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
    // Rien à récolter nulle part : au moins, on ne reste pas sous les flèches.
    if (this.townCenter && this.niveauZone(villager.x, villager.y) > 0) {
      const poste = this.posteAuCamp();
      villager.moveTo(poste.x, poste.y);
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
    // De même un chantier pris dans une zone à éviter (voir releverZones) :
    // personne n'ira le bâtir sous les flèches, il sera reposé ailleurs.
    for (const site of this.buildings.filter((b) => !b.complete && !b.dead && this.niveauZone(b.x, b.y) > 0)) {
      this.world.cancelConstruction(site);
    }
    const inProgress = this.buildings.filter((b) => !b.complete && !b.dead);
    if (inProgress.length >= 2) { this.assignBuilders(inProgress); return; }

    const plan = this.nextBuilding();
    // Un bâtiment voulu mais trop cher : les soldats attendront qu'il soit payé
    // (voir manageMilitary). Sans cela l'armée boit tout l'or, et ni le Temple
    // ni une seconde tour ne sortent jamais de terre.
    this.projet = plan && !canAfford(player.resources, BUILDING_TYPES[plan].cost) ? plan : null;
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
    // Le plafond du format de partie (40 en Express), pas celui du Classique.
    const popMax = this.world.popMax;
    if (popRoom <= 3 && player.popCap < popMax) return 'house';
    if (!this.aDepot('lumbercamp', 'wood') && this.villagers.length >= 4) return 'lumbercamp';
    if (!this.aDepot('mill') && this.villagers.length >= 6) return 'mill';
    if (!this.has('barracks') && this.villagers.length >= 8) return 'barracks';
    if (!this.aDepot('miningcamp', 'gold') && this.villagers.length >= 9) return 'miningcamp';
    // L'âge visé exige des bâtiments (`requis`, dans AGES) : ils passent avant
    // les fermes, sinon son prix dort en réserve sans pouvoir être dépensé.
    const requis = this.ageTarget && this.batimentPourAge();
    if (requis) return requis;
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
      if (!this.has('temple')) return 'temple';
      if (this.countFarms() < 8) return 'farm';
      if (!this.has('towncenter', 2) && player.resources.wood > 400) return 'towncenter';
      if (!this.has('tower', 2)) return 'tower';
    }
    if (this.wantFarm && this.has('mill') && this.countFarms() < 10) { this.wantFarm = false; return 'farm'; }
    // Maison d'avance seulement quand la marge de population se réduit :
    // sinon l'IA couvre la carte de maisons inutiles.
    if (popRoom <= 7 && player.resources.wood > 250 && player.popCap < popMax) return 'house';
    return null;
  }

  /** Les fermes qui comptent : celles d'une zone à éviter (voir releverZones) ne nourrissent plus personne. */
  countFarms() {
    if (this.zones.length === 0) return this.counts.farm || 0;
    return this.buildings.filter((b) => b.type === 'farm' && this.niveauZone(b.x, b.y) === 0).length;
  }

  /**
   * Un dépôt de ce type qui serve encore ? Sous les flèches d'un bâtiment
   * ennemi (voir releverZones), il ne compte plus : on en bâtit un autre
   * ailleurs — pour un camp, s'il reste de sa ressource hors des zones à
   * éviter ; sinon il n'aurait rien à recevoir.
   */
  aDepot(type, ressource) {
    if (this.zones.length === 0) return this.has(type);
    if (this.buildings.some((b) => b.type === type && !this.world.batimentBattu(b))) return true;
    const tc = this.townCenter;
    return !!ressource && !(tc && this.world.findNearestResource(tc.x, tc.y, ressource, 32 * TILE, this.index));
  }

  /** Le prochain bâtiment à poser pour mériter l'âge suivant (ses chantiers ouverts comptent déjà), ou null. */
  batimentPourAge() {
    const c = this.world.conditionAge(this.player);
    const aPoser = c.types.filter((type) => !this.has(type));
    return c.manque > c.types.length - aPoser.length && aPoser.length > 0 ? aPoser[0] : null;
  }

  pickBuilders(site, count) {
    // Un villageois à l'abri ne bouge pas : l'affecter ferait croire le
    // chantier pourvu, et personne d'autre n'y viendrait de toute l'alerte.
    const now = this.world.time;
    const candidates = this.villagers
      .filter((v) => v.state !== STATE.BUILD && v.carry.amount < v.carryCapacity() * 0.8
        && !v.garrisonedIn && !(v.fleeUntil > now))
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
        if (this.niveauZone((c.tx + def.size / 2) * TILE, (c.ty + def.size / 2) * TILE) > 0) continue;
        if (!this.world.canPlace(this.index, type, c.tx, c.ty, true)) continue;
        if (!this.hasRoomAround(c.tx, c.ty, def.size)) continue;
        if (!this.laisseLesAcces(type, c.tx, c.ty)) continue;
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

  /**
   * Le bâtiment posé là laisse-t-il un accès à lui-même et à ses voisins ?
   * La couronne libre de hasRoomAround ne suffit pas : maison après maison,
   * l'IA finissait par murer un moulin ou son propre Centre-Ville — plus
   * aucun villageois ne pouvait y livrer ni s'y abriter. On pose l'emprise
   * pour de faux, et chaque bâtiment du voisinage doit garder une case de
   * pourtour « ouverte » (reliée à au moins quarante cases). Il ne doit pas
   * non plus boucher un passage : une maison posée entre une autre et la
   * forêt coupait la carte en deux, des villageois se retrouvaient enfermés
   * du mauvais côté, loin des baies qu'on leur demandait de cueillir.
   */
  laisseLesAcces(type, tx, ty) {
    const def = BUILDING_TYPES[type];
    if (def.walkable) return true;   // une ferme se traverse : elle ne mure rien
    const map = this.world.map;
    const ouvert = (bx, by, size) => {
      for (let y = by - 1; y <= by + size; y++) {
        for (let x = bx - 1; x <= bx + size; x++) {
          if (x >= bx && x < bx + size && y >= by && y < by + size) continue;
          if (map.inBounds(x, y) && !map.isBlocked(x, y) && map.floodSize(x, y, 40) >= 40) return true;
        }
      }
      return false;
    };
    for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) map.block(x, y, BLOCK.BUILDING);
    let ok = ouvert(tx, ty, def.size);
    if (ok) {
      const pourtour = [];
      for (let y = ty - 1; y <= ty + def.size; y++) {
        for (let x = tx - 1; x <= tx + def.size; x++) {
          if (x >= tx && x < tx + def.size && y >= ty && y < ty + def.size) continue;
          if (map.inBounds(x, y)) pourtour.push({ tx: x, ty: y });
        }
      }
      ok = map.relies(pourtour);
    }
    for (const b of this.world.buildings) {
      if (!ok) break;
      if (b.dead || b.def.walkable) continue;
      // Seuls les voisins proches peuvent avoir été murés par cette emprise.
      if (b.tx > tx + def.size + 2 || b.tx + b.size < tx - 2 || b.ty > ty + def.size + 2 || b.ty + b.size < ty - 2) continue;
      ok = ouvert(b.tx, b.ty, b.size);
    }
    // Les cases étaient libres (canPlace l'a vérifié) : on les rend telles quelles.
    for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) map.unblock(x, y, BLOCK.BUILDING);
    return ok;
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
    // Le prix de l'âge visé n'est pas à dépenser à la Forge : ses recherches se
    // font avec le surplus, ou pendant le passage. Sans cela, chaque fois que
    // la nourriture montait, une technologie la mangeait à deux doigts du but.
    // (La Brouette, elle, se rembourse en récolte : elle n'attend pas.)
    const pourAge = this.ageTarget ? this.ageTarget.cost.food || 0 : 0;
    for (const tech of ['forging', 'fletching', 'scaleArmor']) {
      if (player.techs.has(tech)) continue;
      if (this.world.canResearch(forge, tech).ok && player.resources.food > 250 + pourAge) {
        this.world.researchTech(forge, tech);
        break;
      }
    }
  }

  // --- Militaire ------------------------------------------------------------

  manageMilitary() {
    const player = this.player;
    const roster = ARMY_COMPOSITION[Math.min(player.age, ARMY_COMPOSITION.length - 1)];

    // Ce qu'on met de côté avant de former un soldat de plus : le bâtiment
    // voulu, et le prix d'une Hydre tant que le Temple n'en a pas donné assez.
    const menace = this.world.time < this.defendUntil;
    // (À l'Âge des Châteaux seulement : avant, le bois doit d'abord aller aux
    // fermes, sinon le passage d'âge prend deux minutes de retard. Sauf pour le
    // bâtiment qu'exige l'âge visé : lanciers et archers buvaient son bois, et
    // le prix de l'âge dormait en réserve jusqu'à la fin de la partie.)
    const exige = !!this.projet && !!this.ageTarget && this.projet === this.batimentPourAge();
    const projet = !menace && this.projet && (player.age >= 2 || exige) ? BUILDING_TYPES[this.projet].cost : null;
    const commande = this.commande();
    const pourCommande = !menace && commande ? UNIT_TYPES[commande.type].cost : null;
    // Les troupes ennemies dans la base (this.intrus), avant de décider quoi
    // former. La plus proche est la menace — sauf alerte levée faute de combat.
    let threat = this.findThreat();
    if (threat && !this.alerteFondee()) threat = null;
    this.rappelerAuCamp();

    // Production militaire dans tous les bâtiments disponibles.
    for (const b of this.completed) {
      if (!b.def.trains || b.type === 'towncenter') continue;
      if (b.queue.length >= 2) continue;
      if (player.pop >= player.popCap) break;
      let options = b.def.trains.filter((t) => roster.includes(t) && UNIT_TYPES[t].age <= player.age);
      // Une Prêtresse soigne une armée qui existe : pas avant quatre soldats,
      // jamais plus de deux (celles en formation comprises).
      if (options.includes('priest')) {
        const soigneuses = this.army.filter((u) => u.def.heal).length + b.queue.filter((q) => q.id === 'priest').length;
        if (soigneuses >= PRETRESSES_MAX || this.army.length < 4) options = options.filter((t) => t !== 'priest');
      }
      if (options.length === 0) continue;
      let pick = options[this.compositionIndex % options.length];
      this.compositionIndex++;
      // Le bâtiment de la commande ne forme qu'elle : c'est pour elle qu'on économise.
      const commandee = commande && commande.batiment === b;
      if (commandee) pick = commande.type;
      else if (b.type === 'temple') pick = options.includes('priest') ? 'priest' : options[0];
      // On garde une réserve de ressources pour l'économie au début.
      const reserve = player.age === 0 ? 120 : 60;
      const def = UNIT_TYPES[pick];
      // On s'autorise une garnison minimale, puis on met de côté le coût de
      // l'âge suivant : sans cette réserve l'armée mange tous les revenus et
      // l'IA reste bloquée au premier âge. Le plancher monte lentement avec le
      // temps. La réserve tient aussi en alerte : avant, elle sautait net à la
      // première menace, et une alerte qui durait faisait passer tout l'or en
      // miliciens sans que l'âge suivant soit jamais atteint. On n'y puise que
      // pour faire face : tant que l'ennemi a plus de troupes dans la base
      // qu'on n'a de soldats.
      const armyFloor = 3 + player.age * 3 + Math.floor(this.world.time / 420);
      const deborde = !!threat && this.intrus.length > this.army.length;
      // Hystérésis : une fois la moitié du coût réunie, on garde le cap même si
      // un soldat tombe. Sinon l'IA redépense sa cagnotte à deux doigts du but.
      const saving = !deborde && this.ageTarget
        && (this.savingForAge || this.army.length >= armyFloor)
        ? this.ageTarget.cost : null;
      const affordable = Object.keys(def.cost).every((k) => {
        const keep = (k === 'wood' ? reserve : 0) + (saving && saving[k] ? saving[k] : 0)
          + (projet && projet[k] ? projet[k] : 0)
          + (pourCommande && !commandee && pourCommande[k] ? pourCommande[k] : 0);
        return player.resources[k] >= def.cost[k] + keep;
      });
      // La commande part : le chrono de patience repart pour la suivante.
      if (affordable && this.world.trainUnit(b, pick) && commandee) { this.commandeDepuis = this.world.time; this.commandeAvance = 0; }
    }

    if (threat) {
      this.defendUntil = this.world.time + 8;
      for (const u of this.army) {
        if (u.def.heal) continue;   // une soigneuse ne « frappe » pas : elle soigne d'elle-même
        if (u.state === STATE.IDLE || u.state === STATE.MOVE || !u.target) u.attackEntity(threat);
      }
      // Les villageois vraiment menacés se mettent à l'abri : garnison du
      // Centre-Ville ou d'une tour, comme au son de la cloche du village.
      const now = this.world.time;
      const shelters = this.completed.filter((b) => b.def.garrison);
      for (const v of this.villagers) {
        if (v.fleeUntil > now || v.garrisonedIn) continue;
        if (dist2(v.x, v.y, threat.x, threat.y) > (TILE * 3.5) ** 2) continue;
        let best = null, bestD = Infinity;
        for (const b of shelters) {
          if (!b.canGarrison(v)) continue;
          const d = dist2(v.x, v.y, b.x, b.y);
          if (d < bestD) { bestD = d; best = b; }
        }
        if (best && v.garrisonAt(best)) { v.fleeUntil = now + 25; continue; }
        if (this.townCenter) {
          v.fleeUntil = now + 6;
          v.moveTo(this.townCenter.x, this.townCenter.y + TILE * 2.5);
        }
      }
      return;
    }

    if (this.world.time < this.defendUntil) return;

    // Danger passé : on rouvre les portes, les villageois retournent au travail.
    for (const b of this.completed) {
      if (b.garrison && b.garrison.length > 0) this.world.releaseGarrison(b);
    }

    // Un bâtiment ennemi qui tire sur la base : l'armée va le raser, si elle
    // en a les moyens. Le temps de l'assaut, la vague attend.
    if (this.assiegerBatimentArme()) return;

    // Vague d'attaque quand l'armée est assez fournie — et, en Facile, pas
    // avant la fin de la trêve. Là, la vague est comptée : elle ne prend que
    // les soldats présents au camp, le reste de l'armée garde la base.
    const comptee = !!this.difficulty.petitesVagues;
    const prets = comptee ? this.troupesAuCamp() : this.army;
    if (this.attackTimer <= 0 && this.world.time >= this.treve && prets.length >= this.armyTarget) {
      const vague = comptee ? prets.slice(0, this.armyTarget) : prets;
      const target = this.pickAttackTarget(vague);
      if (target) {
        this.waveCount++;
        // (Lancée sur un bâtiment qui tire, la vague lui compte pour un assaut : voir pickAttackTarget.)
        if (target.kind === 'building' && target.complete && target.arrowCount() > 0) {
          this.assauts[target.id] = (this.assauts[target.id] || 0) + 1;
        }
        this.armyTarget = Math.min(24, Math.max(3, Math.round(
          (this.difficulty.armyTrigger + this.waveCount * this.difficulty.armyStep) * this.rush)));
        this.attackTimer = (this.difficulty.attackDelay * 0.25 + 20) * this.rush;
        this.world.setStance(vague, 'aggressive');   // en campagne, on engage
        // Quand la victoire se joue sur le Centre-Ville, on le prend pour cible
        // explicitement : une attaque-déplacement s'égare sur les villageois et
        // la partie n'aboutit jamais à son objectif.
        // De même sur un bâtiment qui tire près de la base, ou sur ce qu'il
        // couvre : aucune troupe ne s'y attaque d'elle-même (voir World.findEnemyNear).
        if (target.kind === 'building' && (this.world.mode.victory === 'towncenter' || this.niveauZone(target.x, target.y) === 2)) {
          // (Une soigneuse ne « frappe » pas un bâtiment : elle suit la troupe.)
          for (const u of vague) {
            if (u.def.heal) u.moveTo(target.x, target.y + TILE * 3, true);
            else u.attackEntity(target);
          }
        } else {
          this.world.formationMove(vague, target.x, target.y, true);
        }
      }
    } else if (this.army.length > 0) {
      // Regroupement défensif autour du Centre-Ville. Seules les troupes au
      // repos passent en défensif : changer d'attitude recale le poste de garde
      // sur la position courante, et une vague en marche, ramenée ainsi à son
      // point de départ, tournerait les talons au premier ennemi croisé.
      const tc = this.townCenter;
      if (!tc) return;
      const auCamp = this.army.filter((u) => u.state === STATE.IDLE);
      this.world.setStance(auCamp, 'defensive');     // au camp, on tient son poste
      for (const u of auCamp) {
        // (Ni au loin, ni au repos dans une zone à éviter : on s'y fait tirer dessus sans rien rendre.)
        const expose = this.niveauZone(u.x, u.y) > 0;
        if (expose || dist2(u.x, u.y, tc.x, tc.y) > (TILE * 11) ** 2) {
          const poste = this.posteAuCamp();
          u.moveTo(poste.x, poste.y, !expose);
        }
      }
    }
  }

  /**
   * Un point de regroupement au pied du Centre-Ville — ou ailleurs autour de
   * lui, si un bâtiment ennemi bat cet endroit (voir releverZones).
   */
  posteAuCamp() {
    const tc = this.townCenter;
    const poste = {
      x: tc.x + (this.rng.next() - 0.5) * TILE * 6,
      y: tc.y + TILE * 4 + (this.rng.next() - 0.5) * TILE * 4,
    };
    if (this.niveauZone(poste.x, poste.y) === 0) return poste;
    // Le plus loin possible des bâtiments qui tirent, en restant près du centre.
    const map = this.world.map;
    for (const r of [5, 8, 10.5]) {
      let best = null, bestD = -1;
      for (let k = 0; k < 8; k++) {
        const x = tc.x + Math.cos((k * Math.PI) / 4) * r * TILE, y = tc.y + Math.sin((k * Math.PI) / 4) * r * TILE;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (!map.inBounds(tx, ty) || map.isBlocked(tx, ty) || this.niveauZone(x, y) > 0) continue;
        let d = Infinity;
        for (const z of this.zones) d = Math.min(d, dist2(x, y, z.x, z.y));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      if (best) return best;
    }
    return poste;
  }

  /**
   * Deux rappels au camp.
   * Une riposte ne sort pas de la base : la troupe lancée sur un intrus l'est
   * par un ordre d'attaque, sans borne de poursuite ; dès que sa cible a
   * quitté la base, elle est rappelée. Avant, deux à cinq soldats suivaient
   * l'éclaireur du joueur jusque chez lui, puis s'en prenaient à ses ouvriers
   * et à son Centre-Ville — en Facile, des minutes avant la fin de la trêve.
   * Et personne ne s'attaque de soi-même à un bâtiment réservé à l'assaut
   * (voir World.laisseALAssaut) : le soldat qui l'avait pris pour cible avant
   * qu'il soit relevé — le temps d'une réflexion suffit — est rappelé aussi.
   */
  rappelerAuCamp() {
    if (!this.townCenter) return;
    for (const u of this.army) {
      const cible = u.target;
      if (u.state !== STATE.ATTACK || !cible || cible.dead || cible.isAnimal || cible.playerIndex === this.index) continue;
      const egare = cible.kind === 'unit'
        ? !u.autoTarget && !this.intrus.includes(cible)
        : u.autoTarget && this.world.laisseALAssaut(this.index, cible);
      if (!egare) continue;
      const poste = this.posteAuCamp();
      u.moveTo(poste.x, poste.y);
    }
  }

  /** Les troupes présentes au camp, autour du Centre-Ville : celles qui ne sont pas en campagne. */
  troupesAuCamp() {
    const tc = this.townCenter;
    if (!tc) return [];
    return this.army.filter((u) => dist2(u.x, u.y, tc.x, tc.y) <= (TILE * CAMP) ** 2);
  }

  /**
   * Niveau Facile : une minute avant la fin de la trêve, le joueur est prévenu
   * — une seule fois par partie. Il a le temps de former quelques soldats.
   */
  annoncerAttaque() {
    if (!this.treve || this.annonceFaite || this.world.time < this.treve - 60) return;
    this.annonceFaite = true;
    const world = this.world;
    const ennemi = this.index === 0 ? 1 : 0;
    // (Déjà en campagne — une sauvegarde d'avant ce réglage : il est trop tard pour prévenir.)
    if (ennemi !== world.humanIndex || this.waveCount > 0) return;
    const civ = world.players[ennemi].civ;
    world.pushEvent({
      type: 'notice',
      text: `L’ennemi prépare une attaque : formez des soldats ${ficheDe('barracks', civ).fem ? 'à la' : 'au'} ${nomDe('barracks', civ)}`,
    });
  }

  /**
   * L'unité chère que l'IA veut ensuite, et le bâtiment qui la forme : une
   * Hydre tant qu'elle en a moins de deux, puis un engin de siège (catapulte
   * et bélier en alternance) tant qu'elle en a moins de deux. Celles en
   * formation comptent déjà.
   */
  commande() {
    const c = this.commandeVoulue();
    if (!c) { this.commandeType = null; return null; }
    // Une commande qui n'aboutit pas (plus d'or sur la carte, économie à
    // genoux) ne doit pas geler le reste de l'armée. La patience se compte
    // depuis le dernier PROGRÈS de la cagnotte : tant que l'or rentre, même
    // lentement, on attend ; quatre minutes sans avancer d'un vingtième du
    // prix, et la commande est laissée de côté une minute, puis réessayée.
    const t = this.world.time;
    if (this.commandeType !== c.type) { this.commandeType = c.type; this.commandeDepuis = t; this.commandeAvance = 0; }
    const prix = UNIT_TYPES[c.type].cost, reserve = this.player.resources;
    let avance = 1;
    for (const k of Object.keys(prix)) avance = Math.min(avance, prix[k] > 0 ? reserve[k] / prix[k] : 1);
    const attente = t - this.commandeDepuis;
    if (attente <= 240 && avance > (this.commandeAvance || 0) + 0.05) { this.commandeAvance = avance; this.commandeDepuis = t; }
    if (attente > 240) {
      if (attente > 300) { this.commandeDepuis = t; this.commandeAvance = 0; }
      return null;
    }
    return c;
  }

  commandeVoulue() {
    const player = this.player;
    const age = player.age;
    // Pas de commande sans la place de la loger : une Hydre occupe trois places.
    const place = player.popCap - player.pop;
    const enFile = (b, types) => b.queue.filter((q) => types.includes(q.id)).length;
    const temple = this.completed.find((b) => b.type === 'temple');
    if (temple && age >= UNIT_TYPES.hydra.age && place >= (UNIT_TYPES.hydra.pop || 1)) {
      const hydres = this.army.filter((u) => u.type === 'hydra').length + enFile(temple, ['hydra']);
      if (hydres < HYDRES_VOULUES) return { type: 'hydra', batiment: temple };
    }
    const atelier = this.completed.find((b) => b.type === 'siege');
    if (atelier && age >= UNIT_TYPES.ram.age && place >= 1) {
      const engins = this.army.filter((u) => u.def.class === 'siege').length + enFile(atelier, ['ram', 'catapult']);
      if (engins < ENGINS_VOULUS) return { type: engins % 2 === 0 ? 'catapult' : 'ram', batiment: atelier };
    }
    return null;
  }

  /**
   * Troupe ennemie présente dans la base (à moins de treize cases d'un de ses
   * bâtiments) ? Une troupe abritée dans un bâtiment n'en est pas une : elle ne
   * menace personne et personne ne peut l'atteindre. Avant, un seul ouvrier
   * dans une tour posée à dix cases tenait l'IA en alerte jusqu'à la fin de la
   * partie — plus de vague, plus d'âge, tout l'or en miliciens. (Le bâtiment
   * qui tire, lui, se traite à part : voir assiegerBatimentArme.)
   * Rend la plus proche, et les relève toutes au passage (`intrus`).
   */
  findThreat() {
    const world = this.world;
    let best = null, bestD = Infinity;
    this.intrus = [];
    for (const e of world.entities) {
      if (e.dead || e.playerIndex === this.index || e.isAnimal) continue;
      if (e.kind === 'building' || e.garrisonedIn) continue;
      let dedans = false;
      for (const b of this.buildings) {
        const d = dist2(e.x, e.y, b.x, b.y);
        if (d >= (TILE * 13) ** 2) continue;
        dedans = true;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (dedans) this.intrus.push(e);
    }
    return best;
  }

  /**
   * Une alerte sans combat ne dure pas. Si depuis ALERTE_CALME secondes
   * personne n'a porté ni reçu de coup dans la base — l'intrus est hors
   * d'atteinte, ou ne fait que rôder —, l'alerte est levée pour ALERTE_REPIT
   * secondes : les ouvriers abrités ressortent, les vagues reprennent. Au
   * premier coup, elle reprend.
   * @returns {boolean} faux si la menace est à laisser courir.
   */
  alerteFondee() {
    const now = this.world.time;
    // Le dernier coup reçu par un intrus, ou par un des siens dans la base.
    let coup = -Infinity;
    for (const e of this.intrus) coup = Math.max(coup, e.lastHitAt);
    for (const e of this.buildings) coup = Math.max(coup, e.lastHitAt);
    for (const e of this.villagers) coup = Math.max(coup, e.lastHitAt);
    for (const e of this.troupesAuCamp()) coup = Math.max(coup, e.lastHitAt);
    if (now < this.repit) {
      if (coup <= this.repit - ALERTE_REPIT) return false;   // toujours aussi calme
      this.repit = 0;                                         // on se bat : l'alerte reprend
    }
    if (now >= this.defendUntil) this.alerteDepuis = now;     // une alerte commence
    if (now - this.alerteDepuis < ALERTE_CALME || now - coup < ALERTE_CALME) return true;
    this.repit = now + ALERTE_REPIT;
    this.defendUntil = now;
    return false;
  }

  /**
   * Un bâtiment ennemi qui tire dans la base — une tour, un Centre-Ville
   * occupé (voir releverZones). Ce n'est pas une alerte : les ouvriers restent
   * au travail, hors de sa portée, l'épargne et les vagues suivent leur cours.
   * Mais l'armée du camp va le raser dès qu'elle en a les moyens, et sans s'y
   * user pour rien : pas d'assaut tant que les dégâts promis (voir
   * degatsPromis) ne couvrent pas ce qu'il lui reste de points de vie ; un
   * assaut dure au plus ASSAUT_DUREE secondes (jusqu'à ASSAUT_LONG quand le
   * bâtiment est occupé ailleurs et ne rend pas les coups), après quoi on
   * décroche ; et pas plus de ASSAUTS_MAX par bâtiment et par âge (un âge de
   * plus, ce sont d'autres troupes : on retente).
   * @returns {boolean} vrai tant qu'un assaut est en cours : la vague attend.
   */
  assiegerBatimentArme() {
    const now = this.world.time;
    // (Plus de Centre-Ville, plus de camp : l'heure n'est pas aux assauts.)
    if (!this.townCenter) { this.assaut = null; return false; }
    if (this.assautsAge !== this.player.age) { this.assautsAge = this.player.age; this.assauts = {}; }
    // La troupe d'un assaut : les soldats du camp qui n'ont rien d'autre à
    // faire. Ceux d'une vague qui vient de partir sont encore à deux pas, mais
    // ils sont en campagne : les rappeler la lui ferait perdre, alors qu'elle
    // est déjà comptée.
    const camp = this.troupesAuCamp()
      .filter((u) => !u.def.heal && (u.state === STATE.IDLE || u.state === STATE.MOVE));
    if (this.assaut) {
      const cible = this.world.byId.get(this.assaut.cible);
      const troupe = cible ? this.army.filter((u) => u.target === cible && u.state === STATE.ATTACK) : [];
      if (!cible || cible.dead || now >= this.assaut.fin || troupe.length + camp.length === 0) {
        // Rasé, ou assaut manqué : on décroche, sans s'entêter sous les flèches.
        this.assaut = null;
        for (const u of troupe) {
          const poste = this.posteAuCamp();
          u.moveTo(poste.x, poste.y);
        }
        return false;
      }
      // Les troupes sorties de formation entre-temps rejoignent l'assaut.
      for (const u of camp) u.attackEntity(cible);
      return true;
    }
    const cible = this.batimentArme();
    if (!cible) return false;
    // Occupé sur un de ses bâtiments, il ne rend pas les coups : l'assaut ne
    // coûte rien, une petite troupe peut y mettre le temps qu'il reste occupé
    // (ASSAUT_LONG au plus) — et se passer de marge.
    const occupe = this.occupeEncore(cible);
    const duree = Math.max(ASSAUT_DUREE, Math.min(ASSAUT_LONG, occupe));
    if (this.degatsPromis(camp, cible, duree) < cible.hp * (occupe >= duree ? 1 : ASSAUT_MARGE)) return false;
    this.assauts[cible.id] = (this.assauts[cible.id] || 0) + 1;
    this.assaut = { cible: cible.id, fin: now + duree };
    for (const u of camp) u.attackEntity(cible);
    return true;
  }

  /**
   * Un bâtiment qui tire garde sa cible tant qu'elle tient debout à sa portée
   * (voir Building.updateDefense). S'il a pris pour cible un bâtiment de la
   * base, il s'y use une flèche après l'autre et ne se retourne pas contre
   * les soldats venus le raser : pendant combien de secondes encore ? (0 s'il
   * ne vise rien de tel.)
   */
  occupeEncore(cible) {
    const vise = cible.target;
    if (!vise || vise.dead || vise.kind !== 'building' || vise.playerIndex !== this.index) return 0;
    const parSalve = cible.arrowCount() * computeDamage(cible.def, cible.player, vise);
    return (vise.hp / parSalve) * cible.def.attackSpeed;
  }

  /**
   * Le bâtiment ennemi qui tire dans la base (voir releverZones) — le plus
   * proche de son centre —, ou null. Ceux qui ont déjà eu leur compte
   * d'assauts à cet âge sont laissés de côté. De même celui qui ne bat qu'un
   * gisement au loin : ses ouvriers l'évitent, mais y mener l'armée du camp
   * serait une vague qui ne dit pas son nom — et, en Facile, avant l'heure.
   */
  batimentArme() {
    const tc = this.townCenter;
    let best = null, bestD = Infinity;
    for (const z of this.zones) {
      if ((this.assauts[z.id] || 0) >= ASSAUTS_MAX || !this.presDeLaBase(z)) continue;
      const b = this.world.byId.get(z.id);
      if (!b || b.dead) continue;
      const d = tc ? dist2(z.x, z.y, tc.x, tc.y) : 0;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /**
   * Ce que cette troupe ôterait de points de vie à un bâtiment qui tire, le
   * temps d'un assaut. Il abat ses assaillants un par un, les plus rapides
   * d'abord (ils arrivent les premiers) ; chacun frappe de son arrivée au pied
   * du mur jusqu'à sa mort. Une troupe qui porte aussi loin que lui (la
   * Catapulte) reste hors d'atteinte et tire jusqu'au bout. Et tant qu'il est
   * occupé sur un bâtiment de la base (voir occupeEncore), personne ne tombe.
   * @param {number} [duree] la durée de l'assaut, trajet compris.
   */
  degatsPromis(troupe, cible, duree = ASSAUT_DUREE) {
    const fleches = cible.arrowCount();
    const portee = cible.rangePx();
    const utile = duree - ASSAUT_MARCHE;
    const rangs = troupe.slice().sort((a, b) => b.def.speed - a.def.speed);
    // `t` : l'heure, comptée de l'arrivée au pied du mur, où tombe l'assaillant suivant.
    let t = Math.max(0, this.occupeEncore(cible) - ASSAUT_MARCHE), total = 0;
    for (const u of rangs) {
      const frappe = computeDamage(u.def, u.player, cible) / u.def.attackSpeed;
      if (u.rangePx() >= portee) { total += frappe * utile; continue; }
      const salves = Math.ceil(u.hp / (fleches * computeDamage(cible.def, cible.player, u)));
      t += salves * cible.def.attackSpeed;
      const approche = (portee - u.rangePx()) / (u.def.speed * TILE);
      total += frappe * Math.max(0, Math.min(t, utile) - approche);
    }
    return total;
  }

  /** La cible de la vague `troupe` : un bâtiment adverse, à défaut une de ses unités. */
  pickAttackTarget(troupe = this.army) {
    const world = this.world;
    const enemyIndex = this.index === 0 ? 1 : 0;
    const tc = this.townCenter;
    const targets = world.buildings.filter((b) => !b.dead && b.playerIndex === enemyIndex);
    if (targets.length === 0) {
      const units = world.units.filter((u) => !u.dead && !u.isAnimal && u.playerIndex === enemyIndex);
      return units[0] || null;
    }
    // Format « le Centre-Ville décide » : inutile de raser une maison.
    if (world.mode.victory === 'towncenter') {
      const centre = targets.find((b) => b.type === 'towncenter');
      if (centre) return centre;
    }
    // On vise en priorité ce qui produit, puis ce qui est proche. Un bâtiment
    // qui tire n'est une cible que si la vague a de quoi l'abattre (voir
    // degatsPromis), et s'il n'a pas déjà eu son compte d'assauts : une tour
    // posée près de sa base était toujours le bâtiment le plus proche, et
    // chaque vague allait s'y faire tuer au lieu de marcher sur le joueur —
    // vide aussi, quand rien d'autre ne l'occupe : six miliciens y restaient
    // pour un tiers de ses points de vie. De même ce qu'il couvre de ses
    // flèches près de la base : on y viendra quand il sera tombé. S'il ne
    // reste que cela, on y va quand même.
    const priority = { towncenter: 0.6, barracks: 0.8, archery: 0.8, stable: 0.8, siege: 0.8 };
    // (Seuls comptent les soldats au camp : ceux qui se battent encore au loin
    // arriveraient un par un.)
    const camp = new Set(this.troupesAuCamp());
    const soldats = troupe.filter((u) => !u.def.heal && camp.has(u));
    let best = null, bestScore = Infinity, tire = null, tireScore = Infinity;
    for (const b of targets) {
      const d = tc ? dist2(tc.x, tc.y, b.x, b.y) : 0;
      const score = d * (priority[b.type] || 1);
      const imprenable = b.complete && b.arrowCount() > 0
        ? (this.assauts[b.id] || 0) >= ASSAUTS_MAX || this.degatsPromis(soldats, b) < b.hp * ASSAUT_MARGE
        : this.niveauZone(b.x, b.y) === 2;
      if (imprenable) {
        if (score < tireScore) { tireScore = score; tire = b; }
      } else if (score < bestScore) { bestScore = score; best = b; }
    }
    return best || tire;
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
          if (this.world.canPlace(this.index, type, ax + dx, ay + dy, true)
              && this.laisseLesAcces(type, ax + dx, ay + dy)) return { tx: ax + dx, ty: ay + dy };
        }
      }
    }
    return null;
  }

  /** Plus de base : tout le monde au combat. */
  lastStand() {
    const enemyIndex = this.index === 0 ? 1 : 0;
    const target = this.world.entities.find((e) => !e.dead && !e.isAnimal && e.playerIndex === enemyIndex);
    if (!target) return;
    for (const u of this.units) if (u.state === STATE.IDLE && !u.def.heal) u.attackEntity(target);
  }
}
