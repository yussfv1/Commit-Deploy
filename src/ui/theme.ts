// Визуальный язык игры — мнемосхема пульта: тёмный щит, плоские плитки машин, цветные линии петель.
// Правило цвета: насыщенные цвета только у роботов и их петель (это и есть игра),
// интерфейс вокруг нейтральный, а оранжевый — только главное действие на экране и обратный отсчёт.
import { ROBOT_COLORS } from '../types';
import type { ItemType, MachineState, MachineType, RobotState } from '../types';

export { ROBOT_COLORS };

export const COLOR = {
  page: 0x09111b,
  floor: 0x0f1b2d,
  grid: 0x172739,
  chrome: 0x0b1523,
  rule: 0x1f3048,
  raised: 0x16263b,
  raisedHi: 0x1e324d,
  sunken: 0x0a1320,
  tile: 0x1a2a40,
  tileEdge: 0x2e4565,
  wall: 0x0c1625,
  wallLine: 0x1a2a40,
  text: 0xe6edf5,
  dim: 0x93a4ba,
  faint: 0x5c6e86,
  accent: 0xff7a2f,
  accentHi: 0xff925a,
  ok: 0x5cc98d,
  warn: 0xf2c14e,
  info: 0x56a8e8,
  miss: 0xf0574d,
  teach: 0x3ec1ff,
  ink: 0x07101a,
  white: 0xffffff,
  black: 0x000000,
} as const;

/** Лампочка машины: работает — зелёная, готово — жёлтая, пусто — серая, заполнено — синяя. */
export const LAMP: Record<MachineState, number> = {
  working: COLOR.ok,
  ready: COLOR.warn,
  idle: 0x44556b,
  full: COLOR.info,
};

/** Цвета состояний робота — одни и те же на карте и в полосах телеметрии. Полезное — синие и зелёный, потери — серый и красный. */
export const STATE_COLOR: Record<RobotState, number> = {
  idle: 0x2b3b52,
  move: 0x4d6c96,
  carry: 0x86b9ea,
  act: COLOR.ok,
  wait: 0x3d4c62,
  sense: COLOR.warn,
  miss: COLOR.miss,
};

export const ITEM_COLOR: Record<ItemType, number> = {
  ore: 0xc9834c,
  plate: 0xb9c7d8,
  fuel: 0x49c9b0,
  cell: 0xf2c14e,
};

export const MACHINE_TYPES: readonly MachineType[] = ['depot', 'tank', 'press', 'assembler', 'pad', 'shelf'];

/**
 * Шрифт: файл роли C, если он есть; иначе Bahnschrift — инженерный DIN, который стоит в Windows 10/11
 * (компьютер жюри), на Mac — PT Sans, сделанный для русской навигации. Оба с полной кириллицей.
 */
export const FONT = "TMinus, Bahnschrift, 'PT Sans', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/** Моноширинный — только там, где на экране код (программа робота текстом). */
export const MONO = "'PT Mono', Consolas, 'Cascadia Mono', Menlo, 'DejaVu Sans Mono', monospace";

/** Шесть размеров на всю игру: подпись, мелкий, основной, заголовок блока, заголовок экрана, крупные цифры. */
export const SIZE = { micro: 12, small: 14, body: 16, title: 20, h1: 28, display: 64 } as const;

/** Скругления по роли элемента: полосы интерфейса прямые, кнопки и панели почти прямые, плитки машин мягче. */
export const RADIUS = { chip: 3, control: 4, panel: 4, tile: 6 } as const;

/** Шаг сетки отступов. */
export const GAP = 8;

/** 0xRRGGBB → '#rrggbb' для текста и холста. */
export const css = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;

export const rgba = (color: number, alpha: number): string =>
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

/** Смесь двух цветов: t = 0 — первый, t = 1 — второй. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number): number => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export const darken = (color: number, amount: number): number => mix(color, COLOR.black, amount);

/** Цвет робота по индексу из снимка. */
export const robotColor = (colorIndex: number): number => ROBOT_COLORS[((colorIndex % ROBOT_COLORS.length) + ROBOT_COLORS.length) % ROBOT_COLORS.length];
