// Обучение по шагам. Уровень перечисляет ключи подсказок в поле tutorial (их пишет роль C),
// а вид шага экран узнаёт по последней части ключа:
//
//   tutorial.clickDock      нажми на свободный док
//   tutorial.goTo_<машина>  дойди до машины и встань к ней лицом (depot, tank, press, assembler, pad, shelf)
//   tutorial.take           возьми предмет (E)
//   tutorial.put            положи предмет (E)
//   tutorial.returnDock     вернись на док
//   tutorial.finish         нажми «Готово»
//   tutorial.copy           сделай копию робота со сдвигом (кнопка на панели робота)
//   tutorial.start          нажми СТАРТ
//   tutorial.waitPress      в репетиции у работающего пресса с пустыми руками: дождись готовой пластины (Пробел)
//   tutorial.sensor         после первого промаха: поставь ДАТЧИК (промах на «положить» — текст tutorial.sensorPut)
//   tutorial.telemetry      открой телеметрию (Tab)
//   любой другой ключ       простая подсказка, пропадает после старта
//
// Перед последней частью можно ставить что угодно: tutorial.l2.waitPress тоже сработает.
import { DIR_DX, DIR_DY } from '../types';
import type { ItemType, LevelData, MachineType, Op, SimSnapshot } from '../types';

export type StepKind =
  | 'clickDock'
  | 'goTo'
  | 'take'
  | 'put'
  | 'returnDock'
  | 'finish'
  | 'copy'
  | 'start'
  | 'waitPress'
  | 'sensor'
  | 'telemetry'
  | 'info';

export interface Step {
  key: string;
  kind: StepKind;
  machine?: MachineType;
}

/** Последний промах робота в настоящем мире: кто и на каком действии (с грузом в руках — «положить»). */
export interface MissInfo {
  robotId: number;
  op: 'take' | 'put';
}

export interface TutorialCtx {
  snap: SimSnapshot;
  level: LevelData;
  canFinish: boolean;
  telemetryOpen: boolean;
  /** Для подсказки про датчик: кто промахнулся, какой робот выбран на панели и какой блок в нём выделен. */
  lastMiss?: MissInfo | null;
  selectedRobot?: number | null;
  picked?: Op | null;
}

export type UiTarget = 'finish' | 'copy' | 'start' | 'telemetry' | 'sense';
export type Target =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'ui'; id: UiTarget }
  /** Робот на карте (стрелка едет вместе с ним). */
  | { kind: 'robot'; id: number }
  /** Блок программы выбранного робота на панели. */
  | { kind: 'block'; index: number }
  | null;

const SIMPLE: readonly StepKind[] = [
  'clickDock',
  'take',
  'put',
  'returnDock',
  'finish',
  'copy',
  'start',
  'waitPress',
  'sensor',
  'telemetry',
];
const MACHINES: readonly MachineType[] = ['depot', 'tank', 'press', 'assembler', 'pad', 'shelf'];
/** То, что выдают обработчики: за этим и ждут у пресса или сборщика. */
const PROCESSED: readonly ItemType[] = ['plate', 'cell'];
/** Шаги, которые имеют смысл только внутри репетиции. */
const IN_TEACH: readonly StepKind[] = ['goTo', 'take', 'put', 'returnDock', 'finish'];
/** Шаги, которым нужен хотя бы один робот или идущая репетиция. */
const NEEDS_ROBOT: readonly StepKind[] = [...IN_TEACH, 'copy', 'start'];
/** Шаги, которые выполняются вне показа (кнопки панели робота, СТАРТ, Tab): пока идёт показ, о них молчим. */
const OUTSIDE_TEACH: readonly StepKind[] = ['copy', 'start', 'sensor', 'telemetry'];

export function parseStep(key: string): Step {
  const tail = key.slice(key.lastIndexOf('.') + 1);
  const cut = tail.indexOf('_');
  const name = cut < 0 ? tail : tail.slice(0, cut);
  const arg = cut < 0 ? '' : tail.slice(cut + 1);
  if (name === 'goTo') {
    return MACHINES.includes(arg as MachineType) ? { key, kind: 'goTo', machine: arg as MachineType } : { key, kind: 'info' };
  }
  return { key, kind: SIMPLE.includes(name as StepKind) ? (name as StepKind) : 'info' };
}

function frontMachine(ctx: TutorialCtx): SimSnapshot['machines'][number] | undefined {
  const o = ctx.snap.operator;
  if (!o) return undefined;
  const fx = o.x + DIR_DX[o.dir];
  const fy = o.y + DIR_DY[o.dir];
  return ctx.snap.machines.find((m) => m.x === fx && m.y === fy);
}

function freeDock(ctx: TutorialCtx): number {
  return ctx.level.docks.findIndex((_, i) => !ctx.snap.robots.some((r) => r.dock === i));
}

const started = (s: SimSnapshot): boolean => s.mode === 'running' || s.mode === 'won' || s.mode === 'lost';

