// Данные для панели телеметрии: полоса последнего круга каждого робота, темп линии и узкое место.
// Всё считает симуляция (RobotView.timeline, throughput, bottleneck) — здесь только раскладка для экрана.
import { TICKS_PER_SECOND } from '../types';
import type { BottleneckReason, RobotView, SimSnapshot, TimelineSegment } from '../types';

export interface RobotBar {
  robotId: number;
  colorIndex: number;
  /** Длина последнего полного круга в тиках. 0 — робот ещё не прошёл ни одного круга. */
  total: number;
  parts: readonly TimelineSegment[];
  cycleTime: number;
  usefulShare: number;
  misses: number;
}

export function robotBars(robots: readonly RobotView[]): RobotBar[] {
  return robots.map((r) => ({
    robotId: r.id,
    colorIndex: r.colorIndex,
    total: r.timeline.reduce((m, s) => Math.max(m, s.to), 0),
    parts: r.timeline,
    cycleTime: r.cycleTime,
    usefulShare: r.usefulShare,
    misses: r.cycleMisses,
  }));
}

/** Самый длинный круг: все полосы рисуются в одном масштабе, и разница в такте видна глазом. */
export const longestCycle = (bars: readonly RobotBar[]): number => bars.reduce((m, b) => Math.max(m, b.total), 0);

/** Сколько секунд в последнем круге ушло на ожидание и промахи. */
export function lostSeconds(bar: RobotBar): number {
  let ticks = 0;
  for (const s of bar.parts) if (s.state === 'wait' || s.state === 'miss') ticks += s.to - s.from;
  return ticks / TICKS_PER_SECOND;
}

export type Pace = 'none' | 'behind' | 'ok';

/** Успевает ли линия: none — данных ещё нет, behind — темп ниже нужного, ok — успеваем. */
export function pace(snap: Pick<SimSnapshot, 'throughput' | 'requiredRate' | 'delivered' | 'mode'>): Pace {
  if (snap.mode !== 'running' || (snap.delivered === 0 && snap.throughput === 0)) return 'none';
  return snap.throughput + 1e-9 >= snap.requiredRate ? 'ok' : 'behind';
}

export interface BottleneckSpot {
  kind: 'robot' | 'machine';
  id: number;
  reason: BottleneckReason;
  /** Клетка, вокруг которой мигает рамка (у робота — где он сейчас). */
  x: number;
  y: number;
}

/** Где на карте узкое место. null — линия успевает или данных мало. */
export function bottleneckSpot(snap: Pick<SimSnapshot, 'bottleneck' | 'robots' | 'machines'>): BottleneckSpot | null {
  const b = snap.bottleneck;
  if (!b) return null;
  if (b.kind === 'machine') {
    const m = snap.machines.find((x) => x.id === b.id);
    return m ? { ...b, x: m.x, y: m.y } : null;
  }
  const r = snap.robots.find((x) => x.id === b.id);
  return r ? { ...b, x: Math.round(r.x), y: Math.round(r.y) } : null;
}
