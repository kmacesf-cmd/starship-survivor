import Phaser from 'phaser';
import { EVENTS } from '../config/GameConfig';
import { SPECIALS, SPECIAL_IDS, SPECIAL_TUNING, SQUAD_UPGRADES, SQUAD_UPGRADE_IDS } from '../config/SpecialsConfig';
import type { SpecialId, SquadUpgradeId } from '../config/SpecialsConfig';
import { COUNT_LABELS, STAT_IDS, STATS, WEAPONS, WEAPON_IDS } from '../config/WeaponsConfig';
import type { StatId, WeaponId } from '../config/WeaponsConfig';
import type { Player } from '../entities/Player';
import type { SpecialsSystem } from './SpecialsSystem';
import type { SquadSystem } from './SquadSystem';
import type { WeaponManager } from './WeaponManager';

export const CARD_COUNT = 3;
const HEAL_FRACTION = 0.3;
const SPECIAL_MIN_LEVEL = 3;

export type CardKind = 'weapon' | 'stat' | 'heal' | 'special' | 'squad';

export interface UpgradeCard {
  kind: CardKind;
  id: string;
  title: string;
  description: string;
  tag: string;
  level: number;
  isNew: boolean;
}

interface Candidate {
  kind: CardKind;
  id: string;
  weight: number;
}

const HEAL_ID = 'field-rations';
const MAX_CANDIDATES = WEAPON_IDS.length + STAT_IDS.length + SPECIAL_IDS.length + SQUAD_UPGRADE_IDS.length + 1;

export class UpgradeManager {
  /** Cards for the current choice; only the first `cardCount` entries are valid. */
  readonly cards: UpgradeCard[] = [];
  cardCount = 0;
  choosing = false;
  pending = 0;

  private readonly statLevels: Record<StatId, number> = {
    might: 0,
    cooldown: 0,
    speed: 0,
    magnet: 0,
    health: 0,
    armor: 0,
  };
  private readonly candidates: Candidate[] = [];

  constructor(
    private readonly player: Player,
    private readonly weapons: WeaponManager,
    private readonly events: Phaser.Events.EventEmitter,
    private readonly specials: SpecialsSystem,
    private readonly squad: SquadSystem,
  ) {
    for (let i = 0; i < CARD_COUNT; i++) {
      this.cards.push({ kind: 'heal', id: '', title: '', description: '', tag: '', level: 0, isNew: false });
    }
    for (let i = 0; i < MAX_CANDIDATES; i++) {
      this.candidates.push({ kind: 'stat', id: '', weight: 0 });
    }
  }

  getStatLevel(id: StatId): number {
    return this.statLevels[id];
  }

  reset(): void {
    for (let i = 0; i < STAT_IDS.length; i++) {
      this.statLevels[STAT_IDS[i]] = 0;
    }
    this.cardCount = 0;
    this.choosing = false;
    this.pending = 0;
    this.applyStats();
  }

  /** Registers earned level-ups and opens the first card choice if none is open. */
  queueLevelUps(count: number): void {
    if (count <= 0) {
      return;
    }
    this.pending += count;
    if (!this.choosing) {
      this.openNext();
    }
  }

  /** Builds a fresh set of cards and notifies the UI. Returns false when nothing is pending. */
  openNext(): boolean {
    if (this.pending <= 0) {
      this.choosing = false;
      return false;
    }
    this.pending--;
    this.buildCards();
    this.choosing = true;
    this.events.emit(EVENTS.LEVEL_UP, this.cards, this.cardCount, this.player.level);
    return true;
  }

  /** Applies the chosen card. Returns false for invalid input (no choice open or index out of range). */
  choose(index: number): boolean {
    if (!this.choosing || index < 0 || index >= this.cardCount) {
      return false;
    }
    const card = this.cards[index];
    this.apply(card);
    this.choosing = false;
    this.events.emit(EVENTS.UPGRADE_CHOSEN, card);
    this.openNext();
    return true;
  }

  private apply(card: UpgradeCard): void {
    if (card.kind === 'weapon') {
      this.weapons.addWeapon(card.id as WeaponId);
    } else if (card.kind === 'stat') {
      const id = card.id as StatId;
      if (this.statLevels[id] < STATS[id].maxLevel) {
        this.statLevels[id]++;
        if (id === 'health') {
          this.player.addMaxHp(STATS.health.perLevel);
        }
      }
      this.applyStats();
    } else if (card.kind === 'special') {
      this.specials.raise(card.id as SpecialId);
    } else if (card.kind === 'squad') {
      this.squad.raiseUpgrade(card.id as SquadUpgradeId);
    } else {
      this.player.heal(Math.ceil(this.player.maxHp * HEAL_FRACTION));
    }
  }

