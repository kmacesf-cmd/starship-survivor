import Phaser from 'phaser';
import { POOL_SIZES, TEXTURES } from '../config/GameConfig';
import { Projectile, ProjectileKind } from '../entities/Projectile';
import type { Enemy } from '../entities/Enemy';
import type { EnemyPool } from './EnemyPool';

export type HitHandler = (enemy: Enemy, projectile: Projectile, time: number) => void;

export type RocketHandler = (projectile: Projectile, time: number) => void;

const ROCKET_RETARGET_MS = 120;
const ROCKET_SEEK_RANGE = 520;

export class ProjectilePool {
  readonly projectiles: Projectile[] = [];
  activeCount = 0;

  private readonly free: Int32Array;
  private freeCount: number;
  private onHit: HitHandler | null = null;
  private onDetonate: RocketHandler | null = null;
  private onTrail: RocketHandler | null = null;

  constructor(scene: Phaser.Scene, size: number = POOL_SIZES.projectiles) {
    this.free = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      const p = new Projectile(scene);
      p.poolIndex = i;
      this.projectiles.push(p);
      this.free[i] = size - 1 - i;
    }
    this.freeCount = size;
  }

  setHitHandler(handler: HitHandler): void {
    this.onHit = handler;
  }

  setDetonateHandler(handler: RocketHandler): void {
    this.onDetonate = handler;
  }

  setTrailHandler(handler: RocketHandler): void {
    this.onTrail = handler;
  }

  fireBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    pierce: number,
    range: number,
    texture: string = TEXTURES.BULLET,
  ): Projectile | null {
    const p = this.acquire();
    if (p) {
      p.fireBullet(x, y, angle, speed, damage, pierce, range, texture);
    }
    return p;
  }

  fireRocket(
    x: number,
    y: number,
    angle: number,
    speed: number,
    splashDamage: number,
    range: number,
    blastRadius: number,
  ): Projectile | null {
    const p = this.acquire();
    if (p) {
      p.fireRocket(x, y, angle, speed, splashDamage, range, blastRadius);
    }
    return p;
  }

  fireFlame(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    range: number,
    burnDps: number,
  ): Projectile | null {
    const p = this.acquire();
    if (p) {
      p.fireFlame(x, y, angle, speed, damage, range, burnDps);
    }
    return p;
  }

  fireOrbit(
    startAngle: number,
    radius: number,
    angularSpeed: number,
    damage: number,
    hitIntervalMs: number,
  ): Projectile | null {
    const p = this.acquire();
    if (p) {
      p.fireOrbit(startAngle, radius, angularSpeed, damage, hitIntervalMs);
    }
    return p;
  }

  release(p: Projectile): void {
    if (!p.active) {
      return;
    }
    p.disableBody(true, true);
    this.free[this.freeCount++] = p.poolIndex;
    this.activeCount--;
  }

  releaseAll(): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      this.release(this.projectiles[i]);
    }
  }

  update(time: number, delta: number, ownerX: number, ownerY: number, enemies: EnemyPool): void {
    const list = this.projectiles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) {
        continue;
      }
      const isRocket = p.kind === ProjectileKind.Rocket;
      if (isRocket) {
        this.steerRocket(p, time, delta * 0.001, enemies);
      }
      if (!p.update(time, delta, ownerX, ownerY)) {
        if (isRocket) {
          this.detonate(p, time);
        }
        this.release(p);
        continue;
      }
      if (isRocket && this.onTrail) {
        this.onTrail(p, time);
      }
      const onHit = this.onHit;
      if (!onHit) {
        continue;
      }

      const n = enemies.queryCircle(p.x, p.y, p.radius);
      if (isRocket) {
        if (n > 0) {
          this.detonate(p, time);
          this.release(p);
        }
        continue;
      }
      const isOrbit = p.kind === ProjectileKind.Orbit;
      for (let k = 0; k < n; k++) {
        const e = enemies.results[k];
        if (!e.active) {
          continue;
        }
        if (isOrbit) {
          if (time < e.orbitReadyAt) {
            continue;
          }
          e.orbitReadyAt = time + p.hitInterval;
          onHit(e, p, time);
          continue;
        }
        if (p.hasHit(e.uid)) {
          continue;
        }
        p.markHit(e.uid);
        onHit(e, p, time);
        if (p.pierce <= 0) {
          this.release(p);
          break;
        }
        p.pierce--;
      }
    }
  }

  private detonate(p: Projectile, time: number): void {
    if (this.onDetonate) {
      this.onDetonate(p, time);
    }
  }

  private steerRocket(p: Projectile, time: number, dt: number, enemies: EnemyPool): void {
    let target = p.target;
    if (target && (!target.active || target.uid !== p.targetUid)) {
      target = null;
      p.setTarget(null);
    }
    if (!target && time >= p.retargetAt) {
      p.retargetAt = time + ROCKET_RETARGET_MS;
      target = enemies.findNearest(p.x, p.y, ROCKET_SEEK_RANGE * ROCKET_SEEK_RANGE);
      p.setTarget(target);
    }
    if (target) {
      p.steerToward(target.x, target.y, dt);
    }
  }

  private acquire(): Projectile | null {
    if (this.freeCount === 0) {
      return null;
    }
    this.activeCount++;
    return this.projectiles[this.free[--this.freeCount]];
  }
}
