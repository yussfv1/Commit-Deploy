/**
 * КОНТРАКТ между симуляцией (роль A), экраном (роль B) и контентом (роль C).
 *
 * Правила:
 *  - Симуляция (src/sim) ничего не знает про Phaser. Экран рисует игру ТОЛЬКО из snapshot()
 *    и меняет мир ТОЛЬКО методами ISimulation.
 *  - Уровни и баланс (src/data) — обычные JSON по типам LevelData и MachineDef.
 *  - Этот файл меняет только роль A и только после сообщения в чат команды.
 */

// ───────────────────────── Константы ─────────────────────────

/** Симуляция идёт фиксированными шагами: 20 тиков в секунду, независимо от FPS. */
export const TICKS_PER_SECOND = 20;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** Один блок программы робота длится 5 тиков = 0,25 с. */
export const STEP_TICKS = 5;
export const STEP_SECONDS = STEP_TICKS / TICKS_PER_SECOND;

/** Размер клетки на экране в пикселях (для роли B). */
export const TILE = 64;
export const MAX_GRID_WIDTH = 16;
export const MAX_GRID_HEIGHT = 9;

/** ДАТЧИК ждёт не дольше 10 секунд, потом робот идёт дальше (и, скорее всего, промахнётся). */
export const SENSE_TIMEOUT_TICKS = 200;

/** robotId в событиях, когда действует сам игрок в репетиции. */
export const OPERATOR_ID = -1;

/** Цвета роботов и их петель. RobotView.colorIndex — индекс в этом массиве. */
export const ROBOT_COLORS = [
  0x3ec1ff, 0xffd23f, 0x7cf07a, 0xff5fa2, 0xb58cff, 0xff9f43, 0x4de3c1, 0xf25f5c,
] as const;

// ───────────────────────── Базовые типы ─────────────────────────

/** Направление: 0 вверх, 1 вправо, 2 вниз, 3 влево. Ось Y растёт вниз, как на экране. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_DX = [0, 1, 0, -1] as const;
export const DIR_DY = [-1, 0, 1, 0] as const;

/** Руда → (пресс) → пластина; пластина + топливо → (сборщик) → ячейка. */
export type ItemType = 'ore' | 'plate' | 'fuel' | 'cell';
export const ITEM_TYPES: readonly ItemType[] = ['ore', 'plate', 'fuel', 'cell'];

export type MachineType = 'depot' | 'tank' | 'press' | 'assembler' | 'pad' | 'shelf';

/**
 * Поведение машины:
 *  source    — сама копит предметы (склад руды, бак топлива);
 *  processor — превращает входы в выход за время (пресс, сборщик);
 *  sink      — принимает целевой предмет уровня (стартовый стол);
 *  storage   — просто хранит предметы (полка-буфер).
 */
export type MachineKind = 'source' | 'processor' | 'sink' | 'storage';

/**
 * Состояние машины для лампочки на экране:
 *  idle    — пусто, ждёт вход;
 *  working — идёт цикл (у источника: пуст и копит следующий предмет);
 *  ready   — есть что забрать (обработчик при этом не принимает новый вход, пока его не разгрузят);
 *  full    — склад или полка заполнены до отказа.
 */
export type MachineState = 'idle' | 'working' | 'ready' | 'full';

// ───────────────────────── Программа робота ─────────────────────────

export type MoveOp = 'up' | 'right' | 'down' | 'left';

/**
 * Блоки программы:
 *  up/right/down/left — шаг на клетку; если там стена или машина — только поворот к ней;
 *  take  — взять предмет из машины перед собой;
 *  put   — положить предмет в машину перед собой;
 *  wait  — стоять n шагов (n по умолчанию 1);
 *  sense — ДАТЧИК: ждать, пока следующий за ним take/put сможет сработать.
 */
export type Op = MoveOp | 'take' | 'put' | 'wait' | 'sense';

export interface Block {
  op: Op;
  /** Только для 'wait': сколько шагов стоять. */
  n?: number;
}

/**
 * Что делает робот прямо сейчас (для цвета, анимации и телеметрии):
 *  idle  — ещё не запущен или ждёт своей задержки старта;
 *  move  — идёт пустой;  carry — идёт с предметом;
 *  act   — взял или положил;
 *  wait  — блок ЖДАТЬ;  sense — ДАТЧИК ждёт готовности;
 *  miss  — промах: взять/положить не получилось.
 */
export type RobotState = 'idle' | 'move' | 'carry' | 'act' | 'wait' | 'sense' | 'miss';

// ───────────────────────── Данные (роль C) ─────────────────────────

