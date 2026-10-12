import type { Enemy } from '../entities/Enemy';

/** Shared damage entry points so weapons, squadmates and effects all route through GameScene's feedback code. */
export interface CombatHooks {
  /** Applies damage with floating text, blood, gem drop and kill credit. Returns true when the enemy died. */
  damageEnemy(enemy: Enemy, amount: number, dirX: number, dirY: number, knockMult: number, time: number, color: number): boolean;
  /**
   * Area blast with distance falloff, fireball, crater and camera shake.
   * `knockMult` > 1 always pushes bugs away; 1 pushes only for operatives with the explosive-knockback passive.
   */
  explode(x: number, y: number, radius: number, damage: number, knockMult: number, time: number, big: boolean): void;
  /** Kills every active bug within `radius` (screen wipe) with a full-screen flash; bosses would be spared. */
  nuke(x: number, y: number, radius: number, time: number): void;
}

export const COLOR_NAPALM = 0xff9a3a;
export const COLOR_LASER = 0x7dffea;
