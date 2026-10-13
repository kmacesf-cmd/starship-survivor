import Phaser from 'phaser';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, SQUAD_CAP, TEXTURES } from '../config/GameConfig';
import { SPECIALS, SPECIAL_IDS, SQUAD_UPGRADES, SQUAD_UPGRADE_IDS } from '../config/SpecialsConfig';
import { PERKS, PERK_IDS } from '../config/PerkConfig';
import { TouchInput } from '../systems/TouchInput';
import { STAT_IDS, STATS, WEAPONS } from '../config/WeaponsConfig';
import type { WeaponId } from '../config/WeaponsConfig';
import type { HudState, GameScene } from './GameScene';
import type { UpgradeCard } from '../systems/UpgradeManager';
import { CARD_COUNT } from '../systems/UpgradeManager';
import { WaveEvent } from '../systems/WaveManager';

const WEAPON_ICONS: Record<WeaponId, { texture: string; scale: number; tint: number }> = {
  morita: { texture: TEXTURES.BULLET, scale: 2.8, tint: 0xffffff },
  shotgun: { texture: TEXTURES.BULLET, scale: 2.8, tint: 0xffffff },
  nova: { texture: TEXTURES.BULLET, scale: 2.8, tint: 0xffffff },
  orbit: { texture: TEXTURES.DRONE, scale: 2.2, tint: 0xffffff },
  dualshotgun: { texture: TEXTURES.PELLET, scale: 4, tint: 0xffffff },
  rocket: { texture: TEXTURES.ROCKET, scale: 2.6, tint: 0xffffff },
  flamer: { texture: TEXTURES.FLAME, scale: 1.9, tint: 0xffffff },
  arc: { texture: TEXTURES.FIREBALL, scale: 0.6, tint: 0x7fc8ff },
  orbital: { texture: TEXTURES.FIREBALL, scale: 0.6, tint: 0xff4a3a },
  plasma: { texture: TEXTURES.PLASMA, scale: 0.9, tint: 0xffffff },
  smg: { texture: TEXTURES.BULLET, scale: 2.2, tint: 0xffe27a },
  sniper: { texture: TEXTURES.BULLET, scale: 3.4, tint: 0xfff2c8 },
  cluster: { texture: TEXTURES.GRENADE, scale: 1.6, tint: 0xffffff },
  cryo: { texture: TEXTURES.FIREBALL, scale: 0.6, tint: 0x8be9ff },
};

const FONT = 'Verdana, Arial, sans-serif';
const CARD_W = 300;
const CARD_H = 400;
const CARD_GAP = 40;
const CARD_Y = GAME_HEIGHT / 2 + 30;
const CARD_STAGGER_MS = 70;
const CARD_POP_MS = 320;
const CARD_COLORS = { weapon: 0x6b3510, stat: 0x10424f, heal: 0x1b501f, special: 0x4a1a5e, squad: 0x33401a, perk: 0x5a4a10 } as const;
const CARD_BORDERS = { weapon: 0xffa23a, stat: 0x58d6ff, heal: 0x6dff7a, special: 0xd68bff, squad: 0xc8f05a, perk: 0xffd34a } as const;
const HP_BAR_W = 320;
const HP_BAR_H = 24;
const PAUSE_BTN_W = 320;
const PAUSE_BTN_H = 56;
const PAUSE_BTN_GAP = 16;
const SPECIAL_BAR_W = 230;
const SPECIAL_BAR_H = 16;
const STICK_X = 150;
const STICK_Y = 560;
const STICK_RADIUS = 70;
const STICK_HIT_R = 160;
const STICK_DEADZONE = 0.12;
const DASH_BTN_X = GAME_WIDTH - 140;
const DASH_BTN_Y = 540;
const DASH_BTN_R = 56;
const DASH_HIT_R = 84;
const AIR_BTN_X = DASH_BTN_X;
const AIR_BTN_Y = 412;
const AIR_BTN_R = 46;
const AIR_HIT_R = 62;
const RADAR_X = GAME_WIDTH - 96;
const RADAR_Y = 178;
const RADAR_R = 78;
const RADAR_RANGE = 900;
const RADAR_SCALE = RADAR_R / RADAR_RANGE;

const ALERT_TEXT: string[] = [];
ALERT_TEXT[WaveEvent.Swarm] = 'BUG SWARM INCOMING!';
ALERT_TEXT[WaveEvent.TigerPack] = 'TIGER BUGS APPROACHING!';
ALERT_TEXT[WaveEvent.EliteAssault] = 'ELITE BUG ASSAULT!';

