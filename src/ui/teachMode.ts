// Показ роботу (репетиция в копии мира): клавиши, мышь, копии со сдвигом и конец показа.
// Игрок нажал на док — симуляция делает копию мира, и каждое нажатие (стрелка, E, Пробел или клик по клетке
// рядом) — один шаг этой копии. «Готово» на доке превращает запись в программу робота. R во время показа
// заказывает копии со сдвигом — они встанут вместе с роботом. Здесь только ввод и порядок вызовов ISimulation;
// панель и карту рисует сцена.
import type Phaser from 'phaser';
import type { FieldView } from '../render/field';
import { DEPTH } from '../render/layout';
import { TILE } from '../types';
import type { FailReason, ISimulation, SimEvent, SimSnapshot, TeachInput } from '../types';
import { audio } from './audio';
import { t } from './i18n';
import { programSteps } from './programModel';
import { teachClickInput } from './teachClick';
import { COLOR } from './theme';
import type { ToastKind } from './widgets';

/** Клавиши показа: стрелки и WASD — шаг, E — взять или положить, Пробел — ждать. */
export const TEACH_KEYS: Readonly<Record<string, TeachInput>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyE: 'act',
  Space: 'wait',
};

/** Повтор шага при удержании стрелки — не чаще, чем оператор успевает дойти. */
const REPEAT_MS = 130;
/** Больше трёх копий со сдвигом за один показ не заказать. */
const MAX_COPIES = 3;

export interface TeachHost {
  readonly sim: ISimulation;
  readonly field: FieldView;
  snap(): SimSnapshot;
  fail(reason: FailReason): void;
  toast(text: string, kind: ToastKind): void;
  playSounds(events: readonly SimEvent[]): void;
  /** Показ начался: покупку и телеметрию закрыть, панель — в режим показа. */
  began(): void;
  /** Показ закончен, робот поставлен — выбрать его на панели. */
  finished(robotId: number): void;
  cancelled(): void;
  /** Игрок что-то исправил на ходу (Think Award). */
  noteFix(): void;
}

