// Пауза поверх игры: продолжить, заново с роботами (если линия уже запускалась), начать заново, настройки,
// выход к уровням.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import { t } from '../ui/i18n';
import { COLOR, SIZE } from '../ui/theme';
import { Button, dimmer, plate, txt } from '../ui/widgets';
import type { Replay } from '../ui/replay';
import { onKeyDown } from '../ui/keys';
import { enter } from './flow';

const PANEL_W = 360;
const PAD = 28;

export class PauseScene extends Phaser.Scene {
  private levelId = '';
  private replay: Replay | null = null;

  constructor() {
    super('Pause');
  }

  create(data: { levelId: string; replay?: Replay | null }): void {
    enter(this, false);
    this.levelId = data?.levelId ?? '';
    this.replay = data?.replay ?? null;
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    // Все строки одной высоты: тогда у всех кнопок одинаковый отступ слева,
    // и значки с надписями стоят ровно в столбик под левым краем заголовка кнопок.
    const ROW_H = 44;
    const STEP = 52;
    const first = 104;
    const rows = this.replay ? 5 : 4;
    const panelH = first + STEP * (rows - 1) + ROW_H / 2 + PAD;
    const top = Math.round(H / 2 - panelH / 2);
    const left = Math.round(W / 2 - PANEL_W / 2);
    plate(this, W / 2, top + panelH / 2, PANEL_W, panelH, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);
    txt(this, left + PAD, top + 24, t('pause.title'), { size: SIZE.h1, bold: true }).setDepth(d + 2);

    const w = PANEL_W - PAD * 2;
    const row = (i: number): number => top + first + i * STEP;
    const item = { w, h: ROW_H, size: SIZE.body, alignLeft: true, iconTint: true, depth: d + 2 };
    // Подписей клавиш тут нет. В паузе Esc, Пробел и Enter — продолжить, R — начать заново, M — к уровням
    // (в игре R — копия робота: это и Esc с Tab перечислены в главном меню).
    let i = 0;
    new Button(this, W / 2, row(i++), { ...item, label: t('pause.resume'), icon: iconKey('play'), kind: 'primary', onClick: () => this.resume() });
    // Линия уже запускалась: перезапустить время, оставив роботов и их программы (то же, что кнопка аварии).
    if (this.replay) new Button(this, W / 2, row(i++), { ...item, label: t('pause.replay'), icon: iconKey('restart'), onClick: () => this.replayLine() });
    new Button(this, W / 2, row(i++), { ...item, label: t('pause.restart'), icon: iconKey('restart'), onClick: () => this.restart() });
    new Button(this, W / 2, row(i++), { ...item, label: t('pause.settings'), icon: iconKey('gear'), onClick: () => this.settings() });
    new Button(this, W / 2, row(i++), { ...item, label: t('pause.exit'), icon: iconKey('levels'), onClick: () => this.exit() });

    onKeyDown(this, (ev: KeyboardEvent) => {
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

  private replayLine(): void {
    this.scene.stop('Game');
    this.scene.start('Game', { levelId: this.levelId, replay: this.replay });
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
