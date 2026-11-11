import {
  ITEM_TYPES,
  MAX_GRID_HEIGHT,
  MAX_GRID_WIDTH,
  type LevelData,
  type MachineDef,
  type MachineType,
} from '../types';
import { isOp } from './program';

/** Ошибка в данных уровня. Текст написан так, чтобы автор уровня сразу понял, что исправить. */
export class LevelError extends Error {
  readonly levelId: string;

  constructor(levelId: string, message: string) {
    super(`Уровень «${levelId}»: ${message}`);
    this.name = 'LevelError';
    this.levelId = levelId;
  }
}

/** Описания машин для уровня: общий machines.json плюс поправки LevelData.defOverrides. */
export function effectiveDefs(level: LevelData, defs: readonly MachineDef[]): Map<MachineType, MachineDef> {
  const map = new Map<MachineType, MachineDef>();
  for (const def of defs) {
    const override = level.defOverrides?.[def.type];
    map.set(def.type, override !== undefined ? { ...def, ...override } : def);
  }
  return map;
}

/**
 * Проверить уровень перед загрузкой. Бросает LevelError на первой найденной ошибке.
 * Так ошибка в JSON ловится сразу при запуске, а не всплывает странным поведением посреди игры.
 */
export function validateLevel(level: LevelData, defs: readonly MachineDef[]): void {
  const id = typeof level.id === 'string' && level.id !== '' ? level.id : '?';
  const fail = (message: string): never => {
    throw new LevelError(id, message);
  };
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

  if (id === '?') fail('нет поля id');

  // Размер поля
  if (!isInt(level.width) || !isInt(level.height) || level.width < 1 || level.height < 1) {
    fail('width и height должны быть целыми числами больше нуля');
  }
  if (level.width > MAX_GRID_WIDTH || level.height > MAX_GRID_HEIGHT) {
    fail(`поле ${level.width}×${level.height} больше максимума ${MAX_GRID_WIDTH}×${MAX_GRID_HEIGHT}`);
  }
  const inBounds = (x: unknown, y: unknown): boolean =>
    isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < level.width && y < level.height;

  // Цель и время
  if (!ITEM_TYPES.includes(level.targetItem)) fail(`неизвестный targetItem «${String(level.targetItem)}»`);
  if (!isInt(level.target) || level.target < 1) fail('target должен быть целым числом от 1');
  if (level.endless !== undefined) {
    if (!isPositive(level.endless.launchEvery)) fail('endless.launchEvery должен быть больше нуля');
    if (!isInt(level.endless.growBy) || level.endless.growBy < 0) fail('endless.growBy должен быть целым числом от 0');
  } else if (!isPositive(level.timeLimit)) {
    fail('timeLimit должен быть больше нуля (или задайте endless)');
  }

  // Энергия и программы
  if (!isInt(level.energy) || level.energy < 0) fail('energy должна быть целым числом от 0');
  if (!isInt(level.robotCost) || level.robotCost < 0) fail('robotCost должен быть целым числом от 0');
  if (!isInt(level.sensorCost) || level.sensorCost < 0) fail('sensorCost должен быть целым числом от 0');
  if (!isInt(level.maxProgram) || level.maxProgram < 1) fail('maxProgram должен быть целым числом от 1');
  if (!isInt(level.seed)) fail('seed должен быть целым числом');
  if (!Array.isArray(level.allowedOps) || level.allowedOps.length === 0) fail('allowedOps не должен быть пустым');
  for (const op of level.allowedOps) {
    if (!isOp(op)) fail(`неизвестный блок «${String(op)}» в allowedOps`);
  }

  // Описания машин
  const map = effectiveDefs(level, defs);
  const defOf = (type: MachineType): MachineDef => map.get(type) ?? fail(`нет описания машины «${String(type)}» в machines.json`);
  const checkDef = (def: MachineDef): void => {
    const name = `машина «${def.type}»`;
    if (def.kind === 'source') {
      if (def.output === undefined || !ITEM_TYPES.includes(def.output)) fail(`${name}: у source должен быть output`);
      if (!isPositive(def.produceEvery)) fail(`${name}: produceEvery должен быть больше нуля`);
      if (!isInt(def.capacity) || def.capacity < 1) fail(`${name}: capacity должен быть целым числом от 1`);
    } else if (def.kind === 'processor') {
      const inputs = def.inputs ?? {};
      const keys = Object.keys(inputs);
      if (keys.length === 0) fail(`${name}: у processor должен быть хотя бы один вход в inputs`);
      for (const key of keys) {
        const need = (inputs as Record<string, unknown>)[key];
        if (!(ITEM_TYPES as readonly string[]).includes(key) || !isInt(need) || need < 1) {
          fail(`${name}: некорректный вход «${key}»`);
        }
      }
      if (def.output === undefined || !ITEM_TYPES.includes(def.output)) fail(`${name}: у processor должен быть output`);
      if (def.workTimeRange !== undefined) {
        const [from, to] = def.workTimeRange;
        if (!isPositive(from) || !isPositive(to) || from > to) fail(`${name}: workTimeRange должен быть [от, до], от ≤ до`);
      } else if (!isPositive(def.workTime)) {
        fail(`${name}: workTime должен быть больше нуля`);
      }
    } else if (def.kind === 'storage') {
      if (!isInt(def.capacity) || def.capacity < 1) fail(`${name}: capacity должен быть целым числом от 1`);
    } else if (def.kind !== 'sink') {
      fail(`${name}: неизвестный kind «${String(def.kind)}»`);
    }
  };

  // Клетки: стены, машины и доки не должны накладываться
  const taken = new Map<string, string>();
  const claim = (x: number, y: number, what: string): void => {
    if (!inBounds(x, y)) fail(`${what} в клетке (${x}, ${y}) за пределами поля`);
    const key = `${x},${y}`;
    const other = taken.get(key);
    if (other !== undefined) fail(`${what} и ${other} стоят в одной клетке (${x}, ${y})`);
    taken.set(key, what);
  };

  for (const wall of level.walls ?? []) claim(wall[0], wall[1], 'стена');

  if (!Array.isArray(level.machines)) fail('machines должен быть массивом');
  let hasSink = false;
  for (const m of level.machines) {
    const def = defOf(m.type);
    checkDef(def);
    if (def.kind === 'sink') hasSink = true;
    claim(m.x, m.y, `машина «${m.type}»`);
  }
  if (!hasSink) fail('на уровне нет стартового стола (машины с kind "sink")');

  if (!Array.isArray(level.docks) || level.docks.length === 0) fail('нужен хотя бы один док');
  level.docks.forEach((dock, i) => {
    claim(dock.x, dock.y, `док №${i}`);
    if (dock.dir !== undefined && ![0, 1, 2, 3].includes(dock.dir)) fail(`док №${i}: dir должен быть 0, 1, 2 или 3`);
  });

  // Машины, которые можно докупить
  if (!Array.isArray(level.buildable)) fail('buildable должен быть массивом (можно пустым)');
  for (const type of level.buildable) {
    const def = defOf(type);
    checkDef(def);
    if (!isInt(def.cost) || def.cost < 0) fail(`машина «${type}» есть в buildable, но у неё нет цены cost`);
  }
}
