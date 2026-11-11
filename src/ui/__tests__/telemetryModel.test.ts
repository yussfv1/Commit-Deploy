import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim';
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../../sim/examples';
import type { Block, RobotView, SimSnapshot } from '../../types';
import { bottleneckSpot, longestCycle, lostSeconds, pace, robotBars } from '../telemetryModel';

const robot = (over: Partial<RobotView>): RobotView => ({
  id: 1,
  dock: 0,
  colorIndex: 0,
  x: 2,
  y: 3,
  px: 2,
  py: 3,
  dir: 1,
  carrying: null,
  state: 'move',
  pc: 0,
  program: [],
  pendingProgram: null,
  path: [],
  hasSensor: false,
  cycleTime: 0,
  usefulShare: 0,
  cycleMisses: 0,
  timeline: [],
  ...over,
});

describe('полосы телеметрии', () => {
  it('длина полосы — конец последнего отрезка круга', () => {
    const bars = robotBars([
      robot({ id: 1, timeline: [{ state: 'move', from: 0, to: 20 }, { state: 'wait', from: 20, to: 40 }] }),
      robot({ id: 2, timeline: [{ state: 'carry', from: 0, to: 60 }] }),
      robot({ id: 3 }),
    ]);
    expect(bars.map((b) => b.total)).toEqual([40, 60, 0]);
    expect(longestCycle(bars)).toBe(60);
    expect(lostSeconds(bars[0])).toBe(1);
  });

  it('темп: пока ничего не доставлено — оценки нет', () => {
    expect(pace({ mode: 'plan', throughput: 0, requiredRate: 3, delivered: 0 })).toBe('none');
    expect(pace({ mode: 'running', throughput: 0, requiredRate: 3, delivered: 0 })).toBe('none');
    expect(pace({ mode: 'running', throughput: 2.1, requiredRate: 3.2, delivered: 2 })).toBe('behind');
    expect(pace({ mode: 'running', throughput: 3.2, requiredRate: 3.2, delivered: 4 })).toBe('ok');
  });
});

describe('узкое место на карте', () => {
  it('рамка вокруг машины или робота из снимка', () => {
    const machines = [{ id: 7, x: 5, y: 1 }] as unknown as SimSnapshot['machines'];
    const robots = [robot({ id: 2, x: 3.4, y: 2 })];
    expect(bottleneckSpot({ bottleneck: { kind: 'machine', id: 7, reason: 'saturated' }, machines, robots })).toEqual({
      kind: 'machine',
      id: 7,
      reason: 'saturated',
      x: 5,
      y: 1,
    });
    expect(bottleneckSpot({ bottleneck: { kind: 'robot', id: 2, reason: 'misses' }, machines, robots })).toMatchObject({ x: 3, y: 2 });
    expect(bottleneckSpot({ bottleneck: null, machines, robots })).toBeNull();
    expect(bottleneckSpot({ bottleneck: { kind: 'robot', id: 99, reason: 'slowLoop' }, machines, robots })).toBeNull();
  });

  it('на настоящей симуляции полоса появляется после первого круга', () => {
    const sim = new Simulation();
    sim.loadLevel(EXAMPLE_LEVELS[0], EXAMPLE_DEFS);
    sim.beginTeach(0);
    sim.teachInput('wait');
    const made = sim.finishTeach();
    expect(made.ok).toBe(true);
    const id = made.ok ? made.id : -1;
    const program: Block[] = [{ op: 'left' }, { op: 'take' }, ...Array.from({ length: 7 }, (): Block => ({ op: 'right' })), { op: 'put' }];
    for (let i = 0; i < 6; i++) program.push({ op: 'left' });
    expect(sim.setProgram(id, program).ok).toBe(true);
    sim.start();
    for (let i = 0; i < 100; i++) sim.step(0.05);
    const bars = robotBars(sim.snapshot().robots);
    expect(bars).toHaveLength(1);
    expect(bars[0].total).toBeGreaterThan(0);
    expect(bars[0].cycleTime).toBeGreaterThan(0);
  });
});
