import Phaser from 'phaser';
import { AIR_SUPPORT, TEXTURES } from '../config/GameConfig';
import type { Player } from '../entities/Player';
import type { CombatHooks } from './CombatHooks';
import type { EffectsSystem } from './EffectsSystem';
import type { PerkSystem } from './PerkSystem';

const BOMBER_COUNT = AIR_SUPPORT.bombers;
const BOMB_DROP_HEIGHT = 90;
const BOMBER_DEPTH = 40;
const BOMB_DEPTH = 39;
const RUN_MARGIN = 260;
const SCREEN_W = 1280;

/** HUD-facing air support values; GameScene's HudState extends this. */
export interface AirSupportHud {
  airVisible: number;
  airCharge01: number;
  airReady: number;
  airRunning: number;
}

/**
 * Three-bomber carpet run. The charge meter is filled by collected gems; at 100% the run can be called in.
 * Bombers, bombs and all state are preallocated, so a run allocates nothing.
 */
export class AirSupportSystem {
  /** 0..100 */
  charge = 0;
  private running = false;
  private runTime = 0;
  private startX = 0;
  private laneY = 0;
  private endTime = 0;
  private dropInterval = 0;
  private bombsPerBomber = 0;
  private radius = 0;
  private damage = 0;

  private readonly bombers: Phaser.GameObjects.Image[] = [];
  private readonly nextDrop = new Int32Array(BOMBER_COUNT);

