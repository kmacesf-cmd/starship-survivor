import Phaser from 'phaser';
import { CHARACTERS, DEFAULT_RUN, DIFFICULTIES, GAME_MODES } from '../config/CharacterConfig';
import type { CharacterDef, DifficultyDef, GameModeDef, RunSetup } from '../config/CharacterConfig';
import {
  EVENTS,
  FRAMES,
  GAME_HEIGHT,
  GAME_WIDTH,
  POOL_SIZES,
  SCENE_KEYS,
  TEXTURES,
  frameKey,
} from '../config/GameConfig';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import { EnemyPool } from '../pools/EnemyPool';
import { GemPool } from '../pools/GemPool';
import { ProjectilePool } from '../pools/ProjectilePool';
import { UpgradeManager } from '../systems/UpgradeManager';
import { WaveManager } from '../systems/WaveManager';
import { WeaponManager } from '../systems/WeaponManager';
import { EffectsSystem } from '../systems/EffectsSystem';
import { SquadSystem } from '../systems/SquadSystem';
import type { SquadHud } from '../systems/SquadSystem';
import { PassiveManager } from '../systems/PassiveManager';
import { SpecialsSystem } from '../systems/SpecialsSystem';
import type { SpecialsHud } from '../systems/SpecialsSystem';
import { ScoreStore } from '../systems/ScoreStore';
import { COLOR_NAPALM } from '../systems/CombatHooks';
import type { CombatHooks } from '../systems/CombatHooks';

export type GameState = 'playing' | 'levelup' | 'paused' | 'over';

/** Plain numbers shared with UIScene; mutated in place every frame. */
export interface HudState extends SquadHud, SpecialsHud {
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  remainingSec: number;
  kills: number;
  wave: number;
  dashCharges: number;
  dashMax: number;
  dashCharge01: number;
  psiCharge01: number;
}

const ARENA_TEXTURE = 'arena-ring';
const ARENA_BAND = 14;
const ARENA_MARGIN = 80;

const BLOOD_KEYS: string[] = [];
for (let i = 0; i < FRAMES.BLOOD_VARIANTS; i++) {
  BLOOD_KEYS.push(frameKey(TEXTURES.BLOOD, i));
}

const MAX_FRAME_MS = 50;
const CAMERA_LERP = 0.25;
const BLOOD_LIFE = 5;
const TEXT_LIFE = 0.7;
const TEXT_RISE = 42;
const COLOR_NORMAL = 0xffffff;
const COLOR_HEAVY = 0xffc23a;
const COLOR_PLAYER = 0xff4d4d;
const COLOR_BLAST = 0xffb347;
const COLOR_BURN = 0xff7a2a;
const EXPLOSION_KNOCK = 3;
const BURN_DURATION_MS = 2200;

export class GameScene extends Phaser.Scene {
  readonly hud: HudState = {
    hp: 100,
    maxHp: 100,
    xp: 0,
    xpToNext: 1,
    level: 1,
    remainingSec: 0,
    kills: 0,
    wave: 1,
    squad: 0,
    beaconActive: 0,
    beaconAngle: 0,
    beaconDist: 0,
    beaconProgress: 0,
    beaconOnScreen: 0,
    dashCharges: 1,
    dashMax: 1,
    dashCharge01: 1,
    psiCharge01: 0,
    nukeCharge01: -1,
    nukeWarning: 0,
    stimState: -1,
    stimFraction: 0,
    overclockLevel: 0,
  };
  state: GameState = 'playing';
  mode: GameModeDef = GAME_MODES[DEFAULT_RUN.mode];
  character: CharacterDef = CHARACTERS[DEFAULT_RUN.character];
  difficulty: DifficultyDef = DIFFICULTIES[DEFAULT_RUN.difficulty];
  /** Leaderboard rank of the run that just ended (0 = not ranked or not recorded). */
  lastRank = 0;

