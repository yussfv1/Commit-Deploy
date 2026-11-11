import {
  DIR_DX,
  DIR_DY,
  ROBOT_COLORS,
  SENSE_TIMEOUT_TICKS,
  STEP_TICKS,
  TICKS_PER_SECOND,
  type Block,
  type Dir,
  type ItemType,
  type LevelData,
  type MachineDef,
  type MachineType,
  type RobotState,
  type SimEvent,
  type SimEventType,
} from '../types';
import { Grid } from './grid';
import { effectiveDefs } from './level';
import { Machine, secondsToTicks, type MachineData } from './machine';
import { isMoveOp, type DockPose } from './program';
import { Robot, type LoadedProgram, type RobotData } from './robot';
import { Rng } from './rng';

export type WorldStatus = 'running' | 'won' | 'lost';

/** Тот, кто умеет брать и класть: робот или игрок в репетиции. */
export interface Actor {
  x: number;
  y: number;
  dir: Dir;
  carrying: ItemType | null;
}

/** Полное состояние мира в виде простых данных — для сохранения и для копии-репетиции. */
export interface WorldData {
  tick: number;
  status: WorldStatus;
  rngState: number;
  delivered: number;
  orderTarget: number;
  timeLeftTicks: number;
  misses: number;
  launches: number;
  bonusEnergy: number;
  wonTicksLeft: number;
  deliveryTicks: number[];
  nextMachineId: number;
  nextRobotId: number;
  machines: MachineData[];
  robots: RobotData[];
}

/** За какое окно считается темп линии: последние 30 секунд. */
export const THROUGHPUT_WINDOW_TICKS = 30 * TICKS_PER_SECOND;

/**
 * Мир — всё изменяемое состояние уровня и правила одного тика.
 *
 * Один тик состоит из двух половин:
 *   1) tickRobots() — роботы по очереди начинают свои блоки (ходят, берут, кладут);
 *   2) tickRest()   — машины работают, проверяются победа и поражение, счётчик тиков растёт.
 * Половины разделены ради репетиции: игрок действует ровно в той точке тика,
 * где потом будет действовать его робот, поэтому запись повторяется тик в тик.
 */
export class World {
  readonly level: LevelData;
  readonly defs: ReadonlyMap<MachineType, MachineDef>;
  readonly grid: Grid;
  readonly machines: Machine[] = [];
  readonly robots: Robot[] = [];
  rng: Rng;

  tick = 0;
  status: WorldStatus = 'running';
  /** Копия мира для репетиции: в ней не бывает победы и поражения. */
  rehearsal = false;

  /** Доставлено по текущему заказу. */
  delivered = 0;
  orderTarget: number;
  timeLeftTicks: number;
  misses = 0;
  launches = 0;
  /** Энергия, полученная за запуски в бесконечном режиме. */
  bonusEnergy = 0;
  /** Сколько тиков оставалось в момент победы — для звезды «скорость». */
  wonTicksLeft = 0;
  /** Тики последних доставок — по ним считается темп линии. */
  deliveryTicks: number[] = [];

  private readonly rawDefs: readonly MachineDef[];
  private readonly machineById = new Map<number, Machine>();
  private nextMachineId = 0;
  private nextRobotId = 0;
  private events: SimEvent[] = [];

  constructor(level: LevelData, defs: readonly MachineDef[], data?: WorldData) {
    this.level = level;
    this.rawDefs = defs;
    this.defs = effectiveDefs(level, defs);
    this.grid = Grid.fromLevel(level);
    this.rng = new Rng(level.seed);
    this.orderTarget = level.target;
    this.timeLeftTicks = secondsToTicks(level.endless !== undefined ? level.endless.launchEvery : level.timeLimit);

    if (data === undefined) {
      for (const m of level.machines) this.addMachine(m.type, m.x, m.y, false);
    } else {
      this.restore(data);
    }
  }

  // ───────────────────────── Машины и роботы ─────────────────────────

  machine(id: number): Machine | undefined {
    return this.machineById.get(id);
  }

  robot(id: number): Robot | undefined {
    return this.robots.find((r) => r.id === id);
  }

  dockPose(index: number): DockPose {
    const dock = this.level.docks[index];
    return { x: dock.x, y: dock.y, dir: dock.dir ?? 2 };
  }

  addMachine(type: MachineType, x: number, y: number, bought: boolean): Machine {
    const def = this.defs.get(type);
    if (def === undefined) throw new Error(`Нет описания машины «${type}»`);
    const machine = new Machine(this.nextMachineId++, def, x, y, bought);
    this.placeMachine(machine);
    return machine;
  }

  removeMachine(id: number): void {
    const index = this.machines.findIndex((m) => m.id === id);
    if (index < 0) return;
    const machine = this.machines[index];
    this.machines.splice(index, 1);
    this.machineById.delete(id);
    this.grid.clearMachine(machine.x, machine.y);
  }

