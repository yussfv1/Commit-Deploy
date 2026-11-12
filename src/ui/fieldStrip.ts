// Полоса над картой. Слева — легенда: значок машины и её название через тире, ничего не закрывает на поле.
// Нажатие на строку легенды подсвечивает такие машины на карте. Машины, которые на этом уровне
// встречаются впервые, отмечены оранжевой точкой. Справа — выбор петель: все сразу или только одного
// робота (остальные петли прячутся). В режиме обучения справа вместо него — плашка «мир на паузе».
// Когда роботов много, полоса ужимается (stripLayout.ts): легенда и правая часть никогда не налезают друг на друга.
import type Phaser from 'phaser';
import { ensureTexture } from '../render/canvas';
import type { HighlightKind } from '../render/field';
import { DEPTH, STRIP } from '../render/layout';
import { iconKey } from '../render/textures';
import type { LevelData, SimSnapshot } from '../types';
import { t } from './i18n';
import {
  LEGEND_GAP,
  LEGEND_ICON_W,
  LOOP_ALL_W,
  LOOP_GAP,
  LOOP_LABEL_GAP,
  LOOP_ROBOT_W_NUMBER,
  fitStrip,
  legendWidth,
  loopButtons,
} from './stripLayout';
import { COLOR, SIZE, css, robotColor } from './theme';
import { Button, txt } from './widgets';

/** Порядок в легенде — по ходу производства: сырьё, обработка, хранение, старт, доки. */
const ORDER: readonly HighlightKind[] = ['depot', 'tank', 'press', 'assembler', 'shelf', 'pad', 'dock'];
const H = 28;

export interface StripHandlers {
  legend(kind: HighlightKind): void;
  solo(robotId: number | null): void;
}

/** Что есть на карте уровня, в порядке легенды. */
export function legendKinds(level: LevelData): HighlightKind[] {
  const present = new Set<HighlightKind>(level.machines.map((m) => m.type));
  if (level.docks.length > 0) present.add('dock');
  return ORDER.filter((k) => present.has(k));
}

/** Машины, которых не было ни на одном уровне раньше этого (на первом уровне новым ничего не считается). */
export function newKinds(level: LevelData, all: readonly LevelData[]): Set<HighlightKind> {
  const index = all.findIndex((l) => l.id === level.id);
  if (index <= 0) return new Set();
  const seen = new Set<HighlightKind>(['dock']);
  for (const l of all.slice(0, index)) for (const m of l.machines) seen.add(m.type);
  return new Set(legendKinds(level).filter((k) => !seen.has(k)));
}

