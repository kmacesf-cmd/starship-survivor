import type { WeaponId } from './WeaponsConfig';

export type CharacterId = 'rico' | 'dizzy' | 'ace' | 'jenkins' | 'sugar';
export type GameModeId = 'klendathu' | 'outpost' | 'queen';

/** Numeric passive modifiers. Every field is always present so the player can copy them without allocating. */
export interface CharacterPerks {
  speedMult: number;
  hpMult: number;
  armorFlat: number;
  magnetMult: number;
  squadDamageMult: number;
  sprintMult: number;
  extraDashes: number;
  explosionRadiusMult: number;
  explosiveKnockback: boolean;
  psionicStun: boolean;
}

export const DEFAULT_PERKS: Readonly<CharacterPerks> = {
  speedMult: 1,
  hpMult: 1,
  armorFlat: 0,
  magnetMult: 1,
  squadDamageMult: 1,
  sprintMult: 1,
  extraDashes: 0,
  explosionRadiusMult: 1,
  explosiveKnockback: false,
  psionicStun: false,
};

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  bio: string;
  passives: string[];
  /** Display name of the signature weapon shown on the bio card. */
  loadoutName: string;
  /** Weapon actually equipped at the start of a run. */
  startingWeapon: WeaponId;
  perks: CharacterPerks;
  /** Multiplicative sprite tint (0xffffff = none). */
  tint: number;
  accent: number;
}

const perks = (overrides: Partial<CharacterPerks>): CharacterPerks => ({ ...DEFAULT_PERKS, ...overrides });

export const CHARACTER_IDS: CharacterId[] = ['rico', 'dizzy', 'ace', 'jenkins', 'sugar'];

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  rico: {
    id: 'rico',
    name: 'Johnny Rico',
    role: 'Rifleman / Leader',
    bio: 'Frontline veteran whose resilience inspires his squad under relentless swarms.',
    passives: ['+15% squadmate damage', '+10% movement speed'],
    loadoutName: 'Morita Assault Rifle',
    startingWeapon: 'morita',
    perks: perks({ squadDamageMult: 1.15, speedMult: 1.1 }),
    tint: 0xffffff,
    accent: 0x58d6ff,
  },
  dizzy: {
    id: 'dizzy',
    name: 'Dizzy Flores',
    role: 'Vanguard Striker',
    bio: 'Agile close-quarters specialist who excels in hit-and-run tactics.',
    passives: ['+25% sprint speed', '+1 extra dash dodge'],
    loadoutName: 'Morita Dual Shotgun',
    startingWeapon: 'dualshotgun',
    perks: perks({ sprintMult: 1.25, extraDashes: 1 }),
    tint: 0xffd2e4,
    accent: 0xff6fa8,
  },
  ace: {
    id: 'ace',
    name: 'Ace Levy',
    role: 'Heavy Demolitions',
    bio: 'Cocky marksman with a knack for heavy ordinance and explosive payloads.',
    passives: ['+20% explosion AoE radius', 'Explosives cause brief knockback'],
    loadoutName: 'Mini-Rocket Launcher',
    startingWeapon: 'rocket',
    perks: perks({ explosionRadiusMult: 1.2, explosiveKnockback: true }),
    tint: 0xffe2a6,
    accent: 0xffa23a,
  },
  jenkins: {
    id: 'jenkins',
    name: 'Carl Jenkins',
    role: 'Telepath / Psionic Scout',
    bio: 'Military Intelligence operative channeling psychic disruption fields.',
    passives: ['+50% XP collection magnet radius', 'Periodically stuns nearby enemies'],
    loadoutName: 'Shock Arc Caster',
    startingWeapon: 'arc',
    perks: perks({ magnetMult: 1.5, psionicStun: true }),
    tint: 0xbcd8ff,
    accent: 0xb48cff,
  },
  sugar: {
    id: 'sugar',
    name: 'Sugar Watkins',
    role: 'Roughneck Heavy Gunner',
    bio: "Hardened survivor carrying heavy suppressive firepower into the swarm's core.",
    passives: ['+40% maximum HP', 'Armor reduces incoming damage by 2'],
    loadoutName: 'Heavy Flamethrower',
    startingWeapon: 'flamer',
    perks: perks({ hpMult: 1.4, armorFlat: 2 }),
    tint: 0xffbfa8,
    accent: 0xff5a3a,
  },
};

