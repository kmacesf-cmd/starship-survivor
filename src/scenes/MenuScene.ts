import Phaser from 'phaser';
import {
  CHARACTERS,
  CHARACTER_IDS,
  DEFAULT_RUN,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  GAME_MODES,
  GAME_MODE_IDS,
} from '../config/CharacterConfig';
import type { CharacterId, DifficultyId, GameModeId, RunSetup } from '../config/CharacterConfig';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, frameKey } from '../config/GameConfig';
import { ScoreStore } from '../systems/ScoreStore';

const MONO = 'Consolas, "Courier New", monospace';
const GREEN = '#7dff9a';
const DIM_GREEN = '#3f9a58';
const AMBER = '#ffd34a';
const BG = 0x07110b;
const PANEL = 0x0c1d12;
const GRID_LINE = 0x123a22;
const PORTRAIT_KEY = frameKey('trooper-idle', 0);
const REGISTRY_MODE = 'menu-mode';
const REGISTRY_CHARACTER = 'menu-character';
const REGISTRY_DIFFICULTY = 'menu-difficulty';
const SCORE_ROWS = 10;
const DIFF_X = 500;
const DIFF_W = 120;
const DIFF_GAP = 10;

const MODE_X = 40;
const MODE_Y = 150;
const MODE_W = 380;
const MODE_H = 128;
const MODE_GAP = 14;

const CARD_X = 450;
const CARD_Y = 150;
const CARD_W = 150;
const CARD_H = 170;
const CARD_GAP = 15;

const BIO_X = 450;
const BIO_Y = 340;
const BIO_W = CARD_W * 5 + CARD_GAP * 4;
const BIO_H = 230;

interface ModeView {
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  marker: Phaser.GameObjects.Text;
}

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  portrait: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  baseY: number;
}

interface DiffView {
  bg: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
}

export class MenuScene extends Phaser.Scene {
  private modeId: GameModeId = DEFAULT_RUN.mode;
  private characterId: CharacterId = DEFAULT_RUN.character;
  private difficultyId: DifficultyId = DEFAULT_RUN.difficulty;
  private deploying = false;
  private scoresOpen = false;

  private readonly modeViews: ModeView[] = [];
  private readonly cardViews: CardView[] = [];
  private readonly diffViews: DiffView[] = [];
  private readonly scoreRows: Phaser.GameObjects.Text[] = [];
  private scoreLayer: Phaser.GameObjects.GameObject[] = [];

