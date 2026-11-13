// Авария «линия встала» и «Заново с роботами» — на настоящей симуляции и настоящих уровнях игры.
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim/simulation';
import type { LevelData } from '../../types';
import { levels, machineDefs } from '../levels';
import { parseProgram } from '../programModel';
import { applyReplay, captureReplay } from '../replay';
import { STALL_CYCLES, StallWatch } from '../stallModel';
import type { Stall } from '../stallModel';

const level = (id: string): LevelData => {
  const l = levels().find((x) => x.id === id);
  if (!l) throw new Error(`нет уровня ${id}`);
  return l;
};

function load(id: string): Simulation {
  const sim = new Simulation();
  sim.loadLevel(level(id), machineDefs());
  return sim;
}

/** Поставить робота с готовой программой, как это делает экран демо: показ из одного ожидания и правка. */
function deploy(sim: Simulation, text: string, dock: number): number {
  if (!sim.beginTeach(dock).ok) throw new Error('показ не начался');
  sim.teachInput('wait');
  const made = sim.finishTeach();
  if (!made.ok) throw new Error(`робот не встал: ${made.reason}`);
  const p = sim.setProgram(made.id, parseProgram(text));
  if (!p.ok) throw new Error(`программа отклонена: ${p.reason}`);
  return made.id;
}

/** Прожить линию кадрами по 50 мс, как экран: события → датчик аварии. Когда впервые встала и почему. */
function watch(sim: Simulation, seconds: number, w = new StallWatch()): { at: number | null; stall: Stall | null } {
  for (let i = 1; i <= seconds * 20; i++) {
    w.feed(sim.step(0.05));
    const stall = w.check(sim.snapshot());
    if (stall) return { at: i / 20, stall };
  }
  return { at: null, stall: null };
}

/** Один робот на уровне 4 делает всё сам и ждёт пресс Пробелом 2 с — пресс работает от 1,5 до 3,5 с. */
const BLIND_ALONE = 'U R2 U T D P W8 T R D3 L D P L2 U3';
/** Тот же робот с ДАТЧИКОМ перед «взять» у пресса. */
const SENSED_ALONE = 'U R2 U T D P S T R D3 L D P L2 U3';

const REFERENCE: Record<string, [string, number][]> = {
  level1: [['L T R7 P L6', 0]],
  level3: [['L U T D2 R2 P U2 L W1', 0], ['U2 L W1 T D2 R2 D P L', 1]],
  level4: [['U R2 U T D S P L2', 0], ['L2 U S T D P R2 U', 1]],
  level5: [['L S T R3 U S P L2', 0], ['L2 U S T R4 D S P L2', 1], ['L2 U S T D S P S T R4 S P L2', 2]],
  level6: [['R S T L3 U S P R2', 0], ['R2 U S T L4 D S P R2', 1], ['R2 U S T D S P S T L4 S P R2', 2]],
};

describe('авария: линия встала', () => {
  it('слепой одиночка на уровне 4 встаёт во взаимную блокировку, и экран называет причину', () => {
    const sim = load('level4');
    deploy(sim, BLIND_ALONE, 0);
    sim.start();
    const { at, stall } = watch(sim, 80);
    expect(at).not.toBeNull();
    expect(at as number).toBeLessThan(40);
    expect(stall).toMatchObject({ kind: 'deadlock', item: 'ore', machineType: 'press', output: 'plate' });
    // И это правда навсегда: ещё минута — ни одной доставки.
    const delivered = sim.snapshot().delivered;
    sim.advanceTicks(60 * 20);
    expect(sim.snapshot().delivered).toBe(delivered);
  });

  it('эталонные линии всех уровней и демо питча ни разу не поднимают тревогу', () => {
    for (const [id, line] of Object.entries(REFERENCE)) {
      const sim = load(id);
      for (const [text, dock] of line) deploy(sim, text, dock);
      sim.start();
      const lvl = level(id);
      expect(watch(sim, lvl.endless ? 45 * 4 : lvl.timeLimit).at, id).toBeNull();
    }
    // Демо питча: слепой подающий промахивается, но забирающий с датчиком держит линию живой.
    const pitch = load('level4');
    deploy(pitch, 'U R2 U T D P L2', 0);
    deploy(pitch, 'L2 U S T D P R2 U', 1);
    pitch.start();
    expect(watch(pitch, level('level4').timeLimit).at).toBeNull();
  });

  it('слабая, но живая линия — не авария: два слепых робота промахиваются, а тревоги нет', () => {
    const sim = load('level4');
    deploy(sim, 'U R2 U T D P L2 W2', 0);
    deploy(sim, 'L2 U W3 T D P R2 U', 1);
    sim.start();
    expect(watch(sim, level('level4').timeLimit).at).toBeNull();
    expect(sim.snapshot().misses).toBeGreaterThan(0);
  });

  it('робот, который только ходит, — тоже остановка: ничего не берёт и не кладёт', () => {
    const sim = load('level1');
    deploy(sim, 'R2 L2', 0);
    sim.start();
    const { stall } = watch(sim, 30);
    expect(stall?.kind).toBe('idle');
  });

  it('тревога снимается, как только на линии снова что-то взяли или положили', () => {
    const w = new StallWatch();
    const robots = [{ id: 1, carrying: 'ore', cycleMisses: 2 }] as never;
    const machines = [{ id: 9, kind: 'processor', type: 'press', output: 'plate', stock: 0, capacity: 1 }] as never;
    const ev = (type: string): never => ({ type, robotId: 1, x: 0, y: 0, machineId: null, item: null, value: 0 }) as never;
    for (let i = 0; i < STALL_CYCLES; i++) w.feed([ev('miss'), ev('cycle')]);
    expect(w.check({ mode: 'running', robots, machines })?.kind).toBe('deadlock');
    expect(w.check({ mode: 'won', robots, machines })).toBeNull();
    w.feed([ev('took')]);
    expect(w.check({ mode: 'running', robots, machines })).toBeNull();
  });
});