  /** Derives multipliers from levels so repeated calls never drift. */
  private applyStats(): void {
    const p = this.player;
    p.damageMult = 1 + STATS.might.perLevel * this.statLevels.might;
    p.cooldownMult = Math.max(0.3, 1 - STATS.cooldown.perLevel * this.statLevels.cooldown);
    p.speedMult = p.perks.speedMult * (1 + STATS.speed.perLevel * this.statLevels.speed);
    p.pickupMult = p.perks.magnetMult * (1 + STATS.magnet.perLevel * this.statLevels.magnet);
    p.armor = p.perks.armorFlat + STATS.armor.perLevel * this.statLevels.armor;
    this.weapons.syncDrones();
  }

  private buildCards(): void {
    let n = 0;
    const slotsFull = !this.weapons.canAddWeapon();

    for (let i = 0; i < WEAPON_IDS.length; i++) {
      const id = WEAPON_IDS[i];
      const level = this.weapons.getLevel(id);
      if (level === 0 && !slotsFull) {
        this.setCandidate(n++, 'weapon', id, 2);
      } else if (level > 0 && level < this.weapons.maxLevel(id)) {
        this.setCandidate(n++, 'weapon', id, slotsFull ? 4 : 3);
      }
    }
    for (let i = 0; i < STAT_IDS.length; i++) {
      const id = STAT_IDS[i];
      if (this.statLevels[id] < STATS[id].maxLevel) {
        this.setCandidate(n++, 'stat', id, 2);
      }
    }
    if (this.player.level >= SPECIAL_MIN_LEVEL) {
      for (let i = 0; i < SPECIAL_IDS.length; i++) {
        const id = SPECIAL_IDS[i];
        const level = this.specials.getLevel(id);
        if (level < SPECIALS[id].maxLevel) {
          this.setCandidate(n++, 'special', id, level === 0 ? 1.4 : 2.2);
        }
      }
    }
    if (this.squad.isRelevant) {
      for (let i = 0; i < SQUAD_UPGRADE_IDS.length; i++) {
        const id = SQUAD_UPGRADE_IDS[i];
        if (this.squad.getUpgradeLevel(id) < SQUAD_UPGRADES[id].maxLevel) {
          this.setCandidate(n++, 'squad', id, 1.8);
        }
      }
    }
    // Healing is always offered at low weight so a maxed build still gets a full set of cards.
    this.setCandidate(n, 'heal', HEAL_ID, n === 0 ? 1 : 0.4);
    n++;

    let picked = 0;
    let remaining = n;
    while (picked < CARD_COUNT && remaining > 0) {
      let total = 0;
      for (let i = 0; i < remaining; i++) {
        total += this.candidates[i].weight;
      }
      let roll = Math.random() * total;
      let chosen = remaining - 1;
      for (let i = 0; i < remaining; i++) {
        roll -= this.candidates[i].weight;
        if (roll <= 0) {
          chosen = i;
          break;
        }
      }
      const c = this.candidates[chosen];
      this.fillCard(this.cards[picked++], c);
      // Swap-remove keeps the pool allocation-free.
      const last = this.candidates[remaining - 1];
      const tmpKind = c.kind;
      const tmpId = c.id;
      const tmpWeight = c.weight;
      c.kind = last.kind;
      c.id = last.id;
      c.weight = last.weight;
      last.kind = tmpKind;
      last.id = tmpId;
      last.weight = tmpWeight;
      remaining--;
    }
    this.cardCount = picked;
  }

  private setCandidate(index: number, kind: CardKind, id: string, weight: number): void {
    const c = this.candidates[index];
    c.kind = kind;
    c.id = id;
    c.weight = weight;
  }

