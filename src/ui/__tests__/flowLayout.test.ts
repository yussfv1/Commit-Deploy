import { describe, expect, it } from 'vitest';
import { flowLayout, rowWindow } from '../flowLayout';

describe('раскладка блоков лентой', () => {
  it('ставит блоки в строку, пока хватает ширины', () => {
    const { items, rows } = flowLayout([30, 30, 30], 70, 4, 20);
    expect(rows).toBe(2);
    expect(items).toEqual([
      { x: 0, y: 0, row: 0 },
      { x: 34, y: 0, row: 0 },
      { x: 0, y: 20, row: 1 },
    ]);
  });

  it('блок шире строки всё равно получает свою строку', () => {
    const { items, rows } = flowLayout([100, 20], 70, 4, 20);
    expect(rows).toBe(2);
    expect(items[1]).toEqual({ x: 0, y: 20, row: 1 });
  });

  it('пустая лента — ноль строк', () => {
    expect(flowLayout([], 70, 4, 20)).toEqual({ items: [], rows: 0 });
  });
});

describe('окно прокрутки ленты', () => {
  it('если всё помещается, окно стоит в начале', () => {
    expect(rowWindow(5, 8, 4, 3)).toBe(0);
  });

  it('сдвигается ровно настолько, чтобы нужная строка была видна', () => {
    expect(rowWindow(12, 8, 9, 0)).toBe(2);
    expect(rowWindow(12, 8, 1, 4)).toBe(1);
    expect(rowWindow(12, 8, 5, 2)).toBe(2);
  });

  it('не уходит за края', () => {
    expect(rowWindow(12, 8, 11, 0)).toBe(4);
    expect(rowWindow(12, 8, 0, 9)).toBe(0);
    expect(rowWindow(12, 8, -1, 9)).toBe(4);
  });
});
