// Мелкие эффекты поверх карты: искры на доставке, «+1», крестик промаха, рамка вокруг новой машины.
// Всё живёт в контейнере карты, поэтому координаты — в пикселях уровня.
import Phaser from 'phaser';
import { COLOR, SIZE } from '../ui/theme';
import { txt } from '../ui/widgets';

const MAX_FLOATS = 14;

export class Fx {
  private readonly scene: Phaser.Scene;
  private readonly parent: Phaser.GameObjects.Container;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private floats = 0;

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.parent = parent;
    this.sparks = scene.add.particles(0, 0, 'px', {
      speed: { min: 50, max: 170 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 280, max: 560 },
      gravityY: 200,
      emitting: false,
    });
    parent.add(this.sparks);
  }

  /** Сноп частиц нужного цвета. */
  burst(x: number, y: number, color: number, count = 10): void {
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  /** Всплывающая надпись вроде «+1». */
  float(x: number, y: number, message: string, color: number): void {
    if (this.floats >= MAX_FLOATS) return;
    this.floats++;
    const label = txt(this.scene, x, y, message, { size: SIZE.title, bold: true, color, ox: 0.5, oy: 0.5 });
    this.parent.add(label);
    this.scene.tweens.add({
      targets: label,
      y: y - 34,
      alpha: 0,
      duration: 760,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.floats--;
        label.destroy();
      },
    });
  }

  /** Расходящаяся тонкая рамка: покупка машины, появление робота. */
  ring(x: number, y: number, color: number): void {
    const img = this.scene.add.image(x, y, 'cell_frame').setTint(color).setScale(0.6);
    this.parent.add(img);
    this.scene.tweens.add({ targets: img, scale: 1.15, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => img.destroy() });
  }

  /** Красный крестик промаха над роботом. */
  miss(x: number, y: number): void {
    if (this.floats >= MAX_FLOATS) return;
    this.floats++;
    const img = this.scene.add.image(x, y - 22, 'miss_x').setDisplaySize(22, 22);
    this.parent.add(img);
    this.scene.tweens.add({
      targets: img,
      y: y - 38,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.floats--;
        img.destroy();
      },
    });
    this.burst(x, y, COLOR.miss, 5);
  }
}
