import { describe, expect, it } from 'vitest';
import type { Block } from '../../types';
import { changeWait, codeLineAt, hasSenseBefore, parseProgram, programSteps, removeBlock, sameProgram, toCode, toggleSense } from '../programModel';

const R: Block = { op: 'right' };
const L: Block = { op: 'left' };
const T: Block = { op: 'take' };
const P: Block = { op: 'put' };
const S: Block = { op: 'sense' };
const W = (n: number): Block => ({ op: 'wait', n });

describe('правка программы', () => {
  it('удаление ВЗЯТЬ уносит и датчик перед ним', () => {
    expect(removeBlock([L, S, T, R], 2)).toEqual([L, R]);
    expect(removeBlock([L, T, R], 1)).toEqual([L, R]);
  });

  it('удаление склеивает соседние ожидания', () => {
    expect(removeBlock([W(2), R, W(3)], 1)).toEqual([W(5)]);
  });

  it('датчик ставится перед действием и снимается повторным нажатием', () => {
    const p = [L, T, R, P];
    const withSense = toggleSense(p, 1);
    expect(withSense).toEqual([L, S, T, R, P]);
    expect(toggleSense(withSense ?? [], 2)).toEqual(p);
    expect(toggleSense(withSense ?? [], 1)).toEqual(p);
    expect(hasSenseBefore(withSense ?? [], 2)).toBe(true);
  });

  it('датчик не ставится к шагу или ожиданию', () => {
    expect(toggleSense([L, T], 0)).toBeNull();
    expect(toggleSense([W(2), T], 0)).toBeNull();
    expect(toggleSense([], 0)).toBeNull();
  });

  it('«−/+» меняет ЖДАТЬ, на нуле блок исчезает', () => {
    expect(changeWait([R, W(2), L], 1, 1)).toEqual([R, W(3), L]);
    expect(changeWait([R, W(1), L], 1, -1)).toEqual([R, L]);
  });

  it('«+» на обычном блоке добавляет ЖДАТЬ после него, «−» ничего не делает', () => {
    expect(changeWait([R, L], 0, 1)).toEqual([R, W(1), L]);
    expect(changeWait([R, L], 0, -1)).toBeNull();
  });

  it('исходная программа не меняется', () => {
    const p = [L, T, W(2)];
    const copy = JSON.parse(JSON.stringify(p)) as Block[];
    removeBlock(p, 0);
    toggleSense(p, 1);
    changeWait(p, 2, 1);
    expect(p).toEqual(copy);
  });

  it('длина круга: датчик не занимает шагов', () => {
    expect(programSteps([L, S, T, W(3)])).toBe(5);
    expect(sameProgram([W(2), R], [{ op: 'wait', n: 2 }, { op: 'right' }])).toBe(true);
    expect(sameProgram([W(2)], [W(3)])).toBe(false);
  });
});

describe('программа как код', () => {
  const word = (key: string): string => key.replace('code.', '');

  it('сворачивает одинаковые шаги и показывает число ожиданий', () => {
    const lines = toCode([R, R, R, T, W(4), S, P, L], word);
    expect(lines.map((l) => l.text)).toEqual(['right ×3', 'take', 'wait ×4', 'sense', 'put', 'left']);
    expect(lines[0]).toMatchObject({ from: 0, to: 3 });
  });

  it('находит строку по номеру текущего блока', () => {
    const lines = toCode([R, R, T], word);
    expect(codeLineAt(lines, 1)).toBe(0);
    expect(codeLineAt(lines, 2)).toBe(1);
    expect(codeLineAt(lines, -1)).toBe(-1);
  });
});

describe('короткая запись программы', () => {
  it('разворачивает L2 в два шага и понимает действия и датчик', () => {
    expect(parseProgram('L2 S T R P')).toEqual([L, L, S, T, R, P]);
    expect(parseProgram('  X R0 R ')).toEqual([R]);
  });
});
