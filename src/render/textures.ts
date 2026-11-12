// Картинки, нарисованные кодом. Иконки рисуются только если роль C ещё не положила PNG
// с таким же именем в public/assets/icons/ — ключ текстуры один и тот же, остальной код разницы не видит.
//
// Стиль иконок один на всю игру: плоские пиктограммы в два тона (заливка и тёмный контур того же цвета),
// контур 2,5 px на 64 px, без бликов, теней и градиентов — как знаки на мнемосхеме.
import type Phaser from 'phaser';
import type { MachineType } from '../types';
import { COLOR, ITEM_COLOR, MACHINE_TYPES, RADIUS, css, darken, rgba } from '../ui/theme';
import { drawTexture, ensureTexture, roundRect } from './canvas';
import type { Ctx } from './canvas';

const TAU = Math.PI * 2;
const LW = 2.5;

export const iconKey = (name: string): string => `icon_${name}`;
export const tileKey = (type: MachineType): string => `tile_${type}`;

type P = readonly (readonly [number, number])[];

function shape(ctx: Ctx, fill: string | null, stroke: string | null, lw = LW): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function poly(ctx: Ctx, pts: P, fill: string | null, stroke: string | null = null, lw = LW): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  shape(ctx, fill, stroke, lw);
}

function disc(ctx: Ctx, x: number, y: number, r: number, fill: string | null, stroke: string | null = null, lw = LW): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  shape(ctx, fill, stroke, lw);
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | null, stroke: string | null = null, lw = LW): void {
  roundRect(ctx, x, y, w, h, r);
  shape(ctx, fill, stroke, lw);
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, stroke: string, lw = LW): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function starPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Цвет предмета и его тёмный контур. */
const tone = (color: number): [string, string] => [css(color), css(darken(color, 0.55))];

// ---------- иконки 64 × 64 ----------

