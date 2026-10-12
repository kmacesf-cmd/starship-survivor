import Phaser from 'phaser';
import { TEXTURES } from '../config/GameConfig';
import { SPECIAL_IDS, SPECIAL_TUNING, SPECIALS } from '../config/SpecialsConfig';
import type { SpecialId } from '../config/SpecialsConfig';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { EnemyPool } from '../pools/EnemyPool';
import { COLOR_LASER, COLOR_NAPALM } from './CombatHooks';
import type { CombatHooks } from './CombatHooks';
import type { EffectsSystem } from './EffectsSystem';
import type { SquadSystem } from './SquadSystem';
import type { WeaponManager } from './WeaponManager';

const TAU = Math.PI * 2;
const MAX_SENTRIES = 6;
const BEAM_MS = 70;
const POOL_TICK_SEC = 0.25;
const STIM_READY = 0;
const STIM_ACTIVE = 1;
const STIM_COOLDOWN = 2;

/** HUD-facing values for the specials; GameScene's HudState extends this. */
export interface SpecialsHud {
  /** 0..1 progress toward the next nuke; -1 when the special is not owned. */
  nukeCharge01: number;
  nukeWarning: number;
  stimState: number;
  stimFraction: number;
  overclockLevel: number;
}

interface Sentry {
  image: Phaser.GameObjects.Image;
  nextBurstAt: number;
  shotsLeft: number;
  nextShotAt: number;
  beamUntil: number;
  beamX: number;
  beamY: number;
}

/**
 * The five special upgrades: Tactical Nuke, SICON Combat Stim, Sentry Drone Squad, Napalm Gel and Squad Overclock.
 * All state lives in preallocated typed arrays and a fixed set of drone images, so nothing allocates during play.
 */
export class SpecialsSystem {
  private readonly levels: Record<SpecialId, number> = { nuke: 0, stim: 0, sentry: 0, napalm: 0, overclock: 0 };
  private clock = 0;

  // nuke
  private nextNukeAt = 0;
  private nukeIntervalSec = 60;

  // stim
  private stimState = STIM_READY;
  private stimUntil = 0;
  private stimReadyAt = 0;
  private stimDuration = 5;
  private stimCooldown = 60;

  // sentry
  private readonly sentries: Sentry[] = [];
  private sentryAngle = 0;
  private sentryCount = 0;

  // napalm
  private readonly maxPools = SPECIAL_TUNING.napalm.maxPools;
  private readonly poolActive = new Uint8Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolX = new Float32Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolY = new Float32Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolExpire = new Float64Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolLife = new Float32Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolRadius = new Float32Array(SPECIAL_TUNING.napalm.maxPools);
  private readonly poolNextTick = new Float64Array(SPECIAL_TUNING.napalm.maxPools);

  constructor(
    scene: Phaser.Scene,
    private readonly player: Player,
    private readonly enemies: EnemyPool,
    private readonly weapons: WeaponManager,
    private readonly squad: SquadSystem,
    private readonly fx: EffectsSystem,
    private readonly hooks: CombatHooks,
  ) {
    for (let i = 0; i < MAX_SENTRIES; i++) {
      const image = scene.add.image(0, 0, TEXTURES.DRONE).setDepth(11).setTint(0x7dffea).setScale(0.8).setVisible(false).setActive(false);
      this.sentries.push({ image, nextBurstAt: 0, shotsLeft: 0, nextShotAt: 0, beamUntil: 0, beamX: 0, beamY: 0 });
    }
  }

  getLevel(id: SpecialId): number {
    return this.levels[id];
  }

  /** Total special levels, used by the pause stats. */
  get ownedCount(): number {
    let n = 0;
    for (let i = 0; i < SPECIAL_IDS.length; i++) {
      if (this.levels[SPECIAL_IDS[i]] > 0) {
        n++;
      }
    }
    return n;
  }

  reset(): void {
    for (let i = 0; i < SPECIAL_IDS.length; i++) {
      this.levels[SPECIAL_IDS[i]] = 0;
    }
    this.clock = 0;
    this.nextNukeAt = Number.POSITIVE_INFINITY;
    this.stimState = STIM_READY;
    this.stimUntil = 0;
    this.stimReadyAt = 0;
    this.sentryAngle = 0;
    this.sentryCount = 0;
    this.poolActive.fill(0);
    for (let i = 0; i < MAX_SENTRIES; i++) {
      const s = this.sentries[i];
      s.image.setVisible(false).setActive(false);
      s.beamUntil = 0;
    }
    this.player.fireRateMult = 1;
    this.squad.overclockLevel = 0;
  }

