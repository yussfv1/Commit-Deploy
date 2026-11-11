// Демо для питча (план команды): уровень 3, линия уже работает, но один робот «вслепую» промахивается у пресса.
// Открыть: адрес игры с ?pitch. Ведущий выбирает слепого робота, ставит ДАТЧИК перед ПОЛОЖИТЬ — промахи прекращаются.
// Линия из двух роботов, а не один: одиночный слепой робот навсегда застревает с рудой в руках, если пресс занят,
// и датчик его уже не спасает. Программы — из эталонного теста симуляции «Слепой робот».
// Если роль C поменяет карту уровня 3, программы нужно поправить здесь (PITCH_LINE).
import type { Simulation } from '../sim';
import type { LevelData } from '../types';
import { parseProgram } from '../ui/programModel';

/** Подающий носит руду в пресс вслепую и упирается в занятый пресс. Забирающий ждёт пластину ДАТЧИКОМ. */
const PITCH_LINE: readonly [string, number][] = [
  ['L T R4 U P L3', 0],
  ['L3 U S T R5 P L2', 1],
];
/** Сколько секунд линия уже проработала, когда открывается демо: промахи сразу видны. */
const WARMUP_SECONDS = 10;

export const isPitchRun = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('pitch');
  } catch {
    return false;
  }
};

/** Уровень демо — третий в списке уровней (на нём уже есть ДАТЧИК). */
export const pitchLevel = (all: readonly LevelData[]): LevelData | null => all[2] ?? null;

/**
 * Поставить линию, запустить отсчёт и прожить несколько секунд.
 * Возвращает id слепого робота (его ведущий будет править) или null, если программы не подходят к карте.
 */
export function preparePitch(sim: Simulation): number | null {
  const ids: number[] = [];
  for (const [text, dock] of PITCH_LINE) {
    if (!sim.beginTeach(dock).ok) return null;
    sim.teachInput('wait');
    const made = sim.finishTeach();
    if (!made.ok) return null;
    if (!sim.setProgram(made.id, parseProgram(text)).ok) {
      sim.removeRobot(made.id);
      for (const id of ids) sim.removeRobot(id);
      return null;
    }
    ids.push(made.id);
  }
  sim.start();
  for (let i = 0; i < WARMUP_SECONDS * 20; i++) sim.step(0.05);
  return ids[0];
}
