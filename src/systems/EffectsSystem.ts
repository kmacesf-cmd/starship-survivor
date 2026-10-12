import Phaser from 'phaser';
import { TEXTURES } from '../config/GameConfig';

const MAX_PARTICLES = 220;
const MAX_RINGS = 40;
const MAX_BOLTS = 48;
const MAX_CRATERS = 28;
const CRATER_LIFE = 16;
const CRATER_FADE = 4;
const PARTICLE_DRAG = 2.2;
const BOLT_FLICKER_SEC = 0.04;
const TAU = Math.PI * 2;

const hash = (a: number, b: number, c: number): number => {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Pooled visual effects: sprite particles, expanding rings, jagged lightning, crater decals and one shared
 * Graphics layer that other systems may draw on each frame. Nothing here allocates after construction.
 */
export class EffectsSystem {
  /** Cleared by begin() every frame; systems draw bars, markers and beams onto it. */
  readonly gfx: Phaser.GameObjects.Graphics;

  private readonly particles: Phaser.GameObjects.Image[] = [];
  private readonly pVx = new Float32Array(MAX_PARTICLES);
  private readonly pVy = new Float32Array(MAX_PARTICLES);
  private readonly pAge = new Float32Array(MAX_PARTICLES);
  private readonly pLife = new Float32Array(MAX_PARTICLES);
  private readonly pS0 = new Float32Array(MAX_PARTICLES);
  private readonly pS1 = new Float32Array(MAX_PARTICLES);
  private readonly pA0 = new Float32Array(MAX_PARTICLES);
  private pCursor = 0;

  private readonly rActive = new Uint8Array(MAX_RINGS);
  private readonly rX = new Float32Array(MAX_RINGS);
  private readonly rY = new Float32Array(MAX_RINGS);
  private readonly rR0 = new Float32Array(MAX_RINGS);
  private readonly rR1 = new Float32Array(MAX_RINGS);
  private readonly rAge = new Float32Array(MAX_RINGS);
  private readonly rLife = new Float32Array(MAX_RINGS);
  private readonly rColor = new Uint32Array(MAX_RINGS);
  private readonly rWidth = new Float32Array(MAX_RINGS);
  private rCursor = 0;

  private readonly bActive = new Uint8Array(MAX_BOLTS);
  private readonly bX0 = new Float32Array(MAX_BOLTS);
  private readonly bY0 = new Float32Array(MAX_BOLTS);
  private readonly bX1 = new Float32Array(MAX_BOLTS);
  private readonly bY1 = new Float32Array(MAX_BOLTS);
  private readonly bAge = new Float32Array(MAX_BOLTS);
  private readonly bLife = new Float32Array(MAX_BOLTS);
  private readonly bColor = new Uint32Array(MAX_BOLTS);
  private readonly bWidth = new Float32Array(MAX_BOLTS);
  private readonly bSeed = new Float32Array(MAX_BOLTS);
  private bCursor = 0;

  private readonly craters: Phaser.GameObjects.Image[] = [];
  private readonly cAge = new Float32Array(MAX_CRATERS);
  private cCursor = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_CRATERS; i++) {
      this.craters.push(scene.add.image(0, 0, TEXTURES.CRATER).setDepth(1.5).setActive(false).setVisible(false));
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push(scene.add.image(0, 0, TEXTURES.PIXEL).setDepth(30).setActive(false).setVisible(false));
    }
    this.gfx = scene.add.graphics().setDepth(31);
  }

  reset(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].setActive(false).setVisible(false);
    }
    for (let i = 0; i < MAX_CRATERS; i++) {
      this.craters[i].setActive(false).setVisible(false);
    }
    this.rActive.fill(0);
    this.bActive.fill(0);
    this.gfx.clear();
  }

  /** Starts a frame: wipes the shared graphics layer. */
  begin(): void {
    this.gfx.clear();
  }

  /** Advances every effect by dt seconds and draws rings and bolts onto the shared layer. */
  update(dt: number): void {
    this.updateParticles(dt);
    this.updateCraters(dt);
    this.drawRings(dt);
    this.drawBolts(dt);
  }

  // ---------------------------------------------------------------- spawning

  emit(
    texture: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    scaleFrom: number,
    scaleTo: number,
    alpha: number,
    tint: number,
    additive: boolean,
    rotation: number,
  ): void {
    let slot = -1;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const idx = (this.pCursor + i) % MAX_PARTICLES;
      if (!this.particles[idx].active) {
        slot = idx;
        break;
      }
    }
    if (slot === -1) {
      slot = this.pCursor;
    }
    this.pCursor = (slot + 1) % MAX_PARTICLES;

    const img = this.particles[slot];
    img.setActive(true).setVisible(true);
    img.setTexture(texture);
    img.setPosition(x, y);
    img.setRotation(rotation);
    img.setScale(scaleFrom);
    img.setAlpha(alpha);
    img.setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (tint === 0xffffff) {
      img.clearTint();
    } else {
      img.setTint(tint);
    }
    this.pVx[slot] = vx;
    this.pVy[slot] = vy;
    this.pAge[slot] = 0;
    this.pLife[slot] = life;
    this.pS0[slot] = scaleFrom;
    this.pS1[slot] = scaleTo;
    this.pA0[slot] = alpha;
  }

  /** Expanding ring from radius r0 to r1. */
  ring(x: number, y: number, r0: number, r1: number, life: number, color: number, width: number): void {
    let slot = this.rCursor;
    for (let i = 0; i < MAX_RINGS; i++) {
      const idx = (this.rCursor + i) % MAX_RINGS;
      if (this.rActive[idx] === 0) {
        slot = idx;
        break;
      }
    }
    this.rCursor = (slot + 1) % MAX_RINGS;
    this.rActive[slot] = 1;
    this.rX[slot] = x;
    this.rY[slot] = y;
    this.rR0[slot] = r0;
    this.rR1[slot] = r1;
    this.rAge[slot] = 0;
    this.rLife[slot] = life;
    this.rColor[slot] = color;
    this.rWidth[slot] = width;
  }

  /** Jagged lightning bolt that flickers while it fades. */
  bolt(x0: number, y0: number, x1: number, y1: number, life: number, color: number, width: number): void {
    let slot = this.bCursor;
    for (let i = 0; i < MAX_BOLTS; i++) {
      const idx = (this.bCursor + i) % MAX_BOLTS;
      if (this.bActive[idx] === 0) {
        slot = idx;
        break;
      }
    }
    this.bCursor = (slot + 1) % MAX_BOLTS;
    this.bActive[slot] = 1;
    this.bX0[slot] = x0;
    this.bY0[slot] = y0;
    this.bX1[slot] = x1;
    this.bY1[slot] = y1;
    this.bAge[slot] = 0;
    this.bLife[slot] = life;
    this.bColor[slot] = color;
    this.bWidth[slot] = width;
    this.bSeed[slot] = Math.random() * 100;
  }

  /** Scorch decal that lingers and fades. */
  crater(x: number, y: number, scale: number): void {
    let slot = this.cCursor;
    for (let i = 0; i < MAX_CRATERS; i++) {
      const idx = (this.cCursor + i) % MAX_CRATERS;
      if (!this.craters[idx].active) {
        slot = idx;
        break;
      }
    }
    this.cCursor = (slot + 1) % MAX_CRATERS;
    const img = this.craters[slot];
    img.setActive(true).setVisible(true);
    img.setPosition(x, y);
    img.setRotation(Math.random() * TAU);
    img.setScale(scale);
    img.setAlpha(0.95);
    this.cAge[slot] = 0;
  }

  /** Fireball, shockwave, smoke and sparks sized to a blast radius. */
  explosion(x: number, y: number, radius: number, big: boolean): void {
    const finalScale = (radius * 2.2) / 128;
    this.emit(TEXTURES.FIREBALL, x, y, 0, 0, big ? 0.6 : 0.42, finalScale * 0.3, finalScale, 1, 0xffffff, true, Math.random() * TAU);
    if (big) {
      this.emit(TEXTURES.FIREBALL, x, y, 0, 0, 0.35, finalScale * 0.6, finalScale * 1.5, 0.9, 0xffffff, true, 0);
      this.ring(x, y, radius * 0.2, radius * 1.15, 0.6, 0xffffff, 10);
    }
    this.ring(x, y, radius * 0.3, radius * 1.05, 0.38, 0xffd27a, 6);

    const smoke = big ? 18 : 9;
    for (let i = 0; i < smoke; i++) {
      const a = Math.random() * TAU;
      const sp = (0.25 + Math.random() * 0.75) * radius * 0.9;
      this.emit(TEXTURES.PIXEL, x + Math.cos(a) * radius * 0.2, y + Math.sin(a) * radius * 0.2, Math.cos(a) * sp, Math.sin(a) * sp, 0.9 + Math.random() * 0.6, 1.2, 3.4 + Math.random() * 2.4, 0.55, 0x3a3630, false, 0);
    }
    const sparks = big ? 22 : 11;
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * TAU;
      const sp = 160 + Math.random() * 360;
      this.emit(TEXTURES.PIXEL, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.35 + Math.random() * 0.35, 0.8, 0.1, 1, i % 2 === 0 ? 0xffb020 : 0xffe680, true, 0);
    }
  }

  // ---------------------------------------------------------------- updates

  private updateParticles(dt: number): void {
    const damp = Math.max(0, 1 - PARTICLE_DRAG * dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const img = this.particles[i];
      if (!img.active) {
        continue;
      }
      const age = this.pAge[i] + dt;
      const life = this.pLife[i];
      if (age >= life) {
        img.setActive(false).setVisible(false);
        continue;
      }
      this.pAge[i] = age;
      const t = age / life;
      this.pVx[i] *= damp;
      this.pVy[i] *= damp;
      img.setPosition(img.x + this.pVx[i] * dt, img.y + this.pVy[i] * dt);
      img.setScale(this.pS0[i] + (this.pS1[i] - this.pS0[i]) * t);
      img.setAlpha(this.pA0[i] * (1 - t * t));
    }
  }

  private updateCraters(dt: number): void {
    for (let i = 0; i < MAX_CRATERS; i++) {
      const img = this.craters[i];
      if (!img.active) {
        continue;
      }
      const age = this.cAge[i] + dt;
      this.cAge[i] = age;
      if (age >= CRATER_LIFE) {
        img.setActive(false).setVisible(false);
        continue;
      }
      const left = CRATER_LIFE - age;
      img.setAlpha(left > CRATER_FADE ? 0.95 : (0.95 * left) / CRATER_FADE);
    }
  }

  private drawRings(dt: number): void {
    const g = this.gfx;
    for (let i = 0; i < MAX_RINGS; i++) {
      if (this.rActive[i] === 0) {
        continue;
      }
      const age = this.rAge[i] + dt;
      if (age >= this.rLife[i]) {
        this.rActive[i] = 0;
        continue;
      }
      this.rAge[i] = age;
      const t = age / this.rLife[i];
      const eased = 1 - (1 - t) * (1 - t);
      const r = this.rR0[i] + (this.rR1[i] - this.rR0[i]) * eased;
      g.lineStyle(Math.max(1, this.rWidth[i] * (1 - t)), this.rColor[i], 1 - t);
      g.strokeCircle(this.rX[i], this.rY[i], r);
    }
  }

  private drawBolts(dt: number): void {
    const g = this.gfx;
    for (let i = 0; i < MAX_BOLTS; i++) {
      if (this.bActive[i] === 0) {
        continue;
      }
      const age = this.bAge[i] + dt;
      if (age >= this.bLife[i]) {
        this.bActive[i] = 0;
        continue;
      }
      this.bAge[i] = age;
      const t = age / this.bLife[i];
      const x0 = this.bX0[i];
      const y0 = this.bY0[i];
      const dx = this.bX1[i] - x0;
      const dy = this.bY1[i] - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) {
        continue;
      }
      const nx = -dy / len;
      const ny = dx / len;
      const segments = Math.min(12, Math.max(3, (len / 26) | 0));
      const tick = Math.floor(age / BOLT_FLICKER_SEC);
      const jag = 20 * (1 - t * 0.6);
      const seed = this.bSeed[i];

      for (let pass = 0; pass < 2; pass++) {
        g.lineStyle(pass === 0 ? this.bWidth[i] * 3 : this.bWidth[i], pass === 0 ? this.bColor[i] : 0xffffff, pass === 0 ? 0.4 * (1 - t) : 1 - t * 0.7);
        g.beginPath();
        g.moveTo(x0, y0);
        for (let s = 1; s < segments; s++) {
          const f = s / segments;
          const off = (hash(seed, s, tick) - 0.5) * 2 * jag;
          g.lineTo(x0 + dx * f + nx * off, y0 + dy * f + ny * off);
        }
        g.lineTo(this.bX1[i], this.bY1[i]);
        g.strokePath();
      }
    }
  }
}
