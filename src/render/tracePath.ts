// Куда приведёт программа, если пройти её один раз от дока по неподвижной карте.
// Нужно экрану, чтобы показать петлю ещё не применённой правки и предупредить, что петля не замкнута.
import type { Block, Op } from '../types';

const STEP: Partial<Record<Op, readonly [number, number]>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

export interface Trace {
  cells: [number, number][];
  end: { x: number; y: number };
  /** Робот сходил с места и вернулся туда, откуда начал. */
  closed: boolean;
}

export function tracePath(
  program: readonly Block[],
  start: { x: number; y: number },
  blocked: (x: number, y: number) => boolean,
): Trace {
  let { x, y } = start;
  let moved = false;
  const cells: [number, number][] = [[x, y]];
  for (const b of program) {
    const d = STEP[b.op];
    if (!d) continue;
    const nx = x + d[0];
    const ny = y + d[1];
    if (blocked(nx, ny)) continue;
    x = nx;
    y = ny;
    moved = true;
    cells.push([x, y]);
  }
  return { cells, end: { x, y }, closed: moved && x === start.x && y === start.y };
}
