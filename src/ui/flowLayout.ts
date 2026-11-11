// Раскладка блоков программы «лентой»: блоки разной ширины идут слева направо и переносятся на новую строку.

export interface FlowItem {
  x: number;
  y: number;
  row: number;
}

export function flowLayout(
  widths: readonly number[],
  maxWidth: number,
  gap: number,
  rowHeight: number,
): { items: FlowItem[]; rows: number } {
  const items: FlowItem[] = [];
  let x = 0;
  let row = 0;
  for (const w of widths) {
    if (x > 0 && x + w > maxWidth) {
      row++;
      x = 0;
    }
    items.push({ x, y: row * rowHeight, row });
    x += w + gap;
  }
  return { items, rows: widths.length === 0 ? 0 : row + 1 };
}

/**
 * Первая видимая строка, если лента длиннее окна. Окно сдвигается ровно настолько,
 * чтобы строка focusRow была видна; focusRow < 0 — ничего не держим в фокусе.
 */
export function rowWindow(rows: number, maxRows: number, focusRow: number, current: number): number {
  const max = Math.max(0, rows - maxRows);
  let start = Math.min(max, Math.max(0, current));
  if (focusRow >= 0) {
    if (focusRow < start) start = focusRow;
    else if (focusRow >= start + maxRows) start = focusRow - maxRows + 1;
  }
  return Math.min(max, Math.max(0, start));
}
