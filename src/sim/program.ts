import {
  DIR_DX,
  DIR_DY,
  type Block,
  type Dir,
  type LevelData,
  type MoveOp,
  type Op,
  type ProgramCheck,
} from '../types';
import type { Grid } from './grid';

/** Откуда начинается круг: клетка дока и куда робот смотрит на старте. */
export interface DockPose {
  x: number;
  y: number;
  dir: Dir;
}

/** Где робот окажется после блока: клетка, направление и был ли реальный шаг (а не поворот). */
export interface ResolvedStep {
  x: number;
  y: number;
  dir: Dir;
  moved: boolean;
}

/** Программа, «проигранная» по карте: положение после каждого блока и клетки петли. */
export interface ResolvedProgram {
  steps: readonly ResolvedStep[];
  /** Клетки петли по порядку, начиная с дока. Если петля замкнута, последняя клетка — тоже док. */
  path: readonly (readonly [number, number])[];
  /** Вернулся ли робот на док. */
  closed: boolean;
  /** Длина круга в шагах (без учёта ожидания датчиков). */
  totalSteps: number;
}

const MOVE_DIR: Record<MoveOp, Dir> = { up: 0, right: 1, down: 2, left: 3 };
const DIR_MOVE: readonly MoveOp[] = ['up', 'right', 'down', 'left'];
const ALL_OPS: readonly Op[] = ['up', 'right', 'down', 'left', 'take', 'put', 'wait', 'sense'];

/** Максимум шагов в одном блоке ЖДАТЬ. */
export const MAX_WAIT = 999;

export function isOp(value: unknown): value is Op {
  return typeof value === 'string' && (ALL_OPS as readonly string[]).includes(value);
}

export function isMoveOp(op: Op): op is MoveOp {
  return op === 'up' || op === 'right' || op === 'down' || op === 'left';
}

export function isActionOp(op: Op): op is 'take' | 'put' {
  return op === 'take' || op === 'put';
}

export function moveDir(op: MoveOp): Dir {
  return MOVE_DIR[op];
}

export function dirMove(dir: Dir): MoveOp {
  return DIR_MOVE[dir];
}

/** Сколько шагов длится блок. ДАТЧИК сам по себе времени не занимает. */
export function blockSteps(block: Block): number {
  if (block.op === 'wait') return block.n ?? 1;
  if (block.op === 'sense') return 0;
  return 1;
}

export function hasSensor(program: readonly Block[]): boolean {
  return program.some((b) => b.op === 'sense');
}

/**
 * Привести программу к каноническому виду: соседние ЖДАТЬ склеить в один блок,
 * у остальных блоков убрать лишнее поле n. Возвращает новый массив новых объектов.
 */
export function normalizeProgram(program: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const block of program) {
    if (block.op === 'wait') {
      const n = block.n ?? 1;
      const last = out[out.length - 1];
      if (last !== undefined && last.op === 'wait') {
        out[out.length - 1] = { op: 'wait', n: (last.n ?? 1) + n };
      } else {
        out.push({ op: 'wait', n });
      }
    } else {
      out.push({ op: block.op });
    }
  }
  return out;
}

/**
 * «Проиграть» программу по карте и узнать, где робот окажется после каждого блока.
 * Шаг в стену или машину — это поворот на месте. Результат запоминается в роботе:
 * дальше он ходит по готовому маршруту и не зависит от того, что на карте купят или продадут.
 */
export function resolveProgram(grid: Grid, dock: DockPose, program: readonly Block[]): ResolvedProgram {
  let x = dock.x;
  let y = dock.y;
  let dir = dock.dir;
  let totalSteps = 0;
  const steps: ResolvedStep[] = [];
  const path: [number, number][] = [[x, y]];

  for (const block of program) {
    let moved = false;
    if (isMoveOp(block.op)) {
      dir = MOVE_DIR[block.op];
      const nx = x + DIR_DX[dir];
      const ny = y + DIR_DY[dir];
      if (grid.isWalkable(nx, ny)) {
        x = nx;
        y = ny;
        moved = true;
        path.push([x, y]);
      }
    }
    totalSteps += blockSteps(block);
    steps.push({ x, y, dir, moved });
  }

  return { steps, path, closed: x === dock.x && y === dock.y, totalSteps };
}

/**
 * Проверить программу по правилам уровня. Проверки идут от простых к сложным,
 * `at` — индекс блока, на котором нашлась ошибка (чтобы подсветить его на экране).
 */
export function checkProgram(
  grid: Grid,
  dock: DockPose,
  program: readonly Block[],
  level: LevelData,
): ProgramCheck {
  if (program.length === 0) return { ok: false, reason: 'empty', at: 0 };
  if (program.length > level.maxProgram) return { ok: false, reason: 'tooLong', at: level.maxProgram };

  for (let i = 0; i < program.length; i++) {
    const block = program[i];
    if (!isOp(block.op) || !level.allowedOps.includes(block.op)) {
      return { ok: false, reason: 'opNotAllowed', at: i };
    }
    if (block.op === 'wait') {
      const n = block.n ?? 1;
      if (!Number.isInteger(n) || n < 1 || n > MAX_WAIT) return { ok: false, reason: 'badBlock', at: i };
    }
    if (block.op === 'sense') {
      const next = program[i + 1];
      if (next === undefined || !isActionOp(next.op)) return { ok: false, reason: 'senseNeedsAction', at: i };
    }
  }

  const resolved = resolveProgram(grid, dock, program);
  if (!resolved.closed) return { ok: false, reason: 'notClosed', at: program.length - 1 };

  return { ok: true, path: resolved.path.map(([x, y]): [number, number] => [x, y]), steps: resolved.totalSteps };
}
