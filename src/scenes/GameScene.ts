// Игровая сцена. Логики мира здесь нет: сцена принимает ввод игрока, вызывает методы ISimulation
// и рисует sim.snapshot(). Время мира идёт только через sim.step(dt × скорость).
// Отдельные части экрана живут в своих модулях: обучение (ui/tutorialOverlay), авария «линия встала»
// (ui/stallAlarm), сохранение и «Заново с роботами» (ui/runKeeper), покупка машин (ui/buyMode),
// показ роботу клавишами и мышью (ui/teachMode), финал со стартом ракеты (render/launchSequence).
// Сцена связывает их с симуляцией и между собой.
import Phaser from 'phaser';
import { Simulation } from '../sim';
import { OPERATOR_ID, TILE } from '../types';
import type { Block, FailReason, LevelData, SimEvent, SimSnapshot } from '../types';
import { getRenderScale } from '../render/display';
import { FieldView } from '../render/field';
import type { HighlightKind } from '../render/field';
import { LaunchSequence } from '../render/launchSequence';
import type { LoopSpec } from '../render/loopLayer';
import { BOTTOM, DEPTH, FIELD, PANEL, STRIP, TOP_H, fieldFit } from '../render/layout';
import { laneOffset } from '../render/robotPose';
import { audio, stepRate } from '../ui/audio';
import type { SfxName } from '../ui/audio';
import { BottomBar } from '../ui/bottomBar';
import { BuyMode } from '../ui/buyMode';
import { FieldStrip } from '../ui/fieldStrip';
import { FrameStats } from '../ui/frameStats';
import { hints } from '../ui/hints';
import { num, t } from '../ui/i18n';
import { levelById, levelIndex, levels, machineDefs } from '../ui/levels';
import { changeWait, programSteps, removeBlock, toggleSense } from '../ui/programModel';
import type { Replay } from '../ui/replay';
import { RobotNumbers } from '../ui/robotNumbers';
import { RunKeeper } from '../ui/runKeeper';
import type { RunStart } from '../ui/runKeeper';
import { SidePanel } from '../ui/sidePanel';
import type { PanelView } from '../ui/sidePanel';
import { StallAlarm } from '../ui/stallAlarm';
import { store } from '../ui/storage';
import { TEACH_KEYS, TeachMode } from '../ui/teachMode';
import { COLOR, SIZE, robotColor } from '../ui/theme';
import { TopBar } from '../ui/topBar';
import type { Speed } from '../ui/topBar';
import { TelemetryPanel } from '../ui/telemetryPanel';
import { bottleneckHintKey, bottleneckSpot } from '../ui/telemetryModel';
import { deployBotJava, toFtcJava } from '../ui/ftcCode';
import { TutorialOverlay } from '../ui/tutorialOverlay';
import type { TutorialAnchors } from '../ui/tutorialOverlay';
import { TutorialFlow } from '../ui/tutorialModel';
import type { MissInfo, TutorialCtx } from '../ui/tutorialModel';
import { Toasts, plate, setText, txt } from '../ui/widgets';
import { onKeyDown } from '../ui/keys';
import { enter, go, leaving } from './flow';
import { preparePitch } from './pitch';
import { STRESS_ID, deployStress, stressLevel } from './stress';
import type { CodeData } from './CodeScene';
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

/** Как часто сохранять незаконченный уровень, пока линия строится или работает. */
const AUTOSAVE_MS = 5000;

