import { SPAWN_CONFIG } from '../config/GameConfig';
import type { EnemyKey } from '../config/GameConfig';
import { DIFFICULTIES, GAME_MODES } from '../config/CharacterConfig';
import type { DifficultyDef, GameModeDef } from '../config/CharacterConfig';
import type { EnemyPool } from '../pools/EnemyPool';

const TAU = Math.PI * 2;
const SWARM_PERIOD_SEC = 45;
const TIGER_PACK_PERIOD_SEC = 150;
const MAX_SPAWNS_PER_TICK = 6;
const TIGER_BIAS_START_SEC = 30;
const ELITE_HP_MULT = 2.2;

export enum WaveEvent {
  Swarm = 0,
  TigerPack = 1,
  EliteAssault = 2,
}

export type WaveEventHandler = (event: WaveEvent) => void;

export class WaveManager {
  /** Seconds survived (only advances while update() runs, so pausing the scene pauses the clock). */
  elapsedSec = 0;
  waveNumber = 1;
  onEvent: WaveEventHandler | null = null;

  private mode: GameModeDef = GAME_MODES.klendathu;
  private difficulty: DifficultyDef = DIFFICULTIES.normal;
  private spawnTimer = 0;
  private nextSwarmSec = SWARM_PERIOD_SEC;
  private nextTigerPackSec = TIGER_PACK_PERIOD_SEC;
  private nextEliteSec = Number.POSITIVE_INFINITY;

  constructor(private readonly enemies: EnemyPool) {}

  /** Applies a game mode's and difficulty's rules and restarts the clock. */
  configure(mode: GameModeDef, difficulty: DifficultyDef = DIFFICULTIES.normal): void {
    this.mode = mode;
    this.difficulty = difficulty;
    this.reset();
  }

  get minutes(): number {
    return this.elapsedSec / 60;
  }

  get remainingSec(): number {
    return Math.max(0, this.mode.durationSec - this.elapsedSec);
  }

  get completed(): boolean {
    return this.elapsedSec >= this.mode.durationSec;
  }

  get hpMult(): number {
    return (1 + SPAWN_CONFIG.hpScalePerMinute * this.minutes) * this.difficulty.hpMult;
  }

  get speedMult(): number {
    return Math.min(2, Math.min(1.6, 1 + SPAWN_CONFIG.speedScalePerMinute * this.minutes) * this.difficulty.speedMult);
  }

  get spawnIntervalMs(): number {
    const rate = this.mode.spawnRateMult;
    return Math.max(SPAWN_CONFIG.minInterval / rate, (SPAWN_CONFIG.baseInterval * Math.pow(0.8, this.minutes)) / rate);
  }

  /** Chance (0..1) that a regular spawn is a Tiger Bug. Zero until the tiger start time, then ramps to 30%. */
  get tigerChance(): number {
    const start = this.difficulty.tigerStartSec > 0 ? Math.min(SPAWN_CONFIG.tigerStartSec, this.difficulty.tigerStartSec) : SPAWN_CONFIG.tigerStartSec;
    let chance = 0;
    if (this.elapsedSec >= start) {
      const ramp = Math.min(1, (this.elapsedSec - start) / 600);
      chance = 0.04 + 0.26 * ramp;
    }
    const bias = Math.max(this.mode.tigerBias, this.difficulty.tigerBias);
    if (this.elapsedSec >= Math.min(TIGER_BIAS_START_SEC, start) && bias > chance) {
      chance = bias;
    }
    return chance;
  }

  reset(): void {
    this.elapsedSec = 0;
    this.waveNumber = 1;
    this.spawnTimer = 0;
    this.nextSwarmSec = SWARM_PERIOD_SEC;
    this.nextTigerPackSec = TIGER_PACK_PERIOD_SEC * this.difficulty.packIntervalMult;
    this.nextEliteSec = this.mode.eliteIntervalSec > 0 ? this.mode.eliteIntervalSec : Number.POSITIVE_INFINITY;
  }

