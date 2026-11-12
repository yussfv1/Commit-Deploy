// Визуальный язык игры — мнемосхема пульта: тёмный щит, плоские плитки машин, цветные линии петель.
// Правило цвета: насыщенные цвета только у роботов и их петель (это и есть игра),
// интерфейс вокруг нейтральный, а оранжевый — только главное действие на экране и обратный отсчёт.
import { ROBOT_COLORS } from '../types';
import type { ItemType, MachineState, MachineType, RobotState } from '../types';
import { store } from './storage';
import type { ThemeName } from './storage';

export { ROBOT_COLORS };

/** Тёмная тема — основная: ночной пульт управления. */
const DARK = {
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
  /** Надпись на плашке цвета text (включённый переключатель): в тёмной теме тёмная, в светлой — белая. */
  onText: 0x07101a,
  white: 0xffffff,
  black: 0x000000,
} as const;

type ColorName = keyof typeof DARK;

/**
 * Светлая тема — тот же пульт днём: светлый щит, белое поле, тёмный текст.
 * Яркие цвета чуть темнее, чтобы жёлтое и зелёное читалось на белом. ink остаётся тёмным:
 * это цвет надписей на цветных плашках и зрачков роботов.
 */
const LIGHT: Record<ColorName, number> = {
  page: 0xe7ecf2,
  floor: 0xf8fafc,
  grid: 0xe1e7ef,
  chrome: 0xffffff,
  rule: 0xd2dae5,
  raised: 0xeef2f7,
  raisedHi: 0xe2e9f2,
  sunken: 0xdfe5ed,
  tile: 0xedf1f6,
  tileEdge: 0xb9c5d4,
  wall: 0xdde3eb,
  wallLine: 0xc3ccd8,
  text: 0x142235,
  dim: 0x4c5d74,
  faint: 0x8392a7,
  accent: 0xf26b1d,
  accentHi: 0xff8a45,
  ok: 0x23a06b,
  warn: 0xd99a12,
  info: 0x2f80d0,
  miss: 0xdc3f35,
  teach: 0x1a9fe0,
  ink: 0x07101a,
  onText: 0xffffff,
  white: 0xffffff,
  black: 0x000000,
};

/** Тема выбирается один раз при запуске: смена в настройках перезапускает игру. */
export const THEME: ThemeName = store.settings().theme;

export const COLOR: Readonly<Record<ColorName, number>> = THEME === 'light' ? LIGHT : DARK;

/** Цвета роботов для светлой темы: те же оттенки, но темнее — петли видны на белом поле. */
const ROBOT_COLORS_LIGHT = [0x1e95dc, 0xd9a400, 0x2aa82a, 0xe0327c, 0x7d52e6, 0xec7414, 0x12a98a, 0xd83a37] as const;

/** Лампочка машины: работает — зелёная, готово — жёлтая, пусто — серая, заполнено — синяя. */
export const LAMP: Record<MachineState, number> = {
  working: COLOR.ok,
  ready: COLOR.warn,
  idle: THEME === 'light' ? 0xa5b1c2 : 0x44556b,
  full: COLOR.info,
};

/** Цвета состояний робота — одни и те же на карте и в полосах телеметрии. Полезное — синие и зелёный, потери — серый и красный. */
export const STATE_COLOR: Record<RobotState, number> =
  THEME === 'light'
    ? { idle: 0xc9d2de, move: 0x7f9bbf, carry: 0x3f86c9, act: COLOR.ok, wait: 0xa9b5c5, sense: COLOR.warn, miss: COLOR.miss }
    : { idle: 0x2b3b52, move: 0x4d6c96, carry: 0x86b9ea, act: COLOR.ok, wait: 0x3d4c62, sense: COLOR.warn, miss: COLOR.miss };

export const ITEM_COLOR: Record<ItemType, number> = {
  ore: 0xc9834c,
  plate: 0xb9c7d8,
  fuel: 0x49c9b0,
  cell: 0xf2c14e,
};

export const MACHINE_TYPES: readonly MachineType[] = ['depot', 'tank', 'press', 'assembler', 'pad', 'shelf'];

/**
 * Шрифт: файл роли C — Nunito (OFL) из public/assets/fonts, со скруглёнными концами, как линии логотипа.
 * Если файл не загрузился — Bahnschrift из Windows 10/11, на Mac — PT Sans. Все с полной кириллицей.
 */
export const FONT = "TMinus, Bahnschrift, 'PT Sans', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/**
 * Толщина букв. Обычный текст чуть плотнее стандартного (600 вместо 400): на холсте нет ClearType,
 * и тонкие линии выглядят мыльными. Жирный — 800.
 */
export const WEIGHT = { normal: '600', bold: '800' } as const;
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
/** Светлее к белому — блик на корпусе пиксельного робота (render/robotSprites.ts). */
export const lighten = (color: number, amount: number): number => mix(color, COLOR.white, amount);

/** Цвет робота по индексу из снимка (в светлой теме — более тёмный вариант того же оттенка). */
export const robotColor = (colorIndex: number): number => {
  const list = THEME === 'light' ? ROBOT_COLORS_LIGHT : ROBOT_COLORS;
  return list[((colorIndex % list.length) + list.length) % list.length];
};
