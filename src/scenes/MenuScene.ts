// Главное меню. Слева — название и действия, справа — живая линия из трёх роботов:
// игрок сразу видит, что он будет строить, а не декоративный фон.
import Phaser from 'phaser';
import { DemoLine } from '../render/demo';
import { H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import { audio } from '../ui/audio';
import { t } from '../ui/i18n';
import { levels } from '../ui/levels';
import { store } from '../ui/storage';
import { COLOR, SIZE } from '../ui/theme';
import { Button, rule, txt } from '../ui/widgets';
import { enter, go, leaving } from './flow';

const X0 = 88;
const COL = 300;
const DEMO_X = 560;
const DEMO_W = W - X0 - DEMO_X;

export class MenuScene extends Phaser.Scene {
  private demo: DemoLine | null = null;

  constructor() {
    super('Menu');
  }

  create(data: { openSettings?: boolean }): void {
    enter(this);
    audio.music('menu');
    this.cameras.main.setBackgroundColor(COLOR.page);

    if (this.textures.exists(iconKey('logo'))) {
      const logo = this.add.image(X0, 132, iconKey('logo')).setOrigin(0, 0);
      logo.setScale(Math.min(400 / logo.width, 96 / logo.height));
    } else {
      txt(this, X0 - 4, 124, 'T-MINUS', { size: SIZE.display + 8, bold: true });
    }
    txt(this, X0, 212, t('menu.subtitle'), { size: SIZE.title, color: COLOR.text });
    txt(this, X0, 248, t('menu.tagline'), { size: SIZE.body, color: COLOR.dim, wrap: 400, lineSpacing: 4 });

    const play = (): void => go(this, 'LevelSelect');
    new Button(this, X0 + COL / 2, 380, { w: COL, h: 52, label: t('menu.play'), kind: 'primary', size: SIZE.title, hint: 'Enter', onClick: play });
    new Button(this, X0 + COL / 2, 444, {
      w: COL,
      h: 44,
      label: t('menu.settings'),
      kind: 'quiet',
      size: SIZE.body,
      alignLeft: true,
      onClick: () => this.openSettings(),
    });
    new Button(this, X0 + COL / 2, 492, {
      w: COL,
      h: 44,
      label: t('menu.credits'),
      kind: 'quiet',
      size: SIZE.body,
      alignLeft: true,
      onClick: () => go(this, 'Credits'),
    });

    // Живая линия справа и подпись к ней.
    const level = { w: 14, h: 5 };
    const scale = DEMO_W / (level.w * 64);
    const demoY = 150;
    this.demo = new DemoLine(this, DEMO_X, demoY, scale);
    const below = demoY + this.demo.view.height + 16;
    txt(this, DEMO_X, below, t('menu.demoTitle'), { size: SIZE.micro, color: COLOR.dim, caps: true });
    txt(this, DEMO_X, below + 22, t('menu.demoCaption'), { size: SIZE.small, color: COLOR.dim, wrap: DEMO_W });

    // Подвал: событие, звёзды, полный экран.
    rule(this, X0, H - 72, W - X0 * 2);
    txt(this, X0, H - 44, t('menu.event'), { size: SIZE.micro, color: COLOR.faint, caps: true, oy: 0.5 });
    const total = levels().filter((l) => !l.endless).length * 3;
    const stars = store.totalStars();
    if (stars > 0) {
      const sx = W / 2 - 40;
      this.add.image(sx, H - 44, iconKey('star')).setDisplaySize(18, 18);
      txt(this, sx + 16, H - 44, t('menu.stars', { n: stars, total }), { size: SIZE.small, color: COLOR.dim, oy: 0.5 });
    }
    new Button(this, W - X0 - 80, H - 44, {
      w: 160,
      h: 32,
      label: t('menu.fullscreen'),
      kind: 'quiet',
      size: SIZE.small,
      onClick: () => this.scale.toggleFullscreen(),
    });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (leaving(this) || ev.repeat) return;
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') play();
    });
    this.events.once('shutdown', () => {
      this.demo = null;
    });
    if (data?.openSettings) this.openSettings();
  }

  override update(_time: number, delta: number): void {
    this.demo?.update(Math.min(0.1, delta / 1000));
  }

  private openSettings(): void {
    this.scene.launch('Settings', { from: 'Menu' });
    this.scene.pause();
  }
}
