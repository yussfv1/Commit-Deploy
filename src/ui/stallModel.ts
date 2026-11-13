// «Линия встала»: экран сам замечает, что линия больше ничего не делает, и объясняет почему.
//
// Главный случай — взаимная блокировка (deadlock). Слепой робот промахнулся у пресса: пластина осталась в прессе,
// а робот на следующем круге пришёл с рудой. Пресс не примет руду, пока в нём пластина, а забрать пластину
// робот не может — руки заняты. Каждый ждёт другого, и это навсегда: датчик, поставленный потом, уже не поможет.
//
// Признак по событиям, без догадок о программах: каждый робот на линии прошёл не меньше STALL_CYCLES полных кругов,
// а ни одно «взять» или «положить» за это время не удалось. Медленная, но живая линия так не выглядит: в ней
// кто-нибудь да берёт или кладёт. Причину ищем по снимку: у кого что в руках и какая машина держит готовое.
import { OPERATOR_ID } from '../types';
import type { ItemType, MachineType, SimEvent, SimSnapshot } from '../types';

/** Сколько полных кругов каждого робота подряд без единого удачного действия значит «линия встала». */
export const STALL_CYCLES = 2;

/**
 * deadlock — у робота груз, а обработчик (пресс, сборщик) держит готовое, которое некому забрать;
 * full — у робота груз, а полка заполнена; idle — роботы ходят, но ни одно действие не срабатывает.
 */
export type StallKind = 'deadlock' | 'full' | 'idle';

export interface Stall {
  kind: StallKind;
  /** Робот, о котором говорит подсказка (у него груз, или он чаще всех промахивался). */
  robotId: number;
  /** Что у робота в руках. */
  item: ItemType | null;
  /** Машина, на которой всё встало (для deadlock и full). */
  machineId: number | null;
  machineType: MachineType | null;
  /** Что лежит в этой машине. */
  output: ItemType | null;
}

export class StallWatch {
  /** Сколько полных кругов прошёл каждый робот с последнего удачного действия на линии. */
  private readonly cycles = new Map<number, number>();

  reset(): void {
    this.cycles.clear();
  }

  /** События настоящего мира за кадр. Действия игрока в показе не считаются. */
  feed(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.robotId === null || e.robotId === OPERATOR_ID) continue;
      if (e.type === 'took' || e.type === 'put') this.cycles.clear();
      else if (e.type === 'cycle') this.cycles.set(e.robotId, (this.cycles.get(e.robotId) ?? 0) + 1);
    }
  }

  /** Встала ли линия сейчас и почему. Только пока линия работает и на ней есть роботы. */
  check(s: Pick<SimSnapshot, 'mode' | 'robots' | 'machines'>): Stall | null {
    if (s.mode !== 'running' || s.robots.length === 0) return null;
    for (const r of s.robots) if ((this.cycles.get(r.id) ?? 0) < STALL_CYCLES) return null;
    return stallCause(s);
  }
}

/** Причина остановки по снимку: кто держит груз и где он не может его оставить. */
export function stallCause(s: Pick<SimSnapshot, 'robots' | 'machines'>): Stall {
  // Робот с грузом, который промахивался чаще всех, — главный участник блокировки.
  const loaded = s.robots.filter((r) => r.carrying !== null).sort((a, b) => b.cycleMisses - a.cycleMisses || a.id - b.id);
  const holder = s.machines.find((m) => m.kind === 'processor' && m.output !== null);
  const full = s.machines.find((m) => m.kind === 'storage' && m.capacity > 0 && m.stock >= m.capacity);
  const robot = loaded[0];
  if (robot && holder) {
    return { kind: 'deadlock', robotId: robot.id, item: robot.carrying, machineId: holder.id, machineType: holder.type, output: holder.output };
  }
  if (robot && full) {
    return { kind: 'full', robotId: robot.id, item: robot.carrying, machineId: full.id, machineType: full.type, output: null };
  }
  const missing = [...s.robots].sort((a, b) => b.cycleMisses - a.cycleMisses || a.id - b.id)[0];
  return { kind: 'idle', robotId: missing.id, item: missing.carrying, machineId: null, machineType: null, output: null };
}

/** Ключи текста: причина и что делать. */
export const stallTextKeys = (kind: StallKind): { cause: string; fix: string } => ({
  cause: `stall.${kind}`,
  fix: `stall.${kind}Fix`,
});