  addRobot(dock: number, loaded: LoadedProgram, delayTicks: number): Robot {
    const robot = new Robot(this.nextRobotId++, dock, this.freeColorIndex(), this.dockPose(dock), loaded);
    robot.delay = delayTicks;
    this.robots.push(robot);
    return robot;
  }

  removeRobot(id: number): void {
    const index = this.robots.findIndex((r) => r.id === id);
    if (index >= 0) this.robots.splice(index, 1);
  }

  /** Ходит ли по клетке хоть один робот (сейчас или после применения правки программы). */
  isOnAnyPath(x: number, y: number): boolean {
    return this.robots.some((r) => r.walksOver(x, y));
  }

  private placeMachine(machine: Machine): void {
    this.machines.push(machine);
    this.machineById.set(machine.id, machine);
    this.grid.setMachine(machine.x, machine.y, machine.id);
  }

  private freeColorIndex(): number {
    for (let i = 0; i < ROBOT_COLORS.length; i++) {
      if (!this.robots.some((r) => r.colorIndex === i)) return i;
    }
    return this.nextRobotId % ROBOT_COLORS.length;
  }

  // ───────────────────────── Энергия и итог ─────────────────────────

  robotCost(robot: Robot): number {
    return this.level.robotCost + (robot.hasSensor ? this.level.sensorCost : 0);
  }

  energyTotal(): number {
    return this.level.energy + this.bonusEnergy;
  }

  energySpent(): number {
    let spent = 0;
    for (const r of this.robots) spent += this.robotCost(r);
    for (const m of this.machines) if (m.bought) spent += m.def.cost ?? 0;
    return spent;
  }

  energyLeft(): number {
    return this.energyTotal() - this.energySpent();
  }

  /** Звезда «экономия»: потрачено не больше LevelData.starEnergy. */
  starEnergyOk(): boolean {
    return this.level.starEnergy === undefined || this.energySpent() <= this.level.starEnergy;
  }

  /** Звезда «скорость»: до старта осталось (или оставалось в момент победы) не меньше starTimeLeft. */
  starTimeOk(): boolean {
    if (this.level.starTimeLeft === undefined) return true;
    const ticksLeft = this.status === 'won' ? this.wonTicksLeft : this.timeLeftTicks;
    return ticksLeft >= Math.round(this.level.starTimeLeft * TICKS_PER_SECOND);
  }

  stars(): 0 | 1 | 2 | 3 {
    if (this.status !== 'won') return 0;
    return (1 + (this.starEnergyOk() ? 1 : 0) + (this.starTimeOk() ? 1 : 0)) as 1 | 2 | 3;
  }

  // ───────────────────────── Взять и положить ─────────────────────────

  machineInFront(actor: Actor): Machine | null {
    const id = this.grid.machineId(actor.x + DIR_DX[actor.dir], actor.y + DIR_DY[actor.dir]);
    return id < 0 ? null : (this.machineById.get(id) ?? null);
  }

  canTake(actor: Actor): boolean {
    if (actor.carrying !== null) return false;
    const machine = this.machineInFront(actor);
    return machine !== null && machine.canTake();
  }

  canPut(actor: Actor): boolean {
    if (actor.carrying === null) return false;
    const machine = this.machineInFront(actor);
    return machine !== null && machine.canPut(actor.carrying, this.level.targetItem);
  }

  /** Взять предмет из машины перед собой. Вызывать только после canTake(). */
  take(actor: Actor, actorId: number): void {
    const machine = this.machineInFront(actor) as Machine;
    const item = machine.take();
    actor.carrying = item;
    this.emit('took', actor.x, actor.y, actorId, machine.id, item, 0);
  }

  /** Положить предмет в машину перед собой. Вызывать только после canPut(). */
  put(actor: Actor, actorId: number): void {
    const machine = this.machineInFront(actor) as Machine;
    const item = actor.carrying as ItemType;
    machine.put(item);
    actor.carrying = null;
    this.emit('put', actor.x, actor.y, actorId, machine.id, item, 0);
    if (machine.kind === 'sink') {
      this.delivered++;
      this.deliveryTicks.push(this.tick);
      while (this.deliveryTicks.length > 0 && this.deliveryTicks[0] <= this.tick - THROUGHPUT_WINDOW_TICKS) {
        this.deliveryTicks.shift();
      }
      this.emit('delivered', machine.x, machine.y, actorId, machine.id, item, this.delivered);
    }
  }

  // ───────────────────────── Тик ─────────────────────────

  tickOnce(): void {
    this.tickRobots();
    this.tickRest();
  }

  /** Первая половина тика: роботы по порядку id продолжают или начинают блоки. */
  tickRobots(): void {
    for (const robot of this.robots) this.stepRobot(robot);
  }