interface PauseButton {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}
interface CardView {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  tag: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Image;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  hotkey: Phaser.GameObjects.Text;
}

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
};

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;

  private xpFill!: Phaser.GameObjects.Rectangle;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private alertText!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private dashLabel!: Phaser.GameObjects.Text;
  private psiLabel!: Phaser.GameObjects.Text;
  private squadText!: Phaser.GameObjects.Text;
  private nukeLabel!: Phaser.GameObjects.Text;
  private stimLabel!: Phaser.GameObjects.Text;
  private overclockLabel!: Phaser.GameObjects.Text;
  private dashButtonLabel!: Phaser.GameObjects.Text;
  private airLabel!: Phaser.GameObjects.Text;
  private lastAirText = '';
  private airPressUntil = 0;
  private touchGfx!: Phaser.GameObjects.Graphics;
  private touchShown = false;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private dashPressUntil = 0;
  private lastNukeText = '';
  private lastStimText = '';
  private beaconText!: Phaser.GameObjects.Text;
  private rescueText!: Phaser.GameObjects.Text;
  private lastDashText = '';
  private lastSquad = -1;
  private lastBeaconMeters = -1;
  private lastLevel = -1;
  private lastSecond = -1;
  private lastHp = -1;
  private lastKills = -1;
  private lastWave = -1;
  private lastWeaponHash = -1;
  private lastHpRatio = 1;
  private flashAlpha = 0;
  private alertUntil = 0;

  private levelRoot!: Phaser.GameObjects.Container;
  private levelDim!: Phaser.GameObjects.Rectangle;
  private levelTitle!: Phaser.GameObjects.Text;
  private levelSub!: Phaser.GameObjects.Text;
  private readonly cardViews: CardView[] = [];
  private cardCount = 0;
  private cardsShownAt = 0;
  private cardsVisible = false;

  private overRoot!: Phaser.GameObjects.Container;
  private overTitle!: Phaser.GameObjects.Text;
  private overStats!: Phaser.GameObjects.Text;
  private overVisible = false;
  private overShownAt = 0;

  private pauseRoot!: Phaser.GameObjects.Container;
  private pauseStats!: Phaser.GameObjects.Text;
  private pauseStats2!: Phaser.GameObjects.Text;
  private pauseSound!: PauseButton;
  private pauseVisible = false;
  constructor() {
    super(SCENE_KEYS.UI);
  }

  create(): void {
    this.gs = this.scene.get(SCENE_KEYS.GAME) as GameScene;
    this.cardViews.length = 0;
    this.cardsVisible = false;
    this.overVisible = false;
    this.pauseVisible = false;
    this.lastLevel = this.lastSecond = this.lastHp = this.lastKills = this.lastWave = this.lastWeaponHash = -1;
    this.lastHpRatio = 1;
    this.lastDashText = '';
    this.lastSquad = -1;
    this.lastBeaconMeters = -1;
    this.flashAlpha = 0;
    this.alertUntil = 0;

    this.buildHud();
    this.buildLevelUp();
    this.buildGameOver();
    this.buildPause();
    this.buildTouch();
    this.lastNukeText = this.lastStimText = '';
    const gev = this.gs.events;
    gev.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
    gev.on(EVENTS.UPGRADE_CHOSEN, this.hideCards, this);
    gev.on(EVENTS.GAME_OVER, this.onGameOver, this);
    gev.on(EVENTS.RESTART, this.onRestart, this);
    gev.on(EVENTS.WAVE_ALERT, this.onWaveAlert, this);

    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-ONE', () => this.pickCard(0));
      kb.on('keydown-TWO', () => this.pickCard(1));
      kb.on('keydown-THREE', () => this.pickCard(2));
      kb.on('keydown-R', () => this.requestRestart());
      kb.on('keydown-ENTER', () => this.requestRestart());
      kb.on('keydown-SPACE', () => this.requestRestart());
      kb.on('keydown-ESC', () => this.togglePause());
      kb.on('keydown-F', () => this.requestAir());
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gev.off(EVENTS.LEVEL_UP, this.onLevelUp, this);
      gev.off(EVENTS.UPGRADE_CHOSEN, this.hideCards, this);
      gev.off(EVENTS.GAME_OVER, this.onGameOver, this);
      gev.off(EVENTS.RESTART, this.onRestart, this);
      gev.off(EVENTS.WAVE_ALERT, this.onWaveAlert, this);
    });
  }

  override update(time: number, delta: number): void {
    this.updateHud(delta);
    this.updateAlert(time);
    this.animateCards(time);
    this.animateGameOver(time);
  }

  // ---------------------------------------------------------------- build

  private label(
    x: number,
    y: number,
    text: string,
    size: number,
    color = '#ffffff',
    stroke = 4,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: stroke,
      resolution: 2,
    });
  }

  private buildHud(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;

    this.add.rectangle(0, 0, W, 24, 0x000000, 0.6).setOrigin(0, 0).setDepth(1);
    this.xpFill = this.add.rectangle(0, 0, W, 24, 0x39ff14, 1).setOrigin(0, 0).setDepth(2).setScale(0, 1);
    this.add.rectangle(0, 22, W, 2, 0x0b5a20, 1).setOrigin(0, 0).setDepth(3);
    this.levelText = this.label(W / 2, 12, 'LV 1', 16).setOrigin(0.5).setDepth(4);

    this.timerText = this.label(W / 2, 58, '20:00', 38).setOrigin(0.5).setDepth(4);
    this.waveText = this.label(20, 34, 'WAVE 1', 20, '#ffd34a').setDepth(4);
    this.killText = this.label(W - 76, 34, 'KILLS 0', 20, '#ffffff').setOrigin(1, 0).setDepth(4);
    this.buildPauseButton();
    this.weaponText = this.label(20, 64, '', 16, '#d8e6ff', 3).setDepth(4).setLineSpacing(4);

    const hx = 24;
    const hy = H - 24 - HP_BAR_H;
    this.add.rectangle(hx - 3, hy - 3, HP_BAR_W + 6, HP_BAR_H + 6, 0x000000, 0.7).setOrigin(0, 0).setDepth(1);
    this.add.rectangle(hx, hy, HP_BAR_W, HP_BAR_H, 0x3a0d0d, 1).setOrigin(0, 0).setDepth(2);
    this.hpFill = this.add.rectangle(hx, hy, HP_BAR_W, HP_BAR_H, 0xd8372f, 1).setOrigin(0, 0).setDepth(3);
    this.add.rectangle(hx, hy, HP_BAR_W, 5, 0xff8a80, 0.55).setOrigin(0, 0).setDepth(4);
    this.hpText = this.label(hx + HP_BAR_W / 2, hy + HP_BAR_H / 2, 'HP 100/100', 15, '#ffffff', 3)
      .setOrigin(0.5)
      .setDepth(5);

    this.alertText = this.label(W / 2, 130, '', 34, '#ff6a3a', 6).setOrigin(0.5).setDepth(6).setAlpha(0);
    this.flash = this.add.rectangle(0, 0, W, H, 0xff0000, 0).setOrigin(0, 0).setDepth(0);

    this.hudGfx = this.add.graphics().setDepth(5);
    this.dashLabel = this.label(0, 0, 'DASH READY  [SPACE]', 13, '#bfeaff', 3).setDepth(6);
    this.psiLabel = this.label(0, 0, 'PSI', 13, '#d8c4ff', 3).setOrigin(1, 0).setDepth(6).setVisible(false);
    this.squadText = this.label(hx + HP_BAR_W + 16, hy + 2, 'SQUAD 0/4', 18, '#9be8ff', 4).setDepth(4);
    this.beaconText = this.label(0, 0, 'SOS', 15, '#ffb0a0', 4).setOrigin(0.5).setDepth(6).setVisible(false);
    this.nukeLabel = this.label(0, 0, '', 11, '#ffffff', 3).setOrigin(0, 0.5).setDepth(7).setVisible(false);
    this.stimLabel = this.label(0, 0, '', 11, '#ffffff', 3).setOrigin(0, 0.5).setDepth(7).setVisible(false);
    this.overclockLabel = this.label(0, 0, 'SQUAD OVERCLOCK', 12, '#7dffea', 3).setOrigin(1, 0).setDepth(7).setVisible(false);
    this.dashButtonLabel = this.label(DASH_BTN_X, DASH_BTN_Y, 'DASH', 20, '#e8fbff', 4).setOrigin(0.5).setDepth(61).setVisible(false);
    this.airLabel = this.label(AIR_BTN_X, AIR_BTN_Y, 'AIR SUPPORT', 12, '#fff2c8', 4).setOrigin(0.5).setDepth(62).setVisible(false).setAlign('center');
    this.rescueText = this.label(W / 2, 108, 'HOLD POSITION - RESCUING TROOPER', 15, '#9dff9d', 4)
      .setOrigin(0.5)
      .setDepth(6)
      .setVisible(false);
  }

  private buildLevelUp(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    this.levelRoot = this.add.container(0, 0).setDepth(100).setVisible(false);
    this.levelDim = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0, 0);
    this.levelTitle = this.label(W / 2, 110, 'LEVEL UP!', 60, '#ffd34a', 8).setOrigin(0.5);
    this.levelSub = this.label(W / 2, 168, 'Choose your upgrade', 22, '#e6e6e6', 4).setOrigin(0.5);
    this.levelRoot.add([this.levelDim, this.levelTitle, this.levelSub]);

    const totalW = CARD_COUNT * CARD_W + (CARD_COUNT - 1) * CARD_GAP;
    const startX = (W - totalW) / 2 + CARD_W / 2;
    for (let i = 0; i < CARD_COUNT; i++) {
      const root = this.add.container(startX + i * (CARD_W + CARD_GAP), CARD_Y);
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, CARD_COLORS.weapon, 1).setStrokeStyle(4, CARD_BORDERS.weapon, 1);
      const tag = this.label(0, -CARD_H / 2 + 28, '', 18, '#9be8ff', 3).setOrigin(0.5);
      const icon = this.add.image(0, -90, TEXTURES.BULLET).setScale(2.6);
      const title = this.label(0, -10, '', 26, '#ffffff', 4)
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(CARD_W - 40);
      const desc = this.label(0, 70, '', 18, '#e0e0e0', 3)
        .setOrigin(0.5, 0)
        .setAlign('center')
        .setWordWrapWidth(CARD_W - 40);
      const hotkey = this.label(0, CARD_H / 2 - 28, `[ ${i + 1} ]`, 20, '#ffffff', 3).setOrigin(0.5);
      root.add([bg, tag, icon, title, desc, hotkey]);
      this.levelRoot.add(root);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(this.lighten(bg.fillColor), 1));
      bg.on('pointerout', () => this.restoreCardFill(i));
      bg.on('pointerdown', () => this.pickCard(i));
      this.cardViews.push({ root, bg, tag, icon, title, desc, hotkey });
    }
  }

  private buildGameOver(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    this.overRoot = this.add.container(0, 0).setDepth(200).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setOrigin(0, 0);
    this.overTitle = this.label(W / 2, H / 2 - 120, 'K.I.A.', 84, '#ff4d3a', 10).setOrigin(0.5);
    this.overStats = this.label(W / 2, H / 2 + 10, '', 28, '#ffffff', 5).setOrigin(0.5).setAlign('center').setLineSpacing(10);
    const prompt = this.label(W / 2, H / 2 + 150, 'Click or press R to redeploy', 24, '#ffd34a', 4).setOrigin(0.5);
    this.overRoot.add([dim, this.overTitle, this.overStats, prompt]);
    dim.setInteractive({ useHandCursor: true });
    dim.on('pointerdown', () => this.requestRestart());
  }

  // ---------------------------------------------------------------- hud

  private updateHud(delta: number): void {
    const h = this.gs.hud;

    this.xpFill.setScale(Math.min(1, h.xp / h.xpToNext), 1);
    const hpRatio = h.maxHp > 0 ? Math.max(0, h.hp / h.maxHp) : 0;
    this.hpFill.setScale(hpRatio, 1);

    if (h.level !== this.lastLevel) {
      this.lastLevel = h.level;
      this.levelText.setText(`LV ${h.level}`);
    }
    const sec = Math.ceil(h.remainingSec);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      const m = (sec / 60) | 0;
      const s = sec % 60;
      this.timerText.setText(`${m}:${s < 10 ? '0' : ''}${s}`);
    }
    const hp = Math.ceil(h.hp);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.hpText.setText(`HP ${hp}/${Math.round(h.maxHp)}`);
    }
    if (h.kills !== this.lastKills) {
      this.lastKills = h.kills;
      this.killText.setText(`KILLS ${h.kills}`);
    }
    if (h.wave !== this.lastWave) {
      this.lastWave = h.wave;
      this.waveText.setText(`WAVE ${h.wave}`);
    }
    this.updateWeaponList();
    this.updateOverlays(h);

    if (hpRatio < this.lastHpRatio - 0.0001) {
      this.flashAlpha = 0.32;
    }
    this.lastHpRatio = hpRatio;
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - delta * 0.001 * 0.9);
    }
    const lowHp = hpRatio > 0 && hpRatio < 0.3 ? 0.1 + 0.06 * Math.sin(this.time.now * 0.008) : 0;
    this.flash.setFillStyle(0xff0000, Math.max(this.flashAlpha, lowHp));
  }

  private updateOverlays(h: HudState): void {
    const g = this.hudGfx;
    g.clear();
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const now = this.time.now;

    // Dash charges and psionic pulse meter, above the HP bar.
    const px = 24;
    const py = H - 24 - HP_BAR_H - 20;
    for (let i = 0; i < h.dashMax; i++) {
      const x = px + i * 30;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 2, py - 2, 28, 14);
      g.fillStyle(0x12343f, 1);
      g.fillRect(x, py, 24, 10);
      const fill = i < h.dashCharges ? 1 : i === h.dashCharges ? h.dashCharge01 : 0;
      g.fillStyle(fill >= 1 ? 0x7fd7ff : 0x2e8fb0, 1);
      g.fillRect(x, py, 24 * fill, 10);
    }
    const dashText = h.dashCharges > 0 ? 'DASH READY' : 'DASH...';
    if (dashText !== this.lastDashText) {
      this.lastDashText = dashText;
      this.dashLabel.setText(`${dashText}  [SPACE]`);
    }
    this.dashLabel.setPosition(px + h.dashMax * 30 + 4, py - 3);

    if (this.gs.player.perks.psionicStun) {
      const x = px + HP_BAR_W - 110;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 2, py - 2, 114, 14);
      g.fillStyle(0x2a1a4a, 1);
      g.fillRect(x, py, 110, 10);
      g.fillStyle(h.psiCharge01 > 0.95 ? 0xe2d2ff : 0xa070ff, 1);
      g.fillRect(x, py, 110 * h.psiCharge01, 10);
      this.psiLabel.setVisible(true).setPosition(x - 8, py - 3);
    } else {
      this.psiLabel.setVisible(false);
    }

    if (h.squad !== this.lastSquad) {
      this.lastSquad = h.squad;
      this.squadText.setText(`SQUAD ${h.squad}/${SQUAD_CAP}`);
    }

    this.updateRadar(g, h, now);
    this.updateAirButton(g, h, now);
    this.updateSpecialsHud(g, h);
    this.updateTouch();

    if (h.beaconActive === 0) {
      this.beaconText.setVisible(false);
      this.rescueText.setVisible(false);
      return;
    }

    const meters = Math.round(h.beaconDist / 10);
    if (meters !== this.lastBeaconMeters) {
      this.lastBeaconMeters = meters;
      this.beaconText.setText(`SOS ${meters}m`);
    }

    if (h.beaconOnScreen === 0) {
      const cx = W / 2;
      const cy = H / 2;
      const c = Math.cos(h.beaconAngle);
      const s = Math.sin(h.beaconAngle);
      const rx = W / 2 - 64;
      const ry = H / 2 - 86;
      const k = Math.min(Math.abs(c) < 0.0001 ? Infinity : rx / Math.abs(c), Math.abs(s) < 0.0001 ? Infinity : ry / Math.abs(s));
      const ax = cx + c * k;
      const ay = cy + s * k;
      const pulse = 0.65 + 0.35 * Math.sin(now * 0.01);
      const tipX = ax + c * 20;
      const tipY = ay + s * 20;
      const bx = ax - c * 12;
      const by = ay - s * 12;
      g.fillStyle(0x000000, 0.55);
      g.fillCircle(ax, ay, 26);
      g.fillStyle(0xff5a3a, pulse);
      g.fillTriangle(tipX, tipY, bx - s * 15, by + c * 15, bx + s * 15, by - c * 15);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeTriangle(tipX, tipY, bx - s * 15, by + c * 15, bx + s * 15, by - c * 15);
      this.beaconText.setVisible(true).setPosition(ax - c * 54, ay - s * 40);
    } else {
      this.beaconText.setVisible(false);
    }

    if (h.beaconProgress > 0) {
      const bw = 300;
      const bx = W / 2 - bw / 2;
      g.fillStyle(0x000000, 0.7);
      g.fillRect(bx - 3, 120, bw + 6, 20);
      g.fillStyle(0x16381b, 1);
      g.fillRect(bx, 123, bw, 14);
      g.fillStyle(0x58e06a, 1);
      g.fillRect(bx, 123, bw * h.beaconProgress, 14);
      this.rescueText.setVisible(true);
    } else {
      this.rescueText.setVisible(false);
    }
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, fill: number, back: number, front: number): void {
    g.fillStyle(0x000000, 0.7);
    g.fillRect(x - 2, y - 2, SPECIAL_BAR_W + 4, SPECIAL_BAR_H + 4);
    g.fillStyle(back, 1);
    g.fillRect(x, y, SPECIAL_BAR_W, SPECIAL_BAR_H);
    g.fillStyle(front, 1);
    g.fillRect(x, y, SPECIAL_BAR_W * fill, SPECIAL_BAR_H);
  }

  private updateSpecialsHud(g: Phaser.GameObjects.Graphics, h: HudState): void {
    const x = GAME_WIDTH - 24 - SPECIAL_BAR_W;
    const yStim = GAME_HEIGHT - 24 - SPECIAL_BAR_H;
    const yNuke = yStim - SPECIAL_BAR_H - 10;
    const now = this.time.now;

    if (h.nukeCharge01 >= 0) {
      const blink = h.nukeWarning > 0 && Math.sin(now * 0.03) > 0;
      this.drawBar(g, x, yNuke, h.nukeCharge01, 0x3a2a08, blink ? 0xffffff : 0xffb020);
      const text = h.nukeWarning > 0 ? 'NUKE INBOUND!' : 'TACTICAL NUKE';
      if (text !== this.lastNukeText) {
        this.lastNukeText = text;
        this.nukeLabel.setText(text);
      }
      this.nukeLabel.setVisible(true).setPosition(x + 6, yNuke + SPECIAL_BAR_H / 2);
    } else {
      this.nukeLabel.setVisible(false);
    }

    if (h.stimState >= 0) {
      const active = h.stimState === 1;
      const ready = h.stimState === 0;
      this.drawBar(g, x, yStim, h.stimFraction, 0x08283a, active ? 0xffffff : ready ? 0x46e0ff : 0x2b7fa0);
      const text = active ? 'STIM ACTIVE' : ready ? 'SICON STIM READY' : 'SICON STIM CHARGING';
      if (text !== this.lastStimText) {
        this.lastStimText = text;
        this.stimLabel.setText(text);
      }
      this.stimLabel.setVisible(true).setPosition(x + 6, yStim + SPECIAL_BAR_H / 2);
    } else {
      this.stimLabel.setVisible(false);
    }

    if (h.overclockLevel > 0) {
      this.overclockLabel.setVisible(true).setPosition(x + SPECIAL_BAR_W, yNuke - 22);
    } else {
      this.overclockLabel.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- radar and air support

  private requestAir(): void {
    if (this.overlayOpen() || this.gs.hud.airVisible !== 1) {
      return;
    }
    TouchInput.airRequested = true;
    this.airPressUntil = this.time.now + 160;
  }

  /** Circular tactical radar. One Graphics pass per frame, no per-blip objects. */
  private updateRadar(g: Phaser.GameObjects.Graphics, h: HudState, now: number): void {
    const gs = this.gs;
    const p = gs.player;
    g.fillStyle(0x03140a, 0.72);
    g.fillCircle(RADAR_X, RADAR_Y, RADAR_R + 4);
    g.lineStyle(2, 0x58e06a, 0.9);
    g.strokeCircle(RADAR_X, RADAR_Y, RADAR_R + 4);
    g.lineStyle(1, 0x2e8a40, 0.5);
    g.strokeCircle(RADAR_X, RADAR_Y, RADAR_R * 0.5);
    g.lineBetween(RADAR_X - RADAR_R, RADAR_Y, RADAR_X + RADAR_R, RADAR_Y);
    g.lineBetween(RADAR_X, RADAR_Y - RADAR_R, RADAR_X, RADAR_Y + RADAR_R);
    const sweep = now * 0.003;
    g.lineStyle(2, 0x58e06a, 0.45);
    g.lineBetween(RADAR_X, RADAR_Y, RADAR_X + Math.cos(sweep) * RADAR_R, RADAR_Y + Math.sin(sweep) * RADAR_R);

    const limit = (RADAR_R - 2) * (RADAR_R - 2);
    const gems = gs.gems.gems;
    g.fillStyle(0x39ff14, 0.9);
    for (let i = 0; i < gems.length; i++) {
      const gem = gems[i];
      if (!gem.active) {
        continue;
      }
      const dx = (gem.x - p.x) * RADAR_SCALE;
      const dy = (gem.y - p.y) * RADAR_SCALE;
      if (dx * dx + dy * dy <= limit) {
        g.fillRect(RADAR_X + dx - 1, RADAR_Y + dy - 1, 2, 2);
      }
    }
    const enemies = gs.enemies.enemies;
    g.fillStyle(0xff3b30, 1);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) {
        continue;
      }
      const dx = (e.x - p.x) * RADAR_SCALE;
      const dy = (e.y - p.y) * RADAR_SCALE;
      if (dx * dx + dy * dy <= limit) {
        g.fillRect(RADAR_X + dx - 1.5, RADAR_Y + dy - 1.5, 3, 3);
      }
    }
    const mates = gs.squad.mates;
    g.fillStyle(0x3de8ff, 1);
    for (let i = 0; i < mates.length; i++) {
      const m = mates[i];
      if (!m.isOccupied) {
        continue;
      }
      const dx = (m.x - p.x) * RADAR_SCALE;
      const dy = (m.y - p.y) * RADAR_SCALE;
      if (dx * dx + dy * dy <= limit) {
        g.fillCircle(RADAR_X + dx, RADAR_Y + dy, 3);
      }
    }
    if (h.beaconActive === 1) {
      let bx = (gs.squad.beaconX - p.x) * RADAR_SCALE;
      let by = (gs.squad.beaconY - p.y) * RADAR_SCALE;
      const d2 = bx * bx + by * by;
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.01);
      if (d2 > limit) {
        const len = Math.sqrt(d2);
        const ux = bx / len;
        const uy = by / len;
        bx = ux * (RADAR_R - 6);
        by = uy * (RADAR_R - 6);
        g.fillStyle(0xffe14a, pulse);
        g.fillTriangle(
          RADAR_X + bx + ux * 8,
          RADAR_Y + by + uy * 8,
          RADAR_X + bx - ux * 4 - uy * 6,
          RADAR_Y + by - uy * 4 + ux * 6,
          RADAR_X + bx - ux * 4 + uy * 6,
          RADAR_Y + by - uy * 4 - ux * 6,
        );
      } else {
        g.lineStyle(2, 0xffe14a, pulse);
        g.strokeCircle(RADAR_X + bx, RADAR_Y + by, 4 + 5 * (1 - pulse));
        g.fillStyle(0xffe14a, 1);
        g.fillCircle(RADAR_X + bx, RADAR_Y + by, 3);
      }
    }
    g.fillStyle(0x3d8bff, 1);
    g.fillCircle(RADAR_X, RADAR_Y, 4);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeCircle(RADAR_X, RADAR_Y, 4);
  }

  /** AIR SUPPORT ability button above Dash; only drawn once an air support power-up is owned. */
  private updateAirButton(g: Phaser.GameObjects.Graphics, h: HudState, now: number): void {
    if (h.airVisible !== 1) {
      this.airLabel.setVisible(false);
      return;
    }
    const ready = h.airReady === 1;
    const pulse = ready ? 0.5 + 0.5 * Math.sin(now * 0.012) : 0;
    const pressed = now < this.airPressUntil;
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(AIR_BTN_X, AIR_BTN_Y, AIR_BTN_R + 4);
    g.fillStyle(ready ? 0xffb020 : 0x3a2a08, ready ? 0.5 + 0.3 * pulse : 0.85);
    g.fillCircle(AIR_BTN_X, AIR_BTN_Y, AIR_BTN_R);
    if (!ready) {
      g.lineStyle(7, 0xffb020, 1);
      g.beginPath();
      g.arc(AIR_BTN_X, AIR_BTN_Y, AIR_BTN_R - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.airCharge01, false);
      g.strokePath();
    }
    if (ready) {
      g.lineStyle(3 + 4 * pulse, 0xffe9a0, 0.5 + 0.5 * pulse);
      g.strokeCircle(AIR_BTN_X, AIR_BTN_Y, AIR_BTN_R + 3 + 4 * pulse);
    }
    g.lineStyle(3, pressed ? 0xffffff : 0xffd27a, 0.9);
    g.strokeCircle(AIR_BTN_X, AIR_BTN_Y, AIR_BTN_R);
    let text: string;
    if (h.airRunning === 1) {
      text = 'AIR SUPPORT\nINBOUND';
    } else if (ready) {
      text = TouchInput.active ? 'AIR SUPPORT\nREADY' : 'AIR SUPPORT\nREADY [F]';
    } else {
      text = 'AIR SUPPORT\n' + Math.floor(h.airCharge01 * 100) + '%';
    }
    if (text !== this.lastAirText) {
      this.lastAirText = text;
      this.airLabel.setText(text);
    }
    this.airLabel.setVisible(true).setAlpha(ready || h.airRunning === 1 ? 1 : 0.85);
  }

  // ---------------------------------------------------------------- touch controls

  private buildTouch(): void {
    this.touchGfx = this.add.graphics().setDepth(60);
    this.stickId = -1;
    this.stickX = 0;
    this.stickY = 0;
    this.dashPressUntil = 0;
    this.touchShown = TouchInput.active;

    this.input.on('pointerdown', this.onTouchDown, this);
    this.input.on('pointermove', this.onTouchMove, this);
    this.input.on('pointerup', this.onTouchUp, this);
    this.input.on('pointerupoutside', this.onTouchUp, this);
    this.input.keyboard?.on('keydown', this.onAnyKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onTouchDown, this);
      this.input.off('pointermove', this.onTouchMove, this);
      this.input.off('pointerup', this.onTouchUp, this);
      this.input.off('pointerupoutside', this.onTouchUp, this);
      this.input.keyboard?.off('keydown', this.onAnyKey, this);
      this.releaseStick();
      TouchInput.active = false;
    });
  }

  private overlayOpen(): boolean {
    return this.pauseVisible || this.cardsVisible || this.overVisible;
  }

  private onAnyKey(): void {
    if (this.touchShown) {
      this.touchShown = false;
      TouchInput.active = false;
      this.releaseStick();
    }
  }

  private onTouchDown(pointer: Phaser.Input.Pointer): void {
    if (!this.overlayOpen() && this.gs.hud.airVisible === 1) {
      const ax = pointer.x - AIR_BTN_X;
      const ay = pointer.y - AIR_BTN_Y;
      if (ax * ax + ay * ay <= AIR_HIT_R * AIR_HIT_R) {
        this.requestAir();
        return;
      }
    }
    if (!pointer.wasTouch) {
      return;
    }
    if (!this.touchShown) {
      this.touchShown = true;
      TouchInput.active = true;
      this.requestFullscreen();
    }
    if (this.overlayOpen()) {
      return;
    }
    const dx = pointer.x - DASH_BTN_X;
    const dy = pointer.y - DASH_BTN_Y;
    if (dx * dx + dy * dy <= DASH_HIT_R * DASH_HIT_R) {
      TouchInput.dashRequested = true;
      this.dashPressUntil = this.time.now + 160;
      return;
    }
    const sx = pointer.x - STICK_X;
    const sy = pointer.y - STICK_Y;
    if (this.stickId === -1 && sx * sx + sy * sy <= STICK_HIT_R * STICK_HIT_R) {
      this.stickId = pointer.id;
      this.applyStick(pointer);
    }
  }

  private onTouchMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.stickId) {
      this.applyStick(pointer);
    }
  }

  private onTouchUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.stickId) {
      this.releaseStick();
    }
  }

  private applyStick(pointer: Phaser.Input.Pointer): void {
    let dx = pointer.x - STICK_X;
    let dy = pointer.y - STICK_Y;
    const d2 = dx * dx + dy * dy;
    if (d2 > STICK_RADIUS * STICK_RADIUS) {
      const k = STICK_RADIUS / Math.sqrt(d2);
      dx *= k;
      dy *= k;
    }
    this.stickX = dx;
    this.stickY = dy;
    const nx = dx / STICK_RADIUS;
    const ny = dy / STICK_RADIUS;
    const dead = nx * nx + ny * ny < STICK_DEADZONE * STICK_DEADZONE;
    TouchInput.x = dead ? 0 : nx;
    TouchInput.y = dead ? 0 : ny;
  }

  private releaseStick(): void {
    this.stickId = -1;
    this.stickX = 0;
    this.stickY = 0;
    TouchInput.x = 0;
    TouchInput.y = 0;
  }

  private requestFullscreen(): void {
    const scale = this.scale;
    if (!scale.isFullscreen && scale.fullscreen.available) {
      try {
        scale.startFullscreen();
      } catch {
        // Fullscreen can be refused by the browser; the game still works windowed.
      }
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (typeof orientation?.lock === 'function') {
      orientation.lock('landscape').catch(() => undefined);
    }
  }

  private updateTouch(): void {
    this.touchGfx.clear();
    if (!this.touchShown) {
      this.dashButtonLabel.setVisible(false);
      return;
    }
    if (this.stickId !== -1 && this.overlayOpen()) {
      this.releaseStick();
    }
    const t = this.touchGfx;
    t.fillStyle(0xffffff, 0.1);
    t.fillCircle(STICK_X, STICK_Y, STICK_RADIUS + 12);
    t.lineStyle(3, 0xffffff, 0.35);
    t.strokeCircle(STICK_X, STICK_Y, STICK_RADIUS + 12);
    t.fillStyle(0xffffff, this.stickId === -1 ? 0.28 : 0.5);
    t.fillCircle(STICK_X + this.stickX, STICK_Y + this.stickY, 38);

    const pressed = this.time.now < this.dashPressUntil;
    t.fillStyle(0x46e0ff, pressed ? 0.6 : 0.22);
    t.fillCircle(DASH_BTN_X, DASH_BTN_Y, DASH_BTN_R);
    t.lineStyle(3, 0x9be8ff, 0.7);
    t.strokeCircle(DASH_BTN_X, DASH_BTN_Y, DASH_BTN_R);
    this.dashButtonLabel.setVisible(true);
    // The dash text stays dim while no charge is available.
    this.dashButtonLabel.setAlpha(this.gs.hud.dashCharges > 0 ? 1 : 0.4);
  }

  private updateWeaponList(): void {
    const weapons = this.gs.weapons;
    let hash = 7;
    for (let i = 0; i < weapons.slotCount; i++) {
      const slot = weapons.slots[i];
      hash = (hash * 31 + slot.id.charCodeAt(0) * 7 + slot.id.length * 13 + slot.level) | 0;
    }
    if (hash === this.lastWeaponHash) {
      return;
    }
    this.lastWeaponHash = hash;
    let text = '';
    for (let i = 0; i < weapons.slotCount; i++) {
      const slot = weapons.slots[i];
      text += `${i > 0 ? '\n' : ''}${WEAPONS[slot.id].name}  Lv ${slot.level}`;
    }
    this.weaponText.setText(text);
  }

  private updateAlert(time: number): void {
    if (this.alertUntil <= 0) {
      return;
    }
    const left = this.alertUntil - time;
    if (left <= 0) {
      this.alertUntil = 0;
      this.alertText.setAlpha(0);
      return;
    }
    const fade = Math.min(1, left / 600);
    this.alertText.setAlpha(fade * (0.7 + 0.3 * Math.sin(time * 0.02)));
  }

  private onWaveAlert(kind: number): void {
    this.alertText.setText(ALERT_TEXT[kind] ?? '');
    this.alertUntil = this.time.now + 2800;
  }

  // ---------------------------------------------------------------- level-up cards

  private onLevelUp(cards: UpgradeCard[], count: number, level: number): void {
    this.cardCount = count;
    this.levelTitle.setText(`LEVEL ${level}!`);
    for (let i = 0; i < CARD_COUNT; i++) {
      const view = this.cardViews[i];
      if (i >= count) {
        view.root.setVisible(false);
        continue;
      }
      const card = cards[i];
      view.root.setVisible(true).setScale(0).setAlpha(0);
      view.bg.setFillStyle(CARD_COLORS[card.kind], 1).setStrokeStyle(4, CARD_BORDERS[card.kind], 1);
      view.tag.setText(card.tag).setColor(card.isNew ? '#ffd34a' : '#9be8ff');
      view.title.setText(card.title);
      view.desc.setText(card.description);
      if (card.kind === 'weapon') {
        const icon = WEAPON_ICONS[card.id as WeaponId] ?? WEAPON_ICONS.morita;
        view.icon.setTexture(icon.texture).setScale(icon.scale);
        if (icon.tint === 0xffffff) {
          view.icon.clearTint();
        } else {
          view.icon.setTint(icon.tint);
        }
      } else {
        view.icon.setTexture(TEXTURES.GEM).setScale(2.2);
        if (card.kind === 'heal') {
          view.icon.setTint(0xff7a7a);
        } else if (card.kind === 'special') {
          view.icon.setTint(0xd68bff);
        } else if (card.kind === 'squad') {
          view.icon.setTint(0xe6ff7a);
        } else if (card.kind === 'perk') {
          view.icon.setTint(0xffd34a);
        } else {
          view.icon.clearTint();
        }
      }
    }
    this.levelRoot.setVisible(true);
    this.cardsVisible = true;
    this.cardsShownAt = this.time.now;
  }

  private hideCards(): void {
    this.cardsVisible = false;
    this.levelRoot.setVisible(false);
  }

  private animateCards(time: number): void {
    if (!this.cardsVisible) {
      return;
    }
    for (let i = 0; i < this.cardCount; i++) {
      const t = Math.min(1, Math.max(0, (time - this.cardsShownAt - i * CARD_STAGGER_MS) / CARD_POP_MS));
      const view = this.cardViews[i];
      view.root.setScale(easeOutBack(t));
      view.root.setAlpha(t);
      view.icon.setAngle(Math.sin(time * 0.004 + i) * 6);
    }
  }

  private pickCard(index: number): void {
    if (!this.cardsVisible || index >= this.cardCount) {
      return;
    }
    // Ignore input until the card has finished popping in, to prevent accidental picks.
    if (this.time.now - this.cardsShownAt < 250) {
      return;
    }
    this.gs.events.emit(EVENTS.CHOOSE_CARD, index);
  }

  private lighten(color: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + 36);
    const g = Math.min(255, ((color >> 8) & 0xff) + 36);
    const b = Math.min(255, (color & 0xff) + 36);
    return (r << 16) | (g << 8) | b;
  }

  private restoreCardFill(index: number): void {
    const cards = this.gs.upgrades.cards;
    if (index < this.cardCount) {
      this.cardViews[index].bg.setFillStyle(CARD_COLORS[cards[index].kind], 1);
    }
  }

  // ---------------------------------------------------------------- pause

  private buildPauseButton(): void {
    const x = GAME_WIDTH - 44;
    const y = 52;
    const bg = this.add.rectangle(x, y, 40, 40, 0x000000, 0.55).setStrokeStyle(2, 0xffffff, 0.8).setDepth(4);
    this.add.rectangle(x - 6, y, 6, 18, 0xffffff, 1).setDepth(5);
    this.add.rectangle(x + 6, y, 6, 18, 0xffffff, 1).setDepth(5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x2a2a2a, 0.8));
    bg.on('pointerout', () => bg.setFillStyle(0x000000, 0.55));
    bg.on('pointerdown', () => this.togglePause());
  }

  private makePauseButton(x: number, y: number, text: string, onClick: () => void): PauseButton {
    const bg = this.add.rectangle(x, y, PAUSE_BTN_W, PAUSE_BTN_H, 0x123a22, 1).setStrokeStyle(3, 0x6dff7a, 1);
    const label = this.label(x, y, text, 22, '#eaffee', 3).setOrigin(0.5);
    this.pauseRoot.add([bg, label]);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x1f6b3a, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x123a22, 1));
    bg.on('pointerdown', onClick);
    return { bg, text: label };
  }

  private buildPause(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    this.pauseRoot = this.add.container(0, 0).setDepth(150).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0, 0);
    dim.setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 940, 520, 0x07110b, 0.96).setStrokeStyle(3, 0x2fe06a, 1);
    const title = this.label(W / 2, H / 2 - 220, 'TACTICAL HOLD', 40, '#b7ffc9', 6).setOrigin(0.5);
    const sub = this.label(W / 2, H / 2 - 182, 'MISSION SUSPENDED - ESC TO RESUME', 14, '#3f9a58', 2).setOrigin(0.5);
    this.pauseRoot.add([dim, panel, title, sub]);

    const bx = W / 2 - 290;
    const by = H / 2 - 105;
    const step = PAUSE_BTN_H + PAUSE_BTN_GAP;
    this.makePauseButton(bx, by, 'RESUME', () => this.resumeFromPause());
    this.makePauseButton(bx, by + step, 'RESTART MISSION', () => this.restartMission());
    this.pauseSound = this.makePauseButton(bx, by + step * 2, 'SOUND: ON', () => this.toggleSound());
    this.makePauseButton(bx, by + step * 3, 'QUIT TO MAIN MENU', () => this.quitToMenu());

    const header = this.label(W / 2 + 40, H / 2 - 140, 'LIVE FIELD STATS', 18, '#ffd34a', 3);
    this.pauseStats = this.label(W / 2 + 40, H / 2 - 112, '', 14, '#d8ffe3', 2).setLineSpacing(4);
    this.pauseStats2 = this.label(W / 2 + 265, H / 2 - 112, '', 14, '#d8ffe3', 2).setLineSpacing(4);
    this.pauseRoot.add([header, this.pauseStats, this.pauseStats2]);
  }

  private togglePause(): void {
    if (this.pauseVisible) {
      this.resumeFromPause();
      return;
    }
    if (this.overVisible || this.cardsVisible || !this.gs.pauseGame()) {
      return;
    }
    this.refreshPauseStats();
    this.pauseSound.text.setText(this.sound.mute ? 'SOUND: OFF' : 'SOUND: ON');
    this.pauseRoot.setVisible(true);
    this.pauseVisible = true;
  }

  private resumeFromPause(): void {
    this.pauseRoot.setVisible(false);
    this.pauseVisible = false;
    this.gs.resumeGame();
  }

  private restartMission(): void {
    this.gs.saveScore(false);
    this.gs.events.emit(EVENTS.RESTART);
  }

  private toggleSound(): void {
    this.sound.mute = !this.sound.mute;
    this.pauseSound.text.setText(this.sound.mute ? 'SOUND: OFF' : 'SOUND: ON');
  }

  private quitToMenu(): void {
    this.gs.saveScore(false);
    this.releaseStick();
    this.scene.stop(SCENE_KEYS.GAME);
    this.scene.start(SCENE_KEYS.MENU);
  }

  private refreshPauseStats(): void {
    const gs = this.gs;
    const weapons = gs.weapons;
    let text = `MISSION   ${gs.mode.name.toUpperCase()}\nOPERATIVE ${gs.character.name.toUpperCase()}\nTHREAT    ${gs.difficulty.name.toUpperCase()}\nLEVEL     ${gs.hud.level}\n`;
    text += `DAMAGE    ${weapons.estimateDps().toFixed(1)} DPS\nSQUAD     ${gs.hud.squad} / ${SQUAD_CAP}\n\nARSENAL\n`;
    for (let i = 0; i < weapons.slotCount; i++) {
      const slot = weapons.slots[i];
      text += ` > ${WEAPONS[slot.id].name} Lv ${slot.level}\n`;
    }
    this.pauseStats.setText(text);

    let perks = 'PERKS\n';
    for (let i = 0; i < gs.character.passives.length; i++) {
      perks += ` > ${gs.character.passives[i]}\n`;
    }
    for (let i = 0; i < STAT_IDS.length; i++) {
      const level = gs.upgrades.getStatLevel(STAT_IDS[i]);
      if (level > 0) {
        perks += ` > ${STATS[STAT_IDS[i]].name} Lv ${level}\n`;
      }
    }
    perks += '\nSPECIALS\n';
    let any = false;
    for (let i = 0; i < SPECIAL_IDS.length; i++) {
      const level = gs.specials.getLevel(SPECIAL_IDS[i]);
      if (level > 0) {
        any = true;
        perks += ` > ${SPECIALS[SPECIAL_IDS[i]].name} Lv ${level}\n`;
      }
    }
    for (let i = 0; i < SQUAD_UPGRADE_IDS.length; i++) {
      const level = gs.squad.getUpgradeLevel(SQUAD_UPGRADE_IDS[i]);
      if (level > 0) {
        any = true;
        perks += ` > ${SQUAD_UPGRADES[SQUAD_UPGRADE_IDS[i]].name} Lv ${level}\n`;
      }
    }
    for (let i = 0; i < PERK_IDS.length; i++) {
      const level = gs.perks.getLevel(PERK_IDS[i]);
      if (level > 0) {
        any = true;
        perks += ' > ' + PERKS[PERK_IDS[i]].name + ' Lv ' + level + '\n';
      }
    }
    if (!any) {
      perks += ' (none)\n';
    }
    this.pauseStats2.setText(perks);
  }

  // ---------------------------------------------------------------- game over

  private onGameOver(victory: boolean, elapsedSec: number, kills: number, level: number): void {
    this.hideCards();
    const m = (elapsedSec / 60) | 0;
    const s = Math.floor(elapsedSec) % 60;
    this.overTitle
      .setText(victory ? 'MISSION COMPLETE' : 'K.I.A.')
      .setColor(victory ? '#6dff7a' : '#ff4d3a')
      .setFontSize(victory ? 68 : 84);
    const rank = this.gs.lastRank;
    const rankLine = rank === 1 ? '\nNEW HIGH SCORE!' : rank > 0 ? `\nHigh score rank #${rank}` : '';
    this.overStats.setText(`Survived  ${m}:${s < 10 ? '0' : ''}${s}\nBugs squashed  ${kills}\nLevel reached  ${level}${rankLine}`);
    this.overRoot.setVisible(true).setAlpha(0);
    this.overVisible = true;
    this.overShownAt = this.time.now;
  }

  private animateGameOver(time: number): void {
    if (!this.overVisible) {
      return;
    }
    this.overRoot.setAlpha(Math.min(1, (time - this.overShownAt) / 500));
  }

  private requestRestart(): void {
    if (!this.overVisible || this.time.now - this.overShownAt < 600) {
      return;
    }
    this.gs.events.emit(EVENTS.RESTART);
  }

  private onRestart(): void {
    this.overVisible = false;
    this.overRoot.setVisible(false);
    this.pauseVisible = false;
    this.pauseRoot.setVisible(false);
    this.hideCards();
    this.flashAlpha = 0;
    this.lastHpRatio = 1;
    this.alertUntil = 0;
    this.alertText.setAlpha(0);
  }
}