  private readonly bombs: Phaser.GameObjects.Image[] = [];
  private readonly bombActive = new Uint8Array(AIR_SUPPORT.maxBombs);
  private readonly bombX = new Float32Array(AIR_SUPPORT.maxBombs);
  private readonly bombY = new Float32Array(AIR_SUPPORT.maxBombs);
  private readonly bombAge = new Float32Array(AIR_SUPPORT.maxBombs);
  private bombCursor = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly player: Player,
    private readonly fx: EffectsSystem,
    private readonly hooks: CombatHooks,
    private readonly perks: PerkSystem,
  ) {
    for (let i = 0; i < BOMBER_COUNT; i++) {
      this.bombers.push(scene.add.image(0, 0, TEXTURES.BOMBER).setDepth(BOMBER_DEPTH).setScale(0.9).setVisible(false).setActive(false));
    }
    for (let i = 0; i < AIR_SUPPORT.maxBombs; i++) {
      this.bombs.push(scene.add.image(0, 0, TEXTURES.BOMB).setDepth(BOMB_DEPTH).setVisible(false).setActive(false));
    }
  }

  get charge01(): number {
    return this.charge / 100;
  }

  get ready(): boolean {
    return !this.running && this.charge >= 100;
  }

  get isRunning(): boolean {
    return this.running;
  }

  reset(): void {
    this.charge = 0;
    this.running = false;
    for (let i = 0; i < BOMBER_COUNT; i++) {
      this.bombers[i].setVisible(false).setActive(false);
    }
    for (let i = 0; i < AIR_SUPPORT.maxBombs; i++) {
      this.bombs[i].setVisible(false).setActive(false);
      this.bombActive[i] = 0;
    }
  }

  /** Adds charge for `gemCount` collected gems. */
  addGems(gemCount: number): void {
    if (gemCount <= 0 || this.running) {
      return;
    }
    this.charge = Math.min(100, this.charge + gemCount * AIR_SUPPORT.chargePerGem * this.perks.bomberChargeMult);
  }

  /** Starts a run centred on the player's current lane. Returns false when not fully charged. */
  trigger(cam: Phaser.Cameras.Scene2D.Camera, time: number): boolean {
    if (!this.ready) {
      return false;
    }
    this.charge = 0;
    this.running = true;
    this.runTime = 0;
    this.startX = cam.scrollX - RUN_MARGIN;
    this.laneY = this.player.y;
    this.bombsPerBomber = AIR_SUPPORT.bombsPerBomber + this.perks.bomberExtraBombs;
    this.radius = AIR_SUPPORT.bombRadius * this.perks.bomberRadiusMult * this.player.perks.explosionRadiusMult;
    this.damage = AIR_SUPPORT.bombDamage * this.perks.bomberDamageMult * this.player.damageMult;
    const bombSpan = SCREEN_W + RUN_MARGIN * 0.6;
    this.dropInterval = bombSpan / AIR_SUPPORT.speed / this.bombsPerBomber;
    const totalDistance = SCREEN_W + RUN_MARGIN * 2 + (BOMBER_COUNT - 1) * AIR_SUPPORT.echelonX;
    this.endTime = totalDistance / AIR_SUPPORT.speed;
    for (let i = 0; i < BOMBER_COUNT; i++) {
      this.nextDrop[i] = 0;
      this.bombers[i].setActive(true).setVisible(true).setAlpha(1);
    }
    this.fx.ring(this.player.x, this.player.y, 20, 140, 0.6, 0xffd34a, 4);
    this.positionBombers();
    void time;
    return true;
  }

  update(time: number, dt: number): void {
    const sec = dt * 0.001;
    if (this.running) {
      this.runTime += sec;
      this.positionBombers();
      this.dropBombs();
      if (this.runTime >= this.endTime) {
        this.running = false;
        for (let i = 0; i < BOMBER_COUNT; i++) {
          this.bombers[i].setVisible(false).setActive(false);
        }
      }
    }
    this.updateBombs(time, sec);
  }

  private positionBombers(): void {
    const lead = this.startX + this.runTime * AIR_SUPPORT.speed;
    for (let i = 0; i < BOMBER_COUNT; i++) {
      const b = this.bombers[i];
      const lane = i - (BOMBER_COUNT - 1) / 2;
      b.setPosition(lead - i * AIR_SUPPORT.echelonX, this.laneY + lane * AIR_SUPPORT.echelonY);
      b.setRotation(Math.sin(this.runTime * 3 + i) * 0.02);
      if (Math.random() < 0.6) {
        this.fx.emit(TEXTURES.PIXEL, b.x - 70, b.y + (Math.random() - 0.5) * 20, -60, (Math.random() - 0.5) * 20, 0.5, 3.4, 0.4, 0.5, 0xffb060, true, 0);
      }
    }
  }

  private dropBombs(): void {
    for (let i = 0; i < BOMBER_COUNT; i++) {
      const b = this.bombers[i];
      const sx = this.startX + this.runTime * AIR_SUPPORT.speed - i * AIR_SUPPORT.echelonX;
      // Bombs only fall while the bomber is over the visible span, staggered per bomber.
      const dropStart = this.startX + RUN_MARGIN * 0.7;
      while (this.nextDrop[i] < this.bombsPerBomber && sx >= dropStart + this.nextDrop[i] * this.dropInterval * AIR_SUPPORT.speed) {
        this.spawnBomb(b.x, b.y);
        this.nextDrop[i]++;
      }
    }
  }

  private spawnBomb(x: number, y: number): void {
    let slot = -1;
    for (let i = 0; i < AIR_SUPPORT.maxBombs; i++) {
      const idx = (this.bombCursor + i) % AIR_SUPPORT.maxBombs;
      if (this.bombActive[idx] === 0) {
        slot = idx;
        break;
      }
    }
    if (slot < 0) {
      return;
    }
    this.bombCursor = (slot + 1) % AIR_SUPPORT.maxBombs;
    this.bombActive[slot] = 1;
    this.bombX[slot] = x + 40;
    this.bombY[slot] = y;
    this.bombAge[slot] = 0;
    this.bombs[slot].setActive(true).setVisible(true).setPosition(x + 40, y - BOMB_DROP_HEIGHT).setRotation(0.1);
  }

  private updateBombs(time: number, sec: number): void {
    const fallSec = AIR_SUPPORT.fallMs * 0.001;
    for (let i = 0; i < AIR_SUPPORT.maxBombs; i++) {
      if (this.bombActive[i] === 0) {
        continue;
      }
      const age = this.bombAge[i] + sec;
      this.bombAge[i] = age;
      const t = age / fallSec;
      const img = this.bombs[i];
      if (t >= 1) {
        this.bombActive[i] = 0;
        img.setActive(false).setVisible(false);
        this.hooks.explode(this.bombX[i], this.bombY[i], this.radius, this.damage, 2, time, true);
        this.fx.ring(this.bombX[i], this.bombY[i], this.radius * 0.3, this.radius * 1.1, 0.45, 0xffa030, 5);
        continue;
      }
      img.setPosition(this.bombX[i], this.bombY[i] - BOMB_DROP_HEIGHT * (1 - t * t) * 3);
      img.setRotation(0.1 + t * 1.2);
      img.setScale(1.5 - 0.5 * t);
    }
  }

  writeHud(h: AirSupportHud, visible: boolean): void {
    h.airVisible = visible ? 1 : 0;
    h.airCharge01 = this.charge01;
    h.airReady = this.ready ? 1 : 0;
    h.airRunning = this.running ? 1 : 0;
  }
}
