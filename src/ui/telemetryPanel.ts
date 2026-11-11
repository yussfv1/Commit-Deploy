// Телеметрия по Tab: полоса последнего круга каждого робота по состояниям (идёт, несёт, действует,
// ждёт, датчик, промах), время круга и полезная доля, загрузка машин за 30 секунд.
// Полосы всех роботов в одном масштабе: у кого круг длиннее, видно сразу. Перерисовка — только при новых данных.
import type Phaser from 'phaser';
import { BOTTOM, DEPTH, FIELD } from '../render/layout';
import type { RobotState, SimSnapshot } from '../types';
import { num, t } from './i18n';
import { barRects, longestCycle, machineLoads, robotBars, telemetrySignature } from './telemetryModel';
import { COLOR, SIZE, STATE_COLOR, robotColor } from './theme';
import { rule, setColor, setText, txt } from './widgets';

const LEGEND: readonly RobotState[] = ['move', 'carry', 'act', 'wait', 'sense', 'miss'];
const MAX_ROWS = 8;
const MAX_MACHINES = 6;
const ROW_H = 26;
const PAD = 24;
const NAME_W = 104;
const BAR_X = PAD + NAME_W;
const STATS_W = 300;
const BAR_W = FIELD.w - BAR_X - STATS_W - PAD;
const BAR_H = 10;
const HEAD_H = 72;
const MACHINES_H = 56;

interface Row {
  name: Phaser.GameObjects.Text;
  stats: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  robotId: number;
}

