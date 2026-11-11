// Пауза поверх игры: продолжить, начать заново, настройки, выход к уровням.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { t } from '../ui/i18n';
import { COLOR, SIZE } from '../ui/theme';
import { Button, dimmer, plate, txt } from '../ui/widgets';
import { enter } from './flow';

const PANEL_W = 360;
const PAD = 28;

export class PauseScene extends Phaser.Scene {
  private levelId = '';

  constructor() {
    super('Pause');
  }

  create(data: { levelId: string }): void {
    enter(this, false);
    this.levelId = data?.levelId ?? '';
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    const panelH = 316;
    const top = Math.round(H / 2 - panelH / 2);
    const left = W / 2 - PANEL_W / 2;
    plate(this, W / 2, H / 2, PANEL_W, panelH, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);
    txt(this, left + PAD, top + 24, t('pause.title'), { size: SIZE.h1, bold: true }).setDepth(d + 2);

    const w = PANEL_W - PAD * 2;
    const row = (i: number): number => top + 104 + i * 50;
    new Button(this, W / 2, row(0), { w, h: 44, label: t('pause.resume'), kind: 'primary', size: SIZE.body, hint: 'Esc', depth: d + 2, onClick: () => this.resume() });
    new Button(this, W / 2, row(1), { w, h: 40, label: t('pause.restart'), alignLeft: true, hint: 'R', depth: d + 2, onClick: () => this.restart() });
    new Button(this, W / 2, row(2), { w, h: 40, label: t('pause.settings'), alignLeft: true, depth: d + 2, onClick: () => this.settings() });
    new Button(this, W / 2, row(3), { w, h: 40, label: t('pause.exit'), alignLeft: true, hint: 'M', depth: d + 2, onClick: () => this.exit() });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (ev.code === 'Escape' || ev.code === 'Space' || ev.code === 'Enter') this.resume();
      else if (ev.code === 'KeyR') this.restart();
      else if (ev.code === 'KeyM') this.exit();
    });
  }

  private resume(): void {
    this.scene.stop();
    this.scene.resume('Game');
  }

  private restart(): void {
    this.scene.stop('Game');
    this.scene.start('Game', { levelId: this.levelId });
  }

  private settings(): void {
    this.scene.launch('Settings', { from: 'Pause' });
    this.scene.pause();
  }

  private exit(): void {
    this.scene.stop('Game');
    this.scene.start('LevelSelect', { levelId: this.levelId });
  }
}