  /** Вторая половина тика: машины, цель уровня, счётчик времени. */
  tickRest(): void {
    for (const machine of this.machines) {
      const produced = machine.update(this.rng);
      if (produced !== null && machine.kind === 'processor') {
        this.emit('produced', machine.x, machine.y, null, machine.id, produced, 0);
      }
    }
    if (this.rehearsal) {
      if (this.timeLeftTicks > 0) this.timeLeftTicks--;
    } else if (this.status === 'running') {
      this.updateGoal();
    }
    this.tick++;
  }

  private updateGoal(): void {
    const endless = this.level.endless;
    if (endless !== undefined) {
      // Бесконечный режим: ракета уходит по расписанию. Успели собрать заказ — заказ растёт, нет — конец.
      this.timeLeftTicks--;
      if (this.timeLeftTicks > 0) return;
      if (this.delivered >= this.orderTarget) {
        this.launches++;
        this.delivered -= this.orderTarget;
        this.orderTarget += endless.growBy;
        this.bonusEnergy += endless.energyPerLaunch ?? 0;
        this.timeLeftTicks = secondsToTicks(endless.launchEvery);
        this.emit('launch', -1, -1, null, null, null, this.launches);
      } else {
        this.timeLeftTicks = 0;
        this.status = 'lost';
        this.emit('lost', -1, -1, null, null, null, this.launches);
      }
      return;
    }

    if (this.delivered >= this.orderTarget) {
      this.status = 'won';
      this.wonTicksLeft = this.timeLeftTicks;
      this.launches = 1;
      this.emit('launch', -1, -1, null, null, null, 1);
      this.emit('won', -1, -1, null, null, null, this.stars());
      return;
    }
    this.timeLeftTicks--;
    if (this.timeLeftTicks <= 0) {
      this.timeLeftTicks = 0;
      this.status = 'lost';
      this.emit('lost', -1, -1, null, null, null, 0);
    }
  }

  // ───────────────────────── Интерпретатор робота ─────────────────────────

  private stepRobot(r: Robot): void {
    r.pvx = r.vx;
    r.pvy = r.vy;
    if (r.delay > 0) {
      r.delay--;
      return;
    }
    if (this.tick >= r.blockEnd) this.beginBlock(r);

    // Плавное движение внутри блока: за время блока робот проходит от клетки from до своей клетки.
    const duration = r.blockEnd - r.blockStart;
    const k = duration > 0 ? Math.min(1, (this.tick - r.blockStart + 1) / duration) : 1;
    r.vx = r.fromX + (r.x - r.fromX) * k;
    r.vy = r.fromY + (r.y - r.fromY) * k;
  }

  /** Текущий блок закончился — перейти к следующему и выполнить его. */
  private beginBlock(r: Robot): void {
    // Два прохода нужны, когда ДАТЧИК сработал сразу: тогда действие за ним выполняется в тот же тик.
    for (let pass = 0; pass < 4; pass++) {
      if (!r.sensing) {
        r.pc++;
        if (!r.started) {
          r.started = true;
          r.cycleStart = this.tick;
        } else if (r.pc >= r.program.length) {
          this.finishCycle(r);
        }
      }

      const block = r.program[r.pc];
      if (block.op !== 'sense') {
        this.execBlock(r, block);
        return;
      }

      // ДАТЧИК: ждём, пока следующее действие сможет сработать (но не дольше SENSE_TIMEOUT_TICKS).
      const next = r.program[r.pc + 1];
      const ready = next !== undefined && (next.op === 'take' ? this.canTake(r) : this.canPut(r));
      if (ready || r.senseWait >= SENSE_TIMEOUT_TICKS) {
        if (ready && r.sensing) this.emit('sensed', r.x, r.y, r.id, null, null, r.senseWait);
        r.sensing = false;
        r.senseWait = 0;
        continue;
      }
      r.sensing = true;
      r.senseWait++;
      r.fromX = r.x;
      r.fromY = r.y;
      this.setBlock(r, 'sense', 1);
      return;
    }
  }

  private execBlock(r: Robot, block: Block): void {
    r.fromX = r.x;
    r.fromY = r.y;

    if (isMoveOp(block.op)) {
      // Куда ведёт шаг, посчитано заранее (resolveProgram): робот идёт по готовому маршруту.
      const step = r.resolved.steps[r.pc];
      r.x = step.x;
      r.y = step.y;
      r.dir = step.dir;
      this.setBlock(r, r.carrying !== null ? 'carry' : 'move', STEP_TICKS);
      if (step.moved) this.emit('step', r.x, r.y, r.id, null, null, 0);
      return;
    }

    switch (block.op) {
      case 'take':
        if (this.canTake(r)) {
          this.take(r, r.id);
          this.setBlock(r, 'act', STEP_TICKS);
        } else {
          this.miss(r);
        }
        return;
      case 'put':
        if (this.canPut(r)) {
          this.put(r, r.id);
          this.setBlock(r, 'act', STEP_TICKS);
        } else {
          this.miss(r);
        }
        return;
      case 'wait':
        this.setBlock(r, 'wait', STEP_TICKS * (block.n ?? 1));
        return;
    }
  }

