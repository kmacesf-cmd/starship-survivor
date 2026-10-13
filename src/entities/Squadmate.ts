import Phaser from 'phaser';
import { FRAMES, PSI_CONFIG, SQUAD_CONFIG, TEXTURES, frameKeys } from '../config/GameConfig';
import type { EffectsSystem } from '../systems/EffectsSystem';
import type { EnemyPool } from '../pools/EnemyPool';
import type { Enemy } from './Enemy';
import type { ProjectilePool } from '../pools/ProjectilePool';
import type { Arena, Point } from '../systems/Arena';

const SQUAD_WALL_MARGIN = 28;

const TAU = Math.PI * 2;
const WALK_KEYS = frameKeys('trooper-walk');
const FIRE_KEYS = frameKeys('trooper-fire');
const CRAWL_KEYS = frameKeys(TEXTURES.CRAWL);
const IDLE_KEY = 'trooper-idle-0';
const MUZZLE_FORWARD = 40;
const SPRING_K = 15;
const SPRING_DAMP = 7.2;
const SEPARATION_RADIUS = 56;
const SEPARATION_PUSH = 420;
const ENEMY_REPEL_RADIUS = 95;
const ENEMY_REPEL_PUSH = 520;
const CRAWL_SPEED = 70;
const FIRE_FLASH_MS = 120;
const EXTRACT_MS = 1400;
const REVIVE_INVULN_MS = 1500;
const BAR_WIDTH = 32;
const BAR_HEIGHT = 5;
const PSI_PERIOD_MS = PSI_CONFIG.periodMs;
const PSI_RADIUS = PSI_CONFIG.radius * 0.7;
const PSI_STUN_MS = PSI_CONFIG.stunMs;

export enum SquadState {
  Dormant = 0,
  Active = 1,
  Downed = 2,
  Extracting = 3,
}

/** Per-frame inputs the squad system shares with every squadmate. */
export interface SquadContext {
  time: number;
  dt: number;
  playerX: number;
  playerY: number;
  headingX: number;
  headingY: number;
  damage: number;
  fireIntervalMs: number;
  maxHp: number;
  armor: number;
  regen: number;
  reviveFraction: number;
  crawlSec: number;
  speedMult: number;
  /** 1 while the Overclock aura is active. */
  overclock: number;
  /** Psionic pulse inherited from the player (Overclock + Jenkins); 0 when inactive. */
  psiStun: number;
  enemies: EnemyPool;
  projectiles: ProjectilePool;
  fx: EffectsSystem;
  mates: Squadmate[];
  arena: Arena;
}

/**
 * AI trooper. Follows a rotating formation slot with spring physics plus boids-style separation, shoots the
 * nearest bug with a Morita rifle, and crawls toward the player when downed. No physics body and no allocation.
 */
export class Squadmate {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;

  state: SquadState = SquadState.Dormant;
  hp: number = SQUAD_CONFIG.maxHp;
  maxHp: number = SQUAD_CONFIG.maxHp;
  x = 0;
  y = 0;

  private nextPulseAt = 0;
  private readonly wall: Point = { x: 0, y: 0 };

  private vx = 0;
  private vy = 0;
  private rotation = 0;
  private phase = 0;
  private fireUntil = 0;
  private nextFireAt = 0;
  private nextScanAt = 0;
  private invulnUntil = 0;
  private flashUntil = 0;
  private downedAt = 0;
  private extractAt = 0;
  private tinted = false;
  private target: Enemy | null = null;
  private targetUid = 0;
  private currentKey = IDLE_KEY;

  constructor(
    scene: Phaser.Scene,
    readonly slot: number,
    private readonly slotX: number,
    private readonly slotY: number,
    private readonly tint: number,
  ) {
    this.shadow = scene.add.image(0, 0, TEXTURES.SHADOW).setDepth(1).setVisible(false).setActive(false);
    this.sprite = scene.add.image(0, 0, IDLE_KEY).setDepth(9).setVisible(false).setActive(false);
  }

  get isAlive(): boolean {
    return this.state === SquadState.Active;
  }

  /** True while the slot is occupied (fighting, crawling or being extracted). */
  get isOccupied(): boolean {
    return this.state !== SquadState.Dormant;
  }

  deactivate(): void {
    this.state = SquadState.Dormant;
    this.sprite.setVisible(false).setActive(false);
    this.shadow.setVisible(false).setActive(false);
    this.target = null;
  }