  /** Raises a special by one level (capped at its max). Returns false at the cap. */
  raise(id: SpecialId): boolean {
    if (this.levels[id] >= SPECIALS[id].maxLevel) {
      return false;
    }
    const first = this.levels[id] === 0;
    this.levels[id]++;
    const lvl = this.levels[id];
    switch (id) {
      case 'nuke': {
        this.nukeIntervalSec = SPECIAL_TUNING.nuke.intervalSec(lvl);
        const due = this.clock + this.nukeIntervalSec;
        this.nextNukeAt = first ? due : Math.min(this.nextNukeAt, due);
        break;
      }
      case 'stim':
        this.stimDuration = SPECIAL_TUNING.stim.durationSec(lvl);
        this.stimCooldown = SPECIAL_TUNING.stim.cooldownSec(lvl);
        if (this.stimState === STIM_ACTIVE) {
          this.player.fireRateMult = SPECIAL_TUNING.stim.fireRate(lvl);
        }
        break;
      case 'sentry':
        this.syncSentries();
        break;
      case 'overclock':
        this.squad.overclockLevel = lvl;
        break;
      default:
        break;
    }
    return true;
  }

  update(time: number, dt: number): void {
    const sec = dt * 0.001;
    this.clock += sec;
    if (this.player.dead) {
      return;
    }
    this.updateNuke(time);
    this.updateStim(time);
    this.updateSentries(time, sec);
    this.updateNapalm(time);
  }

  writeHud(h: SpecialsHud): void {
    const lvlNuke = this.levels.nuke;
    if (lvlNuke > 0) {
      const left = Math.max(0, this.nextNukeAt - this.clock);
      h.nukeCharge01 = Math.max(0, Math.min(1, 1 - left / this.nukeIntervalSec));
      h.nukeWarning = left <= SPECIAL_TUNING.nuke.warnSec ? 1 : 0;
    } else {
      h.nukeCharge01 = -1;
      h.nukeWarning = 0;
    }
    h.stimState = this.levels.stim > 0 ? this.stimState : -1;
    if (this.stimState === STIM_ACTIVE) {
      h.stimFraction = Math.max(0, (this.stimUntil - this.clock) / this.stimDuration);
    } else if (this.stimState === STIM_COOLDOWN) {
      h.stimFraction = Math.max(0, 1 - (this.stimReadyAt - this.clock) / this.stimCooldown);
    } else {
      h.stimFraction = 1;
    }
    h.overclockLevel = this.levels.overclock;
  }

