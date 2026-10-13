import Phaser from 'phaser';
import { ENEMY_TYPES, FRAMES, TEXTURES, frameKey, frameKeys } from '../config/GameConfig';
import type { EnemyKey, EnemyType } from '../config/GameConfig';

const TAU = Math.PI * 2;
const FRAME_KEYS: Record<EnemyKey, string[]> = {
  warrior: frameKeys(TEXTURES.WARRIOR),
  tiger: frameKeys(TEXTURES.TIGER),
};
const KNOCKBACK_DECAY = 9;
const KNOCKBACK_MAX = 700;
const SEPARATION_MAX = 140;
const FLASH_MS = 80;
const BURN_TICK_MS = 500;
const TINT_NONE = 0;
const TINT_FLASH = 1;
const TINT_STUN = 2;
const TINT_BURN = 3;
const TINT_CHILL = 4;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly arcade: Phaser.Physics.Arcade.Body;

  poolIndex = 0;
  uid = 0;
  def: EnemyType = ENEMY_TYPES.warrior;
  hp = 0;
  maxHp = 0;
  speed = 0;
  damage = 0;
  xpValue = 0;
  bodyRadius = 0;
  orbitReadyAt = 0;
  sepX = 0;
  sepY = 0;
  stunUntil = 0;
  burnUntil = 0;
  burnDps = 0;
  burnTickAt = 0;
  chillUntil = 0;
  chillSlow = 1;
  chillDps = 0;
  chillTickAt = 0;

  private frames: string[] = FRAME_KEYS.warrior;
  private currentKey = '';
  private phase = 0;
  private kbX = 0;
  private kbY = 0;
  private flashUntil = 0;
  private tintState = TINT_NONE;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, frameKey(TEXTURES.WARRIOR, 0));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arcade = this.body as Phaser.Physics.Arcade.Body;
    this.disableBody(true, true);
  }

  spawn(x: number, y: number, type: EnemyType, hpMult: number, speedMult: number, uid: number): void {
    this.enableBody(true, x, y, true, true);
    this.def = type;
    this.uid = uid;
    this.frames = FRAME_KEYS[type.key];
    this.currentKey = this.frames[0];
    this.setTexture(this.currentKey);
    this.setScale(type.scale);
    this.setRotation(0);
    this.setAlpha(1);
    this.clearTint();
    this.setDepth(5);
    this.tintState = TINT_NONE;

    const r = type.bodyRadius / type.scale;
    this.arcade.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.arcade.setVelocity(0, 0);

    this.maxHp = type.hp * hpMult;
    this.hp = this.maxHp;
    this.speed = type.speed * speedMult;
    this.damage = type.damage;
    this.xpValue = type.xp;
    this.bodyRadius = type.bodyRadius;
    this.orbitReadyAt = 0;
    this.sepX = 0;
    this.sepY = 0;
    this.kbX = 0;
    this.kbY = 0;
    this.flashUntil = 0;
    this.stunUntil = 0;
    this.burnUntil = 0;
    this.burnDps = 0;
    this.burnTickAt = 0;
    this.chillUntil = 0;
    this.chillSlow = 1;
    this.chillDps = 0;
    this.chillTickAt = 0;
    this.phase = (uid * 1.713) % TAU;
  }

  isStunned(time: number): boolean {
    return time < this.stunUntil;
  }

  isBurning(time: number): boolean {
    return time < this.burnUntil;
  }

  stun(time: number, durationMs: number): void {
    const until = time + durationMs;
    if (until > this.stunUntil) {
      this.stunUntil = until;
    }
  }

  /** Sets the bug ablaze. Re-igniting refreshes the duration and keeps the stronger burn. */
  ignite(time: number, dps: number, durationMs: number): void {
    if (time >= this.burnUntil) {
      this.burnDps = dps;
      this.burnTickAt = time + BURN_TICK_MS;
    } else if (dps > this.burnDps) {
      this.burnDps = dps;
    }
    this.burnUntil = time + durationMs;
  }

  isChilled(time: number): boolean {
    return time < this.chillUntil;
  }

  /** Freezes the bug's crawl: movement is multiplied by `slow` and frost deals `dps` until it wears off. */
  chill(time: number, durationMs: number, slow: number, dps: number): void {
    if (time >= this.chillUntil) {
      this.chillTickAt = time + BURN_TICK_MS;
    }
    this.chillSlow = slow;
    this.chillDps = dps;
    this.chillUntil = time + durationMs;
  }

  /** Frost damage due this frame (0 between ticks). */
  collectChill(time: number): number {
    if (time >= this.chillUntil || time < this.chillTickAt) {
      return 0;
    }
    this.chillTickAt = time + BURN_TICK_MS;
    return this.chillDps * (BURN_TICK_MS * 0.001);
  }

  /** Returns the burn damage due this frame (0 between ticks). The caller applies it and handles death. */
  collectBurn(time: number): number {
    if (time >= this.burnUntil || time < this.burnTickAt) {
      return 0;
    }
    this.burnTickAt = time + BURN_TICK_MS;
    return this.burnDps * (BURN_TICK_MS * 0.001);
  }

  /** Returns true when this hit kills the enemy. The caller releases it back to the pool. */
  takeDamage(amount: number, time: number, dirX: number, dirY: number, knockMult = 1): boolean {
    this.hp -= amount;
    this.kbX += dirX * this.def.knockback * knockMult;
    this.kbY += dirY * this.def.knockback * knockMult;
    const m2 = this.kbX * this.kbX + this.kbY * this.kbY;
    if (m2 > KNOCKBACK_MAX * KNOCKBACK_MAX) {
      const k = KNOCKBACK_MAX / Math.sqrt(m2);
      this.kbX *= k;
      this.kbY *= k;
    }
    this.flashUntil = time + FLASH_MS;
    return this.hp <= 0;
  }

  override update(time: number, delta: number, targetX: number, targetY: number): void {
    const dt = delta * 0.001;
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const stunned = time < this.stunUntil;

    // Legs drive the pace: the scuttle surges forward on each stroke of the gait cycle.
    const slow = time < this.chillUntil ? this.chillSlow : 1;
    const gaitHz = stunned ? 0 : this.speed * slow * 0.035;
    this.phase = (this.phase + dt * TAU * gaitHz) % TAU;
    const pace = stunned ? 0 : 0.8 + 0.3 * Math.sin(this.phase * 2);
    const speed = this.speed * slow * pace;

    const sepX = Phaser.Math.Clamp(this.sepX, -SEPARATION_MAX, SEPARATION_MAX);
    const sepY = Phaser.Math.Clamp(this.sepY, -SEPARATION_MAX, SEPARATION_MAX);
    this.arcade.setVelocity(Math.cos(angle) * speed + this.kbX + sepX, Math.sin(angle) * speed + this.kbY + sepY);

    const decay = Math.max(0, 1 - KNOCKBACK_DECAY * dt);
    this.kbX *= decay;
    this.kbY *= decay;

    this.rotation = angle + (stunned ? 0 : Math.sin(this.phase * 2) * 0.1);
    const frame = ((this.phase / TAU) * FRAMES.WALK_FRAMES) | 0;
    const key = this.frames[frame];
    if (key !== this.currentKey) {
      this.setTexture(key);
      this.currentKey = key;
    }
    this.setScale(this.def.scale * (1 + 0.025 * Math.sin(this.phase * 2 + 1.2)));

    let want = TINT_NONE;
    if (time < this.flashUntil) {
      want = TINT_FLASH;
    } else if (stunned) {
      want = TINT_STUN;
    } else if (time < this.chillUntil) {
      want = TINT_CHILL;
    } else if (time < this.burnUntil) {
      want = TINT_BURN;
    }
    if (want !== this.tintState) {
      this.tintState = want;
      if (want === TINT_FLASH) {
        this.setTintFill(0xffffff);
      } else if (want === TINT_STUN) {
        this.setTint(0x8fb4ff);
      } else if (want === TINT_CHILL) {
        this.setTint(0x8be9ff);
      } else if (want === TINT_BURN) {
        this.setTint(0xff9a4a);
      } else {
        this.clearTint();
      }
    }
  }
}
