// Точка входа игры. Сейчас здесь только заглушка, чтобы сборка и деплой работали с первого дня.
// Дальше этим файлом владеет роль B (экран и управление): сцены, отрисовка, HUD.
import Phaser from 'phaser';

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 24, 'T-MINUS', {
        fontFamily: 'sans-serif',
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#e8eef7',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 56, 'Покажи один раз', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#ff7a2f',
      })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0f1b2d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});
