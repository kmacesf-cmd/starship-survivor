import Phaser from 'phaser';
import { DEFAULT_PERKS } from '../config/CharacterConfig';
import type { CharacterDef, CharacterPerks } from '../config/CharacterConfig';
import { DASH_CONFIG, FRAMES, PLAYER_CONFIG, TEXTURES, XP_CONFIG, frameKey, frameKeys } from '../config/GameConfig';
import type { EffectsSystem } from '../systems/EffectsSystem';
import { TouchInput } from '../systems/TouchInput';

const TAU = Math.PI * 2;
const DIAGONAL = Math.SQRT1_2;
const WALK_KEYS = frameKeys('trooper-walk');
const FIRE_KEYS = frameKeys('trooper-fire');
const IDLE_KEY = frameKey('trooper-idle', 0);
const MUZZLE_FORWARD = 41;
const MUZZLE_SIDE = 2;
const FIRE_FLASH_MS = 110;
const JOYSTICK_RADIUS_SQ = 60 * 60;
const JOYSTICK_DEADZONE_SQ = 8 * 8;

interface MoveKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly arcade: Phaser.Physics.Arcade.Body;
  readonly bodyRadius = PLAYER_CONFIG.bodyRadius;

  hp: number = PLAYER_CONFIG.maxHp;
  maxHp: number = PLAYER_CONFIG.maxHp;
  level = 1;
  xp = 0;
  xpToNext = Player.xpForLevel(1);
  dead = false;

  damageMult = 1;
  cooldownMult = 1;
  /** Temporary fire-rate multiplier (combat stim); divides weapon cooldowns. */
  fireRateMult = 1;
  speedMult = 1;
  pickupMult = 1;
  armor = 0;

  /** Passive modifiers of the selected character; copied in place so switching characters never allocates. */
  readonly perks: CharacterPerks = { ...DEFAULT_PERKS };
  private baseTint = 0xffffff;
  aimAngle = 0;
  moveX = 0;
  moveY = 0;

  private readonly shadow: Phaser.GameObjects.Image;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keys: MoveKeys;
  private phase = 0;
  private invulnUntil = 0;
  private flashUntil = 0;
  private fireUntil = 0;
  private tinted = false;
  private currentKey = IDLE_KEY;

  /** Optional effects layer for dash ghosts; assigned by GameScene. */
  fx: EffectsSystem | null = null;
  dashCharges = 1;
  dashing = false;
  private dashRecharge = 0;
  private dashUntil = 0;
  private dashDirX = 1;
  private dashDirY = 0;
  private ghostAt = 0;
  private readonly dashKeyA: Phaser.Input.Keyboard.Key;
  private readonly dashKeyB: Phaser.Input.Keyboard.Key;
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, IDLE_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arcade = this.body as Phaser.Physics.Arcade.Body;
    this.arcade.setCircle(this.bodyRadius, this.width / 2 - this.bodyRadius, this.height / 2 - this.bodyRadius);
    this.setDepth(10);

    this.shadow = scene.add.image(x, y, TEXTURES.SHADOW).setDepth(1);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input plugin is unavailable');
    }
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MoveKeys;
    this.dashKeyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.dashKeyB = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  static xpForLevel(level: number): number {
    return Math.floor(XP_CONFIG.base * Math.pow(XP_CONFIG.growth, level - 1)) + XP_CONFIG.flat * (level - 1);
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }

  get pickupRadiusSq(): number {
    const r = PLAYER_CONFIG.pickupRadius * this.pickupMult;
    return r * r;
  }

  /** Writes the rifle muzzle world position into `out` without allocating. */
  getMuzzle(out: Phaser.Types.Math.Vector2Like): void {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    out.x = this.x + c * MUZZLE_FORWARD - s * MUZZLE_SIDE;
    out.y = this.y + s * MUZZLE_FORWARD + c * MUZZLE_SIDE;
  }

  /** Called by weapons each time they shoot: turns the trooper toward the target and shows the muzzle flash. */
  notifyFired(time: number, angle: number): void {
    this.aimAngle = angle;
    this.fireUntil = time + FIRE_FLASH_MS;
  }

  /** Selects the character whose passives and tint apply. Takes effect on the next reset(). */
  setCharacter(def: CharacterDef): void {
    Object.assign(this.perks, def.perks);
    this.baseTint = def.tint;
  }

  private restoreTint(): void {
    if (this.baseTint === 0xffffff) {
      this.clearTint();
    } else {
      this.setTint(this.baseTint);
    }
  }

  /** Returns the player to a fresh level-1 state at (x, y). Multipliers are re-derived by UpgradeManager.reset(). */
  reset(x: number, y: number): void {
    this.arcade.reset(x, y);
    this.maxHp = Math.round(PLAYER_CONFIG.maxHp * this.perks.hpMult);
    this.hp = this.maxHp;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = Player.xpForLevel(1);
    this.dead = false;
    this.fireRateMult = 1;
    this.moveX = 0;
    this.moveY = 0;
    this.aimAngle = 0;
    this.phase = 0;
    this.invulnUntil = 0;
    this.flashUntil = 0;
    this.fireUntil = 0;
    this.dashing = false;
    this.dashUntil = 0;
    this.dashCharges = this.dashMax;
    this.dashRecharge = 0;
    this.tinted = false;
    this.restoreTint();
    this.setAlpha(1);
    this.setRotation(0);
    this.shadow.setPosition(x + 2, y + 14);
  }

  /** Returns the damage actually applied (0 when invulnerable or dead). */
  takeDamage(rawDamage: number, time: number): number {
    if (this.dead || time < this.invulnUntil) {
      return 0;
    }
    const applied = Math.max(1, rawDamage - this.armor);
    this.hp -= applied;
    this.invulnUntil = time + PLAYER_CONFIG.invulnMs;
    this.flashUntil = time + 120;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return applied;
  }

  /** Extends invulnerability until `until` (ms game time); never shortens an existing window. */
  grantInvulnerability(until: number): void {
    this.invulnUntil = Math.max(this.invulnUntil, until);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addMaxHp(amount: number): void {
    this.maxHp += amount;
    this.hp += amount;
  }

  /** Adds XP and returns how many levels were gained. */
  addXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Player.xpForLevel(this.level);
      gained++;
    }
    return gained;
  }

  override update(time: number, delta: number): void {
    if (this.dead) {
      this.arcade.setVelocity(0, 0);
      return;
    }
    const dt = delta * 0.001;

    let ix = 0;
    let iy = 0;
    if (this.cursors.left.isDown || this.keys.left.isDown) ix -= 1;
    if (this.cursors.right.isDown || this.keys.right.isDown) ix += 1;
    if (this.cursors.up.isDown || this.keys.up.isDown) iy -= 1;
    if (this.cursors.down.isDown || this.keys.down.isDown) iy += 1;

    if (ix !== 0 && iy !== 0) {
      ix *= DIAGONAL;
      iy *= DIAGONAL;
    } else if (ix === 0 && iy === 0 && TouchInput.active) {
      ix = TouchInput.x;
      iy = TouchInput.y;
    } else if (ix === 0 && iy === 0) {
      const pointer = this.scene.input.activePointer;
      if (pointer.isDown) {
        const dx = pointer.x - pointer.downX;
        const dy = pointer.y - pointer.downY;
        const d2 = dx * dx + dy * dy;
        if (d2 > JOYSTICK_DEADZONE_SQ) {
          const a = Math.atan2(dy, dx);
          const m = d2 >= JOYSTICK_RADIUS_SQ ? 1 : d2 / JOYSTICK_RADIUS_SQ;
          ix = Math.cos(a) * m;
          iy = Math.sin(a) * m;
        }
      }
    }

    const speed = PLAYER_CONFIG.speed * this.speedMult;
    const moving = ix !== 0 || iy !== 0;
    this.moveX = ix;
    this.moveY = iy;

    this.updateDash(time, dt, moving);
    if (this.dashing) {
      this.arcade.setVelocity(this.dashDirX * DASH_CONFIG.speed * this.perks.sprintMult, this.dashDirY * DASH_CONFIG.speed * this.perks.sprintMult);
    } else {
      this.arcade.setVelocity(ix * speed, iy * speed);
    }

    const firing = time < this.fireUntil;
    const target = firing ? this.aimAngle : moving ? Math.atan2(iy, ix) : this.rotation;
    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, target, 18 * dt);

    let key: string;
    let scale: number;
    if (moving) {
      const intensity = 0.5 + 0.5 * (ix * ix + iy * iy);
      this.phase = (this.phase + dt * TAU * 2.4 * this.speedMult * intensity) % TAU;
      const frame = ((this.phase / TAU) * FRAMES.WALK_FRAMES) | 0;
      key = firing ? FIRE_KEYS[frame] : WALK_KEYS[frame];
      scale = 1 + 0.03 * Math.sin(this.phase * 2);
    } else {
      key = firing ? FIRE_KEYS[((time * 0.02) | 0) & (FRAMES.WALK_FRAMES - 1)] : IDLE_KEY;
      scale = 1 + 0.015 * Math.sin(time * 0.004);
    }
    if (key !== this.currentKey) {
      this.setTexture(key);
      this.currentKey = key;
    }
    this.setScale(scale);

    if (time < this.flashUntil) {
      if (!this.tinted) {
        this.setTint(0xff5a5a);
        this.tinted = true;
      }
    } else if (this.tinted) {
      this.restoreTint();
      this.tinted = false;
    }
    this.setAlpha(this.dashing ? 0.55 : time < this.invulnUntil ? 0.65 + 0.35 * Math.sin(time * 0.04) : 1);

    this.shadow.setPosition(this.x + 2, this.y + 14);
  }

  get dashMax(): number {
    return 1 + this.perks.extraDashes;
  }

  /** Fraction (0..1) of the next dash charge that has recharged; 1 when full. */
  get dashCharge01(): number {
    return this.dashCharges >= this.dashMax ? 1 : this.dashRecharge / DASH_CONFIG.rechargeMs;
  }

  private updateDash(time: number, dt: number, moving: boolean): void {
    const max = this.dashMax;
    const touchDash = TouchInput.dashRequested;
    TouchInput.dashRequested = false;
    if (this.dashCharges > max) {
      this.dashCharges = max;
    }
    if (this.dashCharges < max) {
      this.dashRecharge += dt * 1000;
      if (this.dashRecharge >= DASH_CONFIG.rechargeMs) {
        this.dashRecharge = 0;
        this.dashCharges++;
      }
    }

    if (this.dashing) {
      if (time >= this.dashUntil) {
        this.dashing = false;
      } else if (time >= this.ghostAt) {
        this.ghostAt = time + 28;
        this.fx?.emit(this.currentKey, this.x, this.y, 0, 0, 0.28, 1, 1, 0.5, 0x7fd7ff, true, this.rotation);
      }
      return;
    }

    const wants = Phaser.Input.Keyboard.JustDown(this.dashKeyA) || Phaser.Input.Keyboard.JustDown(this.dashKeyB) || touchDash;
    if (!wants || this.dashCharges <= 0) {
      return;
    }
    if (this.dashCharges >= max) {
      this.dashRecharge = 0;
    }
    this.dashCharges--;
    this.dashing = true;
    this.dashUntil = time + DASH_CONFIG.durationMs;
    this.ghostAt = 0;
    if (moving) {
      const len = Math.sqrt(this.moveX * this.moveX + this.moveY * this.moveY);
      this.dashDirX = this.moveX / len;
      this.dashDirY = this.moveY / len;
    } else {
      this.dashDirX = Math.cos(this.rotation);
      this.dashDirY = Math.sin(this.rotation);
    }
    this.invulnUntil = Math.max(this.invulnUntil, time + DASH_CONFIG.durationMs + DASH_CONFIG.graceMs);
    this.fx?.ring(this.x, this.y, 10, 54, 0.3, 0x7fd7ff, 4);
  }
}