  private fillCard(card: UpgradeCard, c: Candidate): void {
    card.kind = c.kind;
    card.id = c.id;
    if (c.kind === 'weapon') {
      const id = c.id as WeaponId;
      const def = WEAPONS[id];
      const current = this.weapons.getLevel(id);
      card.title = def.name;
      card.isNew = current === 0;
      card.level = current + 1;
      card.tag = card.isNew ? 'NEW WEAPON' : `LEVEL ${current + 1}`;
      card.description = card.isNew ? def.description : this.describeWeaponGain(id, current);
    } else if (c.kind === 'stat') {
      const id = c.id as StatId;
      const def = STATS[id];
      const current = this.statLevels[id];
      card.title = def.name;
      card.isNew = false;
      card.level = current + 1;
      card.tag = `LEVEL ${current + 1}/${def.maxLevel}`;
      card.description = def.description;
    } else if (c.kind === 'special') {
      const id = c.id as SpecialId;
      const def = SPECIALS[id];
      const current = this.specials.getLevel(id);
      card.title = def.name;
      card.isNew = current === 0;
      card.level = current + 1;
      card.tag = card.isNew ? 'SPECIAL UPGRADE' : `SPECIAL LV ${current + 1}/${def.maxLevel}`;
      card.description = card.isNew ? def.description : this.describeSpecialGain(id, current + 1);
    } else if (c.kind === 'squad') {
      const id = c.id as SquadUpgradeId;
      const def = SQUAD_UPGRADES[id];
      const current = this.squad.getUpgradeLevel(id);
      card.title = def.name;
      card.isNew = current === 0;
      card.level = current + 1;
      card.tag = `SQUAD LV ${current + 1}/${def.maxLevel}`;
      card.description = def.description;
    } else {
      card.title = 'Field Rations';
      card.isNew = false;
      card.level = 0;
      card.tag = 'RECOVER';
      card.description = `Restore ${Math.round(HEAL_FRACTION * 100)}% of max HP.`;
    }
  }

  /** Text describing what reaching `level` (2..10) changes for a special. */
  private describeSpecialGain(id: SpecialId, level: number): string {
    const t = SPECIAL_TUNING;
    const f = (v: number): string => (Math.round(v * 10) / 10).toString();
    switch (id) {
      case 'nuke':
        return `Nuke every ${f(t.nuke.intervalSec(level - 1))}s > ${f(t.nuke.intervalSec(level))}s`;
      case 'stim':
        return `Duration ${f(t.stim.durationSec(level - 1))}s > ${f(t.stim.durationSec(level))}s\nCooldown ${f(t.stim.cooldownSec(level - 1))}s > ${f(t.stim.cooldownSec(level))}s\nFire rate x${f(t.stim.fireRate(level - 1))} > x${f(t.stim.fireRate(level))}`;
      case 'sentry':
        return `Drones ${t.sentry.count(level - 1)} > ${t.sentry.count(level)}\nLaser damage ${f(t.sentry.damage(level - 1))} > ${f(t.sentry.damage(level))}\nBurst every ${t.sentry.burstMs(level - 1)}ms > ${t.sentry.burstMs(level)}ms`;
      case 'napalm':
        return `Burn time ${f(t.napalm.durationSec(level - 1))}s > ${f(t.napalm.durationSec(level))}s\nDamage ${f(t.napalm.dps(level - 1))}/s > ${f(t.napalm.dps(level))}/s\nPool radius ${t.napalm.radius(level - 1)} > ${t.napalm.radius(level)}`;
      default:
        return `Squad fire rate +${Math.round((t.overclock.fireRate(level - 1) - 1) * 100)}% > +${Math.round((t.overclock.fireRate(level) - 1) * 100)}%\nSquad damage +${Math.round((t.overclock.damage(level - 1) - 1) * 100)}% > +${Math.round((t.overclock.damage(level) - 1) * 100)}%`;
    }
  }

  private describeWeaponGain(id: WeaponId, currentLevel: number): string {
    const levels = WEAPONS[id].levels;
    const from = levels[currentLevel - 1];
    const to = levels[currentLevel];
    const parts: string[] = [];
    if (to.damage !== from.damage) parts.push(`Damage ${from.damage} > ${to.damage}`);
    if (to.count !== from.count) parts.push(`${COUNT_LABELS[id]} ${from.count} > ${to.count}`);
    if (to.cooldownMs !== from.cooldownMs) parts.push(`Cooldown ${from.cooldownMs}ms > ${to.cooldownMs}ms`);
    if (to.area !== from.area) parts.push(`${id === 'arc' ? 'Jump' : 'Radius'} ${from.area} > ${to.area}`);
    if (to.burn !== from.burn) parts.push(`Burn ${from.burn}/s > ${to.burn}/s`);
    if (to.knock !== from.knock) parts.push(`Knockback x${from.knock} > x${to.knock}`);
    if (to.pierce !== from.pierce && id !== 'orbit') parts.push(`Pierce ${from.pierce} > ${to.pierce}`);
    return parts.length > 0 ? parts.join('\n') : WEAPONS[id].description;
  }
}
