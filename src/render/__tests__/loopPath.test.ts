import { describe, expect, it } from 'vitest';
import { loopShape } from '../loopPath';

const round = (pts: { x: number; y: number }[]): [number, number][] =>
  pts.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);

describe('loopShape', () => {
  it('разводит путь туда и обратно на две параллельные линии', () => {
    const s = loopShape([[0, 0], [1, 0], [2, 0], [1, 0], [0, 0]], 0.1);
    expect(s.closed).toBe(true);
    expect(round(s.points)).toEqual([
      [-0.1, -0.1],
      [-0.1, 0.1],
      [1, 0.1],
      [2.1, 0.1],
      [2.1, -0.1],
      [1, -0.1],
    ]);
  });

  it('сдвигает квадратную петлю по часовой стрелке внутрь', () => {
    const s = loopShape([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 0.1);
    expect(s.closed).toBe(true);
    expect(round(s.points)).toEqual([
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ]);
  });

  it('оставляет незамкнутый путь открытым', () => {
    const s = loopShape([[0, 0], [1, 0], [1, 1]], 0.1);
    expect(s.closed).toBe(false);
    expect(round(s.points)).toEqual([
      [0, 0.1],
      [0.9, 0.1],
      [0.9, 1],
    ]);
  });

  it('убирает повторы клеток от поворотов на месте', () => {
    const a = loopShape([[0, 0], [0, 0], [1, 0], [1, 0], [0, 0]], 0.1);
    const b = loopShape([[0, 0], [1, 0], [0, 0]], 0.1);
    expect(a).toEqual(b);
    expect(a.points).toHaveLength(4);
  });

  it('для робота, который не сходит с места, отдаёт одну точку', () => {
    expect(loopShape([[3, 4], [3, 4]], 0.1)).toEqual({ points: [{ x: 3, y: 4 }], closed: false });
  });

  it('не сдвигает путь с прыжком через клетку', () => {
    const s = loopShape([[0, 0], [3, 0], [0, 0]], 0.1);
    expect(round(s.points)).toEqual([
      [0, 0],
      [3, 0],
    ]);
  });

  it('пустой путь даёт пустую фигуру', () => {
    expect(loopShape([], 0.1)).toEqual({ points: [], closed: false });
  });
});
