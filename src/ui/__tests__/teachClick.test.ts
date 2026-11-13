import { describe, expect, it } from 'vitest';
import type { Dir } from '../../types';
import { dirTo, teachClickInput } from '../teachClick';

// Оператор стоит в (3, 2) лицом вправо; машина — справа (4, 2) и снизу (3, 3).
const op = { x: 3, y: 2, dir: 1 as Dir };
const machine = (x: number, y: number): boolean => (x === 4 && y === 2) || (x === 3 && y === 3);

describe('показ мышью', () => {
  it('клик по соседней клетке — шаг в её сторону', () => {
    expect(teachClickInput(op, { x: 3, y: 1 }, machine)).toBe('up');
    expect(teachClickInput(op, { x: 2, y: 2 }, machine)).toBe('left');
  });

  it('клик по машине сбоку — поворот к ней, по машине перед собой — взять или положить', () => {
    expect(teachClickInput(op, { x: 3, y: 3 }, machine)).toBe('down');
    expect(teachClickInput(op, { x: 4, y: 2 }, machine)).toBe('act');
    expect(teachClickInput({ ...op, dir: 2 }, { x: 3, y: 3 }, machine)).toBe('act');
  });

  it('клик по себе — ждать; по дальней или диагональной клетке — ничего', () => {
    expect(teachClickInput(op, { x: 3, y: 2 }, machine)).toBe('wait');
    expect(teachClickInput(op, { x: 5, y: 2 }, machine)).toBeNull();
    expect(teachClickInput(op, { x: 4, y: 3 }, machine)).toBeNull();
  });

  it('направления совпадают с DIR_DX / DIR_DY симуляции', () => {
    expect(dirTo({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe(0);
    expect(dirTo({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(dirTo({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(2);
    expect(dirTo({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(3);
  });
});