export interface GameModeDef {
  id: GameModeId;
  name: string;
  tagline: string;
  description: string;
  durationSec: number;
  /** Multiplies the regular spawn rate (2 = half the spawn interval). */
  spawnRateMult: number;
  /** Radius of the fixed perimeter in pixels; 0 means an infinite desert. */
  arenaRadius: number;
  /** Seconds between elite assault waves; 0 disables them. */
  eliteIntervalSec: number;
  /** Minimum chance of a regular spawn being a Tiger Bug once 30 seconds have passed. */
  tigerBias: number;
  accent: number;
}

export const GAME_MODE_IDS: GameModeId[] = ['klendathu', 'outpost', 'queen'];

export const GAME_MODES: Record<GameModeId, GameModeDef> = {
  klendathu: {
    id: 'klendathu',
    name: 'Klendathu Drop',
    tagline: 'CLASSIC SURVIVAL',
    description: 'Standard 20-minute timed survival across the open desert.',
    durationSec: 20 * 60,
    spawnRateMult: 1,
    arenaRadius: 0,
    eliteIntervalSec: 0,
    tigerBias: 0,
    accent: 0x6dff7a,
  },
  outpost: {
    id: 'outpost',
    name: 'Outpost Defense',
    tagline: 'SWARM SIEGE',
    description: 'Fixed perimeter arena. Double bug spawn rate. No retreat.',
    durationSec: 12 * 60,
    spawnRateMult: 2,
    arenaRadius: 950,
    eliteIntervalSec: 0,
    tigerBias: 0,
    accent: 0xffa23a,
  },
  queen: {
    id: 'queen',
    name: 'Bug Queen Hunt',
    tagline: 'BOSS RUSH',
    description: 'Elite Tiger Bug assaults every 3 minutes with a dense Tiger presence in between.',
    durationSec: 18 * 60,
    spawnRateMult: 1,
    arenaRadius: 0,
    eliteIntervalSec: 180,
    tigerBias: 0.2,
    accent: 0xff4d3a,
  },
};

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  tagline: string;
  description: string;
  hpMult: number;
  speedMult: number;
  /** Multiplies XP gem value; also feeds the bonus-gem chance below. */
  dropMult: number;
  /** Chance of an extra gem dropping with each kill. */
  bonusDropChance: number;
  /** Bugs flank and lead their targets instead of charging straight in. */
  smartAI: boolean;
  /** Replaces the mode's tiger start time (seconds) when > 0. */
  tigerStartSec: number;
  /** Floor for the tiger spawn chance once tigers have started. */
  tigerBias: number;
  /** Multiplies the interval between tiger packs (lower is more frequent). */
  packIntervalMult: number;
  accent: number;
}

export const DIFFICULTY_IDS: DifficultyId[] = ['easy', 'normal', 'hard'];

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: {
    id: 'easy',
    name: 'Easy',
    tagline: 'RECRUIT',
    description: '-25% bug HP and speed. Higher drop rates.',
    hpMult: 0.75,
    speedMult: 0.75,
    dropMult: 1.5,
    bonusDropChance: 0.25,
    smartAI: false,
    tigerStartSec: 0,
    tigerBias: 0,
    packIntervalMult: 1.25,
    accent: 0x6dff7a,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    tagline: 'KLENDATHU THEATER',
    description: 'Standard Klendathu theater.',
    hpMult: 1,
    speedMult: 1,
    dropMult: 1,
    bonusDropChance: 0,
    smartAI: false,
    tigerStartSec: 0,
    tigerBias: 0,
    packIntervalMult: 1,
    accent: 0xffd34a,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    tagline: 'SMART AI',
    description: 'Bugs flank and intercept. +50% speed and HP. Aggressive tiger swarms.',
    hpMult: 1.5,
    speedMult: 1.5,
    dropMult: 1,
    bonusDropChance: 0,
    smartAI: true,
    tigerStartSec: 30,
    tigerBias: 0.25,
    packIntervalMult: 0.65,
    accent: 0xff4d3a,
  },
};

export interface RunSetup {
  mode: GameModeId;
  character: CharacterId;
  difficulty: DifficultyId;
}

export const DEFAULT_RUN: Readonly<RunSetup> = { mode: 'klendathu', character: 'rico', difficulty: 'normal' };
