export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const SCENE_KEYS = {
  BOOT: 'BootScene',
  MENU: 'MenuScene',
  GAME: 'GameScene',
  UI: 'UIScene',
} as const;

export const EVENTS = {
  HUD_UPDATE: 'hud-update',
  LEVEL_UP: 'level-up',
  UPGRADE_CHOSEN: 'upgrade-chosen',
  GAME_OVER: 'game-over',
  RESTART: 'restart',
  CHOOSE_CARD: 'choose-card',
  WAVE_ALERT: 'wave-alert',
} as const;

export const TEXTURES = {
  TILE: 'desert-tile',
  GEM: 'bio-gem',
  BLOOD: 'blood-splat',
  BULLET: 'bullet',
  DRONE: 'drone',
  SHADOW: 'shadow',
  PIXEL: 'pixel',
  TROOPER: 'trooper',
  WARRIOR: 'warrior',
  TIGER: 'tiger',
  FLAME: 'flame',
  FIREBALL: 'fireball',
  CRATER: 'crater',
  ROCKET: 'rocket',
  PELLET: 'pellet',
  POD: 'drop-pod',
  CRAWL: 'trooper-crawl',
} as const;

export const ANIMS = {
  TROOPER_WALK: 'trooper-walk',
  TROOPER_FIRE: 'trooper-fire',
  TROOPER_IDLE: 'trooper-idle',
  WARRIOR_WALK: 'warrior-walk',
  TIGER_WALK: 'tiger-walk',
} as const;

export const FRAMES = {
  WALK_FRAMES: 8,
  TROOPER_SIZE: 96,
  WARRIOR_SIZE: 96,
  TIGER_SIZE: 128,
  TILE_SIZE: 256,
  BLOOD_VARIANTS: 3,
} as const;

/** Key of a single baked animation frame, e.g. frameKey('warrior', 3) -> 'warrior-3'. */
export const frameKey = (base: string, index: number): string => `${base}-${index}`;

/** Precomputed keys for every walk frame of a base texture, so the game loop never builds strings. */
export const frameKeys = (base: string): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < FRAMES.WALK_FRAMES; i++) {
    keys.push(frameKey(base, i));
  }
  return keys;
};

export const PLAYER_CONFIG = {
  maxHp: 100,
  speed: 190,
  pickupRadius: 90,
  magnetSpeed: 520,
  invulnMs: 450,
  bodyRadius: 14,
} as const;

export type EnemyKey = 'warrior' | 'tiger';

export interface EnemyType {
  key: EnemyKey;
  texture: string;
  anim: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  scale: number;
  bodyRadius: number;
  knockback: number;
}

export const ENEMY_TYPES: Record<EnemyKey, EnemyType> = {
  warrior: {
    key: 'warrior',
    texture: TEXTURES.WARRIOR,
    anim: ANIMS.WARRIOR_WALK,
    hp: 18,
    speed: 82,
    damage: 6,
    xp: 1,
    scale: 0.75,
    bodyRadius: 16,
    knockback: 140,
  },
  tiger: {
    key: 'tiger',
    texture: TEXTURES.TIGER,
    anim: ANIMS.TIGER_WALK,
    hp: 120,
    speed: 58,
    damage: 16,
    xp: 8,
    scale: 0.8,
    bodyRadius: 30,
    knockback: 40,
  },
};

export const POOL_SIZES = {
  enemies: 400,
  projectiles: 300,
  gems: 500,
  damageTexts: 80,
  blood: 120,
} as const;

export const SPAWN_CONFIG = {
  ringMin: 700,
  ringMax: 820,
  maxAlive: 380,
  baseInterval: 900,
  minInterval: 120,
  hpScalePerMinute: 0.35,
  speedScalePerMinute: 0.06,
  tigerStartSec: 75,
} as const;

export const XP_CONFIG = {
  base: 6,
  growth: 1.28,
  flat: 3,
} as const;

export const SQUAD_CAP = 5;

export const SQUAD_CONFIG = {
  maxHp: 45,
  speed: 215,
  regenPerSec: 1,
  bodyRadius: 13,
  fireIntervalMs: 560,
  damage: 7,
  bulletSpeed: 620,
  range: 460,
  scanIntervalMs: 160,
  invulnMs: 600,
  /** Seconds a downed trooper crawls toward the player before being extracted. */
  crawlSec: 5,
  reviveHpFraction: 0.5,
  reviveRadius: 46,
  /** Teleports a stray squadmate back if the player outruns it by this distance. */
  tetherDistance: 720,
  beaconFirstSec: 60,
  beaconMinSec: 120,
  beaconMaxSec: 180,
  beaconLifeSec: 110,
  beaconHoldSec: 3,
  beaconRadius: 95,
  beaconMinDistance: 820,
  beaconMaxDistance: 1100,
} as const;

export const DASH_CONFIG = {
  durationMs: 190,
  speed: 780,
  rechargeMs: 3200,
  graceMs: 80,
} as const;

export const PSI_CONFIG = {
  periodMs: 7000,
  radius: 280,
  stunMs: 1600,
} as const;
