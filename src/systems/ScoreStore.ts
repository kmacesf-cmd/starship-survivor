import type { CharacterId, DifficultyId, GameModeId } from '../config/CharacterConfig';

export interface ScoreEntry {
  kills: number;
  timeSec: number;
  character: CharacterId;
  difficulty: DifficultyId;
  mode: GameModeId;
  victory: boolean;
  date: number;
}

const STORAGE_KEY = 'starship-survivor.scores.v1';
const MAX_ENTRIES = 20;

let cache: ScoreEntry[] | null = null;

function isEntry(v: unknown): v is ScoreEntry {
  if (typeof v !== 'object' || v === null) {
    return false;
  }
  const e = v as Record<string, unknown>;
  return (
    typeof e.kills === 'number' &&
    typeof e.timeSec === 'number' &&
    typeof e.character === 'string' &&
    typeof e.difficulty === 'string' &&
    typeof e.mode === 'string' &&
    typeof e.date === 'number'
  );
}

function load(): ScoreEntry[] {
  if (cache) {
    return cache;
  }
  const list: ScoreEntry[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isEntry(item)) {
            list.push({ ...item, victory: item.victory === true });
          }
        }
      }
    }
  } catch {
    // Storage unavailable or corrupt: start with an empty board.
  }
  cache = list;
  return list;
}

function persist(list: ScoreEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private mode or quota exceeded: scores stay in memory for this session.
  }
}

function better(a: ScoreEntry, b: ScoreEntry): number {
  return b.kills - a.kills || b.timeSec - a.timeSec;
}

export const ScoreStore = {
  /** Returns the board sorted best-first. The array is shared; do not mutate it. */
  list(): readonly ScoreEntry[] {
    return load();
  },

  /** Records a run and returns its 1-based rank, or 0 if it did not make the board. */
  add(entry: ScoreEntry): number {
    const list = load();
    list.push(entry);
    list.sort(better);
    if (list.length > MAX_ENTRIES) {
      list.length = MAX_ENTRIES;
    }
    persist(list);
    const idx = list.indexOf(entry);
    return idx < 0 ? 0 : idx + 1;
  },

  clear(): void {
    cache = [];
    persist(cache);
  },
};
