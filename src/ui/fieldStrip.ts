// Полоса над картой. Слева — легенда: значок машины и её название через тире, ничего не закрывает на поле.
// Нажатие на строку легенды подсвечивает такие машины на карте. Машины, которые на этом уровне
// встречаются впервые, отмечены оранжевой точкой. Справа — выбор петель: все сразу или только одного
// робота (остальные петли прячутся). В режиме обучения справа вместо него — плашка «мир на паузе».
import type Phaser from 'phaser';
import { ensureTexture } from '../render/canvas';
import type { HighlightKind } from '../render/field';
import { DEPTH, STRIP } from '../render/layout';
import { iconKey } from '../render/textures';
import type { LevelData, SimSnapshot } from '../types';
import { t } from './i18n';
import { COLOR, SIZE, css, robotColor } from './theme';
import { Button, txt } from './widgets';

/** Порядок в легенде — по ходу производства: сырьё, обработка, хранение, старт, доки. */
const ORDER: readonly HighlightKind[] = ['depot', 'tank', 'press', 'assembler', 'shelf', 'pad', 'dock'];
const H = 28;
const GAP = 6;

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

export class FieldStrip {
  private readonly scene: Phaser.Scene;
  private readonly handlers: StripHandlers;
  private readonly filterLabel: Phaser.GameObjects.Text;
  private filter: { id: number | null; button: Button }[] = [];
  private filterSig = '';
  private shown = true;

  constructor(scene: Phaser.Scene, level: LevelData, all: readonly LevelData[], handlers: StripHandlers) {
    this.scene = scene;
    this.handlers = handlers;
    const d = DEPTH.marker;
    const y = STRIP.y + STRIP.h / 2;
    const fresh = newKinds(level, all);
    let x = STRIP.x;
    for (const kind of legendKinds(level)) {
      const label = `— ${t(`legend.${kind}`)}`;
      const probe = txt(scene, 0, 0, label, { size: SIZE.small });
      // Иконка 20 + зазор 8 + надпись + поля по 10 с каждой стороны.
      const w = Math.ceil(probe.width) + 48;
      probe.destroy();
      const icon = kind === 'dock' ? 'dock_legend' : iconKey(kind);
      const b = new Button(scene, x + w / 2, y, {
        w,
        h: H,
        label,
        kind: 'quiet',
        size: SIZE.small,
        icon,
        iconSize: 20,
        depth: d,
        onClick: () => handlers.legend(kind),
      });
      if (fresh.has(kind)) {
        // Новая на этом уровне машина: точка в углу и подпись видна ярче.
        b.root.add(scene.add.circle(w / 2 - 5, -H / 2 + 5, 3.5, COLOR.accent));
      }
      x += w + GAP;
    }
    this.filterLabel = txt(scene, 0, y, t('strip.loops'), { size: SIZE.micro, color: COLOR.faint, caps: true, ox: 1, oy: 0.5 }).setDepth(d);
  }

  /** Новые машины уровня — чтобы подсветить их на карте в начале. */
  static fresh(level: LevelData, all: readonly LevelData[]): HighlightKind[] {
    return [...newKinds(level, all)];
  }

  update(snap: SimSnapshot, solo: number | null): void {
    // Выбор петель нужен, когда роботов хотя бы двое; в режиме обучения его место занимает плашка.
    const show = snap.mode !== 'teach' && snap.robots.length >= 2;
    const sig = snap.robots.map((r) => `${r.id}:${r.colorIndex}`).join(',');
    if (show && sig !== this.filterSig) this.rebuild(snap);
    if (show !== this.shown) {
      this.shown = show;
      this.filterLabel.setVisible(show);
      for (const f of this.filter) f.button.setVisible(show);
    }
    if (show) for (const f of this.filter) f.button.setActive(f.id === solo);
  }

  private rebuild(snap: SimSnapshot): void {
    this.filterSig = snap.robots.map((r) => `${r.id}:${r.colorIndex}`).join(',');
    for (const f of this.filter) f.button.destroy();
    this.filter = [];
    const d = DEPTH.marker;
    const y = STRIP.y + STRIP.h / 2;
    let right = STRIP.x + STRIP.w;
    const items: { id: number | null; label: string; icon?: string; w: number }[] = [
      { id: null, label: t('strip.all'), w: 52 },
      ...snap.robots.map((r) => ({ id: r.id, label: String(r.id + 1), icon: swatch(this.scene, robotColor(r.colorIndex)), w: 46 })),
    ];
    // Справа налево: последняя кнопка у края полосы.
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const button = new Button(this.scene, right - it.w / 2, y, {
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
      right -= it.w + 4;
    }
    this.filterLabel.setX(right - 6);
  }
}
