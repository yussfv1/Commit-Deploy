// Правая панель 256 px: в показе — запись и счётчик блоков; у выбранного робота — его программа лентой
// и кнопки правки; у машины — что она делает и насколько загружена; когда ничего не выбрано — что делать.
import type Phaser from 'phaser';
import { DEPTH, PANEL } from '../render/layout';
import { iconKey } from '../render/textures';
import { isActionOp } from '../sim';
import type { LevelData, MachineView, RobotView, SimSnapshot } from '../types';
import { BlockStrip } from './blocks';
import { num, t } from './i18n';
import { codeLineAt, toCode } from './programModel';
import { COLOR, LAMP, SIZE, robotColor } from './theme';
import { Button, rule, setColor, setText, txt } from './widgets';

export type PanelView =
  | { kind: 'idle' }
  | { kind: 'teach' }
  | { kind: 'robot'; robotId: number }
  | { kind: 'machine'; machineId: number };

export interface PanelHandlers {
  finishTeach(): void;
  cancelTeach(): void;
  pick(index: number): void;
  removeBlock(): void;
  toggleSense(): void;
  wait(delta: number): void;
  copy(): void;
  rewrite(): void;
  removeRobot(): void;
  toggleCode(): void;
  sell(): void;
}

export interface PanelState {
  view: PanelView;
  /** Выбранный блок программы или -1. */
  pick: number;
  code: boolean;
}

const X = PANEL.x + 16;
const CW = PANEL.w - 32;
const TOP = PANEL.y + 16;
const BOTTOM = PANEL.y + PANEL.h - 16;
const CODE_LINES = 13;

export class SidePanel {
  private readonly scene: Phaser.Scene;
  private readonly level: LevelData;
  private readonly strip: BlockStrip;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly swatch: Phaser.GameObjects.Rectangle;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private readonly code: Phaser.GameObjects.Text[] = [];
  private readonly codeBar: Phaser.GameObjects.Rectangle;
  private readonly teachButtons: Button[];
  private readonly robotButtons: Record<string, Button>;
  private readonly sellButton: Button;
  private readonly finish: Button;
  private shown = '';

  constructor(scene: Phaser.Scene, level: LevelData, handlers: PanelHandlers) {
    this.scene = scene;
    this.level = level;
    const d = DEPTH.ui;
    scene.add.rectangle(PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLOR.chrome).setOrigin(0, 0).setDepth(d);
    rule(scene, PANEL.x, PANEL.y, 1, PANEL.h).setDepth(d);

    this.swatch = scene.add.rectangle(X, TOP + 10, 12, 12, COLOR.text).setOrigin(0, 0.5).setDepth(d + 1);
    this.icon = scene.add.image(X + 10, TOP + 10, iconKey('depot')).setDisplaySize(22, 22).setDepth(d + 1);
    this.title = txt(scene, X, TOP, '', { size: SIZE.body, bold: true }).setDepth(d + 1);
    this.sub = txt(scene, X, TOP + 26, '', { size: SIZE.small, color: COLOR.dim, wrap: CW }).setDepth(d + 1);
    this.body = txt(scene, X, TOP + 64, '', { size: SIZE.small, color: COLOR.dim, wrap: CW, lineSpacing: 5 }).setDepth(d + 1);
    this.note = txt(scene, X, 0, '', { size: SIZE.small, color: COLOR.warn, wrap: CW }).setDepth(d + 1);

    this.strip = new BlockStrip(scene, X, TOP + 64, CW, 8, d + 1);
    this.strip.setPickHandler((i) => handlers.pick(i));

    this.codeBar = scene.add.rectangle(X - 8, 0, 3, 18, COLOR.text).setOrigin(0, 0).setDepth(d + 1);
    // Строки «как кода» создаются при первом нажатии кнопки: пока они не нужны, игра не тратит на них время при входе.

    const half = (CW - 8) / 2;
    const at = (col: number, row: number, wide = false): { x: number; y: number; w: number } => ({
      x: wide ? X + CW / 2 : X + half / 2 + col * (half + 8),
      y: BOTTOM - 16 - (4 - row) * 40,
      w: wide ? CW : half,
    });
    const make = (pos: { x: number; y: number; w: number }, label: string, onClick: () => void, kind: 'normal' | 'danger' | 'primary' = 'normal'): Button =>
      new Button(scene, pos.x, pos.y, { w: pos.w, h: 34, label, size: SIZE.small, kind, depth: d + 1, onClick });

    this.finish = make(at(0, 4, true), t('teach.finish'), () => handlers.finishTeach(), 'primary');
    this.teachButtons = [this.finish, make(at(0, 3, true), t('teach.cancel'), () => handlers.cancelTeach())];

    this.robotButtons = {
      remove: make(at(0, 0), t('robot.removeBlock'), () => handlers.removeBlock()),
      sense: make(at(1, 0), t('robot.sense'), () => handlers.toggleSense()),
      waitLess: make(at(0, 1), t('robot.waitLess'), () => handlers.wait(-1)),
      waitMore: make(at(1, 1), t('robot.waitMore'), () => handlers.wait(1)),
      copy: make(at(0, 2, true), t('robot.copy'), () => handlers.copy()),
      rewrite: make(at(0, 3), t('robot.rewrite'), () => handlers.rewrite()),
      dismiss: make(at(1, 3), t('robot.dismiss'), () => handlers.removeRobot(), 'danger'),
      code: make(at(0, 4, true), t('robot.code'), () => handlers.toggleCode()),
    };
    this.sellButton = make(at(0, 4, true), t('machine.sell'), () => handlers.sell(), 'danger');
  }

