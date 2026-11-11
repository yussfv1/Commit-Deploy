import {
  DIR_DX,
  DIR_DY,
  OPERATOR_ID,
  STEP_TICKS,
  TICK_SECONDS,
  TICKS_PER_SECOND,
  type Block,
  type Bottleneck,
  type Dir,
  type FailReason,
  type ISimulation,
  type ItemType,
  type LevelData,
  type MachineDef,
  type MachineType,
  type OperatorView,
  type ProgramCheck,
  type Result,
  type SimEvent,
  type SimEventType,
  type SimMode,
  type SimSnapshot,
  type TeachInput,
  type TeachResult,
} from '../types';
import { validateLevel } from './level';
import { MAX_WAIT, checkProgram, hasSensor, moveDir, normalizeProgram, resolveProgram } from './program';
import { findBottleneck, requiredPerMinute, throughputPerMinute } from './telemetry';
import { World, type WorldData } from './world';

const NO_EVENTS: readonly SimEvent[] = Object.freeze([]);

/** За один вызов step() проживаем не больше секунды игрового времени — чтобы после свёрнутой вкладки мир не «проматывался». */
const MAX_STEP_SECONDS = 1;
const SAVE_VERSION = 1;

/** Идущая репетиция: копия мира и игрок-оператор в ней. */
interface TeachSession {
  world: World;
  dock: number;
  x: number;
  y: number;
  px: number;
  py: number;
  dir: Dir;
  carrying: ItemType | null;
  recording: Block[];
  /** В какой режим вернуться после репетиции. */
  resumeMode: 'plan' | 'running';
  replaceRobotId: number | null;
}

interface SaveData {
  version: number;
  level: LevelData;
  defs: MachineDef[];
  mode: SimMode;
  world: WorldData;
}

interface TelemetryCache {
  world: World;
  tick: number;
  throughput: number;
  required: number;
  bottleneck: Bottleneck | null;
}

const fail = (reason: FailReason): Result => ({ ok: false, reason });
const done = (id: number): Result => ({ ok: true, id });

/**
 * Симуляция — единственная дверь в игровую логику для экрана (роль B).
 *
 * Внутри два мира: настоящий (`real`) и, во время показа, его копия (`teach.world`).
 * Игрок показывает работу в копии; когда он возвращается на док, запись становится
 * программой робота в настоящем мире. Настоящий мир при этом стоит на паузе и не меняется.
 */
export class Simulation implements ISimulation {
  private current: World | null = null;
  private defs: MachineDef[] = [];
  private mode: SimMode = 'plan';
  /** Накопленное, но ещё не прожитое время (меньше одного тика). */
  private acc = 0;
  private teach: TeachSession | null = null;
  /** События от действий игрока (покупка, новый робот) — уйдут в ответе ближайшего step(). */
  private outbox: SimEvent[] = [];
  private cache: TelemetryCache | null = null;

  // ───────────────────────── Уровень ─────────────────────────

  loadLevel(level: LevelData, defs: MachineDef[]): void {
    validateLevel(level, defs);
    this.defs = defs.slice();
    this.current = new World(level, this.defs);
    this.mode = 'plan';
    this.acc = 0;
    this.teach = null;
    this.outbox = [];
    this.cache = null;
  }

  getLevel(): LevelData {
    return this.real.level;
  }

  private get real(): World {
    if (this.current === null) throw new Error('Симуляция пуста: сначала вызовите loadLevel()');
    return this.current;
  }

  private get editable(): boolean {
    return this.mode === 'plan' || this.mode === 'running';
  }

  // ───────────────────────── Репетиция ─────────────────────────

  beginTeach(dock: number, replaceRobotId?: number): Result {
    if (this.mode !== 'plan' && this.mode !== 'running') return fail('badMode');
    const world = this.real;
    const level = world.level;
    if (!Number.isInteger(dock) || dock < 0 || dock >= level.docks.length) return fail('badDock');

    let refund = 0;
    if (replaceRobotId !== undefined) {
      const old = world.robot(replaceRobotId);
      if (old === undefined) return fail('noRobot');
      refund = world.robotCost(old);
    }
    if (world.energyLeft() + refund < level.robotCost) return fail('noEnergy');

    // Копия мира. Она сразу проживает первую половину тика (ходы роботов) и замирает:
    // игрок будет действовать ровно в той точке, где потом окажется его робот.
    const copy = world.clone();
    copy.rehearsal = true;
    if (replaceRobotId !== undefined) copy.removeRobot(replaceRobotId);
    copy.tickRobots();
    copy.takeEvents();

    const pose = world.dockPose(dock);
    this.teach = {
      world: copy,
      dock,
      x: pose.x,
      y: pose.y,
      px: pose.x,
      py: pose.y,
      dir: pose.dir,
      carrying: null,
      recording: [],
      resumeMode: this.mode,
      replaceRobotId: replaceRobotId ?? null,
    };
    this.mode = 'teach';
    this.cache = null;
    return done(-1);
  }