  player!: Player;
  enemies!: EnemyPool;
  projectiles!: ProjectilePool;
  gems!: GemPool;
  waves!: WaveManager;
  weapons!: WeaponManager;
  upgrades!: UpgradeManager;
  fx!: EffectsSystem;
  squad!: SquadSystem;
  passives!: PassiveManager;
  specials!: SpecialsSystem;
  private ground!: Phaser.GameObjects.TileSprite;
  private kills = 0;
  private scoreSaved = false;
  private quiet = false;

  private readonly bloodImages: Phaser.GameObjects.Image[] = [];
  private readonly bloodAge = new Float32Array(POOL_SIZES.blood);
  private bloodCursor = 0;

  private readonly damageTexts: Phaser.GameObjects.Text[] = [];
  private readonly textAge = new Float32Array(POOL_SIZES.damageTexts);
  private readonly textStartX = new Float32Array(POOL_SIZES.damageTexts);
  private readonly textStartY = new Float32Array(POOL_SIZES.damageTexts);
  private readonly textDrift = new Float32Array(POOL_SIZES.damageTexts);
  private readonly textScale = new Float32Array(POOL_SIZES.damageTexts);
  private textCursor = 0;
  private readonly numberStrings: string[] = [];

  constructor() {
    super(SCENE_KEYS.GAME);
  }

  init(data?: Partial<RunSetup>): void {
    this.mode = GAME_MODES[data?.mode ?? DEFAULT_RUN.mode];
    this.character = CHARACTERS[data?.character ?? DEFAULT_RUN.character];
    this.difficulty = DIFFICULTIES[data?.difficulty ?? DEFAULT_RUN.difficulty];
  }

