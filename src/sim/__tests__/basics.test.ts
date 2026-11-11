import { describe, expect, it } from 'vitest';
import type { MachineDef } from '../../types';
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../examples';
import { Grid } from '../grid';
import { LevelError, validateLevel } from '../level';
import { Machine } from '../machine';
import { checkProgram, normalizeProgram, resolveProgram } from '../program';
import { BitRing } from '../ring';
import { Rng } from '../rng';
import { level, prog } from './helpers';

const def = (type: string): MachineDef => {
  const found = EXAMPLE_DEFS.find((d) => d.type === type);
  if (found === undefined) throw new Error(type);
  return found;
};

describe('генератор случайных чисел', () => {
  it('одно зерно даёт одну и ту же последовательность', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('копия продолжает ту же последовательность', () => {
    const a = new Rng(5);
    a.next();
    const b = a.clone();
    expect(b.next()).toBe(a.next());
  });

  it('int() остаётся в заданных границах и достигает обеих', () => {
    const rng = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('кольцевой буфер', () => {
  it('считает долю за последние N значений', () => {
    const ring = new BitRing(4);
    expect(ring.share).toBe(0);
    ring.push(true);
    ring.push(false);
    expect(ring.share).toBe(0.5);
    for (let i = 0; i < 4; i++) ring.push(true);
    expect(ring.share).toBe(1);
    expect(ring.samples).toBe(4);
  });

  it('сохраняется в строку и восстанавливается', () => {
    const ring = new BitRing(5);
    [true, false, true, true, false, true, true].forEach((v) => ring.push(v));
    const copy = BitRing.decode(5, ring.encode());
    expect(copy.encode()).toBe(ring.encode());
    expect(copy.share).toBe(ring.share);
  });
});

describe('программа робота', () => {
  const lvl = level();
  const grid = Grid.fromLevel(lvl);
  grid.setMachine(0, 1, 0);
  grid.setMachine(7, 1, 1);
  const dock = { x: 1, y: 1, dir: 2 as const };

  it('склеивает соседние ожидания в один блок', () => {
    expect(normalizeProgram(prog('W2 W3 L W1'))).toEqual([{ op: 'wait', n: 5 }, { op: 'left' }, { op: 'wait', n: 1 }]);
  });

  it('шаг в машину — это поворот на месте', () => {
    const resolved = resolveProgram(grid, dock, prog('L'));
    expect(resolved.steps[0]).toEqual({ x: 1, y: 1, dir: 3, moved: false });
    expect(resolved.closed).toBe(true);
  });

  it('считает клетки петли и длину круга', () => {
    const resolved = resolveProgram(grid, dock, prog('L T R5 P L5'));
    expect(resolved.closed).toBe(true);
    expect(resolved.totalSteps).toBe(13);
    expect(resolved.path[0]).toEqual([1, 1]);
    expect(resolved.path[5]).toEqual([6, 1]);
    expect(resolved.path[resolved.path.length - 1]).toEqual([1, 1]);
  });

  it('отклоняет некорректные программы с понятной причиной', () => {
    const reason = (text: string, over = {}): string => {
      const check = checkProgram(grid, dock, text === '' ? [] : prog(text), { ...lvl, ...over });
      return check.ok ? 'ok' : check.reason;
    };
    expect(reason('L T R5 P L5')).toBe('ok');
    expect(reason('')).toBe('empty');
    expect(reason('R3')).toBe('notClosed');
    expect(reason('R L S')).toBe('senseNeedsAction');
    expect(reason('R S L')).toBe('senseNeedsAction');
    expect(reason('R L', { maxProgram: 1 })).toBe('tooLong');
    expect(reason('L S T', { allowedOps: ['left', 'take'] })).toBe('opNotAllowed');
    expect(checkProgram(grid, dock, [{ op: 'wait', n: 0 }], lvl)).toMatchObject({ ok: false, reason: 'badBlock' });
  });

  it('при успехе возвращает маршрут и длину круга', () => {
    const check = checkProgram(grid, dock, prog('R L W3'), lvl);
    expect(check).toEqual({ ok: true, path: [[1, 1], [2, 1], [1, 1]], steps: 5 });
  });
});

describe('машины', () => {
  const rng = new Rng(1);
  const ticks = (m: Machine, n: number): void => {
    for (let i = 0; i < n; i++) m.update(rng);
  };

  it('склад стартует полным и пополняется раз в produceEvery', () => {
    const depot = new Machine(0, def('depot'), 0, 0, false);
    expect(depot.stock).toBe(3);
    expect(depot.state()).toBe('full');
    expect(depot.take()).toBe('ore');
    ticks(depot, 39);
    expect(depot.stock).toBe(2);
    ticks(depot, 1);
    expect(depot.stock).toBe(3);
  });

  it('пресс выдаёт пластину ровно через время работы', () => {
    const press = new Machine(0, def('press'), 0, 0, false);
    expect(press.canPut('ore', 'plate')).toBe(true);
    expect(press.canPut('fuel', 'plate')).toBe(false);
    press.put('ore');
    ticks(press, 39);
    expect(press.canTake()).toBe(false);
    expect(press.state()).toBe('working');
    ticks(press, 1);
    expect(press.canTake()).toBe(true);
    expect(press.take()).toBe('plate');
    expect(press.state()).toBe('idle');
  });

  it('в прессе только одна порция: пока он работает или не разгружен, руду не принимает', () => {
    const press = new Machine(0, def('press'), 0, 0, false);
    press.put('ore');
    expect(press.canPut('ore', 'plate')).toBe(false);
    ticks(press, 1);
    expect(press.canPut('ore', 'plate')).toBe(false);
    ticks(press, 39);
    expect(press.state()).toBe('ready');
    expect(press.canPut('ore', 'plate')).toBe(false);
    press.take();
    expect(press.canPut('ore', 'plate')).toBe(true);
  });

  it('пресс запоминает, сколько времени простоял с неразгруженной пластиной', () => {
    const press = new Machine(0, def('press'), 0, 0, false);
    press.put('ore');
    ticks(press, 80);
    expect(press.work.share).toBe(0.5);
    expect(press.blocked.share).toBe(0.5);
  });

  it('сборщику нужны оба входа', () => {
    const assembler = new Machine(0, def('assembler'), 0, 0, false);
    assembler.put('plate');
    ticks(assembler, 100);
    expect(assembler.state()).toBe('idle');
    expect(assembler.canPut('plate', 'cell')).toBe(false);
    expect(assembler.canPut('fuel', 'cell')).toBe(true);
    assembler.put('fuel');
    ticks(assembler, 60);
    expect(assembler.take()).toBe('cell');
  });

  it('полка отдаёт предметы в порядке поступления и не принимает сверх вместимости', () => {
    const shelf = new Machine(0, def('shelf'), 0, 0, true);
    (['ore', 'plate', 'fuel', 'cell'] as const).forEach((item) => shelf.put(item));
    expect(shelf.canPut('ore', 'cell')).toBe(false);
    expect(shelf.state()).toBe('full');
    expect(shelf.take()).toBe('ore');
    expect(shelf.take()).toBe('plate');
  });

  it('стартовый стол принимает только целевой предмет', () => {
    const pad = new Machine(0, def('pad'), 0, 0, false);
    expect(pad.canPut('cell', 'cell')).toBe(true);
    expect(pad.canPut('ore', 'cell')).toBe(false);
    expect(pad.canTake()).toBe(false);
  });
});

describe('проверка уровней', () => {
  it('все уровни-примеры корректны', () => {
    for (const lvl of EXAMPLE_LEVELS) expect(() => validateLevel(lvl, EXAMPLE_DEFS)).not.toThrow();
  });

  it('ловит ошибки и называет уровень', () => {
    const bad = (over: object): (() => void) => () => validateLevel({ ...level(), ...over }, EXAMPLE_DEFS);
    expect(bad({ width: 17 })).toThrow(LevelError);
    expect(bad({ docks: [] })).toThrow(/док/);
    expect(bad({ docks: [{ x: 0, y: 1 }] })).toThrow(/одной клетке/);
    expect(bad({ walls: [[9, 9]] })).toThrow(/за пределами/);
    expect(bad({ machines: [{ type: 'depot', x: 0, y: 1 }] })).toThrow(/стартового стола/);
    expect(bad({ target: 0 })).toThrow(/target/);
    expect(bad({ timeLimit: 0 })).toThrow(/timeLimit/);
    expect(bad({ allowedOps: ['jump'] })).toThrow(/jump/);
    expect(bad({ buildable: ['pad'] })).toThrow(/cost/);
    expect(bad({ id: 'мой-уровень', seed: 1.5 })).toThrow(/мой-уровень/);
    expect(() => validateLevel(level(), [])).toThrow(/machines\.json/);
  });

  it('проверяет описания машин', () => {
    const defs = EXAMPLE_DEFS.map((d) => (d.type === 'depot' ? { ...d, produceEvery: 0 } : d));
    expect(() => validateLevel(level(), defs)).toThrow(/produceEvery/);
  });
});
