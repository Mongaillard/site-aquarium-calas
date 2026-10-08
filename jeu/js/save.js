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
import { entityDef } from './config.js';
import { formatTime } from './utils.js';
import { migrerProfil, regulariser } from './progression.js';

export const SAVE_KEY = 'aem.partie';
export const SAVE_VERSION = 1;
/**
 * Prix des âges jusqu'aux réglages d'octobre 2026 (AGES, par âge visé). Un
 * passage d'âge noté sans son prix vient d'une sauvegarde de ce temps-là :
 * c'est ce prix qui a été payé, et c'est lui que raser le porteur doit rendre.
 */
const PRIX_AGES_AVANT_OCTOBRE = [null, { food: 300 }, { food: 500, gold: 150 }];

// --- Sérialisation -----------------------------------------------------------

const refId = (e) => (e && !e.dead ? e.id : null);
const point = (p) => (p ? { x: p.x, y: p.y } : null);

function serializeMap(map) {
  // Quantités laissées en pleine précision : arrondir ferait diverger la partie
  // rechargée de la partie d'origine dès la première récolte.
  const restant = [];
  const injoignables = [];   // gisements marqués injoignables, jusqu'à la prochaine remise à zéro
  const ajoutes = [];        // gisements nés en cours de partie : les carcasses
  for (const [i, res] of map.resources) {
    if (res.gibier) ajoutes.push({ i, type: res.type, amount: res.amount, max: res.max, tx: res.tx, ty: res.ty, variant: res.variant, gibier: res.gibier });
    else if (res.amount < res.max - 1e-9) restant.push([i, res.amount]);
    if (res.inaccessible) injoignables.push(i);
  }
  return { disparus: [...map.removed], restant, injoignables, ajoutes };
}

function serializeProjectile(pr) {
  return {
    x: pr.x, y: pr.y, target: refId(pr.target), source: refId(pr.source), damage: pr.damage,
    // Tireur tombé pendant le vol : la flèche touche quand même. On garde ce
    // que l'impact consulte de lui (son camp, sa position).
    tireur: { x: pr.source.x, y: pr.source.y, player: pr.source.playerIndex, type: pr.source.type },
    lastX: pr.lastX, lastY: pr.lastY, startX: pr.startX, startY: pr.startY,
    travel: pr.travel, totalDist: pr.totalDist,
    // Un boulet vise un point du sol, pas une cible (voir Projectile).
    sol: pr.sol ? { x: pr.sol.x, y: pr.sol.y } : null,
  };
}