/** Описание типа машины. Файл src/data/machines.json — массив MachineDef. */
export interface MachineDef {
  type: MachineType;
  kind: MachineKind;
  /** Цена покупки в энергии (для машин из LevelData.buildable). */
  cost?: number;

  // processor
  /** Что нужно на один цикл, например { "plate": 1, "fuel": 1 }. */
  inputs?: Partial<Record<ItemType, number>>;
  /** Что выдаёт processor или source. */
  output?: ItemType;
  /** Секунд на один цикл. */
  workTime?: number;
  /** Если задано — время цикла случайное в этом диапазоне, секунды [от, до]. */
  workTimeRange?: [number, number];

  // source
  /** Секунд на один новый предмет. */
  produceEvery?: number;

  // source, storage
  /** Сколько предметов помещается. */
  capacity?: number;
}

export interface LevelMachine {
  type: MachineType;
  x: number;
  y: number;
}

export interface LevelDock {
  x: number;
  y: number;
  /** Куда смотрит робот в начале каждого круга. По умолчанию 2 (вниз). */
  dir?: Dir;
}

/** Уровень. Файлы src/data/levels/*.json. */
export interface LevelData {
  id: string;
  /** Ключ названия в strings/ru.json. */
  titleKey: string;
  /** Размер поля в клетках, максимум 16 × 9. */
  width: number;
  height: number;
  /** Секунд до старта ракеты. 0 — бесконечный режим (тогда нужен endless). */
  timeLimit: number;
  /** Сколько предметов targetItem нужно доставить на стартовый стол. */
  target: number;
  targetItem: ItemType;

  /** Бюджет энергии на уровень. */
  energy: number;
  /** Цена одного робота. */
  robotCost: number;
  /** Доплата за робота, в программе которого есть хотя бы один ДАТЧИК. */
  sensorCost: number;
  /** Максимум блоков в программе (ЖДАТЬ ×N считается одним блоком). */
  maxProgram: number;
  /** Какие блоки разрешены. На первых уровнях без 'sense'. */
  allowedOps: Op[];
  /** Какие машины игрок может докупить. */
  buildable: MachineType[];

  machines: LevelMachine[];
  /** Клетки, с которых начинают и где замыкают петлю роботы. */
  docks: LevelDock[];
  walls?: [number, number][];

  /** Звезда «экономия»: потратить энергии не больше этого. */
  starEnergy?: number;
  /** Звезда «скорость»: закончить, когда до старта осталось не меньше стольких секунд. */
  starTimeLeft?: number;

  /** Бесконечный режим: ракета уходит каждые launchEvery секунд, заказ растёт на growBy. */
  endless?: {
    launchEvery: number;
    growBy: number;
    /** Сколько энергии даёт каждый успешный запуск. */
    energyPerLaunch?: number;
  };

  /** Поправки к machines.json только для этого уровня, например случайное время пресса. */
  defOverrides?: Partial<Record<MachineType, Partial<Omit<MachineDef, 'type' | 'kind'>>>>;

  /** Ключи подсказок обучения по шагам (их показывает роль B). */
  tutorial?: string[];
  /** Зерно генератора случайных чисел — чтобы уровень каждый раз шёл одинаково. */
  seed: number;
}

// ───────────────────────── Снимок состояния (для роли B) ─────────────────────────

/** Кусок последнего круга робота: в каком состоянии он был с тика from по тик to (от начала круга). */
export interface TimelineSegment {
  state: RobotState;
  from: number;
  to: number;
}

export interface RobotView {
  id: number;
  /** Индекс дока в LevelData.docks. */
  dock: number;
  /** Индекс цвета в ROBOT_COLORS. */
  colorIndex: number;

  /** Позиция в клетках на текущем тике (дробная во время шага). */
  x: number;
  y: number;
  /** Позиция на прошлом тике. Рисовать: px + (x - px) * snapshot.alpha. */
  px: number;
  py: number;
  dir: Dir;
  carrying: ItemType | null;
  state: RobotState;

  /** Индекс блока, который выполняется сейчас (-1, если робот ещё не начал). */
  pc: number;
  program: readonly Block[];
  /** Новая программа, которая вступит в силу с начала следующего круга. */
  pendingProgram: readonly Block[] | null;
  /** Клетки петли по порядку; первая и последняя — док. Для светящейся линии на карте. */
  path: readonly (readonly [number, number])[];
  hasSensor: boolean;

