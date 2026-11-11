import { TICKS_PER_SECOND, type Bottleneck } from '../types';
import { THROUGHPUT_WINDOW_TICKS, type World } from './world';

/** Меньше этого времени данных слишком мало, чтобы делать выводы. */
const WARMUP_TICKS = 10 * TICKS_PER_SECOND;
/**
 * Обработчик «на пределе», если работает не меньше 60% времени. Выше почти не бывает:
 * между циклами его нужно разгрузить и загрузить, а на это уходят шаги роботов.
 */
const PROCESSOR_SATURATED = 0.6;
/** Источник «на пределе», если не меньше 90% времени занят пополнением — у него забирают всё. */
const SOURCE_SATURATED = 0.9;
/** Машину «не успевают разгружать», если она стоит с готовым предметом не меньше 30% времени. */
const BLOCKED_SHARE = 0.3;

/** Темп линии: сколько целевых предметов в минуту доставлено за последние 30 секунд. */
export function throughputPerMinute(world: World): number {
  const windowTicks = Math.max(5 * TICKS_PER_SECOND, Math.min(THROUGHPUT_WINDOW_TICKS, world.tick));
  const since = world.tick - windowTicks;
  let count = 0;
  for (const t of world.deliveryTicks) if (t > since) count++;
  return (count / (windowTicks / TICKS_PER_SECOND)) * 60;
}

/** Нужный темп: сколько предметов в минуту надо выдавать, чтобы успеть к старту. */
export function requiredPerMinute(world: World): number {
  const remaining = world.orderTarget - world.delivered;
  if (remaining <= 0) return 0;
  const secondsLeft = Math.max(1, world.timeLeftTicks / TICKS_PER_SECOND);
  return (remaining / secondsLeft) * 60;
}

/** Элемент с наибольшей оценкой среди тех, у кого она не ниже порога. */
function pickMax<T>(items: readonly T[], score: (item: T) => number, threshold: number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s >= threshold && s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Найти узкое место — то, что сильнее всего ограничивает темп линии.
 * Проверки идут от самых однозначных причин к самым общим:
 *   1. обработчик (пресс, сборщик) работает ≥ 60% времени — он на пределе;
 *   2. обработчик ≥ 30% времени стоит с готовым предметом — его не успевают разгружать;
 *   3. источник ≥ 90% времени пополняется — у него забирают всё, больше взять неоткуда;
 *   4. какой-то робот промахивается — сбит такт;
 *   5. иначе ограничивает робот с самым длинным кругом.
 * Если линия успевает или данных ещё мало, возвращает null.
 */
export function findBottleneck(world: World): Bottleneck | null {
  if (world.tick < WARMUP_TICKS || world.robots.length === 0) return null;
  const required = requiredPerMinute(world);
  if (required <= 0 || throughputPerMinute(world) >= required) return null;

  const measured = world.machines.filter((m) => m.work.samples >= WARMUP_TICKS);
  const processors = measured.filter((m) => m.kind === 'processor');
  const sources = measured.filter((m) => m.kind === 'source');

  const saturated = pickMax(processors, (m) => m.work.share, PROCESSOR_SATURATED);
  if (saturated !== null) return { kind: 'machine', id: saturated.id, reason: 'saturated' };

  const blocked = pickMax(processors, (m) => m.blocked.share, BLOCKED_SHARE);
  if (blocked !== null) return { kind: 'machine', id: blocked.id, reason: 'blocked' };

  const drained = pickMax(sources, (m) => m.work.share, SOURCE_SATURATED);
  if (drained !== null) return { kind: 'machine', id: drained.id, reason: 'saturated' };

  const missing = pickMax(world.robots, (r) => r.cycleMisses, 1);
  if (missing !== null) return { kind: 'robot', id: missing.id, reason: 'misses' };

  const slowest = pickMax(world.robots, (r) => r.cycleTicks, 1);
  if (slowest !== null) return { kind: 'robot', id: slowest.id, reason: 'slowLoop' };

  return null;
}