  /** Центр и размер кнопки, которую подсвечивает обучение. */
  anchor(id: 'finish' | 'copy'): { x: number; y: number; w: number; h: number } | null {
    const b = id === 'finish' ? this.finish : this.robotButtons.copy;
    return b.root.visible ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
  }

  private ensureCode(): void {
    if (this.code.length > 0) return;
    for (let i = 0; i < CODE_LINES; i++) {
      this.code.push(txt(this.scene, X, TOP + 64 + i * 20, '', { size: SIZE.small, mono: true }).setDepth(DEPTH.ui + 1));
    }
  }

  update(snap: SimSnapshot, state: PanelState): void {
    const v = state.view;
    const key = v.kind === 'robot' ? `robot${v.robotId}${state.code}` : v.kind === 'machine' ? `machine${v.machineId}` : v.kind;
    if (key !== this.shown) {
      this.shown = key;
      this.layout(v.kind, state.code);
    }
    if (v.kind === 'teach') this.showTeach(snap);
    else if (v.kind === 'robot') {
      const r = snap.robots.find((x) => x.id === v.robotId);
      if (r) this.showRobot(snap, r, state);
    } else if (v.kind === 'machine') {
      const m = snap.machines.find((x) => x.id === v.machineId);
      if (m) this.showMachine(m);
    } else this.showIdle(snap);
  }

  private layout(kind: PanelView['kind'], code: boolean): void {
    const robot = kind === 'robot';
    this.swatch.setVisible(robot);
    this.icon.setVisible(kind === 'machine');
    this.title.setX(robot ? X + 20 : kind === 'machine' ? X + 30 : X);
    this.strip.setVisible(kind === 'teach' || (robot && !code));
    if (robot && code) this.ensureCode();
    for (const line of this.code) line.setVisible(robot && code);
    this.codeBar.setVisible(false);
    this.body.setVisible(kind !== 'robot');
    for (const b of this.teachButtons) b.setVisible(kind === 'teach');
    for (const b of Object.values(this.robotButtons)) b.setVisible(robot);
    this.robotButtons.code.setActive(code);
    this.sellButton.setVisible(false);
    this.note.setVisible(false);
  }

  private showIdle(snap: SimSnapshot): void {
    setColor(this.title, COLOR.text);
    setText(this.title, t('panel.idleTitle'));
    setText(this.sub, '');
    setText(this.body, t(snap.robots.length > 0 ? 'panel.idleWithRobots' : 'panel.idle'));
    this.body.setY(TOP + 32);
  }

