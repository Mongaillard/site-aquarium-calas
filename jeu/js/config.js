// ---------------------------------------------------------------------------
// Données de jeu : unités, bâtiments, technologies, âges, équilibrage.
// Tout est exprimé en unités « logiques » :
//   - distances et portées en cases (TILE pixels monde par case)
//   - vitesses en cases/seconde
//   - temps en secondes
// ---------------------------------------------------------------------------

export const TILE = 32;
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
export const POP_MAX = 60;

export const RESOURCES = ['food', 'wood', 'gold'];

export const RESOURCE_LABELS = {
  food: 'Nourriture',
  wood: 'Bois',
  gold: 'Or',
};

export const RESOURCE_ICONS = {
  food: '🍖',
  wood: '🪵',
  gold: '🪙',
};

// --- Âges -------------------------------------------------------------------

export const AGES = [
  { id: 0, name: 'Âge Sombre', short: 'I' },
  { id: 1, name: 'Âge Féodal', short: 'II', cost: { food: 300 }, time: 40 },
  { id: 2, name: 'Âge des Châteaux', short: 'III', cost: { food: 500, gold: 150 }, time: 55 },
];

// --- Unités -----------------------------------------------------------------
//  class    : catégorie utilisée pour les bonus de dégâts
//  attackType: 'melee' ou 'pierce' (confronté à l'armure correspondante)
//  bonus    : dégâts supplémentaires contre une catégorie

export const UNIT_TYPES = {
  villager: {
    id: 'villager', name: 'Villageois', icon: '🧑‍🌾', class: 'villager',
    cost: { food: 50 }, trainTime: 20, hp: 45, speed: 1.15,
    attack: 3, attackType: 'melee', range: 0.7, attackSpeed: 2.0,
    meleeArmor: 0, pierceArmor: 0, los: 5, radius: 9,
    carry: 10, gather: { wood: 0.55, gold: 0.50, food: 0.50 },
    from: 'towncenter', age: 0,
    desc: 'Récolte, construit et répare. La base de toute économie.',
  },
  militia: {
    id: 'militia', name: 'Milicien', icon: '⚔️', class: 'infantry',
    cost: { food: 60, gold: 20 }, trainTime: 16, hp: 45, speed: 1.0,
    attack: 5, attackType: 'melee', range: 0.8, attackSpeed: 1.8,
    meleeArmor: 1, pierceArmor: 1, los: 5, radius: 9,
    from: 'barracks', age: 0,
    desc: 'Fantassin polyvalent et bon marché.',
  },
  spearman: {
    id: 'spearman', name: 'Lancier', icon: '🔱', class: 'infantry',
    cost: { food: 35, wood: 25 }, trainTime: 14, hp: 45, speed: 1.0,
    attack: 4, attackType: 'melee', range: 1.0, attackSpeed: 2.0,
    bonus: { cavalry: 10, siege: 6 },
    meleeArmor: 0, pierceArmor: 0, los: 5, radius: 9,
    from: 'barracks', age: 1,
    desc: 'Redoutable contre la cavalerie et les engins de siège.',
  },
  archer: {
    id: 'archer', name: 'Archer', icon: '🏹', class: 'archer',
    cost: { wood: 25, gold: 45 }, trainTime: 18, hp: 30, speed: 1.0,
    attack: 4, attackType: 'pierce', range: 5, attackSpeed: 2.0,
    bonus: { infantry: 1 },
    meleeArmor: 0, pierceArmor: 0, los: 6, radius: 8,
    projectile: true,
    from: 'archery', age: 1,
    desc: 'Tire à distance. Fragile au corps à corps.',
  },
  scout: {
    id: 'scout', name: 'Éclaireur', icon: '🐎', class: 'cavalry',
    cost: { food: 80 }, trainTime: 20, hp: 45, speed: 1.75,
    attack: 3, attackType: 'melee', range: 0.9, attackSpeed: 2.2,
    meleeArmor: 0, pierceArmor: 2, los: 9, radius: 10,
    from: 'stable', age: 1,
    desc: 'Très rapide et large champ de vision : idéal pour explorer.',
  },
  knight: {
    id: 'knight', name: 'Cavalier', icon: '🛡️', class: 'cavalry',
    cost: { food: 60, gold: 75 }, trainTime: 22, hp: 100, speed: 1.5,
    attack: 10, attackType: 'melee', range: 0.9, attackSpeed: 1.8,
    bonus: { archer: 4, villager: 2, siege: 5 },
    meleeArmor: 2, pierceArmor: 2, los: 6, radius: 11,
    from: 'stable', age: 2,
    desc: 'Cavalerie lourde. Fonce sur les archers et les villageois.',
  },
  ram: {
    id: 'ram', name: 'Bélier', icon: '🪨', class: 'siege',
    cost: { wood: 160, gold: 75 }, trainTime: 26, hp: 200, speed: 0.6,
    attack: 4, attackType: 'melee', range: 1.2, attackSpeed: 4.0,
    bonus: { building: 35 },
    meleeArmor: 2, pierceArmor: 7, los: 4, radius: 13,
    from: 'siege', age: 2,
    desc: 'Démolit les bâtiments. Lent et vulnérable aux lanciers.',
  },
};

