// Карта уровня: пол с сеткой, стены, доки, машины, роботы и их петли. Рисуется только из снимка
// симуляции — экран не знает правил мира. Машины и роботы лежат в Map<id, …> и создаются
// или удаляются по разнице снимков. Всё собрано в один контейнер: в игре он в натуральную величину,
// в меню — уменьшенная копия той же карты.
import Phaser from 'phaser';
import { TILE } from '../types';
import type { Dir, LevelData, MachineView, OperatorView, RobotView, SimEvent, SimSnapshot } from '../types';
import { COLOR, ITEM_COLOR, LAMP, css, robotColor } from '../ui/theme';
import { CanvasLayer } from './canvas';
import { Fx } from './fx';
import { LoopLayer } from './loopLayer';
import type { LoopSpec } from './loopLayer';
import { Rocket } from './rocket';
import { laneOffset, robotPose } from './robotPose';
import { iconKey, robotTexture, tileKey } from './textures';

// Куда смотрит глаз робота: вверх, вправо, вниз, влево.
const FX = [0, 1, 0, -1];
const FY = [-1, 0, 1, 0];
/** За сколько секунд оператор доходит до новой клетки после нажатия. */
const OPERATOR_STEP = 0.12;

interface MachineSprite {
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
  body: Phaser.GameObjects.Image;
  eye: Phaser.GameObjects.Image;
  item: Phaser.GameObjects.Image;
  wave: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
  /** Сглаженный сдвиг на свою полосу: на поворотах робот плавно перестраивается, а не прыгает. */
  ox: number;
  oy: number;
  seen: boolean;
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
}

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
  private readonly docks: { ring: Phaser.GameObjects.Arc; plus: Phaser.GameObjects.Image }[] = [];
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
      this.dockLayer.add([ring, plus]);
      this.docks.push({ ring, plus });
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
    return { x: this.root.x + (x + 0.5) * TILE * this.scale, y: this.root.y + (y + 0.5) * TILE * this.scale };
  }

  /** Клетка под точкой экрана или null, если точка вне уровня. */
  cellAt(sx: number, sy: number): { x: number; y: number } | null {
    const x = Math.floor((sx - this.root.x) / (TILE * this.scale));
    const y = Math.floor((sy - this.root.y) / (TILE * this.scale));
    return x >= 0 && y >= 0 && x < this.level.width && y < this.level.height ? { x, y } : null;
  }

  /** Нарисовать снимок. dt — секунды с прошлого кадра (для плавных мелочей). */
  render(snap: SimSnapshot, dt: number, opts: FieldRenderOpts = {}): void {
    this.lastSnap = snap;
    if (this.floor.stale()) this.drawFloor();
    this.syncMachines(snap.machines, opts.selectedMachine ?? null);
    this.syncRobots(snap, dt, opts.selectedRobot ?? null);
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
        case 'produced':
          this.fx.ring(c.x, c.y, e.item ? ITEM_COLOR[e.item] : COLOR.text);
          break;
        case 'miss':
          this.fx.miss(c.x, c.y);
          this.flashMiss(e.robotId);
          break;
        case 'took':
        case 'put':
          if (e.item) this.fx.burst(c.x, c.y, ITEM_COLOR[e.item], 4);
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
    return { root, lamp, barBg, bar, pips, out, frame, key: '' };
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
    const body = s.add.image(0, 0, operator ? 'operator' : robotTexture(s, color)).setDisplaySize(30, 30);
    const eye = s.add.image(0, 0, 'robot_eye').setDisplaySize(11, 11);
    const item = s.add.image(0, -20, iconKey('ore')).setDisplaySize(18, 18).setVisible(false);
    const wave = s.add.image(0, -22, 'sense_wave').setDisplaySize(22, 14).setVisible(false);
    const ring = s.add.circle(0, 0, 19).setStrokeStyle(2, COLOR.text).setVisible(false);
    const root = s.add.container(0, 0, [ring, body, eye, item, wave]);
    this.robotLayer.add(root);
    return { root, body, eye, item, wave, ring, ox: 0, oy: 0, seen: false };
  }

  private syncRobots(snap: SimSnapshot, dt: number, selected: number | null): void {
    const alive = new Set<number>();
    const a = snap.alpha;
    const blink = Math.floor(this.scene.time.now / 220) % 2 === 0;
    for (const r of snap.robots) {
      alive.add(r.id);
      let sp = this.robots.get(r.id);
      if (!sp) {
        sp = this.makeRobot(robotColor(r.colorIndex));
        this.robots.set(r.id, sp);
      }
      const x = r.px + (r.x - r.px) * a;
      const y = r.py + (r.y - r.py) * a;
      const parked = r.state === 'idle';
      const pose = robotPose({ x: 0, y: 0, dir: r.dir, dock: r.dock }, parked);
      const k = sp.seen ? Math.min(1, dt * 14) : 1;
      sp.ox += (pose.x - sp.ox) * k;
      sp.oy += (pose.y - sp.oy) * k;
      sp.seen = true;
      sp.root.setPosition((x + 0.5 + sp.ox) * TILE, (y + 0.5 + sp.oy) * TILE);
      placeEye(sp, r.dir);
      showItem(sp, r.carrying);
      sp.wave.setVisible(r.state === 'sense' && blink);
      sp.ring.setVisible(r.id === selected);
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
      this.operator = this.makeRobot(COLOR.teach, true);
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
    placeEye(this.operator, op.dir);
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
      d.plus.setVisible(!owner && !teaching && snap.mode === 'plan');
    });
  }

  private syncLoops(snap: SimSnapshot, opts: FieldRenderOpts): void {
    const selected = opts.selectedRobot ?? null;
    const dim = opts.dim ?? 0.5;
    const specs: LoopSpec[] = snap.robots.map((r: RobotView) => ({
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

function placeEye(sp: RobotSprite, dir: Dir): void {
  sp.eye.setPosition(FX[dir] * 7, FY[dir] * 7);
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