  create(): void {
    this.state = 'playing';
    this.kills = 0;
    this.bloodImages.length = 0;
    this.damageTexts.length = 0;

    this.ground = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEXTURES.TILE)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);

    if (this.mode.arenaRadius > 0) {
      this.buildArena(this.mode.arenaRadius);
    }
    this.createEffectPools();
    this.fx = new EffectsSystem(this);

    this.player = new Player(this, 0, 0);
    this.player.fx = this.fx;
    this.player.setCharacter(this.character);
    this.enemies = new EnemyPool(this);
    this.projectiles = new ProjectilePool(this);
    this.gems = new GemPool(this);
    this.waves = new WaveManager(this.enemies);
    this.waves.configure(this.mode, this.difficulty);
    this.enemies.smartAI = this.difficulty.smartAI;
    this.weapons = new WeaponManager(this.player, this.enemies, this.projectiles, this.hooks, this.fx);
    this.squad = new SquadSystem(this, this.player, this.enemies, this.projectiles, this.fx);
    this.squad.configure(this.mode.arenaRadius);
    this.specials = new SpecialsSystem(this, this.player, this.enemies, this.weapons, this.squad, this.fx, this.hooks);
    this.upgrades = new UpgradeManager(this.player, this.weapons, this.events, this.specials, this.squad);
    this.passives = new PassiveManager(this.player, this.enemies, this.fx);

    this.projectiles.setHitHandler(this.onProjectileHit);
    this.projectiles.setDetonateHandler(this.onRocketDetonate);
    this.projectiles.setTrailHandler(this.onRocketTrail);
    this.enemies.onBurn = this.onBurn;
    this.waves.onEvent = this.onWaveEvent;
    this.events.on(EVENTS.CHOOSE_CARD, this.onChooseCard, this);
    this.events.on(EVENTS.RESTART, this.onRestart, this);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(EVENTS.CHOOSE_CARD, this.onChooseCard, this);
      this.events.off(EVENTS.RESTART, this.onRestart, this);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncCamera, this);
    });

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setScroll(-GAME_WIDTH / 2, -GAME_HEIGHT / 2);

    this.resetRun();
    this.scene.launch(SCENE_KEYS.UI);
  }

  override update(time: number, delta: number): void {
    if (this.state !== 'playing') {
      return;
    }
    const dt = Math.min(delta, MAX_FRAME_MS);
    const p = this.player;

    this.waves.update(dt, p.x, p.y);
    if (this.waves.completed) {
      this.endGame(true);
      return;
    }

    this.fx.begin();
    p.update(time, dt);
    if (this.mode.arenaRadius > 0) {
      this.clampToArena(p);
    }
    this.enemies.update(time, dt, p.x, p.y, p.arcade.velocity.x, p.arcade.velocity.y);

    const contact = this.enemies.contactDamage(p.x, p.y, p.bodyRadius, time);
    if (contact > 0) {
      const applied = p.takeDamage(contact, time);
      if (applied > 0) {
        this.spawnDamageText(p.x, p.y - 26, applied, COLOR_PLAYER, 1.2);
        this.cameras.main.shake(90, 0.004);
        if (p.dead) {
          this.endGame(false);
          return;
        }
      }
    }

    this.weapons.update(time);
    this.squad.update(time, dt);
    this.specials.update(time, dt);
    this.passives.update(time);
    this.projectiles.update(time, dt, p.x, p.y, this.enemies);

    const xp = this.gems.update(time, dt, p.x, p.y, p.pickupRadiusSq, 560);
    if (xp > 0) {
      const gained = p.addXp(xp);
      if (gained > 0) {
        this.upgrades.queueLevelUps(gained);
        if (this.upgrades.choosing) {
          this.enterState('levelup');
        }
      }
    }

    this.fx.update(dt * 0.001);
    this.updateEffects(dt * 0.001);
    this.updateHud();
  }

  private readonly hooks: CombatHooks = {
    damageEnemy: (enemy, amount, dirX, dirY, knockMult, time, color) =>
      this.damageEnemy(enemy, amount, dirX, dirY, knockMult, time, color),
    explode: (x, y, radius, damage, knockMult, time, big) => this.explode(x, y, radius, damage, knockMult, time, big),
    nuke: (x, y, radius, time) => this.nuke(x, y, radius, time),
  };

  /** Screen-wipe: every bug within `radius` dies. No boss enemies exist, so nothing is exempt. */
  private nuke(x: number, y: number, radius: number, time: number): void {
    this.fx.explosion(x, y, radius * 0.5, true);
    this.cameras.main.flash(500, 255, 240, 200);
    this.cameras.main.shake(600, 0.02);
    const r2 = radius * radius;
    const list = this.enemies.enemies;
    this.quiet = true;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) {
        this.damageEnemy(e, e.hp + 1, 0, 0, 0, time, COLOR_BLAST);
      }
    }
    this.quiet = false;
  }

  private damageEnemy(
    enemy: Enemy,
    amount: number,
    dirX: number,
    dirY: number,
    knockMult: number,
    time: number,
    color: number,
  ): boolean {
    const heavy = enemy.def.key === 'tiger';
    const killed = enemy.takeDamage(amount, time, dirX, dirY, knockMult);
    if (!this.quiet) {
      this.spawnDamageText(enemy.x, enemy.y - enemy.bodyRadius, amount, color === COLOR_NORMAL && heavy ? COLOR_HEAVY : color, heavy ? 1.15 : 1);
      this.spawnBlood(enemy.x + dirX * 8, enemy.y + dirY * 8, killed ? 1.1 : 0.5);
      if (color !== COLOR_BURN && color !== COLOR_NAPALM) {
        this.specials.onWeaponHit(enemy.x, enemy.y);
      }
    }
    if (killed) {
      this.spawnBlood(enemy.x, enemy.y, heavy ? 1.7 : 1.1);
      const diff = this.difficulty;
      this.gems.spawn(enemy.x, enemy.y, enemy.xpValue * diff.dropMult);
      if (diff.bonusDropChance > 0 && Math.random() < diff.bonusDropChance) {
        this.gems.spawn(enemy.x + 10, enemy.y + 6, enemy.xpValue);
      }
      this.enemies.release(enemy);
      this.kills++;
    }
    return killed;
  }

  /** Radial blast: damage falls off with squared distance; knockback is the Ace passive (or forced by `knockMult` > 1). */
  private explode(x: number, y: number, radius: number, damage: number, knockMult: number, time: number, big: boolean): void {
    this.fx.explosion(x, y, radius, big);
    this.fx.crater(x, y, (radius * (big ? 1.5 : 1.3)) / 112);
    this.cameras.main.shake(big ? 260 : 110, big ? 0.012 : 0.004);

    const push = knockMult > 1 ? knockMult : this.player.perks.explosiveKnockback ? EXPLOSION_KNOCK : 0;
    const r2 = radius * radius;
    const n = this.enemies.queryCircle(x, y, radius);
    for (let i = 0; i < n; i++) {
      const e = this.enemies.results[i];
      if (!e.active) {
        continue;
      }
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      const len = Math.sqrt(d2) || 1;
      const falloff = 1 - 0.4 * Math.min(1, d2 / r2);
      this.damageEnemy(e, damage * falloff, dx / len, dy / len, push, time, COLOR_BLAST);
    }
  }

  private readonly onRocketDetonate = (rocket: Projectile, time: number): void => {
    this.explode(rocket.x, rocket.y, rocket.blast, rocket.damage, 1, time, false);
  };

  private readonly onRocketTrail = (rocket: Projectile, _time: number): void => {
    this.fx.emit(TEXTURES.PIXEL, rocket.x - rocket.dirX * 14, rocket.y - rocket.dirY * 14, -rocket.dirX * 40 + (Math.random() - 0.5) * 30, -rocket.dirY * 40 + (Math.random() - 0.5) * 30, 0.45, 2.2, 0.4, 0.8, 0xffb347, true, 0);
  };

  private readonly onBurn = (enemy: Enemy, damage: number, time: number): void => {
    this.damageEnemy(enemy, damage, 0, 0, 0, time, COLOR_BURN);
    if (enemy.active) {
      this.fx.emit(TEXTURES.PIXEL, enemy.x + (Math.random() - 0.5) * 14, enemy.y, (Math.random() - 0.5) * 30, -60, 0.45, 2.5, 0.3, 1, 0xff8a2a, true, 0);
    }
  }

  private readonly onProjectileHit = (enemy: Enemy, projectile: Projectile, time: number): void => {
    if (projectile.burnDps > 0) {
      enemy.ignite(time, projectile.burnDps, BURN_DURATION_MS);
    }
    this.damageEnemy(enemy, projectile.damage, projectile.dirX, projectile.dirY, projectile.knockMult, time, COLOR_NORMAL);
  };

  private readonly onWaveEvent = (event: number): void => {
    this.events.emit(EVENTS.WAVE_ALERT, event);
  };

  private onChooseCard(index: number): void {
    if (this.state !== 'levelup') {
      return;
    }
    this.upgrades.choose(index);
    if (!this.upgrades.choosing) {
      this.enterState('playing');
    }
  }

  private onRestart(): void {
    if (this.state !== 'over' && this.state !== 'paused') {
      return;
    }
    this.resetRun();
  }

  /** Suspends gameplay and physics. Only allowed while actively playing. */
  pauseGame(): boolean {
    if (this.state !== 'playing') {
      return false;
    }
    this.enterState('paused');
    return true;
  }

  resumeGame(): void {
    if (this.state === 'paused') {
      this.enterState('playing');
    }
  }

  private buildArena(radius: number): void {
    if (!this.textures.exists(ARENA_TEXTURE)) {
      const half = radius + ARENA_MARGIN;
      const size = half * 2;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(ARENA_MARGIN - ARENA_BAND / 2, 0x000000, 0.28);
      g.beginPath();
      g.arc(half, half, radius + ARENA_BAND / 2 + (ARENA_MARGIN - ARENA_BAND / 2) / 2, 0, Math.PI * 2);
      g.strokePath();
      const segments = 96;
      for (let i = 0; i < segments; i++) {
        g.lineStyle(ARENA_BAND, i % 2 === 0 ? 0xffc400 : 0x1b1b1b, 1);
        g.beginPath();
        g.arc(half, half, radius, (i / segments) * Math.PI * 2, ((i + 1) / segments) * Math.PI * 2);
        g.strokePath();
      }
      g.generateTexture(ARENA_TEXTURE, size, size);
      g.destroy();
    }
    this.add.image(0, 0, ARENA_TEXTURE).setDepth(3);
  }

  private clampToArena(p: Player): void {
    const limit = this.mode.arenaRadius - p.bodyRadius;
    const d2 = p.x * p.x + p.y * p.y;
    if (d2 > limit * limit) {
      const k = limit / Math.sqrt(d2);
      p.setPosition(p.x * k, p.y * k);
    }
  }

  private resetRun(): void {
    this.enemies.releaseAll();
    this.projectiles.releaseAll();
    this.gems.releaseAll();
    this.clearEffects();

    this.player.reset(0, 0);
    this.fx.reset();
    this.waves.reset();
    this.weapons.reset(this.character.startingWeapon);
    this.upgrades.reset();
    this.squad.reset();
    this.specials.reset();
    this.passives.reset(this.time.now);
    this.kills = 0;
    this.scoreSaved = false;
    this.lastRank = 0;

    const cam = this.cameras.main;
    cam.setScroll(-GAME_WIDTH / 2, -GAME_HEIGHT / 2);
    this.updateHud();
    this.enterState('playing');
  }

  private enterState(next: GameState): void {
    this.state = next;
    if (next === 'playing') {
      this.physics.world.resume();
    } else {
      this.physics.world.pause();
    }
  }

  private endGame(victory: boolean): void {
    this.enterState('over');
    this.updateHud();
    this.saveScore(victory);
    this.events.emit(EVENTS.GAME_OVER, victory, this.waves.elapsedSec, this.kills, this.player.level);
  }

  /** Records the current run on the leaderboard once; later calls for the same run are ignored. */
  saveScore(victory: boolean): void {
    if (this.scoreSaved || this.kills <= 0) {
      return;
    }
    this.scoreSaved = true;
    this.lastRank = ScoreStore.add({
      kills: this.kills,
      timeSec: Math.floor(this.waves.elapsedSec),
      character: this.character.id,
      difficulty: this.difficulty.id,
      mode: this.mode.id,
      victory,
      date: Date.now(),
    });
  }

  private updateHud(): void {
    const h = this.hud;
    const p = this.player;
    h.hp = p.hp;
    h.maxHp = p.maxHp;
    h.xp = p.xp;
    h.xpToNext = p.xpToNext;
    h.level = p.level;
    h.remainingSec = this.waves.remainingSec;
    h.kills = this.kills;
    h.wave = this.waves.waveNumber;
    h.dashCharges = p.dashCharges;
    h.dashMax = p.dashMax;
    h.dashCharge01 = p.dashCharge01;
    h.psiCharge01 = this.passives.psiCharge01;
    this.squad.writeHud(h as SquadHud);
    this.specials.writeHud(h);
  }

  /** Runs after physics has synced sprites, so the ground and camera always share the same scroll value. */
  private syncCamera(): void {
    const cam = this.cameras.main;
    const tx = this.player.x - GAME_WIDTH / 2;
    const ty = this.player.y - GAME_HEIGHT / 2;
    cam.scrollX += (tx - cam.scrollX) * CAMERA_LERP;
    cam.scrollY += (ty - cam.scrollY) * CAMERA_LERP;
    this.ground.tilePositionX = Math.round(cam.scrollX);
    this.ground.tilePositionY = Math.round(cam.scrollY);
  }

  // ---------------------------------------------------------------- effects

  private createEffectPools(): void {
    for (let i = 0; i < POOL_SIZES.blood; i++) {
      const img = this.add.image(0, 0, BLOOD_KEYS[0]).setDepth(2);
      img.setActive(false).setVisible(false);
      this.bloodImages.push(img);
    }
    for (let i = 0; i < POOL_SIZES.damageTexts; i++) {
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Arial Black, Impact, sans-serif',
          fontSize: '22px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(50);
      text.setActive(false).setVisible(false);
      this.damageTexts.push(text);
    }
  }

  private clearEffects(): void {
    for (let i = 0; i < this.bloodImages.length; i++) {
      this.bloodImages[i].setActive(false).setVisible(false);
    }
    for (let i = 0; i < this.damageTexts.length; i++) {
      this.damageTexts[i].setActive(false).setVisible(false);
    }
  }

  private spawnBlood(x: number, y: number, scale: number): void {
    const list = this.bloodImages;
    let slot = this.bloodCursor;
    // Prefer a free slot; otherwise the cursor recycles the oldest splat.
    for (let i = 0; i < list.length; i++) {
      const idx = (this.bloodCursor + i) % list.length;
      if (!list[idx].active) {
        slot = idx;
        break;
      }
    }
    this.bloodCursor = (slot + 1) % list.length;

    const img = list[slot];
    img.setActive(true).setVisible(true);
    img.setTexture(BLOOD_KEYS[(Math.random() * BLOOD_KEYS.length) | 0]);
    img.setPosition(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10);
    img.setRotation(Math.random() * Math.PI * 2);
    img.setScale(scale * (0.85 + Math.random() * 0.3));
    img.setAlpha(0.9);
    this.bloodAge[slot] = 0;
  }

  private spawnDamageText(x: number, y: number, amount: number, color: number, scale: number): void {
    const list = this.damageTexts;
    let slot = this.textCursor;
    for (let i = 0; i < list.length; i++) {
      const idx = (this.textCursor + i) % list.length;
      if (!list[idx].active) {
        slot = idx;
        break;
      }
    }
    this.textCursor = (slot + 1) % list.length;

    const value = Math.max(1, Math.round(amount));
    let str = this.numberStrings[value];
    if (str === undefined) {
      str = String(value);
      this.numberStrings[value] = str;
    }

    const t = list[slot];
    t.setActive(true).setVisible(true);
    t.setText(str);
    t.setTint(color);
    t.setPosition(x, y);
    t.setAlpha(1);
    this.textAge[slot] = 0;
    this.textStartX[slot] = x;
    this.textStartY[slot] = y;
    this.textDrift[slot] = (Math.random() - 0.5) * 40;
    this.textScale[slot] = scale;
  }

  private updateEffects(dt: number): void {
    const blood = this.bloodImages;
    for (let i = 0; i < blood.length; i++) {
      const img = blood[i];
      if (!img.active) {
        continue;
      }
      const age = this.bloodAge[i] + dt;
      this.bloodAge[i] = age;
      const t = age / BLOOD_LIFE;
      if (t >= 1) {
        img.setActive(false).setVisible(false);
        continue;
      }
      img.setAlpha(t < 0.6 ? 0.9 : 0.9 * (1 - (t - 0.6) / 0.4));
    }

    const texts = this.damageTexts;
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text.active) {
        continue;
      }
      const age = this.textAge[i] + dt;
      this.textAge[i] = age;
      const t = age / TEXT_LIFE;
      if (t >= 1) {
        text.setActive(false).setVisible(false);
        continue;
      }
      const eased = 1 - (1 - t) * (1 - t);
      text.setPosition(this.textStartX[i] + this.textDrift[i] * eased, this.textStartY[i] - TEXT_RISE * eased);
      text.setScale(this.textScale[i] * (1 + 0.6 * Math.max(0, 1 - age * 9)));
      text.setAlpha(t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45);
    }
  }
}
