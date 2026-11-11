// Стресс-проверка производительности (задача 10 брифа): уровень «Такт», 8 роботов, скорость ×4,
// счётчик кадров включён. Открыть: адрес игры с ?stress, например https://yussfv1.github.io/t-minus/?stress
// Роботы и программы — те же, что в стресс-тесте симуляции (src/sim/__tests__/game.test.ts).
import type { Simulation } from '../sim';
import { EXAMPLE_LEVELS } from '../sim/examples';
import type { LevelData } from '../types';
import { parseProgram } from '../ui/programModel';

export const STRESS_ID = 'stress';

export const isStressRun = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('stress');
  } catch {
    return false;
  }
};

/** «Такт» без конца: энергии хватает на 8 роботов, время и план недостижимы. */
export function stressLevel(): LevelData {
  return { ...EXAMPLE_LEVELS[3], id: STRESS_ID, titleKey: 'stress.title', energy: 100, target: 100000, timeLimit: 100000, tutorial: [] };
}

const LINE: readonly [string, number][] = [
  ['L S T R3 U S P L2', 0],
  ['L2 U S T R4 D S P L2', 1],
  ['R2 U S T D S P L2', 1],
  ['L2 D S T R4 S P L2', 2],
];

/** Поставить четырёх роботов линии и по копии каждого со сдвигом. Возвращает, сколько роботов получилось. */
export function deployStress(sim: Simulation): number {
  const ids: number[] = [];
  for (const [text, dock] of LINE) {
    if (!sim.beginTeach(dock).ok) continue;
    sim.teachInput('wait');
    const made = sim.finishTeach();
    if (made.ok && sim.setProgram(made.id, parseProgram(text)).ok) ids.push(made.id);
  }
  ids.forEach((id, i) => sim.copyRobot(id, 3 + i));
  return sim.snapshot().robots.length;
}