export class TelemetryPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly topRule: Phaser.GameObjects.Rectangle;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly head: Phaser.GameObjects.Container;
  private readonly rows: Row[] = [];
  private readonly empty: Phaser.GameObjects.Text;
  private readonly machinesLabel: Phaser.GameObjects.Text;
  private readonly machineTexts: Phaser.GameObjects.Text[] = [];
  private sig = '';
  private open = false;

  constructor(scene: Phaser.Scene, onPick: (robotId: number) => void) {
    this.root = scene.add.container(FIELD.x, 0).setDepth(DEPTH.ui - 1).setVisible(false);
    this.bg = scene.add.rectangle(0, 0, FIELD.w, 10, COLOR.chrome, 0.97).setOrigin(0, 0).setInteractive();
    this.topRule = rule(scene, 0, 0, FIELD.w);
    this.g = scene.add.graphics();

    const title = txt(scene, PAD, 18, t('telemetry.title'), { size: SIZE.micro, color: COLOR.dim, caps: true });
    const sub = txt(scene, PAD + title.width + 12, 16, t('telemetry.subtitle'), { size: SIZE.small, color: COLOR.faint });
    const close = txt(scene, FIELD.w - PAD, 18, t('telemetry.hide'), { size: SIZE.micro, color: COLOR.faint, ox: 1 });
    const legend: Phaser.GameObjects.GameObject[] = [];
    let lx = PAD;
    for (const state of LEGEND) {
      legend.push(scene.add.rectangle(lx, 48, 10, 10, STATE_COLOR[state]).setOrigin(0, 0.5));
      const label = txt(scene, lx + 16, 48, t(`state.robot.${state}`), { size: SIZE.small, color: COLOR.dim, oy: 0.5 });
      legend.push(label);
      lx += 16 + label.width + 20;
    }
    this.head = scene.add.container(0, 0, [title, sub, close, ...legend]);

    for (let i = 0; i < MAX_ROWS; i++) {
      const row: Row = {
        name: txt(scene, PAD + 16, 0, '', { size: SIZE.small, oy: 0.5 }),
        stats: txt(scene, BAR_X + BAR_W + 16, 0, '', { size: SIZE.small, color: COLOR.dim, oy: 0.5 }),
        zone: scene.add.zone(0, 0, FIELD.w, ROW_H).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }),
        robotId: -1,
      };
      row.zone.on('pointerup', () => {
        if (row.robotId >= 0) onPick(row.robotId);
      });
      this.rows.push(row);
    }
    this.empty = txt(scene, PAD, HEAD_H + 8, t('telemetry.empty'), { size: SIZE.small, color: COLOR.dim });
    this.machinesLabel = txt(scene, PAD, 0, t('telemetry.machines'), { size: SIZE.micro, color: COLOR.faint, caps: true });
    for (let i = 0; i < MAX_MACHINES; i++) this.machineTexts.push(txt(scene, 0, 0, '', { size: SIZE.small, oy: 0.5 }));

    this.root.add([this.bg, this.topRule, this.g, this.head, this.empty, this.machinesLabel, ...this.machineTexts]);
    for (const r of this.rows) this.root.add([r.zone, r.name, r.stats]);
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Точка экрана над открытой панелью: такие нажатия не должны доходить до карты под ней. */
  covers(y: number): boolean {
    return this.open && y >= this.root.y;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.setVisible(open);
    this.sig = '';
  }

  update(s: SimSnapshot, selectedRobot: number | null): void {
    if (!this.open) return;
    const bars = robotBars(s.robots.slice(0, MAX_ROWS));
    const loads = machineLoads(s.machines).slice(0, MAX_MACHINES);
    const bn = s.bottleneck;
    const sig = `${telemetrySignature(bars, loads)}#${selectedRobot}#${bn ? bn.kind + bn.id : ''}`;
    if (sig === this.sig) return;
    this.sig = sig;

    const height = HEAD_H + Math.max(1, bars.length) * ROW_H + 12 + MACHINES_H;
    const top = BOTTOM.y - height;
    this.root.setY(top);
    this.bg.setSize(FIELD.w, height);
    this.empty.setVisible(bars.length === 0);

    const g = this.g;
    g.clear();
    const longest = longestCycle(bars);
    const scale = longest > 0 ? BAR_W / longest : 0;
    this.rows.forEach((row, i) => {
      const bar = bars[i];
      const visible = !!bar;
      row.name.setVisible(visible);
      row.stats.setVisible(visible);
      if (visible) row.zone.setInteractive({ useHandCursor: true });
      else row.zone.disableInteractive();
      row.robotId = bar ? bar.robotId : -1;
      if (!bar) return;
      const y = HEAD_H + i * ROW_H + ROW_H / 2;
      const isBottleneck = bn?.kind === 'robot' && bn.id === bar.robotId;
      row.name.setY(y);
      row.stats.setY(y);
      row.zone.setY(y);
      setText(row.name, t('telemetry.robot', { n: bar.robotId + 1 }));
      setColor(row.name, bar.robotId === selectedRobot ? COLOR.text : COLOR.dim);
      setText(
        row.stats,
        bar.total > 0
          ? t('telemetry.stats', { time: num(bar.cycleTime), useful: Math.round(bar.usefulShare * 100), misses: bar.misses })
          : t('telemetry.noLoop'),
      );
      setColor(row.stats, isBottleneck ? COLOR.warn : COLOR.dim);
      g.fillStyle(robotColor(bar.colorIndex), 1);
      g.fillRect(PAD, y - 4, 8, 8);
      // Подложка полосы: длина самого длинного круга. Отрезки — по состояниям.
      g.fillStyle(COLOR.sunken, 1);
      g.fillRect(BAR_X, y - BAR_H / 2, BAR_W, BAR_H);
      for (const r of barRects(bar.parts, scale)) {
        g.fillStyle(STATE_COLOR[r.state], 1);
        g.fillRect(BAR_X + r.x, y - BAR_H / 2, r.w, BAR_H);
      }
      if (isBottleneck) {
        g.lineStyle(1.5, COLOR.warn, 1);
        g.strokeRect(BAR_X - 3, y - BAR_H / 2 - 3, (bar.total > 0 ? bar.total * scale : BAR_W) + 6, BAR_H + 6);
      }
    });

    // Загрузка машин: короткая полоса и проценты, узкое место — жёлтым.
    const my = HEAD_H + Math.max(1, bars.length) * ROW_H + 12;
    this.machinesLabel.setY(my);
    let mx = PAD;
    this.machineTexts.forEach((label, i) => {
      const m = loads[i];
      label.setVisible(!!m);
      if (!m) return;
      const hot = bn?.kind === 'machine' && bn.id === m.id;
      const pct = Math.round(m.load * 100);
      setText(label, t('telemetry.machine', { name: t(`machine.${m.type}.name`), n: pct }));
      setColor(label, hot ? COLOR.warn : COLOR.dim);
      label.setPosition(mx, my + 32);
      const barX = mx + label.width + 8;
      g.fillStyle(COLOR.sunken, 1);
      g.fillRect(barX, my + 29, 56, 6);
      g.fillStyle(hot ? COLOR.warn : COLOR.dim, 1);
      g.fillRect(barX, my + 29, Math.max(1, 56 * m.load), 6);
      mx = barX + 56 + 28;
    });
    this.machinesLabel.setVisible(loads.length > 0);
  }
}