  private showTeach(snap: SimSnapshot): void {
    setText(this.title, t('teach.title'));
    setColor(this.title, COLOR.teach);
    const op = snap.operator;
    setText(this.sub, t('teach.counter', { n: op?.blocks ?? snap.recording.length, max: this.level.maxProgram }));
    this.strip.set(snap.recording, snap.recording.length - 1, -1, COLOR.teach);
    const stripBottom = TOP + 64 + this.strip.visibleHeight;
    this.body.setY(stripBottom + 16).setVisible(true);
    setText(this.body, t('teach.keys'));
    this.finish.setEnabled(snap.canFinishTeach);
    this.note.setY(this.body.y + this.body.height + 12).setVisible(!snap.canFinishTeach && snap.recording.length > 0);
    setText(this.note, t('teach.returnHint'));
  }

  private showRobot(snap: SimSnapshot, r: RobotView, state: PanelState): void {
    const color = robotColor(r.colorIndex);
    setColor(this.title, COLOR.text);
    this.swatch.setFillStyle(color);
    setText(this.title, t('robot.title', { n: r.id + 1, dock: r.dock + 1 }));
    setText(
      this.sub,
      r.cycleTime > 0
        ? t('robot.stats', { time: num(r.cycleTime), useful: Math.round(r.usefulShare * 100) })
        : t(r.state === 'idle' ? 'robot.waitingStart' : 'robot.firstLoop'),
    );
    const program = r.pendingProgram ?? r.program;
    const pc = r.pendingProgram ? -1 : r.pc;
    let bottom: number;
    if (state.code) {
      const lines = toCode(program, (k) => t(k));
      const at = codeLineAt(lines, pc);
      const first = Math.max(0, Math.min(lines.length + 1 - CODE_LINES, at + 1 - Math.floor(CODE_LINES / 2)));
      for (let i = 0; i < CODE_LINES; i++) {
        const li = first + i - 1;
        const text = li === -1 ? t('code.loop') : lines[li] ? `  ${lines[li].text}` : '';
        setText(this.code[i], text);
        setColor(this.code[i], li === at ? COLOR.text : li === -1 ? COLOR.faint : COLOR.dim);
      }
      const row = at + 1 - first;
      this.codeBar.setVisible(at >= 0 && row >= 0 && row < CODE_LINES).setFillStyle(color).setY(TOP + 64 + row * 20);
      bottom = TOP + 64 + CODE_LINES * 20;
    } else {
      this.strip.set(program, pc, state.pick, color);
      bottom = TOP + 64 + this.strip.visibleHeight;
    }
    this.note.setY(bottom + 12).setVisible(r.pendingProgram !== null);
    setText(this.note, t('robot.pending'));

    const picked = program[state.pick];
    const senseAllowed = this.level.allowedOps.includes('sense');
    const b = this.robotButtons;
    b.remove.setEnabled(!!picked && program.length > 1);
    b.sense.setEnabled(senseAllowed && !!picked && (picked.op === 'sense' || isActionOp(picked.op)));
    b.waitLess.setEnabled(!!picked && picked.op === 'wait');
    b.waitMore.setEnabled(!!picked);
    b.copy.setEnabled(snap.energyLeft >= snap.robotCost + (r.hasSensor ? this.level.sensorCost : 0));
    b.code.setActive(state.code);
  }

  private showMachine(m: MachineView): void {
    this.icon.setTexture(iconKey(m.type)).setDisplaySize(22, 22);
    setColor(this.title, COLOR.text);
    setText(this.title, t(`machine.${m.type}.name`));
    setText(this.sub, t(`state.machine.${m.state}`));
    setColor(this.sub, LAMP[m.state] === LAMP.idle ? COLOR.dim : LAMP[m.state]);
    const lines = [t(`machine.${m.type}.desc`)];
    if (m.kind === 'source' || m.kind === 'storage') lines.push(t('machine.stock', { n: m.stock, max: m.capacity }));
    if (m.kind === 'sink') lines.push(t('machine.accepted', { n: m.stock }));
    if (m.kind === 'processor' || m.kind === 'source') lines.push(t('machine.load', { n: Math.round(m.utilization * 100) }));
    if (m.bought) lines.push(t('machine.sellHint'));
    setText(this.body, lines.join('\n\n'));
    this.body.setY(TOP + 64).setVisible(true);
    this.sellButton.setVisible(m.bought);
  }
}