function swatch(scene: Phaser.Scene, color: number): string {
  return ensureTexture(scene, `swatch_${css(color).slice(1)}`, 16, 16, (ctx) => {
    ctx.beginPath();
    ctx.arc(8, 8, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = css(color);
    ctx.fill();
  });
}

const legendLabel = (kind: HighlightKind): string => `— ${t(`legend.${kind}`)}`;

export class FieldStrip {
  private readonly scene: Phaser.Scene;
  private readonly handlers: StripHandlers;
  private readonly numberOf: (robotId: number) => number;
  private readonly filterLabel: Phaser.GameObjects.Text;
  /** Строки легенды: машина, ширина кнопки с надписью, новая ли она на этом уровне. */
  private readonly legend: { kind: HighlightKind; w: number; fresh: boolean }[] = [];
  private readonly legendFull: number;
  private readonly legendIcons: number;
  private legendButtons: Button[] = [];
  private iconsOnly: boolean | null = null;
  private filter: { id: number | null; button: Button }[] = [];
  private sig = '';

  /** numberOf — номер робота, как в подписи «Робот N» на панели (ui/robotNumbers.ts). */
  constructor(
    scene: Phaser.Scene,
    level: LevelData,
    all: readonly LevelData[],
    handlers: StripHandlers,
    numberOf: (robotId: number) => number = (id) => id + 1,
  ) {
    this.scene = scene;
    this.handlers = handlers;
    this.numberOf = numberOf;
    const fresh = newKinds(level, all);
    for (const kind of legendKinds(level)) {
      const probe = txt(scene, 0, 0, legendLabel(kind), { size: SIZE.small });
      // Иконка 20 + зазор 8 + надпись + поля по 10 с каждой стороны.
      const w = Math.ceil(probe.width) + 48;
      probe.destroy();
      this.legend.push({ kind, w, fresh: fresh.has(kind) });
    }
    this.legendFull = legendWidth(this.legend.map((it) => it.w));
    this.legendIcons = legendWidth(this.legend.map(() => LEGEND_ICON_W));
    const y = STRIP.y + STRIP.h / 2;
    this.filterLabel = txt(scene, 0, y, t('strip.loops'), { size: SIZE.micro, color: COLOR.faint, caps: true, ox: 1, oy: 0.5 })
      .setDepth(DEPTH.marker)
      .setVisible(false);
    this.layoutLegend(false);
  }

  /** Новые машины уровня — чтобы подсветить их на карте в начале. */
  static fresh(level: LevelData, all: readonly LevelData[]): HighlightKind[] {
    return [...newKinds(level, all)];
  }

  /**
   * Выбор петель нужен, когда роботов хотя бы двое; в режиме обучения его место занимает плашка
   * шириной reserveRight — легенда ужимается и под неё.
   */
  update(snap: SimSnapshot, solo: number | null, reserveRight = 0): void {
    const show = snap.mode !== 'teach' && snap.robots.length >= 2;
    const robots = show ? loopButtons(snap.robots, this.numberOf) : [];
    const right = show ? 0 : reserveRight;
    const sig = `${right}|${robots.map((r) => `${r.robotId}:${r.colorIndex}:${r.number}`).join(',')}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.relayout(robots, right);
    }
    for (const f of this.filter) f.button.setActive(f.id === solo);
  }

  private relayout(robots: ReturnType<typeof loopButtons>, right: number): void {
    const fit = fitStrip({
      width: STRIP.w,
      legendFull: this.legendFull,
      legendIcons: this.legendIcons,
      labelW: this.filterLabel.width,
      robots: robots.length,
      right,
    });
    this.layoutLegend(fit.icons);
    for (const f of this.filter) f.button.destroy();
    this.filter = [];
    this.filterLabel.setVisible(robots.length > 0 && fit.label);
    if (robots.length === 0) return;
    const d = DEPTH.marker;
    const y = STRIP.y + STRIP.h / 2;
    // На узкой кнопке номер не помещается — остаётся кружок цвета петли (цвет совпадает с петлёй на карте).
    const withNumber = fit.robotW >= LOOP_ROBOT_W_NUMBER;
    const items: { id: number | null; label: string; icon?: string; w: number }[] = [
      { id: null, label: t('strip.all'), w: LOOP_ALL_W },
      ...robots.map((r) => ({
        id: r.robotId,
        label: withNumber ? String(r.number) : '',
        icon: swatch(this.scene, robotColor(r.colorIndex)),
        w: fit.robotW,
      })),
    ];
    // Справа налево: последняя кнопка у края полосы.
    let x = STRIP.x + STRIP.w;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const button = new Button(this.scene, x - it.w / 2, y, {
        w: it.w,
        h: H,
        label: it.label,
        icon: it.icon,
        iconSize: 12,
        size: SIZE.small,
        depth: d,
        onClick: () => this.handlers.solo(it.id),
      });
      this.filter.unshift({ id: it.id, button });
      x -= it.w + LOOP_GAP;
    }
    this.filterLabel.setX(x - LOOP_LABEL_GAP);
  }

  /** Кнопки легенды: с надписями или одними значками (когда справа не хватает места). */
  private layoutLegend(iconsOnly: boolean): void {
    if (iconsOnly === this.iconsOnly) return;
    this.iconsOnly = iconsOnly;
    for (const b of this.legendButtons) b.destroy();
    this.legendButtons = [];
    const y = STRIP.y + STRIP.h / 2;
    let x = STRIP.x;
    for (const it of this.legend) {
      const w = iconsOnly ? LEGEND_ICON_W : it.w;
      const b = new Button(this.scene, x + w / 2, y, {
        w,
        h: H,
        label: iconsOnly ? '' : legendLabel(it.kind),
        kind: 'quiet',
        size: SIZE.small,
        icon: it.kind === 'dock' ? 'dock_legend' : iconKey(it.kind),
        iconSize: 20,
        depth: DEPTH.marker,
        onClick: () => this.handlers.legend(it.kind),
      });
      if (it.fresh) {
        // Новая на этом уровне машина: точка в углу кнопки.
        b.root.add(this.scene.add.circle(w / 2 - 5, -H / 2 + 5, 3.5, COLOR.accent));
      }
      this.legendButtons.push(b);
      x += w + LEGEND_GAP;
    }
  }
}
