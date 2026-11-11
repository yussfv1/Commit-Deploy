import type { Block, LevelData, MachineDef, Op, Result, TeachInput } from '../../types';
import { EXAMPLE_DEFS } from '../examples';
import { Simulation } from '../simulation';

export const ALL_OPS: Op[] = ['up', 'right', 'down', 'left', 'take', 'put', 'wait', 'sense'];

/**
 * Базовый тестовый уровень — коридор 8×3:
 *   склад руды (0,1) · док (1,1) · стартовый стол (7,1).
 * Цель недостижимо большая и времени много, чтобы уровень не заканчивался сам.
 */
export function level(overrides: Partial<LevelData> = {}): LevelData {
  return {
    id: 'test',
    titleKey: 'test',
    width: 8,
    height: 3,
    timeLimit: 600,
    target: 1000,
    targetItem: 'ore',
    energy: 100,
    robotCost: 3,
    sensorCost: 1,
    maxProgram: 60,
    allowedOps: ALL_OPS,
    buildable: ['shelf', 'press'],
    machines: [
      { type: 'depot', x: 0, y: 1 },
      { type: 'pad', x: 7, y: 1 },
    ],
    docks: [{ x: 1, y: 1 }],
    seed: 7,
    ...overrides,
  };
}

/** Линия с прессом 9×3: склад (0,1) · пресс (4,0) · стол (8,1); доки A (1,1) и B (7,1). Цель — пластины. */
export function pressLine(overrides: Partial<LevelData> = {}): LevelData {
  return level({
    width: 9,
    targetItem: 'plate',
    machines: [
      { type: 'depot', x: 0, y: 1 },
      { type: 'press', x: 4, y: 0 },
      { type: 'pad', x: 8, y: 1 },
    ],
    docks: [
      { x: 1, y: 1 },
      { x: 7, y: 1 },
    ],
    ...overrides,
  });
}

export function makeSim(lvl: LevelData = level(), defs: MachineDef[] = EXAMPLE_DEFS): Simulation {
  const sim = new Simulation();
  sim.loadLevel(lvl, defs);
  return sim;
}

/** Достать id из успешного ответа или упасть с понятной ошибкой. */
export function must(result: Result): number {
  if (!result.ok) throw new Error(`Ожидался успех, а получен отказ: ${result.reason}`);
  return result.id;
}

function tokens(text: string): { letter: string; n: number }[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = /^([URDLTPWS])(\d+)?$/.exec(token);
      if (match === null) throw new Error(`Непонятный элемент программы: ${token}`);
      return { letter: match[1], n: match[2] !== undefined ? Number(match[2]) : 1 };
    });
}

const MOVES: Record<string, 'up' | 'right' | 'down' | 'left'> = { U: 'up', R: 'right', D: 'down', L: 'left' };

/**
 * Короткая запись программы для тестов: "L T R5 P W8 S".
 *   U R D L — шаг (R5 = пять шагов вправо), T — взять, P — положить,
 *   W8 — один блок ЖДАТЬ ×8, S — ДАТЧИК.
 */
export function prog(text: string): Block[] {
  const out: Block[] = [];
  for (const { letter, n } of tokens(text)) {
    if (letter in MOVES) for (let i = 0; i < n; i++) out.push({ op: MOVES[letter] });
    else if (letter === 'T') out.push({ op: 'take' });
    else if (letter === 'P') out.push({ op: 'put' });
    else if (letter === 'W') out.push({ op: 'wait', n });
    else out.push({ op: 'sense' });
  }
  return out;
}

/** Та же запись, но как нажатия игрока в репетиции: T и P — кнопка действия, W3 — три ожидания. */
export function inputs(text: string): TeachInput[] {
  const out: TeachInput[] = [];
  for (const { letter, n } of tokens(text)) {
    if (letter in MOVES) for (let i = 0; i < n; i++) out.push(MOVES[letter]);
    else if (letter === 'T' || letter === 'P') out.push('act');
    else if (letter === 'W') for (let i = 0; i < n; i++) out.push('wait');
    else throw new Error('ДАТЧИК нельзя записать в репетиции');
  }
  return out;
}

/** Показать роботу работу нажатиями и получить его id. Любой отказ — ошибка теста. */
export function teach(sim: Simulation, text: string, dock = 0): number {
  must(sim.beginTeach(dock));
  for (const input of inputs(text)) {
    const result = sim.teachInput(input);
    if (!result.ok) throw new Error(`Шаг «${input}» отклонён: ${result.reason}`);
  }
  return must(sim.finishTeach());
}

/** Быстро поставить робота с готовой программой (минуя показ по шагам). */
export function deploy(sim: Simulation, text: string, dock = 0): number {
  must(sim.beginTeach(dock));
  sim.teachInput('wait');
  const id = must(sim.finishTeach());
  const check = sim.setProgram(id, prog(text));
  if (!check.ok) throw new Error(`Программа отклонена: ${check.reason} (блок ${check.at})`);
  return id;
}
