import { describe, expect, it } from 'vitest';
import { createStore } from '../storage';
import type { StorageLike } from '../storage';

function memory(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const broken: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

const result = { stars: 2, timeLeft: 40, energySpent: 6, misses: 3, launches: 0 };

describe('настройки', () => {
  it('отдаёт значения по умолчанию', () => {
    expect(createStore(null).settings()).toEqual({ master: 0.8, music: 0.5, sfx: 0.8, lang: 'ru', theme: 'dark' });
  });

  it('сохраняет изменения и читает их в новой сессии', () => {
    const m = memory();
    createStore(m).setSettings({ music: 0.2, lang: 'kk' });
    expect(createStore(m).settings()).toMatchObject({ music: 0.2, lang: 'kk', master: 0.8 });
  });

  it('держит громкость в пределах 0–1', () => {
    const s = createStore(null);
    s.setSettings({ master: 5, sfx: -1 });
    expect(s.settings()).toMatchObject({ master: 1, sfx: 0 });
  });

  it('работает, когда хранилище недоступно', () => {
    const s = createStore(broken);
    s.setSettings({ music: 0.1 });
    expect(s.settings().music).toBe(0.1);
    expect(s.saveResult('level1', result)).toBe(true);
    expect(s.record('level1')).toEqual(result);
  });

  it('не падает на испорченных данных', () => {
    const m = memory();
    m.data['tminus.settings.v1'] = '{oops';
    m.data['tminus.progress.v1'] = '[1,2]';
    const s = createStore(m);
    expect(s.settings().master).toBe(0.8);
    expect(s.record('level1')).toBeNull();
  });
});

describe('прогресс', () => {
  it('у непройденного уровня записи нет', () => {
    expect(createStore(null).record('level1')).toBeNull();
  });

  it('хранит лучший результат по каждому показателю', () => {
    const s = createStore(memory());
    expect(s.saveResult('level1', result)).toBe(true);
    expect(s.saveResult('level1', { stars: 1, timeLeft: 55, energySpent: 9, misses: 0, launches: 0 })).toBe(false);
    expect(s.record('level1')).toEqual({ stars: 2, timeLeft: 55, energySpent: 6, misses: 0, launches: 0 });
  });

  it('сообщает о новом рекорде по звёздам и запускам', () => {
    const s = createStore(memory());
    s.saveResult('level5', { ...result, stars: 0, launches: 2 });
    expect(s.saveResult('level5', { ...result, stars: 0, launches: 3 })).toBe(true);
    expect(s.saveResult('level1', result)).toBe(true);
    expect(s.saveResult('level1', { ...result, stars: 3 })).toBe(true);
  });

  it('считает звёзды по всем уровням и сбрасывает прогресс', () => {
    const m = memory();
    const s = createStore(m);
    s.saveResult('level1', result);
    s.saveResult('level2', { ...result, stars: 3 });
    expect(s.totalStars()).toBe(5);
    s.reset();
    expect(s.totalStars()).toBe(0);
    expect(createStore(m).record('level1')).toBeNull();
  });
});
