// Игровая сцена. Логики мира здесь нет: сцена принимает ввод игрока, вызывает методы ISimulation
// и рисует sim.snapshot(). Время мира идёт только через sim.step(dt × скорость).
import Phaser from 'phaser';
import { Simulation } from '../sim';
import { OPERATOR_ID } from '../types';
import type { Block, FailReason, LevelData, MachineType, SimEvent, SimSnapshot, TeachInput } from '../types';
import { getRenderScale } from '../render/display';
import { FieldView } from '../render/field';
import type { LoopSpec } from '../render/loopLayer';
import { BOTTOM, DEPTH, FIELD, PANEL, TOP_H, fieldOrigin } from '../render/layout';
import { laneOffset } from '../render/robotPose';
import { iconKey, tileKey } from '../render/textures';
import { audio, stepRate } from '../ui/audio';
import type { SfxName } from '../ui/audio';
import { BottomBar } from '../ui/bottomBar';
import { FrameStats } from '../ui/frameStats';
import { hints } from '../ui/hints';
import { num, t } from '../ui/i18n';
import { levelById, levelIndex, levels, machineDefs } from '../ui/levels';
import { changeWait, programSteps, removeBlock, toggleSense } from '../ui/programModel';
import { RobotNumbers } from '../ui/robotNumbers';
import { SidePanel } from '../ui/sidePanel';
import type { PanelView } from '../ui/sidePanel';
import { store } from '../ui/storage';
import { COLOR, SIZE, robotColor } from '../ui/theme';
import { TopBar } from '../ui/topBar';
import type { Speed } from '../ui/topBar';
import { TelemetryPanel } from '../ui/telemetryPanel';
import { bottleneckHintKey, bottleneckSpot } from '../ui/telemetryModel';
import { TutorialFlow } from '../ui/tutorialModel';
import type { MissInfo, TutorialCtx } from '../ui/tutorialModel';
import { Toasts, plate, plateKey, setText, txt } from '../ui/widgets';
import { enter, go, leaving } from './flow';
import { preparePitch } from './pitch';
import { STRESS_ID, deployStress, stressLevel } from './stress';
import type { ResultsData } from './ResultsScene';

/** Если в уровне нет своего обучения, первый уровень ведёт игрока этим маршрутом (как в брифе роли B). */
const FIRST_LEVEL_TUTORIAL = [
  'tutorial.clickDock',
  'tutorial.goTo_depot',
  'tutorial.take',
  'tutorial.goTo_pad',
  'tutorial.put',
  'tutorial.returnDock',
  'tutorial.finish',
  'tutorial.start',
];

const KEY_INPUT: Record<string, TeachInput> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyE: 'act',
  Space: 'wait',
};

const EVENT_SOUND: Partial<Record<SimEvent['type'], SfxName>> = {
  took: 'take',
  put: 'put',
  miss: 'miss',
  sensed: 'sense',
  produced: 'produce',
  delivered: 'deliver',
  deployed: 'deploy',
  bought: 'deploy',
  sold: 'click',
  lost: 'lose',
};

/** Повтор шага при удержании стрелки — не чаще, чем оператор успевает дойти. */
const REPEAT_MS = 130;