export interface GameData extends RunStart {
  levelId?: string;
  /** Демо для защиты (?pitch). */
  pitch?: boolean;
}

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
  private buy!: BuyMode;
  /** Клетка карты под мышью (null — мышь не над картой): для призрака покупки и рамки показа. */
  private ghostCell: { x: number; y: number } | null = null;
  private tint!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Container;
  /** Ширина плашки режима обучения в полосе над картой: легенда ужимается, чтобы не залезть под неё. */
  private bannerW = 0;
  private tutorial!: TutorialFlow;
  private overlay!: TutorialOverlay;
  private telemetryOpen = false;
  /** Панель телеметрии создаётся при первом Tab: так вход в уровень быстрее на слабом ноутбуке. */
  private telemetry: TelemetryPanel | null = null;
  /** Последний снимок настоящего мира: во время показа верхняя полоса показывает его, а не часы копии. */
  private realSnap: SimSnapshot | null = null;
  private fps!: Phaser.GameObjects.Text;
  private frames = new FrameStats();
  private fpsAt = 0;
  private ending: 'none' | 'launch' | 'done' = 'none';
  private launch: LaunchSequence | null = null;
  private stars = 0;
  private pendingPath: { sig: string; spec: LoopSpec | null } = { sig: '', spec: null };
  private strip!: FieldStrip;
  /** Показать петлю только этого робота (кнопки над картой). null — все петли. */
  private solo: number | null = null;
  /** Показ роботу: клавиши, мышь, копии со сдвигом. */
  private teachMode!: TeachMode;
  /** Номера роботов в подписях панели и телеметрии: самый маленький свободный, перезапись сохраняет номер. */
  private numbers = new RobotNumbers();
  /** Последний промах в настоящем мире — подсказка про датчик ведёт к этому роботу и этому действию. */
  private lastMiss: MissInfo | null = null;
  /** Think Award: игрок открыл телеметрию во время работы линии («измерил»)… */
  private measured = false;
  /** …и после этого что-то исправил на ходу («исправил»). Если уровень пройден — награда. */
  private fixed = false;
  /** Сцена собрана: до этого (или если уровень не загрузился) update ничего не делает. */
  private ready = false;
  /** Автосохранение («Продолжить») и мир в момент «Старт» («Заново с роботами»). */
  private run!: RunKeeper;
  /** Авария «линия встала»: карточка с причиной и выходом. */
  private alarm!: StallAlarm;
  private savedAt = 0;
  /** Музыка сейчас приглушена (показ или пауза). */
  private muffled = false;

  constructor() {
    super('Game');
  }

  create(data: GameData): void {
    this.ready = false;
    enter(this);
    this.speed = 1;
    this.view = { kind: 'idle' };
    this.pick = -1;
    this.code = false;
    this.ending = 'none';
    this.launch = null;
    this.telemetryOpen = false;
    this.pendingPath = { sig: '', spec: null };
    this.solo = null;
    // Сцена переиспользуется при «заново»: всё, что помнит прошлый заход, сбрасываем здесь.
    this.ghostCell = null;
    this.stars = 0;
    this.lastMiss = null;
    this.numbers = new RobotNumbers();
    this.measured = false;
    this.fixed = false;
    this.savedAt = 0;

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
    this.run = new RunKeeper(this.sim, level, stress || !!data?.pitch);
    const note = this.run.restore(data);
    this.snap = this.sim.snapshot();
    this.cameras.main.setBackgroundColor(COLOR.page);

    // Карта занимает всё место под полосой легенды: маленький уровень крупнее, большой влезает целиком.
    const fit = fieldFit(level.width, level.height);
    this.field = new FieldView(this, level, fit.ox, fit.oy, fit.scale);
    this.field.root.setDepth(DEPTH.floor);

    this.strip = new FieldStrip(this, level, levels(), {
      legend: (kind) => this.showLegend(kind),
      solo: (id) => {
        this.solo = id;
      },
    }, (id) => this.numbers.of(id));

    // Режим обучения: голубой фильтр на поле и плашка о том, что настоящий мир стоит (справа в полосе над картой).
    this.tint = this.add.rectangle(FIELD.x, FIELD.y, FIELD.w, FIELD.h, COLOR.teach, 0.07).setOrigin(0, 0).setDepth(DEPTH.tint).setVisible(false);
    const bannerText = txt(this, 0, 0, t('teach.banner'), { size: SIZE.micro, bold: true, color: COLOR.ink, caps: true, ox: 0.5, oy: 0.5 });
    const bannerW = Math.ceil(bannerText.width + 32);
    this.bannerW = bannerW;
    const bannerBg = plate(this, 0, 0, bannerW, 28, { fill: COLOR.teach, radius: 3 });
    this.banner = this.add
      .container(STRIP.x + STRIP.w - bannerW / 2, STRIP.y + STRIP.h / 2, [bannerBg, bannerText])
      .setDepth(DEPTH.marker)
      .setVisible(false);

    this.top = new TopBar(this, t(level.titleKey), !!level.endless, level.targetItem, {
      speed: (s) => this.setSpeed(s),
      pause: () => this.openPause(),
    });
    this.panel = new SidePanel(this, level, {
      finishTeach: () => this.teachMode.finish(),
      cancelTeach: () => this.teachMode.cancel(),
      teachCopy: () => this.teachMode.cycleCopies(),
      pick: (i) => {
        this.pick = this.pick === i ? -1 : i;
      },
      removeBlock: () => this.editSelected((p) => removeBlock(p, this.pick), 'remove'),
      toggleSense: () => this.editSelected((p) => toggleSense(p, this.pick), 'sense'),
      wait: (delta) => this.editSelected((p) => changeWait(p, this.pick, delta), delta > 0 ? 'waitMore' : 'waitLess'),
      copy: () => this.copySelected(),
      newRoute: () => this.newRoute(),
      rewrite: () => this.rewriteSelected(),
      removeRobot: () => this.removeSelected(),
      toggleCode: () => {
        this.code = !this.code;
      },
      ftcCode: () => this.openFtcCode(),
      sell: () => this.sellSelected(),
    }, (id) => this.numbers.of(id));
    this.bottom = new BottomBar(this, level, { start: () => this.startLine(), buy: (type) => this.buy.toggle(type) });
    // Сообщения — под полосой легенды и строкой FPS, по центру карты.
    this.toasts = new Toasts(this, FIELD.x + FIELD.w / 2, STRIP.y + STRIP.h + 52, DEPTH.toast);
    this.telemetry = null;
    this.realSnap = null;

    this.buy = new BuyMode(this, this.field, this.sim, {
      fail: (reason) => this.fail(reason),
      bought: () => this.noteFix(),
      started: () => this.setView({ kind: 'idle' }),
    });
    this.teachMode = new TeachMode(this, {
      sim: this.sim,
      field: this.field,
      snap: () => this.snap,
      fail: (reason) => this.fail(reason),
      toast: (text, kind) => this.toasts.show(text, kind),
      playSounds: (events) => this.playSounds(events),
      began: () => {
        this.buy.toggle(null);
        // Во время показа нужна вся карта: панель телеметрии закрываем.
        this.setTelemetry(false);
        this.setView({ kind: 'teach' });
      },
      finished: (robotId) => {
        this.view = { kind: 'robot', robotId };
        this.pick = -1;
      },
      cancelled: () => this.setView({ kind: 'idle' }),
      noteFix: () => this.noteFix(),
    });

    const steps = level.tutorial ?? (levelIndex(level.id) === 0 ? FIRST_LEVEL_TUTORIAL : []);
    this.tutorial = new TutorialFlow(steps);
    this.overlay = new TutorialOverlay(this);
    this.alarm = new StallAlarm(this, (id) => this.numbers.of(id), () => this.restartWithRobots());

    // Счётчик FPS (F, ?stress) — под полосой легенды слева, чтобы не закрывать её кнопки.
    this.fps = txt(this, STRIP.x, STRIP.y + STRIP.h + 6, '', { size: SIZE.small, color: COLOR.text }).setDepth(DEPTH.debug).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    onKeyDown(this, (ev: KeyboardEvent) => this.onKey(ev));
    // Tab не должен уводить фокус из игры.
    this.input.keyboard?.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');
    audio.music('shift');
    this.muffled = false;
    audio.setMusicMuffled(false);
    // Вкладку закрыли или спрятали — уровень сохраняется, «Продолжить» вернёт его.
    this.run.attach(this, () => this.ending !== 'none');
    this.events.once('shutdown', () => audio.setMusicMuffled(false));
    // Машины, которых на прошлых уровнях не было, один раз мигают сами — игрок сразу видит, что нового.
    const fresh = FieldStrip.fresh(level, levels());
    if (fresh.length > 0) this.time.delayedCall(600, () => fresh.forEach((k) => this.field.highlight(k, 2500)));
    if (stress) {
      // Проверка производительности: 8 роботов, ×4, счётчик кадров сразу виден.
      deployStress(this.sim);
      this.sim.start();
      this.speed = 4;
      this.fps.setVisible(true);
    } else if (data?.pitch) {
      // Демо для питча: слепой робот уже работает и промахивается, панель сразу показывает его программу.
      const pitch = preparePitch(this.sim);
      if (pitch !== null) {
        this.view = { kind: 'robot', robotId: pitch.robot };
        this.run.startSave = pitch.startSave;
      }
    }
    if (stress || data?.pitch) {
      // События подготовки (появление роботов, первые шаги) уже в прошлом — не озвучиваем их разом.
      this.sim.step(0);
      this.snap = this.sim.snapshot();
    }
    if (note) this.toasts.show(note.text, note.kind);
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
    if (events.length > 0) {
      this.alarm.feed(events);
      this.onEvents(events);
    }
    this.alarm.update(s, this.ending !== 'none');

    this.syncView(s);
    const selectedRobot = this.view.kind === 'robot' ? this.view.robotId : null;
    const selectedMachine = this.view.kind === 'machine' ? this.view.machineId : null;
    const extra = this.pendingLoop(s, selectedRobot);
    // Робота, чью петлю смотрели отдельно, убрали — снова показываем все петли.
    if (this.solo !== null && (s.robots.length < 2 || !s.robots.some((r) => r.id === this.solo))) this.solo = null;
    const solo = s.mode === 'teach' ? null : this.solo;
    this.field.markBottleneck(s.mode === 'running' ? (this.alarm.mark(s) ?? bottleneckSpot(s)) : null);
    this.field.render(s, dt, { selectedRobot, selectedMachine, extraLoops: extra ? [extra] : undefined, solo });
    this.strip.update(s, this.solo, s.mode === 'teach' ? this.bannerW : 0);
    this.telemetry?.update(s, selectedRobot);
    const teaching = s.mode === 'teach';
    if (!teaching) this.realSnap = s;
    this.top.update(teaching && this.realSnap ? this.realSnap : s, this.speed, teaching);
    this.panel.update(s, {
      view: this.view,
      pick: this.pick,
      code: this.code,
      teachCopies: this.teachMode.copies,
      maxTeachCopies: this.teachMode.maxCopies(s),
    });
    this.bottom.update(s, this.buy.type);
    // Призрак покупки перекрашиваем каждый кадр: мир меняется и без движения мыши (правка петли, энергия).
    this.buy.draw();
    this.tint.setVisible(teaching);
    this.banner.setVisible(teaching);
    this.teachMode.updateHover(s, this.ghostCell);
    this.updateTutorial(s);
    // Показ: настоящий мир стоит — музыка глохнет. (Пауза глушит её сама, а после «Продолжить» здесь вернётся.)
    if (teaching !== this.muffled) {
      this.muffled = teaching;
      audio.setMusicMuffled(teaching);
    }
    if (time - this.savedAt > AUTOSAVE_MS) {
      this.savedAt = time;
      this.run.save(this.ending !== 'none');
    }
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
    // Карточка аварии лежит поверх карты: нажатие на неё (и на её кнопку) — не клик по полю.
    if (this.alarm.contains(w.x, w.y)) return;
    if (!this.onField(w.x, w.y) || this.telemetry?.covers(w.y)) return;
    // Полоса над картой (легенда, выбор петель) — свои кнопки, это не клик по полю.
    if (w.y < STRIP.y + STRIP.h + 4) return;
    const s = this.snap;
    if (s.mode === 'won' || s.mode === 'lost') return;
    const cell = this.field.cellAt(w.x, w.y);
    if (s.mode === 'teach') {
      if (!p.rightButtonDown()) this.teachMode.click(cell);
      return;
    }
    if (this.buy.type) {
      if (p.rightButtonDown()) this.buy.toggle(null);
      else if (cell) this.buy.buyAt(cell.x, cell.y);
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
    const cellPx = TILE * this.field.scale;
    for (const r of s.robots) {
      const off = laneOffset(r.dock);
      const d = Math.hypot(r.x + 0.5 - (w.x - this.field.root.x) / cellPx, r.y + 0.5 - (w.y - this.field.root.y) / cellPx);
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
        this.teachMode.begin(dock);
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
    this.ghostCell = this.onField(w.x, w.y) && !this.telemetry?.covers(w.y) && !this.alarm.contains(w.x, w.y) ? this.field.cellAt(w.x, w.y) : null;
    this.buy.hover(this.ghostCell);
  }

  private onKey(ev: KeyboardEvent): void {
    // Сцена уже уходит (затемнение перехода) — клавиши не для неё. Сочетания с Ctrl, Cmd и Alt — браузеру и системе:
    // Cmd+M сворачивает окно и не должна заодно выкидывать к выбору уровней.
    if (!this.ready || leaving(this) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // M открывает паузу (там M — «К уровням»). Раньше M сразу выкидывала к уровням — и случайное нажатие
    // рядом с N стирало показ и всю линию. Теперь выход — два нажатия, а запись показа при паузе сохраняется.
    if (!ev.repeat && ev.code === 'KeyM') {
      this.openPause();
      return;
    }
    if (this.ending !== 'none') {
      if (ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'Escape') this.skipEnding();
      return;
    }
    const s = this.snap;
    if (s.mode === 'teach') {
      // Esc и во время показа открывает меню паузы. Запись при этом сохраняется: «Продолжить» — и показ идёт дальше.
      // Отменить показ можно кнопкой «Отменить показ» на панели. Остальное — клавиши показа (ui/teachMode).
      if (ev.code === 'Escape') this.openPause();
      else this.teachMode.key(ev);
      return;
    }
    if (ev.repeat) return;
    switch (ev.code) {
      case 'Escape':
        // Esc всегда сразу открывает паузу (шестерёнку). Выбор робота и режим покупки при этом снимаются,
        // чтобы после «Продолжить» игрок вернулся к чистому полю.
        if (this.buy.type) this.buy.toggle(null);
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
      case 'KeyR':
        this.copyHotkey();
        break;
      case 'KeyN':
        this.newRoute();
        break;
      case 'Delete':
      case 'Backspace':
        if (this.view.kind === 'robot' && this.pick >= 0 && !this.code) this.editSelected((p) => removeBlock(p, this.pick), 'remove');
        break;
      default:
        // Стрелки и E вне показа ничего не делают — подсказываем, с чего показ начинается.
        if (TEACH_KEYS[ev.code] && (s.mode === 'plan' || s.mode === 'running')) this.toasts.show(t('teach.needDock'), 'info');
        break;
    }
  }

  /** Нажатие в легенде: машины этого типа мигают на карте, а панель справа рассказывает, что это за машина. */
  private showLegend(kind: HighlightKind): void {
    this.field.highlight(kind);
    if (kind === 'dock' || this.snap.mode === 'teach' || this.ending !== 'none') return;
    const m = this.snap.machines.find((x) => x.type === kind);
    if (m) this.setView({ kind: 'machine', machineId: m.id });
  }

  /**
   * N или «Свой путь (N)»: новый робот со своим маршрутом — игрок показывает ему другую работу.
   * Берём свободный док (у него своя полоса, и оттуда обычно удобнее начать вторую работу);
   * если свободных нет — док выбранного или последнего робота: на одном доке могут жить разные маршруты.
   */
  private newRoute(): void {
    const s = this.snap;
    if (s.mode !== 'plan' && s.mode !== 'running') return;
    const free = this.level.docks.findIndex((_, i) => !s.robots.some((r) => r.dock === i));
    const near = this.selectedRobot() ?? s.robots[s.robots.length - 1] ?? null;
    const dock = free >= 0 ? free : (near?.dock ?? 0);
    this.teachMode.begin(dock);
    if (s.robots.length > 0 && this.sim.snapshot().mode === 'teach') this.toasts.show(t('robot.routeStart', { dock: dock + 1 }), 'info');
  }

  /** Окно «код для настоящего робота»: программа выбранного робота как OpMode FTC на Java. */
  private openFtcCode(): void {
    const r = this.selectedRobot();
    if (!r || this.scene.isActive('Code')) return;
    const robot = this.numbers.of(r.id);
    const lines = toFtcJava(r.pendingProgram ?? r.program, { robot, dock: r.dock + 1 });
    // Две вкладки: OpMode из показа и класс робота, который он вызывает, — вместе их можно собрать в FTC SDK.
    const data: CodeData = {
      robot,
      files: [
        { name: `CommitDeployRobot${robot}.java`, lines, sub: t('ftc.sub') },
        { name: 'DeployBot.java', lines: deployBotJava(), sub: t('ftc.botSub') },
      ],
    };
    this.scene.launch('Code', data);
    this.scene.pause();
  }

  /**
   * Инженерный цикл для награды Think Award: измерил (телеметрия во время работы линии) → исправил
   * (правка программы, копия, новый робот, покупка) → линия справилась. Отмечаем «исправил» только после «измерил».
   */
  private noteFix(): void {
    if (this.measured && this.sim.snapshot().mode === 'running') this.fixed = true;
  }

  private setTelemetry(open: boolean): void {
    if (open && this.snap?.mode === 'running') this.measured = true;
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

  // ---------- показ (репетиция): ui/teachMode ----------

  /** R вне показа: копия выбранного робота, а если никто не выбран — последнего поставленного. */
  private copyHotkey(): void {
    if (this.snap.mode !== 'plan' && this.snap.mode !== 'running') return;
    const r = this.selectedRobot() ?? this.snap.robots[this.snap.robots.length - 1] ?? null;
    if (!r) {
      this.toasts.show(t('robot.copyNoRobot'), 'info');
      audio.play('error');
      return;
    }
    this.copyRobot(r);
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
    this.noteFix();
    // Держим выбор на том же блоке, даже если перед ним появился или исчез датчик.
    const grew = next.length - base.length;
    if (kind === 'sense' && base[this.pick]?.op !== 'sense') this.pick += grew;
    else if (kind === 'waitMore' && base[this.pick]?.op !== 'wait') this.pick += 1;
    this.pick = Math.min(this.pick, next.length - 1);
    audio.play('click');
  }

  private copySelected(): void {
    const r = this.selectedRobot();
    if (r) this.copyRobot(r);
  }

  private copyRobot(r: SimSnapshot['robots'][number]): void {
    // Копия стартует позже: с одной копией — на полкруга, с каждой следующей — в оставшийся просвет,
    // чтобы роботы на одном доке делили круг и не ходили друг за другом вплотную.
    const onDock = this.snap.robots.filter((x) => x.dock === r.dock).length;
    const steps = programSteps(r.pendingProgram ?? r.program);
    const delay = Math.max(1, Math.round((steps * onDock) / (onDock + 1)));
    const res = this.sim.copyRobot(r.id, delay);
    if (!res.ok) {
      this.fail(res.reason);
      return;
    }
    this.noteFix();
    this.toasts.show(t('robot.copied', { n: delay }), 'ok');
  }

  private rewriteSelected(): void {
    const r = this.selectedRobot();
    if (r) this.teachMode.begin(r.dock, r.id);
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

  // ---------- покупки (ui/buyMode) ----------

  private sell(machineId: number): void {
    if (this.buy.sell(machineId)) this.setView({ kind: 'idle' });
  }

  private sellSelected(): void {
    if (this.view.kind === 'machine') this.sell(this.view.machineId);
  }

  // ---------- старт, авария, сохранение ----------

  private startLine(): void {
    if (this.snap.mode !== 'plan') return;
    if (this.snap.robots.length === 0) {
      this.toasts.show(t('bottom.noRobots'), 'info');
      return;
    }
    // Мир в момент старта: с него начнётся «Заново с роботами».
    this.run.markStart();
    this.alarm.reset();
    this.sim.start();
    this.buy.toggle(null);
    audio.play('countdown');
    this.run.save(false);
  }

  /** Линия для «Заново с роботами»: мир на момент «Старт» и программы роботов сейчас. */
  replayData(): Replay | null {
    return this.run.replay();
  }

  /** «Заново с роботами» с карточки аварии: время сначала, роботы и программы — те же. */
  private restartWithRobots(): void {
    const replay = this.replayData();
    go(this, 'Game', replay ? { levelId: this.level.id, replay } : { levelId: this.level.id });
  }

  // ---------- события и финал ----------

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

  /** План выполнен: отсчёт, старт ракеты и итоги (render/launchSequence). */
  private beginLaunch(): void {
    if (this.ending !== 'none') return;
    this.ending = 'launch';
    this.view = { kind: 'idle' };
    this.setTelemetry(false);
    this.alarm.card.hide();
    this.launch = new LaunchSequence(this, this.field, () => this.showResults(true));
    this.launch.start();
  }

  private skipEnding(): void {
    if (this.ending === 'launch') this.launch?.skip();
  }

  private showResults(won: boolean): void {
    if (this.scene.isActive('Results')) return;
    this.ending = 'done';
    this.alarm.card.hide();
    const s = this.sim.snapshot();
    const endless = !!this.level.endless;
    const spent = s.energy - s.energyLeft;
    const passed = won || (endless && s.launches > 0);
    const best = passed
      ? store.saveResult(this.level.id, { stars: won ? s.stars : 0, timeLeft: s.timeLeft, energySpent: spent, misses: s.misses, launches: s.launches })
      : false;
    // Уровень закончен — его автосохранение больше не нужно.
    this.run.finish();
    // Третье поражение подряд на этом уровне — итоги предложат подсказку.
    let offerHint = false;
    if (passed) hints.won(this.level.id);
    else offerHint = hints.lost(this.level.id);
    // Think Award: измерил → исправил на ходу → линия справилась. Награда запоминается за уровень.
    const thinkAward = passed && this.measured && this.fixed;
    if (thinkAward) store.award(this.level.id);
    // Линия встала — в итогах именно эта причина, а не общий совет узкого места.
    const stall = won ? null : this.alarm.texts();
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
      cause: stall ? `${stall.cause} ${stall.fix}` : null,
      replay: this.replayData(),
      offerHint,
      thinkAward,
    };
    audio.music(null);
    audio.play(won ? 'win' : 'lose');
    this.scene.launch('Results', data);
    this.scene.pause();
  }

  private openPause(): void {
    if (this.ending !== 'none' || this.scene.isActive('Pause')) return;
    this.run.save(false);
    this.muffled = true;
    audio.setMusicMuffled(true);
    this.scene.launch('Pause', { levelId: this.level.id, replay: this.replayData() });
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
    // Авария важнее обучения: совет «поставь датчик» при взаимной блокировке уже не поможет.
    const show = !!step && this.tutorial.visible(ctx) && this.ending === 'none' && !this.alarm.visible;
    this.overlay.update(this.tutorial, ctx, show, this.anchors, s, this.level);
  }

  /** Где на экране цели обучения: клетки и роботы карты, блоки и кнопки панелей. */
  private readonly anchors: TutorialAnchors = {
    aboveCell: (x, y) => {
      const c = this.field.screenCenter(x, y);
      return { x: c.x, y: c.y - TILE * 0.69 * this.field.scale };
    },
    aboveRobot: (id) => {
      const c = this.field.robotScreen(id);
      return c ? { x: c.x, y: c.y - TILE * 0.69 * this.field.scale } : null;
    },
    block: (index) => this.panel.blockAnchor(index),
    ui: (id) => {
      if (id === 'start') return this.bottom.anchor();
      if (id === 'telemetry') return this.bottom.telemetryAnchor();
      return this.panel.anchor(id);
    },
  };
}
