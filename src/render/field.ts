// Карта уровня: пол с сеткой, стены, доки, машины, роботы и их петли. Рисуется только из снимка
// симуляции — экран не знает правил мира. Машины и роботы лежат в Map<id, …> и создаются
// или удаляются по разнице снимков. Всё собрано в один контейнер: в игре он в натуральную величину,
// в меню — уменьшенная копия той же карты.
import Phaser from 'phaser';
import { TILE } from '../types';
import type { Dir, LevelData, MachineView, OperatorView, RobotView, SimEvent, SimSnapshot } from '../types';
import { COLOR, ITEM_COLOR, LAMP, SIZE, css, robotColor } from '../ui/theme';
import { CanvasLayer } from './canvas';
import { cellAt, cellCenter } from './layout';
import { Fx } from './fx';
import { LoopLayer } from './loopLayer';
import type { LoopSpec } from './loopLayer';
import { Rocket } from './rocket';
import { laneOffset, robotPose } from './robotPose';
import { robotFrameName, robotSheet, viewOf, walkFrame } from './robotSprites';
import type { RobotFrame } from './robotSprites';
import { iconKey, tileKey } from './textures';
import { t } from '../ui/i18n';
import { textRes, txt } from '../ui/widgets';

/** За сколько секунд оператор доходит до новой клетки после нажатия. */
const OPERATOR_STEP = 0.12;
/** Размер пиксельного робота в пикселях уровня (клетка — 64). */
const ROBOT_SIZE = 46;
/** Где над роботом висит груз: над антенной, чуть качается в такт шагу. */
const ITEM_Y = -36;
/** Оператор в показе — светлый робот, чтобы не путать его с цветными роботами линии. */
const OPERATOR_COLOR = 0xe4eefa;
/** В показе роботы копии мира тоже делают целый шаг за одно нажатие — доводим их плавно (95 % пути за ~0,13 с). */
const TEACH_EASE = 0.045;

interface MachineSprite {
  type: MachineView['type'];
  root: Phaser.GameObjects.Container;
  lamp: Phaser.GameObjects.Arc;
  barBg: Phaser.GameObjects.Rectangle;
  bar: Phaser.GameObjects.Rectangle;
  pips: Phaser.GameObjects.Rectangle[];
  out: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Image;
  key: string;
}

interface RobotSprite {
  root: Phaser.GameObjects.Container;
  /** Пиксельный робот: кадр меняется по ракурсу, шагу, дыханию и морганию. */
  body: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  item: Phaser.GameObjects.Image;
  wave: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
  /** Сглаженный сдвиг на свою полосу: на поворотах робот плавно перестраивается, а не прыгает. */
  ox: number;
  oy: number;
  /** Где робот нарисован (в клетках, без сдвига полосы). */
  cx: number;
  cy: number;
  seen: boolean;
  /** Когда моргнуть в следующий раз (время сцены, мс). */
  blinkAt: number;
  /** Сдвиг фазы дыхания — чтобы роботы не дышали хором. */
  breath: number;
}

export interface BottleneckMark {
  kind: 'robot' | 'machine';
  id: number;
  x: number;
  y: number;
}

export interface FieldRenderOpts {
  /** Выбранный робот: его петля ярче, по ней бегут точки. */
  selectedRobot?: number | null;
  selectedMachine?: number | null;
  /** Дополнительные петли (правка, которая вступит со следующего круга). */
  extraLoops?: readonly LoopSpec[];
  /** Насколько ярки невыбранные петли. */
  dim?: number;
  /** Показать петлю только этого робота (остальные петли спрятаны, роботы бледнеют). null — все. */
  solo?: number | null;
}

/** Что подсветить на карте по нажатию в легенде: машины одного типа или доки роботов. */
export type HighlightKind = MachineView['type'] | 'dock';

