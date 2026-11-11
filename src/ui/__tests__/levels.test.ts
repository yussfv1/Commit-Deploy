import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim';
import { i18n } from '../i18n';
import { levelById, levelIndex, levels, machineCost, machineDefs, nextLevel } from '../levels';
import { parseStep } from '../tutorialModel';

describe('данные уровней', () => {
  const all = levels();

  it('в игре есть хотя бы один уровень', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it('каждый уровень загружается в симуляцию', () => {
    for (const l of all) {
      const sim = new Simulation();
      expect(() => sim.loadLevel(l, machineDefs()), l.id).not.toThrow();
      expect(sim.snapshot().mode, l.id).toBe('plan');
    }
  });

  it('у каждого уровня есть док, название и тексты обучения', () => {
    for (const l of all) {
      expect(l.docks.length, l.id).toBeGreaterThan(0);
      expect(i18n.has(l.titleKey), l.titleKey).toBe(true);
      for (const key of l.tutorial ?? []) expect(i18n.has(key), `${l.id}: ${key}`).toBe(true);
    }
  });

  it('шаги обучения из уровней знакомы экрану', () => {
    for (const l of all) {
      for (const key of l.tutorial ?? []) expect(parseStep(key).kind, `${l.id}: ${key}`).not.toBe('info');
    }
  });

  it('находит уровень по id и следующий за ним', () => {
    expect(levelById(all[0].id)).toBe(all[0]);
    expect(levelById('нет такого')).toBeNull();
    expect(levelIndex(all[0].id)).toBe(0);
    expect(nextLevel(all[all.length - 1].id)).toBeNull();
    if (all.length > 1) expect(nextLevel(all[0].id)).toBe(all[1]);
  });

  it('цена покупки берётся из баланса машин', () => {
    const withShop = all.find((l) => l.buildable.length > 0);
    if (!withShop) return;
    for (const type of withShop.buildable) expect(machineCost(withShop, type), type).toBeGreaterThan(0);
  });

  it('описания машин отдаются копией: игра не может испортить общий баланс', () => {
    const a = machineDefs();
    a[0].capacity = 999;
    expect(machineDefs()[0].capacity).not.toBe(999);
  });
});
