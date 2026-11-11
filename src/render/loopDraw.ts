// Рисование линии петли на холсте, как линии на схеме метро: ровная, со скруглёнными углами и шевронами
// по ходу движения. Мягкий ореол — только у выбранной петли: свечение здесь означает выбор, а не украшение.
import { COLOR, rgba } from '../ui/theme';
import type { Ctx } from './canvas';
import type { Pt } from './loopPath';

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Путь по точкам со скруглением каждого угла. Радиус не больше половины соседних отрезков. */
export function roundedPath(ctx: Ctx, pts: readonly Pt[], closed: boolean, radius: number): void {
  const n = pts.length;
  ctx.beginPath();
  if (n === 0) return;
  if (n === 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    return;
  }
  const corner = (i: number): void => {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const r = Math.min(radius, dist(a, p) / 2, dist(p, b) / 2);
    const m = mid(p, b);
    if (r < 0.5) ctx.lineTo(p.x, p.y);
    else ctx.arcTo(p.x, p.y, m.x, m.y, r);
  };
  if (closed) {
    const start = mid(pts[n - 1], pts[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) corner(i);
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) corner(i);
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
}

export interface LoopStyle {
  color: number;
  /** 1 — выбранная петля, меньше — приглушённая. */
  strength: number;
  width?: number;
  dashed?: boolean;
  /** Рисовать стрелки направления на отрезках длиннее этого числа пикселей (0 — не рисовать). */
  arrowsFrom?: number;
}

export function strokeLoop(ctx: Ctx, pts: readonly Pt[], closed: boolean, style: LoopStyle): void {
  const width = style.width ?? 3;
  const k = style.strength;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, width * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = rgba(style.color, 0.8 * k);
    ctx.fill();
    return;
  }
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  roundedPath(ctx, pts, closed, 12);
  if (style.dashed) {
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = rgba(style.color, 0.95 * k);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (k >= 1) {
    ctx.strokeStyle = rgba(style.color, 0.16);
    ctx.lineWidth = width * 3;
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(style.color, Math.min(1, k));
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();

  const from = style.arrowsFrom ?? 0;
  if (from <= 0) return;
  const n = pts.length;
  const segments = closed ? n : n - 1;
  // Шеврон «›» тёмного цвета прямо на линии: направление читается, а линия остаётся цельной.
  ctx.save();
  ctx.strokeStyle = rgba(COLOR.ink, Math.min(0.85, 0.85 * k));
  ctx.lineWidth = Math.max(1.5, width * 0.45);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < segments; i += 2) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = dist(a, b);
    if (len < from) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const c = mid(a, b);
    const s = width * 0.9;
    ctx.beginPath();
    ctx.moveTo(c.x - ux * s - uy * s, c.y - uy * s + ux * s);
    ctx.lineTo(c.x + ux * s * 0.4, c.y + uy * s * 0.4);
    ctx.lineTo(c.x - ux * s + uy * s, c.y - uy * s - ux * s);
    ctx.stroke();
  }
  ctx.restore();
}
