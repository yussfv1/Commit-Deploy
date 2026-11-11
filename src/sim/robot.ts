import {
  TICKS_PER_SECOND,
  type Block,
  type Dir,
  type ItemType,
  type RobotState,
  type RobotView,
  type TimelineSegment,
} from '../types';
import { hasSensor, type DockPose, type ResolvedProgram } from './program';

/** Программа вместе с её заранее просчитанным маршрутом. */
export interface LoadedProgram {
  program: readonly Block[];
  resolved: ResolvedProgram;
}

/** Полное состояние робота в виде простых данных — для сохранения. */
export interface RobotData {
  id: number;
  dock: number;
  colorIndex: number;
  program: readonly Block[];
  resolved: ResolvedProgram;
  pending: LoadedProgram | null;
  x: number;
  y: number;
  dir: Dir;
  carrying: ItemType | null;
  state: RobotState;
  pc: number;
  started: boolean;
  delay: number;
  blockStart: number;
  blockEnd: number;
  sensing: boolean;
  senseWait: number;
  fromX: number;
  fromY: number;
  vx: number;
  vy: number;
  pvx: number;
  pvy: number;
  cycleStart: number;
  segs: TimelineSegment[];
  missesNow: number;
  timeline: readonly TimelineSegment[];
  cycleTicks: number;
  usefulShare: number;
  cycleMisses: number;
}

/**
 * Робот — маленький интерпретатор: выполняет блоки программы по кругу.
 * Здесь только его состояние; сам шаг выполнения — в World (ему нужны карта и машины).
 *
 * Массивы program, resolved и timeline никогда не меняются на месте (только заменяются целиком),
 * поэтому копии мира могут безопасно делить их по ссылке.
 */
export class Robot {
  readonly id: number;
  readonly dock: number;
  readonly colorIndex: number;

  program: readonly Block[];
  resolved: ResolvedProgram;
  /** Новая программа, которая заменит текущую в начале следующего круга. */
  pending: LoadedProgram | null = null;

  /** Логическая клетка и направление. */
  x: number;
  y: number;
  dir: Dir;
  carrying: ItemType | null = null;
  state: RobotState = 'idle';

  /** Индекс выполняемого блока; -1, пока робот не начал. */
  pc = -1;
  started = false;
  /** Сколько тиков подождать перед первым кругом. */
  delay = 0;
  /** Текущий блок занимает тики [blockStart, blockEnd). */
  blockStart = 0;
  blockEnd = 0;
  /** Робот стоит на блоке ДАТЧИК и ждёт готовности. */
  sensing = false;
  senseWait = 0;

  /** Клетка в начале блока — от неё идёт плавное движение. */
  fromX: number;
  fromY: number;
  /** Дробная позиция на этом тике и на прошлом — для отрисовки. */
  vx: number;
  vy: number;
  pvx: number;
  pvy: number;

  // Телеметрия текущего круга…
  cycleStart = 0;
  segs: TimelineSegment[] = [];
  missesNow = 0;
  // …и последнего завершённого.
  timeline: readonly TimelineSegment[] = [];
  cycleTicks = 0;
  usefulShare = 0;
  cycleMisses = 0;

  constructor(id: number, dock: number, colorIndex: number, pose: DockPose, loaded: LoadedProgram) {
    this.id = id;
    this.dock = dock;
    this.colorIndex = colorIndex;
    this.program = loaded.program;
    this.resolved = loaded.resolved;
    this.x = this.fromX = this.vx = this.pvx = pose.x;
    this.y = this.fromY = this.vy = this.pvy = pose.y;
    this.dir = pose.dir;
  }

  /** Программа, которая будет действовать дальше (с учётом ещё не применённой правки). */
  get effectiveProgram(): readonly Block[] {
    return this.pending !== null ? this.pending.program : this.program;
  }

  get hasSensor(): boolean {
    return hasSensor(this.effectiveProgram);
  }

  /** Проходит ли маршрут робота (текущий или будущий) через клетку. */
  walksOver(x: number, y: number): boolean {
    const onPath = (p: ResolvedProgram): boolean => p.path.some(([px, py]) => px === x && py === y);
    return onPath(this.resolved) || (this.pending !== null && onPath(this.pending.resolved));
  }

  toView(): RobotView {
    return {
      id: this.id,
      dock: this.dock,
      colorIndex: this.colorIndex,
      x: this.vx,
      y: this.vy,
      px: this.pvx,
      py: this.pvy,
      dir: this.dir,
      carrying: this.carrying,
      state: this.state,
      pc: this.pc,
      program: this.program,
      pendingProgram: this.pending !== null ? this.pending.program : null,
      path: this.resolved.path,
      hasSensor: this.hasSensor,
      cycleTime: this.cycleTicks / TICKS_PER_SECOND,
      usefulShare: this.usefulShare,
      cycleMisses: this.cycleMisses,
      timeline: this.timeline,
    };
  }

  toData(): RobotData {
    return {
      id: this.id,
      dock: this.dock,
      colorIndex: this.colorIndex,
      program: this.program,
      resolved: this.resolved,
      pending: this.pending,
      x: this.x,
      y: this.y,
      dir: this.dir,
      carrying: this.carrying,
      state: this.state,
      pc: this.pc,
      started: this.started,
      delay: this.delay,
      blockStart: this.blockStart,
      blockEnd: this.blockEnd,
      sensing: this.sensing,
      senseWait: this.senseWait,
      fromX: this.fromX,
      fromY: this.fromY,
      vx: this.vx,
      vy: this.vy,
      pvx: this.pvx,
      pvy: this.pvy,
      cycleStart: this.cycleStart,
      segs: this.segs.map((s) => ({ ...s })),
      missesNow: this.missesNow,
      timeline: this.timeline,
      cycleTicks: this.cycleTicks,
      usefulShare: this.usefulShare,
      cycleMisses: this.cycleMisses,
    };
  }

  static fromData(d: RobotData): Robot {
    const r = new Robot(d.id, d.dock, d.colorIndex, { x: d.x, y: d.y, dir: d.dir }, {
      program: d.program,
      resolved: d.resolved,
    });
    r.pending = d.pending;
    r.carrying = d.carrying;
    r.state = d.state;
    r.pc = d.pc;
    r.started = d.started;
    r.delay = d.delay;
    r.blockStart = d.blockStart;
    r.blockEnd = d.blockEnd;
    r.sensing = d.sensing;
    r.senseWait = d.senseWait;
    r.fromX = d.fromX;
    r.fromY = d.fromY;
    r.vx = d.vx;
    r.vy = d.vy;
    r.pvx = d.pvx;
    r.pvy = d.pvy;
    r.cycleStart = d.cycleStart;
    r.segs = d.segs.map((s) => ({ ...s }));
    r.missesNow = d.missesNow;
    r.timeline = d.timeline;
    r.cycleTicks = d.cycleTicks;
    r.usefulShare = d.usefulShare;
    r.cycleMisses = d.cycleMisses;
    return r;
  }
}
