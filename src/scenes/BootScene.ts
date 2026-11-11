// Загрузка: пробуем взять файлы роли C, всё недостающее рисуем и озвучиваем кодом, потом открываем меню.
import Phaser from 'phaser';
import { loadAssets } from '../render/assets';
import { H } from '../render/layout';
import { makeTextures } from '../render/textures';
import { audio } from '../ui/audio';
import { i18n, t } from '../ui/i18n';
import { store } from '../ui/storage';
import { COLOR, SIZE } from '../ui/theme';
import { txt } from '../ui/widgets';
import { enter } from './flow';
import { STRESS_ID, isStressRun } from './stress';

const BAR_W = 320;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    enter(this, false);
    const settings = store.settings();
    i18n.setLang(settings.lang);
    document.title = t('app.title');
    audio.install();
    audio.setVolumes(settings);

    this.cameras.main.setBackgroundColor(COLOR.floor);
    const x = 88;
    const y = H - 96;
    txt(this, x, y - 22, t('boot.loading'), { size: SIZE.micro, color: COLOR.dim, caps: true });
    this.add.rectangle(x, y, BAR_W, 1, COLOR.rule).setOrigin(0, 0.5);
    const bar = this.add.rectangle(x, y, BAR_W, 2, COLOR.text).setOrigin(0, 0.5);
    bar.scaleX = 0;

    void this.boot((done) => {
      bar.scaleX = Math.max(0, Math.min(1, done));
    });
  }

  private async boot(progress: (done: number) => void): Promise<void> {
    try {
      await loadAssets(this, progress);
    } catch {
      // Что бы ни случилось с файлами, игра запускается на нарисованных кодом заглушках.
    }
    makeTextures(this);
    // ?stress в адресе — сразу проверка производительности, без меню.
    if (isStressRun()) this.scene.start('Game', { levelId: STRESS_ID });
    else this.scene.start('Menu');
  }
}
