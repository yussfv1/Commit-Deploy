// Рисование кодом в текстуру. Всё, что не меняется каждый кадр (иконки, плитки, сетка пола, петли),
// рисуется один раз на холсте и показывается одной картинкой — это и чётко, и быстро.
import type Phaser from 'phaser';
import { getRenderScale } from './display';

export type Ctx = CanvasRenderingContext2D;
export type Draw = (ctx: Ctx, w: number, h: number) => void;

/** Во сколько раз текстуры-заготовки плотнее логических пикселей (хватает до экрана 2560×1440). */
export const DENSITY = 2;

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arcTo(x + w, y, x + w, y + k, k);
  ctx.lineTo(x + w, y + h - k);
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k);
  ctx.lineTo(x + k, y + h);
  ctx.arcTo(x, y + h, x, y + h - k, k);
  ctx.lineTo(x, y + k);
  ctx.arcTo(x, y, x + k, y, k);
  ctx.closePath();
}

/**
 * Холст нужного размера, на котором уже нарисована картинка. Phaser получает его готовым (addCanvas):
 * textures.createCanvas сначала отправил бы в видеокарту пустой холст, и Firefox на каждый такой
 * пишет предупреждение WebGL «incurring lazy initialization».
 */
export function paintedCanvas(width: number, height: number, paint: (ctx: Ctx) => void): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx);
  return canvas;
}

/** Нарисовать текстуру под ключом key. w и h — логические пиксели. Старая текстура с этим ключом заменяется. */
export function drawTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: Draw,
  density = DENSITY,
): void {
  const textures = scene.textures;
  if (textures.exists(key)) textures.remove(key);
  const canvas = paintedCanvas(w * density, h * density, (ctx) => {
    ctx.save();
    ctx.scale(density, density);
    draw(ctx, w, h);
    ctx.restore();
  });
  if (canvas) textures.addCanvas(key, canvas);
}

/** То же, но только если текстуры ещё нет. Возвращает ключ. */
export function ensureTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: Draw,
  density = DENSITY,
): string {
  if (!scene.textures.exists(key)) drawTexture(scene, key, w, h, draw, density);
  return key;
}

let layerSerial = 0;

/**
 * Слой, нарисованный на своём холсте: одна картинка на экране вместо сотен фигур.
 * Плотность холста равна масштабу отрисовки, поэтому линии остаются чёткими в любом окне.
 * Картинка создаётся один раз; при смене плотности у неё меняется только текстура,
 * поэтому слой можно класть в контейнер, и его место среди соседей не сбивается.
 */
export class CanvasLayer {
  readonly image: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly base: string;
  private readonly w: number;
  private readonly h: number;
  private key = '';
  /** Текстура прошлой плотности: убираем её, когда новая уже нарисована и стоит на картинке. */
  private old = '';
  private density = 0;
  /** Сколько раз «плотнее» этот слой виден на экране, чем сцена (например, уменьшенная карта в меню). */
  private readonly zoom: number;

  constructor(
    scene: Phaser.Scene,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { depth?: number; parent?: Phaser.GameObjects.Container; zoom?: number } = {},
  ) {
    this.scene = scene;
    this.base = `layer_${name}_${++layerSerial}`;
    this.w = w;
    this.h = h;
    this.zoom = opts.zoom ?? 1;
    this.image = scene.add.image(x, y, '__DEFAULT').setOrigin(0, 0);
    if (opts.depth !== undefined) this.image.setDepth(opts.depth);
    if (opts.parent) opts.parent.add(this.image);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Плотность, с которой слой надо рисовать сейчас. */
  wantedDensity(): number {
    return Math.min(2, Math.max(1, getRenderScale() * this.zoom));
  }

  /** Масштаб окна поменялся — слой пора перерисовать. */
  stale(): boolean {
    return this.density !== this.wantedDensity();
  }

  draw(fn: Draw): void {
    const density = this.wantedDensity();
    if (density !== this.density || !this.key) this.recreate(density);
    const textures = this.scene.textures;
    if (textures.exists(this.key)) {
      const tex = textures.get(this.key) as Phaser.Textures.CanvasTexture;
      const ctx = tex.getContext();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, tex.width, tex.height);
      ctx.setTransform(density, 0, 0, density, 0, 0);
      fn(ctx, this.w, this.h);
      tex.refresh();
      return;
    }
    // Первый рисунок с этой плотностью: холст отдаём Phaser уже нарисованным (см. paintedCanvas).
    const canvas = paintedCanvas(this.w * density, this.h * density, (ctx) => {
      ctx.setTransform(density, 0, 0, density, 0, 0);
      fn(ctx, this.w, this.h);
    });
    if (!canvas) return;
    textures.addCanvas(this.key, canvas);
    this.image.setTexture(this.key).setDisplaySize(this.w, this.h);
    if (this.old && this.old !== this.key && textures.exists(this.old)) textures.remove(this.old);
    this.old = '';
  }

  destroy(): void {
    for (const k of [this.key, this.old]) if (k && this.scene.textures.exists(k)) this.scene.textures.remove(k);
    this.key = '';
    this.old = '';
  }

  /** Новая плотность: новый ключ текстуры. Саму текстуру создаст первый draw(), старую он же и уберёт. */
  private recreate(density: number): void {
    if (this.key && this.key !== `${this.base}@${density}`) this.old = this.key;
    this.density = density;
    this.key = `${this.base}@${density}`;
    if (this.scene.textures.exists(this.key)) this.image.setTexture(this.key).setDisplaySize(this.w, this.h);
  }
}
