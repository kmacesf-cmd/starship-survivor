import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TEXTURES } from '../config/GameConfig';
import { Arena, ArenaShape } from './Arena';

const POST_SPACING = 90;
const SIGN_SPACING = 420;
const OUTSIDE_DEPTH = 2000;
const VIEW_PAD = 140;
const CIRCLE_STEPS = 220;
const TAU = Math.PI * 2;

/**
 * Draws the outpost perimeter: shaded no-man's-land, a red tactical boundary line, and electrified barbed-wire fence
 * posts. One Graphics object is redrawn each frame (only the on-screen stretch), and warning signs are placed once.
 */
export class ArenaRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly signs: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly arena: Arena,
  ) {
    this.gfx = scene.add.graphics().setDepth(3);
    this.placeSigns();
  }

  private placeSigns(): void {
    const a = this.arena;
    const s = a.size;
    if (a.shape === ArenaShape.Circle) {
      const count = Math.max(8, Math.round((TAU * s) / SIGN_SPACING));
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * TAU;
        const img = this.scene.add.image(Math.cos(ang) * (s - 46), Math.sin(ang) * (s - 46), TEXTURES.SIGN).setDepth(4);
        img.setRotation(ang + Math.PI / 2);
        this.signs.push(img);
      }
      return;
    }
    for (let t = -s + SIGN_SPACING / 2; t < s; t += SIGN_SPACING) {
      this.signs.push(this.scene.add.image(t, -s + 46, TEXTURES.SIGN).setDepth(4).setRotation(0));
      this.signs.push(this.scene.add.image(t, s - 46, TEXTURES.SIGN).setDepth(4).setRotation(Math.PI));
      this.signs.push(this.scene.add.image(-s + 46, t, TEXTURES.SIGN).setDepth(4).setRotation(-Math.PI / 2));
      this.signs.push(this.scene.add.image(s - 46, t, TEXTURES.SIGN).setDepth(4).setRotation(Math.PI / 2));
    }
  }

  /** Redraws the visible part of the perimeter. Call once per frame after the camera has scrolled. */
  draw(cam: Phaser.Cameras.Scene2D.Camera, time: number): void {
    const g = this.gfx;
    g.clear();
    const s = this.arena.size;
    const left = cam.scrollX - VIEW_PAD;
    const top = cam.scrollY - VIEW_PAD;
    const right = cam.scrollX + GAME_WIDTH + VIEW_PAD;
    const bottom = cam.scrollY + GAME_HEIGHT + VIEW_PAD;
    const pulse = 0.55 + 0.35 * Math.sin(time * 0.006);

    if (this.arena.shape === ArenaShape.Circle) {
      this.drawCircle(g, s, left, top, right, bottom, pulse, time);
      return;
    }

    // Nothing of the perimeter can be on screen yet.
    if (left > -s + 400 && right < s - 400 && top > -s + 400 && bottom < s - 400) {
      return;
    }

    g.fillStyle(0x1a0a05, 0.55);
    g.fillRect(-s - OUTSIDE_DEPTH, -s - OUTSIDE_DEPTH, 2 * s + 2 * OUTSIDE_DEPTH, OUTSIDE_DEPTH);
    g.fillRect(-s - OUTSIDE_DEPTH, s, 2 * s + 2 * OUTSIDE_DEPTH, OUTSIDE_DEPTH);
    g.fillRect(-s - OUTSIDE_DEPTH, -s, OUTSIDE_DEPTH, 2 * s);
    g.fillRect(s, -s, OUTSIDE_DEPTH, 2 * s);

    g.fillStyle(0xff2a2a, 0.12 * pulse);
    g.fillRect(-s, -s, 2 * s, 70);
    g.fillRect(-s, s - 70, 2 * s, 70);
    g.fillRect(-s, -s + 70, 70, 2 * s - 140);
    g.fillRect(s - 70, -s + 70, 70, 2 * s - 140);

    g.lineStyle(5, 0xff2a2a, pulse);
    g.strokeRect(-s, -s, 2 * s, 2 * s);

    const x0 = Math.max(-s, Math.floor(left / POST_SPACING) * POST_SPACING);
    const x1 = Math.min(s, right);
    const y0 = Math.max(-s, Math.floor(top / POST_SPACING) * POST_SPACING);
    const y1 = Math.min(s, bottom);
    if (top < -s + 120 && bottom > -s - 120) {
      this.fenceLine(g, x0, -s + 14, x1, -s + 14, time);
    }
    if (bottom > s - 120 && top < s + 120) {
      this.fenceLine(g, x0, s - 14, x1, s - 14, time);
    }
    if (left < -s + 120 && right > -s - 120) {
      this.fenceLine(g, -s + 14, y0, -s + 14, y1, time);
    }
    if (right > s - 120 && left < s + 120) {
      this.fenceLine(g, s - 14, y0, s - 14, y1, time);
    }
  }

  private drawCircle(
    g: Phaser.GameObjects.Graphics,
    s: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
    pulse: number,
    time: number,
  ): void {
    const edgeNear = (px: number, py: number): boolean => px > left - 160 && px < right + 160 && py > top - 160 && py < bottom + 160;
    g.lineStyle(OUTSIDE_DEPTH, 0x1a0a05, 0.55);
    g.beginPath();
    g.arc(0, 0, s + OUTSIDE_DEPTH / 2, 0, TAU);
    g.strokePath();
    g.lineStyle(5, 0xff2a2a, pulse);
    g.strokeCircle(0, 0, s);

    const step = TAU / CIRCLE_STEPS;
    let prevX = 0;
    let prevY = 0;
    let havePrev = false;
    for (let i = 0; i <= CIRCLE_STEPS; i++) {
      const a = i * step;
      const px = Math.cos(a) * (s - 14);
      const py = Math.sin(a) * (s - 14);
      if (!edgeNear(px, py)) {
        havePrev = false;
        continue;
      }
      if (havePrev) {
        this.wire(g, prevX, prevY, px, py, time, i);
      }
      if (i % 2 === 0) {
        this.post(g, px, py, time, i);
      }
      prevX = px;
      prevY = py;
      havePrev = true;
    }
  }

  private fenceLine(
    g: Phaser.GameObjects.Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    time: number,
  ): void {
    const horizontal = y0 === y1;
    const from = horizontal ? x0 : y0;
    const to = horizontal ? x1 : y1;
    const end = this.arena.size - 14;
    let k = 0;
    for (let t = Math.ceil(from / POST_SPACING) * POST_SPACING; t <= to; t += POST_SPACING) {
      const px = horizontal ? t : x0;
      const py = horizontal ? y0 : t;
      this.post(g, px, py, time, k);
      const nt = Math.min(t + POST_SPACING, end);
      if (nt > t) {
        this.wire(g, px, py, horizontal ? nt : px, horizontal ? py : nt, time, k);
      }
      k++;
    }
  }

  private post(g: Phaser.GameObjects.Graphics, x: number, y: number, time: number, k: number): void {
    g.fillStyle(0x2a2d31, 1);
    g.fillRect(x - 4, y - 4, 8, 8);
    g.fillStyle(0x7d828a, 1);
    g.fillRect(x - 2, y - 2, 4, 4);
    const lit = Math.sin(time * 0.01 + k * 1.7) > 0.2;
    g.fillStyle(lit ? 0xff3b2f : 0x5a1410, 1);
    g.fillCircle(x, y - 8, 3);
  }

  /** Two strands of barbed wire between posts with a crackling electric arc. */
  private wire(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, time: number, k: number): void {
    g.lineStyle(2, 0x9aa0a8, 0.95);
    g.lineBetween(x0, y0 - 5, x1, y1 - 5);
    g.lineBetween(x0, y0 + 5, x1, y1 + 5);
    g.lineStyle(1, 0x6b7077, 1);
    for (let b = 1; b < 4; b++) {
      const t = b / 4;
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      g.lineBetween(bx - 3, by - 8, bx + 3, by - 2);
      g.lineBetween(bx + 3, by - 8, bx - 3, by - 2);
    }
    const flicker = Math.sin(time * 0.05 + k * 2.3);
    if (flicker > 0.15) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      g.lineStyle(2, 0x8fe8ff, 0.5 + 0.4 * flicker);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(mx + Math.sin(time * 0.09 + k) * 6, my + 4);
      g.lineTo(x1, y1);
      g.strokePath();
    }
  }
}