function done(step: Step, ctx: TutorialCtx): boolean {
  const s = ctx.snap;
  switch (step.kind) {
    case 'clickDock':
      return s.mode === 'teach' || s.robots.length > 0;
    case 'goTo':
      return frontMachine(ctx)?.type === step.machine;
    case 'take':
      return s.operator !== null && s.operator.carrying !== null;
    case 'put':
      return s.recording.some((b) => b.op === 'put');
    case 'returnDock':
      return ctx.canFinish;
    case 'finish':
      return s.mode !== 'teach' && s.robots.length > 0;
    case 'copy':
      // Копия встаёт на тот же док со сдвигом по времени. Нет энергии на второго робота — шаг пропускаем.
      return s.robots.length >= 2 || s.energyLeft < s.robotCost || started(s);
    case 'start':
      return started(s);
    case 'waitPress':
      // Пройден, как только игрок дождался и взял пластину (или ячейку) — не нужно ждать доставки.
      return started(s) || s.delivered > 0 || (s.operator !== null && PROCESSED.includes(s.operator.carrying as ItemType));
    case 'sensor':
      // Правка с датчиком вступает с нового круга, но игрок уже сделал то, о чём просили.
      return s.robots.some((r) => (r.pendingProgram ?? r.program).some((b) => b.op === 'sense'));
    case 'telemetry':
      return ctx.telemetryOpen;
    default:
      return started(s);
  }
}

export class TutorialFlow {
  private readonly steps: Step[];
  private index = 0;

  constructor(keys: readonly string[]) {
    this.steps = keys.map(parseStep);
  }

  update(ctx: TutorialCtx): void {
    const s = ctx.snap;
    const cur = this.steps[this.index];
    // Роботов нет и репетиция не идёт (её отменили или робота убрали): шаги репетиции, «скопируй» и «старт»
    // выполнять не с чем, поэтому возвращаемся к шагу «нажми на док».
    if (cur && s.mode !== 'teach' && s.robots.length === 0 && NEEDS_ROBOT.includes(cur.kind)) {
      let i = this.index;
      while (i > 0 && this.steps[i].kind !== 'clickDock') i--;
      if (this.steps[i].kind === 'clickDock') this.index = i;
    }
    // Робот уже стоит на доке — шаги репетиции считаются пройденными, даже если мы их не видели.
    const deployed = s.mode !== 'teach' && s.robots.length > 0;
    while (this.index < this.steps.length) {
      const step = this.steps[this.index];
      if (!(deployed && IN_TEACH.includes(step.kind)) && !done(step, ctx)) break;
      this.index++;
    }
  }

  current(): Step | null {
    return this.steps[this.index] ?? null;
  }

  finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** Подсказки по ситуации видны не всегда: про датчик — после промаха, про телеметрию — когда линия уже работает. */
  visible(ctx: TutorialCtx): boolean {
    const step = this.current();
    if (!step) return false;
    const s = ctx.snap;
    if (s.mode === 'teach' && OUTSIDE_TEACH.includes(step.kind)) return false;
    if (step.kind === 'sensor') return s.misses > 0;
    if (step.kind === 'telemetry') return s.mode === 'running' && s.tick >= 200;
    if (step.kind === 'waitPress') {
      // Только когда ждать действительно нужно: стоишь у работающего пресса с пустыми руками и не ты его загрузил.
      const m = frontMachine(ctx);
      const last = s.recording[s.recording.length - 1];
      return s.mode === 'teach' && s.operator?.carrying === null && m?.kind === 'processor' && m.state === 'working' && last?.op !== 'put';
    }
    return true;
  }

  /**
   * Ключ текста шага. Подсказка про датчик говорит про то действие, на котором робот промахнулся:
   * с грузом в руках он промахивается на «положить», с пустыми — на «взять».
   */
  textKey(ctx: TutorialCtx): string | null {
    const step = this.current();
    if (!step) return null;
    if (step.kind === 'sensor' && ctx.lastMiss?.op === 'put') return 'tutorial.sensorPut';
    return step.key;
  }

  /** Куда показывает стрелка: клетка поля или элемент интерфейса. */
  target(ctx: TutorialCtx): Target {
    const step = this.current();
    if (!step) return null;
    const s = ctx.snap;
    const cellOf = (m: { x: number; y: number } | undefined): Target => (m ? { kind: 'cell', x: m.x, y: m.y } : null);
    switch (step.kind) {
      case 'clickDock':
        return cellOf(ctx.level.docks[freeDock(ctx)]);
      case 'goTo':
        return cellOf(s.machines.find((m) => m.type === step.machine));
      case 'waitPress':
        return cellOf(frontMachine(ctx) ?? s.machines.find((m) => m.type === 'press'));
      case 'take':
      case 'put':
        return cellOf(frontMachine(ctx));
      case 'returnDock':
        return s.operator ? cellOf(ctx.level.docks[s.operator.dock]) : null;
      case 'finish':
      case 'copy':
      case 'start':
      case 'telemetry':
        return { kind: 'ui', id: step.kind };
      case 'sensor':
        return sensorTarget(ctx);
      default:
        return null;
    }
  }
}

/**
 * Подсказка про датчик ведёт по шагам: стрелка над роботом, который промахнулся → рамка вокруг блока,
 * на котором он промахнулся → рамка вокруг кнопки «Датчик». Не знаем, где был промах, — блок не угадываем.
 */
function sensorTarget(ctx: TutorialCtx): Target {
  const s = ctx.snap;
  const miss = ctx.lastMiss ?? null;
  const robot = ctx.selectedRobot === null || ctx.selectedRobot === undefined ? undefined : s.robots.find((r) => r.id === ctx.selectedRobot);
  if (robot) {
    if (ctx.picked === 'take' || ctx.picked === 'put') return { kind: 'ui', id: 'sense' };
    if (!miss || miss.robotId !== robot.id) return null;
    const p = robot.pendingProgram ?? robot.program;
    const index = p.findIndex((b, i) => b.op === miss.op && p[i - 1]?.op !== 'sense');
    return index >= 0 ? { kind: 'block', index } : null;
  }
  return miss && s.robots.some((r) => r.id === miss.robotId) ? { kind: 'robot', id: miss.robotId } : null;
}