  /** Промах: действие не получилось. Робот теряет шаг и идёт дальше по программе. */
  private miss(r: Robot): void {
    r.missesNow++;
    this.misses++;
    this.setBlock(r, 'miss', STEP_TICKS);
    const machine = this.machineInFront(r);
    this.emit('miss', r.x, r.y, r.id, machine !== null ? machine.id : null, r.carrying, 0);
  }

  /** Назначить роботу состояние на `duration` тиков и записать это в телеметрию круга. */
  private setBlock(r: Robot, state: RobotState, duration: number): void {
    r.state = state;
    r.blockStart = this.tick;
    r.blockEnd = this.tick + duration;

    const from = this.tick - r.cycleStart;
    const last = r.segs[r.segs.length - 1];
    if (last !== undefined && last.state === state && last.to === from) {
      last.to = from + duration;
    } else {
      r.segs.push({ state, from, to: from + duration });
    }
  }

  /** Робот вернулся на док: подвести итог круга и начать новый. */
  private finishCycle(r: Robot): void {
    const ticks = this.tick - r.cycleStart;
    let lost = 0;
    for (const s of r.segs) {
      if (s.state === 'wait' || s.state === 'sense' || s.state === 'miss') lost += s.to - s.from;
    }
    r.timeline = r.segs;
    r.segs = [];
    r.cycleTicks = ticks;
    r.usefulShare = ticks > 0 ? 1 - lost / ticks : 0;
    r.cycleMisses = r.missesNow;
    r.missesNow = 0;
    r.cycleStart = this.tick;
    this.emit('cycle', r.x, r.y, r.id, null, null, ticks);

    // Правка программы вступает в силу только здесь — на границе кругов.
    if (r.pending !== null) {
      r.program = r.pending.program;
      r.resolved = r.pending.resolved;
      r.pending = null;
    }

    // Каждый круг начинается одинаково: на доке и лицом в исходную сторону.
    const pose = this.dockPose(r.dock);
    r.x = pose.x;
    r.y = pose.y;
    r.dir = pose.dir;
    r.pc = 0;
  }

  // ───────────────────────── События ─────────────────────────

  emit(
    type: SimEventType,
    x: number,
    y: number,
    robotId: number | null,
    machineId: number | null,
    item: ItemType | null,
    value: number,
  ): void {
    this.events.push({ type, x, y, robotId, machineId, item, value });
  }

  /** Забрать накопленные события (список после этого пуст). */
  takeEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ───────────────────────── Сохранение и копия ─────────────────────────

  toData(): WorldData {
    return {
      tick: this.tick,
      status: this.status,
      rngState: this.rng.state,
      delivered: this.delivered,
      orderTarget: this.orderTarget,
      timeLeftTicks: this.timeLeftTicks,
      misses: this.misses,
      launches: this.launches,
      bonusEnergy: this.bonusEnergy,
      wonTicksLeft: this.wonTicksLeft,
      deliveryTicks: this.deliveryTicks.slice(),
      nextMachineId: this.nextMachineId,
      nextRobotId: this.nextRobotId,
      machines: this.machines.map((m) => m.toData()),
      robots: this.robots.map((r) => r.toData()),
    };
  }

  /** Независимая копия мира (для репетиции). Идёт через toData(), чтобы копия и сохранение были одним кодом. */
  clone(): World {
    return new World(this.level, this.rawDefs, this.toData());
  }

  private restore(data: WorldData): void {
    this.tick = data.tick;
    this.status = data.status;
    this.rng = new Rng(data.rngState);
    this.delivered = data.delivered;
    this.orderTarget = data.orderTarget;
    this.timeLeftTicks = data.timeLeftTicks;
    this.misses = data.misses;
    this.launches = data.launches;
    this.bonusEnergy = data.bonusEnergy;
    this.wonTicksLeft = data.wonTicksLeft;
    this.deliveryTicks = data.deliveryTicks.slice();
    this.nextMachineId = data.nextMachineId;
    this.nextRobotId = data.nextRobotId;
    for (const md of data.machines) {
      const def = this.defs.get(md.type);
      if (def === undefined) throw new Error(`Нет описания машины «${md.type}»`);
      this.placeMachine(Machine.fromData(def, md));
    }
    for (const rd of data.robots) this.robots.push(Robot.fromData(rd));
  }
}
