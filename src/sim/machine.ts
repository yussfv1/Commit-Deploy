import {
  TICKS_PER_SECOND,
  type ItemType,
  type MachineDef,
  type MachineKind,
  type MachineState,
  type MachineType,
  type MachineView,
} from '../types';
import { BitRing } from './ring';
import type { Rng } from './rng';

/** За какое окно считается загрузка машины: последние 30 секунд. */
export const UTIL_WINDOW_TICKS = 30 * TICKS_PER_SECOND;

export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICKS_PER_SECOND));
}

/** Полное состояние машины в виде простых данных — для сохранения и копирования мира. */
export interface MachineData {
  id: number;
  type: MachineType;
  x: number;
  y: number;
  bought: boolean;
  inBuf: ItemType[];
  processing: boolean;
  remaining: number;
  total: number;
  out: ItemType | null;
  stock: number;
  timer: number;
  accepted: number;
  work: string;
  blocked: string;
}

/**
 * Машина — конечный автомат, поведение которого задаётся данными (MachineDef.kind):
 *
 *  source    — копит предметы до capacity, по одному каждые produceEvery секунд;
 *  processor — строгий цикл «загрузили → работает → забрали». Внутри только одна порция:
 *              пока идёт работа или готовый предмет не забрали, новый вход не принимается.
 *              Поэтому роботам важно попадать в такт — или ждать по ДАТЧИКУ;
 *  storage   — очередь предметов (первым пришёл — первым ушёл): буфер между роботами;
 *  sink      — принимает только целевой предмет уровня.
 */
export class Machine {
  readonly id: number;
  readonly def: MachineDef;
  readonly x: number;
  readonly y: number;
  readonly bought: boolean;

  /** processor: предметы на входе; storage: содержимое по порядку. */
  inBuf: ItemType[] = [];
  /** processor: идёт цикл. */
  processing = false;
  remaining = 0;
  total = 0;
  /** processor: готовый предмет ждёт, пока его заберут. */
  out: ItemType | null = null;
  /** source: сколько предметов накоплено. */
  stock = 0;
  timer = 0;
  /** sink: сколько предметов принято. */
  accepted = 0;

  /** Телеметрия: в какие тики машина работала и в какие стояла с неразгруженным предметом. */
  work = new BitRing(UTIL_WINDOW_TICKS);
  blocked = new BitRing(UTIL_WINDOW_TICKS);

  constructor(id: number, def: MachineDef, x: number, y: number, bought: boolean) {
    this.id = id;
    this.def = def;
    this.x = x;
    this.y = y;
    this.bought = bought;
    // Источники стартуют полными: первый предмет можно взять сразу.
    if (def.kind === 'source') this.stock = this.capacity;
  }

  get type(): MachineType {
    return this.def.type;
  }

  get kind(): MachineKind {
    return this.def.kind;
  }

  get capacity(): number {
    return this.def.capacity ?? 1;
  }

  // ───────── Взаимодействие с роботом ─────────

  canTake(): boolean {
    switch (this.def.kind) {
      case 'source':
        return this.stock > 0;
      case 'processor':
        return this.out !== null;
      case 'storage':
        return this.inBuf.length > 0;
      case 'sink':
        return false;
    }
  }

  /** Забрать предмет. Вызывать только после canTake(). */
  take(): ItemType {
    switch (this.def.kind) {
      case 'source': {
        this.stock--;
        return this.def.output as ItemType;
      }
      case 'processor': {
        const item = this.out as ItemType;
        this.out = null;
        return item;
      }
      case 'storage':
        return this.inBuf.shift() as ItemType;
      case 'sink':
        throw new Error('Со стартового стола ничего нельзя забрать');
    }
  }

  /** Примет ли машина предмет. targetItem — целевой предмет уровня (его принимает стартовый стол). */
  canPut(item: ItemType, targetItem: ItemType): boolean {
    switch (this.def.kind) {
      case 'source':
        return false;
      case 'processor': {
        if (this.processing || this.out !== null) return false;
        const need = this.def.inputs?.[item] ?? 0;
        return need > 0 && this.countInput(item) < need;
      }
      case 'storage':
        return this.inBuf.length < this.capacity;
      case 'sink':
        return item === targetItem;
    }
  }

  /** Положить предмет. Вызывать только после canPut(). */
  put(item: ItemType): void {
    if (this.def.kind === 'sink') this.accepted++;
    else this.inBuf.push(item);
  }

  // ───────── Один тик ─────────

  /** Продвинуть машину на один тик. Возвращает предмет, если он только что появился на выходе. */
  update(rng: Rng): ItemType | null {
    switch (this.def.kind) {
      case 'source':
        return this.updateSource();
      case 'processor':
        return this.updateProcessor(rng);
      case 'storage':
        this.work.push(this.inBuf.length > 0);
        this.blocked.push(this.inBuf.length >= this.capacity);
        return null;
      case 'sink':
        return null;
    }
  }

