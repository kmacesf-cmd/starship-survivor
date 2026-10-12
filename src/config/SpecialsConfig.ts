import { MAX_LEVEL } from './WeaponsConfig';

export type SpecialId = 'nuke' | 'stim' | 'sentry' | 'napalm' | 'overclock';
export type SquadUpgradeId = 'armor' | 'munitions' | 'medic' | 'drill';

export const SPECIAL_IDS: SpecialId[] = ['nuke', 'stim', 'sentry', 'napalm', 'overclock'];
export const SQUAD_UPGRADE_IDS: SquadUpgradeId[] = ['armor', 'munitions', 'medic', 'drill'];

export interface SpecialDef {
  id: SpecialId;
  name: string;
  description: string;
  maxLevel: number;
}

export interface SquadUpgradeDef {
  id: SquadUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
}

export const SPECIALS: Record<SpecialId, SpecialDef> = {
  nuke: {
    id: 'nuke',
    name: 'Tactical Nuke Ordinance',
    description: 'Every 60 seconds a mini-nuke wipes every non-boss bug on screen.',
    maxLevel: MAX_LEVEL,
  },
  stim: {
    id: 'stim',
    name: 'SICON Combat Stim',
    description: 'Below 25% HP: 5s of invulnerability and +100% fire rate. 60s cooldown.',
    maxLevel: MAX_LEVEL,
  },
  sentry: {
    id: 'sentry',
    name: 'Sentry Drone Squad',
    description: 'Deploys 2 circling gun-drones that fire continuous laser bursts.',
    maxLevel: MAX_LEVEL,
  },
  napalm: {
    id: 'napalm',
    name: 'Napalm Gel Infusion',
    description: 'Every weapon hit leaves a burning napalm pool for 3 seconds.',
    maxLevel: MAX_LEVEL,
  },
  overclock: {
    id: 'overclock',
    name: 'Squad Overclock Aura',
    description: 'Rescued troopers gain +50% fire rate and inherit your passive perks.',
    maxLevel: MAX_LEVEL,
  },
};

export const SQUAD_UPGRADES: Record<SquadUpgradeId, SquadUpgradeDef> = {
  armor: {
    id: 'armor',
    name: 'Squad Armor Plating',
    description: 'Squadmates gain +15% max HP and +0.5 flat armor.',
    maxLevel: MAX_LEVEL,
  },
  munitions: {
    id: 'munitions',
    name: 'Squad Heavy Munitions',
    description: 'Squadmate rifles deal +18% damage.',
    maxLevel: MAX_LEVEL,
  },
  medic: {
    id: 'medic',
    name: 'Field Medic Recovery',
    description: '+1.2 HP/s squad regeneration, faster revive and a longer crawl timer.',
    maxLevel: MAX_LEVEL,
  },
  drill: {
    id: 'drill',
    name: 'Tactical Fire Drill',
    description: 'Squadmates fire +7% faster and move +3% quicker.',
    maxLevel: MAX_LEVEL,
  },
};

/** Per-level tuning for the five special upgrades; `lvl` is 1..MAX_LEVEL. */
export const SPECIAL_TUNING = {
  nuke: {
    intervalSec: (lvl: number): number => 60 - 3.3 * (lvl - 1),
    warnSec: 1.1,
    radius: 1150,
  },
  stim: {
    hpFraction: 0.25,
    durationSec: (lvl: number): number => 5 + 0.4 * (lvl - 1),
    cooldownSec: (lvl: number): number => 60 - 3 * (lvl - 1),
    fireRate: (lvl: number): number => 2 + 0.1 * (lvl - 1),
  },
  sentry: {
    count: (lvl: number): number => 2 + ((lvl - 1) >> 1),
    damage: (lvl: number): number => 7 * (1 + 0.2 * (lvl - 1)),
    burstMs: (lvl: number): number => 640 - 32 * (lvl - 1),
    shotsPerBurst: 3,
    shotGapMs: 70,
    orbitRadius: 105,
    orbitSpeed: 1.9,
    range: 430,
  },
  napalm: {
    durationSec: (lvl: number): number => 3 + 0.15 * (lvl - 1),
    dps: (lvl: number): number => 9 * (1 + 0.22 * (lvl - 1)),
    radius: (lvl: number): number => 44 + 3 * (lvl - 1),
    mergeRadius: 34,
    maxPools: 40,
  },
  overclock: {
    fireRate: (lvl: number): number => 1.5 + 0.05 * (lvl - 1),
    damage: (lvl: number): number => 1 + 0.04 * (lvl - 1),
  },
} as const;

/** Per-level squad modifiers from the draft cards. */
export const SQUAD_TUNING = {
  hpPerArmor: 0.15,
  armorPerLevel: 0.5,
  damagePerMunition: 0.18,
  regenPerMedic: 1.2,
  reviveBonusPerMedic: 0.05,
  crawlBonusSecPerMedic: 0.5,
  firePerDrill: 0.07,
  speedPerDrill: 0.03,
  /** Free scaling as the mission drags on so squadmates keep pace with tougher waves. */
  autoScalePerMinute: 0.04,
} as const;