export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private level!: LevelData;
  private field!: FieldView;
  private top!: TopBar;
  private panel!: SidePanel;
  private bottom!: BottomBar;
  private toasts!: Toasts;
  private snap!: SimSnapshot;
  private speed: Speed = 1;
  private view: PanelView = { kind: 'idle' };
  private pick = -1;
  private code = false;
  private buyType: MachineType | null = null;
  private ghost!: Phaser.GameObjects.Container;
  private ghostCell: { x: number; y: number } | null = null;
  private tint!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Container;
  private tutorial!: TutorialFlow;
  private tutCard!: Phaser.GameObjects.Container;
  private tutText!: Phaser.GameObjects.Text;
  private tutBg!: Phaser.GameObjects.Image;
  private tutArrow!: Phaser.GameObjects.Image;
  private telemetryOpen = false;
  /** Панель телеметрии создаётся при первом Tab: так вход в уровень быстрее на слабом ноутбуке. */
  private telemetry: TelemetryPanel | null = null;
  /** Последний снимок настоящего мира: во время показа верхняя полоса показывает его, а не часы копии. */
  private realSnap: SimSnapshot | null = null;
  private tutFrame!: Phaser.GameObjects.Graphics;
  private fps!: Phaser.GameObjects.Text;
  private frames = new FrameStats();
  private fpsAt = 0;
  private ending: 'none' | 'launch' | 'done' = 'none';
  private stars = 0;
  private lastRepeat = 0;
  private pendingPath: { sig: string; spec: LoopSpec | null } = { sig: '', spec: null };
  private countdown: Phaser.GameObjects.Text | null = null;
  /** Номера роботов в подписях панели и телеметрии: самый маленький свободный, перезапись сохраняет номер. */
  private numbers = new RobotNumbers();
  /** Последний промах в настоящем мире — подсказка про датчик ведёт к этому роботу и этому действию. */
  private lastMiss: MissInfo | null = null;
  /** Сцена собрана: до этого (или если уровень не загрузился) update ничего не делает. */
  private ready = false;

  constructor() {
    super('Game');
  }

  create(data: { levelId?: string; pitch?: boolean }): void {
    this.ready = false;
    enter(this);
    this.speed = 1;
    this.view = { kind: 'idle' };
    this.pick = -1;
    this.code = false;
    this.buyType = null;
    this.ending = 'none';
    this.telemetryOpen = false;
    this.pendingPath = { sig: '', spec: null };
    this.countdown = null;
    // Сцена переиспользуется при «заново»: всё, что помнит прошлый заход, сбрасываем здесь.
    this.ghostCell = null;
    this.stars = 0;
    this.lastMiss = null;
    this.numbers = new RobotNumbers();

    const stress = data?.levelId === STRESS_ID;
    this.frames = new FrameStats();
    const level = stress ? stressLevel() : (levelById(data?.levelId ?? '') ?? levels()[0]);
    this.level = level;
    this.sim = new Simulation();
    try {
      this.sim.loadLevel(level, machineDefs());
    } catch (err) {
      // Битый уровень не роняет игру: показываем причину и возвращаемся к выбору.
      console.error(err);
      go(this, 'LevelSelect');
      return;
    }
    this.snap = this.sim.snapshot();
    this.cameras.main.setBackgroundColor(COLOR.page);

    const o = fieldOrigin(level.width, level.height);
    this.field = new FieldView(this, level, o.ox, o.oy, 1);
    this.field.root.setDepth(DEPTH.floor);

    // Режим обучения: голубой фильтр на поле и плашка о том, что настоящий мир стоит.
    this.tint = this.add.rectangle(FIELD.x, FIELD.y, FIELD.w, FIELD.h, COLOR.teach, 0.07).setOrigin(0, 0).setDepth(DEPTH.tint).setVisible(false);
    const bannerText = txt(this, 0, 0, t('teach.banner'), { size: SIZE.micro, bold: true, color: COLOR.ink, caps: true, ox: 0.5, oy: 0.5 });
    const bannerBg = plate(this, 0, 0, Math.ceil(bannerText.width + 32), 28, { fill: COLOR.teach, radius: 3 });
    this.banner = this.add.container(FIELD.x + FIELD.w / 2, FIELD.y + 22, [bannerBg, bannerText]).setDepth(DEPTH.marker).setVisible(false);

    this.top = new TopBar(this, t(level.titleKey), !!level.endless, level.targetItem, {
      speed: (s) => this.setSpeed(s),
      pause: () => this.openPause(),
    });
    this.panel = new SidePanel(this, level, {
      finishTeach: () => this.finishTeach(),
      cancelTeach: () => this.cancelTeach(),
      pick: (i) => {
        this.pick = this.pick === i ? -1 : i;
      },
      removeBlock: () => this.editSelected((p) => removeBlock(p, this.pick), 'remove'),
      toggleSense: () => this.editSelected((p) => toggleSense(p, this.pick), 'sense'),
      wait: (delta) => this.editSelected((p) => changeWait(p, this.pick, delta), delta > 0 ? 'waitMore' : 'waitLess'),
      copy: () => this.copySelected(),
      rewrite: () => this.rewriteSelected(),
      removeRobot: () => this.removeSelected(),
      toggleCode: () => {
        this.code = !this.code;
      },
      sell: () => this.sellSelected(),
    }, (id) => this.numbers.of(id));
    this.bottom = new BottomBar(this, level, { start: () => this.startLine(), buy: (type) => this.toggleBuy(type) });
    this.toasts = new Toasts(this, FIELD.x + FIELD.w / 2, FIELD.y + 64, DEPTH.toast);
    this.telemetry = null;
    this.realSnap = null;

    this.ghost = this.add.container(0, 0).setDepth(DEPTH.marker).setVisible(false);

    const steps = level.tutorial ?? (levelIndex(level.id) === 0 ? FIRST_LEVEL_TUTORIAL : []);
    this.tutorial = new TutorialFlow(steps);
    this.tutText = txt(this, 16, 34, '', { size: SIZE.body, wrap: 360, lineSpacing: 4 });
    this.tutBg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    const tutLabel = txt(this, 16, 14, t('tutorial.label'), { size: SIZE.micro, color: COLOR.dim, caps: true });
    this.tutCard = this.add.container(FIELD.x + 16, 0, [this.tutBg, tutLabel, this.tutText]).setDepth(DEPTH.marker).setVisible(false);
    // Стрелка показывает клетку на карте; кнопку («Готово», «Копия», «Старт») обучение обводит рамкой —
    // стрелка над кнопкой налезала бы на соседнюю.
    this.tutArrow = this.add.image(0, 0, 'tut_arrow').setDisplaySize(30, 36).setDepth(DEPTH.uiTop).setVisible(false);
    this.tutFrame = this.add.graphics().setDepth(DEPTH.uiTop).setVisible(false);

    this.fps = txt(this, FIELD.x + 12, FIELD.y + 10, '', { size: SIZE.small, color: COLOR.text }).setDepth(DEPTH.debug).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => this.onKey(ev));
    // Tab не должен уводить фокус из игры.
    this.input.keyboard?.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    audio.music('shift');
    if (stress) {
      // Проверка производительности: 8 роботов, ×4, счётчик кадров сразу виден.
      deployStress(this.sim);
      this.sim.start();
      this.speed = 4;
      this.fps.setVisible(true);
    } else if (data?.pitch) {
      // Демо для питча: слепой робот уже работает и промахивается, панель сразу показывает его программу.
      const robot = preparePitch(this.sim);
      if (robot !== null) this.view = { kind: 'robot', robotId: robot };
    }
    if (stress || data?.pitch) {
      // События подготовки (появление роботов, первые шаги) уже в прошлом — не озвучиваем их разом.
      this.sim.step(0);
      this.snap = this.sim.snapshot();
    }
    this.ready = true;
  }

  override update(time: number, delta: number): void {
    if (!this.ready) return;
    this.frames.add(delta, time);
    const dt = Math.min(0.1, delta / 1000);
    const running = this.snap.mode === 'running' && this.ending === 'none';
    const events = this.sim.step(running ? dt * this.speed : 0);
    this.snap = this.sim.snapshot();
    const s = this.snap;
    if (s.mode !== 'teach') {
      // В показе снимок — копия мира без перезаписываемого робота: номера считаем только по настоящему миру.
      this.numbers.sync(s.robots.map((r) => r.id));
      // Подсказка про датчик держится за первого промахнувшегося робота, пока он жив, — иначе при двух слепых
      // роботах стрелка и текст прыгали бы между ними. С грузом в руках робот промахнулся на «положить».
      const miss = this.lastMiss;
      if (!miss || !s.robots.some((r) => r.id === miss.robotId)) {
        const r = s.robots.find((x) => x.state === 'miss');
        this.lastMiss = r ? { robotId: r.id, op: r.carrying ? 'put' : 'take' } : null;
      }
    }
    if (events.length > 0) this.onEvents(events);

    this.syncView(s);
    const selectedRobot = this.view.kind === 'robot' ? this.view.robotId : null;
    const selectedMachine = this.view.kind === 'machine' ? this.view.machineId : null;
    const extra = this.pendingLoop(s, selectedRobot);
    this.field.markBottleneck(s.mode === 'running' ? bottleneckSpot(s) : null);
    this.field.render(s, dt, { selectedRobot, selectedMachine, extraLoops: extra ? [extra] : undefined });
    this.telemetry?.update(s, selectedRobot);
    const teaching = s.mode === 'teach';
    if (!teaching) this.realSnap = s;
    this.top.update(teaching && this.realSnap ? this.realSnap : s, this.speed, teaching);
    this.panel.update(s, { view: this.view, pick: this.pick, code: this.code });
    this.bottom.update(s, this.buyType);
    // Призрак покупки перекрашиваем каждый кадр: мир меняется и без движения мыши (правка петли, энергия).
    if (this.buyType) this.drawGhost();
    const teach = s.mode === 'teach';
    this.tint.setVisible(teach);
    this.banner.setVisible(teach);
    this.updateTutorial(s);
    if (this.fps.visible && time - this.fpsAt > 500) {
      this.fpsAt = time;
      const f = this.frames.summary();
      setText(this.fps, t('debug.fps', { fps: Math.round(f.fps), low: Math.round(f.low), ms: num(f.ms), scale: num(getRenderScale(), 2) }));
    }
  }

  // ---------- выбор и ввод ----------

  /** Держим панель в согласии с миром: робота убрали — снимаем выбор, началась репетиция — панель показа. */
  private syncView(s: SimSnapshot): void {
    const v = this.view;
    if (s.mode === 'teach') {
      if (v.kind !== 'teach') this.setView({ kind: 'teach' });
      return;
    }
    if (v.kind === 'teach') this.setView({ kind: 'idle' });
    else if (v.kind === 'robot' && !s.robots.some((r) => r.id === v.robotId)) this.setView({ kind: 'idle' });
    else if (v.kind === 'machine' && !s.machines.some((m) => m.id === v.machineId)) this.setView({ kind: 'idle' });
  }

  private setView(v: PanelView): void {
    const same = JSON.stringify(v) === JSON.stringify(this.view);
    this.view = v;
    if (!same) this.pick = -1;
  }

  private worldPoint(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  private onField(x: number, y: number): boolean {
    return y > TOP_H && y < BOTTOM.y && x < PANEL.x;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.ending !== 'none') {
      this.skipEnding();
      return;
    }
    const w = this.worldPoint(p);
    if (!this.onField(w.x, w.y) || this.telemetry?.covers(w.y)) return;
    const s = this.snap;
    if (s.mode === 'teach' || s.mode === 'won' || s.mode === 'lost') return;
    const cell = this.field.cellAt(w.x, w.y);
    if (this.buyType) {
      if (p.rightButtonDown()) this.toggleBuy(null);
      else if (cell) this.buyAt(this.buyType, cell.x, cell.y);
      return;
    }
    if (p.rightButtonDown()) {
      const m = cell ? s.machines.find((x) => x.x === cell.x && x.y === cell.y) : undefined;
      if (m?.bought) this.sell(m.id);
      return;
    }
    if (!cell) {
      this.setView({ kind: 'idle' });
      return;
    }
    // Робот под курсором (он может стоять между клетками).
    let best: { id: number; d: number } | null = null;
    for (const r of s.robots) {
      const off = laneOffset(r.dock);
      const d = Math.hypot(r.x + 0.5 - (w.x - this.field.root.x) / 64, r.y + 0.5 - (w.y - this.field.root.y) / 64);
      if (d < 0.45 + off && (!best || d < best.d)) best = { id: r.id, d };
    }
    if (best) {
      this.setView({ kind: 'robot', robotId: best.id });
      audio.play('click');
      return;
    }
    const dock = this.level.docks.findIndex((d) => d.x === cell.x && d.y === cell.y);
    if (dock >= 0) {
      const owner = s.robots.find((r) => r.dock === dock);
      if (owner) {
        this.setView({ kind: 'robot', robotId: owner.id });
        audio.play('click');
      } else {
        this.beginTeach(dock);
      }
      return;
    }
    const m = s.machines.find((x) => x.x === cell.x && x.y === cell.y);
    if (m) {
      this.setView({ kind: 'machine', machineId: m.id });
      audio.play('click');
      return;
    }
    this.setView({ kind: 'idle' });
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    // Клетку под курсором помним всегда: включили покупку — призрак там, где мышь сейчас,
    // а не там, где она была, когда покупали в прошлый раз.
    const w = this.worldPoint(p);
    this.ghostCell = this.onField(w.x, w.y) && !this.telemetry?.covers(w.y) ? this.field.cellAt(w.x, w.y) : null;
    if (this.buyType) this.drawGhost();
  }

  private onKey(ev: KeyboardEvent): void {
    // Сцена уже уходит (затемнение перехода) — клавиши не для неё. Сочетания с Ctrl, Cmd и Alt — браузеру и системе:
    // Cmd+M сворачивает окно и не должна заодно выкидывать к выбору уровней.
    if (!this.ready || leaving(this) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // Горячие клавиши работают в игре всегда — и в плане, и во время показа, и пока идёт отсчёт:
    // R — уровень заново, M — к выбору уровней (Esc — меню паузы, ниже).
    if (!ev.repeat && (ev.code === 'KeyR' || ev.code === 'KeyM')) {
      if (this.snap.mode === 'teach') this.sim.cancelTeach();
      go(this, ev.code === 'KeyR' ? 'Game' : 'LevelSelect', { levelId: this.level.id });
      return;
    }
    if (this.ending !== 'none') {
      if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'Escape') this.skipEnding();
      return;
    }
    const s = this.snap;
    if (s.mode === 'teach') {
      const input = KEY_INPUT[ev.code];
      if (input) {
        ev.preventDefault();
        if (ev.repeat) {
          // Пробел при удержании ждёт подряд, стрелки повторяют шаг не чаще оператора.
          if (input === 'act') return;
          if (input !== 'wait' && this.time.now - this.lastRepeat < REPEAT_MS) return;
        }
        this.lastRepeat = this.time.now;
        this.teach(input);
      } else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') this.finishTeach();
      // Esc и во время показа открывает меню паузы. Запись при этом сохраняется: «Продолжить» — и показ идёт дальше.
      // Отменить показ можно кнопкой «Отменить показ» на панели.
      else if (ev.code === 'Escape') this.openPause();
      return;
    }
    if (ev.repeat) return;
    switch (ev.code) {
      case 'Escape':
        // Esc всегда сразу открывает паузу (шестерёнку). Выбор робота и режим покупки при этом снимаются,
        // чтобы после «Продолжить» игрок вернулся к чистому полю.
        if (this.buyType) this.toggleBuy(null);
        if (this.view.kind !== 'idle') this.setView({ kind: 'idle' });
        this.openPause();
        break;
      case 'Space':
        ev.preventDefault();
        this.openPause();
        break;
      case 'Digit1':
      case 'Numpad1':
        this.setSpeed(1);
        break;
      case 'Digit2':
      case 'Numpad2':
        this.setSpeed(2);
        break;
      case 'Digit3':
      case 'Numpad3':
        this.setSpeed(4);
        break;
      case 'Tab':
        ev.preventDefault();
        this.setTelemetry(!this.telemetryOpen);
        audio.play('click');
        break;
      case 'KeyF':
        this.fps.setVisible(!this.fps.visible);
        break;
      case 'Delete':
      case 'Backspace':
        if (this.view.kind === 'robot' && this.pick >= 0 && !this.code) this.editSelected((p) => removeBlock(p, this.pick), 'remove');
        break;
      default:
        // Стрелки и E вне показа ничего не делают — подсказываем, с чего показ начинается.
        if (KEY_INPUT[ev.code] && (s.mode === 'plan' || s.mode === 'running')) this.toasts.show(t('teach.needDock'), 'info');
        break;
    }
  }

  private setTelemetry(open: boolean): void {
    this.telemetryOpen = open;
    if (open && !this.telemetry) {
      this.telemetry = new TelemetryPanel(
        this,
        (robotId) => {
          this.setView({ kind: 'robot', robotId });
          audio.play('click');
        },
        (id) => this.numbers.of(id),
      );
    }
    this.telemetry?.setOpen(open);
  }

  private fail(reason: FailReason): void {
    this.toasts.show(t(`fail.${reason}`), 'warn');
    audio.play('error');
  }

  private setSpeed(speed: Speed): void {
    if (speed !== this.speed) audio.play('click');
    this.speed = speed;
  }

  // ---------- показ (репетиция) ----------

  private beginTeach(dock: number, replace?: number): void {
    const r = this.sim.beginTeach(dock, replace);
    if (!r.ok) {
      this.fail(r.reason);
      return;
    }
    this.toggleBuy(null);
    // Во время показа нужна вся карта: панель телеметрии закрываем.
    this.setTelemetry(false);
    this.setView({ kind: 'teach' });
    audio.play('click');
  }

  private teach(input: TeachInput): void {
    const r = this.sim.teachInput(input);
    if (!r.ok) {
      if (r.reason) this.fail(r.reason);
      return;
    }
    this.field.play(r.events);
    this.playSounds(r.events);
    if (input !== 'act') audio.play('step', { rate: input === 'wait' ? 0.8 : 1 });
  }

  private finishTeach(): void {
    if (!this.sim.canFinishTeach()) {
      this.toasts.show(t('teach.returnHint'), 'info');
      audio.play('error');
      return;
    }
    const r = this.sim.finishTeach();
    if (!r.ok) {
      this.fail(r.reason);
      return;
    }
    this.view = { kind: 'robot', robotId: r.id };
    this.pick = -1;
  }

  private cancelTeach(): void {
    this.sim.cancelTeach();
    this.setView({ kind: 'idle' });
    audio.play('click');
  }

  // ---------- правка программы ----------

  private selectedRobot(): SimSnapshot['robots'][number] | null {
    const v = this.view;
    return v.kind === 'robot' ? (this.snap.robots.find((r) => r.id === v.robotId) ?? null) : null;
  }

  private editSelected(change: (p: Block[]) => Block[] | null, kind: 'remove' | 'sense' | 'waitMore' | 'waitLess'): void {
    const r = this.selectedRobot();
    if (!r || this.pick < 0) return;
    const base = (r.pendingProgram ?? r.program).map((b) => ({ ...b }));
    const next = change(base);
    if (!next) return;
    const check = this.sim.checkProgram(r.id, next);
    if (!check.ok) {
      this.fail(check.reason);
      return;
    }
    const done = this.sim.setProgram(r.id, next);
    if (!done.ok) {
      this.fail(done.reason);
      return;
    }
    // Держим выбор на том же блоке, даже если перед ним появился или исчез датчик.
    const grew = next.length - base.length;
    if (kind === 'sense' && base[this.pick]?.op !== 'sense') this.pick += grew;
    else if (kind === 'waitMore' && base[this.pick]?.op !== 'wait') this.pick += 1;
    this.pick = Math.min(this.pick, next.length - 1);
    audio.play('click');
  }

  private copySelected(): void {
    const r = this.selectedRobot();
    if (!r) return;
    // Копия стартует на полкруга позже: два робота делят работу и не мешают друг другу.
    const delay = Math.max(1, Math.round(programSteps(r.pendingProgram ?? r.program) / 2));
    const res = this.sim.copyRobot(r.id, delay);
    if (!res.ok) {
      this.fail(res.reason);
      return;
    }
    this.toasts.show(t('robot.copied', { n: delay }), 'ok');
  }

  private rewriteSelected(): void {
    const r = this.selectedRobot();
    if (r) this.beginTeach(r.dock, r.id);
  }

  private removeSelected(): void {
    const r = this.selectedRobot();
    if (!r) return;
    const res = this.sim.removeRobot(r.id);
    if (!res.ok) this.fail(res.reason);
    else this.setView({ kind: 'idle' });
  }

  /** Пунктир новой петли выбранного робота, пока правка ждёт конца круга. */
  private pendingLoop(s: SimSnapshot, robotId: number | null): LoopSpec | null {
    const r = robotId === null ? undefined : s.robots.find((x) => x.id === robotId);
    if (!r || !r.pendingProgram) return null;
    const sig = `${r.id}:${JSON.stringify(r.pendingProgram)}`;
    if (sig !== this.pendingPath.sig) {
      const check = this.sim.checkProgram(r.id, r.pendingProgram.map((b) => ({ ...b })));
      this.pendingPath = {
        sig,
        spec: check.ok
          ? { id: -2, color: robotColor(r.colorIndex), cells: check.path, offset: laneOffset(r.dock), strength: 0.9, dashed: true }
          : null,
      };
    }
    return this.pendingPath.spec;
  }

  // ---------- покупки ----------

  private toggleBuy(type: MachineType | null): void {
    this.buyType = type === null || this.buyType === type ? null : type;
    this.ghost.removeAll(true);
    if (this.buyType) {
      this.ghost.add([this.add.image(0, 0, tileKey(this.buyType)).setDisplaySize(56, 56), this.add.image(0, -3, iconKey(this.buyType)).setDisplaySize(34, 34)]);
      this.setView({ kind: 'idle' });
    }
    this.drawGhost();
  }

  private drawGhost(): void {
    const cell = this.ghostCell;
    if (!this.buyType || !cell) {
      this.ghost.setVisible(false);
      return;
    }
    const ok = this.sim.canBuy(this.buyType, cell.x, cell.y).ok;
    const c = this.field.screenCenter(cell.x, cell.y);
    this.ghost.setPosition(c.x, c.y).setVisible(true).setAlpha(0.75);
    for (const o of this.ghost.list) (o as Phaser.GameObjects.Image).setTint(ok ? COLOR.ok : COLOR.miss);
  }

  private buyAt(type: MachineType, x: number, y: number): void {
    const r = this.sim.buy(type, x, y);
    if (!r.ok) {
      this.fail(r.reason);
      return;
    }
    this.toggleBuy(null);
  }

  private sell(machineId: number): void {
    const r = this.sim.sell(machineId);
    if (!r.ok) this.fail(r.reason);
    else this.setView({ kind: 'idle' });
  }

  private sellSelected(): void {
    if (this.view.kind === 'machine') this.sell(this.view.machineId);
  }

  // ---------- старт, события, финал ----------

  private startLine(): void {
    if (this.snap.mode !== 'plan') return;
    if (this.snap.robots.length === 0) {
      this.toasts.show(t('bottom.noRobots'), 'info');
      return;
    }
    this.sim.start();
    this.toggleBuy(null);
    audio.play('countdown');
  }

  private onEvents(events: readonly SimEvent[]): void {
    this.field.play(events);
    this.playSounds(events);
    for (const e of events) {
      if (e.type === 'launch') {
        if (this.level.endless) {
          audio.play('launch', { volume: 0.5 });
          this.toasts.show(t('endless.launched', { n: e.value }), 'ok');
        } else {
          this.beginLaunch();
        }
      } else if (e.type === 'won') {
        this.stars = e.value;
      } else if (e.type === 'lost' && this.ending === 'none') {
        this.ending = 'done';
        this.time.delayedCall(900, () => this.showResults(false));
      }
    }
  }

  private playSounds(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'step') {
        const r = e.robotId === OPERATOR_ID ? null : this.snap.robots.find((x) => x.id === e.robotId);
        if (r) audio.play('step', { rate: stepRate(r.dock), volume: 0.6 });
        continue;
      }
      const name = EVENT_SOUND[e.type];
      if (name) audio.play(name);
    }
  }

  /** Отсчёт 3-2-1, потом ракета уходит вверх; итог — когда она скрылась. */
  private beginLaunch(): void {
    if (this.ending !== 'none') return;
    this.ending = 'launch';
    this.view = { kind: 'idle' };
    this.setTelemetry(false);
    const c = { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 };
    this.countdown = txt(this, c.x, c.y, '3', { size: 120, bold: true, ox: 0.5, oy: 0.5 }).setDepth(DEPTH.modal);
    let n = 3;
    audio.play('countdown');
    this.time.addEvent({
      delay: 650,
      repeat: 2,
      callback: () => {
        n--;
        if (!this.countdown) return;
        if (n > 0) {
          setText(this.countdown, String(n));
          audio.play('countdown');
          return;
        }
        this.countdown.destroy();
        this.countdown = null;
        audio.play('launch');
        this.field.launchRocket(() => this.showResults(true));
      },
    });
  }

  private skipEnding(): void {
    if (this.ending === 'launch') {
      this.countdown?.destroy();
      this.countdown = null;
      this.field.skipLaunch();
      // Тряску камеры останавливаем: на паузе под итогами поле иначе так и застыло бы со сдвигом.
      this.cameras.main.resetFX();
      this.showResults(true);
    }
  }

  private showResults(won: boolean): void {
    if (this.scene.isActive('Results')) return;
    this.ending = 'done';
    const s = this.sim.snapshot();
    const endless = !!this.level.endless;
    const spent = s.energy - s.energyLeft;
    const passed = won || (endless && s.launches > 0);
    const best = passed
      ? store.saveResult(this.level.id, { stars: won ? s.stars : 0, timeLeft: s.timeLeft, energySpent: spent, misses: s.misses, launches: s.launches })
      : false;
    // Третье поражение подряд на этом уровне — итоги предложат подсказку.
    let offerHint = false;
    if (passed) hints.won(this.level.id);
    else offerHint = hints.lost(this.level.id);
    const data: ResultsData = {
      levelId: this.level.id,
      won,
      endless,
      stars: won ? (s.stars || this.stars) : 0,
      starEnergyOk: s.starEnergyOk,
      starTimeOk: s.starTimeOk,
      delivered: s.delivered,
      target: s.target,
      timeLeft: s.timeLeft,
      energySpent: spent,
      energy: s.energy,
      starEnergy: this.level.starEnergy ?? null,
      starTimeLeft: this.level.starTimeLeft ?? null,
      misses: s.misses,
      launches: s.launches,
      best,
      bottleneckKey: s.bottleneck ? bottleneckHintKey(s.bottleneck, this.level, s) : null,
      offerHint,
    };
    audio.play(won ? 'win' : 'lose');
    this.scene.launch('Results', data);
    this.scene.pause();
  }

  private openPause(): void {
    if (this.ending !== 'none' || this.scene.isActive('Pause')) return;
    this.scene.launch('Pause', { levelId: this.level.id });
    this.scene.pause();
  }

  // ---------- обучение уровня ----------

  private updateTutorial(s: SimSnapshot): void {
    const selected = this.view.kind === 'robot' ? this.view.robotId : null;
    const robot = selected === null ? undefined : s.robots.find((r) => r.id === selected);
    const program = robot ? (robot.pendingProgram ?? robot.program) : null;
    const ctx: TutorialCtx = {
      snap: s,
      level: this.level,
      canFinish: s.canFinishTeach,
      telemetryOpen: this.telemetryOpen,
      lastMiss: this.lastMiss,
      selectedRobot: selected,
      picked: program && this.pick >= 0 ? (program[this.pick]?.op ?? null) : null,
    };
    this.tutorial.update(ctx);
    const step = this.tutorial.current();
    const show = !!step && this.tutorial.visible(ctx) && this.ending === 'none';
    this.tutCard.setVisible(show);
    if (!show || !step) {
      this.tutArrow.setVisible(false);
      this.tutFrame.setVisible(false);
      return;
    }
    const text = t(this.tutorial.textKey(ctx) ?? step.key);
    if (this.tutText.text !== text) {
      this.tutText.setText(text);
      const w = Math.ceil(Math.max(this.tutText.width, 120) + 32);
      const h = Math.ceil(this.tutText.height + 50);
      this.tutBg.setTexture(plateKey(this, w, h, { fill: COLOR.chrome, stroke: COLOR.rule })).setDisplaySize(w, h);
      this.tutCard.setY(BOTTOM.y - 16 - h);
    }
    const target = this.tutorial.target(ctx);
    let at: { x: number; y: number } | null = null;
    let box: { x: number; y: number; w: number; h: number } | null = null;
    if (target?.kind === 'cell') {
      const c = this.field.screenCenter(target.x, target.y);
      at = { x: c.x, y: c.y - 44 };
    } else if (target?.kind === 'robot') {
      const c = this.field.robotScreen(target.id);
      if (c) at = { x: c.x, y: c.y - 44 };
    } else if (target?.kind === 'block') {
      box = this.panel.blockAnchor(target.index);
    } else if (target?.kind === 'ui') {
      if (target.id === 'start') box = this.bottom.anchor();
      else if (target.id === 'telemetry') box = this.bottom.telemetryAnchor();
      else box = this.panel.anchor(target.id);
    }
    this.tutArrow.setVisible(at !== null);
    if (at) this.tutArrow.setPosition(at.x, at.y - 18 + Math.sin(this.time.now / 180) * 5);
    // Рамка вокруг нужной кнопки: светлая, мягко пульсирует, на соседние кнопки не залезает.
    this.tutFrame.setVisible(box !== null);
    if (box) {
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time.now / 220));
      this.tutFrame.clear().lineStyle(2, COLOR.text, pulse).strokeRoundedRect(box.x - box.w / 2 - 3, box.y - box.h / 2 - 3, box.w + 6, box.h + 6, 6);
    }
  }
}
