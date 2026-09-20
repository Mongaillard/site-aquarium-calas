// ---------------------------------------------------------------------------
// Sauvegarde et reprise d'une partie.
//
// Principe : on ne sauvegarde pas la carte, on sauvegarde sa *graine*. La
// génération étant déterministe, il suffit ensuite de rejouer les seules
// choses qui ont changé depuis : les gisements épuisés et leur contenu
// restant. Tout le reste (joueurs, unités, bâtiments, IA, brouillard, état du
// générateur aléatoire) est repris champ par champ, de sorte qu'une partie
// rechargée continue exactement comme si elle n'avait jamais été interrompue.
//
// Ce module tourne aussi sans navigateur : `serializeWorld` / `restoreWorld`
// n'utilisent pas `localStorage`, ce qui permet de les tester sous Node.
// ---------------------------------------------------------------------------

import { World } from './game.js';
import { Projectile } from './entities.js';

export const SAVE_KEY = 'aem.partie';
export const SAVE_VERSION = 1;

// --- Sérialisation -----------------------------------------------------------

const refId = (e) => (e && !e.dead ? e.id : null);
const point = (p) => (p ? { x: p.x, y: p.y } : null);

function serializeMap(map) {
  // Quantités laissées en pleine précision : arrondir ferait diverger la partie
  // rechargée de la partie d'origine dès la première récolte.
  const restant = [];
  for (const [i, res] of map.resources) {
    if (res.amount < res.max - 1e-9) restant.push([i, res.amount]);
  }
  return { disparus: [...map.removed], restant };
}

function serializeProjectile(pr) {
  return {
    x: pr.x, y: pr.y, target: refId(pr.target), source: refId(pr.source), damage: pr.damage,
    lastX: pr.lastX, lastY: pr.lastY, startX: pr.startX, startY: pr.startY,
    travel: pr.travel, totalDist: pr.totalDist,
  };
}

function serializePlayer(p) {
  return {
    resources: { ...p.resources },
    age: p.age,
    ageProgress: p.ageProgress
      ? { timeLeft: p.ageProgress.timeLeft, total: p.ageProgress.total, building: refId(p.ageProgress.building) }
      : null,
    techs: [...p.techs],
    defeated: p.defeated,
    autoWorkers: p.autoWorkers,
    mods: { ...p.mods },
    stats: { ...p.stats, gathered: { ...p.stats.gathered } },
  };
}

function serializeUnit(u) {
  return {
    id: u.id, player: u.playerIndex, type: u.type,
    x: u.x, y: u.y, hp: u.hp, state: u.state, facing: u.facing,
    stance: u.stance, guardPoint: point(u.guardPoint),
    carry: { type: u.carry.type, amount: u.carry.amount },
    resourceTile: u.resourceTile ? { tx: u.resourceTile.tx, ty: u.resourceTile.ty } : null,
    lastResourceTile: u.lastResourceTile ? { tx: u.lastResourceTile.tx, ty: u.lastResourceTile.ty } : null,
    target: refId(u.target),
    returnTo: refId(u.returnTo),
    destination: point(u.destination),
    path: u.path ? u.path.map((n) => ({ tx: n.tx, ty: n.ty })) : null,
    pathIndex: u.pathIndex,
    attackCooldown: u.attackCooldown, scanCooldown: u.scanCooldown,
    repathCooldown: u.repathCooldown, repathAttempts: u.repathAttempts,
    stuckTime: u.stuckTime, blockedTime: u.blockedTime,
    autoTarget: u.autoTarget, groupSpeed: u.groupSpeed,
    garrisonedIn: refId(u.garrisonedIn),
    // Un poste différé peut désigner une ferme : on ne garde que son numéro,
    // sinon la sauvegarde embarquerait tout le monde par référence.
    pendingJob: u.pendingJob ? { ...u.pendingJob, farm: refId(u.pendingJob.farm) } : null,
    buildQueue: u.buildQueue.map(refId).filter((id) => id !== null),
    failedDropoffs: u.failedDropoffs ? [...u.failedDropoffs] : null,
    fleeUntil: u.fleeUntil, spawnTime: u.spawnTime,
  };
}

function serializeBuilding(b) {
  return {
    id: b.id, player: b.playerIndex, type: b.type, tx: b.tx, ty: b.ty,
    hp: b.hp, complete: b.complete, buildProgress: b.buildProgress,
    queue: b.queue.map((q) => ({
      kind: q.kind, id: q.id, timeLeft: q.timeLeft, total: q.total, cost: { ...q.cost },
    })),
    productionTime: b.productionTime,
    rally: point(b.rally),
    foodLeft: b.foodLeft,
    garrison: b.garrison.map(refId).filter((id) => id !== null),
    target: refId(b.target),
    attackCooldown: b.attackCooldown, scanCooldown: b.scanCooldown,
    createdAt: b.createdAt,
  };
}