export class TeachMode {
  /** Сколько копий со сдвигом встанет вместе с роботом из показа (панель показывает это на кнопке). */
  copies = 0;
  private replacing = false;
  private lastRepeat = 0;
  private readonly scene: Phaser.Scene;
  private readonly host: TeachHost;
  /** Рамка соседней клетки под мышью: сюда шагнёт клик. */
  private readonly hover: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, host: TeachHost) {
    this.scene = scene;
    this.host = host;
    const cell = TILE * host.field.scale;
    this.hover = scene.add.image(0, 0, 'cell_frame').setDisplaySize(cell + 6, cell + 6).setTint(COLOR.teach).setAlpha(0.85).setDepth(DEPTH.marker).setVisible(false);
  }

  /** Начать показ на доке dock; replace — переписать этого робота (он остаётся на своём доке и номере). */
  begin(dock: number, replace?: number): void {
    const r = this.host.sim.beginTeach(dock, replace);
    if (!r.ok) {
      this.host.fail(r.reason);
      return;
    }
    this.copies = 0;
    this.replacing = replace !== undefined;
    this.host.began();
    audio.play('click');
  }

  /** Клавиша во время показа. Возвращает true, если клавиша — показа (сцене она больше не нужна). */
  key(ev: KeyboardEvent): boolean {
    const input = TEACH_KEYS[ev.code];
    if (input) {
      ev.preventDefault();
      if (ev.repeat) {
        // Пробел при удержании ждёт подряд, стрелки повторяют шаг не чаще оператора.
        if (input === 'act') return true;
        if (input !== 'wait' && this.scene.time.now - this.lastRepeat < REPEAT_MS) return true;
      }
      this.lastRepeat = this.scene.time.now;
      this.input(input);
      return true;
    }
    if (ev.code === 'KeyR') {
      if (!ev.repeat) this.cycleCopies();
      return true;
    }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
      this.finish();
      return true;
    }
    return false;
  }

  /** Один шаг показа. */
  input(input: TeachInput): void {
    const r = this.host.sim.teachInput(input);
    if (!r.ok) {
      if (r.reason) this.host.fail(r.reason);
      return;
    }
    this.host.field.play(r.events);
    this.host.playSounds(r.events);
    if (input !== 'act') audio.play('step', { rate: input === 'wait' ? 0.8 : 1 });
  }

  /** Показ мышью: клик по соседней клетке — шаг, по машине перед собой — взять/положить, по себе — ждать. */
  click(cell: { x: number; y: number } | null): void {
    const s = this.host.snap();
    const op = s.operator;
    if (!op || !cell) return;
    const input = teachClickInput(op, cell, (x, y) => s.machines.some((m) => m.x === x && m.y === y));
    if (input === null) {
      this.host.toast(t('teach.clickNear'), 'info');
      return;
    }
    this.input(input);
  }

  /** Рамка под мышью — только во время показа и только там, куда клик что-то сделает. */
  updateHover(s: SimSnapshot, cell: { x: number; y: number } | null): void {
    const op = s.operator;
    const isMachine = (x: number, y: number): boolean => s.machines.some((m) => m.x === x && m.y === y);
    const show = s.mode === 'teach' && !!op && !!cell && teachClickInput(op, cell, isMachine) !== null;
    this.hover.setVisible(show);
    if (show && cell) {
      const c = this.host.field.screenCenter(cell.x, cell.y);
      this.hover.setPosition(c.x, c.y).setAlpha(0.55 + 0.3 * (0.5 + 0.5 * Math.sin(this.scene.time.now / 200)));
    }
  }

  /** «Готово» или Enter: запись становится программой робота; заказанные копии встают на тот же док. */
  finish(): void {
    const sim = this.host.sim;
    if (!sim.canFinishTeach()) {
      this.host.toast(t('teach.returnHint'), 'info');
      audio.play('error');
      return;
    }
    const r = sim.finishTeach();
    if (!r.ok) {
      this.host.fail(r.reason);
      return;
    }
    this.host.finished(r.id);
    this.host.noteFix();
    // Копии, заказанные клавишей R во время показа: встают на тот же док, сдвиг делит круг поровну.
    const copies = this.copies;
    this.copies = 0;
    if (copies === 0) return;
    const robot = sim.snapshot().robots.find((x) => x.id === r.id);
    const steps = robot ? programSteps(robot.pendingProgram ?? robot.program) : 0;
    let made = 0;
    for (let i = 1; i <= copies; i++) {
      const delay = Math.max(1, Math.round((steps * i) / (copies + 1)));
      const res = sim.copyRobot(r.id, delay);
      if (!res.ok) {
        this.host.fail(res.reason);
        break;
      }
      made++;
    }
    if (made > 0) this.host.toast(t('robot.copiedOnFinish', { n: made }), 'ok');
  }

  /** «Отменить показ»: копия мира выбрасывается, настоящий мир идёт дальше как был. */
  cancel(): void {
    this.host.sim.cancelTeach();
    this.copies = 0;
    this.host.cancelled();
    audio.play('click');
  }

  /** Сколько копий со сдвигом хватит энергии поставить вместе с роботом из показа. */
  maxCopies(s: SimSnapshot): number {
    if (s.mode !== 'teach' || s.robotCost <= 0) return s.mode === 'teach' ? MAX_COPIES : 0;
    // Перезапись робота новую энергию не тратит: он уже стоит на доке.
    const free = s.energyLeft - (this.replacing ? 0 : s.robotCost);
    return Math.max(0, Math.min(MAX_COPIES, Math.floor(free / s.robotCost)));
  }

  /** R в показе: ещё одна копия со сдвигом (0 → 1 → 2 … → 0). Не хватает энергии — подсказка. */
  cycleCopies(): void {
    const max = this.maxCopies(this.host.snap());
    if (max === 0) {
      this.copies = 0;
      this.host.fail('noEnergy');
      return;
    }
    this.copies = this.copies >= max ? 0 : this.copies + 1;
    audio.play('click');
  }
}
