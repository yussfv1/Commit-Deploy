// Движение вдоль ломаной: по расстоянию от начала находим точку на линии.
// Нужно для огоньков, бегущих по петле робота, и для фона меню.
import type { Pt } from './loopPath';

export interface Track {
  points: Pt[];
  closed: boolean;
  /** Длины отрезков: i-й отрезок идёт от точки i к точке i + 1 (у замкнутой — последний ведёт к началу). */
  lengths: number[];
  total: number;
}

export function makeTrack(points: readonly Pt[], closed: boolean): Track {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  const segments = n < 2 ? 0 : closed ? n : n - 1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(d);
    total += d;
  }
  return { points: pts, closed, lengths, total };
}

/** Точка на расстоянии distance от начала. Замкнутая дорожка идёт по кругу, разомкнутая упирается в концы. */
export function pointAt(track: Track, distance: number): Pt {
  const { points, lengths, total, closed } = track;
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || total <= 0) return { x: points[0].x, y: points[0].y };
  let d = closed ? ((distance % total) + total) % total : Math.min(total, Math.max(0, distance));
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len > 0 && d <= len) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const t = d / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= len;
  }
  const end = closed ? points[0] : points[points.length - 1];
  return { x: end.x, y: end.y };
}