  activate(x: number, y: number, time: number, maxHp: number = SQUAD_CONFIG.maxHp): void {
    this.state = SquadState.Active;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.nextPulseAt = time + PSI_PERIOD_MS + this.slot * 400;
    this.fireUntil = 0;
    this.nextFireAt = time + 400 + this.slot * 90;
    this.nextScanAt = 0;
    this.invulnUntil = time + REVIVE_INVULN_MS;
    this.flashUntil = 0;
    this.target = null;
    this.tinted = false;
    this.setKey(IDLE_KEY);
    this.sprite.setVisible(true).setActive(true).setAlpha(1).setScale(1);
    this.shadow.setVisible(true).setActive(true);
    this.applyTint(this.tint);
    this.render();
  }

  update(c: SquadContext): void {
    if (this.state !== SquadState.Dormant && c.maxHp !== this.maxHp) {
      this.hp = Math.min(c.maxHp, this.hp + Math.max(0, c.maxHp - this.maxHp));
      this.maxHp = c.maxHp;
    }
    switch (this.state) {
      case SquadState.Active:
        this.updateActive(c);
        break;
      case SquadState.Downed:
        this.updateDowned(c);
        break;
      case SquadState.Extracting:
        this.updateExtracting(c);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- active

  private updateActive(c: SquadContext): void {
    const dt = c.dt;

    // Formation slot rotated into the player's heading.
    const hx = c.headingX;
    const hy = c.headingY;
    const tx = c.playerX + hx * this.slotX - hy * this.slotY;
    const ty = c.playerY + hy * this.slotX + hx * this.slotY;

    let ax = SPRING_K * (tx - this.x) - SPRING_DAMP * this.vx;
    let ay = SPRING_K * (ty - this.y) - SPRING_DAMP * this.vy;

    const mates = c.mates;
    const sepSq = SEPARATION_RADIUS * SEPARATION_RADIUS;
    for (let i = 0; i < mates.length; i++) {
      const o = mates[i];
      if (o === this || o.state !== SquadState.Active) {
        continue;
      }
      const dx = this.x - o.x;
      const dy = this.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < sepSq && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (1 - d / SEPARATION_RADIUS) * SEPARATION_PUSH;
        ax += (dx / d) * push;
        ay += (dy / d) * push;
      }
    }

    // Boids-style avoidance: shy away from bugs that get close.
    const n = c.enemies.queryCircle(this.x, this.y, ENEMY_REPEL_RADIUS);
    for (let i = 0; i < n; i++) {
      const e = c.enemies.results[i];
      const dx = this.x - e.x;
      const dy = this.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (1 - Math.min(1, d / (ENEMY_REPEL_RADIUS + e.bodyRadius))) * ENEMY_REPEL_PUSH;
        ax += (dx / d) * push;
        ay += (dy / d) * push;
      }
    }

    this.vx += ax * dt;
    this.vy += ay * dt;

    const toPlayerX = c.playerX - this.x;
    const toPlayerY = c.playerY - this.y;
    const distSq = toPlayerX * toPlayerX + toPlayerY * toPlayerY;
    const maxSpeed = SQUAD_CONFIG.speed * c.speedMult * (1 + Math.min(1.4, Math.sqrt(distSq) / 260));
    const v2 = this.vx * this.vx + this.vy * this.vy;
    if (v2 > maxSpeed * maxSpeed) {
      const k = maxSpeed / Math.sqrt(v2);
      this.vx *= k;
      this.vy *= k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.keepInside(c);
    if (distSq > SQUAD_CONFIG.tetherDistance * SQUAD_CONFIG.tetherDistance) {
      this.x = tx;
      this.y = ty;
      this.vx = 0;
      this.vy = 0;
      this.keepInside(c);
    }

    this.hp = Math.min(this.maxHp, this.hp + c.regen * dt);
    this.combat(c);
    if (this.takeContact(c)) {
      return;
    }
    this.psionicPulse(c);
    this.animate(c, true);
    this.render();
    if (c.overclock > 0) {
      const g = c.fx.gfx;
      g.lineStyle(2, 0x5fe8ff, 0.35 + 0.25 * Math.sin(c.time * 0.008 + this.slot));
      g.strokeCircle(this.x, this.y, 30 + 2 * Math.sin(c.time * 0.01 + this.slot));
    }
    this.drawBar(c.fx, this.hp / this.maxHp, 0x58e06a);
  }

  private psionicPulse(c: SquadContext): void {
    if (c.psiStun <= 0 || c.time < this.nextPulseAt) {
      return;
    }
    this.nextPulseAt = c.time + PSI_PERIOD_MS;
    c.enemies.stunCircle(this.x, this.y, PSI_RADIUS, c.time, PSI_STUN_MS);
    c.fx.ring(this.x, this.y, 12, PSI_RADIUS, 0.5, 0xb48cff, 5);
  }

  /** Keeps the trooper inside the perimeter; the scratch point avoids per-frame allocation. */
  private keepInside(c: SquadContext): void {
    if (!c.arena.contains(this.x, this.y, SQUAD_WALL_MARGIN)) {
      const p = c.arena.clamp(this.x, this.y, SQUAD_WALL_MARGIN, this.wall);
      this.x = p.x;
      this.y = p.y;
    }
  }

  private combat(c: SquadContext): void {
    const time = c.time;
    if (time >= this.nextScanAt) {
      this.nextScanAt = time + SQUAD_CONFIG.scanIntervalMs + this.slot * 23;
      this.target = c.enemies.findNearest(this.x, this.y, SQUAD_CONFIG.range * SQUAD_CONFIG.range);
      this.targetUid = this.target ? this.target.uid : 0;
    }
    const t = this.target;
    if (!t || !t.active || t.uid !== this.targetUid) {
      this.target = null;
      return;
    }
    if (time < this.nextFireAt) {
      return;
    }
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const reach = SQUAD_CONFIG.range + t.bodyRadius;
    if (dx * dx + dy * dy > reach * reach) {
      return;
    }
    const aim = Math.atan2(dy, dx);
    const mx = this.x + Math.cos(aim) * MUZZLE_FORWARD;
    const my = this.y + Math.sin(aim) * MUZZLE_FORWARD;
    c.projectiles.fireBullet(mx, my, aim + (Math.random() - 0.5) * 0.06, SQUAD_CONFIG.bulletSpeed, c.damage, 0, SQUAD_CONFIG.range + 40);
    this.rotation = aim;
    this.fireUntil = time + FIRE_FLASH_MS;
    this.nextFireAt = time + c.fireIntervalMs;
    c.fx.emit(TEXTURES.PIXEL, mx, my, Math.cos(aim) * 90, Math.sin(aim) * 90, 0.09, 4, 1, 1, 0xffe27a, true, 0);
  }

  /** Returns true when the hit downed this squadmate. */
  private takeContact(c: SquadContext): boolean {
    const time = c.time;
    if (time < this.invulnUntil) {
      return false;
    }
    const dmg = c.enemies.contactDamage(this.x, this.y, SQUAD_CONFIG.bodyRadius, time);
    if (dmg <= 0) {
      return false;
    }
    this.hp -= Math.max(1, dmg - c.armor);
    this.invulnUntil = time + SQUAD_CONFIG.invulnMs;
    this.flashUntil = time + 120;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = SquadState.Downed;
      this.downedAt = time;
      this.vx = 0;
      this.vy = 0;
      this.target = null;
      this.sprite.setAlpha(1);
      this.applyTint(this.tint);
      this.tinted = false;
      c.fx.ring(this.x, this.y, 8, 46, 0.4, 0xff5a4a, 4);
      this.render();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- downed

  private updateDowned(c: SquadContext): void {
    const time = c.time;
    const elapsed = time - this.downedAt;
    const total = c.crawlSec * 1000;

    const dx = c.playerX - this.x;
    const dy = c.playerY - this.y;
    const d2 = dx * dx + dy * dy;
    const reach = SQUAD_CONFIG.reviveRadius;
    if (d2 <= reach * reach) {
      this.state = SquadState.Active;
      this.hp = this.maxHp * c.reviveFraction;
      this.invulnUntil = time + REVIVE_INVULN_MS;
      this.nextFireAt = time + 500;
      this.vx = 0;
      this.vy = 0;
      c.fx.ring(this.x, this.y, 10, 70, 0.5, 0x58e06a, 5);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        c.fx.emit(TEXTURES.PIXEL, this.x, this.y, Math.cos(a) * 110, Math.sin(a) * 110, 0.5, 3, 0.4, 1, 0x7dff8a, true, 0);
      }
      return;
    }

    if (elapsed >= total) {
      this.state = SquadState.Extracting;
      this.extractAt = time;
      return;
    }

    const d = Math.sqrt(d2);
    const step = CRAWL_SPEED * c.dt;
    if (d > reach) {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.keepInside(c);
      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, Math.atan2(dy, dx), 6 * c.dt);
      this.phase = (this.phase + c.dt * TAU * 1.1) % TAU;
    }
    this.setKey(CRAWL_KEYS[((this.phase / TAU) * FRAMES.WALK_FRAMES) | 0]);
    this.sprite.setScale(1);
    this.sprite.setAlpha(0.8 + 0.2 * Math.sin(time * 0.012));
    this.render();

    const g = c.fx.gfx;
    const left = 1 - elapsed / total;
    this.drawBar(c.fx, left, 0xffa23a);
    g.lineStyle(2, 0xff5a4a, 0.5 + 0.4 * Math.sin(time * 0.014));
    g.strokeCircle(this.x, this.y, reach);
    g.lineStyle(3, 0xffa23a, 0.9);
    g.beginPath();
    g.arc(this.x, this.y, reach + 6, -Math.PI / 2, -Math.PI / 2 + TAU * left, false);
    g.strokePath();
  }

