import { CRYO_DURATION_MS, CRYO_SLOW, MAX_WEAPONS, WEAPONS } from '../config/WeaponsConfig';
import { TEXTURES } from '../config/GameConfig';
import type { WeaponId, WeaponLevelStats } from '../config/WeaponsConfig';
import type { Player } from '../entities/Player';
import type { Projectile } from '../entities/Projectile';
import type { EnemyPool } from '../pools/EnemyPool';
import type { ProjectilePool } from '../pools/ProjectilePool';
import { COLOR_CRYO } from './CombatHooks';
import type { CombatHooks } from './CombatHooks';
import type { EffectsSystem } from './EffectsSystem';

const PLASMA_ACQUIRE = 460;
const CLUSTER_MIN_LOB = 140;

const TAU = Math.PI * 2;
const MAX_DRONES = 8;
const MIN_COOLDOWN_MS = 40;
const RETRY_MS = 100;
const BARREL_OFFSET = 5;
const ROCKET_ACQUIRE_RANGE = 560;
const ARC_STUN_MS = 250;
const COLOR_ARC = 0x9fd8ff;
const CRYO_LIFE = 0.16;
const MAX_STRIKES = 6;

interface WeaponSlot {
  id: WeaponId;
  level: number;
  nextFireAt: number;
}

export class WeaponManager {
  readonly slots: WeaponSlot[] = [];
  slotCount = 0;

  private readonly muzzle = { x: 0, y: 0 };
  private readonly drones: (Projectile | null)[] = new Array<Projectile | null>(MAX_DRONES).fill(null);
  private droneCount = 0;

  private readonly chainIds = new Int32Array(6);
  private readonly strikeActive = new Uint8Array(MAX_STRIKES);
  private readonly strikeX = new Float32Array(MAX_STRIKES);
  private readonly strikeY = new Float32Array(MAX_STRIKES);
  private readonly strikeStart = new Float64Array(MAX_STRIKES);
  private readonly strikeAt = new Float64Array(MAX_STRIKES);
  private readonly strikeRadius = new Float32Array(MAX_STRIKES);
  private readonly strikeDamage = new Float32Array(MAX_STRIKES);
  private readonly strikeKnock = new Float32Array(MAX_STRIKES);

  constructor(
    private readonly player: Player,
    private readonly enemies: EnemyPool,
    private readonly projectiles: ProjectilePool,
    private readonly hooks: CombatHooks,
    private readonly fx: EffectsSystem,
  ) {
    for (let i = 0; i < MAX_WEAPONS; i++) {
      this.slots.push({ id: 'morita', level: 0, nextFireAt: 0 });
    }
  }

