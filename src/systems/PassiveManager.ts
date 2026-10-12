import { PSI_CONFIG, TEXTURES } from '../config/GameConfig';
import type { Player } from '../entities/Player';
import type { EnemyPool } from '../pools/EnemyPool';
import type { EffectsSystem } from './EffectsSystem';

const TAU = Math.PI * 2;

/** Character passives that act on their own timers (currently Jenkins's psionic stun pulse). */
export class PassiveManager {
  /** 0..1 progress toward the next psionic pulse; 0 when the passive is inactive. */
  psiCharge01 = 0;

  private nextPulseAt = 0;

  constructor(
    private readonly player: Player,
    private readonly enemies: EnemyPool,
    private readonly fx: EffectsSystem,
  ) {}

  reset(time: number): void {
    this.nextPulseAt = time + PSI_CONFIG.periodMs;
    this.psiCharge01 = 0;
  }

  update(time: number): void {
    const p = this.player;
    if (!p.perks.psionicStun || p.dead) {
      this.psiCharge01 = 0;
      return;
    }
    this.psiCharge01 = Math.max(0, Math.min(1, 1 - (this.nextPulseAt - time) / PSI_CONFIG.periodMs));

    const g = this.fx.gfx;
    const glow = this.psiCharge01 * this.psiCharge01;
    g.lineStyle(2, 0xb48cff, 0.1 + 0.35 * glow);
    g.strokeCircle(p.x, p.y, PSI_CONFIG.radius * this.psiCharge01);

    if (time < this.nextPulseAt) {
      return;
    }
    this.nextPulseAt = time + PSI_CONFIG.periodMs;
    this.enemies.stunCircle(p.x, p.y, PSI_CONFIG.radius, time, PSI_CONFIG.stunMs);

    this.fx.ring(p.x, p.y, 20, PSI_CONFIG.radius, 0.55, 0xb48cff, 8);
    this.fx.ring(p.x, p.y, 10, PSI_CONFIG.radius * 0.7, 0.4, 0xe2d2ff, 4);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      this.fx.emit(TEXTURES.PIXEL, p.x, p.y, Math.cos(a) * 340, Math.sin(a) * 340, 0.5, 3, 0.3, 1, 0xc9a8ff, true, 0);
    }
  }
}
