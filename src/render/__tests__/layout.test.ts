import { describe, expect, it } from 'vitest';
import { cellAt, cellCenter, fieldOrigin } from '../layout';
import { computeScale } from '../display';

describe('поле', () => {
  it('полный уровень 16 × 9 занимает поле целиком', () => {
    expect(fieldOrigin(16, 9)).toEqual({ ox: 0, oy: 56 });
  });

  it('маленький уровень стоит по центру поля', () => {
    expect(fieldOrigin(12, 5)).toEqual({ ox: 128, oy: 184 });
  });

  it('центр клетки и обратный поиск клетки согласованы', () => {
    const o = fieldOrigin(12, 5);
    const c = cellCenter(o, 3, 2);
    expect(c).toEqual({ x: 128 + 3.5 * 64, y: 184 + 2.5 * 64 });
    expect(cellAt(o, c.x + 20, c.y - 20, 12, 5)).toEqual({ x: 3, y: 2 });
  });

  it('точка вне уровня не даёт клетку', () => {
    const o = fieldOrigin(12, 5);
    expect(cellAt(o, 100, 300, 12, 5)).toBeNull();
    expect(cellAt(o, 500, 60, 12, 5)).toBeNull();
  });
});

describe('масштаб отрисовки', () => {
  it('равен 1, когда холст показан пиксель в пиксель', () => {
    expect(computeScale(1280, 1)).toBe(1);
  });

  it('растёт вместе с окном и плотностью пикселей', () => {
    expect(computeScale(1920, 1)).toBe(1.5);
    expect(computeScale(1333, 1.25)).toBe(1.3);
  });

  it('верхнюю границу можно опустить, если компьютер не тянет', () => {
    expect(computeScale(1920, 1, 1.25)).toBe(1.25);
    expect(computeScale(1280, 1, 1.25)).toBe(1);
    expect(computeScale(1920, 1, 0.5)).toBe(0.75);
  });

  it('ограничен сверху и снизу', () => {
    expect(computeScale(3840, 2)).toBe(2);
    expect(computeScale(640, 1)).toBe(0.75);
    expect(computeScale(0, 1)).toBe(0.75);
  });
});
