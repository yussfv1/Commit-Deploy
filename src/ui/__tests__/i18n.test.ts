import { describe, expect, it } from 'vitest';
import { clock, createI18n, flatten, num } from '../i18n';

const dicts = {
  ru: { menu: { play: 'Играть' }, 'hud.plan': 'План {done}/{need}', only: 'только ру' },
  kk: { 'menu.play': 'Ойнау' },
};

describe('i18n', () => {
  it('разворачивает вложенный словарь в плоские ключи', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' });
  });

  it('отдаёт строку по ключу и подставляет параметры', () => {
    const i = createI18n(dicts);
    expect(i.t('menu.play')).toBe('Играть');
    expect(i.t('hud.plan', { done: 3, need: 8 })).toBe('План 3/8');
  });

  it('показывает сам ключ, если строки нет', () => {
    const i = createI18n(dicts);
    expect(i.t('no.such.key')).toBe('no.such.key');
    expect(i.has('no.such.key')).toBe(false);
  });

  it('оставляет незаполненный параметр как есть', () => {
    expect(createI18n(dicts).t('hud.plan', { done: 1 })).toBe('План 1/{need}');
  });

  it('переключает язык и берёт русскую строку, если перевода нет', () => {
    const i = createI18n(dicts);
    i.setLang('kk');
    expect(i.lang()).toBe('kk');
    expect(i.t('menu.play')).toBe('Ойнау');
    expect(i.t('only')).toBe('только ру');
  });

  it('не переключается на язык, которого нет', () => {
    const i = createI18n(dicts);
    i.setLang('en');
    expect(i.lang()).toBe('ru');
    expect(i.languages()).toEqual(['ru', 'kk']);
  });
});

describe('форматы', () => {
  it('пишет дробные числа с запятой', () => {
    expect(num(2.14)).toBe('2,1');
    expect(num(3, 0)).toBe('3');
  });

  it('показывает время как м:сс и не уходит ниже нуля', () => {
    expect(clock(161)).toBe('2:41');
    expect(clock(160.2)).toBe('2:41');
    expect(clock(5)).toBe('0:05');
    expect(clock(-3)).toBe('0:00');
  });
});
