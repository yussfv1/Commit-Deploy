// Геометрия петли робота. Линия идёт не по центрам клеток, а со сдвигом вправо по ходу движения:
// путь «туда и обратно» превращается в две параллельные линии, как пути на схеме метро.

export interface Pt {
  x: number;
  y: number;
}

export interface LoopShape {
  points: Pt[];
  closed: boolean;
}

type Cell = readonly [number, number];

/**
 * Клетки пути → вершины линии в координатах клеток (центр клетки (x, y) — точка (x, y)).
 * offset — сдвиг в долях клетки. Повторы клеток (повороты на месте) убираются.
 */
export function loopShape(path: ReadonlyArray<Cell>, offset: number): LoopShape {
  const cells: Cell[] = [];
  for (const c of path) {
    const last = cells[cells.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) cells.push(c);
  }
  if (cells.length === 0) return { points: [], closed: false };

  let closed = false;
  if (cells.length > 1) {
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      closed = true;
      cells.pop();
    }
  }
  if (cells.length === 1) return { points: [{ x: cells[0][0], y: cells[0][1] }], closed: false };

  const n = cells.length;
  const segments = closed ? n : n - 1;
  const dirs: Pt[] = [];
  for (let i = 0; i < segments; i++) {
    const a = cells[i];
    const b = cells[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    // Прыжок через клетку — данные не похожи на путь по сетке, рисуем как есть.
    if (Math.abs(dx) + Math.abs(dy) !== 1) return { points: cells.map(([x, y]) => ({ x, y })), closed };
    dirs.push({ x: dx, y: dy });
  }

  const points: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [cx, cy] = cells[i];
    const incoming = closed ? dirs[(i - 1 + segments) % segments] : i > 0 ? dirs[i - 1] : undefined;
    const outgoing = closed ? dirs[i] : i < segments ? dirs[i] : undefined;
    const a = (incoming ?? outgoing) as Pt;
    const b = (outgoing ?? incoming) as Pt;
    // Нормаль вправо по ходу движения для направления (dx, dy) — это (−dy, dx).
    if (a.x === b.x && a.y === b.y) {
      points.push({ x: cx - a.y * offset, y: cy + a.x * offset });
    } else if (a.x === -b.x && a.y === -b.y) {
      // Разворот: линия огибает клетку с торца.
      points.push({ x: cx + (-a.y + a.x) * offset, y: cy + (a.x + a.y) * offset });
      points.push({ x: cx + (-b.y + a.x) * offset, y: cy + (b.x + a.y) * offset });
    } else {
      points.push({ x: cx + (-a.y - b.y) * offset, y: cy + (a.x + b.x) * offset });
    }
  }
  return { points, closed };
}