// --- Bâtiments --------------------------------------------------------------

export const BUILDING_TYPES = {
  towncenter: {
    id: 'towncenter', name: 'Centre-Ville', icon: '🏛️',
    cost: { wood: 275 }, buildTime: 80, hp: 1400, size: 3,
    meleeArmor: 3, pierceArmor: 7, los: 8, popBonus: 5,
    dropoff: ['food', 'wood', 'gold'], trains: ['villager'], age: 0, limit: 2,
    desc: 'Forme les villageois, stocke les ressources et permet de passer à l’âge suivant.',
  },
  house: {
    id: 'house', name: 'Maison', icon: '🏠',
    cost: { wood: 25 }, buildTime: 18, hp: 320, size: 2,
    meleeArmor: 1, pierceArmor: 6, los: 4, popBonus: 5, age: 0,
    desc: 'Augmente la population maximale de 5.',
  },
  mill: {
    id: 'mill', name: 'Moulin', icon: '🌾',
    cost: { wood: 100 }, buildTime: 30, hp: 400, size: 2,
    meleeArmor: 1, pierceArmor: 6, los: 5, dropoff: ['food'], age: 0,
    desc: 'Dépôt de nourriture. Débloque la construction de fermes.',
  },
  lumbercamp: {
    id: 'lumbercamp', name: 'Camp de bûcherons', icon: '🪓',
    cost: { wood: 100 }, buildTime: 28, hp: 380, size: 2,
    meleeArmor: 1, pierceArmor: 6, los: 5, dropoff: ['wood'], age: 0,
    desc: 'Dépôt de bois. À construire près des forêts.',
  },
  miningcamp: {
    id: 'miningcamp', name: 'Camp minier', icon: '⛏️',
    cost: { wood: 100 }, buildTime: 28, hp: 380, size: 2,
    meleeArmor: 1, pierceArmor: 6, los: 5, dropoff: ['gold'], age: 0,
    desc: 'Dépôt d’or. À construire près des filons.',
  },
  farm: {
    id: 'farm', name: 'Ferme', icon: '🌽',
    cost: { wood: 60 }, buildTime: 16, hp: 180, size: 2,
    meleeArmor: 0, pierceArmor: 3, los: 2, age: 0,
    requires: 'mill', walkable: true, farmFood: 260,
    desc: 'Source de nourriture inépuisable tant qu’on la reconstruit.',
  },
  barracks: {
    id: 'barracks', name: 'Caserne', icon: '🗡️',
    cost: { wood: 175 }, buildTime: 45, hp: 800, size: 3,
    meleeArmor: 2, pierceArmor: 7, los: 6, trains: ['militia', 'spearman'], age: 0,
    desc: 'Forme l’infanterie.',
  },
  archery: {
    id: 'archery', name: 'Archerie', icon: '🎯',
    cost: { wood: 175 }, buildTime: 45, hp: 800, size: 3,
    meleeArmor: 2, pierceArmor: 7, los: 6, trains: ['archer'], age: 1,
    desc: 'Forme les archers.',
  },
  stable: {
    id: 'stable', name: 'Écurie', icon: '🐴',
    cost: { wood: 175 }, buildTime: 45, hp: 800, size: 3,
    meleeArmor: 2, pierceArmor: 7, los: 6, trains: ['scout', 'knight'], age: 1,
    desc: 'Forme la cavalerie.',
  },
  siege: {
    id: 'siege', name: 'Atelier de siège', icon: '🏗️',
    cost: { wood: 200 }, buildTime: 50, hp: 800, size: 3,
    meleeArmor: 2, pierceArmor: 7, los: 6, trains: ['ram'], age: 2,
    desc: 'Construit les engins de siège.',
  },
  blacksmith: {
    id: 'blacksmith', name: 'Forge', icon: '🔨',
    cost: { wood: 150 }, buildTime: 40, hp: 800, size: 3,
    meleeArmor: 2, pierceArmor: 7, los: 6, age: 1,
    techs: ['forging', 'scaleArmor', 'fletching'],
    desc: 'Améliore l’armement et l’armure de toutes vos troupes.',
  },
  tower: {
    id: 'tower', name: 'Tour de guet', icon: '🗼',
    cost: { wood: 100, gold: 25 }, buildTime: 35, hp: 700, size: 2,
    meleeArmor: 3, pierceArmor: 8, los: 8, age: 1,
    attack: 6, attackType: 'pierce', range: 7, attackSpeed: 1.6, projectile: true,
    bonus: { siege: 4 },
    desc: 'Défense fixe qui tire sur les ennemis à portée.',
  },
};

