import Phaser from 'phaser';
import { ANIMS, FRAMES, SCENE_KEYS, TEXTURES, frameKey } from '../config/GameConfig';

interface BugStyle {
  scale: number;
  bulk: number;
  legPairs: number;
  body: number;
  bodyDark: number;
  highlight: number;
  stripe: number;
  leg: number;
  joint: number;
  eye: number;
  mandible: number;
  spikes: boolean;
  spike: number;
}

const WARRIOR_STYLE: BugStyle = {
  scale: 1,
  bulk: 1,
  legPairs: 3,
  body: 0xc9a15a,
  bodyDark: 0x8c6a30,
  highlight: 0xe8cf91,
  stripe: 0x15100a,
  leg: 0x2b1f10,
  joint: 0x120c05,
  eye: 0xff3b1f,
  mandible: 0x2a1c0c,
  spikes: false,
  spike: 0x000000,
};

const TIGER_STYLE: BugStyle = {
  scale: 1.35,
  bulk: 1.15,
  legPairs: 4,
  body: 0x93402a,
  bodyDark: 0x5a1c12,
  highlight: 0xc8644a,
  stripe: 0x0e0606,
  leg: 0x1d0d0a,
  joint: 0x9c1c10,
  eye: 0xffd21f,
  mandible: 0x120606,
  spikes: true,
  spike: 0xd8cfc0,
};

const TAU = Math.PI * 2;

