// Правка программы робота на панели. Чистые функции: получают программу и возвращают новую,
// исходную не трогают. Правила мира (что считается шагом, сколько длится блок) берём у симуляции,
// а можно ли так — решает только sim.checkProgram: экран ничего не запрещает сам.
import { MAX_WAIT, blockSteps, isActionOp, isMoveOp, normalizeProgram } from '../sim';
import type { Block, Op } from '../types';

export { blockSteps };

/** Длина круга в шагах по блокам (ДАТЧИК времени не занимает, пока машина готова). */
export const programSteps = (p: readonly Block[]): number => p.reduce((n, b) => n + blockSteps(b), 0);

/** Удалить блок. Вместе с ВЗЯТЬ или ПОЛОЖИТЬ уходит и ДАТЧИК перед ним: без действия он не имеет смысла. */
export function removeBlock(p: readonly Block[], index: number): Block[] {
  if (index < 0 || index >= p.length) return normalizeProgram(p);
  const withSensor = isActionOp(p[index].op) && index > 0 && p[index - 1].op === 'sense';
  return normalizeProgram(p.filter((_, i) => i !== index && !(withSensor && i === index - 1)));
}

/**
 * Поставить или снять ДАТЧИК у выбранного блока. Датчик всегда стоит прямо перед ВЗЯТЬ или ПОЛОЖИТЬ.
 * Выбран сам датчик — он снимается. Выбрано другое — программа не меняется (null).
 */
export function toggleSense(p: readonly Block[], index: number): Block[] | null {
  const b = p[index];
  if (!b) return null;
  if (b.op === 'sense') return normalizeProgram(p.filter((_, i) => i !== index));
  if (!isActionOp(b.op)) return null;
  if (index > 0 && p[index - 1].op === 'sense') return normalizeProgram(p.filter((_, i) => i !== index - 1));
  return normalizeProgram([...p.slice(0, index), { op: 'sense' }, ...p.slice(index)]);
}

/**
 * Можно ли нажать «−» (delta < 0) или «+» (delta > 0) у выбранного блока.
 * «−» есть только у ЖДАТЬ. «+» есть у всех, кроме ДАТЧИКА: ЖДАТЬ после него разорвал бы пару
 * «датчик → действие», и симуляция такую программу не приняла бы.
 */
export function canChangeWait(b: Block | undefined, delta: number): boolean {
  if (!b || delta === 0) return false;
  return delta < 0 ? b.op === 'wait' : b.op !== 'sense';
}

/**
 * «−/+» у ЖДАТЬ. На ЖДАТЬ меняется число шагов (до нуля — блок исчезает).
 * На другом блоке «+» вставляет ЖДАТЬ ×1 после него, «−» ничего не делает (null). У ДАТЧИКА «+» нет (null).
 */
export function changeWait(p: readonly Block[], index: number, delta: number): Block[] | null {
  const b = p[index];
  if (!canChangeWait(b, delta)) return null;
  if (b.op !== 'wait') {
    return normalizeProgram([...p.slice(0, index + 1), { op: 'wait', n: 1 }, ...p.slice(index + 1)]);
  }
  const n = (b.n ?? 1) + delta;
  if (n < 1) return normalizeProgram(p.filter((_, i) => i !== index));
  return normalizeProgram(p.map((x, i) => (i === index ? { op: 'wait', n: Math.min(MAX_WAIT, n) } : x)));
}

export interface CodeLine {
  text: string;
  /** Блоки программы, которые стоят за строкой: [from, to). */
  from: number;
  to: number;
}

/**
 * Программа как код: одинаковые шаги подряд сворачиваются в «вправо ×3», ДАТЧИК читается вместе
 * с действием — «ждать датчик». word переводит ключи вида code.<op> в слова.
 */
export function toCode(p: readonly Block[], word: (key: string) => string): CodeLine[] {
  const lines: CodeLine[] = [];
  let i = 0;
  while (i < p.length) {
    const b = p[i];
    let j = i + 1;
    let n = 1;
    if (isMoveOp(b.op)) {
      while (j < p.length && p[j].op === b.op) j++;
      n = j - i;
    } else if (b.op === 'wait') {
      n = b.n ?? 1;
    }
    const base = word(`code.${b.op}`);
    lines.push({ text: n > 1 ? `${base} ×${n}` : base, from: i, to: j });
    i = j;
  }
  return lines;
}

/** Номер строки кода, в которой сейчас блок pc (или -1). */
export const codeLineAt = (lines: readonly CodeLine[], pc: number): number => lines.findIndex((l) => pc >= l.from && pc < l.to);

const LETTER: Record<string, Op> = { U: 'up', R: 'right', D: 'down', L: 'left', T: 'take', P: 'put', S: 'sense' };

/**
 * Короткая запись готовой программы (для живой линии в меню и стресс-проверки), как в тестах симуляции:
 * L2 — два шага влево, T — взять, P — положить, S — датчик, W4 — один блок ЖДАТЬ ×4. Непонятные элементы пропускаются.
 */
export function parseProgram(text: string): Block[] {
  const out: Block[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const n = token.length > 1 ? Number(token.slice(1)) : 1;
    if (!Number.isInteger(n) || n < 1) continue;
    if (token[0] === 'W') {
      out.push({ op: 'wait', n });
      continue;
    }
    const op = LETTER[token[0]];
    if (!op) continue;
    for (let i = 0; i < n; i++) out.push({ op });
  }
  return out;
}
