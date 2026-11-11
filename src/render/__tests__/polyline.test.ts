import { describe, expect, it } from 'vitest';
import { makeTrack, pointAt } from '../polyline';

const square = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
];

describe('дорожка по ломаной', () => {
  it('замкнутая дорожка считает и последний отрезок до начала', () => {
    expect(makeTrack(square, true).total).toBe(8);
    expect(makeTrack(square, false).total).toBe(6);
  });

  it('находит точку на нужном расстоянии от начала', () => {
    const t = makeTrack(square, true);
    expect(pointAt(t, 1)).toEqual({ x: 1, y: 0 });
    expect(pointAt(t, 3)).toEqual({ x: 2, y: 1 });
    expect(pointAt(t, 7)).toEqual({ x: 0, y: 1 });
  });

  it('замкнутая дорожка идёт по кругу, а разомкнутая упирается в конец', () => {
    expect(pointAt(makeTrack(square, true), 9)).toEqual({ x: 1, y: 0 });
    expect(pointAt(makeTrack(square, true), -1)).toEqual({ x: 0, y: 1 });
    expect(pointAt(makeTrack(square, false), 100)).toEqual({ x: 0, y: 2 });
    expect(pointAt(makeTrack(square, false), -5)).toEqual({ x: 0, y: 0 });
  });

  it('пустая дорожка и одна точка не ломают расчёт', () => {
    expect(pointAt(makeTrack([], true), 3)).toEqual({ x: 0, y: 0 });
    expect(pointAt(makeTrack([{ x: 4, y: 5 }], true), 3)).toEqual({ x: 4, y: 5 });
  });
});
