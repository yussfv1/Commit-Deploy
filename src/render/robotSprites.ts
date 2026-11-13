// Пиксельные роботы: маленькие человечки 16 × 16 с большой головой, светящимися глазами на тёмном визоре
// и лампочкой на антенне. Кадр собирается из частей (голова, корпус, руки, ноги) по картам пикселей
// и рисуется в один лист текстуры на каждый цвет робота — один раз, при первом появлении такого робота.
//
// Анимации:
//   idle0 / idle1 — стоит и «дышит» (голова опускается на пиксель), blink — моргает;
//   walk0..walk3 — шаг: опора левой, проход (корпус выше), опора правой, проход. Руки ходят в противофазе.
// Ракурсы: down (лицом к нам), up (спиной), side (вправо; влево — тот же кадр, отражённый по горизонтали).
import Phaser from 'phaser';
import { css, darken, lighten } from '../ui/theme';
import { paintedCanvas } from './canvas';

/** Размер кадра в пикселях рисунка. */
export const ROBOT_PX = 16;
/** Во сколько раз пиксель рисунка крупнее пикселя текстуры: дальше лист масштабируется без сглаживания. */
const P = 4;

export type RobotView3 = 'down' | 'up' | 'side';
export const ROBOT_FRAMES = ['idle0', 'idle1', 'blink', 'walk0', 'walk1', 'walk2', 'walk3'] as const;
export type RobotFrame = (typeof ROBOT_FRAMES)[number];
const VIEWS: readonly RobotView3[] = ['down', 'up', 'side'];

type Part = readonly string[];

// ---------- части рисунка ----------
// o — контур, B — цвет робота, L — блик, D — тень, v — визор, w — отблеск на визоре,
// E — глаз, g — нижняя половина глаза (свечение), n — тёмный металл, m — светлый металл,
// a — лампочка антенны, c — огонёк на груди, «.» — прозрачно.

// Голова 12 × 8 (сбоку 11 × 8) на строках 2–9, корпус на 10–12, ноги на 13–15, антенна на 0–1.
// Руки, кисти и ботинки без тёмного контура и в цвет робота: на тёмном полу контур не виден,
// а светлые конечности держат силуэт.
const HEAD_FRONT: Part = [
  '..oooooooo..',
  '.oLLLLLLLLo.',
  'oLBBBBBBBBBo',
  'oBvwvvvvvvBo',
  'oBvEEvvEEvBo',
  'oBvggvvggvDo',
  'oDBBBBBBBBDo',
  '.oooooooooo.',
];
const HEAD_FRONT_BLINK: Part = [
  '..oooooooo..',
  '.oLLLLLLLLo.',
  'oLBBBBBBBBBo',
  'oBvwvvvvvvBo',
  'oBvvvvvvvvBo',
  'oBvEEvvEEvDo',
  'oDBBBBBBBBDo',
  '.oooooooooo.',
];
const HEAD_BACK: Part = [
  '..oooooooo..',
  '.oLLLLLLLLo.',
  'oLBBBBBBBBBo',
  'oBBnnnnnnBBo',
  'oBBnmmmmnBBo',
  'oBBnnnnnnBDo',
  'oDBBBBBBBBDo',
  '.oooooooooo.',
];
const HEAD_SIDE: Part = [
  '..ooooooo..',
  '.oLLLLLLLo.',
  'oLBBBBBBBBo',
  'oBBBBBvvvwo',
  'oBBnBBvvEEo',
  'oBBnBBvvggo',
  'oDBBBBBBBDo',
  '.ooooooooo.',
];
const HEAD_SIDE_BLINK: Part = [
  '..ooooooo..',
  '.oLLLLLLLo.',
  'oLBBBBBBBBo',
  'oBBBBBvvvwo',
  'oBBnBBvvvvo',
  'oBBnBBvvEEo',
  'oDBBBBBBBDo',
  '.ooooooooo.',
];
const ANTENNA: Part = ['aa', 'nn'];
const TORSO_FRONT: Part = ['oLBBBBDo', 'oBBccBDo', 'oDDDDDDo'];
const TORSO_BACK: Part = ['oLBBBBDo', 'oBnmmnDo', 'oDDDDDDo'];
const TORSO_SIDE: Part = ['oLBBDo', 'oBBBDo', 'oDDDDo'];
const ARM_LEFT: Part = ['mm', 'mn', 'BB'];
const ARM_RIGHT: Part = ['mm', 'nm', 'BB'];
const ARM_SIDE: Part = ['mm', 'mn', 'BB'];
// Ближняя нога светлая, дальняя (сбоку) — тёмная. На опоре поднятая нога короче на пиксель.
const LEG: Part = ['mn', 'mn', 'DD'];
const LEG_LONG: Part = ['mn', 'mn', 'mn', 'DD'];
const LEG_UP: Part = ['mn', 'DD'];
const LEG_FAR: Part = ['nn', 'nn', 'oo'];
const LEG_FAR_LONG: Part = ['nn', 'nn', 'nn', 'oo'];

interface Palette {
  [ch: string]: string;
}

function palette(color: number): Palette {
  return {
    o: '#121826',
    B: css(color),
    L: css(lighten(color, 0.38)),
    D: css(darken(color, 0.32)),
    v: '#0b1220',
    w: '#ffffff',
    E: '#c9fbff',
    g: '#3fc6ee',
    n: '#5f6b7d',
    m: '#aab6c6',
    a: '#ff5f57',
    c: '#c9fbff',
  };
}

type Grid = string[][];

const blank = (): Grid => Array.from({ length: ROBOT_PX }, () => new Array<string>(ROBOT_PX).fill('.'));

