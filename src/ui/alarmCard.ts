// Карточка аварии «Линия встала» в левом нижнем углу карты — на месте карточки обучения, которая на это время
// прячется. Заголовок цветом промаха, причина, что делать и кнопка «Заново с роботами». Что случилось,
// решает ui/stallModel.ts; карточка только показывает. Пока она на экране, клики по ней не уходят в карту.
import type Phaser from 'phaser';
import { BOTTOM, DEPTH, FIELD } from '../render/layout';
import { t } from './i18n';
import { COLOR, SIZE } from './theme';
import { Button, plateKey, setText, txt } from './widgets';

const W = 440;
const PAD = 16;
const BUTTON_H = 36;

export class AlarmCard {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly cause: Phaser.GameObjects.Text;
  private readonly fix: Phaser.GameObjects.Text;
  private readonly button: Button;
  private shownText = '';
  private h = 0;

  constructor(scene: Phaser.Scene, onReplay: () => void) {
    this.scene = scene;
    this.bg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    const label = txt(scene, PAD, 14, t('stall.label'), { size: SIZE.micro, color: COLOR.miss, caps: true, bold: true });
    const title = txt(scene, PAD, 32, t('stall.title'), { size: SIZE.title, bold: true, color: COLOR.miss });
    this.cause = txt(scene, PAD, 62, '', { size: SIZE.small, color: COLOR.text, wrap: W - PAD * 2, lineSpacing: 3 });
    this.fix = txt(scene, PAD, 0, '', { size: SIZE.small, color: COLOR.dim, wrap: W - PAD * 2, lineSpacing: 3 });
    this.button = new Button(scene, 0, 0, { w: 220, h: BUTTON_H, label: t('stall.button'), kind: 'primary', size: SIZE.small, onClick: onReplay });
    this.root = scene.add
      .container(FIELD.x + 16, 0, [this.bg, label, title, this.cause, this.fix, this.button.root])
      .setDepth(DEPTH.uiTop)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Точка (в координатах сцены) лежит на карточке — такой клик не для карты. */
  contains(x: number, y: number): boolean {
    return this.root.visible && x >= this.root.x && x <= this.root.x + W && y >= this.root.y && y <= this.root.y + this.h;
  }

  /** Центр и размер кнопки — для проверок раскладки и автотестов. */
  buttonBox(): { x: number; y: number; w: number; h: number } | null {
    if (!this.root.visible) return null;
    return { x: this.root.x + this.button.x, y: this.root.y + this.button.y, w: this.button.w, h: this.button.h };
  }

  show(cause: string, fix: string): void {
    const key = `${cause}\n${fix}`;
    if (key !== this.shownText) {
      this.shownText = key;
      setText(this.cause, cause);
      this.fix.setY(this.cause.y + this.cause.height + 8);
      setText(this.fix, fix);
      const buttonY = this.fix.y + this.fix.height + 14 + BUTTON_H / 2;
      this.button.root.setPosition(PAD + 110, buttonY);
      this.h = Math.ceil(buttonY + BUTTON_H / 2 + PAD);
      this.bg.setTexture(plateKey(this.scene, W, this.h, { fill: COLOR.chrome, stroke: COLOR.miss, strokeAlpha: 0.7 })).setDisplaySize(W, this.h);
      this.root.setY(BOTTOM.y - 16 - this.h);
    }
    this.root.setVisible(true);
  }

  hide(): void {
    this.root.setVisible(false);
  }
}