  teachInput(input: TeachInput): TeachResult {
    const s = this.teach;
    if (s === null) return { ok: false, reason: 'badMode', events: NO_EVENTS };
    const world = s.world;
    const level = world.level;
    const reject = (reason: FailReason): TeachResult => ({ ok: false, reason, events: NO_EVENTS });
    const full = s.recording.length >= level.maxProgram;

    if (input === 'wait') {
      if (!level.allowedOps.includes('wait')) return reject('opNotAllowed');
      const last = s.recording[s.recording.length - 1];
      if (last !== undefined && last.op === 'wait') {
        // Подряд идущие ожидания склеиваются в один блок ЖДАТЬ ×N.
        const n = last.n ?? 1;
        if (n >= MAX_WAIT) return reject('tooLong');
        s.recording[s.recording.length - 1] = { op: 'wait', n: n + 1 };
      } else {
        if (full) return reject('tooLong');
        s.recording.push({ op: 'wait', n: 1 });
      }
      s.px = s.x;
      s.py = s.y;
    } else if (input === 'act') {
      // Одна кнопка: с пустыми руками — взять, с предметом — положить.
      const op = s.carrying === null ? 'take' : 'put';
      if (!level.allowedOps.includes(op)) return reject('opNotAllowed');
      if (full) return reject('tooLong');
      if (world.machineInFront(s) === null) return reject('noMachine');
      if (op === 'take') {
        if (!world.canTake(s)) return reject('nothingToTake');
        world.take(s, OPERATOR_ID);
      } else {
        if (!world.canPut(s)) return reject('cannotPut');
        world.put(s, OPERATOR_ID);
      }
      s.recording.push({ op });
      s.px = s.x;
      s.py = s.y;
    } else {
      if (!level.allowedOps.includes(input)) return reject('opNotAllowed');
      const dir = moveDir(input);
      const nx = s.x + DIR_DX[dir];
      const ny = s.y + DIR_DY[dir];
      const walkable = world.grid.isWalkable(nx, ny);
      // Упёрся и уже смотрит туда — ничего не изменилось, шаг не записываем и время не тратим.
      if (!walkable && s.dir === dir) return reject('bump');
      if (full) return reject('tooLong');
      s.px = s.x;
      s.py = s.y;
      s.dir = dir;
      if (walkable) {
        s.x = nx;
        s.y = ny;
        world.emit('step', nx, ny, OPERATOR_ID, null, null, 0);
      }
      s.recording.push({ op: input });
    }

    // Шаг принят: копия мира проживает его длительность и снова замирает посреди тика.
    world.tickRest();
    for (let i = 1; i < STEP_TICKS; i++) world.tickOnce();
    world.tickRobots();
    this.cache = null;
    return { ok: true, events: world.takeEvents() };
  }

  canFinishTeach(): boolean {
    const s = this.teach;
    if (s === null || s.recording.length === 0) return false;
    const pose = s.world.dockPose(s.dock);
    return s.x === pose.x && s.y === pose.y;
  }

  finishTeach(): Result {
    const s = this.teach;
    if (s === null) return fail('badMode');
    if (s.recording.length === 0) return fail('empty');
    if (!this.canFinishTeach()) return fail('notClosed');

    const world = this.real;
    const pose = world.dockPose(s.dock);
    const program = normalizeProgram(s.recording);
    const check = checkProgram(world.grid, pose, program, world.level);
    if (!check.ok) return fail(check.reason);

    if (s.replaceRobotId !== null) {
      world.removeRobot(s.replaceRobotId);
      this.post('removed', pose.x, pose.y, s.replaceRobotId, null);
    }
    const robot = world.addRobot(s.dock, { program, resolved: resolveProgram(world.grid, pose, program) }, 0);
    this.post('deployed', pose.x, pose.y, robot.id, null);

    this.teach = null;
    this.mode = s.resumeMode;
    this.cache = null;
    return done(robot.id);
  }

  cancelTeach(): void {
    if (this.teach === null) return;
    this.mode = this.teach.resumeMode;
    this.teach = null;
    this.cache = null;
  }

  // ───────────────────────── Программы и роботы ─────────────────────────

