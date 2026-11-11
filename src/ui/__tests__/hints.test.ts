import { describe, expect, it } from 'vitest';
import { LOSSES_FOR_HINT, createHintCounter, hintKey } from '../hints';
import { i18n } from '../i18n';
import { levels } from '../levels';
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

describe('подсказка после поражений', () => {
  it('предлагается на третьем поражении подряд, не раньше', () => {
    const h = createHintCounter(null);
    expect(LOSSES_FOR_HINT).toBe(3);
    expect(h.lost('a')).toBe(false);
    expect(h.lost('a')).toBe(false);
    expect(h.lost('a')).toBe(true);
  });

  it('после предложения счёт идёт заново: следующее — ещё через три поражения', () => {
    const h = createHintCounter(null);
    for (let i = 0; i < 3; i++) h.lost('a');
    expect(h.losses('a')).toBe(0);
    expect(h.lost('a')).toBe(false);
    expect(h.lost('a')).toBe(false);
    expect(h.lost('a')).toBe(true);
  });

  it('победа обнуляет счёт, у каждого уровня свой счёт', () => {
    const h = createHintCounter(null);
    h.lost('a');
    h.lost('a');
    h.lost('b');
    h.won('a');
    expect(h.losses('a')).toBe(0);
    expect(h.losses('b')).toBe(1);
    expect(h.lost('a')).toBe(false);
  });

  it('счёт переживает перезапуск игры', () => {
    const m = memory();
    createHintCounter(m).lost('a');
    createHintCounter(m).lost('a');
    expect(createHintCounter(m).lost('a')).toBe(true);
  });

  it('работает без localStorage и с испорченными данными', () => {
    const h = createHintCounter(broken);
    h.lost('a');
    h.lost('a');
    expect(h.lost('a')).toBe(true);
    const m = memory();
    m.data['tminus.losses.v1'] = '{oops';
    expect(createHintCounter(m).losses('a')).toBe(0);
  });

  it('у каждого уровня игры есть текст подсказки', () => {
    const missing = levels()
      .map((_, i) => hintKey(i))
      .filter((k) => !i18n.has(k));
    expect(missing).toEqual([]);
  });
});