function serializeAI(ai) {
  return {
    index: ai.index, rng: ai.rng.s, timer: ai.timer, attackTimer: ai.attackTimer,
    armyTarget: ai.armyTarget, waveCount: ai.waveCount, defendUntil: ai.defendUntil,
    lastHouseAt: ai.lastHouseAt, compositionIndex: ai.compositionIndex,
    badSpots: [...ai.badSpots],
  };
}

/** Encode un tableau d'octets en base64, par tranches (pile d'appels oblige). */
function encodeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  }
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function decodeBytes(text, length) {
  const bin = typeof atob === 'function'
    ? atob(text) : Buffer.from(text, 'base64').toString('binary');
  const out = new Uint8Array(length);
  for (let i = 0; i < length && i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Instantané complet d'une partie en cours. */
export function serializeWorld(world, extra = {}) {
  const vivants = (list) => list.filter((e) => !e.dead);
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: world.seed,
    mode: world.modeId,
    mapSize: world.mapSizeId,
    difficulty: world.difficultyId,
    time: world.time,
    humanIndex: world.humanIndex,
    rng: world.rng.s,
    // Minuteries internes : sans elles, la partie rechargée ne rafraîchirait pas
    // le brouillard au même instant et divergerait doucement.
    fogTimer: world.fogTimer,
    popWarnCooldown: world.popWarnCooldown,
    accessResetTimer: world.accessResetTimer || 0,
    // Le compteur réel, pas le plus grand identifiant vivant : une entité morte
    // a consommé son numéro, et le réattribuer ferait diverger la partie.
    nextId: world.nextId,
    map: serializeMap(world.map),
    fog: encodeBytes(world.fog.explored),
    players: world.players.map(serializePlayer),
    buildings: vivants(world.buildings).map(serializeBuilding),
    units: vivants(world.units).map(serializeUnit),
    projectiles: world.projectiles.filter((pr) => !pr.dead).map(serializeProjectile),
    ais: world.ais.map(serializeAI),
    ...extra,
  };
}

// --- Reprise -----------------------------------------------------------------

/**
 * Reconstruit un monde depuis un instantané. Renvoie `null` si la sauvegarde
 * est absente, illisible ou d'une version antérieure — mieux vaut proposer une
 * partie neuve qu'une partie à moitié restaurée.
 */
export function restoreWorld(data) {
  if (!data || data.version !== SAVE_VERSION) return null;
  const world = new World({
    seed: data.seed, mode: data.mode, mapSize: data.mapSize,
    difficulty: data.difficulty, restoring: true,
  });
  world.time = data.time || 0;
  world.humanIndex = data.humanIndex || 0;
  world.rng.s = data.rng >>> 0;
  world.fogTimer = data.fogTimer || 0;
  world.popWarnCooldown = data.popWarnCooldown || 0;
  world.accessResetTimer = data.accessResetTimer || 0;

  // 1. La carte : gisements disparus, puis contenu restant.
  for (const i of data.map.disparus) world.map.clearResource(i);
  for (const [i, amount] of data.map.restant) {
    const res = world.map.resources.get(i);
    if (res) res.amount = amount;
  }

  // 2. Les joueurs.
  data.players.forEach((saved, i) => {
    const p = world.players[i];
    if (!p) return;
    p.resources = { ...saved.resources };
    p.age = saved.age;
    p.techs = new Set(saved.techs);
    p.defeated = saved.defeated;
    p.autoWorkers = saved.autoWorkers;
    p.mods = { ...p.mods, ...saved.mods };
    p.stats = { ...saved.stats, gathered: { ...saved.stats.gathered } };
    // `ageProgress` référence un bâtiment : rattaché plus bas.
    p.ageProgress = saved.ageProgress ? { ...saved.ageProgress } : null;
  });

  // 3. Les entités. On les crée d'abord avec des identifiants temporaires, puis
  // on rétablit les vrais : sans ça, deux entités pourraient se disputer une
  // même clé pendant la reconstruction.
  const paires = [];
  for (const saved of data.buildings) {
    const b = world.spawnBuilding(saved.player, saved.type, saved.tx, saved.ty, saved.complete);
    b.hp = saved.hp;
    b.buildProgress = saved.buildProgress;
    b.queue = saved.queue.map((q) => ({ ...q, cost: { ...q.cost } }));
    b.productionTime = saved.productionTime;
    b.rally = saved.rally ? { ...saved.rally } : null;
    b.foodLeft = saved.foodLeft;
    b.attackCooldown = saved.attackCooldown;
    b.scanCooldown = saved.scanCooldown;
    b.createdAt = saved.createdAt;
    paires.push([saved, b]);
  }
  for (const saved of data.units) {
    const u = world.spawnUnit(saved.player, saved.type, saved.x, saved.y);
    u.x = saved.x; u.y = saved.y;          // position exacte, sans recalage
    u.hp = saved.hp;
    u.state = saved.state;
    u.facing = saved.facing;
    u.stance = saved.stance;
    u.guardPoint = saved.guardPoint ? { ...saved.guardPoint } : null;
    u.carry = { ...saved.carry };
    u.resourceTile = saved.resourceTile ? { ...saved.resourceTile } : null;
    u.lastResourceTile = saved.lastResourceTile ? { ...saved.lastResourceTile } : null;
    u.destination = saved.destination ? { ...saved.destination } : null;
    u.path = saved.path ? saved.path.map((n) => ({ ...n })) : null;
    u.pathIndex = saved.pathIndex;
    u.attackCooldown = saved.attackCooldown;
    u.scanCooldown = saved.scanCooldown;
    u.repathCooldown = saved.repathCooldown;
    u.repathAttempts = saved.repathAttempts;
    u.stuckTime = saved.stuckTime;
    u.blockedTime = saved.blockedTime;
    u.autoTarget = saved.autoTarget;
    u.groupSpeed = saved.groupSpeed;
    u.pendingJob = null;   // rattaché plus bas : il peut désigner une ferme
    u.failedDropoffs = saved.failedDropoffs ? new Set(saved.failedDropoffs) : null;
    u.fleeUntil = saved.fleeUntil;
    u.spawnTime = saved.spawnTime;
    u.pathPending = false;   // la file de trajets, elle, ne se sauvegarde pas
    paires.push([saved, u]);
  }

  // 4. Identifiants d'origine, puis index reconstruit d'un bloc.
  const parId = new Map();
  for (const [saved, entity] of paires) { entity.id = saved.id; parId.set(saved.id, entity); }
  world.byId.clear();
  for (const [, entity] of paires) world.byId.set(entity.id, entity);
  world.nextId = Math.max(world.nextId, data.nextId || 1);

  // 5. Les renvois d'une entité à l'autre, maintenant que toutes existent.
  const cible = (id) => (id === null || id === undefined ? null : parId.get(id) || null);
  for (const [saved, entity] of paires) {
    entity.target = cible(saved.target);
    if (entity.kind === 'unit') {
      entity.buildQueue = (saved.buildQueue || []).map(cible).filter(Boolean);
      entity.returnTo = cible(saved.returnTo);
      if (saved.pendingJob) {
        const job = { ...saved.pendingJob };
        if (job.farm) job.farm = cible(job.farm);
        // Une ferme disparue rend le poste différé sans objet.
        entity.pendingJob = job.farm === null && saved.pendingJob.farm ? null : job;
      }
      entity.garrisonedIn = cible(saved.garrisonedIn);
    } else {
      entity.garrison = (saved.garrison || []).map(cible).filter(Boolean);
    }
  }
  for (const p of world.players) {
    if (p.ageProgress) p.ageProgress.building = cible(p.ageProgress.building);
  }
  // Les flèches en vol : une salve perdue au rechargement serait des dégâts
  // évaporés. On les laisse tomber seulement si le tireur ou la cible a disparu.
  for (const saved of data.projectiles || []) {
    const source = cible(saved.source), target = cible(saved.target);
    if (!source || !target) continue;
    const pr = new Projectile(world, source, target, saved.damage);
    Object.assign(pr, {
      x: saved.x, y: saved.y, lastX: saved.lastX, lastY: saved.lastY,
      startX: saved.startX, startY: saved.startY,
      travel: saved.travel, totalDist: saved.totalDist,
    });
    world.projectiles.push(pr);
  }

  for (const saved of data.ais) {
    const ai = world.ais.find((a) => a.index === saved.index)
      || world.addAI(saved.index);
    ai.rng.s = saved.rng >>> 0;
    ai.timer = saved.timer;
    ai.attackTimer = saved.attackTimer;
    ai.armyTarget = saved.armyTarget;
    ai.waveCount = saved.waveCount;
    ai.defendUntil = saved.defendUntil;
    ai.lastHouseAt = saved.lastHouseAt;
    ai.compositionIndex = saved.compositionIndex;
    ai.badSpots = new Set(saved.badSpots);
  }

  // 6. Terrain découvert, population, état dérivé.
  world.fog.explored = decodeBytes(data.fog, world.map.w * world.map.h);
  world.fog.dirty = true;
  world.recomputePopulation();
  world.updateFog(true);
  world.events.length = 0;
  world.map.dirty = true;
  return world;
}

// --- Rangement dans le navigateur -------------------------------------------

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Écrit l'instantané. Renvoie false si le navigateur refuse (mode privé, quota). */
export function saveGame(world, extra = {}) {
  const store = storage();
  if (!store || !world || world.gameOver) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(serializeWorld(world, extra)));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.version === SAVE_VERSION ? data : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  const store = storage();
  if (!store) return;
  try { store.removeItem(SAVE_KEY); } catch { /* rien à faire */ }
}
