import Phaser from 'phaser';
import { TEXTURES } from '../config/GameConfig';
import type { Enemy } from './Enemy';

export enum ProjectileKind {
  Bullet = 0,
  Orbit = 1,
  Rocket = 2,
  Flame = 3,
  Plasma = 4,
  Grenade = 5,
  Bomblet = 6,
}

const HIT_MEMORY = 32;
const TAU = Math.PI * 2;
const ROCKET_TURN_RATE = 3.6;
const FLAME_LIFE_GROWTH = 18;

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  readonly arcade: Phaser.Physics.Arcade.Body;

  poolIndex = 0;
  kind: ProjectileKind = ProjectileKind.Bullet;
  damage = 0;
  pierce = 0;
  radius = 6;
  dirX = 1;
  dirY = 0;
  hitInterval = 0;
  /** Multiplies the target's natural knockback on hit. */
  knockMult = 1;
  /** Burn damage per second applied to enemies hit (0 = none). */
  burnDps = 0;
  /** Splash radius of a rocket detonation. */
  blast = 0;
  target: Enemy | null = null;
  targetUid = 0;
  retargetAt = 0;
  trailAt = 0;

  private speed = 0;
  private travelled = 0;
  private range = 0;
  private heading = 0;
  private orbitAngle = 0;
  private orbitRadius = 0;
  private orbitSpeed = 0;
  private readonly hitIds = new Int32Array(HIT_MEMORY);
  private hitCount = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, TEXTURES.BULLET);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arcade = this.body as Phaser.Physics.Arcade.Body;
    this.disableBody(true, true);
  }

  private begin(x: number, y: number, kind: ProjectileKind, texture: string, depth: number): void {
    this.enableBody(true, x, y, true, true);
    this.kind = kind;
    this.setTexture(texture);
    this.setDepth(depth);
    this.setScale(1);
    this.setAlpha(1);
    this.setBlendMode(Phaser.BlendModes.NORMAL);
    this.knockMult = 1;
    this.burnDps = 0;
    this.blast = 0;
    this.target = null;
    this.targetUid = 0;
    this.retargetAt = 0;
    this.trailAt = 0;
    this.travelled = 0;
    this.hitCount = 0;
    this.hitIds.fill(-1);
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
  ): void {
    this.begin(x, y, ProjectileKind.Bullet, texture, 8);
    this.setRotation(angle);
    this.radius = 6;
    this.arcade.setCircle(4, this.width / 2 - 4, this.height / 2 - 4);

    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.damage = damage;
    this.pierce = pierce;
    this.range = range;
    this.arcade.setVelocity(this.dirX * speed, this.dirY * speed);
  }

  /** Guided rocket: the pool steers it toward the nearest bug; it explodes on contact or when the fuse runs out. */
  fireRocket(x: number, y: number, angle: number, speed: number, splashDamage: number, range: number, blastRadius: number): void {
    this.begin(x, y, ProjectileKind.Rocket, TEXTURES.ROCKET, 9);
    this.radius = 11;
    this.arcade.setCircle(5, this.width / 2 - 5, this.height / 2 - 5);
    this.heading = angle;
    this.speed = speed;
    this.damage = splashDamage;
    this.blast = blastRadius;
    this.pierce = 0;
    this.range = range;
    this.applyHeading();
  }

  /** Flame puff: unlimited pierce, grows and fades as it travels, ignites everything it touches. */
  fireFlame(x: number, y: number, angle: number, speed: number, damage: number, range: number, burnDps: number): void {
    this.begin(x, y, ProjectileKind.Flame, TEXTURES.FLAME, 7);
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.setRotation(Math.random() * TAU);
    this.setScale(0.5);
    this.radius = 10;
    this.arcade.setCircle(6, this.width / 2 - 6, this.height / 2 - 6);

    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.damage = damage;
    this.pierce = 999;
    this.range = range;
    this.burnDps = burnDps;
    this.arcade.setVelocity(this.dirX * speed, this.dirY * speed);
  }

  /** Plasma orb: slow, pierces everything and bursts in a wide blast when it burns out. */
  firePlasma(x: number, y: number, angle: number, speed: number, damage: number, range: number, blastRadius: number): void {
    this.begin(x, y, ProjectileKind.Plasma, TEXTURES.PLASMA, 9);
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.setRotation(angle);
    this.radius = 22;
    this.arcade.setCircle(16, this.width / 2 - 16, this.height / 2 - 16);
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.damage = damage;
    this.pierce = 999;
    this.range = range;
    this.blast = blastRadius;
    this.arcade.setVelocity(this.dirX * speed, this.dirY * speed);
  }

  /** Lofted canister. It flies over bugs; at the end of its arc the pool splits it into bomblets that use `damage` and `blastRadius`. */
  fireGrenade(x: number, y: number, angle: number, speed: number, bombletDamage: number, range: number, bombletBlast: number): void {
    this.begin(x, y, ProjectileKind.Grenade, TEXTURES.GRENADE, 10);
    this.setRotation(angle);
    this.radius = 0;
    this.arcade.setCircle(3, this.width / 2 - 3, this.height / 2 - 3);
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.damage = bombletDamage;
    this.pierce = 0;
    this.range = range;
    this.blast = bombletBlast;
    this.arcade.setVelocity(this.dirX * speed, this.dirY * speed);
  }

  /** Cluster sub-munition: short scatter flight, detonates on contact or at the end of its flight. */
  fireBomblet(x: number, y: number, angle: number, speed: number, damage: number, range: number, blastRadius: number): void {
    this.begin(x, y, ProjectileKind.Bomblet, TEXTURES.BOMBLET, 9);
    this.setRotation(angle);
    this.radius = 8;
    this.arcade.setCircle(4, this.width / 2 - 4, this.height / 2 - 4);
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.damage = damage;
    this.pierce = 0;
    this.range = range;
    this.blast = blastRadius;
    this.arcade.setVelocity(this.dirX * speed, this.dirY * speed);
  }

  fireOrbit(startAngle: number, radius: number, angularSpeed: number, damage: number, hitIntervalMs: number): void {
    this.begin(0, 0, ProjectileKind.Orbit, TEXTURES.DRONE, 9);
    this.radius = 15;
    this.arcade.setCircle(10, this.width / 2 - 10, this.height / 2 - 10);
    this.arcade.setVelocity(0, 0);

    this.orbitAngle = startAngle;
    this.orbitRadius = radius;
    this.orbitSpeed = angularSpeed;
    this.damage = damage;
    this.hitInterval = hitIntervalMs;
    this.pierce = 999;
  }

  setTarget(enemy: Enemy | null): void {
    this.target = enemy;
    this.targetUid = enemy ? enemy.uid : 0;
  }

  /** Turns a rocket toward a point at its limited turn rate. */
  steerToward(tx: number, ty: number, dt: number): void {
    const desired = Math.atan2(ty - this.y, tx - this.x);
    this.heading = Phaser.Math.Angle.RotateTo(this.heading, desired, ROCKET_TURN_RATE * dt);
    this.applyHeading();
  }

  private applyHeading(): void {
    this.dirX = Math.cos(this.heading);
    this.dirY = Math.sin(this.heading);
    this.setRotation(this.heading);
    this.arcade.setVelocity(this.dirX * this.speed, this.dirY * this.speed);
  }

  /** Re-tunes a live drone when its weapon levels up. */
  retuneOrbit(radius: number, angularSpeed: number, damage: number, hitIntervalMs: number): void {
    this.orbitRadius = radius;
    this.orbitSpeed = angularSpeed;
    this.damage = damage;
    this.hitInterval = hitIntervalMs;
  }

  getOrbitAngle(): number {
    return this.orbitAngle;
  }

  setOrbitAngle(angle: number): void {
    this.orbitAngle = angle;
  }

  hasHit(enemyUid: number): boolean {
    for (let i = 0; i < HIT_MEMORY; i++) {
      if (this.hitIds[i] === enemyUid) {
        return true;
      }
    }
    return false;
  }

  markHit(enemyUid: number): void {
    this.hitIds[this.hitCount % HIT_MEMORY] = enemyUid;
    this.hitCount++;
  }

  /** Advances the projectile. Returns false once a bullet has exhausted its range. */
  override update(time: number, delta: number, ownerX: number, ownerY: number): boolean {
    const dt = delta * 0.001;
    if (this.kind === ProjectileKind.Orbit) {
      this.orbitAngle = (this.orbitAngle + this.orbitSpeed * dt) % TAU;
      const c = Math.cos(this.orbitAngle);
      const s = Math.sin(this.orbitAngle);
      this.setPosition(ownerX + c * this.orbitRadius, ownerY + s * this.orbitRadius);
      this.dirX = c;
      this.dirY = s;
      this.rotation += 6 * dt;
      this.setScale(1 + 0.12 * Math.sin(time * 0.012 + this.poolIndex * 1.3));
      return true;
    }

    this.travelled += this.speed * dt;
    if (this.kind === ProjectileKind.Flame) {
      const t = this.travelled / this.range;
      this.setScale(0.5 + 1.25 * t);
      this.setAlpha(t < 0.55 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 0.55) / 0.45)));
      this.radius = 10 + FLAME_LIFE_GROWTH * t;
      this.rotation += 5 * dt;
    } else if (this.kind === ProjectileKind.Rocket) {
      this.setScale(1 + 0.05 * Math.sin(time * 0.06));
    } else if (this.kind === ProjectileKind.Plasma) {
      this.setScale(1 + 0.12 * Math.sin(time * 0.02 + this.poolIndex));
      this.rotation += 7 * dt;
    } else if (this.kind === ProjectileKind.Grenade) {
      const t = Math.min(1, this.travelled / this.range);
      this.setScale(0.85 + 0.9 * Math.sin(Math.PI * t));
      this.rotation += 9 * dt;
    } else if (this.kind === ProjectileKind.Bomblet) {
      this.rotation += 12 * dt;
    } else {
      this.setScale(1 + 0.15 * Math.sin(time * 0.05 + this.poolIndex), 1);
    }
    return this.travelled < this.range;
  }
}
