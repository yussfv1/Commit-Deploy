import type { LevelData } from '../types';

/**
 * Карта уровня: где стены, где доки и какая машина стоит в клетке.
 * Хранится в плоских типизированных массивах — быстро читать и дёшево копировать.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly wall: Uint8Array;
  private readonly machine: Int16Array;
  private readonly dock: Int8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.wall = new Uint8Array(width * height);
    this.machine = new Int16Array(width * height).fill(-1);
    this.dock = new Int8Array(width * height).fill(-1);
  }

  /** Карта со стенами и доками уровня. Машины расставляет World. */
  static fromLevel(level: LevelData): Grid {
    const grid = new Grid(level.width, level.height);
    for (const [x, y] of level.walls ?? []) grid.wall[grid.index(x, y)] = 1;
    level.docks.forEach((dock, i) => {
      grid.dock[grid.index(dock.x, dock.y)] = i;
    });
    return grid;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isWall(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.wall[this.index(x, y)] === 1;
  }

  /** id машины в клетке или -1. */
  machineId(x: number, y: number): number {
    return this.inBounds(x, y) ? this.machine[this.index(x, y)] : -1;
  }

  /** Индекс дока в клетке или -1. */
  dockIndex(x: number, y: number): number {
    return this.inBounds(x, y) ? this.dock[this.index(x, y)] : -1;
  }

  /** Можно ли встать на клетку: в поле, не стена и не машина. */
  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    return this.wall[i] === 0 && this.machine[i] < 0;
  }

  /** Можно ли поставить сюда машину: проходимая клетка и не док. */
  isFree(x: number, y: number): boolean {
    return this.isWalkable(x, y) && this.dock[this.index(x, y)] < 0;
  }

  setMachine(x: number, y: number, id: number): void {
    this.machine[this.index(x, y)] = id;
  }

  clearMachine(x: number, y: number): void {
    this.machine[this.index(x, y)] = -1;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }
}
