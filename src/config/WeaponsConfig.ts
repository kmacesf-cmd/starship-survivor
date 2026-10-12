export type WeaponId =
  | 'morita'
  | 'shotgun'
  | 'nova'
  | 'orbit'
  | 'dualshotgun'
  | 'rocket'
  | 'flamer'
  | 'arc'
  | 'orbital';
export type StatId = 'might' | 'cooldown' | 'speed' | 'magnet' | 'health' | 'armor';

export interface WeaponLevelStats {
  damage: number;
  cooldownMs: number;
  count: number;
  speed: number;
  pierce: number;
  range: number;
  spread: number;
  /** Blast radius (rocket, orbital) or chain jump distance (arc) in px. */
  area: number;
  /** Burn damage per second applied on hit (flamethrower). */
  burn: number;
  /** Knockback multiplier applied on hit; 1 is the bug's natural knockback. */
  knock: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  description: string;
  levels: WeaponLevelStats[];
}

export interface StatDef {
  id: StatId;
  name: string;
  description: string;
  maxLevel: number;
  perLevel: number;
}

const L = (
  damage: number,
  cooldownMs: number,
  count: number,
  speed: number,
  pierce: number,
  range: number,
  spread: number,
  extra: { area?: number; burn?: number; knock?: number } = {},
): WeaponLevelStats => ({
  damage,
  cooldownMs,
  count,
  speed,
  pierce,
  range,
  spread,
  area: extra.area ?? 0,
  burn: extra.burn ?? 0,
  knock: extra.knock ?? 1,
});

/*
 * Field meaning per weapon:
 *  morita/shotgun/nova: speed = px/s, range = px travelled, spread = radians of cone jitter
 *  orbit: speed = radians/s, range = orbit radius px, pierce is unlimited, cooldownMs = per-enemy hit interval
 *  dualshotgun: count pellets in a cone of `spread` radians, knock = heavy knockback multiplier
 *  rocket: count guided rockets, speed px/s, range = fuse distance, area = splash radius, damage = splash damage
 *  flamer: one puff batch per cooldown, range = flame reach, spread = arc width, burn = burn DPS, pierce unlimited
 *  arc: count = chain targets, range = first-target reach, area = chain jump distance
 *  orbital: count = simultaneous strikes, speed = call-in delay ms, range = targeting reach, area = blast radius
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  morita: {
    id: 'morita',
    name: 'Morita Rifle',
    description: 'Auto-targets the nearest bug with rapid rounds.',
    levels: [
      L(9, 520, 1, 620, 0, 520, 0),
      L(11, 470, 1, 640, 0, 540, 0),
      L(11, 470, 2, 640, 0, 560, 0.08),
      L(14, 420, 2, 660, 1, 580, 0.08),
      L(16, 380, 3, 680, 1, 600, 0.1),
      L(20, 340, 3, 700, 2, 620, 0.1),
    ],
  },
  shotgun: {
    id: 'shotgun',
    name: 'Combat Shotgun',
    description: 'Cone of pellets that shreds close-range swarms.',
    levels: [
      L(6, 1300, 5, 520, 0, 300, 0.5),
      L(7, 1200, 6, 540, 0, 320, 0.55),
      L(8, 1100, 7, 560, 0, 340, 0.6),
      L(9, 1000, 8, 580, 1, 360, 0.65),
      L(11, 900, 9, 600, 1, 380, 0.7),
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nuke Pulse',
    description: 'Radial burst of rounds in every direction.',
    levels: [
      L(8, 2600, 8, 360, 1, 420, 0),
      L(10, 2400, 10, 380, 1, 440, 0),
      L(12, 2200, 12, 400, 2, 460, 0),
      L(14, 2000, 14, 420, 2, 480, 0),
      L(18, 1800, 18, 440, 3, 520, 0),
    ],
  },
  orbit: {
    id: 'orbit',
    name: 'Plasma Drones',
    description: 'Drones circle you and burn anything they touch.',
    levels: [
      L(5, 700, 2, 2.6, 999, 90, 0),
      L(6, 650, 3, 2.8, 999, 100, 0),
      L(7, 600, 4, 3.0, 999, 110, 0),
      L(9, 550, 5, 3.2, 999, 120, 0),
      L(12, 500, 6, 3.4, 999, 135, 0),
    ],
  },
  dualshotgun: {
    id: 'dualshotgun',
    name: 'Morita Dual Shotgun',
    description: 'Both barrels fire a wide 5-pellet cone with brutal close-range knockback.',
    levels: [
      L(7, 1200, 5, 560, 0, 250, 0.62, { knock: 4 }),
      L(8, 1100, 6, 570, 0, 265, 0.66, { knock: 4.5 }),
      L(9, 1050, 7, 580, 0, 280, 0.7, { knock: 5 }),
      L(10, 950, 8, 590, 1, 295, 0.74, { knock: 5.5 }),
      L(12, 850, 9, 600, 1, 310, 0.78, { knock: 6 }),
    ],
  },
  rocket: {
    id: 'rocket',
    name: 'Mini-Rocket Launcher',
    description: 'Slow guided rockets that detonate on contact with heavy splash damage and leave craters.',
    levels: [
      L(40, 2200, 1, 250, 0, 700, 0, { area: 95 }),
      L(50, 2000, 1, 260, 0, 720, 0, { area: 105 }),
      L(55, 1900, 2, 270, 0, 740, 0.35, { area: 115 }),
      L(65, 1750, 2, 280, 0, 760, 0.35, { area: 125 }),
      L(80, 1600, 3, 290, 0, 780, 0.5, { area: 140 }),
    ],
  },
  flamer: {
    id: 'flamer',
    name: 'Heavy Flamethrower',
    description: 'Streams penetrating fire in a cone that sets bugs ablaze with burning damage over time.',
    levels: [
      L(3, 130, 1, 300, 999, 200, 0.5, { burn: 6 }),
      L(4, 120, 1, 310, 999, 215, 0.52, { burn: 8 }),
      L(4, 115, 2, 320, 999, 230, 0.54, { burn: 10 }),
      L(5, 105, 2, 330, 999, 245, 0.56, { burn: 13 }),
      L(6, 95, 2, 340, 999, 260, 0.6, { burn: 16 }),
    ],
  },
  arc: {
    id: 'arc',
    name: 'Shock Arc Caster',
    description: 'Lightning that chains between nearby arachnids and briefly staggers them.',
    levels: [
      L(11, 900, 2, 0, 0, 360, 0, { area: 200 }),
      L(13, 850, 3, 0, 0, 380, 0, { area: 210 }),
      L(15, 800, 3, 0, 0, 400, 0, { area: 220 }),
      L(18, 750, 4, 0, 0, 420, 0, { area: 230 }),
      L(22, 700, 4, 0, 0, 440, 0, { area: 240 }),
    ],
  },
  orbital: {
    id: 'orbital',
    name: 'Orbital Strike Beacon',
    description: 'Calls a kinetic strike on the densest swarm. A huge blast zone every 15 seconds.',
    levels: [
      L(160, 15000, 1, 1500, 0, 650, 0, { area: 240, knock: 2 }),
      L(190, 15000, 1, 1450, 0, 650, 0, { area: 270, knock: 2 }),
      L(220, 14000, 1, 1400, 0, 700, 0, { area: 300, knock: 2 }),
      L(260, 13000, 2, 1350, 0, 700, 0, { area: 330, knock: 2 }),
      L(300, 12000, 2, 1300, 0, 750, 0, { area: 360, knock: 2 }),
    ],
  },
};

export const MAX_LEVEL = 10;

/** Weapons that gain an extra projectile at levels 8 and 10. */
const COUNT_GROWTH: Partial<Record<WeaponId, number>> = {
  morita: 1,
  shotgun: 1,
  nova: 2,
  orbit: 1,
  dualshotgun: 1,
  rocket: 1,
  flamer: 1,
};