  update(delta: number, playerX: number, playerY: number): void {
    this.elapsedSec += delta * 0.001;
    this.waveNumber = 1 + ((this.elapsedSec / 30) | 0);

    this.spawnTimer += delta;
    const interval = this.spawnIntervalMs;
    if (this.spawnTimer >= interval) {
      // A long frame spawns a few catch-up groups instead of silently dropping them.
      const groupSize = 1 + ((this.minutes / 1.5) | 0);
      let ticks = 0;
      while (this.spawnTimer >= interval && ticks < MAX_SPAWNS_PER_TICK) {
        this.spawnTimer -= interval;
        ticks++;
        for (let i = 0; i < groupSize; i++) {
          this.spawnAtRing(playerX, playerY, Math.random() < this.tigerChance ? 'tiger' : 'warrior');
        }
      }
      if (this.spawnTimer >= interval) {
        this.spawnTimer = 0;
      }
    }

    if (this.elapsedSec >= this.nextSwarmSec) {
      this.nextSwarmSec += SWARM_PERIOD_SEC;
      this.spawnSwarm(playerX, playerY);
      this.onEvent?.(WaveEvent.Swarm);
    }
    if (this.elapsedSec >= this.nextTigerPackSec) {
      this.nextTigerPackSec += TIGER_PACK_PERIOD_SEC * this.difficulty.packIntervalMult;
      this.spawnTigerPack(playerX, playerY);
      this.onEvent?.(WaveEvent.TigerPack);
    }
    if (this.elapsedSec >= this.nextEliteSec) {
      this.nextEliteSec += this.mode.eliteIntervalSec;
      this.spawnEliteAssault(playerX, playerY);
      this.onEvent?.(WaveEvent.EliteAssault);
    }
  }

  private canSpawn(): boolean {
    return this.enemies.activeCount < SPAWN_CONFIG.maxAlive;
  }

  private spawnAtRing(px: number, py: number, key: EnemyKey): boolean {
    if (!this.canSpawn()) {
      return false;
    }
    const angle = Math.random() * TAU;
    const dist = SPAWN_CONFIG.ringMin + Math.random() * (SPAWN_CONFIG.ringMax - SPAWN_CONFIG.ringMin);
    return this.enemies.spawn(px + Math.cos(angle) * dist, py + Math.sin(angle) * dist, key, this.hpMult, this.speedMult) !== null;
  }

  /** A closed ring of warriors around the player that tightens as the run goes on. */
  private spawnSwarm(px: number, py: number): void {
    const count = Math.min(70, 20 + ((this.minutes * 6) | 0));
    const offset = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      if (!this.canSpawn()) {
        return;
      }
      const a = offset + (i / count) * TAU;
      const d = SPAWN_CONFIG.ringMin + 20 + (i & 1) * 36;
      this.enemies.spawn(px + Math.cos(a) * d, py + Math.sin(a) * d, 'warrior', this.hpMult, this.speedMult * 1.1);
    }
  }

  /** Elite Tiger Bugs evenly surrounding the player, backed by a warrior swarm. */
  private spawnEliteAssault(px: number, py: number): void {
    const count = 4 + ((this.minutes / 3) | 0);
    const offset = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      if (!this.canSpawn()) {
        break;
      }
      const a = offset + (i / count) * TAU;
      const d = SPAWN_CONFIG.ringMax + 40;
      this.enemies.spawn(px + Math.cos(a) * d, py + Math.sin(a) * d, 'tiger', this.hpMult * ELITE_HP_MULT, this.speedMult);
    }
    this.spawnSwarm(px, py);
  }

  private spawnTigerPack(px: number, py: number): void {
    const count = 2 + ((this.minutes / 2) | 0);
    const heading = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      if (!this.canSpawn()) {
        return;
      }
      const a = heading + (i - (count - 1) / 2) * 0.35;
      const d = SPAWN_CONFIG.ringMax + 40;
      this.enemies.spawn(px + Math.cos(a) * d, py + Math.sin(a) * d, 'tiger', this.hpMult * 1.25, this.speedMult);
    }
  }
}