const ICONS: Record<string, (ctx: Ctx) => void> = {
  ore(ctx) {
    const [f, e] = tone(ITEM_COLOR.ore);
    poly(ctx, [[12, 40], [18, 20], [34, 12], [50, 20], [54, 38], [42, 52], [22, 52]], f, e);
    // Одна грань темнее — объём без бликов.
    poly(ctx, [[34, 12], [50, 20], [54, 38], [36, 32]], css(darken(ITEM_COLOR.ore, 0.22)));
    poly(ctx, [[12, 40], [18, 20], [34, 12], [50, 20], [54, 38], [42, 52], [22, 52]], null, e);
  },
  plate(ctx) {
    const [f, e] = tone(ITEM_COLOR.plate);
    box(ctx, 9, 17, 46, 30, 3, f, e);
    for (const [x, y] of [[16, 24], [48, 24], [16, 40], [48, 40]] as const) disc(ctx, x, y, 2.2, e);
  },
  fuel(ctx) {
    const [f, e] = tone(ITEM_COLOR.fuel);
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.bezierCurveTo(42, 22, 50, 32, 50, 41);
    ctx.arc(32, 41, 18, 0, Math.PI, false);
    ctx.bezierCurveTo(14, 32, 22, 22, 32, 8);
    ctx.closePath();
    shape(ctx, f, e);
  },
  cell(ctx) {
    const [f, e] = tone(ITEM_COLOR.cell);
    box(ctx, 25, 6, 14, 8, 2, e);
    box(ctx, 15, 12, 34, 46, 5, f, e);
    poly(ctx, [[35, 19], [23, 37], [31, 37], [28, 51], [41, 31], [33, 31]], e);
  },
  depot(ctx) {
    const [f, e] = tone(ITEM_COLOR.ore);
    poly(ctx, [[16, 28], [24, 17], [31, 22], [39, 12], [48, 28]], f, e);
    poly(ctx, [[10, 28], [54, 28], [49, 54], [15, 54]], css(COLOR.tileEdge), css(COLOR.dim));
    line(ctx, 22, 37, 42, 37, css(COLOR.dim), 2);
    line(ctx, 24, 45, 40, 45, css(COLOR.dim), 2);
  },
  tank(ctx) {
    const [f, e] = tone(ITEM_COLOR.fuel);
    line(ctx, 23, 52, 23, 59, css(COLOR.dim), 3);
    line(ctx, 41, 52, 41, 59, css(COLOR.dim), 3);
    box(ctx, 16, 8, 32, 46, 10, css(COLOR.tileEdge), css(COLOR.dim));
    // Уровень топлива — нижняя половина бака.
    ctx.save();
    roundRect(ctx, 16, 8, 32, 46, 10);
    ctx.clip();
    ctx.fillStyle = f;
    ctx.fillRect(16, 31, 32, 23);
    ctx.restore();
    line(ctx, 17, 31, 47, 31, e, 2);
    box(ctx, 16, 8, 32, 46, 10, null, css(COLOR.dim));
  },
  press(ctx) {
    const steel = css(ITEM_COLOR.plate);
    const edge = css(darken(ITEM_COLOR.plate, 0.55));
    box(ctx, 12, 12, 6, 40, 1, steel, edge, 2);
    box(ctx, 46, 12, 6, 40, 1, steel, edge, 2);
    box(ctx, 8, 7, 48, 9, 2, steel, edge, 2);
    line(ctx, 32, 16, 32, 23, edge, 4);
    box(ctx, 21, 23, 22, 11, 2, steel, edge, 2);
    box(ctx, 21, 43, 22, 5, 1, css(ITEM_COLOR.ore));
    box(ctx, 6, 49, 52, 9, 2, steel, edge, 2);
  },
  assembler(ctx) {
    const body = css(0x9aa9bd);
    const edge = css(darken(0x9aa9bd, 0.55));
    ctx.save();
    ctx.translate(32, 32);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      roundRect(ctx, -5.5, -26, 11, 12, 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    disc(ctx, 32, 32, 17, body, edge);
    disc(ctx, 32, 32, 7, css(COLOR.tile), edge);
  },
  pad(ctx) {
    const a = css(COLOR.accent);
    box(ctx, 8, 30, 48, 24, 3, css(COLOR.tileEdge), css(COLOR.dim));
    line(ctx, 16, 42, 48, 42, css(COLOR.dim), 2);
    poly(ctx, [[32, 8], [44, 22], [36, 22], [36, 34], [28, 34], [28, 22], [20, 22]], a, css(darken(COLOR.accent, 0.5)), 2);
  },
  shelf(ctx) {
    const steel = css(COLOR.dim);
    box(ctx, 10, 8, 5, 50, 1, steel);
    box(ctx, 49, 8, 5, 50, 1, steel);
    box(ctx, 8, 26, 48, 5, 1, steel);
    box(ctx, 8, 47, 48, 5, 1, steel);
    const [of, oe] = tone(ITEM_COLOR.ore);
    const [pf, pe] = tone(ITEM_COLOR.plate);
    box(ctx, 20, 13, 12, 12, 2, of, oe, 2);
    box(ctx, 34, 35, 14, 11, 2, pf, pe, 2);
  },
  robot(ctx) {
    disc(ctx, 32, 32, 22, css(COLOR.teach), css(darken(COLOR.teach, 0.55)));
    disc(ctx, 42, 32, 7, '#ffffff');
    disc(ctx, 44, 32, 3.2, css(COLOR.ink));
  },
  /** Think Award: медаль на двух лентах, в медали — лампочка («придумал, измерил, исправил»). */
  award(ctx) {
    poly(ctx, [[17, 4], [29, 4], [35, 27], [25, 31]], css(COLOR.info), css(darken(COLOR.info, 0.5)), 2);
    poly(ctx, [[47, 4], [35, 4], [29, 27], [39, 31]], css(COLOR.accent), css(darken(COLOR.accent, 0.5)), 2);
    const gold = darken(COLOR.warn, 0.5);
    disc(ctx, 32, 41, 19, css(COLOR.warn), css(gold));
    disc(ctx, 32, 41, 13.5, null, css(darken(COLOR.warn, 0.3)), 1.5);
    disc(ctx, 32, 38, 6.2, '#fff6d2', css(gold), 1.6);
    box(ctx, 29, 44, 6, 5, 1, css(gold));
  },
  sensor(ctx) {
    const y = css(COLOR.warn);
    ctx.beginPath();
    ctx.moveTo(7, 32);
    ctx.quadraticCurveTo(32, 10, 57, 32);
    ctx.quadraticCurveTo(32, 54, 7, 32);
    ctx.closePath();
    shape(ctx, null, y, 3.5);
    disc(ctx, 32, 32, 8, y);
  },
  energy(ctx) {
    const [f, e] = tone(COLOR.warn);
    poly(ctx, [[37, 5], [14, 36], [28, 36], [24, 59], [50, 26], [35, 26]], f, e);
  },
  star(ctx) {
    const [f, e] = tone(COLOR.warn);
    starPath(ctx, 32, 34, 27, 11.5);
    shape(ctx, f, e);
  },
  star_empty(ctx) {
    starPath(ctx, 32, 34, 27, 11.5);
    shape(ctx, rgba(COLOR.white, 0.04), css(COLOR.faint));
  },
  // ---- значки для кнопок меню: белые, кнопка сама красит их в цвет своей надписи (iconTint) ----

  /** ▶ Продолжить. */
  play(ctx) {
    poly(ctx, [[20, 12], [52, 32], [20, 52]], '#ffffff', '#ffffff', 6);
  },
  /** ↻ Начать заново: дуга почти по кругу (разрыв справа сверху) и стрелка наверху, по часовой. */
  restart(ctx) {
    ctx.beginPath();
    ctx.arc(32, 35, 18, -Math.PI / 2 + 1.15, -Math.PI / 2 - 0.12);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();
    poly(ctx, [[44, 17], [30, 7], [30, 27]], '#ffffff', '#ffffff', 3);
  },
  /** ☰ К уровням: три станции на линиях, как выбор уровня в игре. */
  levels(ctx) {
    for (const y of [16, 32, 48]) {
      line(ctx, 26, y, 54, y, '#ffffff', 6);
      disc(ctx, 13, y, 5.5, '#ffffff');
    }
  },
  /** Шестерёнка (пауза, настройки): 8 зубцов и отверстие посередине. */
  gear(ctx) {
    const teeth = 8;
    const outer = 27;
    const inner = 20;
    const step = TAU / teeth;
    const top = step * 0.2; // полуширина зубца у вершины
    const root = step * 0.27; // полуширина зубца у основания
    const at = (r: number, a: number): [number, number] => [32 + Math.cos(a) * r, 32 + Math.sin(a) * r];
    ctx.beginPath();
    ctx.moveTo(...at(inner, -root));
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      // Зубец — трапеция, между зубцами — дуга по внутреннему кругу.
      ctx.lineTo(...at(outer, a - top));
      ctx.lineTo(...at(outer, a + top));
      ctx.lineTo(...at(inner, a + root));
      ctx.arc(32, 32, inner, a + root, a + step - root);
    }
    ctx.closePath();
    ctx.moveTo(32 + 8.5, 32);
    ctx.arc(32, 32, 8.5, 0, TAU, true);
    ctx.fillStyle = '#ffffff';
    ctx.fill('evenodd');
  },
};

