// Кирпичики интерфейса: текст, кнопка, ползунок-фейдер, сообщения, подсказка у курсора.
import Phaser from 'phaser';
import { ensureTexture, roundRect } from '../render/canvas';
import { getRenderScale } from '../render/display';
import { H, W } from '../render/layout';
import { audio } from './audio';
import { COLOR, FONT, MONO, RADIUS, SIZE, css, darken, rgba } from './theme';

/** Чёткость текста равна масштабу отрисовки: буквы рисуются пиксель в пиксель и не мылятся. */
export const textRes = (): number => Math.min(2, Math.max(1, getRenderScale()));

export interface TextOpts {
  size?: number;
  color?: number;
  bold?: boolean;
  mono?: boolean;
  /** Подпись прописными буквами с разрядкой — для мелких заголовков приборов («ЭНЕРГИЯ»). */
  caps?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  ox?: number;
  oy?: number;
  lineSpacing?: number;
}

export function txt(scene: Phaser.Scene, x: number, y: number, str: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const size = o.size ?? SIZE.body;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: o.mono ? MONO : FONT,
    fontSize: `${size}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: css(o.color ?? COLOR.text),
    align: o.align ?? 'left',
    resolution: textRes(),
  };
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  if (o.lineSpacing) style.lineSpacing = o.lineSpacing;
  if (o.caps) style.letterSpacing = Math.round(size * 0.12 * 10) / 10;
  const value = o.caps ? str.toLocaleUpperCase('ru') : str;
  return scene.add.text(x, y, value, style).setOrigin(o.ox ?? 0, o.oy ?? 0);
}

/** Менять текст только когда он изменился: перерисовка надписи — дорогая операция. */
export function setText(obj: Phaser.GameObjects.Text, str: string): void {
  if (obj.text !== str) obj.setText(str);
}

export function setColor(obj: Phaser.GameObjects.Text, color: number): void {
  const value = css(color);
  if (obj.style.color !== value) obj.setColor(value);
}

/** После смены масштаба отрисовки пересоздаём картинки надписей в новой чёткости. */
export function refreshTexts(list: Phaser.GameObjects.GameObject[], res: number): void {
  for (const o of list) {
    if (o instanceof Phaser.GameObjects.Text) {
      if (o.style.resolution !== res) o.setResolution(res);
    } else if (o instanceof Phaser.GameObjects.Container) {
      refreshTexts(o.list, res);
    }
  }
}

export interface PlateOpts {
  fill: number;
  fillAlpha?: number;
  stroke?: number;
  strokeAlpha?: number;
  radius?: number;
  lineWidth?: number;
}

/** Плашка нужного размера как текстура. Одинаковые плашки рисуются один раз. */
export function plateKey(scene: Phaser.Scene, w: number, h: number, o: PlateOpts): string {
  const r = o.radius ?? RADIUS.panel;
  const lw = o.lineWidth ?? 1;
  const fa = o.fillAlpha ?? 1;
  const sa = o.strokeAlpha ?? 1;
  const key = `plate_${w}x${h}_${o.fill.toString(16)}_${fa}_${o.stroke === undefined ? 'n' : o.stroke.toString(16)}_${sa}_${r}_${lw}`;
  return ensureTexture(scene, key, w, h, (ctx) => {
    const inset = o.stroke === undefined ? 0 : lw / 2;
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, r);
    if (fa > 0) {
      ctx.fillStyle = rgba(o.fill, fa);
      ctx.fill();
    }
    if (o.stroke !== undefined) {
      ctx.strokeStyle = rgba(o.stroke, sa);
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  });
}

export function plate(scene: Phaser.Scene, x: number, y: number, w: number, h: number, o: PlateOpts): Phaser.GameObjects.Image {
  return scene.add.image(x, y, plateKey(scene, w, h, o)).setDisplaySize(w, h);
}

/** Затемнение на весь экран, которое не пропускает нажатия к тому, что под ним. */
export function dimmer(scene: Phaser.Scene, depth: number, alpha = 0.72): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(W / 2, H / 2, W * 2, H * 2, COLOR.page, alpha)
    .setDepth(depth)
    .setInteractive();
}

/** Тонкая линия-разделитель. */
export function rule(scene: Phaser.Scene, x: number, y: number, w: number, h = 1, color: number = COLOR.rule): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, color).setOrigin(0, 0);
}

/**
 * Клавиша-«колпачок» и подпись справа: [Esc] меню. x — левый край, y — середина строки.
 * Возвращает занятую ширину, чтобы ставить подсказки подряд.
 */
export function keyHint(scene: Phaser.Scene, x: number, y: number, key: string, label: string): number {
  const k = txt(scene, 0, y, key, { size: SIZE.micro, mono: true, color: COLOR.text, ox: 0.5, oy: 0.5 });
  const w = Math.max(26, Math.ceil(k.width) + 14);
  plate(scene, x + w / 2, y, w, 22, { fill: COLOR.raised, stroke: COLOR.rule, radius: RADIUS.chip });
  k.setX(x + w / 2);
  scene.children.bringToTop(k);
  const l = txt(scene, x + w + 8, y, label, { size: SIZE.small, color: COLOR.dim, oy: 0.5 });
  return w + 8 + Math.ceil(l.width);
}

// ---------- кнопка ----------

/**
 * primary — главное действие экрана (одно на экран), normal — обычная кнопка,
 * quiet — строка меню без рамки, danger — необратимое действие.
 */
export type ButtonKind = 'primary' | 'normal' | 'quiet' | 'danger';

interface Skin {
  fill: number;
  fillAlpha: number;
  stroke: number | undefined;
  text: number;
}

function skin(kind: ButtonKind, active: boolean, hover: boolean, pressed: boolean): Skin {
  // Включённый переключатель (скорость ×2, «как код») — инвертирован: светлая плашка, тёмная надпись.
  if (active) return { fill: COLOR.text, fillAlpha: 1, stroke: undefined, text: COLOR.onText };
  let s: Skin;
  switch (kind) {
    case 'primary':
      s = { fill: COLOR.accent, fillAlpha: 1, stroke: undefined, text: COLOR.ink };
      if (hover) s.fill = COLOR.accentHi;
      break;
    case 'danger':
      s = { fill: COLOR.raised, fillAlpha: 1, stroke: COLOR.rule, text: COLOR.miss };
      if (hover) s = { fill: COLOR.miss, fillAlpha: 1, stroke: undefined, text: COLOR.ink };
      break;
    case 'quiet':
      s = { fill: COLOR.raised, fillAlpha: hover ? 1 : 0, stroke: undefined, text: hover ? COLOR.text : COLOR.dim };
      break;
    default:
      s = { fill: hover ? COLOR.raisedHi : COLOR.raised, fillAlpha: 1, stroke: COLOR.rule, text: COLOR.text };
  }
  if (pressed) s.fill = darken(s.fill, 0.18);
  return s;
}

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  onClick: () => void;
  kind?: ButtonKind;
  size?: number;
  bold?: boolean;
  /** Надпись прижата к левому краю (строки меню), по умолчанию — по центру. */
  alignLeft?: boolean;
  /** Ключ текстуры-иконки слева от надписи. С пустой надписью иконка стоит по центру кнопки. */
  icon?: string;
  /** Размер иконки в пикселях, по умолчанию половина высоты кнопки. */
  iconSize?: number;
  /** Иконка-значок нарисована белым: красить её в цвет надписи (тёмная на оранжевой кнопке, светлая на серой). */
  iconTint?: boolean;
  /** Подсказка справа мелким шрифтом (клавиша). */
  hint?: string;
  depth?: number;
  /** Не играть звук нажатия (когда действие само звучит). */
  silent?: boolean;
}

export class Button {
  readonly root: Phaser.GameObjects.Container;
  readonly w: number;
  readonly h: number;
  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text | null;
  private readonly icon: Phaser.GameObjects.Image | null;
  private readonly onClick: () => void;
  private readonly silent: boolean;
  private readonly alignLeft: boolean;
  private readonly iconTint: boolean;
  private kind: ButtonKind;
  private active = false;
  private enabled = true;
  private over = false;
  private pressed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, o: ButtonOpts) {
    this.scene = scene;
    this.w = o.w;
    this.h = o.h;
    this.kind = o.kind ?? 'normal';
    this.onClick = o.onClick;
    this.silent = o.silent ?? false;
    this.alignLeft = o.alignLeft ?? false;
    this.iconTint = o.iconTint ?? false;
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.label = txt(scene, 0, 0, o.label, {
      size: o.size ?? SIZE.small,
      bold: o.bold ?? this.kind === 'primary',
      ox: this.alignLeft ? 0 : 0.5,
      oy: 0.5,
    });
    this.hint = o.hint ? txt(scene, 0, 0, o.hint, { size: SIZE.micro, color: COLOR.faint, ox: 1, oy: 0.5 }) : null;
    const iconSize = o.iconSize ?? o.h * 0.5;
    this.icon = o.icon ? scene.add.image(0, 0, o.icon).setDisplaySize(iconSize, iconSize) : null;
    const parts: Phaser.GameObjects.GameObject[] = [this.bg];
    if (this.icon) parts.push(this.icon);
    parts.push(this.label);
    if (this.hint) parts.push(this.hint);
    this.root = scene.add.container(x, y, parts);
    if (o.depth !== undefined) this.root.setDepth(o.depth);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      this.over = true;
      this.refresh();
    });
    this.bg.on('pointerout', () => {
      this.over = false;
      this.pressed = false;
      this.refresh();
    });
    this.bg.on('pointerdown', () => {
      this.pressed = true;
      this.refresh();
    });
    this.bg.on('pointerup', () => {
      const was = this.pressed;
      this.pressed = false;
      this.refresh();
      if (!was || !this.enabled) return;
      if (!this.silent) audio.play('click');
      this.onClick();
    });
    this.refresh();
  }

  get x(): number {
    return this.root.x;
  }

  get y(): number {
    return this.root.y;
  }

  setLabel(label: string): this {
    setText(this.label, label);
    this.place();
    return this;
  }

  setKind(kind: ButtonKind): this {
    if (kind !== this.kind) {
      this.kind = kind;
      this.label.setFontStyle(kind === 'primary' ? 'bold' : 'normal');
      this.refresh();
    }
    return this;
  }

  /** Подсветить как включённый переключатель. */
  setActive(active: boolean): this {
    if (active !== this.active) {
      this.active = active;
      this.refresh();
    }
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) return this;
    this.enabled = enabled;
    if (enabled) this.bg.setInteractive({ useHandCursor: true });
    else {
      this.bg.disableInteractive();
      this.over = false;
      this.pressed = false;
    }
    this.root.setAlpha(enabled ? 1 : 0.4);
    this.refresh();
    return this;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVisible(visible: boolean): this {
    if (this.root.visible !== visible) this.root.setVisible(visible);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.root.setPosition(x, y);
    return this;
  }

  destroy(): void {
    this.root.destroy();
  }

  private texture(s: Skin): string {
    return plateKey(this.scene, this.w, this.h, {
      fill: s.fill,
      fillAlpha: s.fillAlpha,
      stroke: s.stroke,
      radius: RADIUS.control,
    });
  }

  private refresh(): void {
    const s = skin(this.kind, this.active, this.over && this.enabled, this.pressed && this.enabled);
    this.bg.setTexture(this.texture(s)).setDisplaySize(this.w, this.h);
    setColor(this.label, s.text);
    if (this.icon && this.iconTint) this.icon.setTint(s.text);
    if (this.hint) setColor(this.hint, this.active || this.kind === 'primary' ? s.text : COLOR.faint);
    this.place();
  }

  private place(): void {
    // Нажатая кнопка «утапливается» на пиксель — без пружинящих анимаций.
    const dy = this.pressed && this.enabled ? 1 : 0;
    const pad = Math.round(Math.min(16, this.h * 0.36));
    if (this.alignLeft) {
      const left = -this.w / 2 + pad;
      if (this.icon) {
        this.icon.setPosition(left + this.icon.displayWidth / 2, dy);
        this.label.setPosition(left + this.icon.displayWidth + 12, dy);
      } else {
        this.label.setPosition(left, dy);
      }
    } else if (this.icon && this.label.text === '') {
      this.icon.setPosition(0, dy);
    } else if (this.icon) {
      const gap = 8;
      const total = this.icon.displayWidth + gap + this.label.width;
      this.icon.setPosition(-total / 2 + this.icon.displayWidth / 2, dy);
      this.label.setPosition(-total / 2 + this.icon.displayWidth + gap + this.label.width / 2, dy);
    } else {
      this.label.setPosition(0, dy);
    }
    if (this.hint) this.hint.setPosition(this.w / 2 - pad, dy);
  }
}

// ---------- ползунок-фейдер ----------

export class Slider {
  private readonly scene: Phaser.Scene;
  private readonly left: number;
  private readonly w: number;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly onChange: (value: number) => void;
  private readonly onRelease: () => void;
  private value: number;
  private dragging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    depth: number,
    value: number,
    onChange: (value: number) => void,
    onRelease: () => void,
  ) {
    this.scene = scene;
    this.left = x - w / 2;
    this.w = w;
    this.value = Math.min(1, Math.max(0, value));
    this.onChange = onChange;
    this.onRelease = onRelease;
    scene.add.rectangle(x, y, w, 4, COLOR.rule).setDepth(depth);
    // Риски шкалы через каждые 25 % — как на пульте.
    for (let i = 0; i <= 4; i++) scene.add.rectangle(this.left + (w * i) / 4, y + 9, 1, 4, COLOR.faint).setDepth(depth);
    this.fill = scene.add.rectangle(this.left, y, w, 4, COLOR.dim).setOrigin(0, 0.5).setDepth(depth);
    const knobKey = plateKey(scene, 10, 22, { fill: COLOR.text, radius: 2 });
    this.knob = scene.add.image(x, y, knobKey).setDisplaySize(10, 22).setDepth(depth + 1);
    const zone = scene.add.zone(x, y, w + 28, 36).setDepth(depth + 2).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.drag(p);
    });
    const move = (p: Phaser.Input.Pointer): void => {
      if (this.dragging) this.drag(p);
    };
    const up = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.onRelease();
    };
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', up);
    scene.events.once('shutdown', () => {
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
    });
    this.place();
  }

  private drag(p: Phaser.Input.Pointer): void {
    const world = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const next = Math.round(Math.min(1, Math.max(0, (world.x - this.left) / this.w)) * 20) / 20;
    if (next === this.value) return;
    this.value = next;
    this.place();
    this.onChange(next);
  }

  private place(): void {
    this.fill.scaleX = this.value;
    this.knob.x = this.left + this.w * this.value;
  }
}

// ---------- сообщения ----------

export type ToastKind = 'info' | 'warn' | 'ok';
const TOAST_MARK: Record<ToastKind, number> = { info: COLOR.teach, warn: COLOR.miss, ok: COLOR.ok };

export class Toasts {
  private readonly scene: Phaser.Scene;
  private readonly x: number;
  private readonly y: number;
  private readonly depth: number;
  private items: Phaser.GameObjects.Container[] = [];
  private last = '';
  private lastAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.depth = depth;
  }

  show(message: string, kind: ToastKind = 'info'): void {
    const now = this.scene.time.now;
    // Одно и то же сообщение не повторяем чаще раза в секунду.
    if (message === this.last && now - this.lastAt < 1000) return;
    this.last = message;
    this.lastAt = now;
    const label = txt(this.scene, 0, 0, message, { size: SIZE.small, oy: 0.5, wrap: 520 });
    const w = Math.ceil(label.width + 44);
    const h = Math.max(36, Math.ceil(label.height + 16));
    const bg = plate(this.scene, 0, 0, w, h, { fill: COLOR.chrome, stroke: COLOR.rule });
    const mark = this.scene.add.rectangle(-w / 2 + 14, 0, 6, 6, TOAST_MARK[kind]);
    label.setPosition(-w / 2 + 28, 0);
    const box = this.scene.add.container(this.x, this.y, [bg, mark, label]).setDepth(this.depth).setAlpha(0);
    for (const other of this.items) this.scene.tweens.add({ targets: other, y: other.y + h + 6, duration: 120, ease: 'Quad.easeOut' });
    this.items.push(box);
    if (this.items.length > 3) this.items.shift()?.destroy();
    this.scene.tweens.add({ targets: box, alpha: 1, duration: 120, ease: 'Quad.easeOut' });
    this.scene.tweens.add({
      targets: box,
      alpha: 0,
      delay: 2600,
      duration: 220,
      onComplete: () => {
        this.items = this.items.filter((i) => i !== box);
        box.destroy();
      },
    });
  }
}

// ---------- подсказка у курсора ----------

export class Tooltip {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private shown = '';

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.label = txt(scene, 0, 0, '', { size: SIZE.small, ox: 0.5, oy: 0.5 });
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.root = scene.add.container(0, 0, [this.bg, this.label]).setDepth(depth).setVisible(false);
  }

  show(message: string, x: number, y: number): void {
    if (message !== this.shown) {
      this.shown = message;
      this.label.setText(message);
      const w = Math.ceil(this.label.width + 20);
      const h = 28;
      this.bg.setTexture(plateKey(this.scene, w, h, { fill: COLOR.chrome, stroke: COLOR.rule, radius: RADIUS.chip })).setDisplaySize(w, h);
    }
    const half = this.bg.displayWidth / 2;
    this.root.setPosition(Math.min(W - half - 6, Math.max(half + 6, x)), Math.max(20, y)).setVisible(true);
  }

  hide(): void {
    if (this.root.visible) this.root.setVisible(false);
  }
}
