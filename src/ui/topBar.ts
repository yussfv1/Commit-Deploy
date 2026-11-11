// Верхняя полоса игры: обратный отсчёт, план, энергия, промахи, скорость и пауза.
import type Phaser from 'phaser';
import { DEPTH, TOP_H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import type { ItemType, SimSnapshot } from '../types';
import { clock, t } from './i18n';
import { COLOR, SIZE } from './theme';
import { Button, rule, setColor, setText, txt } from './widgets';

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface TopBarHandlers {
  speed: (speed: Speed) => void;
  pause: () => void;
}

const MID = TOP_H / 2;

export class TopBar {
  private readonly clockText: Phaser.GameObjects.Text;
  private readonly plan: Phaser.GameObjects.Text;
  private readonly energy: Phaser.GameObjects.Text;
  private readonly misses: Phaser.GameObjects.Text;
  private readonly speeds: Button[];
  private readonly endless: boolean;

  constructor(scene: Phaser.Scene, levelTitle: string, endless: boolean, target: ItemType, handlers: TopBarHandlers) {
    const d = DEPTH.ui;
    this.endless = endless;
    scene.add.rectangle(0, 0, W, TOP_H, COLOR.chrome).setOrigin(0, 0).setDepth(d);
    rule(scene, 0, TOP_H - 1, W).setDepth(d);

    // Обратный отсчёт — главный прибор: крупно, слева.
    txt(scene, 24, 13, t(endless ? 'hud.nextLaunch' : 'hud.countdown'), { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d);
    this.clockText = txt(scene, 24, 27, '', { size: SIZE.title + 4, bold: true }).setDepth(d);
    txt(scene, 168, MID, levelTitle, { size: SIZE.small, color: COLOR.dim, oy: 0.5 }).setDepth(d);

    let x = 470;
    const gauge = (label: string, texture: string): Phaser.GameObjects.Text => {
      scene.add.image(x, MID, texture).setDisplaySize(22, 22).setDepth(d);
      txt(scene, x + 18, 13, label, { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d);
      const value = txt(scene, x + 18, 27, '', { size: SIZE.body, bold: true }).setDepth(d);
      x += 132;
      return value;
    };
    this.plan = gauge(t('hud.plan'), iconKey(target));
    this.energy = gauge(t('hud.energy'), iconKey('energy'));
    this.misses = gauge(t('hud.misses'), 'miss_x');

    // Скорость — сегменты, включённый инвертирован.
    this.speeds = SPEEDS.map(
      (s, i) =>
        new Button(scene, 892 + i * 52, MID, {
          w: 48,
          h: 32,
          label: `×${s}`,
          size: SIZE.small,
          depth: d,
          onClick: () => handlers.speed(s),
        }),
    );
    // Пауза — шестерёнка с подписью клавиши Esc: так её узнают сразу, как в других играх.
    new Button(scene, W - 56, MID, {
      w: 72,
      h: 32,
      label: '',
      icon: iconKey('gear'),
      iconSize: 22,
      iconTint: true,
      alignLeft: true,
      hint: 'Esc',
      depth: d,
      onClick: handlers.pause,
    });
  }

  update(s: SimSnapshot, speed: Speed): void {
    setText(this.clockText, this.endless ? clock(s.timeLeft) : `T−${clock(s.timeLeft)}`);
    // Последние 20 секунд отсчёт красный — без мигания, чтобы не дёргать глаз.
    setColor(this.clockText, s.mode === 'running' && s.timeLeft <= 20 && s.delivered < s.target ? COLOR.miss : COLOR.text);
    setText(this.plan, `${s.delivered} / ${s.target}`);
    setColor(this.plan, s.delivered >= s.target ? COLOR.ok : COLOR.text);
    setText(this.energy, `${s.energyLeft} / ${s.energy}`);
    setText(this.misses, String(s.misses));
    setColor(this.misses, s.misses > 0 ? COLOR.miss : COLOR.text);
    this.speeds.forEach((b, i) => b.setActive(SPEEDS[i] === speed));
  }
}
