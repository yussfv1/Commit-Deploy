// Итог уровня поверх игры: ушла ли ракета, звёзды с условиями, что тормозило, куда дальше.
import Phaser from 'phaser';
import { DEPTH, H, W } from '../render/layout';
import { iconKey } from '../render/textures';
import type { BottleneckReason } from '../types';
import { clock, t } from '../ui/i18n';
import { levelById, levelIndex, nextLevel } from '../ui/levels';
import { COLOR, SIZE } from '../ui/theme';
import { Button, dimmer, plate, rule, txt } from '../ui/widgets';
import { enter } from './flow';

export interface ResultsData {
  levelId: string;
  won: boolean;
  endless: boolean;
  stars: number;
  starEnergyOk: boolean;
  starTimeOk: boolean;
  delivered: number;
  target: number;
  timeLeft: number;
  energySpent: number;
  energy: number;
  /** Порог звезды «экономия» и «скорость» (null — у уровня нет такой звезды). */
  starEnergy: number | null;
  starTimeLeft: number | null;
  misses: number;
  launches: number;
  /** Новый лучший результат. */
  best: boolean;
  bottleneck: BottleneckReason | null;
}

const PANEL_W = 600;
const PAD = 32;

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(r: ResultsData): void {
    enter(this, false);
    this.scene.bringToTop();
    const d = DEPTH.modal;
    dimmer(this, d);
    const level = levelById(r.levelId);
    const next = r.won ? nextLevel(r.levelId) : null;
    const panelH = 340;
    const top = Math.round(H / 2 - panelH / 2);
    const left = W / 2 - PANEL_W / 2;
    const x = left + PAD;
    plate(this, W / 2, H / 2, PANEL_W, panelH, { fill: COLOR.chrome, stroke: COLOR.rule }).setDepth(d + 1);

    const head = level ? `${t('levels.number', { n: levelIndex(r.levelId) + 1 })} · ${t(level.titleKey)}` : '';
    txt(this, x, top + 28, head, { size: SIZE.micro, color: COLOR.dim, caps: true }).setDepth(d + 2);
    const title = r.endless ? t('results.endless', { n: r.launches }) : t(r.won ? 'results.won' : 'results.lost');
    txt(this, x, top + 48, title, { size: SIZE.h1, bold: true, color: r.won || (r.endless && r.launches > 0) ? COLOR.text : COLOR.miss }).setDepth(d + 2);
    if (r.best) txt(this, left + PANEL_W - PAD, top + 28, t('results.best'), { size: SIZE.micro, color: COLOR.ok, caps: true, ox: 1 }).setDepth(d + 2);

    let y = top + 112;
    if (r.won && !r.endless) {
      for (let s = 0; s < 3; s++) {
        this.add.image(x + 24 + s * 52, y + 24, iconKey(s < r.stars ? 'star' : 'star_empty')).setDisplaySize(44, 44).setDepth(d + 2);
      }
      const lines: [boolean, string][] = [
        [true, t('results.plan', { n: r.delivered, target: r.target })],
        [
          r.starEnergyOk,
          r.starEnergy === null
            ? t('results.energy', { n: r.energySpent, max: r.energy })
            : t('results.energyGoal', { n: r.energySpent, max: r.starEnergy }),
        ],
        [
          r.starTimeOk,
          r.starTimeLeft === null
            ? t('results.time', { time: clock(r.timeLeft) })
            : t('results.timeGoal', { time: clock(r.timeLeft), need: clock(r.starTimeLeft) }),
        ],
      ];
      lines.forEach(([ok, text], i) => this.criterion(x + 200, y + 4 + i * 26, ok, text, d + 2));
      y += 96;
    } else {
      txt(this, x, y, t(r.endless ? 'results.endlessText' : 'results.delivered', { n: r.delivered, target: r.target, launches: r.launches }), {
        size: SIZE.body,
        color: COLOR.text,
      }).setDepth(d + 2);
      y += 32;
      if (r.bottleneck) {
        txt(this, x, y, t('results.cause'), { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d + 2);
        txt(this, x, y + 20, t(`bottleneck.${r.bottleneck}`), { size: SIZE.body, color: COLOR.warn, wrap: PANEL_W - PAD * 2 }).setDepth(d + 2);
      }
      y += 64;
    }
    rule(this, x, y, PANEL_W - PAD * 2).setDepth(d + 2);
    txt(this, x, y + 16, t('results.misses', { n: r.misses }), { size: SIZE.small, color: COLOR.dim }).setDepth(d + 2);

    const by = top + panelH - 48;
    const retry = (): void => this.go('Game', { levelId: r.levelId });
    const toLevels = (): void => this.go('LevelSelect', { levelId: next?.id ?? r.levelId });
    const toNext = (): void => {
      if (next) this.go('Game', { levelId: next.id });
    };
    if (next) {
      new Button(this, left + PANEL_W - PAD - 90, by, { w: 180, h: 44, label: t('results.next'), kind: 'primary', size: SIZE.body, hint: 'Enter', depth: d + 2, onClick: toNext });
      new Button(this, left + PANEL_W - PAD - 180 - 12 - 70, by, { w: 140, h: 44, label: t('results.retry'), hint: 'R', depth: d + 2, onClick: retry });
    } else {
      new Button(this, left + PANEL_W - PAD - 90, by, { w: 180, h: 44, label: t('results.retry'), kind: 'primary', size: SIZE.body, hint: 'R', depth: d + 2, onClick: retry });
    }
    new Button(this, x + 70, by, { w: 140, h: 44, label: t('results.levels'), kind: 'quiet', hint: 'Esc', depth: d + 2, onClick: toLevels });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') (next ? toNext : retry)();
      else if (ev.code === 'KeyR') retry();
      else if (ev.code === 'Escape') toLevels();
    });
  }

  /** Лампа условия: зелёная — выполнено, серая — нет. */
  private criterion(x: number, y: number, ok: boolean, text: string, depth: number): void {
    this.add.circle(x, y + 9, 5, ok ? COLOR.ok : 0x44556b).setDepth(depth);
    txt(this, x + 16, y, text, { size: SIZE.small, color: ok ? COLOR.text : COLOR.dim }).setDepth(depth);
  }

  private go(key: string, data: object): void {
    this.scene.stop('Game');
    this.scene.start(key, data);
  }
}
