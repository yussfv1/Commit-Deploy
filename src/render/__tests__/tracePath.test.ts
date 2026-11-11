import { describe, expect, it } from 'vitest';
import { tracePath } from '../tracePath';
import type { Block } from '../../types';

const p = (ops: string): Block[] => ops.split(' ').map((op) => ({ op }) as Block);
const free = (): boolean => false;

describe('tracePath', () => {
  it('замкнутая программа возвращается на старт', () => {
    const tr = tracePath(p('right right take left left put'), { x: 2, y: 2 }, free);
    expect(tr.cells).toEqual([[2, 2], [3, 2], [4, 2], [3, 2], [2, 2]]);
    expect(tr.closed).toBe(true);
  });

  it('шаг в занятую клетку не двигает робота', () => {
    const tr = tracePath(p('left left take'), { x: 2, y: 2 }, (x) => x <= 0);
    expect(tr.cells).toEqual([[2, 2], [1, 2]]);
    expect(tr.end).toEqual({ x: 1, y: 2 });
    expect(tr.closed).toBe(false);
  });

  it('программа без шагов не считается петлёй', () => {
    expect(tracePath(p('take wait put'), { x: 1, y: 1 }, free).closed).toBe(false);
  });
});
