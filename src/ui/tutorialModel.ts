// Обучение по шагам. Уровень перечисляет ключи подсказок в поле tutorial (их пишет роль C),
// а вид шага экран узнаёт по последней части ключа:
//
//   tutorial.clickDock      нажми на свободный док
//   tutorial.goTo_<машина>  дойди до машины и встань к ней лицом (depot, tank, press, assembler, pad, shelf)
//   tutorial.take           возьми предмет (E)
//   tutorial.put            положи предмет (E)
//   tutorial.returnDock     вернись на док
//   tutorial.finish         нажми «Готово»
//   tutorial.copy           сделай копию робота со сдвигом (клавиша R или кнопка на панели робота)
//   tutorial.secondRobot    поставь второго робота на свободный док (в показе — стрелка на пресс)
//   tutorial.start          нажми СТАРТ
//   tutorial.waitPress      подсказка в репетиции: дождись пресса (Пробел)
//   tutorial.sensor         после первого промаха: поставь ДАТЧИК
//   tutorial.telemetry      открой телеметрию (Tab)
//   любой другой ключ       простая подсказка, пропадает после старта
//
// Перед последней частью можно ставить что угодно: tutorial.l2.waitPress тоже сработает.
import { DIR_DX, DIR_DY } from '../types';
import type { LevelData, MachineType, SimSnapshot } from '../types';

export type StepKind =
  | 'clickDock'
  | 'goTo'
  | 'take'
  | 'put'
  | 'returnDock'
  | 'finish'
  | 'copy'
  | 'secondRobot'
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

export interface TutorialCtx {
  snap: SimSnapshot;
  level: LevelData;
  canFinish: boolean;
  telemetryOpen: boolean;
}

export type UiTarget = 'finish' | 'copy' | 'start' | 'telemetry';
export type Target = { kind: 'cell'; x: number; y: number } | { kind: 'ui'; id: UiTarget } | null;

const SIMPLE: readonly StepKind[] = [
  'clickDock',
  'take',
  'put',
  'returnDock',
  'finish',
  'copy',
  'secondRobot',
  'start',
  'waitPress',
  'sensor',
  'telemetry',
];
const MACHINES: readonly MachineType[] = ['depot', 'tank', 'press', 'assembler', 'pad', 'shelf'];
/** Шаги, которые имеют смысл только внутри репетиции. */
const IN_TEACH: readonly StepKind[] = ['goTo', 'take', 'put', 'returnDock', 'finish'];
/** Шаги, которым нужен хотя бы один робот или идущая репетиция. */
const NEEDS_ROBOT: readonly StepKind[] = [...IN_TEACH, 'copy', 'start'];

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
    case 'secondRobot':
      return (s.mode !== 'teach' && s.robots.length >= 2) || started(s);
    case 'start':
      return started(s);
    case 'waitPress':
      return s.delivered > 0;
    case 'sensor':
      return s.robots.some((r) => r.program.some((b) => b.op === 'sense'));
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
    if (step.kind === 'sensor') return s.misses > 0;
    if (step.kind === 'telemetry') return s.mode === 'running' && s.tick >= 200;
    if (step.kind === 'waitPress') return s.mode === 'teach';
    return true;
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
      case 'waitPress':
        return cellOf(s.machines.find((m) => m.type === (step.machine ?? 'press')));
      case 'take':
      case 'put':
        return cellOf(frontMachine(ctx));
      case 'returnDock':
        return s.operator ? cellOf(ctx.level.docks[s.operator.dock]) : null;
      case 'secondRobot':
        // В показе — на пресс (там ждать пластину), иначе — на свободный док.
        if (s.mode === 'teach') return cellOf(s.machines.find((m) => m.type === 'press'));
        return cellOf(ctx.level.docks[freeDock(ctx)]);
      case 'finish':
      case 'copy':
      case 'start':
      case 'telemetry':
        return { kind: 'ui', id: step.kind };
      default:
        return null;
    }
  }
}
