/**
 * Примеры данных: описания машин и пять уровней.
 *
 * Зачем они здесь, а не в src/data: настоящий баланс и уровни — зона роли C.
 * Эти примеры нужны тестам симуляции и отладочной песочнице (debug.html),
 * а ещё показывают роли C, как выглядит корректный уровень.
 */
import type { LevelData, MachineDef, Op } from '../types';

export const EXAMPLE_DEFS: MachineDef[] = [
  { type: 'depot', kind: 'source', output: 'ore', produceEvery: 2, capacity: 3 },
  { type: 'tank', kind: 'source', output: 'fuel', produceEvery: 3, capacity: 3 },
  { type: 'press', kind: 'processor', inputs: { ore: 1 }, output: 'plate', workTime: 2, cost: 4 },
  { type: 'assembler', kind: 'processor', inputs: { plate: 1, fuel: 1 }, output: 'cell', workTime: 3 },
  { type: 'pad', kind: 'sink' },
  { type: 'shelf', kind: 'storage', capacity: 4, cost: 2 },
];

const BASIC_OPS: Op[] = ['up', 'right', 'down', 'left', 'take', 'put', 'wait'];
const ALL_OPS: Op[] = [...BASIC_OPS, 'sense'];

/** 1. Первый урок: отнести руду со склада на стартовый стол. */
const lesson: LevelData = {
  id: 'demo1',
  titleKey: 'level.demo1.title',
  width: 10,
  height: 5,
  timeLimit: 90,
  target: 6,
  targetItem: 'ore',
  energy: 6,
  robotCost: 3,
  sensorCost: 1,
  maxProgram: 40,
  allowedOps: BASIC_OPS,
  buildable: [],
  machines: [
    { type: 'depot', x: 0, y: 2 },
    { type: 'pad', x: 9, y: 2 },
  ],
  docks: [{ x: 2, y: 2 }],
  starEnergy: 3,
  starTimeLeft: 45,
  seed: 1,
};

/** 2. Пресс: руда → пластина. Одному роботу тесно — работу лучше поделить на двоих. */
const press: LevelData = {
  id: 'demo2',
  titleKey: 'level.demo2.title',
  width: 12,
  height: 5,
  timeLimit: 120,
  target: 12,
  targetItem: 'plate',
  energy: 6,
  robotCost: 3,
  sensorCost: 1,
  maxProgram: 40,
  allowedOps: BASIC_OPS,
  buildable: [],
  machines: [
    { type: 'depot', x: 0, y: 2 },
    { type: 'press', x: 5, y: 1 },
    { type: 'pad', x: 11, y: 2 },
  ],
  docks: [
    { x: 2, y: 2 },
    { x: 8, y: 2 },
  ],
  starEnergy: 6,
  starTimeLeft: 30,
  seed: 2,
};

/** 3. Слепой робот: пресс работает то быстро, то медленно — без ДАТЧИКА не обойтись. */
const blind: LevelData = {
  ...press,
  id: 'demo3',
  titleKey: 'level.demo3.title',
  timeLimit: 150,
  target: 14,
  energy: 8,
  allowedOps: ALL_OPS,
  defOverrides: { press: { workTimeRange: [1.5, 3.5] } },
  starEnergy: 8,
  starTimeLeft: 30,
  seed: 3,
};

/** 4. Такт: полная цепочка руда → пластина → ячейка, с топливом из бака. */
const takt: LevelData = {
  id: 'demo4',
  titleKey: 'level.demo4.title',
  width: 14,
  height: 5,
  timeLimit: 180,
  target: 8,
  targetItem: 'cell',
  energy: 14,
  robotCost: 3,
  sensorCost: 1,
  maxProgram: 40,
  allowedOps: ALL_OPS,
  buildable: ['shelf', 'press'],
  machines: [
    { type: 'depot', x: 0, y: 2 },
    { type: 'press', x: 4, y: 1 },
    { type: 'tank', x: 8, y: 1 },
    { type: 'assembler', x: 8, y: 3 },
    { type: 'pad', x: 13, y: 2 },
  ],
  docks: [
    { x: 2, y: 2 },
    { x: 6, y: 2 },
    { x: 10, y: 2 },
  ],
  starEnergy: 12,
  starTimeLeft: 40,
  seed: 4,
};

/** 5. Окно запуска: бесконечный режим — ракеты уходят по расписанию, заказ растёт. */
const endless: LevelData = {
  ...takt,
  id: 'demo5',
  titleKey: 'level.demo5.title',
  timeLimit: 0,
  target: 2,
  energy: 12,
  endless: { launchEvery: 45, growBy: 1, energyPerLaunch: 2 },
  starEnergy: undefined,
  starTimeLeft: undefined,
  seed: 5,
};

export const EXAMPLE_LEVELS: LevelData[] = [lesson, press, blind, takt, endless];