  checkProgram(robotId: number, program: Block[]): ProgramCheck {
    if (!this.editable) return { ok: false, reason: 'badMode', at: 0 };
    const world = this.real;
    const robot = world.robot(robotId);
    if (robot === undefined) return { ok: false, reason: 'noRobot', at: 0 };

    const normalized = normalizeProgram(program);
    const check = checkProgram(world.grid, world.dockPose(robot.dock), normalized, world.level);
    if (!check.ok) return check;

    // Первый ДАТЧИК в программе робота стоит энергии.
    if (hasSensor(normalized) && !robot.hasSensor && world.energyLeft() < world.level.sensorCost) {
      return { ok: false, reason: 'noEnergy', at: normalized.findIndex((b) => b.op === 'sense') };
    }
    return check;
  }

  setProgram(robotId: number, program: Block[]): ProgramCheck {
    const check = this.checkProgram(robotId, program);
    if (!check.ok) return check;

    const world = this.real;
    const robot = world.robot(robotId);
    if (robot === undefined) return { ok: false, reason: 'noRobot', at: 0 };
    const normalized = normalizeProgram(program);
    const loaded = {
      program: normalized,
      resolved: resolveProgram(world.grid, world.dockPose(robot.dock), normalized),
    };
    if (robot.started) {
      // Робот уже в пути: менять программу посреди круга нельзя, она заменится на доке.
      robot.pending = loaded;
    } else {
      robot.program = loaded.program;
      robot.resolved = loaded.resolved;
      robot.pending = null;
    }
    this.cache = null;
    return check;
  }

  copyRobot(robotId: number, delaySteps = 0): Result {
    if (!this.editable) return fail('badMode');
    const world = this.real;
    const robot = world.robot(robotId);
    if (robot === undefined) return fail('noRobot');
    if (world.energyLeft() < world.robotCost(robot)) return fail('noEnergy');

    const delay = Number.isInteger(delaySteps) && delaySteps > 0 ? delaySteps * STEP_TICKS : 0;
    const loaded = robot.pending ?? { program: robot.program, resolved: robot.resolved };
    const copy = world.addRobot(robot.dock, loaded, delay);
    const pose = world.dockPose(robot.dock);
    this.post('deployed', pose.x, pose.y, copy.id, null);
    this.cache = null;
    return done(copy.id);
  }

  removeRobot(robotId: number): Result {
    if (!this.editable) return fail('badMode');
    const world = this.real;
    const robot = world.robot(robotId);
    if (robot === undefined) return fail('noRobot');
    world.removeRobot(robotId);
    this.post('removed', robot.x, robot.y, robotId, null);
    this.cache = null;
    return done(robotId);
  }

  // ───────────────────────── Покупки ─────────────────────────

  canBuy(type: MachineType, x: number, y: number): Result {
    if (!this.editable) return fail('badMode');
    const world = this.real;
    const def = world.defs.get(type);
    if (def === undefined || !world.level.buildable.includes(type)) return fail('notBuildable');
    if (!Number.isInteger(x) || !Number.isInteger(y) || !world.grid.inBounds(x, y)) return fail('outOfBounds');
    if (!world.grid.isFree(x, y)) return fail('occupied');
    // Роботы ходят по заранее просчитанным маршрутам, поэтому ставить машину им под ноги нельзя.
    if (world.isOnAnyPath(x, y)) return fail('onPath');
    if (world.energyLeft() < (def.cost ?? 0)) return fail('noEnergy');
    return done(-1);
  }

  buy(type: MachineType, x: number, y: number): Result {
    const check = this.canBuy(type, x, y);
    if (!check.ok) return check;
    const machine = this.real.addMachine(type, x, y, true);
    this.post('bought', x, y, null, machine.id);
    this.cache = null;
    return done(machine.id);
  }

  sell(machineId: number): Result {
    if (!this.editable) return fail('badMode');
    const world = this.real;
    const machine = world.machine(machineId);
    if (machine === undefined) return fail('noMachine');
    if (!machine.bought) return fail('notBought');
    world.removeMachine(machineId);
    this.post('sold', machine.x, machine.y, null, machineId);
    this.cache = null;
    return done(machineId);
  }

  // ───────────────────────── Время ─────────────────────────

  start(): void {
    if (this.mode === 'plan') this.mode = 'running';
  }