const COOLDOWN_FLOOR: Record<WeaponId, number> = {
  morita: 200,
  shotgun: 600,
  nova: 1300,
  orbit: 380,
  dualshotgun: 600,
  rocket: 1100,
  flamer: 70,
  arc: 450,
  orbital: 9000,
};

/** Extends every weapon's authored levels up to MAX_LEVEL with scaled damage, cooldown, area and burn. */
const extendLevels = (id: WeaponId, levels: WeaponLevelStats[]): void => {
  const growth = COUNT_GROWTH[id] ?? 0;
  while (levels.length < MAX_LEVEL) {
    const prev = levels[levels.length - 1];
    const level = levels.length + 1;
    const countUp = growth > 0 && (level === 8 || level === 10) ? growth : 0;
    levels.push({
      damage: Math.round(prev.damage * 1.15 * 10) / 10,
      cooldownMs: Math.max(COOLDOWN_FLOOR[id], Math.round(prev.cooldownMs * 0.96)),
      count: prev.count + countUp,
      speed: id === 'orbit' ? prev.speed + 0.1 : id === 'orbital' ? prev.speed : prev.speed + (prev.speed > 0 ? 8 : 0),
      pierce: prev.pierce >= 999 ? prev.pierce : prev.pierce + (level === 8 ? 1 : 0),
      range: prev.range + (id === 'orbit' ? 5 : 8),
      spread: prev.spread,
      area: prev.area > 0 ? Math.round(prev.area * 1.04) : 0,
      burn: prev.burn > 0 ? Math.round(prev.burn * 1.15 * 10) / 10 : 0,
      knock: prev.knock,
    });
  }
};

for (const id of Object.keys(WEAPONS) as WeaponId[]) {
  extendLevels(id, WEAPONS[id].levels);
}

export const COUNT_LABELS: Record<WeaponId, string> = {
  morita: 'Rounds',
  shotgun: 'Pellets',
  nova: 'Rounds',
  orbit: 'Drones',
  dualshotgun: 'Pellets',
  rocket: 'Rockets',
  flamer: 'Streams',
  arc: 'Chain targets',
  orbital: 'Strikes',
};

export const WEAPON_IDS: WeaponId[] = [
  'morita',
  'shotgun',
  'nova',
  'orbit',
  'dualshotgun',
  'rocket',
  'flamer',
  'arc',
  'orbital',
];
export const MAX_WEAPONS = 4;

export const STATS: Record<StatId, StatDef> = {
  might: { id: 'might', name: 'Power Armor Servos', description: '+12% weapon damage', maxLevel: MAX_LEVEL, perLevel: 0.12 },
  cooldown: { id: 'cooldown', name: 'Auto-Loader', description: '-5% weapon cooldown', maxLevel: MAX_LEVEL, perLevel: 0.05 },
  speed: { id: 'speed', name: 'Jump Jets', description: '+6% move speed', maxLevel: MAX_LEVEL, perLevel: 0.06 },
  magnet: { id: 'magnet', name: 'Bio-Scanner', description: '+18% pickup radius', maxLevel: MAX_LEVEL, perLevel: 0.18 },
  health: { id: 'health', name: 'Medic Stims', description: '+12 max HP and heal 12', maxLevel: MAX_LEVEL, perLevel: 12 },
  armor: { id: 'armor', name: 'Ceramic Plating', description: '-0.6 damage taken per hit', maxLevel: MAX_LEVEL, perLevel: 0.6 },
};

export const STAT_IDS: StatId[] = ['might', 'cooldown', 'speed', 'magnet', 'health', 'armor'];
