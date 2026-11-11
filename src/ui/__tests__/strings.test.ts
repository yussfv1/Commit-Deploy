import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';

// Исходники экрана как текст: ищем все ключи строк, которые встречаются в коде.
const sources = import.meta.glob(['../../{ui,scenes,render}/**/*.ts', '../../main.ts', '!**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ITEMS = ['ore', 'plate', 'fuel', 'cell'];
const MACHINES = ['depot', 'tank', 'press', 'assembler', 'pad', 'shelf'];
const OPS = ['up', 'down', 'left', 'right', 'take', 'put', 'wait', 'sense'];
const ROBOT_STATES = ['idle', 'move', 'carry', 'act', 'wait', 'sense', 'miss'];
const MACHINE_STATES = ['idle', 'working', 'ready', 'full'];
const FAILS = [
  'badMode',
  'badDock',
  'noRobot',
  'noMachine',
  'noEnergy',
  'empty',
  'tooLong',
  'opNotAllowed',
  'badBlock',
  'notClosed',
  'senseNeedsAction',
  'outOfBounds',
  'occupied',
  'onPath',
  'notBuildable',
  'notBought',
  'bump',
  'nothingToTake',
  'cannotPut',
];
const BOTTLENECKS = ['saturated', 'blocked', 'misses', 'slowLoop'];

/** Любая строка в кавычках вида «раздел.ключ» — это ключ текста (t('…'), списки ключей, тернарники). */
function usedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [file, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/'([a-z][a-zA-Z]*(?:\.[a-zA-Z_]+)+)'/g)) {
      // tminus.* — ключи localStorage, а не тексты.
      if (!m[1].startsWith('tminus.')) found.set(m[1], file);
    }
  }
  return found;
}

describe('тексты интерфейса', () => {
  it('в исходниках экрана нашлись ключи', () => {
    expect(usedKeys().size).toBeGreaterThan(80);
  });

  it('у каждого ключа из кода есть русская строка', () => {
    const missing = [...usedKeys()].filter(([key]) => !i18n.has(key)).map(([key, file]) => `${key}  ←  ${file}`);
    expect(missing).toEqual([]);
  });

  it('есть строки для всех предметов, машин, блоков, состояний, отказов и узких мест', () => {
    const keys = [
      ...ITEMS.map((i) => `item.${i}.name`),
      ...MACHINES.flatMap((m) => [`machine.${m}.name`, `machine.${m}.desc`]),
      ...OPS.flatMap((o) => [`block.${o}`, `code.${o}`]),
      ...ROBOT_STATES.map((s) => `state.robot.${s}`),
      ...MACHINE_STATES.map((s) => `state.machine.${s}`),
      ...FAILS.map((f) => `fail.${f}`),
      ...BOTTLENECKS.map((b) => `bottleneck.${b}`),
    ];
    expect(keys.filter((k) => !i18n.has(k))).toEqual([]);
  });

  it('в русских строках нет пустых значений и восклицательных знаков', () => {
    const keys = [...usedKeys().keys()].filter((k) => i18n.has(k));
    expect(keys.filter((k) => i18n.t(k).trim() === '')).toEqual([]);
    expect(keys.filter((k) => i18n.t(k).includes('!') && k !== 'menu.event')).toEqual([]);
  });
});
