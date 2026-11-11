// Настройки поверх меню или паузы: громкость, язык, полный экран, сброс прогресса.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { audio } from '../ui/audio';
import { i18n, t } from '../ui/i18n';
import { store } from '../ui/storage';
import type { Settings } from '../ui/storage';
import { COLOR, SIZE } from '../ui/theme';
import { Button, Slider, dimmer, plate, rule, setText, txt } from '../ui/widgets';
import { enter } from './flow';

const VOLUMES = [
  { field: 'master', key: 'settings.master' },
  { field: 'music', key: 'settings.music' },
  { field: 'sfx', key: 'settings.sfx' },
] as const;

const PANEL_W = 560;
const PAD = 32;

export class SettingsScene extends Phaser.Scene {
  private from = 'Menu';

  constructor() {
    super('Settings');
  }

  create(data: { from?: string }): void {
    enter(this, false);
    this.from = data?.from ?? 'Menu';
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    const languages = i18n.languages();
    const multi = languages.length > 1 && this.from === 'Menu';
    const panelH = multi ? 504 : 440;
    const top = Math.round(H / 2 - panelH / 2);
    const left = W / 2 - PANEL_W / 2;
    const inner = left + PAD;
    const right = left + PANEL_W - PAD;
    plate(this, W / 2, H / 2, PANEL_W, panelH, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);
    txt(this, inner, top + 28, t('settings.title'), { size: SIZE.h1, bold: true }).setDepth(d + 2);

    const settings = store.settings();
    VOLUMES.forEach((row, i) => {
      const y = top + 112 + i * 52;
      txt(this, inner, y, t(row.key), { size: SIZE.body, oy: 0.5 }).setDepth(d + 2);
      const value = txt(this, right, y, percent(settings[row.field]), { size: SIZE.small, color: COLOR.dim, ox: 1, oy: 0.5 }).setDepth(d + 2);
      new Slider(
        this,
        inner + 300,
        y,
        220,
        d + 2,
        settings[row.field],
        (v) => {
          const patch: Partial<Settings> = { [row.field]: v };
          store.setSettings(patch);
          audio.setVolumes(store.settings());
          setText(value, percent(v));
        },
        () => audio.play(row.field === 'music' ? 'click' : 'deliver'),
      );
    });

    let y = top + 268;
    rule(this, inner, y - 24, PANEL_W - PAD * 2).setDepth(d + 2);
    if (multi) {
      txt(this, inner, y, t('settings.lang'), { size: SIZE.body, oy: 0.5 }).setDepth(d + 2);
      languages.forEach((code, i) => {
        const b = new Button(this, inner + 250 + i * 116, y, {
          w: 108,
          h: 34,
          label: t(`settings.langName.${code}`),
          depth: d + 2,
          onClick: () => {
            if (code === i18n.lang()) return;
            store.setSettings({ lang: code });
            i18n.setLang(code);
            document.title = t('app.title');
            // Меню пересоздаётся на новом языке и снова открывает настройки.
            this.scene.stop();
            this.scene.start('Menu', { openSettings: true });
          },
        });
        b.setActive(code === i18n.lang());
      });
      y += 64;
    }

    txt(this, inner, y, t('settings.screen'), { size: SIZE.body, oy: 0.5 }).setDepth(d + 2);
    const fullLabel = (): string => t(this.scale.isFullscreen ? 'settings.windowed' : 'settings.fullscreen');
    const full = new Button(this, right - 100, y, { w: 200, h: 36, label: fullLabel(), depth: d + 2, onClick: () => this.scale.toggleFullscreen() });
    // Браузер включает полный экран не мгновенно, поэтому надпись меняем по его событию.
    const relabel = (): void => {
      full.setLabel(fullLabel());
    };
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, relabel);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, relabel);
    this.events.once('shutdown', () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, relabel);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, relabel);
    });

    y += 52;
    txt(this, inner, y, t('settings.progress'), { size: SIZE.body, oy: 0.5 }).setDepth(d + 2);
    let armed = false;
    const reset = new Button(this, right - 100, y, {
      w: 200,
      h: 36,
      label: t('settings.reset'),
      kind: 'danger',
      depth: d + 2,
      onClick: () => {
        // Сброс в два нажатия: первое только спрашивает подтверждение.
        if (!armed) {
          armed = true;
          reset.setLabel(t('settings.resetConfirm'));
          this.time.delayedCall(3000, () => {
            if (!armed) return;
            armed = false;
            reset.setLabel(t('settings.reset'));
          });
          return;
        }
        armed = false;
        store.reset();
        reset.setLabel(t('settings.resetDone')).setEnabled(false);
      },
    });

    new Button(this, right - 80, top + panelH - 44, {
      w: 160,
      h: 44,
      label: t('settings.back'),
      kind: 'primary',
      size: SIZE.body,
      depth: d + 2,
      onClick: () => this.close(),
    });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (ev.code === 'Escape' || ev.code === 'Enter' || ev.code === 'NumpadEnter') this.close();
    });
  }

  private close(): void {
    const from = this.from;
    this.scene.stop();
    this.scene.resume(from);
  }
}

const percent = (v: number): string => `${Math.round(v * 100)} %`;