export class FieldView {
  readonly root: Phaser.GameObjects.Container;
  readonly level: LevelData;
  readonly scale: number;
  private readonly scene: Phaser.Scene;
  private readonly floor: CanvasLayer;
  private readonly loops: LoopLayer;
  private readonly dockLayer: Phaser.GameObjects.Container;
  private readonly machineLayer: Phaser.GameObjects.Container;
  private readonly robotLayer: Phaser.GameObjects.Container;
  private readonly fxLayer: Phaser.GameObjects.Container;
  private readonly fx: Fx;
  private readonly machines = new Map<number, MachineSprite>();
  private readonly robots = new Map<number, RobotSprite>();
  /** Доки: кольцо, плюс и подпись «свой путь (N)» — она появляется у свободного дока, когда первый робот уже стоит. */
  private readonly docks: { ring: Phaser.GameObjects.Arc; plus: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; pulsing: boolean }[] = [];
  private readonly rocket: Rocket | null;
  private operator: RobotSprite | null = null;
  private opFrom = { x: 0, y: 0 };
  private opTo = { x: 0, y: 0 };
  private opT = 1;
  private teachCells: [number, number][] = [];
  private lastSnap: SimSnapshot | null = null;
  private readonly bnFrame: Phaser.GameObjects.Image;
  private readonly bnRing: Phaser.GameObjects.Arc;
  private bottleneck: BottleneckMark | null = null;

  /** x, y — где на экране левый верхний угол уровня; scale — масштаб карты. */
  constructor(scene: Phaser.Scene, level: LevelData, x: number, y: number, scale = 1) {
    this.scene = scene;
    this.level = level;
    this.scale = scale;
    this.root = scene.add.container(x, y).setScale(scale);
    this.floor = new CanvasLayer(scene, 'floor', 0, 0, level.width * TILE, level.height * TILE, { parent: this.root, zoom: scale });
    this.loops = new LoopLayer(scene, this.root, level.width, level.height, scale);
    this.dockLayer = scene.add.container(0, 0);
    this.machineLayer = scene.add.container(0, 0);
    this.robotLayer = scene.add.container(0, 0);
    this.fxLayer = scene.add.container(0, 0);
    this.root.add([this.dockLayer, this.machineLayer, this.robotLayer, this.fxLayer]);
    this.fx = new Fx(scene, this.fxLayer);
    // Узкое место: пульсирующая рамка вокруг машины или кольцо вокруг робота.
    this.bnFrame = scene.add.image(0, 0, 'cell_frame').setDisplaySize(70, 70).setTint(COLOR.warn).setVisible(false);
    this.bnRing = scene.add.circle(0, 0, 22).setStrokeStyle(2, COLOR.warn).setVisible(false);
    this.fxLayer.add([this.bnFrame, this.bnRing]);
    this.drawFloor();
    level.docks.forEach((d) => {
      const c = this.center(d.x, d.y);
      const ring = scene.add.circle(c.x, c.y, 16).setStrokeStyle(3, COLOR.faint).setFillStyle(COLOR.floor, 1);
      const plus = scene.add.image(c.x, c.y, 'dock_plus').setDisplaySize(16, 16);
      // Подпись лежит в увеличенной карте: рисуем её плотнее, чтобы буквы не мылились.
      const label = txt(scene, c.x, c.y + 27, t('dock.route'), { size: SIZE.micro, color: COLOR.dim, ox: 0.5, oy: 0.5 }).setVisible(false);
      label.setResolution(Math.min(3, textRes() * Math.max(1, scale)));
      this.dockLayer.add([ring, plus, label]);
      this.docks.push({ ring, plus, label, pulsing: false });
    });
    const pad = level.machines.find((m) => m.type === 'pad');
    this.rocket = pad ? new Rocket(scene, this.robotLayer, this.center(pad.x, pad.y).x, this.center(pad.x, pad.y).y) : null;
  }

  /** Ширина и высота карты на экране. */
  get width(): number {
    return this.level.width * TILE * this.scale;
  }

  get height(): number {
    return this.level.height * TILE * this.scale;
  }

  /** Центр клетки в пикселях уровня (внутри контейнера). */
  center(x: number, y: number): { x: number; y: number } {
    return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
  }

