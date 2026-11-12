// Каждый уровень игры проходим эталонным решением и проверяем, что «неправильное» решение
// (один робот вместо двух, робот без датчика) не проходит. Так баланс уровней проверяется тестом,
// а не на глаз: поменяли цифры в levelN.json — тест сразу скажет, проходим ли уровень.
import { describe, expect, it } from 'vitest';
import { deploy, must } from '../../sim/__tests__/helpers';
import { Simulation } from '../../sim/simulation';
import type { LevelData, SimSnapshot } from '../../types';
import { levels, machineDefs } from '../../ui/levels';

const byId = (id: string): LevelData => {
  const level = levels().find((l) => l.id === id);
  if (!level) throw new Error(`нет уровня ${id}`);
  return level;
};

/** Поставить роботов с готовыми программами (и копии со сдвигом), запустить и прожить всё время уровня. */
function play(id: string, robots: [program: string, dock: number, copyDelay?: number][], seconds?: number): SimSnapshot {
  const level = byId(id);
  const sim = new Simulation();
  sim.loadLevel(level, machineDefs());
  for (const [program, dock, copyDelay] of robots) {
    const robot = deploy(sim, program, dock);
    if (copyDelay !== undefined) must(sim.copyRobot(robot, copyDelay));
  }
  sim.start();
  sim.advanceTicks(((seconds ?? level.timeLimit) + 1) * 20);
  return sim.snapshot();
}

describe('уровни игры: эталонные решения', () => {
  it('в игре шесть уровней, последний — бесконечный', () => {
    expect(levels().map((l) => l.id)).toEqual(['level1', 'level2', 'level3', 'level4', 'level5', 'level6']);
    expect(byId('level6').endless).toBeDefined();
  });

  it('1 · Первый урок: один робот носит руду', () => {
    expect(play('level1', [['L T R7 P L6', 0]])).toMatchObject({ mode: 'won', stars: 3, misses: 0 });
  });

  it('2 · Вдвоём быстрее: одному не успеть, копия со сдвигом успевает', () => {
    const route = 'L T R8 D3 P U3 L7';
    expect(play('level2', [[route, 0]]).mode).toBe('lost');
    expect(play('level2', [[route, 0, 12]])).toMatchObject({ mode: 'won', stars: 3, misses: 0 });
  });

  it('3 · Пресс: двое передают пластины через пресс, один — не успевает', () => {
    // Круги одинаковой длины — три звезды; запись «как получилось» (круги разной длины) проходит на две.
    expect(play('level3', [['L U T D2 R2 P U2 L W1', 0], ['U2 L W1 T D2 R2 D P L', 1]])).toMatchObject({ mode: 'won', stars: 3 });
    expect(play('level3', [['L U T D2 R2 P U2 L', 0], ['U2 L W7 T D2 R2 D P L', 1]])).toMatchObject({ mode: 'won', stars: 2 });
    expect(play('level3', [['L U T D2 R2 P W8 T D2 R4 D P U4 L5', 0]]).mode).toBe('lost');
  });

  it('4 · Слепой робот: с датчиками без промахов, вслепую — промахи и срыв старта', () => {
    expect(play('level4', [['U R2 U T D S P L2', 0], ['L2 U S T D P R2 U', 1]])).toMatchObject({ mode: 'won', stars: 3, misses: 0 });
    const blind = play('level4', [['U R2 U T D P L2 W2', 0], ['L2 U W3 T D P R2 U', 1]]);
    expect(blind.mode).toBe('lost');
    expect(blind.misses).toBeGreaterThan(0);
  });

  it('5 · Такт: три робота с датчиками собирают ячейки', () => {
    const line: [string, number][] = [
      ['L S T R3 U S P L2', 0], // руда → пресс
      ['L2 U S T R4 D S P L2', 1], // пластина → сборщик
      ['L2 U S T D S P S T R4 S P L2', 2], // топливо → сборщик, ячейка → стол
    ];
    expect(play('level5', line)).toMatchObject({ mode: 'won', stars: 3, misses: 0 });
  });

  it('6 · Окно запуска: та же линия в зеркале держит несколько запусков', () => {
    const line: [string, number][] = [
      ['R S T L3 U S P R2', 0],
      ['R2 U S T L4 D S P R2', 1],
      ['R2 U S T D S P S T L4 S P R2', 2],
    ];
    expect(play('level6', line, 45 * 5)).toMatchObject({ mode: 'running', launches: 5 });
  });
});