  step(dtSeconds: number): readonly SimEvent[] {
    if (this.mode === 'running' && dtSeconds > 0) {
      this.acc += Math.min(dtSeconds, MAX_STEP_SECONDS);
      // Маленькая добавка гасит ошибку округления: 20 раз по 0,05 с должны дать ровно 20 тиков.
      const ticks = Math.floor(this.acc / TICK_SECONDS + 1e-9);
      if (ticks > 0) {
        this.acc = Math.max(0, this.acc - ticks * TICK_SECONDS);
        this.runTicks(ticks);
      }
    }
    return this.flush();
  }

  /** Прожить ровно `ticks` тиков, минуя накопитель времени. Нужен тестам и стресс-прогону. */
  advanceTicks(ticks: number): readonly SimEvent[] {
    if (this.mode === 'running') this.runTicks(ticks);
    return this.flush();
  }

  private runTicks(ticks: number): void {
    const world = this.real;
    for (let i = 0; i < ticks && world.status === 'running'; i++) world.tickOnce();
    for (const event of world.takeEvents()) this.outbox.push(event);
    if (world.status !== 'running') {
      this.mode = world.status;
      this.acc = 0;
    }
  }

  private flush(): readonly SimEvent[] {
    if (this.outbox.length === 0) return NO_EVENTS;
    const events = this.outbox;
    this.outbox = [];
    return events;
  }

  private post(type: SimEventType, x: number, y: number, robotId: number | null, machineId: number | null): void {
    this.outbox.push({ type, x, y, robotId, machineId, item: null, value: 0 });
  }

  // ───────────────────────── Снимок для экрана ─────────────────────────

  snapshot(): SimSnapshot {
    const real = this.real;
    const level = real.level;
    const s = this.teach;
    // В репетиции экран показывает копию мира, вне её — настоящий мир.
    const shown = s !== null ? s.world : real;
    const telemetry = this.telemetry(shown);

    let operator: OperatorView | null = null;
    if (s !== null) {
      operator = {
        x: s.x,
        y: s.y,
        px: s.px,
        py: s.py,
        dir: s.dir,
        carrying: s.carrying,
        dock: s.dock,
        blocks: s.recording.length,
      };
    }

    return {
      levelId: level.id,
      mode: this.mode,
      tick: shown.tick,
      alpha: this.mode === 'running' ? Math.min(1, this.acc / TICK_SECONDS) : 1,
      timeLeft: shown.timeLeftTicks / TICKS_PER_SECOND,
      timeLimit: level.endless !== undefined ? level.endless.launchEvery : level.timeLimit,
      delivered: shown.delivered,
      target: shown.orderTarget,
      targetItem: level.targetItem,
      energy: real.energyTotal(),
      energyLeft: real.energyLeft(),
      robotCost: level.robotCost,
      misses: shown.misses,
      machines: shown.machines.map((m) => m.toView()),
      robots: shown.robots.map((r) => r.toView()),
      operator,
      recording: s !== null ? s.recording.slice() : [],
      canFinishTeach: this.canFinishTeach(),
      throughput: telemetry.throughput,
      requiredRate: telemetry.required,
      bottleneck: telemetry.bottleneck,
      stars: real.stars(),
      starEnergyOk: real.starEnergyOk(),
      starTimeOk: real.starTimeOk(),
      launches: real.launches,
    };
  }

  /** Телеметрия пересчитывается не чаще раза за тик, хотя snapshot() зовут каждый кадр. */
  private telemetry(world: World): TelemetryCache {
    const cached = this.cache;
    if (cached !== null && cached.world === world && cached.tick === world.tick) return cached;
    const fresh: TelemetryCache = {
      world,
      tick: world.tick,
      throughput: throughputPerMinute(world),
      required: requiredPerMinute(world),
      bottleneck: findBottleneck(world),
    };
    this.cache = fresh;
    return fresh;
  }

  // ───────────────────────── Сохранение ─────────────────────────

  serialize(): string {
    const world = this.real;
    const save: SaveData = {
      version: SAVE_VERSION,
      level: world.level,
      defs: this.defs,
      // Репетиция не сохраняется: после загрузки игрок окажется в режиме, из которого её начал.
      mode: this.teach !== null ? this.teach.resumeMode : this.mode,
      world: world.toData(),
    };
    return JSON.stringify(save);
  }

  deserialize(json: string): void {
    const save = JSON.parse(json) as SaveData;
    if (save === null || typeof save !== 'object' || save.version !== SAVE_VERSION) {
      throw new Error('Сохранение повреждено или сделано другой версией игры');
    }
    validateLevel(save.level, save.defs);
    this.defs = save.defs.slice();
    this.current = new World(save.level, this.defs, save.world);
    this.mode = save.mode;
    this.acc = 0;
    this.teach = null;
    this.outbox = [];
    this.cache = null;
  }
}