describe('«Заново с роботами»', () => {
  it('после блокировки: датчик поставлен — мир с момента «Старт», робот с новой программой, линия больше не встаёт', () => {
    const sim = load('level4');
    const id = deploy(sim, BLIND_ALONE, 0);
    const startSave = sim.serialize();
    sim.start();
    expect(watch(sim, 80).stall?.kind).toBe('deadlock');
    // Игрок ставит датчик на ходу: правка ждёт конца круга и сама блокировку уже не снимает.
    expect(sim.setProgram(id, parseProgram(SENSED_ALONE)).ok).toBe(true);
    const replay = captureReplay(startSave, sim.snapshot());
    expect(replay).not.toBeNull();

    const again = load('level4');
    const result = applyReplay(again, replay!);
    expect(result).toEqual({ restored: 1, failed: 0 });
    const s = again.snapshot();
    expect(s.mode).toBe('plan');
    expect(s.timeLeft).toBe(level('level4').timeLimit);
    expect(s.robots[0].program).toEqual(parseProgram(SENSED_ALONE));
    again.start();
    expect(watch(again, level('level4').timeLimit).at).toBeNull();
    expect(again.snapshot().delivered).toBeGreaterThan(0);
    expect(again.snapshot().misses).toBe(0);
  });

  it('убранные после старта роботы уходят, новые встают: копия — со сдвигом на том же доке, свой путь — заново', () => {
    const sim = load('level3');
    const a = deploy(sim, 'L U T D2 R2 P U2 L W1', 0);
    const b = deploy(sim, 'U2 L W1 T D2 R2 D P L', 1);
    const startSave = sim.serialize();
    sim.start();
    sim.advanceTicks(200);
    expect(sim.removeRobot(b).ok).toBe(true);
    expect(sim.copyRobot(a, 6).ok).toBe(true);
    const replay = captureReplay(startSave, sim.snapshot())!;

    const again = load('level3');
    expect(applyReplay(again, replay)).toEqual({ restored: 2, failed: 0 });
    const robots = again.snapshot().robots;
    expect(robots.map((r) => r.dock)).toEqual([0, 0]);
    expect(robots.some((r) => r.id === b)).toBe(false);
    expect(robots[1].program).toEqual(robots[0].program);
  });

  it('без мира на момент «Старт» перезапускать не с чего', () => {
    expect(captureReplay(null, { robots: [] })).toBeNull();
  });

  it('робот, на которого энергии на момент «Старт» не хватает, не встаёт, но остальные на месте', () => {
    // Бесконечный уровень: энергию дают запуски. Робот, поставленный на неё, при перезапуске не помещается.
    const sim = load('level6');
    for (const [text, dock] of REFERENCE.level6) deploy(sim, text, dock);
    const startSave = sim.serialize();
    sim.start();
    sim.advanceTicks(95 * 20);
    expect(sim.snapshot().launches).toBeGreaterThanOrEqual(2);
    expect(sim.copyRobot(sim.snapshot().robots[0].id, 4).ok).toBe(true);
    const replay = captureReplay(startSave, sim.snapshot())!;
    const again = load('level6');
    expect(applyReplay(again, replay)).toEqual({ restored: 3, failed: 1 });
  });

  it('повреждённое сохранение — исключение (экран тогда начинает уровень с нуля)', () => {
    expect(() => applyReplay(load('level1'), { save: '{"version":0}', robots: [] })).toThrow();
  });
});

describe('тексты аварии', () => {
  it('у каждой причины есть текст причины и текст «что делать»', async () => {
    const { i18n } = await import('../i18n');
    const { stallTextKeys } = await import('../stallModel');
    for (const kind of ['deadlock', 'full', 'idle'] as const) {
      const keys = stallTextKeys(kind);
      expect(i18n.has(keys.cause), keys.cause).toBe(true);
      expect(i18n.has(keys.fix), keys.fix).toBe(true);
    }
  });
});
