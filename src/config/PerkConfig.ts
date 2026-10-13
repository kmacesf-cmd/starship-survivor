import { MAX_LEVEL } from './WeaponsConfig';

export type PerkId = 'bomber' | 'sabot' | 'vacuum' | 'adrenaline' | 'vest';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  maxLevel: number;
}

export const PERK_IDS: PerkId[] = ['bomber', 'sabot', 'vacuum', 'adrenaline', 'vest'];

export const PERKS: Record<PerkId, PerkDef> = {
  bomber: {
    id: 'bomber',
    name: 'Fleet Bomber Run',
    description: 'Unlocks the 3-bomber Air Support run. Each level recharges faster and widens the blast.',
    maxLevel: MAX_LEVEL,
  },
  sabot: {
    id: 'sabot',
    name: 'Armor-Piercing Sabot Rounds',
    description: 'All projectile weapons gain +2 pierce and +15% critical hit chance.',
    maxLevel: MAX_LEVEL,
  },
  vacuum: {
    id: 'vacuum',
    name: 'Bio-Magnetic Vacuum',
    description: 'Pulls every dropped gem on the map to you at each level-up. +20% base magnet radius.',
    maxLevel: MAX_LEVEL,
  },
  adrenaline: {
    id: 'adrenaline',
    name: 'Adrenaline Stims',
    description: 'Each kill grants a stacking +2% move speed and fire rate, up to 10 stacks.',
    maxLevel: MAX_LEVEL,
  },
  vest: {
    id: 'vest',
    name: 'Reinforced Ballistic Vest',
    description: 'Incoming insect damage -20%. Reflects 30% of melee damage back to attackers.',
    maxLevel: MAX_LEVEL,
  },
};

/** Per-level tuning. `lvl` is 1..10. */
export const PERK_TUNING = {
  bomber: {
    chargeMult: (lvl: number): number => 1 + 0.15 * lvl,
    radiusMult: (lvl: number): number => 1 + 0.06 * lvl,
    damageMult: (lvl: number): number => 1 + 0.12 * lvl,
    extraBombs: (lvl: number): number => Math.floor(lvl / 3),
  },
  sabot: {
    pierce: (lvl: number): number => 2 + (lvl >= 5 ? 1 : 0) + (lvl >= 10 ? 1 : 0),
    crit: (lvl: number): number => 0.15 + 0.02 * (lvl - 1),
    critMult: 2,
  },
  vacuum: {
    magnet: (lvl: number): number => 0.2 + 0.04 * (lvl - 1),
  },
  adrenaline: {
    maxStacks: 10,
    decayMs: 4000,
    perStack: (lvl: number): number => 0.02 * (1 + 0.1 * (lvl - 1)),
  },
  vest: {
    reduction: (lvl: number): number => 0.2 + 0.015 * (lvl - 1),
    reflect: (lvl: number): number => 0.3 + 0.03 * (lvl - 1),
  },
};

export const PERK_COLOR = 0xffd34a;