/** Ракета 64 × 128 (PNG от роли C — 128 × 256, показывается в том же размере). Низ корпуса на y = 112. */
function drawRocket(ctx: Ctx): void {
  const body = '#e9eef5';
  const edge = css(COLOR.faint);
  const a = css(COLOR.accent);
  const ae = css(darken(COLOR.accent, 0.45));
  poly(ctx, [[17, 72], [5, 104], [17, 99]], a, ae, 2);
  poly(ctx, [[47, 72], [59, 104], [47, 99]], a, ae, 2);
  poly(ctx, [[24, 99], [40, 99], [43, 112], [21, 112]], css(COLOR.tileEdge), edge, 2);
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.bezierCurveTo(46, 22, 48, 40, 48, 58);
  ctx.lineTo(48, 100);
  ctx.lineTo(16, 100);
  ctx.lineTo(16, 58);
  ctx.bezierCurveTo(16, 40, 18, 22, 32, 4);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(10, 0, 44, 26);
  ctx.fillRect(10, 82, 44, 6);
  ctx.restore();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  disc(ctx, 32, 50, 7, css(COLOR.floor), edge, 2);
}

// ---------- плитки машин, роботы, служебные картинки ----------

/** Плитка машины 56 × 56: плоская, с тонкой обводкой. Иконка, лампа и полоска прогресса кладутся поверх. */
function drawTile(ctx: Ctx): void {
  roundRect(ctx, 0.5, 0.5, 55, 55, RADIUS.tile);
  ctx.fillStyle = css(COLOR.tile);
  ctx.fill();
  ctx.strokeStyle = css(COLOR.tileEdge);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Корпус робота 34 × 34: круг его цвета с тёмным ободом того же тона. */
function drawRobotBody(ctx: Ctx, color: number): void {
  disc(ctx, 17, 17, 13, css(color), css(darken(color, 0.55)), 2.5);
}

function radial(ctx: Ctx, size: number, inner: string, outer: string): void {
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** Текстура корпуса робота нужного цвета. Создаётся при первом обращении. */
export function robotTexture(scene: Phaser.Scene, color: number): string {
  return ensureTexture(scene, `robot_${(color & 0xffffff).toString(16)}`, 34, 34, (ctx) => drawRobotBody(ctx, color));
}

/** Вызывается один раз в Boot после загрузки ассетов: дорисовывает всё, чего не хватает. */
export function makeTextures(scene: Phaser.Scene): void {
  for (const name of Object.keys(ICONS)) {
    ensureTexture(scene, iconKey(name), 64, 64, (ctx) => ICONS[name](ctx));
  }
  ensureTexture(scene, iconKey('rocket'), 64, 128, drawRocket);
  for (const type of MACHINE_TYPES) drawTexture(scene, tileKey(type), 56, 56, drawTile);

  // Купленная машина отмечена пунктирной рамкой — её можно продать правой кнопкой.
  drawTexture(scene, 'tile_bought', 60, 60, (ctx) => {
    roundRect(ctx, 1.5, 1.5, 57, 57, RADIUS.tile + 1);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = css(COLOR.dim);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  // Стена — штриховка под 45°, как разрез на чертеже.
  drawTexture(scene, 'wall', 64, 64, (ctx) => {
    ctx.fillStyle = css(COLOR.wall);
    ctx.fillRect(0, 0, 64, 64);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 64, 64);
    ctx.clip();
    ctx.strokeStyle = css(COLOR.wallLine);
    ctx.lineWidth = 1.5;
    for (let i = -64; i < 64; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, 64);
      ctx.lineTo(i + 64, 0);
      ctx.stroke();
    }
    ctx.restore();
  });
  drawTexture(scene, 'operator', 34, 34, (ctx) => disc(ctx, 17, 17, 12.5, '#f2f6fb', css(COLOR.teach), 3));
  drawTexture(scene, 'robot_eye', 12, 12, (ctx) => {
    disc(ctx, 6, 6, 4.6, '#ffffff');
    disc(ctx, 6, 6, 2.2, css(COLOR.ink));
  });
  drawTexture(scene, 'shadow', 44, 20, (ctx) => {
    ctx.save();
    ctx.scale(1, 20 / 44);
    radial(ctx, 44, 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0)');
    ctx.restore();
  });
  drawTexture(scene, 'px', 8, 8, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 8, 8);
  });
  drawTexture(scene, 'dot', 12, 12, (ctx) => disc(ctx, 6, 6, 5, '#ffffff'));
  drawTexture(scene, 'smoke', 48, 48, (ctx) => radial(ctx, 48, 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'));
  drawTexture(scene, 'flame', 28, 56, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(24, 0);
    ctx.bezierCurveTo(28, 22, 20, 40, 14, 56);
    ctx.bezierCurveTo(8, 40, 0, 22, 4, 0);
    ctx.fillStyle = css(COLOR.accent);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(19, 0);
    ctx.bezierCurveTo(21, 14, 17, 26, 14, 34);
    ctx.bezierCurveTo(11, 26, 7, 14, 9, 0);
    ctx.fillStyle = css(COLOR.warn);
    ctx.fill();
  });
  // Стрелка-шаг для ленты блоков (смотрит вверх, поворачивается под направление).
  drawTexture(scene, 'glyph_arrow', 20, 20, (ctx) => {
    poly(ctx, [[10, 2.5], [17.5, 11], [12.5, 11], [12.5, 17.5], [7.5, 17.5], [7.5, 11], [2.5, 11]], '#ffffff');
  });
  // Стрелка обучения: показывает, куда нажать или куда идти.
  drawTexture(scene, 'tut_arrow', 40, 48, (ctx) => {
    poly(ctx, [[14, 4], [26, 4], [26, 24], [36, 24], [20, 44], [4, 24], [14, 24]], css(COLOR.text), css(COLOR.ink), 2);
  });
  drawTexture(scene, 'dock_plus', 24, 24, (ctx) => {
    line(ctx, 12, 5, 12, 19, css(COLOR.dim), 2.5);
    line(ctx, 5, 12, 19, 12, css(COLOR.dim), 2.5);
  });
  // Док в легенде над картой: кольцо с плюсом, как на поле.
  drawTexture(scene, 'dock_legend', 24, 24, (ctx) => {
    disc(ctx, 12, 12, 9, css(COLOR.floor), css(COLOR.dim), 2.5);
    line(ctx, 12, 8, 12, 16, css(COLOR.dim), 2);
    line(ctx, 8, 12, 16, 12, css(COLOR.dim), 2);
  });
  drawTexture(scene, 'miss_x', 24, 24, (ctx) => {
    line(ctx, 6, 6, 18, 18, css(COLOR.ink), 7);
    line(ctx, 18, 6, 6, 18, css(COLOR.ink), 7);
    line(ctx, 6, 6, 18, 18, css(COLOR.miss), 4);
    line(ctx, 18, 6, 6, 18, css(COLOR.miss), 4);
  });
  drawTexture(scene, 'wait_dots', 26, 8, (ctx) => {
    for (const x of [4, 13, 22]) disc(ctx, x, 4, 2.6, '#ffffff');
  });
  drawTexture(scene, 'sense_wave', 28, 18, (ctx) => {
    ctx.strokeStyle = css(COLOR.warn);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    for (const r of [5, 10, 15]) {
      ctx.beginPath();
      ctx.arc(14, 18, r, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
  });
  // Рамка выделения клетки и расходящаяся рамка эффекта: тонкая, без свечения.
  drawTexture(scene, 'cell_frame', 64, 64, (ctx) => {
    roundRect(ctx, 2, 2, 60, 60, RADIUS.tile + 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}
