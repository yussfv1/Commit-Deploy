// Финал уровня: отсчёт T−3, T−2, T−1 и «Пуск!», вспышка зажигания, ракета уходит вверх с дымом и тряской.
// Итоги — через полсекунды после того, как ракета скрылась: игрок успевает увидеть пустой стол в дыму.
// Клик или Enter во время отсчёта пропускает финал. Вынесено из GameScene: сцена только запускает и пропускает.
import type Phaser from 'phaser';
import { audio } from '../ui/audio';
import { t } from '../ui/i18n';
import { COLOR } from '../ui/theme';
import { setColor, setText, txt } from '../ui/widgets';
import type { FieldView } from './field';
import { DEPTH, FIELD } from './layout';

export class LaunchSequence {
  private readonly scene: Phaser.Scene;
  private readonly field: FieldView;
  private readonly onDone: () => void;
  private countdown: Phaser.GameObjects.Text | null = null;
  private finished = false;

  constructor(scene: Phaser.Scene, field: FieldView, onDone: () => void) {
    this.scene = scene;
    this.field = field;
    this.onDone = onDone;
  }

  start(): void {
    const scene = this.scene;
    const c = { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 };
    this.countdown = txt(scene, c.x, c.y, '', { size: 120, bold: true, ox: 0.5, oy: 0.5 }).setDepth(DEPTH.modal);
    const pop = (label: string, color: number): void => {
      if (!this.countdown) return;
      setText(this.countdown, label);
      setColor(this.countdown, color);
      this.countdown.setScale(1.4).setAlpha(0.15);
      scene.tweens.add({ targets: this.countdown, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    };
    let n = 3;
    pop(t('launch.t', { n }), COLOR.text);
    audio.play('countdown');
    // Музыка затихает на отсчёт и старт — слышно «три, два, один» и рёв двигателя.
    audio.duckMusic(5);
    scene.time.addEvent({
      delay: 700,
      repeat: 2,
      callback: () => {
        n--;
        if (!this.countdown || this.finished) return;
        if (n > 0) {
          pop(t('launch.t', { n }), COLOR.text);
          audio.play('countdown');
          return;
        }
        pop(t('launch.go'), COLOR.accent);
        const label = this.countdown;
        scene.tweens.add({
          targets: label,
          alpha: 0,
          delay: 650,
          duration: 450,
          onComplete: () => {
            label.destroy();
            if (this.countdown === label) this.countdown = null;
          },
        });
        audio.play('launch');
        // Вспышка зажигания на всё поле.
        const flash = scene.add.rectangle(FIELD.x, FIELD.y, FIELD.w, FIELD.h, COLOR.white, 0.45).setOrigin(0, 0).setDepth(DEPTH.fx);
        scene.tweens.add({ targets: flash, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
        this.field.launchRocket(() => scene.time.delayedCall(550, () => this.done()));
      },
    });
  }

  /** Пропустить финал: ракета сразу на месте старта, тряска снята, итоги сейчас же. */
  skip(): void {
    this.countdown?.destroy();
    this.countdown = null;
    this.field.skipLaunch();
    // Тряску камеры останавливаем: на паузе под итогами поле иначе так и застыло бы со сдвигом.
    this.scene.cameras.main.resetFX();
    this.done();
  }

  private done(): void {
    if (this.finished) return;
    this.finished = true;
    this.onDone();
  }
}
