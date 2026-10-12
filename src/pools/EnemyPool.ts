import Phaser from 'phaser';
import { ENEMY_TYPES, POOL_SIZES } from '../config/GameConfig';
import type { EnemyKey } from '../config/GameConfig';
import { Enemy } from '../entities/Enemy';

const CELL = 64;
const BUCKETS = 1024;
const BUCKET_MASK = BUCKETS - 1;
const MAX_RADIUS = Math.max(ENEMY_TYPES.warrior.bodyRadius, ENEMY_TYPES.tiger.bodyRadius);
const FAR_DISTANCE_SQ = 1600 * 1600;
const FLANK_NEAR_SQ = 220 * 220;
const FLANK_RAMP_SQ = 500 * 500;
const FLANK_ANGLE = 0.55;
const LEAD_SEC = 0.7;
const SEPARATION_STRENGTH = 150;

const bucketOf = (cx: number, cy: number): number =>
  (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & BUCKET_MASK;

export type BurnHandler = (enemy: Enemy, damage: number, time: number) => void;

export class EnemyPool {
  readonly enemies: Enemy[] = [];
  /** Filled by queryCircle(); only the first `count` entries are valid. Shared, so never call queryCircle re-entrantly. */
  readonly results: Enemy[];
  activeCount = 0;
  onBurn: BurnHandler | null = null;
  /** Hard difficulty: bugs flank and lead the player's movement. */
  smartAI = false;

  private leadX = 0;
  private leadY = 0;
  private readonly free: Int32Array;
  private freeCount: number;
  private readonly head = new Int32Array(BUCKETS);
  private readonly next: Int32Array;
  private readonly stamp: Int32Array;
  private queryId = 0;
  private nextUid = 1;

  constructor(scene: Phaser.Scene, size: number = POOL_SIZES.enemies) {
    this.free = new Int32Array(size);
    this.next = new Int32Array(size);
    this.stamp = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      const enemy = new Enemy(scene);
      enemy.poolIndex = i;
      this.enemies.push(enemy);
      this.free[i] = size - 1 - i;
    }
    this.freeCount = size;
    this.results = new Array<Enemy>(size).fill(this.enemies[0]);
  }

  get capacity(): number {
    return this.enemies.length;
  }

  spawn(x: number, y: number, key: EnemyKey, hpMult: number, speedMult: number): Enemy | null {
    if (this.freeCount === 0) {
      return null;
    }
    const enemy = this.enemies[this.free[--this.freeCount]];
    enemy.spawn(x, y, ENEMY_TYPES[key], hpMult, speedMult, this.nextUid++);
    this.activeCount++;
    return enemy;
  }

  release(enemy: Enemy): void {
    if (!enemy.active) {
      return;
    }
    enemy.disableBody(true, true);
    this.free[this.freeCount++] = enemy.poolIndex;
    this.activeCount--;
  }

  releaseAll(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      this.release(this.enemies[i]);
    }
  }

  update(time: number, delta: number, targetX: number, targetY: number, velX = 0, velY = 0): void {
    this.leadX = velX * LEAD_SEC;
    this.leadY = velY * LEAD_SEC;
    this.rebuildGrid();
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = targetX - e.x;
      const dy = targetY - e.y;
      if (dx * dx + dy * dy > FAR_DISTANCE_SQ) {
        this.release(e);
        continue;
      }

      const burn = e.collectBurn(time);
      if (burn > 0 && this.onBurn) {
        this.onBurn(e, burn, time);
        if (!e.active) {
          continue;
        }
      }
      let sx = 0;
      let sy = 0;
      const n = this.queryCircle(e.x, e.y, e.bodyRadius);
      for (let k = 0; k < n; k++) {
        const o = this.results[k];
        if (o === e) {
          continue;
        }
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const minD = e.bodyRadius + o.bodyRadius;
        const d2 = ox * ox + oy * oy;
        if (d2 < 1) {
          sx += (e.uid & 1 ? 1 : -1) * SEPARATION_STRENGTH;
          continue;
        }
        const overlap = 1 - d2 / (minD * minD);
        const push = overlap * SEPARATION_STRENGTH * (o.bodyRadius / minD) * 2;
        sx += (ox / minD) * push;
        sy += (oy / minD) * push;
      }
      e.sepX = sx;
      e.sepY = sy;
      let aimX = targetX;
      let aimY = targetY;
      if (this.smartAI) {
        const far = dx * dx + dy * dy - FLANK_NEAR_SQ;
        if (far > 0) {
          const f = far > FLANK_RAMP_SQ ? 1 : far / FLANK_RAMP_SQ;
          const side = e.uid & 1 ? 1 : -1;
          const rot = side * FLANK_ANGLE * f;
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          const rx = -dx;
          const ry = -dy;
          aimX = targetX + this.leadX * f + rx * c - ry * s;
          aimY = targetY + this.leadY * f + rx * s + ry * c;
        }
      }
      e.update(time, delta, aimX, aimY);
    }
  }

  /** Fills `results` with every active enemy whose circle overlaps the query circle. Returns the count. */
  queryCircle(x: number, y: number, radius: number): number {
    const id = ++this.queryId;
    const reach = radius + MAX_RADIUS;
    const x0 = Math.floor((x - reach) / CELL);
    const x1 = Math.floor((x + reach) / CELL);
    const y0 = Math.floor((y - reach) / CELL);
    const y1 = Math.floor((y + reach) / CELL);
    let count = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[bucketOf(cx, cy)];
        while (i !== -1) {
          if (this.stamp[i] !== id) {
            this.stamp[i] = id;
            const e = this.enemies[i];
            if (e.active) {
              const dx = e.x - x;
              const dy = e.y - y;
              const rr = radius + e.bodyRadius;
              if (dx * dx + dy * dy <= rr * rr) {
                this.results[count++] = e;
              }
            }
          }
          i = this.next[i];
        }
      }
    }
    return count;
  }

  /** Nearest active enemy within sqrt(maxDistSq), or null. Uses squared distances only. */
  findNearest(x: number, y: number, maxDistSq: number): Enemy | null {
    let best: Enemy | null = null;
    let bestSq = maxDistSq;
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestSq) {
        bestSq = d2;
        best = e;
      }
    }
    return best;
  }

  /** Highest damage among non-stunned enemies touching the given circle (0 when none). */
  contactDamage(x: number, y: number, radius: number, time = 0): number {
    const n = this.queryCircle(x, y, radius);
    let damage = 0;
    for (let i = 0; i < n; i++) {
      const e = this.results[i];
      if (time < e.stunUntil) {
        continue;
      }
      if (e.damage > damage) {
        damage = e.damage;
      }
    }
    return damage;
  }

  /** Nearest enemy within sqrt(maxDistSq) whose uid is not in `excluded[0..excludedCount)`. */
  findNearestExcluding(x: number, y: number, maxDistSq: number, excluded: Int32Array, excludedCount: number): Enemy | null {
    let best: Enemy | null = null;
    let bestSq = maxDistSq;
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestSq) {
        continue;
      }
      let skip = false;
      for (let k = 0; k < excludedCount; k++) {
        if (excluded[k] === e.uid) {
          skip = true;
          break;
        }
      }
      if (!skip) {
        bestSq = d2;
        best = e;
      }
    }
    return best;
  }

  /**
   * Samples up to `samples` enemies inside the reach circle and returns the one with the most neighbours
   * within `probeRadius`; ideal for aiming area strikes at the thickest part of a swarm.
   */
  findDensest(x: number, y: number, maxDistSq: number, samples: number, probeRadius: number): Enemy | null {
    const enemies = this.enemies;
    const total = enemies.length;
    const start = (Math.random() * total) | 0;
    let best: Enemy | null = null;
    let bestCount = -1;
    let tried = 0;
    for (let k = 0; k < total && tried < samples; k++) {
      const e = enemies[(start + k) % total];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy > maxDistSq) {
        continue;
      }
      tried++;
      const count = this.queryCircle(e.x, e.y, probeRadius);
      if (count > bestCount) {
        bestCount = count;
        best = e;
      }
    }
    return best;
  }

  /** Stuns every enemy overlapping the circle. Returns how many were affected. */
  stunCircle(x: number, y: number, radius: number, time: number, durationMs: number): number {
    const n = this.queryCircle(x, y, radius);
    for (let i = 0; i < n; i++) {
      this.results[i].stun(time, durationMs);
    }
    return n;
  }

  private rebuildGrid(): void {
    this.head.fill(-1);
    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const b = bucketOf(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      this.next[i] = this.head[b];
      this.head[b] = i;
    }
  }
}
