import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SQUAD_CAP, SQUAD_CONFIG, TEXTURES } from '../config/GameConfig';
import { Squadmate, SquadState } from '../entities/Squadmate';
import { SPECIAL_TUNING, SQUAD_TUNING, SQUAD_UPGRADES, SQUAD_UPGRADE_IDS } from '../config/SpecialsConfig';
import type { SquadUpgradeId } from '../config/SpecialsConfig';
import type { SquadContext } from '../entities/Squadmate';
import type { Player } from '../entities/Player';
import type { EnemyPool } from '../pools/EnemyPool';
import type { ProjectilePool } from '../pools/ProjectilePool';
import type { EffectsSystem } from './EffectsSystem';
import { Arena } from './Arena';
import type { Point } from './Arena';

const TAU = Math.PI * 2;
const HALF_W = GAME_WIDTH / 2;
const HALF_H = GAME_HEIGHT / 2;
const BEACON_FADE_SEC = 1.2;
const RESCUE_DECAY = 2;
const RESCUE_RETRY_SEC = 30;
const HEADING_TURN = 5;
const ARENA_EDGE_MARGIN = 120;
const SLOT_X = [-72, -72, -138, -138, -204];
const SLOT_Y = [-56, 56, -26, 26, 0];
const SLOT_TINTS = [0xd6e4ff, 0xffe0c4, 0xd4ffd8, 0xf0d6ff, 0xfff0a8];
const SMOKE_PERIOD_SEC = 0.22;

/** HUD-facing fields; GameScene's HudState extends this so UIScene can read them directly. */
export interface SquadHud {
  squad: number;
  beaconActive: number;
  beaconAngle: number;
  beaconDist: number;
  beaconProgress: number;
  beaconOnScreen: number;
}

/** Owns the four squad slots and the SOS beacon / drop pod that recruits new troopers. */
export class SquadSystem {
  readonly mates: Squadmate[] = [];

  /** Multipliers other systems can raise. */
  damageMult = 1;
  fireRateMult = 1;

  /** Level of the Squad Overclock Aura special (0 = inactive); set by SpecialsSystem. */
  overclockLevel = 0;
  private readonly upgradeLevels: Record<SquadUpgradeId, number> = { armor: 0, munitions: 0, medic: 0, drill: 0 };

  beaconActive = false;
  beaconX = 0;
  beaconY = 0;
  beaconProgress = 0;

  private readonly pod: Phaser.GameObjects.Image;
  private readonly ctx: SquadContext;