  /** Длительность последнего полного круга, секунды (0, пока круга не было). */
  cycleTime: number;
  /** Доля последнего круга без ожиданий и промахов, 0..1. */
  usefulShare: number;
  /** Промахов за последний полный круг. */
  cycleMisses: number;
  /** Последний полный круг по состояниям — для полосы телеметрии. */
  timeline: readonly TimelineSegment[];
}

export interface MachineView {
  id: number;
  type: MachineType;
  kind: MachineKind;
  x: number;
  y: number;
  state: MachineState;
  /** 0..1: прогресс цикла (processor) или до следующего предмета (source). */
  progress: number;
  /** processor — что лежит на входе; storage — содержимое по порядку. */
  input: readonly ItemType[];
  /** Что можно забрать прямо сейчас. */
  output: ItemType | null;
  /** source/storage — сколько предметов внутри; sink — сколько принято. */
  stock: number;
  capacity: number;
  /** Доля времени в работе за последние 30 секунд, 0..1. */
  utilization: number;
  /** Куплена игроком (её можно продать). */
  bought: boolean;
}

/** Игрок в режиме репетиции. */
export interface OperatorView {
  x: number;
  y: number;
  /** Клетка до последнего шага — чтобы плавно сдвинуть спрайт. */
  px: number;
  py: number;
  dir: Dir;
  carrying: ItemType | null;
  /** Док, с которого начата запись. */
  dock: number;
  /** Сколько блоков уже записано. */
  blocks: number;
}

/**
 * Почему линия не успевает. Подсказку игроку показывает роль B по ключу `bottleneck.<reason>`:
 *  saturated — машина занята почти всё время: нужна вторая;
 *  blocked   — готовое некуда выгружать: забирать нужно чаще;
 *  misses    — робот промахивается: выровнять такт или поставить ДАТЧИК;
 *  slowLoop  — у робота самый длинный круг: сократить путь или добавить копию.
 */
export type BottleneckReason = 'saturated' | 'blocked' | 'misses' | 'slowLoop';

export interface Bottleneck {
  kind: 'robot' | 'machine';
  id: number;
  reason: BottleneckReason;
}

/**
 * Режим симуляции:
 *  plan    — уровень загружен, отсчёт не запущен: можно учить роботов и покупать машины;
 *  teach   — репетиция: игрок показывает работу в КОПИИ мира, настоящий мир на паузе;
 *  running — отсчёт идёт, роботы работают;
 *  won / lost — конец уровня.
 */
export type SimMode = 'plan' | 'teach' | 'running' | 'won' | 'lost';

export interface SimSnapshot {
  levelId: string;
  mode: SimMode;
  tick: number;
  /** 0..1 — насколько мы между тиками; для плавной отрисовки. */
  alpha: number;

  /** Секунд до старта ракеты (в endless — до ближайшего запуска). */
  timeLeft: number;
  timeLimit: number;
  /** Доставлено и нужно (в endless — по текущему заказу). */
  delivered: number;
  target: number;
  targetItem: ItemType;

  energy: number;
  energyLeft: number;
  /** Сколько стоит ещё один робот. */
  robotCost: number;
  /** Промахов с начала уровня. */
  misses: number;

  machines: MachineView[];
  robots: RobotView[];

  /** Только в режиме teach. */
  operator: OperatorView | null;
  /** Что уже записано в репетиции. */
  recording: readonly Block[];
  canFinishTeach: boolean;

  /** Сколько целевых предметов в минуту линия выдаёт сейчас (за последние 30 с). */
  throughput: number;
  /** Сколько в минуту нужно, чтобы успеть. */
  requiredRate: number;
  /** Что тормозит линию. null — линия успевает или данных пока мало. */
  bottleneck: Bottleneck | null;

  /** Итог (имеет смысл в режиме won): 1 + «экономия» + «скорость». */
  stars: 0 | 1 | 2 | 3;
  starEnergyOk: boolean;
  starTimeOk: boolean;
  /** Успешных запусков (endless). */
  launches: number;
}

// ───────────────────────── События (для звуков и эффектов) ─────────────────────────

export type SimEventType =
  | 'step' // робот перешёл на клетку
  | 'took' // взял предмет
  | 'put' // положил предмет
  | 'miss' // промах
  | 'sensed' // датчик дождался готовности
  | 'produced' // машина выдала предмет
  | 'delivered' // предмет принят на стартовом столе; value = сколько доставлено
  | 'cycle' // робот замкнул круг; value = длительность круга в тиках
  | 'deployed' // робот создан
  | 'removed' // робот убран
  | 'bought' // машина куплена
  | 'sold' // машина продана
  | 'launch' // ракета стартовала; value = номер запуска
  | 'won' // уровень пройден; value = звёзды
  | 'lost'; // время вышло

