export const enum ArenaShape {
  Circle,
  Square,
}

export interface Point {
  x: number;
  y: number;
}

/** Combat perimeter shared by the player, squad, enemies and spawners. Every query is allocation-free. */
export class Arena {
  shape: ArenaShape = ArenaShape.Square;
  /** Circle radius, or half the square side. */
  size = 2000;

  configure(radius: number, half: number): void {
    if (radius > 0) {
      this.shape = ArenaShape.Circle;
      this.size = radius;
    } else {
      this.shape = ArenaShape.Square;
      this.size = half > 0 ? half : 2000;
    }
  }

  /** Writes the closest point inside the arena (inset by `margin`) into `out` and returns it. */
  clamp(x: number, y: number, margin: number, out: Point): Point {
    const lim = this.size - margin;
    if (this.shape === ArenaShape.Circle) {
      const d2 = x * x + y * y;
      if (d2 > lim * lim) {
        const k = lim / Math.sqrt(d2);
        out.x = x * k;
        out.y = y * k;
        return out;
      }
      out.x = x;
      out.y = y;
      return out;
    }
    out.x = x < -lim ? -lim : x > lim ? lim : x;
    out.y = y < -lim ? -lim : y > lim ? lim : y;
    return out;
  }

  contains(x: number, y: number, margin: number): boolean {
    const lim = this.size - margin;
    if (this.shape === ArenaShape.Circle) {
      return x * x + y * y <= lim * lim;
    }
    return x >= -lim && x <= lim && y >= -lim && y <= lim;
  }
}
