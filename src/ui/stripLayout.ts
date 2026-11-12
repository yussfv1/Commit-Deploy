// Раскладка полосы над картой без Phaser (чтобы проверять тестами). Слева легенда машин, справа выбор петель
// («Все», 1, 2 …) или плашка режима обучения. На больших уровнях легенда длинная, а роботов может быть много,
// поэтому полоса ужимается по шагам, пока всё не встанет без наложений:
// 1) убирается подпись «Петли», 2) кнопки роботов становятся уже, 3) в легенде остаются одни значки.

/** Кнопка «Все» в выборе петель. */
export const LOOP_ALL_W = 52;
/** Кнопка робота: кружок цвета петли и номер. */
export const LOOP_ROBOT_W = 46;
/** Узкая кнопка робота, когда места мало: кружок и номер ещё помещаются. */
export const LOOP_ROBOT_W_COMPACT = 40;
/** Уже этого номер не помещается: остаётся только кружок цвета петли. */
export const LOOP_ROBOT_W_NUMBER = 34;
/** Самая узкая кнопка робота (только кружок цвета). */
export const LOOP_ROBOT_W_MIN = 26;
/** Зазор между кнопками выбора петель. */
export const LOOP_GAP = 4;
/** Зазор между подписью «Петли» и кнопкой «Все». */
export const LOOP_LABEL_GAP = 6;
/** Кнопка легенды без надписи: значок 20 и поля по 8. */
export const LEGEND_ICON_W = 36;
/** Зазор между кнопками легенды. */
export const LEGEND_GAP = 6;
/** Сколько пустого места оставить между легендой и правой частью полосы. */
export const STRIP_APART = 12;

export interface StripFit {
  /** Легенда без надписей, одни значки. */
  icons: boolean;
  /** Показывать подпись «Петли». */
  label: boolean;
  /** Ширина кнопки робота. */
  robotW: number;
}

export interface StripSpace {
  /** Ширина полосы. */
  width: number;
  /** Ширина легенды с надписями и без них (вместе с зазорами). */
  legendFull: number;
  legendIcons: number;
  /** Ширина подписи «Петли». */
  labelW: number;
  /** Сколько кнопок роботов в выборе петель (0 — выбор петель не показан). */
  robots: number;
  /** Без выбора петель справа может стоять что-то своё (плашка режима обучения) — его ширина. */
  right?: number;
}

/** Ширина легенды из ширин её кнопок. */
export function legendWidth(widths: readonly number[]): number {
  return widths.reduce((s, w) => s + w, 0) + LEGEND_GAP * Math.max(0, widths.length - 1);
}

/** Ширина выбора петель: «Все», кнопки роботов, зазоры и подпись. */
export function loopPickerWidth(robots: number, robotW: number, labelW: number, label: boolean): number {
  if (robots <= 0) return 0;
  return LOOP_ALL_W + robots * robotW + LOOP_GAP * (robots + 1) + (label ? LOOP_LABEL_GAP + labelW : 0);
}

/** Самый просторный вариант полосы, при котором легенда и правая часть не налезают друг на друга. */
export function fitStrip(o: StripSpace): StripFit {
  const right = (f: StripFit): number => (o.robots > 0 ? loopPickerWidth(o.robots, f.robotW, o.labelW, f.label) : (o.right ?? 0));
  const fits = (f: StripFit): boolean => (f.icons ? o.legendIcons : o.legendFull) + STRIP_APART + right(f) <= o.width;
  const tries: readonly StripFit[] = [
    { icons: false, label: true, robotW: LOOP_ROBOT_W },
    { icons: false, label: false, robotW: LOOP_ROBOT_W },
    { icons: false, label: false, robotW: LOOP_ROBOT_W_COMPACT },
    { icons: true, label: true, robotW: LOOP_ROBOT_W },
    { icons: true, label: false, robotW: LOOP_ROBOT_W_COMPACT },
  ];
  for (const f of tries) if (fits(f)) return f;
  // Роботов очень много: кнопки делят оставшееся место поровну, но не уже LOOP_ROBOT_W_MIN.
  const room = o.width - o.legendIcons - STRIP_APART - LOOP_ALL_W - LOOP_GAP * (o.robots + 1);
  const robotW = Math.max(LOOP_ROBOT_W_MIN, Math.min(LOOP_ROBOT_W_COMPACT, Math.floor(room / Math.max(1, o.robots))));
  return { icons: true, label: false, robotW };
}

export interface LoopButton {
  robotId: number;
  colorIndex: number;
  /** Номер робота — тот же, что в подписи «Робот N» на панели справа. */
  number: number;
}

/** Кнопки роботов в выборе петель: по возрастанию номера, номер — как в панели робота. */
export function loopButtons(
  robots: readonly { id: number; colorIndex: number }[],
  numberOf: (robotId: number) => number,
): LoopButton[] {
  return robots
    .map((r) => ({ robotId: r.id, colorIndex: r.colorIndex, number: numberOf(r.id) }))
    .sort((a, b) => a.number - b.number || a.robotId - b.robotId);
}
