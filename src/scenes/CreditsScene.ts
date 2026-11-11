// Об игре и титры: что это за игра, кто её сделал, на чём и откуда ассеты.
import Phaser from 'phaser';
import { H, W } from '../render/layout';
import { audio } from '../ui/audio';
import { t } from '../ui/i18n';
import { COLOR, SIZE } from '../ui/theme';
import { Button, rule, txt } from '../ui/widgets';
import { enter, go, leaving } from './flow';

const X0 = 88;
const RIGHT = 680;

const TEAM = ['credits.roleA', 'credits.roleB', 'credits.roleC'] as const;
const NOTES = [
  ['credits.toolsTitle', 'credits.tools'],
  ['credits.assetsTitle', 'credits.assets'],
  ['credits.inspirationTitle', 'credits.inspiration'],
] as const;

export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create(): void {
    enter(this);
    audio.music('menu');
    this.cameras.main.setBackgroundColor(COLOR.page);

    txt(this, X0, 64, t('credits.title'), { size: SIZE.h1, bold: true });
    txt(this, X0, 120, t('credits.about'), { size: SIZE.body, color: COLOR.dim, wrap: 500, lineSpacing: 6 });

    let y = 120;
    txt(this, RIGHT, y, t('credits.team'), { size: SIZE.micro, color: COLOR.faint, caps: true });
    y += 26;
    for (const key of TEAM) {
      txt(this, RIGHT, y, t(key), { size: SIZE.body });
      y += 30;
    }
    for (const [title, body] of NOTES) {
      y += 22;
      txt(this, RIGHT, y, t(title), { size: SIZE.micro, color: COLOR.faint, caps: true });
      y += 24;
      const line = txt(this, RIGHT, y, t(body), { size: SIZE.small, color: COLOR.dim, wrap: W - RIGHT - X0, lineSpacing: 4 });
      y += line.height;
    }

    rule(this, X0, H - 72, W - X0 * 2);
    new Button(this, X0 + 80, H - 44, {
      w: 160,
      h: 36,
      label: t('credits.back'),
      kind: 'quiet',
      size: SIZE.small,
      alignLeft: true,
      onClick: () => go(this, 'Menu'),
    });
    txt(this, W - X0, H - 44, t('menu.event'), { size: SIZE.micro, color: COLOR.faint, caps: true, ox: 1, oy: 0.5 });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (leaving(this) || ev.repeat) return;
      if (ev.code === 'Escape' || ev.code === 'Enter' || ev.code === 'NumpadEnter') go(this, 'Menu');
    });
  }
}