  private bioPortrait!: Phaser.GameObjects.Image;
  private bioFrame!: Phaser.GameObjects.Rectangle;
  private bioName!: Phaser.GameObjects.Text;
  private bioRole!: Phaser.GameObjects.Text;
  private bioText!: Phaser.GameObjects.Text;
  private bioPassives!: Phaser.GameObjects.Text;
  private bioLoadout!: Phaser.GameObjects.Text;
  private summary!: Phaser.GameObjects.Text;
  private deployBg!: Phaser.GameObjects.Rectangle;
  private deployText!: Phaser.GameObjects.Text;
  private cursor!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.MENU);
  }

  create(): void {
    this.deploying = false;
    this.scoresOpen = false;
    this.modeViews.length = 0;
    this.cardViews.length = 0;
    this.diffViews.length = 0;
    this.scoreRows.length = 0;
    this.scoreLayer = [];
    this.modeId = (this.registry.get(REGISTRY_MODE) as GameModeId | undefined) ?? DEFAULT_RUN.mode;
    this.characterId = (this.registry.get(REGISTRY_CHARACTER) as CharacterId | undefined) ?? DEFAULT_RUN.character;
    this.difficultyId = (this.registry.get(REGISTRY_DIFFICULTY) as DifficultyId | undefined) ?? DEFAULT_RUN.difficulty;

    this.buildBackdrop();
    this.buildHeader();
    this.buildModes();
    this.buildCharacters();
    this.buildBio();
    this.buildFooter();
    this.buildScores();
    this.bindKeys();
    this.refresh();

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  override update(time: number): void {
    for (let i = 0; i < this.cardViews.length; i++) {
      const view = this.cardViews[i];
      const selected = CHARACTER_IDS[i] === this.characterId;
      view.portrait.y = view.baseY + (selected ? Math.sin(time * 0.006) * 3 : 0);
    }
    this.bioPortrait.y = BIO_Y + BIO_H / 2 + Math.sin(time * 0.003) * 3;
    this.cursor.setAlpha(Math.sin(time * 0.012) > 0 ? 1 : 0);
    this.deployBg.setFillStyle(0x144a26, 0.8 + 0.2 * Math.sin(time * 0.005));
  }

  // ---------------------------------------------------------------- build

  private label(x: number, y: number, text: string, size: number, color = GREEN): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: MONO, fontSize: `${size}px`, fontStyle: 'bold', color, resolution: 2 });
  }

  private buildBackdrop(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, BG, 1).setOrigin(0, 0);
    const grid = this.add.graphics();
    grid.lineStyle(1, GRID_LINE, 1);
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 40) {
      grid.lineBetween(0, y, GAME_WIDTH, y);
    }
    const scan = this.add.graphics().setDepth(100);
    scan.fillStyle(0x000000, 0.18);
    for (let y = 0; y < GAME_HEIGHT; y += 4) {
      scan.fillRect(0, y, GAME_WIDTH, 2);
    }
  }

  private buildHeader(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, 96, PANEL, 1).setOrigin(0, 0);
    this.add.rectangle(0, 96, GAME_WIDTH, 3, 0x2fe06a, 1).setOrigin(0, 0);
    this.label(40, 16, 'STARSHIP SURVIVOR', 42, '#b7ffc9');
    this.label(42, 66, 'MOBILE INFANTRY // DEPLOYMENT TERMINAL // KLENDATHU THEATER', 14, DIM_GREEN);
    this.label(GAME_WIDTH - 40, 20, 'FED-NET LINK: SECURE', 14, GREEN).setOrigin(1, 0);
    this.cursor = this.label(GAME_WIDTH - 40, 44, 'AWAITING ORDERS_', 14, AMBER).setOrigin(1, 0);
    const sx = 800;
    const sbg = this.add.rectangle(sx, 24, 210, 48, 0x12301c, 1).setOrigin(0, 0).setStrokeStyle(2, 0xffd34a, 1);
    this.label(sx + 105, 48, 'HIGH SCORES [H]', 16, AMBER).setOrigin(0.5);
    sbg.setInteractive({ useHandCursor: true });
    sbg.on('pointerdown', () => this.toggleScores(true));
    this.label(MODE_X, 118, '[ 01 ] SELECT MISSION', 16, AMBER);
    this.label(CARD_X, 118, '[ 02 ] SELECT OPERATIVE', 16, AMBER);
  }

  private buildModes(): void {
    for (let i = 0; i < GAME_MODE_IDS.length; i++) {
      const id = GAME_MODE_IDS[i];
      const def = GAME_MODES[id];
      const y = MODE_Y + i * (MODE_H + MODE_GAP);
      const bg = this.add.rectangle(MODE_X, y, MODE_W, MODE_H, PANEL, 1).setOrigin(0, 0).setStrokeStyle(2, 0x1f5a36, 1);
      const marker = this.label(MODE_X + 14, y + 10, `${i + 1}`, 28, AMBER);
      const title = this.label(MODE_X + 52, y + 10, def.name.toUpperCase(), 22, '#d8ffe3');
      const tag = this.label(MODE_X + 52, y + 40, def.tagline, 14, '#' + def.accent.toString(16).padStart(6, '0'));
      const desc = this.label(MODE_X + 52, y + 64, def.description, 13, '#a9d9b8');
      desc.setWordWrapWidth(MODE_W - 70);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectMode(id));
      bg.on('pointerover', () => {
        if (this.modeId !== id) {
          bg.setFillStyle(0x12301c, 1);
        }
      });
      bg.on('pointerout', () => this.refresh());
      this.modeViews.push({ bg, title, tag, desc, marker });
    }
  }

  private buildCharacters(): void {
    for (let i = 0; i < CHARACTER_IDS.length; i++) {
      const id = CHARACTER_IDS[i];
      const def = CHARACTERS[id];
      const x = CARD_X + i * (CARD_W + CARD_GAP);
      const bg = this.add.rectangle(x, CARD_Y, CARD_W, CARD_H, PANEL, 1).setOrigin(0, 0).setStrokeStyle(2, 0x1f5a36, 1);
      const baseY = CARD_Y + 76;
      const portrait = this.add.image(x + CARD_W / 2, baseY, PORTRAIT_KEY).setScale(1.25);
      if (def.tint !== 0xffffff) {
        portrait.setTint(def.tint);
      }
      const parts = def.name.split(' ');
      const name = this.label(x + CARD_W / 2, CARD_Y + CARD_H - 40, `${parts[0]}\n${parts.slice(1).join(' ')}`, 14, '#d8ffe3')
        .setOrigin(0.5, 0)
        .setAlign('center');
      this.label(x + 8, CARD_Y + 6, `${i + 1}`, 14, DIM_GREEN);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectCharacter(id));
      bg.on('pointerover', () => {
        if (this.characterId !== id) {
          bg.setFillStyle(0x12301c, 1);
        }
      });
      bg.on('pointerout', () => this.refresh());
      this.cardViews.push({ bg, portrait, name, baseY });
    }
  }

  private buildBio(): void {
    this.add.rectangle(BIO_X, BIO_Y, BIO_W, BIO_H, PANEL, 1).setOrigin(0, 0).setStrokeStyle(2, 0x2fe06a, 1);
    this.bioFrame = this.add.rectangle(BIO_X + 20, BIO_Y + 20, 170, BIO_H - 40, 0x050c08, 1).setOrigin(0, 0).setStrokeStyle(2, 0x1f5a36, 1);
    this.bioPortrait = this.add.image(BIO_X + 105, BIO_Y + BIO_H / 2, PORTRAIT_KEY).setScale(1.9);

    const tx = BIO_X + 215;
    this.bioName = this.label(tx, BIO_Y + 16, '', 26, '#d8ffe3');
    this.bioRole = this.label(tx, BIO_Y + 50, '', 15, AMBER);
    this.bioText = this.label(tx, BIO_Y + 78, '', 14, '#a9d9b8').setWordWrapWidth(BIO_W - 235);
    this.bioPassives = this.label(tx, BIO_Y + 130, '', 15, '#b7ffc9').setWordWrapWidth(BIO_W - 235).setLineSpacing(4);
    this.bioLoadout = this.label(tx, BIO_Y + BIO_H - 36, '', 15, AMBER);
  }

  private buildFooter(): void {
    const y = GAME_HEIGHT - 128;
    this.add.rectangle(0, y, GAME_WIDTH, 3, 0x2fe06a, 1).setOrigin(0, 0);
    this.summary = this.label(40, y + 14, '', 16, GREEN).setLineSpacing(6);
    this.label(40, GAME_HEIGHT - 24, '1-3 MISSION  Q/E DIFFICULTY  LEFT/RIGHT OPERATIVE  H SCORES  ENTER DEPLOY', 13, DIM_GREEN);

    this.label(DIFF_X, y + 4, '[ 03 ] DIFFICULTY', 13, AMBER);
    for (let i = 0; i < DIFFICULTY_IDS.length; i++) {
      const id = DIFFICULTY_IDS[i];
      const def = DIFFICULTIES[id];
      const bx = DIFF_X + i * (DIFF_W + DIFF_GAP);
      const bg = this.add.rectangle(bx, y + 22, DIFF_W, 76, PANEL, 1).setOrigin(0, 0).setStrokeStyle(2, 0x1f5a36, 1);
      const name = this.label(bx + DIFF_W / 2, y + 40, def.name.toUpperCase(), 20, '#d8ffe3').setOrigin(0.5);
      const tag = this.label(bx + DIFF_W / 2, y + 72, def.tagline, 10, '#' + def.accent.toString(16).padStart(6, '0')).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectDifficulty(id));
      this.diffViews.push({ bg, name, tag });
    }

    const w = 340;
    const h = 76;
    const x = GAME_WIDTH - 40 - w;
    this.deployBg = this.add.rectangle(x, y + 22, w, h, 0x144a26, 1).setOrigin(0, 0).setStrokeStyle(3, 0x6dff7a, 1);
    this.deployText = this.label(x + w / 2, y + 22 + h / 2, 'DEPLOY >>', 30, '#eaffee').setOrigin(0.5);
    this.deployBg.setInteractive({ useHandCursor: true });
    this.deployBg.on('pointerdown', () => this.deploy());
  }

  private buildScores(): void {
    const px = 140;
    const py = 120;
    const pw = GAME_WIDTH - 280;
    const ph = 520;
    const layer: Phaser.GameObjects.GameObject[] = [];
    const blocker = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setOrigin(0, 0).setInteractive();
    const panel = this.add.rectangle(px, py, pw, ph, PANEL, 1).setOrigin(0, 0).setStrokeStyle(3, 0x2fe06a, 1);
    const title = this.label(px + 24, py + 16, 'HIGH SCORES // COMBAT LOG', 26, '#d8ffe3');
    const head = this.label(px + 24, py + 62, this.scoreLine('RK', 'KILLS', 'TIME', 'OPERATIVE', 'DIFF', 'MODE'), 16, AMBER);
    layer.push(blocker, panel, title, head);
    for (let i = 0; i < SCORE_ROWS; i++) {
      const row = this.label(px + 24, py + 98 + i * 33, '', 16, '#b7ffc9');
      this.scoreRows.push(row);
      layer.push(row);
    }
    const closeBg = this.add.rectangle(px + pw - 24 - 150, py + ph - 64, 150, 44, 0x144a26, 1).setOrigin(0, 0).setStrokeStyle(2, 0x6dff7a, 1);
    const closeText = this.label(closeBg.x + 75, closeBg.y + 22, 'CLOSE', 18, '#eaffee').setOrigin(0.5);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerdown', () => this.toggleScores(false));
    const clearBg = this.add.rectangle(px + 24, py + ph - 64, 190, 44, 0x4a1414, 1).setOrigin(0, 0).setStrokeStyle(2, 0xff6a5a, 1);
    const clearText = this.label(clearBg.x + 95, clearBg.y + 22, 'CLEAR RECORDS', 16, '#ffd0c8').setOrigin(0.5);
    clearBg.setInteractive({ useHandCursor: true });
    clearBg.on('pointerdown', () => {
      ScoreStore.clear();
      this.fillScores();
    });
    layer.push(closeBg, closeText, clearBg, clearText);
    for (let i = 0; i < layer.length; i++) {
      (layer[i] as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible)
        .setDepth(200)
        .setVisible(false);
    }
    this.scoreLayer = layer;
  }

  private scoreLine(rank: string, kills: string, time: string, who: string, diff: string, mode: string): string {
    return `${rank.padEnd(4)}${kills.padStart(6)}  ${time.padEnd(8)}${who.padEnd(18)}${diff.padEnd(9)}${mode}`;
  }

  private fillScores(): void {
    const list = ScoreStore.list();
    for (let i = 0; i < SCORE_ROWS; i++) {
      const e = i < list.length ? list[i] : undefined;
      if (!e) {
        this.scoreRows[i].setText(i === 0 ? 'NO RECORDS YET - DEPLOY AND SURVIVE.' : '');
        continue;
      }
      const m = Math.floor(e.timeSec / 60);
      const s = e.timeSec % 60;
      const time = `${m}:${s < 10 ? '0' : ''}${s}`;
      const who = CHARACTERS[e.character]?.name ?? e.character;
      const diff = DIFFICULTIES[e.difficulty]?.name ?? e.difficulty;
      const mode = (GAME_MODES[e.mode]?.name ?? e.mode) + (e.victory ? ' *' : '');
      this.scoreRows[i].setText(this.scoreLine(`${i + 1}.`, `${e.kills}`, time, who.slice(0, 17), diff, mode));
    }
  }

  private toggleScores(open: boolean): void {
    if (this.deploying) {
      return;
    }
    this.scoresOpen = open;
    if (open) {
      this.fillScores();
    }
    for (let i = 0; i < this.scoreLayer.length; i++) {
      (this.scoreLayer[i] as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible).setVisible(open);
    }
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) {
      return;
    }
    kb.on('keydown-ONE', () => this.selectMode(GAME_MODE_IDS[0]));
    kb.on('keydown-TWO', () => this.selectMode(GAME_MODE_IDS[1]));
    kb.on('keydown-THREE', () => this.selectMode(GAME_MODE_IDS[2]));
    kb.on('keydown-Q', () => this.stepDifficulty(-1));
    kb.on('keydown-E', () => this.stepDifficulty(1));
    kb.on('keydown-H', () => this.toggleScores(!this.scoresOpen));
    kb.on('keydown-ESC', () => this.toggleScores(false));
    kb.on('keydown-LEFT', () => this.stepCharacter(-1));
    kb.on('keydown-A', () => this.stepCharacter(-1));
    kb.on('keydown-RIGHT', () => this.stepCharacter(1));
    kb.on('keydown-D', () => this.stepCharacter(1));
    kb.on('keydown-ENTER', () => this.deploy());
    kb.on('keydown-SPACE', () => this.deploy());
  }

  // ---------------------------------------------------------------- state

  private selectMode(id: GameModeId): void {
    this.modeId = id;
    this.registry.set(REGISTRY_MODE, id);
    this.refresh();
  }

  private selectCharacter(id: CharacterId): void {
    this.characterId = id;
    this.registry.set(REGISTRY_CHARACTER, id);
    this.refresh();
  }

  private stepCharacter(dir: number): void {
    const n = CHARACTER_IDS.length;
    const next = (CHARACTER_IDS.indexOf(this.characterId) + dir + n) % n;
    this.selectCharacter(CHARACTER_IDS[next]);
  }

  private selectDifficulty(id: DifficultyId): void {
    this.difficultyId = id;
    this.registry.set(REGISTRY_DIFFICULTY, id);
    this.refresh();
  }

  private stepDifficulty(dir: number): void {
    const n = DIFFICULTY_IDS.length;
    this.selectDifficulty(DIFFICULTY_IDS[(DIFFICULTY_IDS.indexOf(this.difficultyId) + dir + n) % n]);
  }

  private deploy(): void {
    if (this.deploying || this.scoresOpen) {
      return;
    }
    this.deploying = true;
    const setup: RunSetup = { mode: this.modeId, character: this.characterId, difficulty: this.difficultyId };
    this.deployText.setText('DEPLOYING...');
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.GAME, setup);
    });
  }

  private refresh(): void {
    for (let i = 0; i < GAME_MODE_IDS.length; i++) {
      const view = this.modeViews[i];
      const def = GAME_MODES[GAME_MODE_IDS[i]];
      const selected = GAME_MODE_IDS[i] === this.modeId;
      view.bg.setFillStyle(selected ? 0x17402a : PANEL, 1).setStrokeStyle(selected ? 3 : 2, selected ? def.accent : 0x1f5a36, 1);
      view.marker.setColor(selected ? '#ffffff' : AMBER);
    }
    for (let i = 0; i < CHARACTER_IDS.length; i++) {
      const view = this.cardViews[i];
      const def = CHARACTERS[CHARACTER_IDS[i]];
      const selected = CHARACTER_IDS[i] === this.characterId;
      view.bg.setFillStyle(selected ? 0x17402a : PANEL, 1).setStrokeStyle(selected ? 3 : 2, selected ? def.accent : 0x1f5a36, 1);
      view.portrait.setAlpha(selected ? 1 : 0.55);
      view.name.setColor(selected ? '#ffffff' : '#7fb08e');
    }

    for (let i = 0; i < DIFFICULTY_IDS.length; i++) {
      const view = this.diffViews[i];
      const def = DIFFICULTIES[DIFFICULTY_IDS[i]];
      const selected = DIFFICULTY_IDS[i] === this.difficultyId;
      view.bg.setFillStyle(selected ? 0x17402a : PANEL, 1).setStrokeStyle(selected ? 3 : 2, selected ? def.accent : 0x1f5a36, 1);
      view.name.setColor(selected ? '#ffffff' : '#7fb08e');
    }

    const c = CHARACTERS[this.characterId];
    const m = GAME_MODES[this.modeId];
    const d = DIFFICULTIES[this.difficultyId];
    this.bioPortrait.setTexture(PORTRAIT_KEY);
    if (c.tint === 0xffffff) {
      this.bioPortrait.clearTint();
    } else {
      this.bioPortrait.setTint(c.tint);
    }
    this.bioFrame.setStrokeStyle(2, c.accent, 1);
    this.bioName.setText(c.name.toUpperCase());
    this.bioRole.setText(c.role.toUpperCase());
    this.bioText.setText(c.bio);
    this.bioPassives.setText(`PASSIVES\n${c.passives.map((p) => `> ${p}`).join('\n')}`);
    this.bioLoadout.setText(`STARTING WEAPON: ${c.loadoutName.toUpperCase()}`);
    this.summary.setText(`MISSION   : ${m.name.toUpperCase()}\nOPERATIVE : ${c.name.toUpperCase()}\nTHREAT    : ${d.name.toUpperCase()} - ${d.description}`);
    this.summary.setWordWrapWidth(DIFF_X - 60);
  }
}
