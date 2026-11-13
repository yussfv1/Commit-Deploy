// Показ мышью или пальцем: клик по клетке рядом с оператором — то же, что стрелка в ту сторону
// (шаг, а если там машина или стена — поворот к ней), клик по машине, к которой оператор уже стоит лицом, —
// то же, что E (взять или положить), клик по самому оператору — то же, что Пробел (ждать).
// Клавиатура остаётся: мышь просто ещё один способ показать ту же работу.
import { DIR_DX, DIR_DY } from '../types';
import type { Dir, MoveOp, OperatorView, TeachInput } from '../types';

const MOVES: readonly MoveOp[] = ['up', 'right', 'down', 'left'];

/** Направление от оператора к соседней клетке или null, если клетка не соседняя по стороне. */
export function dirTo(from: { x: number; y: number }, to: { x: number; y: number }): Dir | null {
  for (let d = 0; d < 4; d++) {
    if (from.x + DIR_DX[d] === to.x && from.y + DIR_DY[d] === to.y) return d as Dir;
  }
  return null;
}

/**
 * Что значит клик по клетке во время показа. null — клик ничего не делает (дальняя клетка):
 * экран тогда подсказывает, что ходить можно только на соседнюю.
 */
export function teachClickInput(
  op: Pick<OperatorView, 'x' | 'y' | 'dir'>,
  cell: { x: number; y: number },
  isMachine: (x: number, y: number) => boolean,
): TeachInput | null {
  if (cell.x === op.x && cell.y === op.y) return 'wait';
  const d = dirTo(op, cell);
  if (d === null) return null;
  // Уже стоит лицом к этой машине — значит, клик по ней: взять или положить.
  if (d === op.dir && isMachine(cell.x, cell.y)) return 'act';
  return MOVES[d];
}
