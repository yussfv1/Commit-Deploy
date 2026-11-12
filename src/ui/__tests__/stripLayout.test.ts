import { describe, expect, it } from 'vitest';
import { STRIP } from '../../render/layout';
import {
  LEGEND_ICON_W,
  LOOP_ROBOT_W,
  LOOP_ROBOT_W_MIN,
  STRIP_APART,
  fitStrip,
  legendWidth,
  loopButtons,
  loopPickerWidth,
} from '../stripLayout';

// Ширины кнопок легенды, снятые в браузере: «Руда», «Топливо», «Пресс», «Сборщик», «Ракета», «Док робота» (уровни 5–6)
// и «Руда», «Пресс», «Ракета», «Док робота» (уровень 4).
const BIG = [98, 123, 106, 126, 110, 140];
const SMALL = [98, 106, 110, 140];
const LABEL = 45;

const used = (legend: readonly number[], robots: number, right = 0): number => {
  const f = fitStrip({ width: STRIP.w, legendFull: legendWidth(legend), legendIcons: legendWidth(legend.map(() => LEGEND_ICON_W)), labelW: LABEL, robots, right });
  const left = f.icons ? legendWidth(legend.map(() => LEGEND_ICON_W)) : legendWidth(legend);
  const rightPart = robots > 0 ? loopPickerWidth(robots, f.robotW, LABEL, f.label) : right;
  return left + STRIP_APART + rightPart;
};

describe('полоса над картой', () => {
  it('легенда и выбор петель не налезают друг на друга при любом числе роботов до 16', () => {
    for (const legend of [BIG, SMALL]) {
      for (let robots = 0; robots <= 16; robots++) expect(used(legend, robots)).toBeLessThanOrEqual(STRIP.w);
    }
  });

  it('пока места хватает, легенда остаётся с надписями, а у петель есть подпись', () => {
    const f = fitStrip({ width: STRIP.w, legendFull: legendWidth(SMALL), legendIcons: legendWidth(SMALL.map(() => LEGEND_ICON_W)), labelW: LABEL, robots: 2 });
    expect(f).toEqual({ icons: false, label: true, robotW: LOOP_ROBOT_W });
  });

  it('на уровне «Такт» четыре робота помещаются рядом с полной легендой', () => {
    const f = fitStrip({ width: STRIP.w, legendFull: legendWidth(BIG), legendIcons: legendWidth(BIG.map(() => LEGEND_ICON_W)), labelW: LABEL, robots: 4 });
    expect(f.icons).toBe(false);
  });

  it('когда роботов много, легенда сжимается до значков, а кнопки роботов не уже минимума', () => {
    const f = fitStrip({ width: STRIP.w, legendFull: legendWidth(BIG), legendIcons: legendWidth(BIG.map(() => LEGEND_ICON_W)), labelW: LABEL, robots: 10 });
    expect(f.icons).toBe(true);
    expect(f.robotW).toBeGreaterThanOrEqual(LOOP_ROBOT_W_MIN);
  });

  it('в режиме обучения легенда уступает место плашке справа', () => {
    expect(used(BIG, 0, 300)).toBeLessThanOrEqual(STRIP.w);
    const f = fitStrip({ width: STRIP.w, legendFull: legendWidth(BIG), legendIcons: legendWidth(BIG.map(() => LEGEND_ICON_W)), labelW: LABEL, robots: 0, right: 300 });
    expect(f.icons).toBe(true);
    const g = fitStrip({ width: STRIP.w, legendFull: legendWidth(SMALL), legendIcons: legendWidth(SMALL.map(() => LEGEND_ICON_W)), labelW: LABEL, robots: 0, right: 300 });
    expect(g.icons).toBe(false);
  });

  it('номера на кнопках петель — как «Робот N» на панели, по возрастанию', () => {
    // Робот 0 перезаписали (стал id 3 и сохранил номер 1), робот 1 убрали, робот 2 — номер 2.
    const numbers = new Map([
      [3, 1],
      [2, 2],
    ]);
    const buttons = loopButtons(
      [
        { id: 2, colorIndex: 1 },
        { id: 3, colorIndex: 0 },
      ],
      (id) => numbers.get(id) ?? id + 1,
    );
    expect(buttons.map((b) => [b.robotId, b.number, b.colorIndex])).toEqual([
      [3, 1, 0],
      [2, 2, 1],
    ]);
  });
});