  /** Clears all weapons and equips the character's starting weapon. Call after the projectile pool was released. */
  reset(startingWeapon: WeaponId = 'morita'): void {
    this.slotCount = 0;
    this.droneCount = 0;
    this.drones.fill(null);
    this.strikeActive.fill(0);
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].level = 0;
      this.slots[i].nextFireAt = 0;
    }
    this.addWeapon(startingWeapon);
  }

  /** Theoretical damage per second if every projectile of every weapon connects. */
  estimateDps(): number {
    let dps = 0;
    for (let i = 0; i < this.slotCount; i++) {
      const s = this.statsOf(this.slots[i]);
      const cooldown = Math.max(MIN_COOLDOWN_MS, (s.cooldownMs * this.player.cooldownMult) / this.player.totalFireRate);
      dps += (s.damage * this.player.damageMult * s.count * 1000) / cooldown;
    }
    return dps;
  }

  has(id: WeaponId): boolean {
    return this.indexOf(id) !== -1;
  }

  getLevel(id: WeaponId): number {
    const i = this.indexOf(id);
    return i === -1 ? 0 : this.slots[i].level;
  }

  maxLevel(id: WeaponId): number {
    return WEAPONS[id].levels.length;
  }

  canAddWeapon(): boolean {
    return this.slotCount < MAX_WEAPONS;
  }

  /** Equips a new weapon at level 1, or levels it up if already owned. Returns false when impossible. */
  addWeapon(id: WeaponId): boolean {
    const existing = this.indexOf(id);
    if (existing !== -1) {
      return this.levelUp(id);
    }
    if (!this.canAddWeapon()) {
      return false;
    }
    const slot = this.slots[this.slotCount++];
    slot.id = id;
    slot.level = 1;
    slot.nextFireAt = 0;
    if (id === 'orbit') {
      this.syncDrones();
    }
    return true;
  }

  levelUp(id: WeaponId): boolean {
    const i = this.indexOf(id);
    if (i === -1 || this.slots[i].level >= this.maxLevel(id)) {
      return false;
    }
    this.slots[i].level++;
    if (id === 'orbit') {
      this.syncDrones();
    }
    return true;
  }

  /** Re-applies damage/cooldown multipliers to live drones after a passive upgrade. */
  syncDrones(): void {
    const i = this.indexOf('orbit');
    if (i === -1) {
      return;
    }
    const stats = this.statsOf(this.slots[i]);
    const damage = stats.damage * this.player.damageMult;
    const interval = Math.max(MIN_COOLDOWN_MS, (stats.cooldownMs * this.player.cooldownMult) / this.player.totalFireRate);
    const wanted = Math.min(MAX_DRONES, stats.count);
    const base = this.drones[0] ? this.drones[0].getOrbitAngle() : 0;

    for (let d = wanted; d < this.droneCount; d++) {
      const drone = this.drones[d];
      if (drone) {
        this.projectiles.release(drone);
      }
      this.drones[d] = null;
    }
    for (let d = 0; d < wanted; d++) {
      const angle = base + (d / wanted) * TAU;
      const drone = this.drones[d];
      if (drone && drone.active) {
        drone.retuneOrbit(stats.range, stats.speed, damage, interval);
        drone.setOrbitAngle(angle);
      } else {
        this.drones[d] = this.projectiles.fireOrbit(angle, stats.range, stats.speed, damage, interval);
      }
    }
    this.droneCount = wanted;
  }

  update(time: number): void {
    if (this.player.dead) {
      return;
    }
    this.updateStrikes(time);
    for (let i = 0; i < this.slotCount; i++) {
      const slot = this.slots[i];
      if (slot.id === 'orbit' || time < slot.nextFireAt) {
        continue;
      }
      const stats = this.statsOf(slot);
      const fired = this.fire(slot.id, stats, time);
      const cooldown = Math.max(MIN_COOLDOWN_MS, (stats.cooldownMs * this.player.cooldownMult) / this.player.totalFireRate);
      slot.nextFireAt = time + (fired ? cooldown : RETRY_MS);
    }
  }

  private indexOf(id: WeaponId): number {
    for (let i = 0; i < this.slotCount; i++) {
      if (this.slots[i].id === id) {
        return i;
      }
    }
    return -1;
  }

  private statsOf(slot: WeaponSlot): WeaponLevelStats {
    return WEAPONS[slot.id].levels[slot.level - 1];
  }

  private fire(id: WeaponId, s: WeaponLevelStats, time: number): boolean {
    switch (id) {
      case 'morita':
        return this.fireFan(s, time, s.spread, false);
      case 'shotgun':
        return this.fireFan(s, time, s.spread, true);
      case 'nova':
        return this.fireNova(s);
      case 'dualshotgun':
        return this.fireDualShotgun(s, time);
      case 'rocket':
        return this.fireRockets(s, time);
      case 'flamer':
        return this.fireFlamer(s, time);
      case 'arc':
        return this.fireArc(s, time);
      case 'orbital':
        return this.callOrbital(s, time);
      case 'plasma':
        return this.firePlasma(s, time);
      case 'smg':
        return this.fireSmg(s, time);
      case 'sniper':
        return this.fireSniper(s, time);
      case 'cluster':
        return this.fireCluster(s, time);
      case 'cryo':
        return this.fireCryo(s, time);
      default:
        return false;
    }
  }

  private firePlasma(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, PLASMA_ACQUIRE * PLASMA_ACQUIRE);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);
    const damage = s.damage * p.damageMult;
    const blast = s.area * p.perks.explosionRadiusMult;
    for (let i = 0; i < s.count; i++) {
      const t = s.count === 1 ? 0 : i - (s.count - 1) / 2;
      this.projectiles.firePlasma(this.muzzle.x, this.muzzle.y, aim + t * s.spread, s.speed, damage, s.range, blast);
    }
    this.fx.ring(this.muzzle.x, this.muzzle.y, 4, 30, 0.2, 0x7fd0ff, 3);
    return true;
  }

  private fireSmg(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);
    const sideX = -Math.sin(aim);
    const sideY = Math.cos(aim);
    const damage = s.damage * p.damageMult;
    const pierce = s.pierce + p.bonusPierce;
    for (let i = 0; i < s.count; i++) {
      const barrel = (i % 2 === 0 ? 1 : -1) * (BARREL_OFFSET + 2 * (i >> 1));
      this.projectiles.fireBullet(
        this.muzzle.x + sideX * barrel,
        this.muzzle.y + sideY * barrel,
        aim + (Math.random() - 0.5) * s.spread,
        s.speed * (0.92 + Math.random() * 0.16),
        damage,
        pierce,
        s.range * (0.9 + Math.random() * 0.15),
      );
    }
    if (Math.random() < 0.5) {
      this.emberBurst(this.muzzle.x, this.muzzle.y, aim, 1);
    }
    return true;
  }

  /** Rail round: fast, unlimited pierce, with an instant tracer line along the shot. */
  private fireSniper(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);
    const damage = s.damage * p.damageMult;
    for (let i = 0; i < s.count; i++) {
      const t = s.count === 1 ? 0 : i - (s.count - 1) / 2;
      const angle = aim + t * s.spread;
      this.projectiles.fireBullet(this.muzzle.x, this.muzzle.y, angle, s.speed, damage, s.pierce, s.range, TEXTURES.BULLET);
      const ex = this.muzzle.x + Math.cos(angle) * s.range;
      const ey = this.muzzle.y + Math.sin(angle) * s.range;
      this.fx.bolt(this.muzzle.x, this.muzzle.y, ex, ey, 0.12, 0xfff2c8, 3);
    }
    this.fx.ring(this.muzzle.x, this.muzzle.y, 4, 26, 0.12, 0xffffff, 3);
    this.emberBurst(this.muzzle.x, this.muzzle.y, aim, 4);
    return true;
  }

  /** Lobs canisters toward the thickest swarm; each lands at the target distance and splits into four bomblets. */
  private fireCluster(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findDensest(p.x, p.y, s.range * s.range, 6, 90) ?? this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const dx = target.x - this.muzzle.x;
    const dy = target.y - this.muzzle.y;
    const aim = Math.atan2(dy, dx);
    const dist = Math.min(s.range, Math.max(CLUSTER_MIN_LOB, Math.sqrt(dx * dx + dy * dy)));
    p.notifyFired(time, aim);
    const damage = s.damage * p.damageMult;
    const blast = s.area * p.perks.explosionRadiusMult;
    for (let i = 0; i < s.count; i++) {
      const t = s.count === 1 ? 0 : i - (s.count - 1) / 2;
      this.projectiles.fireGrenade(this.muzzle.x, this.muzzle.y, aim + t * s.spread * 0.5, s.speed, damage, dist * (0.9 + Math.random() * 0.2), blast);
    }
    this.emberBurst(this.muzzle.x, this.muzzle.y, aim, 3);
    return true;
  }

  /** Instant freezing beam. Every bug within `area` of the beam line is chilled (-60% speed) and damaged. */
  private fireCryo(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);
    const damage = s.damage * p.damageMult;
    const frost = s.burn * p.damageMult;
    const list = this.enemies.enemies;
    for (let b = 0; b < s.count; b++) {
      const t = s.count === 1 ? 0 : b - (s.count - 1) / 2;
      const angle = aim + t * s.spread;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const ex = this.muzzle.x + ux * s.range;
      const ey = this.muzzle.y + uy * s.range;
      this.fx.bolt(this.muzzle.x, this.muzzle.y, ex, ey, CRYO_LIFE, 0xbff4ff, s.area * 0.18);
      this.fx.bolt(this.muzzle.x, this.muzzle.y, ex, ey, CRYO_LIFE, 0x4fb8ff, s.area * 0.4);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active) {
          continue;
        }
        const rx = e.x - this.muzzle.x;
        const ry = e.y - this.muzzle.y;
        const along = rx * ux + ry * uy;
        if (along < 0 || along > s.range) {
          continue;
        }
        const px = rx - ux * along;
        const py = ry - uy * along;
        const reach = s.area + e.bodyRadius;
        if (px * px + py * py > reach * reach) {
          continue;
        }
        e.chill(time, CRYO_DURATION_MS, CRYO_SLOW, frost);
        this.hooks.damageEnemy(e, damage, ux, uy, 0.15, time, COLOR_CRYO);
        if (Math.random() < 0.4) {
          this.fx.emit(TEXTURES.PIXEL, e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.4, 2.4, 0.3, 0.9, 0xcff6ff, true, 0);
        }
      }
    }
    return true;
  }

  private fireDualShotgun(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);

    const sideX = -Math.sin(aim);
    const sideY = Math.cos(aim);
    const damage = s.damage * p.damageMult;
    for (let i = 0; i < s.count; i++) {
      const barrel = i % 2 === 0 ? BARREL_OFFSET : -BARREL_OFFSET;
      const t = s.count === 1 ? 0 : i / (s.count - 1) - 0.5;
      const angle = aim + t * s.spread + (Math.random() - 0.5) * s.spread * 0.18;
      const bullet = this.projectiles.fireBullet(
        this.muzzle.x + sideX * barrel,
        this.muzzle.y + sideY * barrel,
        angle,
        s.speed * (0.9 + Math.random() * 0.2),
        damage,
        s.pierce + p.bonusPierce,
        s.range * (0.85 + Math.random() * 0.15),
        TEXTURES.PELLET,
      );
      if (bullet) {
        bullet.knockMult = s.knock;
      }
    }
    this.fx.ring(this.muzzle.x + Math.cos(aim) * 14, this.muzzle.y + Math.sin(aim) * 14, 6, 34, 0.14, 0xffd27a, 3);
    this.emberBurst(this.muzzle.x, this.muzzle.y, aim, 5);
    return true;
  }

  private fireRockets(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, ROCKET_ACQUIRE_RANGE * ROCKET_ACQUIRE_RANGE);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);

    const damage = s.damage * p.damageMult;
    const blast = s.area * p.perks.explosionRadiusMult;
    for (let i = 0; i < s.count; i++) {
      const t = s.count === 1 ? 0 : i - (s.count - 1) / 2;
      this.projectiles.fireRocket(this.muzzle.x, this.muzzle.y, aim + t * s.spread * 0.5, s.speed, damage, s.range, blast);
    }
    this.emberBurst(this.muzzle.x, this.muzzle.y, aim + Math.PI, 6);
    return true;
  }

  private fireFlamer(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);

    const damage = s.damage * p.damageMult;
    const burn = s.burn * p.damageMult;
    for (let i = 0; i < s.count; i++) {
      const angle = aim + (Math.random() - 0.5) * s.spread;
      this.projectiles.fireFlame(
        this.muzzle.x,
        this.muzzle.y,
        angle,
        s.speed * (0.85 + Math.random() * 0.3),
        damage,
        s.range * (0.8 + Math.random() * 0.25),
        burn,
      );
    }
    if (Math.random() < 0.5) {
      this.emberBurst(this.muzzle.x, this.muzzle.y, aim, 1);
    }
    return true;
  }

  /** Instant chain lightning: the first bolt hits the nearest bug, then it jumps to the closest unhit bug within `area`. */
  private fireArc(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    let current = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!current) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    p.notifyFired(time, Math.atan2(current.y - this.muzzle.y, current.x - this.muzzle.x));

    const damage = s.damage * p.damageMult;
    const jumpSq = s.area * s.area;
    let fromX = this.muzzle.x;
    let fromY = this.muzzle.y;
    let hits = 0;

    while (current && hits < s.count && hits < this.chainIds.length) {
      const tx = current.x;
      const ty = current.y;
      this.chainIds[hits++] = current.uid;
      this.fx.bolt(fromX, fromY, tx, ty, 0.22, 0x7fc8ff, 2.5);
      this.fx.emit(TEXTURES.PIXEL, tx, ty, 0, 0, 0.18, 4, 0.5, 1, 0xbfe6ff, true, 0);

      const dx = tx - fromX;
      const dy = ty - fromY;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const victim = current;
      victim.stun(time, ARC_STUN_MS);
      this.hooks.damageEnemy(victim, damage, dx / len, dy / len, 0.3, time, COLOR_ARC);

      fromX = tx;
      fromY = ty;
      current = hits < s.count ? this.enemies.findNearestExcluding(fromX, fromY, jumpSq, this.chainIds, hits) : null;
    }
    return true;
  }

  /** Marks the densest cluster in range; the blast lands after `speed` ms. */
  private callOrbital(s: WeaponLevelStats, time: number): boolean {
    const p = this.player;
    const anchor = this.enemies.findDensest(p.x, p.y, s.range * s.range, 6, 120);
    if (!anchor) {
      return false;
    }
    const radius = s.area * p.perks.explosionRadiusMult;
    const damage = s.damage * p.damageMult;
    const ax = anchor.x;
    const ay = anchor.y;
    for (let i = 0; i < s.count; i++) {
      const slot = this.freeStrike();
      if (slot === -1) {
        break;
      }
      const a = Math.random() * TAU;
      const spread = i === 0 ? 0 : radius * 0.9;
      this.strikeActive[slot] = 1;
      this.strikeX[slot] = ax + Math.cos(a) * spread;
      this.strikeY[slot] = ay + Math.sin(a) * spread;
      this.strikeStart[slot] = time + i * 220;
      this.strikeAt[slot] = time + i * 220 + s.speed;
      this.strikeRadius[slot] = radius;
      this.strikeDamage[slot] = damage;
      this.strikeKnock[slot] = s.knock;
    }
    return true;
  }

  private freeStrike(): number {
    for (let i = 0; i < MAX_STRIKES; i++) {
      if (this.strikeActive[i] === 0) {
        return i;
      }
    }
    return -1;
  }

  private updateStrikes(time: number): void {
    const g = this.fx.gfx;
    for (let i = 0; i < MAX_STRIKES; i++) {
      if (this.strikeActive[i] === 0) {
        continue;
      }
      const x = this.strikeX[i];
      const y = this.strikeY[i];
      const r = this.strikeRadius[i];
      if (time >= this.strikeAt[i]) {
        this.strikeActive[i] = 0;
        this.fx.bolt(x, y - 900, x, y, 0.3, 0xffffff, 10);
        this.fx.emit(TEXTURES.PIXEL, x, y, 0, 0, 0.18, r * 0.5, r * 0.6, 0.9, 0xffffff, true, 0);
        this.hooks.explode(x, y, r, this.strikeDamage[i], this.strikeKnock[i], time, true);
        continue;
      }
      if (time < this.strikeStart[i]) {
        continue;
      }
      const total = this.strikeAt[i] - this.strikeStart[i];
      const t = 1 - (this.strikeAt[i] - time) / total;
      const pulse = 0.5 + 0.5 * Math.sin(time * (0.012 + t * 0.03));
      g.fillStyle(0xff2a1a, 0.06 + 0.12 * t);
      g.fillCircle(x, y, r);
      g.lineStyle(3, 0xff4a2a, 0.5 + 0.5 * pulse);
      g.strokeCircle(x, y, r);
      g.lineStyle(2, 0xffb09a, 0.7);
      g.strokeCircle(x, y, r * (1 - t));
      g.lineStyle(2, 0xff4a2a, 0.6);
      g.lineBetween(x - r * 0.25, y, x + r * 0.25, y);
      g.lineBetween(x, y - r * 0.25, x, y + r * 0.25);
      g.fillStyle(pulse > 0.5 ? 0xff3322 : 0x661008, 1);
      g.fillCircle(x, y, 7);
      g.fillStyle(0xffffff, pulse);
      g.fillCircle(x, y, 3);
    }
  }

  private emberBurst(x: number, y: number, angle: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * 0.9;
      const sp = 120 + Math.random() * 220;
      this.fx.emit(TEXTURES.PIXEL, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + Math.random() * 0.3, 1.1, 0.1, 1, i % 2 === 0 ? 0xffa020 : 0xffe27a, true, 0);
    }
  }

  /** Auto-aims at the nearest bug and fires `count` rounds; `cone` spreads them across `spread` radians, otherwise a tight fan. */
  private fireFan(s: WeaponLevelStats, time: number, spread: number, cone: boolean): boolean {
    const p = this.player;
    const target = this.enemies.findNearest(p.x, p.y, s.range * s.range);
    if (!target) {
      return false;
    }
    p.getMuzzle(this.muzzle);
    const aim = Math.atan2(target.y - this.muzzle.y, target.x - this.muzzle.x);
    p.notifyFired(time, aim);

    const damage = s.damage * p.damageMult;
    const n = s.count;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const jitter = cone ? (Math.random() - 0.5) * spread * 0.25 : 0;
      this.projectiles.fireBullet(
        this.muzzle.x,
        this.muzzle.y,
        aim + t * (cone ? spread : spread * (n - 1)) + jitter,
        s.speed,
        damage,
        s.pierce + p.bonusPierce,
        s.range,
      );
    }
    return true;
  }

  private fireNova(s: WeaponLevelStats): boolean {
    const p = this.player;
    if (!this.enemies.findNearest(p.x, p.y, s.range * s.range)) {
      return false;
    }
    const damage = s.damage * p.damageMult;
    const offset = Math.random() * TAU;
    for (let i = 0; i < s.count; i++) {
      this.projectiles.fireBullet(p.x, p.y, offset + (i / s.count) * TAU, s.speed, damage, s.pierce + p.bonusPierce, s.range);
    }
    return true;
  }
}
