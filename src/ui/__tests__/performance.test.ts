import { describe, expect, it } from 'vitest';
import { FrameGovernor } from '../../render/frameGovernor';
import { Simulation } from '../../sim';
import { EXAMPLE_DEFS } from '../../sim/examples';
import { deployStress, stressLevel } from '../../scenes/stress';
import { FrameStats } from '../frameStats';

describe('статистика кадров', () => {
  it('ровные кадры по 16,7 мс — это 60 FPS и среднее, и худшие', () => {
    const s = new FrameStats();
    for (let i = 1; i <= 120; i++) s.add(1000 / 60, i * (1000 / 60));
    const f = s.summary();
    expect(f.fps).toBeCloseTo(60, 5);
    expect(f.low).toBeCloseTo(60, 5);
    expect(f.frames).toBe(120);
  });

  it('один долгий кадр почти не двигает среднее, но виден в худших', () => {
    const s = new FrameStats();
    let now = 0;
    for (let i = 0; i < 199; i++) s.add(16, (now += 16));
    s.add(100, (now += 100));
    const f = s.summary();
    expect(f.fps).toBeGreaterThan(55);
    expect(f.low).toBeLessThan(20);
  });

  it('старые кадры выпадают из окна, паузы скрытой вкладки не считаются', () => {
    const s = new FrameStats(1000);
    s.add(50, 50);
    s.add(5000, 5050);
    s.add(10, 2000);
    expect(s.summary().frames).toBe(1);
  });
});

describe('понижение чёткости на слабом компьютере', () => {
  const run = (g: FrameGovernor, ms: number, from: number, to: number, scale: number): number | null => {
    let cap: number | null = null;
    for (let now = from; now <= to && cap === null; now += ms) cap = g.sample(ms, now, scale);
    return cap;
  };

  it('быстрые кадры чёткость не трогают', () => {
    expect(run(new FrameGovernor(), 16, 0, 20000, 1.5)).toBeNull();
  });

  it('долгие медленные кадры понижают масштаб на 0,25, но не ниже 1', () => {
    const g = new FrameGovernor();
    expect(run(g, 30, 0, 20000, 1.5)).toBe(1.25);
    expect(run(g, 30, 20000, 40000, 1.25)).toBe(1);
    expect(run(g, 30, 40000, 60000, 1)).toBeNull();
  });

  it('во время загрузки и из-за разовой заминки ничего не меняется', () => {
    const g = new FrameGovernor();
    expect(run(g, 30, 0, 2900, 1.5)).toBeNull();
    let cap: number | null = null;
    for (let now = 3000; now < 20000 && cap === null; now += 16) cap = g.sample(now % 1000 < 16 ? 300 : 16, now, 1.5);
    expect(cap).toBeNull();
  });
});

describe('стресс-проверка', () => {
  it('ставит 8 роботов, и линия на ×4 работает без сбоев', () => {
    const sim = new Simulation();
    sim.loadLevel(stressLevel(), EXAMPLE_DEFS);
    expect(deployStress(sim)).toBe(8);
    sim.start();
    for (let i = 0; i < 600; i++) sim.step((4 * 1000) / 60 / 1000);
    const s = sim.snapshot();
    expect(s.mode).toBe('running');
    expect(s.delivered).toBeGreaterThan(0);
  });
});