  /** Called for every weapon-sourced hit; drops or refreshes a napalm pool under the target. */
  onWeaponHit(x: number, y: number): void {
    const lvl = this.levels.napalm;
    if (lvl <= 0) {
      return;
    }
    const tuning = SPECIAL_TUNING.napalm;
    const life = tuning.durationSec(lvl);
    const merge = tuning.mergeRadius;
    const mergeSq = merge * merge;
    let freeSlot = -1;
    let oldest = 0;
    let oldestExpire = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.maxPools; i++) {
      if (this.poolActive[i] === 0) {
        if (freeSlot === -1) {
          freeSlot = i;
        }
        continue;
      }
      const dx = x - this.poolX[i];
      const dy = y - this.poolY[i];
      if (dx * dx + dy * dy < mergeSq) {
        this.poolExpire[i] = this.clock + life;
        this.poolLife[i] = life;
        return;
      }
      if (this.poolExpire[i] < oldestExpire) {
        oldestExpire = this.poolExpire[i];
        oldest = i;
      }
    }
    const slot = freeSlot !== -1 ? freeSlot : oldest;
    this.poolActive[slot] = 1;
    this.poolX[slot] = x;
    this.poolY[slot] = y;
    this.poolExpire[slot] = this.clock + life;
    this.poolLife[slot] = life;
    this.poolRadius[slot] = tuning.radius(lvl);
    this.poolNextTick[slot] = this.clock + 0.1;
  }

  // ---------------------------------------------------------------- nuke

  private updateNuke(time: number): void {
    if (this.levels.nuke <= 0) {
      return;
    }
    const left = this.nextNukeAt - this.clock;
    const p = this.player;
    if (left <= SPECIAL_TUNING.nuke.warnSec && left > 0) {
      const t = left / SPECIAL_TUNING.nuke.warnSec;
      const g = this.fx.gfx;
      g.lineStyle(4, 0xff3a2a, 0.35 + 0.5 * (1 - t));
      g.strokeCircle(p.x, p.y, 120 + 520 * t);
      g.lineStyle(2, 0xffe27a, 0.4 + 0.4 * (1 - t));
      g.strokeCircle(p.x, p.y, 70 + 300 * t);
    }
    if (left > 0) {
      return;
    }
    this.nextNukeAt = this.clock + this.nukeIntervalSec;
    this.hooks.nuke(p.x, p.y, SPECIAL_TUNING.nuke.radius, time);
  }

  // ---------------------------------------------------------------- stim

  private updateStim(time: number): void {
    const lvl = this.levels.stim;
    if (lvl <= 0) {
      return;
    }
    const p = this.player;
    if (this.stimState === STIM_ACTIVE) {
      p.grantInvulnerability(time + 120);
      const g = this.fx.gfx;
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.02);
      g.lineStyle(3, 0x7dffea, 0.4 + 0.4 * pulse);
      g.strokeCircle(p.x, p.y, 40 + 4 * pulse);
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeCircle(p.x, p.y, 52 + 6 * pulse);
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        this.fx.emit(TEXTURES.PIXEL, p.x + Math.cos(a) * 36, p.y + Math.sin(a) * 36, 0, -70, 0.4, 3, 0.3, 1, 0x7dffea, true, 0);
      }
      if (this.clock >= this.stimUntil) {
        this.stimState = STIM_COOLDOWN;
        p.fireRateMult = 1;
        this.weapons.syncDrones();
      }
      return;
    }
    if (this.stimState === STIM_COOLDOWN) {
      if (this.clock >= this.stimReadyAt) {
        this.stimState = STIM_READY;
      }
      return;
    }
    if (p.hp > 0 && p.hp < p.maxHp * SPECIAL_TUNING.stim.hpFraction) {
      this.stimState = STIM_ACTIVE;
      this.stimUntil = this.clock + this.stimDuration;
      this.stimReadyAt = this.clock + this.stimCooldown;
      p.fireRateMult = SPECIAL_TUNING.stim.fireRate(lvl);
      p.grantInvulnerability(time + 120);
      this.weapons.syncDrones();
      this.fx.ring(p.x, p.y, 16, 160, 0.5, 0x7dffea, 7);
      this.fx.ring(p.x, p.y, 10, 100, 0.35, 0xffffff, 4);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        this.fx.emit(TEXTURES.PIXEL, p.x, p.y, Math.cos(a) * 260, Math.sin(a) * 260, 0.45, 3, 0.3, 1, 0x7dffea, true, 0);
      }
    }
  }

  // ---------------------------------------------------------------- sentry drones

  private syncSentries(): void {
    const lvl = this.levels.sentry;
    this.sentryCount = lvl > 0 ? Math.min(MAX_SENTRIES, SPECIAL_TUNING.sentry.count(lvl)) : 0;
    for (let i = 0; i < MAX_SENTRIES; i++) {
      const s = this.sentries[i];
      const on = i < this.sentryCount;
      if (on && !s.image.visible) {
        s.image.setVisible(true).setActive(true);
        s.nextBurstAt = 0;
        s.shotsLeft = 0;
        s.beamUntil = 0;
      } else if (!on) {
        s.image.setVisible(false).setActive(false);
      }
    }
  }

  private updateSentries(time: number, sec: number): void {
    const count = this.sentryCount;
    if (count === 0) {
      return;
    }
    const lvl = this.levels.sentry;
    const tuning = SPECIAL_TUNING.sentry;
    const p = this.player;
    const g = this.fx.gfx;
    this.sentryAngle = (this.sentryAngle + tuning.orbitSpeed * sec) % TAU;
    const rangeSq = tuning.range * tuning.range;
    const burstGap = tuning.burstMs(lvl);
    const damage = tuning.damage(lvl) * p.damageMult;

    for (let i = 0; i < count; i++) {
      const s = this.sentries[i];
      const a = this.sentryAngle + (i / count) * TAU;
      const x = p.x + Math.cos(a) * tuning.orbitRadius;
      const y = p.y + Math.sin(a) * tuning.orbitRadius * 0.85;
      s.image.setPosition(x, y).setRotation(a + Math.PI / 2);

      if (s.shotsLeft <= 0 && time >= s.nextBurstAt) {
        s.shotsLeft = tuning.shotsPerBurst;
        s.nextShotAt = time;
      }
      if (s.shotsLeft > 0 && time >= s.nextShotAt) {
        const target = this.enemies.findNearest(x, y, rangeSq);
        if (!target) {
          s.shotsLeft = 0;
          s.nextBurstAt = time + 160;
        } else {
          this.fireLaser(s, target, x, y, damage, time);
          s.shotsLeft--;
          s.nextShotAt = time + tuning.shotGapMs;
          if (s.shotsLeft <= 0) {
            s.nextBurstAt = time + burstGap;
          }
        }
      }
      if (time < s.beamUntil) {
        const k = (s.beamUntil - time) / BEAM_MS;
        g.lineStyle(5, 0x2fd8ff, 0.45 * k);
        g.lineBetween(x, y, s.beamX, s.beamY);
        g.lineStyle(2, 0xffffff, 0.9 * k);
        g.lineBetween(x, y, s.beamX, s.beamY);
      }
    }
  }

  private fireLaser(s: Sentry, target: Enemy, x: number, y: number, damage: number, time: number): void {
    const dx = target.x - x;
    const dy = target.y - y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    s.beamX = target.x;
    s.beamY = target.y;
    s.beamUntil = time + BEAM_MS;
    this.fx.emit(TEXTURES.PIXEL, target.x, target.y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.2, 3, 0.2, 1, 0x7dffea, true, 0);
    this.hooks.damageEnemy(target, damage, dx / len, dy / len, 0.3, time, COLOR_LASER);
  }

  // ---------------------------------------------------------------- napalm

  private updateNapalm(time: number): void {
    const lvl = this.levels.napalm;
    if (lvl <= 0) {
      return;
    }
    const g = this.fx.gfx;
    const dps = SPECIAL_TUNING.napalm.dps(lvl);
    for (let i = 0; i < this.maxPools; i++) {
      if (this.poolActive[i] === 0) {
        continue;
      }
      const left = this.poolExpire[i] - this.clock;
      if (left <= 0) {
        this.poolActive[i] = 0;
        continue;
      }
      const x = this.poolX[i];
      const y = this.poolY[i];
      const r = this.poolRadius[i];
      const fade = Math.min(1, left / 0.6);
      const flicker = 0.85 + 0.15 * Math.sin(time * 0.015 + i * 1.7);

      g.fillStyle(0x1a0c04, 0.4 * fade);
      g.fillEllipse(x, y, r * 2.1, r * 1.5);
      g.fillStyle(0xff5a1a, 0.5 * fade * flicker);
      g.fillEllipse(x, y, r * 1.8 * flicker, r * 1.25 * flicker);
      g.fillStyle(0xffc04a, 0.55 * fade);
      g.fillEllipse(x, y, r * 1.05 * flicker, r * 0.72 * flicker);

      if (Math.random() < 0.05) {
        this.fx.emit(TEXTURES.FLAME, x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r * 0.6, (Math.random() - 0.5) * 16, -50, 0.5, 0.35, 0.1, 0.8, 0xffffff, true, 0);
      }

      if (this.clock >= this.poolNextTick[i]) {
        this.poolNextTick[i] = this.clock + POOL_TICK_SEC;
        this.tickPool(x, y, r, dps * POOL_TICK_SEC, time);
      }
    }
  }

  private tickPool(x: number, y: number, radius: number, damage: number, time: number): void {
    const n = this.enemies.queryCircle(x, y, radius);
    for (let i = 0; i < n; i++) {
      const e = this.enemies.results[i];
      if (!e.active) {
        continue;
      }
      e.ignite(time, damage * 2, 900);
      this.hooks.damageEnemy(e, damage, 0, 0, 0, time, COLOR_NAPALM);
    }
  }
}