  /** Центр клетки в координатах экрана. */
  screenCenter(x: number, y: number): { x: number; y: number } {
    return cellCenter({ ox: this.root.x, oy: this.root.y }, x, y, TILE * this.scale);
  }

  /** Где робот нарисован сейчас, в координатах экрана (null — такого робота нет). */
  robotScreen(id: number): { x: number; y: number } | null {
    const sp = this.robots.get(id);
    return sp ? { x: this.root.x + sp.root.x * this.scale, y: this.root.y + sp.root.y * this.scale } : null;
  }

  /** Клетка под точкой экрана или null, если точка вне уровня. */
  cellAt(sx: number, sy: number): { x: number; y: number } | null {
    return cellAt({ ox: this.root.x, oy: this.root.y }, sx, sy, this.level.width, this.level.height, TILE * this.scale);
  }

  /** Нарисовать снимок. dt — секунды с прошлого кадра (для плавных мелочей). */
  render(snap: SimSnapshot, dt: number, opts: FieldRenderOpts = {}): void {
    this.lastSnap = snap;
    if (this.floor.stale()) this.drawFloor();
    this.syncMachines(snap.machines, opts.selectedMachine ?? null);
    this.syncRobots(snap, dt, opts.selectedRobot ?? null, opts.solo ?? null);
    this.syncOperator(snap.operator, dt);
    this.syncDocks(snap);
    this.syncLoops(snap, opts);
    this.syncBottleneck();
    this.loops.update(dt);
    this.rocket?.update(dt);
  }