function serializePlayer(p) {
  return {
    civ: p.civ,
    // Les niveaux des troupes, seulement s'il y en a : une partie où tout est
    // au niveau 1 se sauvegarde comme avant. De même pour les troupes
    // interdites et pour celles que le camp forme en plus.
    ...(Object.keys(p.niveaux || {}).length ? { niveaux: { ...p.niveaux } } : {}),
    ...(p.interdites && p.interdites.size ? { interdites: [...p.interdites] } : {}),
    ...(p.enPlus && p.enPlus.size ? { enPlus: [...p.enPlus] } : {}),
    resources: { ...p.resources },
    age: p.age,
    ageProgress: p.ageProgress
      ? { timeLeft: p.ageProgress.timeLeft, total: p.ageProgress.total, building: refId(p.ageProgress.building), cost: { ...p.ageProgress.cost } }
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
    gatherSpot: u.gatherSpot ? { x: u.gatherSpot.x, y: u.gatherSpot.y, tx: u.gatherSpot.tx, ty: u.gatherSpot.ty, cote: u.gatherSpot.cote } : null,
    snugTime: u.snugTime,
    target: refId(u.target),
    returnTo: refId(u.returnTo),
    destination: point(u.destination),
    path: u.path ? u.path.map((n) => ({ tx: n.tx, ty: n.ty })) : null,
    pathPending: !!u.pathPending,
    pathRequest: u.pathRequest ? { x: u.pathRequest.x, y: u.pathRequest.y, adjacent: !!u.pathRequest.adjacent, rect: u.pathRequest.rect ? { ...u.pathRequest.rect } : null, seq: u.pathRequest.seq } : null,
    pathSeq: u.pathSeq || 0,
    pathIndex: u.pathIndex,
    attackCooldown: u.attackCooldown, scanCooldown: u.scanCooldown,
    repathCooldown: u.repathCooldown, repathAttempts: u.repathAttempts, approcheSuspendue: u.approcheSuspendue,
    meilleurReste: Number.isFinite(u.meilleurReste) ? u.meilleurReste : null, sansProgres: u.sansProgres,
    stuckTime: u.stuckTime, blockedTime: u.blockedTime,
    autoTarget: u.autoTarget, groupSpeed: u.groupSpeed,
    rallyAfterFight: point(u.rallyAfterFight),
    // Bâtiment délaissé le temps d'une riposte : par numéro, comme la cible.
    reprise: u.reprise ? { ...u.reprise, batiment: refId(u.reprise.batiment) } : null,
    garrisonedIn: refId(u.garrisonedIn),
    // Poste quitté au son de la cloche : une ferme ou un chantier, par numéro.
    posteAvantAbri: u.posteAvantAbri
      ? { ...u.posteAvantAbri, farm: refId(u.posteAvantAbri.farm), site: refId(u.posteAvantAbri.site) }
      : null,
    // Un poste différé peut désigner une ferme : on ne garde que son numéro,
    // sinon la sauvegarde embarquerait tout le monde par référence.
    pendingJob: u.pendingJob ? { ...u.pendingJob, farm: refId(u.pendingJob.farm) } : null,
    buildQueue: u.buildQueue.map(refId).filter((id) => id !== null),
    failedDropoffs: u.failedDropoffs ? [...u.failedDropoffs] : null,
    fleeUntil: u.fleeUntil, spawnTime: u.spawnTime,
    // L'heure du dernier coup reçu : l'IA lève une alerte où plus personne ne
    // se bat (voir alerteFondee) — oubliée, elle la levait en plein combat.
    lastHitAt: u.lastHitAt,
    // Un animal : sa pâture et ses minuteries (voir Animal).
    animal: u.isAnimal ? { home: point(u.home), wanderTimer: u.wanderTimer, fleeTimer: u.fleeTimer, captureCooldown: u.captureCooldown } : null,
  };
}

function serializeBuilding(b) {
  return {
    id: b.id, player: b.playerIndex, type: b.type, tx: b.tx, ty: b.ty,
    hp: b.hp, complete: b.complete, buildProgress: b.buildProgress,
    unreachable: !!b.unreachable, gatherUnreachable: !!b.gatherUnreachable,
    queue: b.queue.map((q) => ({
      kind: q.kind, id: q.id, timeLeft: q.timeLeft, total: q.total, cost: { ...q.cost },
    })),
    productionTime: b.productionTime,
    rally: point(b.rally),
    // Ce que vise le ralliement (ferme, chantier, gisement) : sans eux, les
    // villageois formés après la reprise se contentent d'y marcher.
    rallyEntity: refId(b.rallyEntity),
    rallyResource: b.rallyResource ? { tx: b.rallyResource.tx, ty: b.rallyResource.ty } : null,
    // Relevés des bâtisseurs : le rendement du prochain tick en dépend.
    builderCount: b.builderCount, activeBuilders: b.activeBuilders, assignedBuilders: b.assignedBuilders,
    foodLeft: b.foodLeft,
    garrison: b.garrison.map(refId).filter((id) => id !== null),
    target: refId(b.target),
    attackCooldown: b.attackCooldown, scanCooldown: b.scanCooldown,
    createdAt: b.createdAt, lastHitAt: b.lastHitAt,
  };
}