function put(grid: Grid, part: Part, x: number, y: number): void {
  part.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const ch = row[dx];
      const gx = x + dx;
      const gy = y + dy;
      if (ch !== '.' && gx >= 0 && gy >= 0 && gx < ROBOT_PX && gy < ROBOT_PX) grid[gy][gx] = ch;
    }
  });
}

/** Собрать один кадр: ноги, корпус, руки, голова, антенна — в таком порядке, чтобы верхние части перекрывали нижние. */
export function composeFrame(view: RobotView3, frame: RobotFrame): Grid {
  const g = blank();
  const walk = frame.startsWith('walk') ? Number(frame.slice(4)) : -1;
  const passing = walk === 1 || walk === 3;
  // Корпус выше на проходе шага, голова «дышит» вниз на idle1.
  const bodyDy = passing ? -1 : 0;
  const headDy = bodyDy + (frame === 'idle1' ? 1 : 0);
  const blink = frame === 'blink';

  if (view === 'side') {
    // Ноги ножницами: ближняя (светлая) и дальняя (тёмная) меняются местами.
    if (passing) {
      put(g, LEG_FAR_LONG, 7, 12);
      put(g, LEG_LONG, 7, 12);
    } else if (walk === 0) {
      put(g, LEG_FAR, 5, 13);
      put(g, LEG, 9, 13);
    } else if (walk === 2) {
      put(g, LEG_FAR, 9, 13);
      put(g, LEG, 5, 13);
    } else {
      put(g, LEG_FAR, 6, 13);
      put(g, LEG, 8, 13);
    }
    put(g, TORSO_SIDE, 5, 10 + bodyDy);
    // Рука ходит против ближней ноги.
    const armX = walk === 0 ? 5 : walk === 2 ? 9 : 7;
    put(g, ARM_SIDE, armX, 10 + bodyDy);
    // Антенна рисуется до головы: на подъёме шага голова накрывает её ножку — лампочка «пружинит».
    put(g, ANTENNA, 6, Math.max(0, headDy));
    put(g, blink ? HEAD_SIDE_BLINK : HEAD_SIDE, 3, 2 + headDy);
    return g;
  }

  // Спереди и сзади: на опоре одна нога приподнята, на проходе обе вытянуты.
  const leftUp = walk === 2;
  const rightUp = walk === 0;
  if (passing) {
    put(g, LEG_LONG, 5, 12);
    put(g, LEG_LONG, 9, 12);
  } else {
    put(g, leftUp ? LEG_UP : LEG, 5, 13);
    put(g, rightUp ? LEG_UP : LEG, 9, 13);
  }
  put(g, view === 'up' ? TORSO_BACK : TORSO_FRONT, 4, 10 + bodyDy);
  // Руки: вперёд уходит та, что против шагающей ноги (на пиксель выше).
  put(g, ARM_LEFT, 2, 10 + bodyDy - (walk === 0 ? 1 : 0));
  put(g, ARM_RIGHT, 12, 10 + bodyDy - (walk === 2 ? 1 : 0));
  const head = view === 'up' ? HEAD_BACK : blink ? HEAD_FRONT_BLINK : HEAD_FRONT;
  put(g, ANTENNA, 7, Math.max(0, headDy));
  put(g, head, 2, 2 + headDy);
  return g;
}

export const robotFrameName = (view: RobotView3, frame: RobotFrame): string => `${view}_${frame}`;

/**
 * Лист кадров робота нужного цвета: 7 кадров в ряд, ракурсы друг под другом.
 * Создаётся один раз на цвет и живёт, пока жива игра (текстуры общие для всех сцен).
 */
export function robotSheet(scene: Phaser.Scene, color: number): string {
  const key = `rsheet_${css(color).slice(1)}`;
  if (scene.textures.exists(key)) return key;
  const fw = ROBOT_PX * P;
  const pal = palette(color);
  // Кадры рисуем на холсте заранее и отдаём Phaser готовый лист (см. paintedCanvas в render/canvas.ts).
  const canvas = paintedCanvas(fw * ROBOT_FRAMES.length, fw * VIEWS.length, (ctx) => {
    VIEWS.forEach((view, row) => {
      ROBOT_FRAMES.forEach((frame, col) => {
        const grid = composeFrame(view, frame);
        for (let y = 0; y < ROBOT_PX; y++) {
          for (let x = 0; x < ROBOT_PX; x++) {
            const ch = grid[y][x];
            if (ch === '.') continue;
            ctx.fillStyle = pal[ch] ?? '#ff00ff';
            ctx.fillRect(col * fw + x * P, row * fw + y * P, P, P);
          }
        }
      });
    });
  });
  const tex = canvas ? scene.textures.addCanvas(key, canvas) : null;
  if (!tex) return '__DEFAULT';
  VIEWS.forEach((view, row) => {
    ROBOT_FRAMES.forEach((frame, col) => tex.add(robotFrameName(view, frame), 0, col * fw, row * fw, fw, fw));
  });
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** Ракурс по направлению движения: 0 — вверх (спиной), 1 — вправо, 2 — вниз (лицом), 3 — влево. */
export function viewOf(dir: number): { view: RobotView3; flip: boolean } {
  if (dir === 0) return { view: 'up', flip: false };
  if (dir === 2) return { view: 'down', flip: false };
  return { view: 'side', flip: dir === 3 };
}

/**
 * Кадр шага по пройденному пути: полный цикл из 4 кадров — на две клетки, кадры меняются каждые полклетки.
 * travelled — дробная позиция робота вдоль пути (x + y), поэтому шаг не зависит от скорости игры.
 */
export function walkFrame(travelled: number): RobotFrame {
  const phase = (((travelled * 2) % 4) + 4) % 4;
  return ROBOT_FRAMES[3 + Math.floor(phase)];
}