  private updateSource(): ItemType | null {
    let produced: ItemType | null = null;
    const producing = this.stock < this.capacity;
    if (producing) {
      this.timer++;
      if (this.timer >= secondsToTicks(this.def.produceEvery ?? 1)) {
        this.timer = 0;
        this.stock++;
        produced = this.def.output ?? null;
      }
    }
    this.work.push(producing);
    this.blocked.push(false);
    return produced;
  }

  private updateProcessor(rng: Rng): ItemType | null {
    let produced: ItemType | null = null;

    // Начать цикл, как только на входе собралась полная порция.
    if (!this.processing && this.out === null && this.hasAllInputs()) {
      this.inBuf.length = 0;
      this.processing = true;
      this.total = this.pickWorkTicks(rng);
      this.remaining = this.total;
    }

    // Тик, в котором цикл начался, уже считается рабочим:
    // предмет, положенный на тике T, можно забрать на тике T + время работы.
    const working = this.processing;
    if (this.processing) {
      this.remaining--;
      if (this.remaining <= 0) {
        this.processing = false;
        this.out = this.def.output ?? null;
        produced = this.out;
      }
    }

    this.work.push(working);
    this.blocked.push(!working && this.out !== null);
    return produced;
  }

  private countInput(item: ItemType): number {
    let n = 0;
    for (const it of this.inBuf) if (it === item) n++;
    return n;
  }

  private hasAllInputs(): boolean {
    const inputs = this.def.inputs;
    if (inputs === undefined) return false;
    for (const key of Object.keys(inputs) as ItemType[]) {
      if (this.countInput(key) < (inputs[key] ?? 0)) return false;
    }
    return true;
  }

  private pickWorkTicks(rng: Rng): number {
    const range = this.def.workTimeRange;
    if (range !== undefined) return rng.int(secondsToTicks(range[0]), secondsToTicks(range[1]));
    return secondsToTicks(this.def.workTime ?? 1);
  }

  // ───────── Для экрана ─────────

  state(): MachineState {
    switch (this.def.kind) {
      case 'source':
        return this.stock >= this.capacity ? 'full' : this.stock > 0 ? 'ready' : 'working';
      case 'processor':
        if (this.processing) return 'working';
        return this.out !== null ? 'ready' : 'idle';
      case 'storage':
        return this.inBuf.length >= this.capacity ? 'full' : this.inBuf.length > 0 ? 'ready' : 'idle';
      case 'sink':
        return 'idle';
    }
  }

  progress(): number {
    switch (this.def.kind) {
      case 'source':
        if (this.stock >= this.capacity) return 1;
        return this.timer / secondsToTicks(this.def.produceEvery ?? 1);
      case 'processor':
        if (this.processing) return this.total > 0 ? 1 - this.remaining / this.total : 0;
        return this.out !== null ? 1 : 0;
      default:
        return 0;
    }
  }

  toView(): MachineView {
    const kind = this.def.kind;
    let output: ItemType | null = null;
    let stock = 0;
    if (kind === 'source') {
      output = this.stock > 0 ? (this.def.output ?? null) : null;
      stock = this.stock;
    } else if (kind === 'processor') {
      output = this.out;
      stock = this.out !== null ? 1 : 0;
    } else if (kind === 'storage') {
      output = this.inBuf[0] ?? null;
      stock = this.inBuf.length;
    } else {
      stock = this.accepted;
    }
    return {
      id: this.id,
      type: this.def.type,
      kind,
      x: this.x,
      y: this.y,
      state: this.state(),
      progress: this.progress(),
      input: kind === 'processor' || kind === 'storage' ? this.inBuf.slice() : [],
      output,
      stock,
      capacity: this.capacity,
      utilization: this.work.share,
      bought: this.bought,
    };
  }

  // ───────── Сохранение ─────────

  toData(): MachineData {
    return {
      id: this.id,
      type: this.def.type,
      x: this.x,
      y: this.y,
      bought: this.bought,
      inBuf: this.inBuf.slice(),
      processing: this.processing,
      remaining: this.remaining,
      total: this.total,
      out: this.out,
      stock: this.stock,
      timer: this.timer,
      accepted: this.accepted,
      work: this.work.encode(),
      blocked: this.blocked.encode(),
    };
  }

  static fromData(def: MachineDef, data: MachineData): Machine {
    const m = new Machine(data.id, def, data.x, data.y, data.bought);
    m.inBuf = data.inBuf.slice();
    m.processing = data.processing;
    m.remaining = data.remaining;
    m.total = data.total;
    m.out = data.out;
    m.stock = data.stock;
    m.timer = data.timer;
    m.accepted = data.accepted;
    m.work = BitRing.decode(UTIL_WINDOW_TICKS, data.work);
    m.blocked = BitRing.decode(UTIL_WINDOW_TICKS, data.blocked);
    return m;
  }
}
