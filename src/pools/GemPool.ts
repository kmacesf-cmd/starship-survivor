import Phaser from 'phaser';
import { POOL_SIZES, TEXTURES } from '../config/GameConfig';

const COLLECT_RADIUS_SQ = 22 * 22;
const MAGNET_START_SPEED = 120;
const MAGNET_ACCEL = 1800;
const MAX_STEP_MS = 50;

export class Gem extends Phaser.GameObjects.Image {
  poolIndex = 0;
  value = 1;
  magnetized = false;
  baseY = 0;
  phase = 0;
  chaseSpeed = 0;
  private baseScale = 1;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, TEXTURES.GEM);
    scene.add.existing(this);
    this.setDepth(3);
    this.setActive(false).setVisible(false);
  }

  setup(x: number, y: number, value: number, phase: number): void {
    this.setActive(true).setVisible(true);
    this.setPosition(x, y);
    this.baseY = y;
    this.phase = phase;
    this.magnetized = false;
    this.chaseSpeed = 0;
    this.setValue(value);
  }

  setValue(value: number): void {
    this.value = value;
    if (value >= 8) {
      this.baseScale = 1.5;
      this.setTint(0xa8fff0);
    } else if (value >= 3) {
      this.baseScale = 1.15;
      this.setTint(0xd8ff8a);
    } else {
      this.baseScale = 0.8;
      this.clearTint();
    }
  }

  animate(time: number): void {
    const pulse = Math.sin(time * 0.006 + this.phase);
    this.setScale(this.baseScale * (1 + 0.08 * pulse));
    this.setAlpha(0.85 + 0.15 * Math.sin(time * 0.009 + this.phase * 1.7));
    if (!this.magnetized) {
      this.y = this.baseY + pulse * 2.5;
    }
  }
}

export class GemPool {
  readonly gems: Gem[] = [];
  activeCount = 0;

  private readonly free: Int32Array;
  private freeCount: number;
  private mergeCursor = 0;
  private spawnCounter = 0;

  constructor(scene: Phaser.Scene, size: number = POOL_SIZES.gems) {
    this.free = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      const gem = new Gem(scene);
      gem.poolIndex = i;
      this.gems.push(gem);
      this.free[i] = size - 1 - i;
    }
    this.freeCount = size;
  }

  /** When the pool is exhausted the value is merged into an existing gem, so no XP is ever lost. */
  spawn(x: number, y: number, value: number): Gem {
    if (this.freeCount === 0) {
      const victim = this.gems[this.mergeCursor];
      this.mergeCursor = (this.mergeCursor + 1) % this.gems.length;
      victim.setValue(victim.value + value);
      return victim;
    }
    const gem = this.gems[this.free[--this.freeCount]];
    gem.setup(x, y, value, (this.spawnCounter++ * 2.399) % (Math.PI * 2));
    this.activeCount++;
    return gem;
  }

  release(gem: Gem): void {
    if (!gem.active) {
      return;
    }
    gem.setActive(false).setVisible(false);
    this.free[this.freeCount++] = gem.poolIndex;
    this.activeCount--;
  }

  releaseAll(): void {
    for (let i = 0; i < this.gems.length; i++) {
      this.release(this.gems[i]);
    }
  }

  /** Pulls every gem on the map toward the player (e.g. a vacuum pickup). */
  magnetizeAll(): void {
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      if (g.active && !g.magnetized) {
        g.magnetized = true;
        g.chaseSpeed = MAGNET_START_SPEED;
      }
    }
  }

  /** Moves/collects gems and returns the total XP value collected this frame. */
  update(time: number, delta: number, px: number, py: number, pickupRadiusSq: number, maxChaseSpeed: number): number {
    const dt = Math.min(delta, MAX_STEP_MS) * 0.001;
    let collected = 0;
    const gems = this.gems;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (!g.active) {
        continue;
      }
      const dx = px - g.x;
      const dy = py - g.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= COLLECT_RADIUS_SQ) {
        collected += g.value;
        this.release(g);
        continue;
      }
      if (!g.magnetized && d2 <= pickupRadiusSq) {
        g.magnetized = true;
        g.chaseSpeed = MAGNET_START_SPEED;
      }
      if (g.magnetized) {
        g.chaseSpeed = Math.min(maxChaseSpeed, g.chaseSpeed + MAGNET_ACCEL * dt);
        const step = (g.chaseSpeed * dt) / Math.sqrt(d2);
        g.x += dx * step;
        g.y += dy * step;
        g.baseY = g.y;
      }
      g.animate(time);
    }
    return collected;
  }
}
