import { describe, expect, it } from 'vitest';
import { RobotNumbers } from '../robotNumbers';

describe('номера роботов в подписях', () => {
  it('идут подряд с единицы в порядке появления', () => {
    const n = new RobotNumbers();
    n.sync([0, 1, 2]);
    expect([n.of(0), n.of(1), n.of(2)]).toEqual([1, 2, 3]);
  });

  it('новый робот занимает самый маленький свободный номер, а не номер по счёту созданных', () => {
    const n = new RobotNumbers();
    n.sync([0, 1, 2]);
    n.sync([0, 2]);
    n.sync([0, 2, 7]);
    expect(n.of(7)).toBe(2);
    expect(n.of(2)).toBe(3);
  });

  it('перезаписанный робот (старый убран, новый создан в том же кадре) сохраняет свой номер', () => {
    const n = new RobotNumbers();
    n.sync([0, 1]);
    n.sync([0, 5]);
    expect(n.of(5)).toBe(2);
  });

  it('номер живого робота не меняется, когда убирают другого', () => {
    const n = new RobotNumbers();
    n.sync([0, 1, 2]);
    n.sync([1, 2]);
    expect([n.of(1), n.of(2)]).toEqual([2, 3]);
  });

  it('больше восьми роботов — номера всё равно разные', () => {
    const n = new RobotNumbers();
    const ids = Array.from({ length: 11 }, (_, i) => i);
    n.sync(ids);
    expect(new Set(ids.map((id) => n.of(id))).size).toBe(11);
  });
});