  // ---------------------------------------------------------------- extraction

  private updateExtracting(c: SquadContext): void {
    const t = (c.time - this.extractAt) / EXTRACT_MS;
    if (t >= 1) {
      this.deactivate();
      return;
    }
    this.sprite.setAlpha(1 - t);
    this.sprite.setPosition(this.x, this.y - t * 60);
    this.shadow.setAlpha(1 - t);
    const g = c.fx.gfx;
    g.fillStyle(0x9fe8ff, 0.35 * (1 - t));
    g.fillRect(this.x - 14, this.y - 360, 28, 360);
    g.fillStyle(0xffffff, 0.5 * (1 - t));
    g.fillRect(this.x - 4, this.y - 360, 8, 360);
    if (Math.random() < 0.4) {
      c.fx.emit(TEXTURES.PIXEL, this.x + (Math.random() - 0.5) * 20, this.y, 0, -120, 0.5, 2.5, 0.3, 1, 0x9fe8ff, true, 0);
    }
  }

  // ---------------------------------------------------------------- rendering

  private animate(c: SquadContext, allowFire: boolean): void {
    const time = c.time;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const firing = allowFire && time < this.fireUntil;
    const moving = speed > 24;

    if (!firing) {
      const faceX = moving ? this.vx : c.headingX;
      const faceY = moving ? this.vy : c.headingY;
      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, Math.atan2(faceY, faceX), 12 * c.dt);
    }

