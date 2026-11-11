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
    expect(computeScale(1366, 1)).toBe(1366 / 1280);
  });

  it('ширина холста совпадает с настоящими пикселями экрана — браузер ничего не растягивает', () => {
    // Ноутбук 1366 × 768 и экран 1333 CSS-пикселей при масштабе Windows 125 %.
    expect(computeScale(1366, 1) * 1280).toBe(1366);
    expect(Math.round(computeScale(1333, 1.25) * 1280)).toBe(1666);
    for (let w = 640; w <= 2560; w += 7) {
      const px = computeScale(w, 1) * 1280;
      expect(Math.abs(px - Math.round(px)), `ширина ${w}`).toBeLessThan(1e-9);
    }
  });

  it('верхнюю границу можно опустить, если компьютер не тянет', () => {
    expect(computeScale(1920, 1, 1.25)).toBe(1.25);
    expect(computeScale(1280, 1, 1.25)).toBe(1);
    expect(computeScale(1920, 1, 0.25)).toBe(0.5);
  });

  it('ограничен сверху и снизу', () => {
    expect(computeScale(3840, 2)).toBe(2);
    expect(computeScale(640, 1)).toBe(0.5);
    expect(computeScale(320, 1)).toBe(0.5);
    expect(computeScale(0, 1)).toBe(0.5);
  });
});
