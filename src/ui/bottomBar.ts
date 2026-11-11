// Нижняя полоса 88 px: задача уровня или темп линии с узким местом, покупки и кнопка СТАРТ.
import type Phaser from 'phaser';
import { BOTTOM, DEPTH, W } from '../render/layout';
import { iconKey } from '../render/textures';
import type { LevelData, MachineType, SimSnapshot } from '../types';
import { clock, num, t } from './i18n';
import { machineCost } from './levels';
import { barRects, bottleneckHintKey, longestCycle, pace, robotBars, telemetrySignature } from './telemetryModel';
import { COLOR, SIZE, STATE_COLOR, robotColor } from './theme';
import { Button, rule, setColor, setText, txt } from './widgets';

export interface BottomHandlers {
  start(): void;
  buy(type: MachineType): void;
}

const Y = BOTTOM.y;
const START_W = 200;
/** Где начинаются мини-полосы кругов роботов. Слева от них — темп линии и подсказка. */
const MINI_X = 368;
const MINI_ROWS = 8;

export class BottomBar {
  private readonly level: LevelData;
  private readonly label: Phaser.GameObjects.Text;
  private readonly value: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly start: Button;
  private readonly shop: { type: MachineType; button: Button; cost: number }[];
  private readonly mini: Phaser.GameObjects.Graphics;
  private readonly miniLabel: Phaser.GameObjects.Text;
  private readonly miniKey: Phaser.GameObjects.Text;
  private readonly miniW: number;
  private miniSig = '';

  constructor(scene: Phaser.Scene, level: LevelData, handlers: BottomHandlers) {
    this.level = level;
    const d = DEPTH.ui;
    scene.add.rectangle(0, Y, W, BOTTOM.h, COLOR.chrome).setOrigin(0, 0).setDepth(d);
    rule(scene, 0, Y, W).setDepth(d);
    // Три строки подняты к верху полосы: даже если подсказка займёт две строки, она не уйдёт за нижний край.
    this.label = txt(scene, 24, Y + 12, '', { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d);
    this.value = txt(scene, 24, Y + 28, '', { size: SIZE.body }).setDepth(d);
    this.hint = txt(scene, 24, Y + 50, '', { size: SIZE.small, color: COLOR.warn, wrap: MINI_X - 48 }).setDepth(d);

    this.start = new Button(scene, W - 24 - START_W / 2, Y + BOTTOM.h / 2, {
      w: START_W,
      h: 52,
      label: t('hud.start'),
      kind: 'primary',
      size: SIZE.title,
      depth: d,
      onClick: () => handlers.start(),
    });

    let x = W - 24 - START_W - 24;
    this.shop = level.buildable.map((type) => {
      const cost = machineCost(level, type);
      const w = 168;
      x -= w;
      const button = new Button(scene, x + w / 2, Y + BOTTOM.h / 2, {
        w,
        h: 40,
        label: t('shop.buy', { name: t(`machine.${type}.name`), cost }),
        icon: iconKey(type),
        size: SIZE.small,
        depth: d,
        onClick: () => handlers.buy(type),
      });
      x -= 8;
      return { type, button, cost };
    });

    // Мини-полосы кругов роботов: та же телеметрия, что по Tab, только коротко.
    this.miniW = Math.max(120, Math.min(360, x - 24 - MINI_X));
    this.miniLabel = txt(scene, MINI_X, Y + 12, t('telemetry.loops'), { size: SIZE.micro, color: COLOR.faint, caps: true }).setDepth(d);
    this.miniKey = txt(scene, MINI_X + this.miniW, Y + 12, t('telemetry.show'), { size: SIZE.micro, color: COLOR.faint, ox: 1 }).setDepth(d);
    this.mini = scene.add.graphics().setDepth(d);
  }

  /** Центр и размер кнопки СТАРТ, которую подсвечивает обучение. */
  anchor(): { x: number; y: number; w: number; h: number } | null {
    const b = this.start;
    return b.root.visible ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
  }

  update(s: SimSnapshot, buyType: MachineType | null): void {
    const item = t(`item.${s.targetItem}.name`);
    if (s.mode === 'teach') {
      setText(this.label, t('bottom.teachLabel').toLocaleUpperCase('ru'));
      setText(this.value, t('bottom.teach'));
      setColor(this.value, COLOR.teach);
      setText(this.hint, '');
    } else if (s.mode === 'plan') {
      setText(this.label, t('bottom.goalLabel').toLocaleUpperCase('ru'));
      setText(
        this.value,
        this.level.endless
          ? t('bottom.goalEndless', { item, n: s.target, time: clock(s.timeLeft) })
          : t('bottom.goal', { item, n: s.target, time: clock(s.timeLimit) }),
      );
      setColor(this.value, COLOR.text);
      setText(this.hint, s.robots.length === 0 ? t('bottom.noRobots') : '');
      setColor(this.hint, COLOR.dim);
    } else {
      const p = pace(s);
      setText(this.label, t('bottom.paceLabel').toLocaleUpperCase('ru'));
      setText(this.value, p === 'none' ? t('bottom.paceNone') : t('bottom.pace', { now: num(s.throughput), need: num(s.requiredRate) }));
      setColor(this.value, p === 'behind' ? COLOR.miss : p === 'ok' ? COLOR.ok : COLOR.dim);
      // Совет подбирается под уровень: не предлагаем купить то, чего здесь не купить.
      setText(this.hint, s.bottleneck ? t(bottleneckHintKey(s.bottleneck, this.level, s)) : '');
      setColor(this.hint, COLOR.warn);
    }
    this.drawMini(s);
    const plan = s.mode === 'plan';
    this.start.setVisible(plan).setEnabled(s.robots.length > 0);
    for (const b of this.shop) {
      b.button.setVisible(s.mode === 'plan' || s.mode === 'running');
      b.button.setEnabled(s.energyLeft >= b.cost || buyType === b.type);
      b.button.setActive(buyType === b.type);
    }
  }

  private drawMini(s: SimSnapshot): void {
    const show = s.mode === 'running' && s.robots.length > 0;
    this.miniLabel.setVisible(show);
    this.miniKey.setVisible(show);
    if (!show) {
      if (this.miniSig !== '') this.mini.clear();
      this.miniSig = '';
      return;
    }
    const bars = robotBars(s.robots.slice(0, MINI_ROWS));
    const sig = telemetrySignature(bars, []);
    if (sig === this.miniSig) return;
    this.miniSig = sig;
    const g = this.mini;
    g.clear();
    const longest = longestCycle(bars);
    const scale = longest > 0 ? (this.miniW - 12) / longest : 0;
    const pitch = Math.min(8, Math.floor(48 / Math.max(1, bars.length)));
    bars.forEach((bar, i) => {
      const y = Y + 32 + i * pitch;
      const h = Math.max(3, pitch - 2);
      g.fillStyle(robotColor(bar.colorIndex), 1);
      g.fillRect(MINI_X, y, 6, h);
      g.fillStyle(COLOR.sunken, 1);
      g.fillRect(MINI_X + 12, y, this.miniW - 12, h);
      for (const r of barRects(bar.parts, scale)) {
        g.fillStyle(STATE_COLOR[r.state], 1);
        g.fillRect(MINI_X + 12 + r.x, y, r.w, h);
      }
    });
  }
}