function serializeAI(ai) {
  return {
    index: ai.index, rng: ai.rng.s, timer: ai.timer, attackTimer: ai.attackTimer,
    armyTarget: ai.armyTarget, waveCount: ai.waveCount, defendUntil: ai.defendUntil,
    lastHouseAt: ai.lastHouseAt, compositionIndex: ai.compositionIndex,
    badSpots: [...ai.badSpots], wantFarm: !!ai.wantFarm,
    // Réserve pour le bâtiment voulu et commande d'unité chère en cours (voir ai.js).
    projet: ai.projet || null,
    commandeType: ai.commandeType || null, commandeDepuis: ai.commandeDepuis || 0, commandeAvance: ai.commandeAvance || 0,
    // L'annonce du niveau Facile (une seule par partie), l'alerte bornée dans
    // le temps et l'assaut d'un bâtiment qui tire (voir ai.js).
    annonceFaite: !!ai.annonceFaite,
    alerteDepuis: ai.alerteDepuis, repit: ai.repit,
    assaut: ai.assaut ? { cible: ai.assaut.cible, fin: ai.assaut.fin } : null,
    assauts: { ...ai.assauts }, assautsAge: ai.assautsAge,
    // Les bâtiments ennemis qui tirent près de sa base : ses unités évitent
    // leurs abords, et les chemins déjà demandés en dépendent.
    zones: ai.zones.map((z) => ({ ...z })),
    // (Prise de positions : ses soldats postés. Champ absent ailleurs.)
    ...(ai.gardes && ai.gardes.size ? { gardes: [...ai.gardes] } : {}),
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
    // La file des demandes de trajet, dans l'ordre : une demande en attente à
    // la sauvegarde doit être servie au même tick à la reprise.
    pathQueue: world.pathQueue.filter((u) => !u.dead).map((u) => u.id),
    map: serializeMap(world.map),
    fog: encodeBytes(world.fog.explored),
    players: world.players.map(serializePlayer),
    buildings: vivants(world.buildings).map(serializeBuilding),
    units: vivants(world.units).map(serializeUnit),
    projectiles: world.projectiles.filter((pr) => !pr.dead).map(serializeProjectile),
    ais: world.ais.map(serializeAI),
    // (Champ écrit pour une partie d'essai seulement : les sauvegardes des autres parties ne changent pas.)
    ...(world.essai ? { essai: world.essai } : {}),
    // (Prise de positions : qui tient quoi, les prises entamées, et où en est le compte des points.)
    ...(world.positions.length ? {
      positions: world.positions.map((p) => ({ camp: p.camp, preneur: p.preneur, prise: p.prise })),
      pasDePoints: world.pasDePoints,
    } : {}),
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
    // Champ absent (sauvegarde d'avant les civilisations) : Atlantes.
    civs: (data.players || []).map((j) => j && j.civ),
    // Champ absent (sauvegarde d'avant les niveaux, ou partie sans niveaux) : tout au niveau 1.
    niveaux: (data.players || []).map((j) => j && j.niveaux),
    troupesInterdites: (data.players || []).map((j) => j && j.interdites),
    // (Champ absent : l'ordinateur ne forme rien de plus que son ordinaire.)
    troupesEnPlus: (data.players || []).map((j) => j && j.enPlus),
    // (Partie d'essai : la troupe essayée, pour ses places de population offertes.)
    essai: data.essai,
  });
  world.time = data.time || 0;
  world.humanIndex = data.humanIndex || 0;
  world.rng.s = data.rng >>> 0;
  world.fogTimer = data.fogTimer || 0;
  world.popWarnCooldown = data.popWarnCooldown || 0;
  world.accessResetTimer = data.accessResetTimer || 0;
  // (Les positions sont à leur place, refaites avec la carte : seul leur état vient de la sauvegarde.)
  (data.positions || []).forEach((saved, i) => {
    const pos = world.positions[i];
    if (!pos || !saved) return;
    pos.camp = saved.camp === 0 || saved.camp === 1 ? saved.camp : -1;
    pos.preneur = saved.preneur === 0 || saved.preneur === 1 ? saved.preneur : -1;
    pos.prise = Math.max(0, Math.floor(saved.prise) || 0);
  });
  world.pasDePoints = Math.max(0, Math.floor(data.pasDePoints) || 0);

  // 1. La carte : gisements disparus, puis contenu restant.
  for (const i of data.map.disparus) world.map.clearResource(i);
  for (const a of data.map.ajoutes || []) {
    world.map.resources.set(a.i, { type: a.type, amount: a.amount, max: a.max, tx: a.tx, ty: a.ty, variant: a.variant, gibier: a.gibier, passable: true });
  }
  for (const [i, amount] of data.map.restant) {
    const res = world.map.resources.get(i);
    if (res) res.amount = amount;
  }
  for (const i of data.map.injoignables || []) {
    const res = world.map.resources.get(i);
    if (res) res.inaccessible = true;
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
    // (Une statistique née depuis la sauvegarde garde sa valeur de départ.)
    p.stats = { ...p.stats, ...saved.stats, gathered: { ...saved.stats.gathered } };
    // `ageProgress` référence un bâtiment : rattaché plus bas.
    p.ageProgress = saved.ageProgress ? { ...saved.ageProgress } : null;
    if (p.ageProgress && !p.ageProgress.cost) p.ageProgress.cost = { ...PRIX_AGES_AVANT_OCTOBRE[saved.age + 1] };
  });

  // 3. Les entités. On les crée d'abord avec des identifiants temporaires, puis
  // on rétablit les vrais : sans ça, deux entités pourraient se disputer une
  // même clé pendant la reconstruction.
  const paires = [];
  for (const saved of data.buildings) {
    const b = world.spawnBuilding(saved.player, saved.type, saved.tx, saved.ty, saved.complete);
    b.hp = saved.hp;
    b.buildProgress = saved.buildProgress;
    b.unreachable = !!saved.unreachable;
    b.gatherUnreachable = !!saved.gatherUnreachable;
    b.queue = saved.queue.map((q) => ({ ...q, cost: { ...q.cost } }));
    b.productionTime = saved.productionTime;
    b.rally = saved.rally ? { ...saved.rally } : null;
    b.rallyResource = saved.rallyResource ? { ...saved.rallyResource } : null;
    b.builderCount = saved.builderCount || 0;
    b.activeBuilders = saved.activeBuilders || 0;
    b.assignedBuilders = saved.assignedBuilders || 0;
    b.foodLeft = saved.foodLeft;
    b.attackCooldown = saved.attackCooldown;
    b.scanCooldown = saved.scanCooldown;
    b.createdAt = saved.createdAt;
    b.lastHitAt = saved.lastHitAt ?? -999;   // (absent des sauvegardes plus anciennes)
    paires.push([saved, b]);
  }
  for (const saved of data.units) {
    const u = saved.animal
      ? world.spawnAnimal(saved.type, saved.x, saved.y, saved.player)
      : world.spawnUnit(saved.player, saved.type, saved.x, saved.y);
    u.x = saved.x; u.y = saved.y;          // position exacte, sans recalage
    if (saved.animal) {
      u.home = saved.animal.home ? { ...saved.animal.home } : { x: saved.x, y: saved.y };
      u.wanderTimer = saved.animal.wanderTimer || 0;
      u.fleeTimer = saved.animal.fleeTimer || 0;
      u.captureCooldown = saved.animal.captureCooldown || 0;
    }
    u.hp = saved.hp;
    u.state = saved.state;
    u.facing = saved.facing;
    u.stance = saved.stance;
    u.guardPoint = saved.guardPoint ? { ...saved.guardPoint } : null;
    u.carry = { ...saved.carry };
    u.resourceTile = saved.resourceTile ? { ...saved.resourceTile } : null;
    u.lastResourceTile = saved.lastResourceTile ? { ...saved.lastResourceTile } : null;
    u.gatherSpot = saved.gatherSpot ? { ...saved.gatherSpot } : null;
    u.snugTime = saved.snugTime || 0;
    u.destination = saved.destination ? { ...saved.destination } : null;
    u.path = saved.path ? saved.path.map((n) => ({ ...n })) : null;
    u.pathIndex = saved.pathIndex;
    u.attackCooldown = saved.attackCooldown;
    u.scanCooldown = saved.scanCooldown;
    u.repathCooldown = saved.repathCooldown;
    u.repathAttempts = saved.repathAttempts;
    u.approcheSuspendue = saved.approcheSuspendue || 0;
    u.meilleurReste = saved.meilleurReste ?? Infinity;
    u.sansProgres = saved.sansProgres || 0;
    u.stuckTime = saved.stuckTime;
    u.blockedTime = saved.blockedTime;
    u.autoTarget = saved.autoTarget;
    u.groupSpeed = saved.groupSpeed;
    u.rallyAfterFight = saved.rallyAfterFight ? { ...saved.rallyAfterFight } : null;
    u.pendingJob = null;   // rattaché plus bas : il peut désigner une ferme
    u.failedDropoffs = saved.failedDropoffs ? new Set(saved.failedDropoffs) : null;
    u.fleeUntil = saved.fleeUntil;
    u.spawnTime = saved.spawnTime;
    u.lastHitAt = saved.lastHitAt ?? -999;
    u.pathPending = !!saved.pathPending;
    u.pathRequest = saved.pathRequest ? { ...saved.pathRequest, rect: saved.pathRequest.rect ? { ...saved.pathRequest.rect } : null } : null;
    u.pathSeq = saved.pathSeq || 0;
    paires.push([saved, u]);
  }

  // 4. Identifiants d'origine, puis index reconstruit d'un bloc.
  const parId = new Map();
  for (const [saved, entity] of paires) { entity.id = saved.id; parId.set(saved.id, entity); }
  world.byId.clear();
  for (const [, entity] of paires) world.byId.set(entity.id, entity);
  world.nextId = Math.max(world.nextId, data.nextId || 1);
  // Les constructions ci-dessus ont tiré au sort (orientations, minuteries) :
  // on remet le générateur là où la sauvegarde l'a laissé, sinon la partie
  // reprise ne rejoue pas les mêmes hasards — la pâture des animaux, d'abord.
  world.rng.s = data.rng >>> 0;
  world.pathQueue = (data.pathQueue || []).map((id) => parId.get(id)).filter((u) => u && u.pathPending);

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
      // (Champ absent des sauvegardes plus anciennes : pas de riposte en cours.)
      const delaisse = saved.reprise ? cible(saved.reprise.batiment) : null;
      entity.reprise = delaisse ? { ...saved.reprise, batiment: delaisse } : null;
      if (saved.posteAvantAbri) {
        entity.posteAvantAbri = {
          ...saved.posteAvantAbri, farm: cible(saved.posteAvantAbri.farm), site: cible(saved.posteAvantAbri.site),
        };
      }
    } else {
      entity.garrison = (saved.garrison || []).map(cible).filter(Boolean);
      entity.rallyEntity = cible(saved.rallyEntity);
    }
  }
  for (const p of world.players) {
    if (p.ageProgress) p.ageProgress.building = cible(p.ageProgress.building);
  }
  // Les flèches en vol : une salve perdue au rechargement serait des dégâts
  // évaporés. On les laisse tomber seulement si la cible a disparu : celle d'un
  // tireur mort en route touche encore, comme dans la partie d'origine.
  for (const saved of data.projectiles || []) {
    const t = saved.tireur;
    // Un boulet n'a pas besoin de sa cible pour finir sa course : son point de chute suffit.
    const target = cible(saved.target) || (saved.sol && { x: saved.sol.x, y: saved.sol.y });
    const source = cible(saved.source)
      || (t && { x: t.x, y: t.y, playerIndex: t.player, dead: true, type: t.type, def: entityDef(t.type) });
    if (!source || !target) continue;
    const pr = new Projectile(world, source, target, saved.damage);
    if (saved.sol) pr.sol = { x: saved.sol.x, y: saved.sol.y };
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
    ai.wantFarm = !!saved.wantFarm;
    ai.projet = saved.projet || null;
    ai.commandeType = saved.commandeType || null;
    ai.commandeDepuis = saved.commandeDepuis || 0;
    ai.commandeAvance = saved.commandeAvance || 0;
    ai.annonceFaite = !!saved.annonceFaite;
    ai.alerteDepuis = saved.alerteDepuis || 0;
    ai.repit = saved.repit || 0;
    ai.assaut = saved.assaut ? { cible: saved.assaut.cible, fin: saved.assaut.fin } : null;
    ai.assauts = { ...(saved.assauts || {}) };
    ai.assautsAge = saved.assautsAge || 0;
    ai.zones = (saved.zones || []).map((z) => ({ ...z }));
    ai.gardes = new Map(Array.isArray(saved.gardes) ? saved.gardes : []);
    ai.poserZones();
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

// --- Témoin de coupure -------------------------------------------------------
//
// Un téléphone peut couper la page sans prévenir — à court de mémoire, ou sur
// un geste de rechargement — et rien ne s'exécute à cet instant. On tient donc
// à jour, pendant la partie, une petite marque (clé à part, `storage()` plus
// bas), « fermée » à chaque sortie normale : partie finie, retour à l'accueil,
// page masquée. Au lancement suivant, une marque restée ouverte dit que la
// page a été coupée en pleine partie, et ce qu'elle pesait alors. Sans
// stockage (navigation privée), rien n'est écrit et rien n'est signalé.

export const TEMOIN_KEY = 'aem.temoin.v1';
const INCIDENTS_MAX = 5;          // incidents gardés : les derniers
const RECHARGEMENT_MS = 20000;    // quittée en pleine partie et relancée dans ce délai : la page a été rechargée

/**
 * Ce que la marque retient : l'heure, les minutes de jeu, les unités en vie,
 * et ce que l'appelant mesure (`mo` d'images de troupes, `troupes` en mémoire,
 * `dpr` pixels par point, page `visible` ou non).
 */
export function etatTemoin(world, mesures = {}) {
  let unites = 0;
  for (const u of world.units) if (!u.dead && !u.isAnimal) unites++;
  return {
    h: mesures.heure ?? Date.now(),
    min: Math.round(world.time / 6) / 10,
    unites,
    mo: Math.round(mesures.mo || 0),
    troupes: mesures.troupes || 0,
    dpr: mesures.dpr || 1,
    visible: mesures.visible !== false,
  };
}

/** Le témoin rangé, `{ dernier, incidents }` ; absent ou illisible, un témoin vide. */
export function lireTemoin(store = storage()) {
  const vide = { dernier: null, incidents: [] };
  if (!store) return vide;
  try {
    const t = JSON.parse(store.getItem(TEMOIN_KEY) || 'null');
    if (!t || typeof t !== 'object') return vide;
    return {
      dernier: t.dernier && typeof t.dernier === 'object' ? t.dernier : null,
      incidents: Array.isArray(t.incidents)
        ? t.incidents.filter((i) => i && typeof i === 'object').slice(-INCIDENTS_MAX) : [],
    };
  } catch {
    return vide;
  }
}

function rangerTemoin(temoin, store) {
  try {
    store.setItem(TEMOIN_KEY, JSON.stringify(temoin));
    return true;
  } catch {
    return false;
  }
}

/** Tient la marque à jour, ouverte (toutes les quelques secondes, et quand la page revient). */
export function ecrireTemoin(etat, store = storage()) {
  if (!store || !etat) return false;
  const temoin = lireTemoin(store);
  temoin.dernier = { ...etat, ferme: undefined };
  return rangerTemoin(temoin, store);
}

/**
 * Ferme la marque. `raison` : « fin » (partie terminée), « accueil » (retour
 * au menu), « masquee » (page passée en arrière-plan) ou « quittee » (page
 * quittée alors qu'elle était visible). La première raison l'emporte : une
 * page rechargée est quittée PUIS masquée, et c'est « quittee » qui compte.
 * `etat` rafraîchit les chiffres au passage.
 */
export function fermerTemoin(raison, etat = null, store = storage()) {
  if (!store) return false;
  const temoin = lireTemoin(store);
  if (temoin.dernier ? temoin.dernier.ferme : !etat) return false;   // déjà fermée, ou rien à fermer
  temoin.dernier = { ...(etat || temoin.dernier), ferme: raison };
  return rangerTemoin(temoin, store);
}

/**
 * L'incident que raconte la dernière marque, ou null. `coupure` : restée
 * ouverte alors que la page était visible — le téléphone l'a coupée.
 * `rechargee` : quittée en pleine partie et relancée dans la foulée — un geste
 * « tirer pour rafraîchir », un rechargement. Une page masquée puis fermée
 * n'est pas un incident : c'est la façon ordinaire de quitter. Pure.
 */
export function incidentDe(dernier, maintenant) {
  if (!dernier) return null;
  const genre = !dernier.ferme ? (dernier.visible ? 'coupure' : null)
    : dernier.ferme === 'quittee' && maintenant - dernier.h < RECHARGEMENT_MS ? 'rechargee' : null;
  if (!genre) return null;
  const nombre = (v) => Number(v) || 0;
  return {
    genre, h: nombre(dernier.h), min: nombre(dernier.min), unites: nombre(dernier.unites),
    mo: nombre(dernier.mo), troupes: nombre(dernier.troupes), dpr: nombre(dernier.dpr),
  };
}

/**
 * Au lancement : relève la dernière marque, puis l'efface — relancer la page
 * deux fois ne compte pas deux incidents. Un incident rejoint la liste des
 * cinq derniers. Rend l'incident, ou null.
 */
export function releverTemoin(maintenant = Date.now(), store = storage()) {
  if (!store) return null;
  try {
    const temoin = lireTemoin(store);
    if (!temoin.dernier) return null;
    const incident = incidentDe(temoin.dernier, maintenant);
    if (incident) temoin.incidents = [...temoin.incidents, incident].slice(-INCIDENTS_MAX);
    temoin.dernier = null;
    rangerTemoin(temoin, store);
    return incident;
  } catch {
    return null;
  }
}

/**
 * L'incident que l'accueil doit encore dire : le dernier de la liste, tant
 * qu'aucune partie n'a été lancée depuis (`lu`). La marque ne se relève qu'une
 * fois : sans cette trace, la ligne ne tiendrait qu'un chargement, et une page
 * relancée avant d'avoir été lue ne dirait plus rien de la coupure.
 */
export function incidentNonLu(store = storage()) {
  const { incidents } = lireTemoin(store);
  const dernier = incidents[incidents.length - 1];
  return dernier && !dernier.lu ? dernier : null;
}

/** Une partie est lancée : l'accueil n'a plus à redire les incidents relevés jusque-là. */
export function marquerIncidentsLus(store = storage()) {
  if (!store) return false;
  const temoin = lireTemoin(store);
  if (temoin.incidents.every((i) => i.lu)) return false;   // rien de neuf : on n'écrit pas
  for (const i of temoin.incidents) i.lu = true;
  return rangerTemoin(temoin, store);
}

/** « après 12 min — 180 Mo d’images, 64 unités » : où en était la partie, ce que pesait la page. */
export function resumeIncident(incident) {
  const duree = incident.min >= 1 ? `après ${Math.round(incident.min)} min` : 'après moins d’une minute';
  return `${duree} — ${incident.mo} Mo d’images, ${incident.unites} unité${incident.unites > 1 ? 's' : ''}`;
}

/** La ligne de l'écran d'accueil. */
export function phraseIncident(incident) {
  return incident.genre === 'rechargee'
    ? `La page a été rechargée en pleine partie, ${resumeIncident(incident)}`
    : `La dernière partie s’est interrompue ${resumeIncident(incident)}`;
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

// --- Progression ---------------------------------------------------------------
//
// Le profil du joueur (classement, ligue, coffres, fragments, niveaux : voir
// js/progression.js), rangé sous sa propre clé comme le palmarès. Tant qu'il
// n'y a pas de compte, c'est ici qu'il vit ; son format est celui que lira le
// serveur le jour où il fera foi.

export const PROGRESSION_KEY = 'aem.progression.v1';

/** Le profil rangé sur cet appareil, remis d'aplomb ; un profil neuf s'il n'y a rien ou si rien n'est lisible. */
export function lireProgression() {
  const store = storage();
  let rangee = null;
  try { rangee = store ? JSON.parse(store.getItem(PROGRESSION_KEY) || 'null') : null; } catch { rangee = null; }
  return regulariser(migrerProfil(rangee)).profil;
}

/** Appelé après chaque écriture réussie, avec le profil rangé : le rangement durable s'y branche (js/rangement-durable.js). */
let apresEcriture = null;
export function quandLaProgressionSEcrit(fonction) { apresEcriture = typeof fonction === 'function' ? fonction : null; }

/** Range le profil. Renvoie false si le navigateur refuse (mode privé, quota) : rien n'est alors retenu. */
export function ecrireProgression(profil) {
  const store = storage();
  if (!store) return false;
  const range = migrerProfil(profil);
  try { store.setItem(PROGRESSION_KEY, JSON.stringify(range)); } catch { return false; }
  if (apresEcriture) { try { apresEcriture(range); } catch { /* le second rangement ne doit jamais gêner le premier */ } }
  return true;
}

// --- Palmarès ------------------------------------------------------------------
//
// Ce qui reste d'une partie finie : par format et par difficulté, les
// victoires, les défaites, le meilleur temps de victoire et le meilleur score
// d'une partie Express. Rangé sous sa propre clé, à part de la partie en
// cours : `clearSave` n'y touche pas, et une sauvegarde refusée pour sa version
// ne l'emporte pas avec elle.

export const PALMARES_KEY = 'aem.palmares.v1';
/** En dessous, un abandon n'est pas une partie : on s'est trompé de réglage, on relance. */
const ABANDON_COMPTE_APRES = 60;

const compteur = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Le palmarès entier ; vide si rien n'est rangé, ou si le stockage est indisponible ou abîmé. */
export function lirePalmares() {
  const store = storage();
  if (!store) return {};
  try {
    const data = JSON.parse(store.getItem(PALMARES_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/**
 * La ligne d'un format et d'une difficulté, toujours complète : `temps` est le
 * meilleur temps de victoire (en secondes, `null` sans victoire au terrain),
 * `score` le meilleur score d'une partie chronométrée (0 s'il n'y en a pas).
 */
export function lignePalmares(palmares, mode, difficulty) {
  const l = (palmares && palmares[`${mode}.${difficulty}`]) || {};
  return {
    victoires: compteur(l.victoires), defaites: compteur(l.defaites),
    temps: compteur(l.temps) || null, score: compteur(l.score),
  };
}

/**
 * Inscrit une partie finie. Renvoie `null` si elle ne compte pas (abandon dans
 * la première minute) ou si rien ne peut être retenu sur cet appareil ; sinon
 * la ligne à jour et, pour le temps et pour le score, ce que cette partie en a
 * fait — `{ valeur, ancien, record }`, ou `null` quand elle ne concourt pas.
 */
export function inscrireAuPalmares({ mode, difficulty, humanIndex = 0, result }) {
  const store = storage();
  if (!store || !result) return null;
  if (result.resigned && result.time < ABANDON_COMPTE_APRES) return null;
  const palmares = lirePalmares();
  const ligne = lignePalmares(palmares, mode, difficulty);
  if (result.victory) ligne.victoires++;
  else if (result.winner !== -1) ligne.defaites++;   // une égalité n'est ni l'une ni l'autre

  // Le temps ne récompense qu'une victoire au terrain : aux points, toutes les
  // parties durent le temps imparti.
  let temps = null;
  if (result.victory && !result.timeUp) {
    const valeur = Math.max(1, Math.floor(result.time));
    temps = { valeur, ancien: ligne.temps, record: ligne.temps === null || valeur < ligne.temps };
    if (temps.record) ligne.temps = valeur;
  }
  // Le score d'un camp rasé ou qui abandonne ne dit rien : seules concourent
  // les parties gagnées ou menées jusqu'au bout du temps.
  let score = null;
  if (Array.isArray(result.scores) && !result.resigned && (result.victory || result.timeUp)) {
    const valeur = compteur(result.scores[humanIndex]);
    score = { valeur, ancien: ligne.score || null, record: valeur > ligne.score };
    if (score.record) ligne.score = valeur;
  }

  palmares[`${mode}.${difficulty}`] = ligne;
  // Écriture refusée (navigation privée, quota) : mieux vaut ne rien annoncer
  // qu'un record qui ne sera pas retenu.
  try { store.setItem(PALMARES_KEY, JSON.stringify(palmares)); } catch { return null; }
  return { ligne, temps, score };
}

/** Le palmarès en une ligne, pour l'accueil (« 3 victoires · meilleur temps 18:42 ») ; vide s'il n'y a rien à montrer. */
export function resumePalmares(ligne) {
  if (!ligne || (!ligne.victoires && !ligne.score)) return '';
  const morceaux = [];
  if (ligne.victoires) morceaux.push(`${ligne.victoires} victoire${ligne.victoires > 1 ? 's' : ''}`);
  if (ligne.temps) morceaux.push(`meilleur temps ${formatTime(ligne.temps)}`);
  if (ligne.score) morceaux.push(`meilleur score ${ligne.score.toLocaleString('fr-FR')}`);
  return morceaux.join(' · ');
}