export class BootScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private seed = 1337;

  constructor() {
    super(SCENE_KEYS.BOOT);
  }

  create(): void {
    this.gfx = this.make.graphics({ x: 0, y: 0 }, false);

    this.bakeTerrain();
    this.bakeTrooper();
    this.bakeBug(TEXTURES.WARRIOR, FRAMES.WARRIOR_SIZE, WARRIOR_STYLE);
    this.bakeBug(TEXTURES.TIGER, FRAMES.TIGER_SIZE, TIGER_STYLE);
    this.bakeEffects();
    this.bakeCombatEffects();
    this.bakeCrawl();
    this.bakePod();

    this.gfx.destroy();
    this.createAnimations();
    this.scene.start(SCENE_KEYS.MENU);
  }

  // ---------------------------------------------------------------- helpers

  private rand(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private range(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  private bake(key: string, width: number, height: number): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
    this.gfx.generateTexture(key, width, height);
    this.gfx.clear();
  }

  private star(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    outer: number,
    inner: number,
    points: number,
    rotation: number,
  ): void {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rotation + (i / (points * 2)) * TAU;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    g.fillPoints(pts, true, true);
  }

  // ---------------------------------------------------------------- terrain

  private bakeTerrain(): void {
    const g = this.gfx;
    const S = FRAMES.TILE_SIZE;
    this.seed = 4242;

    // Every feature is drawn 9 times (+/- one tile) so the texture wraps seamlessly.
    const wrapped = (fn: (ox: number, oy: number) => void): void => {
      for (let ox = -S; ox <= S; ox += S) {
        for (let oy = -S; oy <= S; oy += S) {
          fn(ox, oy);
        }
      }
    };

    g.fillStyle(0xd8b676, 1);
    g.fillRect(0, 0, S, S);

    for (let i = 0; i < 46; i++) {
      const x = this.range(0, S);
      const y = this.range(0, S);
      const w = this.range(50, 130);
      const h = this.range(30, 80);
      const color = i % 2 === 0 ? 0xe0c184 : 0xcfa968;
      wrapped((ox, oy) => {
        g.fillStyle(color, 0.28);
        g.fillEllipse(x + ox, y + oy, w, h);
      });
    }

    for (let i = 0; i < 30; i++) {
      const x = this.range(0, S);
      const y = this.range(0, S);
      const len = this.range(40, 100);
      const amp = this.range(2, 4);
      const freq = this.range(0.05, 0.1);
      const phase = this.range(0, TAU);
      wrapped((ox, oy) => {
        for (let pass = 0; pass < 2; pass++) {
          g.lineStyle(pass === 0 ? 2 : 1.5, pass === 0 ? 0xbf9a58 : 0xeed79d, pass === 0 ? 0.55 : 0.5);
          g.beginPath();
          for (let s = 0; s <= len; s += 4) {
            const px = x + ox + s;
            const py = y + oy + Math.sin(s * freq + phase) * amp - pass * 2.5;
            if (s === 0) {
              g.moveTo(px, py);
            } else {
              g.lineTo(px, py);
            }
          }
          g.strokePath();
        }
      });
    }

    for (let i = 0; i < 520; i++) {
      const x = this.range(0, S);
      const y = this.range(0, S);
      const r = this.range(0.6, 1.6);
      const color = i % 3 === 0 ? 0xf2dfaa : 0xb08c4c;
      wrapped((ox, oy) => {
        g.fillStyle(color, 0.65);
        g.fillCircle(x + ox, y + oy, r);
      });
    }

    for (let i = 0; i < 16; i++) {
      const x = this.range(0, S);
      const y = this.range(0, S);
      const w = this.range(5, 11);
      const h = w * this.range(0.6, 0.9);
      wrapped((ox, oy) => {
        g.fillStyle(0x6f5a36, 0.35);
        g.fillEllipse(x + ox + 1.5, y + oy + 2, w, h);
        g.fillStyle(0x9a8359, 1);
        g.fillEllipse(x + ox, y + oy, w, h);
        g.fillStyle(0xc2ac7d, 1);
        g.fillEllipse(x + ox - w * 0.15, y + oy - h * 0.2, w * 0.5, h * 0.4);
      });
    }

    this.bake(TEXTURES.TILE, S, S);
  }

  // ---------------------------------------------------------------- trooper

  private bakeTrooper(): void {
    const size = FRAMES.TROOPER_SIZE;
    const n = FRAMES.WALK_FRAMES;
    this.seed = 99;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      this.drawTrooper(t, false, i);
      this.bake(frameKey('trooper-walk', i), size, size);
      this.drawTrooper(t, true, i);
      this.bake(frameKey('trooper-fire', i), size, size);
    }
    this.drawTrooper(0, false, 0);
    this.bake(frameKey('trooper-idle', 0), size, size);
  }

  private drawTrooper(t: number, firing: boolean, frame: number): void {
    const g = this.gfx;
    const c = FRAMES.TROOPER_SIZE / 2;
    const swing = Math.sin(t);

    // Legs: boots swing fore/aft in opposite phase.
    for (let s = -1; s <= 1; s += 2) {
      const phase = s * swing;
      const hipY = c + s * 6;
      const footX = c - 2 + phase * 10;
      g.lineStyle(6, 0x46531f, 1);
      g.lineBetween(c - 2, hipY, footX, hipY + s * 1.5);
      g.fillStyle(0x4a5722, 1);
      g.fillCircle(c - 2, hipY, 3.5);
      g.fillStyle(0x17181a, 1);
      g.fillRoundedRect(footX - 4, hipY + s * 1.5 - 3.5, 12, 7, 3);
      g.fillStyle(0x30333a, 1);
      g.fillRoundedRect(footX - 2, hipY + s * 1.5 - 2, 6, 3, 1);
    }

    // Backpack and radio.
    g.fillStyle(0x2c2f33, 1);
    g.fillRoundedRect(c - 17, c - 10, 11, 20, 3);
    g.fillStyle(0x3d4247, 1);
    g.fillRoundedRect(c - 15, c - 8, 7, 16, 2);
    g.lineStyle(1.5, 0x15171a, 1);
    g.lineBetween(c - 16, c - 10, c - 20, c - 17);

    // Torso fatigues and chest rig.
    g.fillStyle(0x5b6b2c, 1);
    g.fillEllipse(c, c, 18, 31);
    g.fillStyle(0x3f4a1e, 1);
    g.fillEllipse(c + 1, c, 11, 21);
    g.fillStyle(0x23271a, 1);
    g.fillRoundedRect(c + 3, c - 8, 4, 5, 1);
    g.fillRoundedRect(c + 3, c + 3, 4, 5, 1);

    // Shoulder armor.
    for (let s = -1; s <= 1; s += 2) {
      g.fillStyle(0x34373c, 1);
      g.fillEllipse(c - 1, c + s * 12.5, 13, 10);
      g.fillStyle(0x5d626b, 1);
      g.fillEllipse(c - 2, c + s * 12.5 - s * 1.5, 7, 4);
    }

    // Arms to the rifle (right-handed shouldering).
    g.lineStyle(5, 0x586828, 1);
    g.lineBetween(c, c + 12, c + 9, c + 8);
    g.lineBetween(c + 9, c + 8, c + 9, c + 4);
    g.lineBetween(c, c - 12, c + 15, c - 4);
    g.lineBetween(c + 15, c - 4, c + 22, c + 1);

    // Morita assault rifle.
    g.fillStyle(0x2b2b2b, 1);
    g.fillRect(c + 2, c - 0.5, 9, 6);
    g.fillStyle(0x1b1b1d, 1);
    g.fillRect(c + 10, c - 1, 15, 6);
    g.fillStyle(0x3b3d41, 1);
    g.fillRect(c + 23, c, 12, 4);
    g.fillStyle(0x0f0f10, 1);
    g.fillRect(c + 34, c + 1, 6, 2);
    g.fillStyle(0x303236, 1);
    g.fillRect(c + 14, c + 5, 4, 7);
    g.fillStyle(0x6b6e75, 1);
    g.fillRect(c + 16, c - 2.5, 5, 1.5);
    g.fillStyle(0xb8892a, 1);
    g.fillRect(c + 12, c + 0.5, 2, 1);

    // Gloved hands.
    g.fillStyle(0x1e1f22, 1);
    g.fillCircle(c + 9, c + 4, 3);
    g.fillCircle(c + 23, c + 2, 3);

    // Combat helmet.
    g.fillStyle(0x3b3f45, 1);
    g.fillCircle(c - 1, c, 10);
    g.fillStyle(0x52575f, 1);
    g.fillCircle(c - 2, c - 1, 7);
    g.fillStyle(0x6a707a, 0.8);
    g.fillEllipse(c - 3, c - 3, 8, 4);
    g.lineStyle(1.5, 0x1b1d21, 1);
    g.strokeCircle(c - 1, c, 10);
    g.lineStyle(2, 0x5b6b2c, 1);
    g.lineBetween(c + 4, c - 8, c + 6, c + 8);
    g.fillStyle(0xcfd3d9, 1);
    g.fillRect(c - 6, c + 5, 4, 2);

    if (firing) {
      const mx = c + 41;
      const my = c + 2;
      const grow = 1 + (frame % 2) * 0.45;
      const rot = frame * 0.9;
      g.fillStyle(0xff8a1f, 0.35);
      g.fillCircle(mx, my, 9 * grow);
      g.fillStyle(0xff8a1f, 0.95);
      this.star(g, mx + 3, my, 11 * grow, 3.5, 6, rot);
      g.fillStyle(0xffe45a, 1);
      this.star(g, mx + 2, my, 7 * grow, 2.5, 5, rot + 0.5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(mx, my, 2.6);
    }
  }

  // ---------------------------------------------------------------- bugs

  private bakeBug(base: string, size: number, style: BugStyle): void {
    const n = FRAMES.WALK_FRAMES;
    for (let i = 0; i < n; i++) {
      this.drawBug(size, (i / n) * TAU, style);
      this.bake(frameKey(base, i), size, size);
    }
  }

  private drawBug(size: number, t: number, st: BugStyle): void {
    const g = this.gfx;
    const c = size / 2;
    const k = st.scale;
    const sway = Math.sin(t);

    // Jointed legs: tripod gait, angles driven by sin(time * speed).
    for (let i = 0; i < st.legPairs; i++) {
      const frac = st.legPairs === 1 ? 0.5 : i / (st.legPairs - 1);
      const ax = c + k * (15 - i * 8);
      const baseForward = 0.75 - frac * 1.3;
      for (let s = -1; s <= 1; s += 2) {
        const phase = (i + (s > 0 ? 1 : 0)) % 2 === 0 ? 0 : Math.PI;
        const f = baseForward + Math.sin(t + phase) * 0.45;
        const ay = c + s * 7 * k;
        const a1 = s * (Math.PI / 2 - f);
        const a2 = s * (Math.PI / 2 - f * 0.6 + 0.8);
        const kx = ax + Math.cos(a1) * 17 * k;
        const ky = ay + Math.sin(a1) * 17 * k;
        const fx = kx + Math.cos(a2) * 19 * k;
        const fy = ky + Math.sin(a2) * 19 * k;

        g.lineStyle(3.4 * k, st.leg, 1);
        g.lineBetween(ax, ay, kx, ky);
        g.lineStyle(2.2 * k, st.leg, 1);
        g.lineBetween(kx, ky, fx, fy);
        g.fillStyle(st.leg, 1);
        g.fillCircle(fx, fy, 1.6 * k);
        g.fillStyle(st.joint, 1);
        g.fillCircle(kx, ky, 2.4 * k);

        if (st.spikes) {
          const dir = (a1 + a2) / 2;
          const px = -Math.sin(dir);
          const py = Math.cos(dir);
          g.fillStyle(st.spike, 1);
          g.fillTriangle(
            kx + px * 2.4 * k,
            ky + py * 2.4 * k,
            kx - px * 2.4 * k,
            ky - py * 2.4 * k,
            kx + Math.cos(dir - s * 0.5) * 8 * k,
            ky + Math.sin(dir - s * 0.5) * 8 * k,
          );
        }
      }
    }

    // Segmented tiger-striped abdomen (rear first so front segments overlap).
    const segs = [
      { dx: -41, w: 12, h: 11 },
      { dx: -33, w: 16, h: 16 },
      { dx: -23, w: 19, h: 20 },
      { dx: -12, w: 20, h: 22 },
    ];
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      const x = c + sg.dx * k;
      const y = c + sway * (segs.length - i) * 0.7 * k;
      const w = sg.w * k;
      const h = sg.h * k * st.bulk;
      g.fillStyle(st.body, 1);
      g.fillEllipse(x, y, w, h);
      g.fillStyle(st.bodyDark, 1);
      g.fillEllipse(x - w * 0.18, y, w * 0.5, h * 0.95);
      g.fillStyle(st.body, 1);
      g.fillEllipse(x - w * 0.05, y, w * 0.7, h * 0.85);
      g.fillStyle(st.stripe, 1);
      g.fillEllipse(x - w * 0.12, y, w * 0.26, h * 0.92);
      g.fillStyle(st.stripe, 0.85);
      g.fillEllipse(x + w * 0.3, y - h * 0.1, w * 0.12, h * 0.7);
      g.lineStyle(1.3 * k, st.stripe, 1);
      g.strokeEllipse(x, y, w, h);
      g.fillStyle(st.highlight, 0.5);
      g.fillEllipse(x + w * 0.12, y - h * 0.28, w * 0.28, h * 0.14);

      if (st.spikes) {
        for (let s = -1; s <= 1; s += 2) {
          g.fillStyle(st.spike, 1);
          g.fillTriangle(
            x - w * 0.3,
            y + s * h * 0.42,
            x + w * 0.2,
            y + s * h * 0.42,
            x - w * 0.05,
            y + s * (h * 0.5 + 6 * k),
          );
        }
      }
    }
    const tailY = c + sway * 0.7 * k;
    g.fillStyle(st.stripe, 1);
    g.fillTriangle(c - 46 * k, tailY, c - 40 * k, tailY - 3.5 * k, c - 40 * k, tailY + 3.5 * k);

    // Curved armored thorax.
    g.fillStyle(st.bodyDark, 1);
    g.fillEllipse(c + 3 * k, c, 28 * k, 26 * k * st.bulk);
    g.fillStyle(st.body, 1);
    g.fillEllipse(c + 4 * k, c, 24 * k, 22 * k * st.bulk);
    g.lineStyle(2.2 * k, st.stripe, 1);
    g.beginPath();
    g.arc(c - 8 * k, c, 15 * k, -0.95, 0.95, false);
    g.strokePath();
    g.beginPath();
    g.arc(c - 1 * k, c, 15 * k, -0.85, 0.85, false);
    g.strokePath();
    g.lineStyle(1.4 * k, st.stripe, 1);
    g.lineBetween(c - 4 * k, c, c + 14 * k, c);
    g.fillStyle(st.highlight, 0.55);
    g.fillEllipse(c + 7 * k, c - 5 * k * st.bulk, 11 * k, 5 * k);

    if (st.spikes) {
      for (let s = -1; s <= 1; s += 2) {
        g.fillStyle(st.spike, 1);
        g.fillTriangle(
          c + 2 * k,
          c + s * 11 * k * st.bulk,
          c + 10 * k,
          c + s * 11 * k * st.bulk,
          c + 6 * k,
          c + s * (11 * k * st.bulk + 7 * k),
        );
      }
    }

    // Head, eyes, antennae.
    g.lineStyle(1.4 * k, st.leg, 1);
    for (let s = -1; s <= 1; s += 2) {
      g.lineBetween(c + 24 * k, c + s * 3 * k, c + 32 * k, c + s * 7 * k + sway * s * 1.5 * k);
      g.lineBetween(c + 32 * k, c + s * 7 * k + sway * s * 1.5 * k, c + 36 * k, c + s * 12 * k + sway * s * 2.5 * k);
    }
    g.fillStyle(st.bodyDark, 1);
    g.fillEllipse(c + 21 * k, c, 15 * k, 16 * k);
    g.fillStyle(st.body, 1);
    g.fillEllipse(c + 21 * k, c, 11 * k, 12 * k);
    for (let s = -1; s <= 1; s += 2) {
      g.fillStyle(st.eye, 1);
      g.fillCircle(c + 24 * k, c + s * 4.2 * k, 2 * k);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(c + 24.6 * k, c + s * 3.8 * k, 0.7 * k);
    }

    // Dual snapping mandibles (open/close at twice the gait frequency).
    const open = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2));
    for (let s = -1; s <= 1; s += 2) {
      const x0 = c + 26 * k;
      const y0 = c + s * 3.5 * k;
      const x1 = x0 + Math.cos(s * open) * 9 * k;
      const y1 = y0 + Math.sin(s * open) * 9 * k;
      const d2 = -s * (0.9 - open * 0.4);
      const x2 = x1 + Math.cos(d2) * 8 * k;
      const y2 = y1 + Math.sin(d2) * 8 * k;
      g.lineStyle(3.4 * k, st.mandible, 1);
      g.lineBetween(x0, y0, x1, y1);
      g.lineStyle(2.4 * k, st.mandible, 1);
      g.lineBetween(x1, y1, x2, y2);
      g.fillStyle(st.mandible, 1);
      g.fillCircle(x1, y1, 1.9 * k);
      g.fillStyle(0xe8e2d0, 1);
      g.fillCircle(x2, y2, 1.1 * k);
    }
  }

  // ---------------------------------------------------------------- effects

  private bakeEffects(): void {
    const g = this.gfx;
    this.seed = 777;

    // Bio-crystal XP gem with glow.
    const gs = 40;
    g.fillStyle(0x39ff14, 0.08);
    g.fillCircle(20, 20, 19);
    g.fillStyle(0x39ff14, 0.14);
    g.fillCircle(20, 20, 15);
    g.fillStyle(0x39ff14, 0.22);
    g.fillCircle(20, 20, 11);
    g.fillStyle(0x1ca83a, 1);
    g.fillPoints(
      [
        { x: 20, y: 4 },
        { x: 29, y: 15 },
        { x: 26, y: 29 },
        { x: 20, y: 36 },
        { x: 14, y: 29 },
        { x: 11, y: 15 },
      ],
      true,
      true,
    );
    g.fillStyle(0x9bffb4, 1);
    g.fillTriangle(20, 4, 11, 15, 20, 17);
    g.fillStyle(0x4cf07a, 1);
    g.fillTriangle(20, 4, 29, 15, 20, 17);
    g.fillStyle(0x23c04a, 1);
    g.fillTriangle(11, 15, 20, 17, 14, 29);
    g.fillStyle(0x1a9a3a, 1);
    g.fillTriangle(20, 17, 14, 29, 20, 36);
    g.fillStyle(0x2fd35a, 1);
    g.fillTriangle(20, 17, 29, 15, 26, 29);
    g.fillStyle(0x138a30, 1);
    g.fillTriangle(20, 17, 26, 29, 20, 36);
    g.lineStyle(1, 0x0b5a20, 1);
    g.strokePoints(
      [
        { x: 20, y: 4 },
        { x: 29, y: 15 },
        { x: 26, y: 29 },
        { x: 20, y: 36 },
        { x: 14, y: 29 },
        { x: 11, y: 15 },
      ],
      true,
      true,
    );
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(17, 11, 1.6);
    this.bake(TEXTURES.GEM, gs, gs);

    // Green alien blood splatter variants.
    for (let v = 0; v < FRAMES.BLOOD_VARIANTS; v++) {
      const bs = 64;
      const cx = bs / 2;
      g.fillStyle(0x4f9c14, 1);
      g.fillCircle(cx, cx, this.range(9, 12));
      const drops = 9 + v * 2;
      for (let i = 0; i < drops; i++) {
        const a = this.range(0, TAU);
        const d = this.range(11, 27);
        const r = this.range(1.8, 5.5);
        const x = cx + Math.cos(a) * d;
        const y = cx + Math.sin(a) * d;
        g.lineStyle(r * 0.9, 0x5fb61a, 1);
        g.lineBetween(cx + Math.cos(a) * 6, cx + Math.sin(a) * 6, x, y);
        g.fillStyle(i % 2 === 0 ? 0x6fd11f : 0x4f9c14, 1);
        g.fillCircle(x, y, r);
      }
      g.fillStyle(0x6fd11f, 1);
      g.fillCircle(cx - 1, cx - 1, 7);
      g.fillStyle(0xa6f03a, 0.9);
      g.fillCircle(cx - 3, cx - 3, 3);
      g.fillStyle(0x2f6a0c, 0.7);
      g.fillCircle(cx + 4, cx + 3, 2.5);
      this.bake(frameKey(TEXTURES.BLOOD, v), bs, bs);
    }

    // Rifle tracer.
    g.fillStyle(0xffb020, 0.25);
    g.fillEllipse(14, 5, 28, 10);
    g.fillStyle(0xffd34a, 1);
    g.fillEllipse(15, 5, 22, 4);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(18, 5, 12, 2);
    this.bake(TEXTURES.BULLET, 28, 10);

    // Plasma drone.
    g.fillStyle(0x58ffd4, 0.12);
    g.fillCircle(18, 18, 17);
    g.fillStyle(0x58ffd4, 0.22);
    g.fillCircle(18, 18, 13);
    g.fillStyle(0x3b4650, 1);
    g.fillCircle(18, 18, 10);
    g.lineStyle(2, 0x8da0ad, 1);
    g.strokeCircle(18, 18, 10);
    g.fillStyle(0x58ffd4, 1);
    g.fillCircle(18, 18, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(16, 16, 2.2);
    this.bake(TEXTURES.DRONE, 36, 36);

    // Soft particle dot.
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 2.5);
    this.bake(TEXTURES.PIXEL, 8, 8);

    // Ground shadow.
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(36, 18, 72, 36);
    g.fillStyle(0x000000, 0.16);
    g.fillEllipse(36, 18, 56, 28);
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(36, 18, 40, 20);
    this.bake(TEXTURES.SHADOW, 72, 36);
  }

  // ---------------------------------------------------------------- weapons, squad, pod

  private bakeCombatEffects(): void {
    const g = this.gfx;
    this.seed = 4242;

    // Shotgun pellet.
    g.fillStyle(0xffb020, 0.3);
    g.fillCircle(6, 6, 6);
    g.fillStyle(0xffd34a, 1);
    g.fillCircle(6, 6, 3.4);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5.4, 5.4, 1.6);
    this.bake(TEXTURES.PELLET, 12, 12);

    // Flame puff (additive-blended at runtime).
    g.fillStyle(0xff5a10, 0.22);
    g.fillCircle(20, 20, 19);
    g.fillStyle(0xff7a1a, 0.4);
    g.fillCircle(20, 20, 14);
    g.fillStyle(0xffb52a, 0.7);
    g.fillCircle(20, 20, 10);
    g.fillStyle(0xffe680, 0.95);
    g.fillCircle(20, 20, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(19, 19, 2.6);
    this.bake(TEXTURES.FLAME, 40, 40);

    // Explosion fireball with ragged lobes.
    const fc = 64;
    g.fillStyle(0xff5a10, 0.18);
    g.fillCircle(fc, fc, 62);
    g.fillStyle(0xff7a1a, 0.3);
    g.fillCircle(fc, fc, 54);
    for (let i = 0; i < 9; i++) {
      const a = this.range(0, TAU);
      const d = this.range(26, 40);
      g.fillStyle(i % 2 === 0 ? 0xff8a2a : 0xffa02a, 0.6);
      g.fillCircle(fc + Math.cos(a) * d, fc + Math.sin(a) * d, this.range(12, 20));
    }
    g.fillStyle(0xffa02a, 0.6);
    g.fillCircle(fc, fc, 42);
    g.fillStyle(0xffd04a, 0.85);
    g.fillCircle(fc, fc, 30);
    g.fillStyle(0xfff3b0, 1);
    g.fillCircle(fc, fc, 19);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(fc, fc, 9);
    this.bake(TEXTURES.FIREBALL, 128, 128);

    // Scorched crater decal.
    const cc = 56;
    g.fillStyle(0x000000, 0.22);
    g.fillCircle(cc, cc, 54);
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(cc, cc, 44);
    g.fillStyle(0x1a120a, 0.9);
    g.fillCircle(cc, cc, 34);
    g.lineStyle(5, 0x7a5f36, 0.85);
    g.strokeCircle(cc, cc, 36);
    g.lineStyle(2, 0xb79258, 0.5);
    g.strokeCircle(cc, cc, 39);
    g.fillStyle(0x0b0704, 1);
    g.fillCircle(cc, cc, 23);
    g.lineStyle(2, 0x050302, 0.9);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + this.range(-0.2, 0.2);
      g.lineBetween(cc + Math.cos(a) * 18, cc + Math.sin(a) * 18, cc + Math.cos(a) * this.range(40, 52), cc + Math.sin(a) * this.range(40, 52));
    }
    for (let i = 0; i < 14; i++) {
      const a = this.range(0, TAU);
      const d = this.range(38, 52);
      g.fillStyle(0x2a1d0e, 0.9);
      g.fillCircle(cc + Math.cos(a) * d, cc + Math.sin(a) * d, this.range(1.5, 3.5));
    }
    this.bake(TEXTURES.CRATER, 112, 112);

    // Mini rocket, pointing right.
    g.fillStyle(0xff7a1a, 0.9);
    g.fillTriangle(10, 8, 0, 3, 0, 13);
    g.fillStyle(0xffe680, 1);
    g.fillTriangle(10, 8, 3, 6, 3, 10);
    g.fillStyle(0x8c1d14, 1);
    g.fillTriangle(8, 8, 14, 0, 14, 5);
    g.fillTriangle(8, 8, 14, 16, 14, 11);
    g.fillStyle(0xb9bcc2, 1);
    g.fillRoundedRect(9, 4, 22, 8, 3);
    g.fillStyle(0xe4e7ec, 1);
    g.fillRect(11, 5, 18, 2);
    g.fillStyle(0x7d828a, 1);
    g.fillRect(11, 10, 18, 2);
    g.fillStyle(0xffc400, 1);
    g.fillRect(18, 4, 3, 8);
    g.fillStyle(0xd8372f, 1);
    g.fillTriangle(30, 3.5, 30, 12.5, 39, 8);
    g.fillStyle(0xff8a80, 1);
    g.fillTriangle(30, 3.5, 30, 6, 37, 7.6);
    this.bake(TEXTURES.ROCKET, 40, 16);
  }

  private bakeCrawl(): void {
    const size = FRAMES.TROOPER_SIZE;
    const n = FRAMES.WALK_FRAMES;
    const c = size / 2;
    const g = this.gfx;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const sw = Math.sin(t);

      // Legs trail behind, dragging with a slow wiggle.
      for (let s = -1; s <= 1; s += 2) {
        const wig = Math.sin(t + (s > 0 ? Math.PI : 0)) * 3;
        g.lineStyle(6, 0x46531f, 1);
        g.lineBetween(c - 8, c + s * 5, c - 30, c + s * 6 + wig);
        g.fillStyle(0x17181a, 1);
        g.fillRoundedRect(c - 38, c + s * 6 + wig - 3.5, 11, 7, 3);
      }

      // Backpack and a bandaged torso.
      g.fillStyle(0x2c2f33, 1);
      g.fillRoundedRect(c - 18, c - 9, 12, 18, 3);
      g.fillStyle(0x5b6b2c, 1);
      g.fillEllipse(c, c, 22, 30);
      g.fillStyle(0x3f4a1e, 1);
      g.fillEllipse(c + 1, c, 13, 20);
      g.fillStyle(0xe8e8e8, 1);
      g.fillRect(c - 3, c - 7, 7, 3);
      g.fillStyle(0xd8372f, 1);
      g.fillRect(c - 1, c - 8, 3, 6);
      g.fillRect(c - 3, c - 6.5, 7, 3);

      // Arms haul the body forward alternately.
      for (let s = -1; s <= 1; s += 2) {
        const reach = Math.sin(t + (s > 0 ? Math.PI : 0));
        const hx = c + 20 + reach * 9;
        const hy = c + s * 9;
        g.lineStyle(5, 0x586828, 1);
        g.lineBetween(c + 3, c + s * 11, hx, hy);
        g.fillStyle(0x1e1f22, 1);
        g.fillCircle(hx, hy, 3.2);
      }

      // Helmet, dropped forward.
      g.fillStyle(0x3b3f45, 1);
      g.fillCircle(c + 8 + sw * 0.8, c, 10);
      g.fillStyle(0x52575f, 1);
      g.fillCircle(c + 7 + sw * 0.8, c - 1, 7);
      g.lineStyle(1.5, 0x1b1d21, 1);
      g.strokeCircle(c + 8 + sw * 0.8, c, 10);
      this.bake(frameKey(TEXTURES.CRAWL, i), size, size);
    }
  }

  private bakePod(): void {
    const g = this.gfx;
    const c = 56;
    this.seed = 31337;

    // Scorched impact ground.
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(c, c, 54);
    g.fillStyle(0x1a120a, 0.5);
    g.fillCircle(c, c, 42);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.lineStyle(2, 0x2a1d0e, 0.6);
      g.lineBetween(c + Math.cos(a) * 38, c + Math.sin(a) * 38, c + Math.cos(a) * this.range(48, 55), c + Math.sin(a) * this.range(48, 55));
    }

    // Tilted capsule hull.
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(c + 4, c + 6, 74, 52);
    g.fillStyle(0x3b3f45, 1);
    g.fillEllipse(c, c, 74, 52);
    g.fillStyle(0x6b7078, 1);
    g.fillEllipse(c - 1, c - 1, 68, 46);
    g.fillStyle(0x8a9099, 1);
    g.fillEllipse(c - 6, c - 8, 44, 16);
    g.lineStyle(2, 0x2a2d32, 1);
    g.lineBetween(c - 16, c - 22, c - 16, c + 22);
    g.lineBetween(c + 14, c - 21, c + 14, c + 21);
    g.fillStyle(0x2a2d32, 1);
    for (let i = 0; i < 5; i++) {
      g.fillCircle(c - 28 + i * 3, c - 14 + i * 7, 1.4);
    }

    // Hatch with hazard stripes.
    g.fillStyle(0x23262b, 1);
    g.fillRoundedRect(c - 10, c - 13, 26, 26, 4);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 === 0 ? 0xffc400 : 0x1b1b1b, 1);
      g.fillRect(c - 8 + i * 5, c - 11, 5, 4);
      g.fillRect(c - 8 + i * 5, c + 7, 5, 4);
    }
    g.fillStyle(0x4a4f57, 1);
    g.fillRoundedRect(c - 6, c - 6, 18, 12, 3);
    g.fillStyle(0xffc400, 1);
    g.fillRect(c + 2, c - 2, 7, 4);

    // Scorched thruster nozzle and antenna mast.
    g.fillStyle(0x15171a, 1);
    g.fillCircle(c - 30, c, 8);
    g.fillStyle(0x6a2a10, 1);
    g.fillCircle(c - 30, c, 5);
    g.lineStyle(2, 0x1b1d21, 1);
    g.lineBetween(c + 20, c - 18, c + 30, c - 34);
    g.fillStyle(0x3b3f45, 1);
    g.fillCircle(c + 30, c - 34, 3);
    this.bake(TEXTURES.POD, 112, 112);
  }

  // ---------------------------------------------------------------- animations

  private createAnimations(): void {
    const n = FRAMES.WALK_FRAMES;
    const sequence = (base: string): Phaser.Types.Animations.AnimationFrame[] => {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < n; i++) {
        frames.push({ key: frameKey(base, i) });
      }
      return frames;
    };
    const define = (key: string, frames: Phaser.Types.Animations.AnimationFrame[], frameRate: number): void => {
      if (this.anims.exists(key)) {
        this.anims.remove(key);
      }
      this.anims.create({ key, frames, frameRate, repeat: -1 });
    };

    define(ANIMS.TROOPER_WALK, sequence('trooper-walk'), 14);
    define(ANIMS.TROOPER_FIRE, sequence('trooper-fire'), 14);
    define(ANIMS.TROOPER_IDLE, [{ key: frameKey('trooper-idle', 0) }], 1);
    define(ANIMS.WARRIOR_WALK, sequence(TEXTURES.WARRIOR), 16);
    define(ANIMS.TIGER_WALK, sequence(TEXTURES.TIGER), 12);
  }
}
