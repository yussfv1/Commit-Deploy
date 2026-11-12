// Раскладка экрана 1280×720: сверху полоса, слева поле 16×9 клеток, справа панель, снизу телеметрия.
import { TILE } from '../types';

export const W = 1280;
export const H = 720;
export const TOP_H = 56;
export const BOTTOM_H = 88;
export const PANEL_W = 256;

export const FIELD = { x: 0, y: TOP_H, w: W - PANEL_W, h: H - TOP_H - BOTTOM_H } as const;
export const PANEL = { x: W - PANEL_W, y: TOP_H, w: PANEL_W, h: H - TOP_H - BOTTOM_H } as const;
export const BOTTOM = { x: 0, y: H - BOTTOM_H, w: W, h: BOTTOM_H } as const;

/** Порядок слоёв: чем больше число, тем выше объект. */
export const DEPTH = {
  floor: 0,
  loops: 5,
  docks: 6,
  machines: 10,
  rocket: 14,
  robots: 20,
  operator: 22,
  tint: 26,
  fx: 30,
  marker: 40,
  ui: 100,
  uiTop: 150,
  modal: 200,
  toast: 300,
  debug: 400,
} as const;

export interface FieldOrigin {
  ox: number;
  oy: number;
}

/** Левый верхний угол уровня: уровень меньше 16×9 стоит по центру поля. */
export function fieldOrigin(levelW: number, levelH: number): FieldOrigin {
  return {
    ox: FIELD.x + Math.round((FIELD.w - levelW * TILE) / 2),
    oy: FIELD.y + Math.round((FIELD.h - levelH * TILE) / 2),
  };
}

/** Центр клетки на экране. tile — размер клетки на экране (у уменьшенной карты в меню он меньше 64). */
export function cellCenter(o: FieldOrigin, x: number, y: number, tile: number = TILE): { x: number; y: number } {
  return { x: o.ox + (x + 0.5) * tile, y: o.oy + (y + 0.5) * tile };
}

/** Клетка под точкой экрана или null, если точка вне уровня. */
export function cellAt(
  o: FieldOrigin,
  px: number,
  py: number,
  levelW: number,
  levelH: number,
  tile: number = TILE,
): { x: number; y: number } | null {
  const x = Math.floor((px - o.ox) / tile);
  const y = Math.floor((py - o.oy) / tile);
  return x >= 0 && y >= 0 && x < levelW && y < levelH ? { x, y } : null;
}
