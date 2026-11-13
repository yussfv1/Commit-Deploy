import { describe, expect, it } from 'vitest';
import { pitchLevel, preparePitch } from '../../scenes/pitch';
import { Simulation } from '../../sim';
import type { Block } from '../../types';
import { levels, machineDefs } from '../levels';
import { toggleSense } from '../programModel';

describe('демо для питча', () => {
  const level = pitchLevel(levels());

  it('на уровне 4 линия уже работает, промахивается только слепой робот', () => {
    expect(level).not.toBeNull();
    if (!level) return;
    const sim = new Simulation();
    sim.loadLevel(level, machineDefs());
    const setup = preparePitch(sim);
    expect(setup).not.toBeNull();
    const id = setup?.robot ?? -1;
    // Мир на момент старта сохранён для «Заново с роботами»: в нём те же два робота, линия ещё не запущена.
    const start = new Simulation();
    start.deserialize(setup?.startSave ?? '');
    expect(start.snapshot()).toMatchObject({ mode: 'plan' });
    expect(start.snapshot().robots).toHaveLength(2);
    const s = sim.snapshot();
    expect(s.mode).toBe('running');
    expect(s.robots).toHaveLength(2);
    expect(s.misses).toBeGreaterThan(0);
    // Дальше промахи — только у слепого робота.
    const missBy = new Set<number | null>();
    for (let i = 0; i < 20 * 20; i++) for (const e of sim.step(0.05)) if (e.type === 'miss') missBy.add(e.robotId);
    expect([...missBy]).toEqual([id]);
  });

  it('датчик перед ПОЛОЖИТЬ у пресса убирает промахи — то, что ведущий показывает на сцене', () => {
    if (!level) return;
    const sim = new Simulation();
    sim.loadLevel(level, machineDefs());
    const id = preparePitch(sim)?.robot ?? -1;
    const robot = sim.snapshot().robots.find((r) => r.id === id);
    expect(robot).toBeDefined();
    if (!robot) return;
    const program: Block[] = robot.program.map((b) => ({ ...b }));
    const put = program.findIndex((b) => b.op === 'put');
    const withSense = toggleSense(program, put);
    expect(withSense).not.toBeNull();
    expect(sim.setProgram(id, withSense ?? program).ok).toBe(true);
    // Правка вступает со следующего круга: даём кругу закончиться, потом считаем промахи заново.
    for (let i = 0; i < 20 * 15; i++) sim.step(0.05);
    const before = sim.snapshot().misses;
    for (let i = 0; i < 20 * 30; i++) sim.step(0.05);
    expect(sim.snapshot().misses).toBe(before);
    expect(sim.snapshot().delivered).toBeGreaterThan(0);
  });
});
