import { PERKS, PERK_IDS, PERK_TUNING } from '../config/PerkConfig';
import type { PerkId } from '../config/PerkConfig';
import type { Player } from '../entities/Player';
import type { GemPool } from '../pools/GemPool';

/** Owns the five draft perks and writes their effects onto the Player. Allocation-free. */
export class PerkSystem {
  private readonly levels: Record<PerkId, number> = { bomber: 0, sabot: 0, vacuum: 0, adrenaline: 0, vest: 0 };
  private stacks = 0;
  private lastKillAt = 0;

  constructor(
    private readonly player: Player,
    private readonly gems: GemPool,
  ) {}

  getLevel(id: PerkId): number {
    return this.levels[id];
  }

  get ownedCount(): number {
    let n = 0;
    for (let i = 0; i < PERK_IDS.length; i++) {
      if (this.levels[PERK_IDS[i]] > 0) {
        n++;
      }
    }
    return n;
  }

  get adrenalineStacks(): number {
    return this.stacks;
  }

  get bomberLevel(): number {
    return this.levels.bomber;
  }

  get bomberChargeMult(): number {
    return this.levels.bomber > 0 ? PERK_TUNING.bomber.chargeMult(this.levels.bomber) : 1;
  }

  get bomberRadiusMult(): number {
    return this.levels.bomber > 0 ? PERK_TUNING.bomber.radiusMult(this.levels.bomber) : 1;
  }

  get bomberDamageMult(): number {
    return this.levels.bomber > 0 ? PERK_TUNING.bomber.damageMult(this.levels.bomber) : 1;
  }

  get bomberExtraBombs(): number {
    return this.levels.bomber > 0 ? PERK_TUNING.bomber.extraBombs(this.levels.bomber) : 0;
  }

  reset(): void {
    for (let i = 0; i < PERK_IDS.length; i++) {
      this.levels[PERK_IDS[i]] = 0;
    }
    this.stacks = 0;
    this.lastKillAt = 0;
    this.applyAll();
  }

  /** Raises a perk by one level. Returns false at the cap. */
  raise(id: PerkId): boolean {
    if (this.levels[id] >= PERKS[id].maxLevel) {
      return false;
    }
    this.levels[id]++;
    this.applyAll();
    return true;
  }

  /** Called once for each level-up the player earns. */
  onLevelUp(): void {
    if (this.levels.vacuum > 0) {
      this.gems.magnetizeAll();
    }
  }

  onKill(time: number): void {
    if (this.levels.adrenaline <= 0) {
      return;
    }
    if (this.stacks < PERK_TUNING.adrenaline.maxStacks) {
      this.stacks++;
      this.applyAdrenaline();
    }
    this.lastKillAt = time;
  }

  update(time: number): void {
    if (this.stacks > 0 && time - this.lastKillAt > PERK_TUNING.adrenaline.decayMs) {
      this.stacks = 0;
      this.applyAdrenaline();
    }
  }

  private applyAdrenaline(): void {
    const lvl = this.levels.adrenaline;
    const bonus = lvl > 0 ? this.stacks * PERK_TUNING.adrenaline.perStack(lvl) : 0;
    this.player.adrenalineMove = 1 + bonus;
    this.player.adrenalineFire = 1 + bonus;
  }

  private applyAll(): void {
    const p = this.player;
    const t = PERK_TUNING;
    p.bonusPierce = this.levels.sabot > 0 ? t.sabot.pierce(this.levels.sabot) : 0;
    p.critChance = this.levels.sabot > 0 ? t.sabot.crit(this.levels.sabot) : 0;
    p.magnetBonus = this.levels.vacuum > 0 ? t.vacuum.magnet(this.levels.vacuum) : 0;
    p.damageReduction = this.levels.vest > 0 ? t.vest.reduction(this.levels.vest) : 0;
    p.reflectFraction = this.levels.vest > 0 ? t.vest.reflect(this.levels.vest) : 0;
    this.applyAdrenaline();
  }
}