  /** Эффекты по событиям симуляции (звуки — забота сцены). */
  play(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.x < 0 || e.y < 0) {
        if (e.type === 'launch' && this.level.endless) this.rocket?.launch(() => this.rocket?.reset(), false);
        continue;
      }
      const c = this.center(e.x, e.y);
      switch (e.type) {
        case 'delivered':
          this.fx.burst(c.x, c.y - 10, COLOR.warn, 12);
          this.fx.float(c.x, c.y - 30, '+1', COLOR.text);
          break;
        // Выпуск предмета показывает лампа машины, а взять/положить — сам робот с грузом.
        // Отдельные вспышки на каждое такое событие при 4 роботах и скорости ×4 сливались в рябь,
        // поэтому эффекты оставлены только для редких и важных событий: доставка, промах, покупка, новый робот.
        case 'produced':
        case 'took':
        case 'put':
          break;
        case 'miss':
          this.fx.miss(c.x, c.y);
          this.flashMiss(e.robotId);
          break;
        case 'deployed':
          this.fx.ring(c.x, c.y, this.colorOf(e.robotId));
          break;
        case 'bought':
          this.fx.ring(c.x, c.y, COLOR.text);
          break;
        case 'sold':
          this.fx.burst(c.x, c.y, COLOR.dim, 8);
          break;
        case 'launch':
          if (this.level.endless) this.rocket?.launch(() => this.rocket?.reset(), false);
          break;
        default:
          break;
      }
    }
  }

  /** Что тормозит линию (null — ничего): рамка пульсирует, пока узкое место не уйдёт. */
  markBottleneck(mark: BottleneckMark | null): void {
    this.bottleneck = mark;
  }

  /**
   * Подсветить на карте все машины одного типа (или все доки): рамка мигает пару секунд,
   * а сама машина чуть подпрыгивает — чтобы игрок сразу нашёл её глазами.
   */
  highlight(kind: HighlightKind, ms = 2000): void {
    const spots: { x: number; y: number; target: Phaser.GameObjects.GameObject }[] = [];
    if (kind === 'dock') {
      this.level.docks.forEach((d, i) => spots.push({ ...this.center(d.x, d.y), target: this.docks[i].ring }));
    } else {
      for (const sp of this.machines.values()) {
        if (sp.type === kind) spots.push({ x: sp.root.x, y: sp.root.y, target: sp.root });
      }
    }
    const pulses = Math.max(1, Math.round(ms / 500));
    for (const s of spots) {
      const frame = this.scene.add.image(s.x, s.y, 'cell_frame').setDisplaySize(74, 74).setTint(COLOR.accent).setAlpha(0);
      this.fxLayer.add(frame);
      this.scene.tweens.add({
        targets: frame,
        alpha: { from: 1, to: 0.15 },
        duration: 250,
        yoyo: true,
        repeat: pulses - 1,
        onComplete: () => frame.destroy(),
      });
      this.scene.tweens.add({ targets: s.target, scale: { from: 1, to: 1.14 }, duration: 160, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
    }
  }

  /** Взлёт ракеты в конце уровня. */
  launchRocket(onDone: () => void): void {
    if (this.rocket) this.rocket.launch(onDone);
    else onDone();
  }

  skipLaunch(): void {
    this.rocket?.finishNow();
  }

  private syncBottleneck(): void {
    const b = this.bottleneck;
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((this.scene.time.now / 1000) * Math.PI * 1.6));
    const machine = b?.kind === 'machine';
    this.bnFrame.setVisible(machine);
    if (b && machine) {
      const c = this.center(b.x, b.y);
      this.bnFrame.setPosition(c.x, c.y).setAlpha(pulse);
    }
    const robot = b?.kind === 'robot' ? this.robots.get(b.id) : undefined;
    this.bnRing.setVisible(!!robot);
    if (robot) this.bnRing.setPosition(robot.root.x, robot.root.y).setAlpha(pulse);
  }

  // ---------- пол ----------

  private drawFloor(): void {
    const { width, height } = this.level;
    const walls = this.level.walls ?? [];
    this.floor.draw((ctx, w, h) => {
      ctx.fillStyle = css(COLOR.floor);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(COLOR.grid);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < width; x++) {
        ctx.moveTo(x * TILE + 0.5, 0);
        ctx.lineTo(x * TILE + 0.5, h);
      }
      for (let y = 1; y < height; y++) {
        ctx.moveTo(0, y * TILE + 0.5);
        ctx.lineTo(w, y * TILE + 0.5);
      }
      ctx.stroke();
      // Стены — штриховка под 45°, как разрез на чертеже.
      for (const [wx, wy] of walls) {
        const x0 = wx * TILE;
        const y0 = wy * TILE;
        ctx.fillStyle = css(COLOR.wall);
        ctx.fillRect(x0, y0, TILE, TILE);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, TILE, TILE);
        ctx.clip();
        ctx.strokeStyle = css(COLOR.wallLine);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = -TILE; i < TILE; i += 10) {
          ctx.moveTo(x0 + i, y0 + TILE);
          ctx.lineTo(x0 + i + TILE, y0);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = css(COLOR.rule);
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });
  }

  // ---------- машины ----------

  private makeMachine(m: MachineView): MachineSprite {
    const s = this.scene;
    const c = this.center(m.x, m.y);
    const root = s.add.container(c.x, c.y);
    const tile = s.add.image(0, 0, tileKey(m.type)).setDisplaySize(56, 56);
    const parts: Phaser.GameObjects.GameObject[] = [tile];
    if (m.type !== 'pad') parts.push(s.add.image(0, -3, iconKey(m.type)).setDisplaySize(34, 34));
    const lamp = s.add.circle(19, -19, 4, LAMP.idle);
    const barBg = s.add.rectangle(-22, 21, 44, 3, COLOR.sunken).setOrigin(0, 0.5);
    const bar = s.add.rectangle(-22, 21, 44, 3, COLOR.ok).setOrigin(0, 0.5);
    bar.scaleX = 0;
    const slots = m.kind === 'processor' ? 0 : Math.min(6, m.capacity);
    const pips: Phaser.GameObjects.Rectangle[] = [];
    const span = slots * 7 - 2;
    for (let i = 0; i < slots; i++) pips.push(s.add.rectangle(-span / 2 + i * 7 + 2.5, 21, 5, 5, COLOR.sunken));
    const out = s.add.image(-17, -17, iconKey('ore')).setDisplaySize(16, 16).setVisible(false);
    const frame = s.add.image(0, 0, 'cell_frame').setDisplaySize(64, 64).setVisible(false);
    parts.push(lamp, barBg, bar, ...pips, out, frame);
    if (m.bought) parts.push(s.add.image(0, 0, 'tile_bought').setDisplaySize(60, 60));
    root.add(parts);
    this.machineLayer.add(root);
    return { type: m.type, root, lamp, barBg, bar, pips, out, frame, key: '' };
  }

  private syncMachines(list: readonly MachineView[], selected: number | null): void {
    const alive = new Set<number>();
    for (const m of list) {
      alive.add(m.id);
      let sp = this.machines.get(m.id);
      if (!sp) {
        sp = this.makeMachine(m);
        this.machines.set(m.id, sp);
      }
      const working = m.state === 'working' && m.kind === 'processor';
      const key = `${m.state}|${Math.round(m.progress * 44)}|${m.stock}|${m.input.join(',')}|${m.output ?? ''}|${m.id === selected}`;
      if (key === sp.key) continue;
      sp.key = key;
      sp.lamp.setFillStyle(LAMP[m.state]);
      sp.barBg.setVisible(working);
      sp.bar.setVisible(working);
      sp.bar.scaleX = Math.min(1, Math.max(0, m.progress));
      if (m.kind === 'storage') {
        sp.pips.forEach((p, i) => p.setFillStyle(m.input[i] ? ITEM_COLOR[m.input[i]] : COLOR.sunken));
      } else if (m.kind === 'source') {
        const color = m.output ? ITEM_COLOR[m.output] : COLOR.dim;
        sp.pips.forEach((p, i) => p.setFillStyle(i < m.stock ? color : COLOR.sunken));
      }
      if (m.kind === 'processor' && m.output) {
        sp.out.setTexture(iconKey(m.output)).setDisplaySize(16, 16).setVisible(true);
      } else {
        sp.out.setVisible(false);
      }
      sp.frame.setVisible(m.id === selected);
    }
    for (const [id, sp] of this.machines) {
      if (!alive.has(id)) {
        sp.root.destroy();
        this.machines.delete(id);
      }
    }
  }

  // ---------- роботы ----------

  private makeRobot(color: number, operator = false): RobotSprite {
    const s = this.scene;
    const sheet = robotSheet(s, operator ? OPERATOR_COLOR : color);
    const shadow = s.add.image(0, 14, 'shadow').setDisplaySize(32, 12).setAlpha(0.9);
    // Опорная точка у пояса: ноги чуть ниже центра клетки, голова выше — робот «стоит» на клетке.
    const body = s.add.image(0, 0, sheet, robotFrameName('down', 'idle0')).setOrigin(0.5, 0.66).setDisplaySize(ROBOT_SIZE, ROBOT_SIZE);
    const item = s.add.image(0, ITEM_Y, iconKey('ore')).setDisplaySize(18, 18).setVisible(false);
    const wave = s.add.image(0, ITEM_Y - 4, 'sense_wave').setDisplaySize(22, 14).setVisible(false);
    const ring = s.add.circle(0, -4, 23).setStrokeStyle(2, COLOR.text).setVisible(false);
    const root = s.add.container(0, 0, [ring, shadow, body, item, wave]);
    this.robotLayer.add(root);
    const now = s.time.now;
    return {
      root,
      body,
      shadow,
      item,
      wave,
      ring,
      ox: 0,
      oy: 0,
      cx: 0,
      cy: 0,
      seen: false,
      blinkAt: now + 800 + Math.random() * 2500,
      breath: Math.random() * 1000,
    };
  }

  /**
   * Кадр робота: в движении — шаг по пройденному пути, на месте — дыхание и моргание раз в несколько секунд.
   * travelled — дробная позиция вдоль пути (x + y), dir — куда он смотрит.
   */
  private animate(sp: RobotSprite, dir: Dir, moving: boolean, travelled: number): void {
    const now = this.scene.time.now;
    const { view, flip } = viewOf(dir);
    let frame: RobotFrame;
    if (moving) {
      frame = walkFrame(travelled);
    } else if (view !== 'up' && now >= sp.blinkAt && now < sp.blinkAt + 140) {
      frame = 'blink';
    } else {
      if (now >= sp.blinkAt + 140) sp.blinkAt = now + 2200 + Math.random() * 2800;
      frame = Math.floor((now + sp.breath) / 520) % 2 === 0 ? 'idle0' : 'idle1';
    }
    const name = robotFrameName(view, frame);
    if (sp.body.frame.name !== name) sp.body.setFrame(name);
    if (sp.body.flipX !== flip) sp.body.setFlipX(flip);
    // Груз качается вместе с головой: выше на проходе шага, ниже на вдохе.
    const bob = frame === 'walk1' || frame === 'walk3' ? -2.6 : frame === 'idle1' ? 2.6 : 0;
    sp.item.setY(ITEM_Y + bob);
  }

  private syncRobots(snap: SimSnapshot, dt: number, selected: number | null, solo: number | null): void {
    const alive = new Set<number>();
    const a = snap.alpha;
    const teach = snap.mode === 'teach';
    const blink = Math.floor(this.scene.time.now / 220) % 2 === 0;
    for (const r of snap.robots) {
      alive.add(r.id);
      let sp = this.robots.get(r.id);
      if (!sp) {
        sp = this.makeRobot(robotColor(r.colorIndex));
        this.robots.set(r.id, sp);
      }
      let x = r.px + (r.x - r.px) * a;
      let y = r.py + (r.y - r.py) * a;
      if (teach && sp.seen && Math.abs(x - sp.cx) + Math.abs(y - sp.cy) <= 1.01) {
        const e = 1 - Math.exp(-dt / TEACH_EASE);
        x = sp.cx + (x - sp.cx) * e;
        y = sp.cy + (y - sp.cy) * e;
      }
      // Идёт, если сдвинулся на экране с прошлого кадра. По тикам судить нельзя: в показе копия мира
      // замирает посреди шага, и робот перебирал бы ногами на месте.
      const moving = sp.seen && Math.abs(x - sp.cx) + Math.abs(y - sp.cy) > 0.0005;
      sp.cx = x;
      sp.cy = y;
      const parked = r.state === 'idle';
      const pose = robotPose({ x: 0, y: 0, dir: r.dir, dock: r.dock }, parked);
      const k = sp.seen ? Math.min(1, dt * 14) : 1;
      sp.ox += (pose.x - sp.ox) * k;
      sp.oy += (pose.y - sp.oy) * k;
      sp.seen = true;
      sp.root.setPosition((x + 0.5 + sp.ox) * TILE, (y + 0.5 + sp.oy) * TILE);
      this.animate(sp, r.dir, moving, x + y);
      showItem(sp, r.carrying);
      sp.wave.setVisible(r.state === 'sense' && blink);
      sp.ring.setVisible(r.id === selected);
      const alpha = solo === null || r.id === solo ? 1 : 0.3;
      if (sp.root.alpha !== alpha) sp.root.setAlpha(alpha);
    }
    for (const [id, sp] of this.robots) {
      if (!alive.has(id)) {
        sp.root.destroy();
        this.robots.delete(id);
      }
    }
  }

  private flashMiss(robotId: number | null): void {
    const sp = robotId === null ? undefined : this.robots.get(robotId);
    if (!sp) return;
    sp.body.setTint(COLOR.miss);
    this.scene.time.delayedCall(180, () => sp.body.clearTint());
  }

  private colorOf(robotId: number | null): number {
    const r = this.lastSnap?.robots.find((x) => x.id === robotId);
    return r ? robotColor(r.colorIndex) : COLOR.text;
  }

  // ---------- оператор в репетиции ----------

  private syncOperator(op: OperatorView | null, dt: number): void {
    if (!op) {
      if (this.operator) {
        this.operator.root.destroy();
        this.operator = null;
      }
      this.teachCells = [];
      return;
    }
    if (!this.operator) {
      this.operator = this.makeRobot(OPERATOR_COLOR, true);
      this.opFrom = { x: op.x, y: op.y };
      this.opTo = { x: op.x, y: op.y };
      this.opT = 1;
      this.teachCells = [[op.x, op.y]];
    }
    if (op.x !== this.opTo.x || op.y !== this.opTo.y) {
      // Новый шаг: плавно идём от того места, где оператор нарисован сейчас.
      this.opFrom = this.opPos();
      this.opTo = { x: op.x, y: op.y };
      this.opT = 0;
      const last = this.teachCells[this.teachCells.length - 1];
      if (!last || last[0] !== op.x || last[1] !== op.y) this.teachCells.push([op.x, op.y]);
    }
    this.opT = Math.min(1, this.opT + dt / OPERATOR_STEP);
    const p = this.opPos();
    this.operator.root.setPosition((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
    this.animate(this.operator, op.dir, this.opT < 1, p.x + p.y);
    showItem(this.operator, op.carrying);
  }

  private opPos(): { x: number; y: number } {
    const t = 1 - (1 - this.opT) * (1 - this.opT);
    return { x: this.opFrom.x + (this.opTo.x - this.opFrom.x) * t, y: this.opFrom.y + (this.opTo.y - this.opFrom.y) * t };
  }

  // ---------- доки и петли ----------

  private syncDocks(snap: SimSnapshot): void {
    this.docks.forEach((d, i) => {
      const owner = snap.robots.find((r) => r.dock === i);
      const teaching = snap.operator?.dock === i;
      const color = teaching ? COLOR.teach : owner ? robotColor(owner.colorIndex) : COLOR.faint;
      if (d.ring.strokeColor !== color) d.ring.setStrokeStyle(3, color);
      // Плюс — «здесь можно показать нового робота»: и до старта, и пока линия работает.
      const free = !owner && !teaching && (snap.mode === 'plan' || snap.mode === 'running');
      d.plus.setVisible(free);
      // Первый робот уже стоит, а этот док свободен — он мягко пульсирует и подписан «свой путь (N)»:
      // здесь можно поставить робота с другим маршрутом (копия на R ходила бы той же петлёй).
      const invite = free && snap.robots.length > 0 && !snap.operator;
      if (d.label.visible !== invite) d.label.setVisible(invite);
      if (invite) {
        const k = 0.5 + 0.5 * Math.sin(this.scene.time.now / 260);
        d.ring.setScale(1 + 0.14 * k);
        d.label.setAlpha(0.55 + 0.45 * k);
        d.pulsing = true;
      } else if (d.pulsing) {
        d.ring.setScale(1);
        d.pulsing = false;
      }
    });
  }

  private syncLoops(snap: SimSnapshot, opts: FieldRenderOpts): void {
    const solo = opts.solo ?? null;
    // В режиме «только этот робот» выбранной считается его петля: по ней бегут точки направления.
    const selected = solo ?? opts.selectedRobot ?? null;
    const dim = opts.dim ?? 0.5;
    const specs: LoopSpec[] = snap.robots
      .filter((r: RobotView) => solo === null || r.id === solo)
      .map((r: RobotView) => ({
        id: r.id,
        color: robotColor(r.colorIndex),
        cells: r.path,
        offset: laneOffset(r.dock),
        strength: selected === null ? 0.85 : r.id === selected ? 1 : dim,
      }));
    if (opts.extraLoops) specs.push(...opts.extraLoops);
    if (snap.operator && this.teachCells.length > 1) {
      specs.push({ id: -1, color: COLOR.teach, cells: this.teachCells, offset: 0, strength: 1, dashed: true });
    }
    this.loops.sync(specs, selected);
  }
}

function showItem(sp: RobotSprite, item: RobotView['carrying']): void {
  if (!item) {
    if (sp.item.visible) sp.item.setVisible(false);
    return;
  }
  const key = iconKey(item);
  if (sp.item.texture.key !== key) sp.item.setTexture(key).setDisplaySize(18, 18);
  if (!sp.item.visible) sp.item.setVisible(true);
}
