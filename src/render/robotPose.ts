// Где внутри клетки нарисовать робота. Роботы держатся правой стороны по ходу движения — там же,
// где идёт линия их петли, поэтому встречные роботы не сливаются, а робот едет по своей линии.
import type { Dir } from '../types';

// Нормаль вправо по ходу для направлений: вверх, вправо, вниз, влево.
const NX = [1, 0, -1, 0];
const NY = [0, 1, 0, -1];

/** Сдвиг полосы в долях клетки. У соседних доков полосы разные, как у линий метро в одном тоннеле. */
export const laneOffset = (dock: number): number => 0.1 + 0.07 * (((dock % 4) + 4) % 4);

export interface PoseInput {
  x: number;
  y: number;
  dir: Dir;
  dock: number;
}

/** Положение робота в координатах клеток. parked — стоит на доке и ждёт старта: тогда ровно по центру. */
export function robotPose(r: PoseInput, parked: boolean): { x: number; y: number } {
  if (parked) return { x: r.x, y: r.y };
  const off = laneOffset(r.dock);
  return { x: r.x + NX[r.dir] * off, y: r.y + NY[r.dir] * off };
}