// --- Technologies -----------------------------------------------------------

export const TECHS = {
  wheelbarrow: {
    id: 'wheelbarrow', name: 'Brouette', icon: '🛒',
    cost: { food: 175, wood: 50 }, time: 35, age: 1, from: 'towncenter',
    desc: 'Villageois : +15 % de vitesse et +3 de capacité de charge.',
  },
  forging: {
    id: 'forging', name: 'Armes forgées', icon: '⚒️',
    cost: { food: 150, gold: 40 }, time: 35, age: 1, from: 'blacksmith',
    desc: '+1 attaque pour les unités de mêlée.',
  },
  fletching: {
    id: 'fletching', name: 'Flèches barbelées', icon: '🪶',
    cost: { food: 100, gold: 50 }, time: 30, age: 1, from: 'blacksmith',
    desc: '+1 attaque et +0,5 portée pour les unités à distance et les tours.',
  },
  scaleArmor: {
    id: 'scaleArmor', name: 'Armure d’écailles', icon: '🥋',
    cost: { food: 120, gold: 40 }, time: 35, age: 1, from: 'blacksmith',
    desc: '+1 armure de mêlée et +1 armure perforante.',
  },
};

// --- Paramètres de partie ---------------------------------------------------

export const START_RESOURCES = { food: 200, wood: 200, gold: 100 };

export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Facile',
    gatherBonus: 0.8, maxVillagers: 14, armyTrigger: 6, armyStep: 3,
    attackDelay: 300, reactionTime: 1.4,
    desc: 'L’IA se développe lentement et attaque tard.',
  },
  normal: {
    id: 'normal', name: 'Normal',
    gatherBonus: 1.0, maxVillagers: 20, armyTrigger: 8, armyStep: 4,
    attackDelay: 200, reactionTime: 0.9,
    desc: 'Une partie équilibrée, comme une escarmouche classique.',
  },
  hard: {
    id: 'hard', name: 'Difficile',
    gatherBonus: 1.25, maxVillagers: 26, armyTrigger: 9, armyStep: 5,
    attackDelay: 130, reactionTime: 0.5,
    desc: 'L’IA récolte plus vite et harcèle sans relâche.',
  },
};

export const MAP_SIZES = {
  small: { id: 'small', name: 'Petite', tiles: 72 },
  medium: { id: 'medium', name: 'Moyenne', tiles: 96 },
  large: { id: 'large', name: 'Grande', tiles: 120 },
};

export const PLAYER_COLORS = [
  { main: '#3b82f6', light: '#93c5fd', dark: '#1d4ed8', name: 'Bleu' },
  { main: '#ef4444', light: '#fca5a5', dark: '#b91c1c', name: 'Rouge' },
];

// Quantité de ressource contenue par case de terrain.
export const RESOURCE_TILE_AMOUNT = {
  wood: 120,
  gold: 550,
  food: 160, // buissons de baies
};

export function unitDef(type) { return UNIT_TYPES[type]; }
export function buildingDef(type) { return BUILDING_TYPES[type]; }
export function entityDef(type) { return UNIT_TYPES[type] || BUILDING_TYPES[type]; }