    let key: string;
    let scale: number;
    if (moving) {
      this.phase = (this.phase + c.dt * TAU * 2.4 * Math.min(1.8, speed / SQUAD_CONFIG.speed)) % TAU;
      const frame = ((this.phase / TAU) * FRAMES.WALK_FRAMES) | 0;
      key = firing ? FIRE_KEYS[frame] : WALK_KEYS[frame];
      scale = 1 + 0.03 * Math.sin(this.phase * 2);
    } else {
      key = firing ? FIRE_KEYS[((time * 0.02) | 0) & (FRAMES.WALK_FRAMES - 1)] : IDLE_KEY;
      scale = 1 + 0.015 * Math.sin(time * 0.004 + this.slot);
    }
    this.setKey(key);
    this.sprite.setScale(scale);

    if (time < this.flashUntil) {
      if (!this.tinted) {
        this.sprite.setTint(0xff5a5a);
        this.tinted = true;
      }
    } else if (this.tinted) {
      this.applyTint(this.tint);
      this.tinted = false;
    }
    this.sprite.setAlpha(time < this.invulnUntil ? 0.7 + 0.3 * Math.sin(time * 0.04) : 1);
  }

  private render(): void {
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(this.rotation);
    this.shadow.setPosition(this.x + 2, this.y + 14);
    this.shadow.setAlpha(1);
  }

  private drawBar(fx: EffectsSystem, fraction: number, color: number): void {
    const g = fx.gfx;
    const x = this.x - BAR_WIDTH / 2;
    const y = this.y - 34;
    g.fillStyle(0x000000, 0.65);
    g.fillRect(x - 1, y - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
    g.fillStyle(color, 1);
    g.fillRect(x, y, BAR_WIDTH * Math.max(0, Math.min(1, fraction)), BAR_HEIGHT);
  }

  private setKey(key: string): void {
    if (key !== this.currentKey) {
      this.sprite.setTexture(key);
      this.currentKey = key;
    }
  }

  private applyTint(tint: number): void {
    if (tint === 0xffffff) {
      this.sprite.clearTint();
    } else {
      this.sprite.setTint(tint);
    }
  }
}