  private clock = 0;
  private nextBeaconAt = 0;
  private beaconExpiresAt = 0;
  private beaconFade = 0;
  private fading = false;
  private smokeIn = 0;
  private headingX = 1;
  private headingY = 0;
  private arena: Arena = new Arena();
  private readonly scratch: Point = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly player: Player,
    enemies: EnemyPool,
    projectiles: ProjectilePool,
    private readonly fx: EffectsSystem,
  ) {
    for (let i = 0; i < SQUAD_CAP; i++) {
      this.mates.push(new Squadmate(scene, i, SLOT_X[i], SLOT_Y[i], SLOT_TINTS[i]));
    }
    this.pod = scene.add.image(0, 0, TEXTURES.POD).setDepth(4).setVisible(false).setActive(false);
    this.ctx = {
      time: 0,
      dt: 0,
      playerX: 0,
      playerY: 0,
      headingX: 1,
      headingY: 0,
      damage: 0,
      fireIntervalMs: SQUAD_CONFIG.fireIntervalMs,
      maxHp: SQUAD_CONFIG.maxHp,
      armor: 0,
      regen: SQUAD_CONFIG.regenPerSec,
      reviveFraction: SQUAD_CONFIG.reviveHpFraction,
      crawlSec: SQUAD_CONFIG.crawlSec,
      speedMult: 1,
      overclock: 0,
      psiStun: 0,
      enemies,
      projectiles,
      fx,
      mates: this.mates,
      arena: this.arena,
    };
  }

  /** Number of troopers currently occupying a slot (fighting or crawling). */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.mates.length; i++) {
      if (this.mates[i].isOccupied && this.mates[i].state !== SquadState.Extracting) {
        n++;
      }
    }
    return n;
  }

  configure(arena: Arena): void {
    this.arena = arena;
    this.ctx.arena = arena;
  }

  getUpgradeLevel(id: SquadUpgradeId): number {
    return this.upgradeLevels[id];
  }

  /** Raises a squad upgrade by one level (capped). Returns false at the cap. */
  raiseUpgrade(id: SquadUpgradeId): boolean {
    if (this.upgradeLevels[id] >= SQUAD_UPGRADES[id].maxLevel) {
      return false;
    }
    this.upgradeLevels[id]++;
    return true;
  }

  /** True when squad cards are worth offering: someone is deployed or the squad was already invested in. */
  get isRelevant(): boolean {
    if (this.count > 0) {
      return true;
    }
    for (let i = 0; i < SQUAD_UPGRADE_IDS.length; i++) {
      if (this.upgradeLevels[SQUAD_UPGRADE_IDS[i]] > 0) {
        return true;
      }
    }
    return false;
  }

  reset(): void {
    for (let i = 0; i < SQUAD_UPGRADE_IDS.length; i++) {
      this.upgradeLevels[SQUAD_UPGRADE_IDS[i]] = 0;
    }
    this.overclockLevel = 0;
    for (let i = 0; i < this.mates.length; i++) {
      this.mates[i].deactivate();
    }
    this.clock = 0;
    this.damageMult = 1;
    this.fireRateMult = 1;
    this.beaconActive = false;
    this.fading = false;
    this.beaconProgress = 0;
    this.pod.setVisible(false).setActive(false);
    this.nextBeaconAt = SQUAD_CONFIG.beaconFirstSec;
    this.headingX = 1;
    this.headingY = 0;
  }

  /** Places the SOS beacon immediately (used for the first drop and for testing). */
  spawnBeaconNow(): void {
    this.placeBeacon();
  }

  /** Instantly recruits a trooper at the player's side if a slot is free. */
  recruit(x: number, y: number, time: number): boolean {
    for (let i = 0; i < this.mates.length; i++) {
      const m = this.mates[i];
      if (!m.isOccupied) {
        m.activate(x, y, time, this.ctx.maxHp);
        return true;
      }
    }
    return false;
  }

  update(time: number, delta: number): void {
    const dt = delta * 0.001;
    this.clock += dt;
    const p = this.player;

    this.updateHeading(dt);
    this.updateBeacon(time, dt);

    const c = this.ctx;
    c.time = time;
    c.dt = dt;
    c.playerX = p.x;
    c.playerY = p.y;
    c.headingX = this.headingX;
    c.headingY = this.headingY;
    this.applyModifiers(c);
    for (let i = 0; i < this.mates.length; i++) {
      this.mates[i].update(c);
    }
  }

  private applyModifiers(c: SquadContext): void {
    const p = this.player;
    const perks = p.perks;
    const armorLvl = this.upgradeLevels.armor;
    const munitions = this.upgradeLevels.munitions;
    const medic = this.upgradeLevels.medic;
    const drill = this.upgradeLevels.drill;
    const oc = this.overclockLevel;
    const scale = 1 + SQUAD_TUNING.autoScalePerMinute * (this.clock / 60);

    const ocFire = oc > 0 ? SPECIAL_TUNING.overclock.fireRate(oc) : 1;
    const ocDamage = oc > 0 ? SPECIAL_TUNING.overclock.damage(oc) : 1;
    c.overclock = oc > 0 ? 1 : 0;
    c.psiStun = oc > 0 && perks.psionicStun ? 1 : 0;

    c.damage =
      SQUAD_CONFIG.damage * perks.squadDamageMult * p.damageMult * this.damageMult * (1 + SQUAD_TUNING.damagePerMunition * munitions) * scale * ocDamage;
    c.fireIntervalMs = SQUAD_CONFIG.fireIntervalMs / (this.fireRateMult * (1 + SQUAD_TUNING.firePerDrill * drill) * ocFire);
    c.maxHp = Math.round(SQUAD_CONFIG.maxHp * (1 + SQUAD_TUNING.hpPerArmor * armorLvl) * scale * (oc > 0 ? perks.hpMult : 1));
    c.armor = SQUAD_TUNING.armorPerLevel * armorLvl + (oc > 0 ? perks.armorFlat : 0);
    c.regen = SQUAD_CONFIG.regenPerSec + SQUAD_TUNING.regenPerMedic * medic;
    c.reviveFraction = Math.min(1, SQUAD_CONFIG.reviveHpFraction + SQUAD_TUNING.reviveBonusPerMedic * medic);
    c.crawlSec = SQUAD_CONFIG.crawlSec + SQUAD_TUNING.crawlBonusSecPerMedic * medic;
    c.speedMult = (1 + SQUAD_TUNING.speedPerDrill * drill) * (oc > 0 ? perks.speedMult : 1);
  }

  /** Writes beacon and squad values the HUD needs; no allocation. */
  writeHud(h: SquadHud): void {
    h.squad = this.count;
    h.beaconActive = this.beaconActive && !this.fading ? 1 : 0;
    if (h.beaconActive === 0) {
      h.beaconProgress = 0;
      return;
    }
    const dx = this.beaconX - this.player.x;
    const dy = this.beaconY - this.player.y;
    h.beaconAngle = Math.atan2(dy, dx);
    h.beaconDist = Math.sqrt(dx * dx + dy * dy);
    h.beaconProgress = this.beaconProgress;
    h.beaconOnScreen = Math.abs(dx) < HALF_W - 40 && Math.abs(dy) < HALF_H - 40 ? 1 : 0;
  }

  // ---------------------------------------------------------------- beacon

  private updateHeading(dt: number): void {
    const p = this.player;
    const mx = p.moveX;
    const my = p.moveY;
    if (mx * mx + my * my > 0.04) {
      const len = Math.sqrt(mx * mx + my * my);
      const k = Math.min(1, HEADING_TURN * dt);
      this.headingX += (mx / len - this.headingX) * k;
      this.headingY += (my / len - this.headingY) * k;
      const hl = Math.sqrt(this.headingX * this.headingX + this.headingY * this.headingY) || 1;
      this.headingX /= hl;
      this.headingY /= hl;
    }
  }

  private updateBeacon(time: number, dt: number): void {
    if (!this.beaconActive) {
      if (this.clock >= this.nextBeaconAt) {
        if (this.count < SQUAD_CAP) {
          this.placeBeacon();
        } else {
          this.nextBeaconAt = this.clock + RESCUE_RETRY_SEC;
        }
      }
      return;
    }

    const g = this.fx.gfx;
    const x = this.beaconX;
    const y = this.beaconY;

    if (this.fading) {
      this.beaconFade -= dt;
      if (this.beaconFade <= 0) {
        this.beaconActive = false;
        this.fading = false;
        this.pod.setVisible(false).setActive(false);
        return;
      }
      this.pod.setAlpha(this.beaconFade / BEACON_FADE_SEC);
      this.emitSmoke(dt, x, y);
      return;
    }

    const p = this.player;
    const dx = p.x - x;
    const dy = p.y - y;
    const r = SQUAD_CONFIG.beaconRadius;
    const inside = !p.dead && dx * dx + dy * dy <= r * r;

    if (inside) {
      this.beaconProgress = Math.min(1, this.beaconProgress + dt / SQUAD_CONFIG.beaconHoldSec);
    } else {
      this.beaconProgress = Math.max(0, this.beaconProgress - (dt * RESCUE_DECAY) / SQUAD_CONFIG.beaconHoldSec);
    }

    if (this.beaconProgress >= 1) {
      this.completeRescue(time);
      return;
    }
    if (this.clock >= this.beaconExpiresAt) {
      this.startFade(false);
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(time * 0.006);
    const blink = Math.sin(time * 0.012) > 0;
    g.fillStyle(inside ? 0x58e06a : 0xff4a3a, 0.05 + 0.05 * pulse);
    g.fillCircle(x, y, r);
    g.lineStyle(3, inside ? 0x58e06a : 0xff4a3a, 0.45 + 0.4 * pulse);
    g.strokeCircle(x, y, r);
    g.lineStyle(2, 0xffffff, 0.25);
    g.strokeCircle(x, y, r * (0.4 + 0.6 * ((time * 0.001) % 1)));

    if (this.beaconProgress > 0) {
      g.lineStyle(7, 0x58e06a, 1);
      g.beginPath();
      g.arc(x, y, r + 10, -Math.PI / 2, -Math.PI / 2 + TAU * this.beaconProgress, false);
      g.strokePath();
    }

    g.fillStyle(blink ? 0xff3322 : 0x5a1008, 1);
    g.fillCircle(x + 30, y - 34, 5);
    if (blink) {
      g.fillStyle(0xff3322, 0.25);
      g.fillCircle(x + 30, y - 34, 16);
    }
    this.pod.setAlpha(1);
    this.emitSmoke(dt, x, y);
  }

  private emitSmoke(dt: number, x: number, y: number): void {
    this.smokeIn -= dt;
    if (this.smokeIn > 0) {
      return;
    }
    this.smokeIn = SMOKE_PERIOD_SEC;
    this.fx.emit(TEXTURES.PIXEL, x - 30 + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, (Math.random() - 0.3) * 14, -34, 1.6, 1.5, 4.5, 0.45, 0x4a4640, false, 0);
  }

  private completeRescue(time: number): void {
    this.recruit(this.beaconX, this.beaconY, time);
    this.fx.ring(this.beaconX, this.beaconY, 20, 150, 0.6, 0x58e06a, 6);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      this.fx.emit(TEXTURES.PIXEL, this.beaconX, this.beaconY, Math.cos(a) * 160, Math.sin(a) * 160, 0.6, 3, 0.4, 1, 0x7dff8a, true, 0);
    }
    this.startFade(true);
  }

  private startFade(rescued: boolean): void {
    this.fading = true;
    this.beaconFade = BEACON_FADE_SEC;
    this.beaconProgress = rescued ? 1 : 0;
    this.nextBeaconAt = this.clock + SQUAD_CONFIG.beaconMinSec + Math.random() * (SQUAD_CONFIG.beaconMaxSec - SQUAD_CONFIG.beaconMinSec);
  }

  private placeBeacon(): void {
    const p = this.player;
    const arena = this.arena;
    const minD = SQUAD_CONFIG.beaconMinDistance;
    const maxD = SQUAD_CONFIG.beaconMaxDistance;
    let x = p.x;
    let y = p.y;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = Math.random() * TAU;
      const d = minD + Math.random() * (maxD - minD);
      x = p.x + Math.cos(a) * d;
      y = p.y + Math.sin(a) * d;
      if (arena.contains(x, y, ARENA_EDGE_MARGIN)) {
        break;
      }
      if (attempt === 23) {
        const c = arena.clamp(x, y, ARENA_EDGE_MARGIN, this.scratch);
        x = c.x;
        y = c.y;
      }
    }
    this.beaconX = x;
    this.beaconY = y;
    this.beaconActive = true;
    this.fading = false;
    this.beaconProgress = 0;
    this.beaconExpiresAt = this.clock + SQUAD_CONFIG.beaconLifeSec;
    this.smokeIn = 0;
    this.pod.setPosition(x, y).setRotation(-0.25).setAlpha(1).setVisible(true).setActive(true);
  }
}
