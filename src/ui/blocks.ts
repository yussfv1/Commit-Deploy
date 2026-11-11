// Лента блоков программы: ↑ → ↓ ← ВЗЯТЬ ПОЛОЖИТЬ ЖДАТЬ ×N ДАТЧИК. Блоки разной ширины идут строками;
// если строк больше, чем помещается, видно окно вокруг текущего или выбранного блока.
import Phaser from 'phaser';
import type { Block, Op } from '../types';
import { flowLayout, rowWindow } from './flowLayout';
import { t } from './i18n';
import { COLOR, RADIUS, SIZE, darken } from './theme';
import { plateKey, txt } from './widgets';

const CHIP_H = 28;
const GAP = 4;
const ROW = CHIP_H + GAP;
const ARROW: Partial<Record<Op, number>> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

interface ChipStyle {
  fill: number;
  stroke?: number;
  text: number;
}

/** Цвет блока по смыслу: шаги нейтральные, действия зелёные, ожидание серое, датчик жёлтый. */
function chipStyle(op: Op): ChipStyle {
  if (op === 'take' || op === 'put') return { fill: darken(COLOR.ok, 0.7), stroke: darken(COLOR.ok, 0.35), text: COLOR.ok };
  if (op === 'wait') return { fill: COLOR.sunken, stroke: COLOR.rule, text: COLOR.dim };
  if (op === 'sense') return { fill: darken(COLOR.warn, 0.72), stroke: COLOR.warn, text: COLOR.warn };
  return { fill: COLOR.raised, stroke: COLOR.rule, text: COLOR.text };
}

/** Подпись блока на ленте. */
export function blockLabel(b: Block): string {
  if (b.op === 'wait') return t('block.waitN', { n: b.n ?? 1 });
  return t(`block.${b.op}`);
}

const signature = (p: readonly Block[]): string => p.map((b) => (b.op === 'wait' ? `w${b.n ?? 1}` : b.op[0] + b.op[1])).join(' ');

export class BlockStrip {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly width: number;
  private readonly maxRows: number;
  private readonly pcBar: Phaser.GameObjects.Rectangle;
  private readonly pickFrame: Phaser.GameObjects.Rectangle;
  private chips: { box: Phaser.GameObjects.Container; w: number; row: number; x: number }[] = [];
  private sig = '\u0000';
  private start = 0;
  private rows = 0;
  private onPick: ((index: number) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, maxRows: number, depth: number) {
    this.scene = scene;
    this.width = width;
    this.maxRows = maxRows;
    this.root = scene.add.container(x, y).setDepth(depth);
    this.pcBar = scene.add.rectangle(0, 0, 10, 3, COLOR.text).setOrigin(0, 0).setVisible(false);
    this.pickFrame = scene.add.rectangle(0, 0, 10, CHIP_H).setOrigin(0, 0).setStrokeStyle(2, COLOR.text).setVisible(false);
    this.root.add([this.pickFrame, this.pcBar]);
  }

  /** Сколько пикселей по высоте занимает видимая часть ленты. */
  get visibleHeight(): number {
    return Math.min(this.rows, this.maxRows) * ROW;
  }

  setPickHandler(fn: ((index: number) => void) | null): void {
    this.onPick = fn;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  /** pc — блок, который выполняется (полоска под ним), pick — выбранный для правки (рамка). */
  set(program: readonly Block[], pc: number, pick: number, barColor: number = COLOR.text): void {
    const sig = signature(program);
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuild(program);
    }
    const focus = pick >= 0 ? pick : pc;
    const focusRow = this.chips[focus]?.row ?? -1;
    const start = rowWindow(this.rows, this.maxRows, focusRow, this.start);
    if (start !== this.start) {
      this.start = start;
      this.place();
    }
    this.mark(this.pcBar, pc, (c, y) => this.pcBar.setPosition(c.x + 3, y + CHIP_H - 5).setSize(c.w - 6, 3).setFillStyle(barColor));
    this.mark(this.pickFrame, pick, (c, y) => this.pickFrame.setPosition(c.x - 1, y - 1).setSize(c.w + 2, CHIP_H + 2));
  }

  destroy(): void {
    this.root.destroy();
  }

  private mark(obj: Phaser.GameObjects.Rectangle, index: number, put: (c: { x: number; w: number }, y: number) => void): void {
    const c = this.chips[index];
    const show = !!c && c.row >= this.start && c.row < this.start + this.maxRows;
    obj.setVisible(show);
    if (show && c) put(c, (c.row - this.start) * ROW);
  }

  private rebuild(program: readonly Block[]): void {
    for (const c of this.chips) c.box.destroy();
    this.chips = [];
    const made = program.map((b, index) => this.chip(b, index));
    const layout = flowLayout(
      made.map((m) => m.w),
      this.width,
      GAP,
      ROW,
    );
    this.rows = layout.rows;
    made.forEach((m, i) => {
      this.chips.push({ box: m.box, w: m.w, row: layout.items[i].row, x: layout.items[i].x });
    });
    this.root.add(made.map((m) => m.box));
    this.root.bringToTop(this.pickFrame);
    this.root.bringToTop(this.pcBar);
    this.start = Math.min(this.start, Math.max(0, this.rows - this.maxRows));
    this.place();
  }

  private place(): void {
    for (const c of this.chips) {
      const visible = c.row >= this.start && c.row < this.start + this.maxRows;
      c.box.setVisible(visible);
      if (visible) c.box.setPosition(c.x, (c.row - this.start) * ROW);
    }
  }

  private chip(b: Block, index: number): { box: Phaser.GameObjects.Container; w: number } {
    const s = this.scene;
    const style = chipStyle(b.op);
    const parts: Phaser.GameObjects.GameObject[] = [];
    let w = CHIP_H;
    const angle = ARROW[b.op];
    let label: Phaser.GameObjects.Text | null = null;
    if (angle === undefined) {
      label = txt(s, 0, CHIP_H / 2, blockLabel(b), { size: SIZE.micro, bold: true, color: style.text, oy: 0.5 });
      w = Math.ceil(label.width + 16);
    }
    const bg = s.add.image(0, 0, plateKey(s, w, CHIP_H, { fill: style.fill, stroke: style.stroke, radius: RADIUS.chip })).setOrigin(0, 0);
    bg.setDisplaySize(w, CHIP_H);
    parts.push(bg);
    if (angle !== undefined) {
      parts.push(s.add.image(CHIP_H / 2, CHIP_H / 2, 'glyph_arrow').setDisplaySize(14, 14).setRotation(angle).setTint(style.text));
    } else if (label) {
      label.setX(8);
      parts.push(label);
    }
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerup', () => this.onPick?.(index));
    return { box: s.add.container(0, 0, parts), w };
  }
}
