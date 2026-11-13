// Авария «линия встала» на экране: следит за событиями (ui/stallModel), показывает карточку (ui/alarmCard)
// с причиной и выходом, подаёт сигнал и отмечает на карте машину или робота, на которых всё встало.
import type Phaser from 'phaser';
import type { BottleneckMark } from '../render/field';
import type { SimEvent, SimSnapshot } from '../types';
import { AlarmCard } from './alarmCard';
import { audio } from './audio';
import { t } from './i18n';
import { StallWatch, stallTextKeys } from './stallModel';
import type { Stall } from './stallModel';

export class StallAlarm {
  readonly card: AlarmCard;
  private readonly watch = new StallWatch();
  private stalled: Stall | null = null;
  private readonly numberOf: (robotId: number) => number;

  constructor(scene: Phaser.Scene, numberOf: (robotId: number) => number, onReplay: () => void) {
    this.card = new AlarmCard(scene, onReplay);
    this.numberOf = numberOf;
  }

  get visible(): boolean {
    return this.card.visible;
  }

  /** Точка на карточке — такой клик не для карты. */
  contains(x: number, y: number): boolean {
    return this.card.contains(x, y);
  }

  /** «Старт»: считаем круги заново. */
  reset(): void {
    this.watch.reset();
    this.stalled = null;
    this.card.hide();
  }

  feed(events: readonly SimEvent[]): void {
    this.watch.feed(events);
  }

  /** Каждый кадр. Уровень закончился — карточку прячем, а причину помним: её покажут итоги. */
  update(s: SimSnapshot, ended: boolean): void {
    if (ended) {
      this.card.hide();
      return;
    }
    const stall = this.watch.check(s);
    if (stall && !this.stalled) audio.play('alarm');
    this.stalled = stall;
    const text = this.texts();
    if (text) this.card.show(text.cause, text.fix);
    else this.card.hide();
  }

  /** Причина и что делать — для карточки и для итогов. null — линия жива. */
  texts(): { cause: string; fix: string } | null {
    const st = this.stalled;
    if (!st) return null;
    const keys = stallTextKeys(st.kind);
    // Номер робота — как на панели; машина — строчными, она в середине фразы.
    const params = {
      n: this.numberOf(st.robotId),
      item: st.item ? t(`item.${st.item}.name`) : '',
      machine: st.machineType ? t(`machine.${st.machineType}.name`).toLocaleLowerCase('ru') : '',
      output: st.output ? t(`item.${st.output}.name`) : '',
    };
    return { cause: t(keys.cause, params), fix: t(keys.fix, params) };
  }

  /** Где на карте пульсирует рамка аварии: машина, на которой всё встало, или робот. */
  mark(s: SimSnapshot): BottleneckMark | null {
    const st = this.stalled;
    if (!st) return null;
    const m = st.machineId === null ? undefined : s.machines.find((x) => x.id === st.machineId);
    if (m) return { kind: 'machine', id: m.id, x: m.x, y: m.y };
    const r = s.robots.find((x) => x.id === st.robotId);
    return r ? { kind: 'robot', id: r.id, x: Math.round(r.x), y: Math.round(r.y) } : null;
  }
}
