// «Заново с роботами»: мир начинается заново с момента «Старт», но роботы и их программы остаются.
// Это цикл инженера: запустил → увидел, что не так → поправил программу → перезапустил с теми же роботами.
// Симуляцию не меняем: в момент «Старт» экран сохраняет мир (ISimulation.serialize), а при перезапуске
// загружает его (deserialize) и раздаёт роботам их текущие программы — с правками, которые ещё ждали конца круга.
import type { Block, ISimulation, SimSnapshot } from '../types';
import { programSteps } from './programModel';

export interface ReplayRobot {
  id: number;
  dock: number;
  program: Block[];
}

export interface Replay {
  /** Мир в момент «Старт» (режим plan, роботы на доках). */
  save: string;
  /** Роботы сейчас: у кого какая программа. */
  robots: ReplayRobot[];
}

export interface ReplayResult {
  /** Сколько роботов стоит после перезапуска. */
  restored: number;
  /** Сколько вернуть не удалось (обычно — не хватило энергии: её дали запуски, которых ещё не было). */
  failed: number;
}

const copyProgram = (p: readonly Block[]): Block[] => p.map((b) => ({ ...b }));
const sameProgram = (a: readonly Block[], b: readonly Block[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Снять линию для перезапуска. Без мира на момент «Старт» перезапускать не с чего — null. */
export function captureReplay(startSave: string | null, s: Pick<SimSnapshot, 'robots'>): Replay | null {
  if (!startSave) return null;
  return {
    save: startSave,
    robots: s.robots.map((r) => ({ id: r.id, dock: r.dock, program: copyProgram(r.pendingProgram ?? r.program) })),
  };
}

/**
 * Загрузить мир с момента «Старт» и вернуть роботов с их программами.
 * Роботы, которых игрок убрал после старта, уходят; поставленные после старта встают заново:
 * копия (тот же док и та же программа) — со сдвигом на долю круга, как клавишей R, остальные — как новый показ.
 * Бросает исключение, если сохранение не читается, — тогда экран начинает уровень с нуля.
 */
export function applyReplay(sim: ISimulation, replay: Replay): ReplayResult {
  sim.deserialize(replay.save);
  const wanted = new Map(replay.robots.map((r) => [r.id, r]));
  let failed = 0;
  for (const robot of sim.snapshot().robots) {
    const now = wanted.get(robot.id);
    if (!now) {
      sim.removeRobot(robot.id);
      continue;
    }
    wanted.delete(robot.id);
    if (!sameProgram(robot.program, now.program) && !sim.setProgram(robot.id, copyProgram(now.program)).ok) failed++;
  }
  for (const now of wanted.values()) {
    const s = sim.snapshot();
    const twin = s.robots.find((r) => r.dock === now.dock && sameProgram(r.program, now.program));
    if (twin) {
      const onDock = s.robots.filter((r) => r.dock === now.dock).length;
      const delay = Math.max(1, Math.round((programSteps(now.program) * onDock) / (onDock + 1)));
      if (!sim.copyRobot(twin.id, delay).ok) failed++;
      continue;
    }
    if (!sim.beginTeach(now.dock).ok) {
      failed++;
      continue;
    }
    sim.teachInput('wait');
    const made = sim.finishTeach();
    if (!made.ok) {
      sim.cancelTeach();
      failed++;
      continue;
    }
    if (!sim.setProgram(made.id, copyProgram(now.program)).ok) {
      sim.removeRobot(made.id);
      failed++;
    }
  }
  return { restored: sim.snapshot().robots.length, failed };
}