/** Плоское событие: все поля есть всегда, ненужные равны -1 / null. */
export interface SimEvent {
  type: SimEventType;
  /** Клетка события или -1. */
  x: number;
  y: number;
  /** OPERATOR_ID, если действовал игрок в репетиции. */
  robotId: number | null;
  machineId: number | null;
  item: ItemType | null;
  value: number;
}

// ───────────────────────── Ответы методов ─────────────────────────

/** Почему действие не выполнено. Роль B показывает текст по ключу `fail.<reason>`. */
export type FailReason =
  | 'badMode' // в этом режиме так нельзя
  | 'badDock' // нет такого дока
  | 'noRobot' // нет такого робота
  | 'noMachine' // нет машины (перед оператором или по id)
  | 'noEnergy' // не хватает энергии
  | 'empty' // пустая программа
  | 'tooLong' // блоков больше, чем LevelData.maxProgram
  | 'opNotAllowed' // блок запрещён на этом уровне
  | 'badBlock' // некорректный блок (например, wait с n < 1)
  | 'notClosed' // петля не возвращается на док
  | 'senseNeedsAction' // сразу после ДАТЧИКА должен идти ВЗЯТЬ или ПОЛОЖИТЬ
  | 'outOfBounds' // клетка за пределами поля
  | 'occupied' // клетка занята стеной, машиной или доком
  | 'onPath' // по этой клетке ходит робот
  | 'notBuildable' // эту машину нельзя купить на уровне
  | 'notBought' // продавать можно только купленные машины
  | 'bump' // упёрся в препятствие и уже смотрит на него — шаг не записан
  | 'nothingToTake' // машина пока ничего не выдаёт
  | 'cannotPut'; // машина сейчас не принимает этот предмет

/** id — робот или машина, которых касалось действие (-1, если не применимо). */
export type Result = { ok: true; id: number } | { ok: false; reason: FailReason };

/** Проверка программы: при успехе — клетки петли и длина круга в шагах. */
export type ProgramCheck =
  | { ok: true; path: [number, number][]; steps: number }
  | { ok: false; reason: FailReason; at: number };

/** Ввод игрока в репетиции. 'act' сам превращается в take или put. */
export type TeachInput = MoveOp | 'act' | 'wait';

export interface TeachResult {
  ok: boolean;
  reason?: FailReason;
  /** Что произошло в копии мира за этот шаг (для звуков). */
  events: readonly SimEvent[];
}

// ───────────────────────── Интерфейс симуляции ─────────────────────────

export interface ISimulation {
  /** Загрузить уровень. Бросает LevelError с понятным текстом, если данные некорректны. */
  loadLevel(level: LevelData, defs: MachineDef[]): void;
  getLevel(): LevelData;

  // ── Репетиция: настоящий мир на паузе, игрок действует в его копии ──
  /** Начать показ с дока. replaceRobotId — перезаписать существующего робота. */
  beginTeach(dock: number, replaceRobotId?: number): Result;
  /** Один шаг игрока. Неудачное действие не записывается и не тратит время. */
  teachInput(input: TeachInput): TeachResult;
  /** true, когда игрок вернулся на док и запись не пустая. */
  canFinishTeach(): boolean;
  /** Создать робота с записанной программой. id — новый робот. */
  finishTeach(): Result;
  cancelTeach(): void;

  // ── Программы и роботы ──
  /** Проверить программу, ничего не меняя (для предпросмотра правки). */
  checkProgram(robotId: number, program: Block[]): ProgramCheck;
  /** Заменить программу. Вступает в силу с начала следующего круга робота. */
  setProgram(robotId: number, program: Block[]): ProgramCheck;
  /** Копия робота на том же доке. delaySteps — на сколько шагов позже она стартует. */
  copyRobot(robotId: number, delaySteps?: number): Result;
  /** Убрать робота; энергия возвращается. */
  removeRobot(robotId: number): Result;

  // ── Покупки ──
  canBuy(type: MachineType, x: number, y: number): Result;
  buy(type: MachineType, x: number, y: number): Result;
  /** Продать купленную машину; энергия возвращается. */
  sell(machineId: number): Result;

  // ── Время ──
  /** Запустить отсчёт (plan → running). */
  start(): void;
  /** Продвинуть мир. dtSeconds уже умножен на скорость ×1/×2/×4. Возвращает события за это время. */
  step(dtSeconds: number): readonly SimEvent[];
  snapshot(): SimSnapshot;

  // ── Сохранение ──
  serialize(): string;
  deserialize(json: string): void;
}
