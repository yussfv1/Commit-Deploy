// Петли роботов на карте — главная картинка игры. Все линии рисуются на один холст и перерисовываются
// только когда меняется программа, выбор или масштаб, а не каждый кадр: на экране это одна картинка.
import type Phaser from 'phaser';
import { TILE } from '../types';
import { CanvasLayer } from './canvas';
import { strokeLoop } from './loopDraw';
import { loopShape } from './loopPath';
import type { Pt } from './loopPath';
import { makeTrack, pointAt } from './polyline';
import type { Track } from './polyline';

export interface LoopSpec {
  id: number;
  color: number;
  cells: ReadonlyArray<readonly [number, number]>;
  /** Сдвиг полосы в долях клетки. */
  offset: number;
  /** 1 — выбранная, меньше — приглушённая. */
  strength: number;
  /** Пунктир — петля ещё не принята (запись показа или правка, которая вступит со следующего круга). */
  dashed?: boolean;
}

/** Сколько точек бежит по выбранной петле: показывают направление движения. */
const RUNNERS = 3;
const RUN_SPEED = 150;

function specHash(s: LoopSpec): number {
  let h = (s.id * 31 + s.color) | 0;
  h = (h * 31 + Math.round(s.strength * 100) + (s.dashed ? 7 : 0) + Math.round(s.offset * 1000)) | 0;
  for (const c of s.cells) h = (h * 31 + c[0] * 17 + c[1]) | 0;
  return (h * 31 + s.cells.length) | 0;
}

export class LoopLayer {
  private readonly layer: CanvasLayer;
  private readonly runners: Phaser.GameObjects.Image[] = [];
  private signature = Number.NaN;
  private track: Track | null = null;
  private travelled = 0;

  /** Слой ложится в контейнер карты; координаты — в пикселях уровня (клетка = 64). */
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, cols: number, rows: number, zoom = 1) {
    this.layer = new CanvasLayer(scene, 'loops', 0, 0, cols * TILE, rows * TILE, { parent, zoom });
    for (let i = 0; i < RUNNERS; i++) {
      const dot = scene.add.image(0, 0, 'dot').setDisplaySize(7, 7).setVisible(false);
      parent.add(dot);
      this.runners.push(dot);
    }
  }

  /** highlight — id петли, по которой бегут точки (выбранный робот), или null. */
  sync(specs: readonly LoopSpec[], highlight: number | null): void {
    let sig = highlight === null ? 1 : highlight * 13 + 5;
    for (const s of specs) sig = (sig * 33 + specHash(s)) | 0;
    if (sig === this.signature && !this.layer.stale()) return;
    this.signature = sig;

    const shapes = specs.map((s) => {
      const shape = loopShape(s.cells, s.offset);
      return { spec: s, closed: shape.closed, pts: shape.points.map(toPixels) };
    });
    // Яркие петли рисуем последними, чтобы они лежали поверх приглушённых.
    shapes.sort((a, b) => a.spec.strength - b.spec.strength);
    this.layer.draw((ctx) => {
      for (const s of shapes) {
        strokeLoop(ctx, s.pts, s.closed, {
          color: s.spec.color,
          strength: s.spec.strength,
          dashed: s.spec.dashed,
          width: s.spec.strength >= 1 ? 5 : 4,
          arrowsFrom: s.spec.dashed ? 0 : TILE * 0.8,
        });
      }
    });

    const lit = highlight === null ? undefined : shapes.find((s) => s.spec.id === highlight && !s.spec.dashed);
    if (lit && lit.pts.length > 1) {
      this.track = makeTrack(lit.pts, lit.closed);
      for (const r of this.runners) r.setTint(0xffffff).setVisible(true);
    } else {
      this.track = null;
      for (const r of this.runners) r.setVisible(false);
    }
  }

  /** Точки бегут по выбранной петле в сторону движения робота. dt — секунды. */
  update(dt: number): void {
    const track = this.track;
    if (!track || track.total <= 0) return;
    this.travelled = (this.travelled + dt * RUN_SPEED) % track.total;
    this.runners.forEach((img, i) => {
      const p = pointAt(track, this.travelled + (track.total * i) / RUNNERS);
      img.setPosition(p.x, p.y);
    });
  }
}

const toPixels = (p: Pt): Pt => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
