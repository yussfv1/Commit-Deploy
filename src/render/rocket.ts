// Ракета на стартовом столе и её пуск: пламя, дым, тряска камеры, ракета уходит вверх.
// Живёт в контейнере карты: координаты — в пикселях уровня.
import type Phaser from 'phaser';
import { iconKey } from './textures';

const W = 46;
const H = 92;
/** Доля высоты картинки, на которой кончается сопло (ниже — пустое место под пламя). */
const NOZZLE = 0.875;

export class Rocket {
  private readonly scene: Phaser.Scene;
  private readonly body: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Image;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly homeX: number;
  private readonly homeY: number;
  private burning = false;
  private flying: Phaser.Tweens.Tween | null = null;

  /** x, y — центр клетки стартового стола. */
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number) {
    this.scene = scene;
    this.homeX = x;
    this.homeY = y + 14;
    this.smoke = scene.add.particles(0, 0, 'smoke', {
      speed: { min: 30, max: 140 },
      angle: { min: 15, max: 165 },
      scale: { start: 0.5, end: 1.8 },
      alpha: { start: 0.5, end: 0 },
      lifespan: { min: 700, max: 1400 },
      tint: [0xdfe7f2, 0xb8c6d9, 0x8ea3bf],
      emitting: false,
    });
    this.flame = scene.add.image(x, this.homeY, 'flame').setOrigin(0.5, 0).setDisplaySize(18, 40).setVisible(false);
    this.body = scene.add.image(x, this.homeY, iconKey('rocket')).setOrigin(0.5, NOZZLE).setDisplaySize(W, H);
    parent.add([this.smoke, this.flame, this.body]);
  }

  /** dt — секунды. Пока двигатель работает, пламя дрожит, а из-под ракеты идёт дым. */
  update(dt: number): void {
    if (!this.burning) return;
    this.flame.setPosition(this.body.x, this.body.y - 2);
    this.flame.setDisplaySize(16 + Math.random() * 5, 36 + Math.random() * 14);
    const puffs = Math.max(1, Math.round(dt * 80));
    // Дым идёт от стола, пока ракета недалеко, — дальше остаётся только факел.
    if (this.homeY - this.body.y < 260) this.smoke.emitParticleAt(this.homeX + (Math.random() - 0.5) * 18, this.homeY + 4, puffs);
  }

  /** Зажигание и взлёт. shake — трясти ли камеру. onDone вызывается, когда ракета ушла за край экрана. */
  launch(onDone: () => void, shake = true): void {
    if (this.burning) return;
    this.burning = true;
    this.flame.setVisible(true);
    if (shake) this.scene.cameras.main.shake(2200, 0.004);
    this.flying = this.scene.tweens.add({
      targets: this.body,
      y: this.homeY - 820,
      delay: 380,
      duration: 2200,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.flying = null;
        this.burning = false;
        this.flame.setVisible(false);
        this.body.setVisible(false);
        onDone();
      },
    });
  }

  /** Сразу закончить взлёт (игрок пропустил анимацию — даже ещё во время отсчёта): ракета улетела. */
  finishNow(): void {
    this.flying?.stop();
    this.flying = null;
    this.burning = false;
    this.flame.setVisible(false);
    this.body.setVisible(false);
  }

  /** Новая ракета на столе (бесконечный уровень). */
  reset(): void {
    if (this.burning) return;
    this.body.setPosition(this.homeX, this.homeY).setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.body, alpha: 1, duration: 500 });
  }
}
