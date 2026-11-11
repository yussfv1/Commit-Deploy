/**
 * Отладочная песочница симуляции: вся механика на голом <canvas>, без Phaser.
 *
 * Зачем она нужна:
 *  - роль A проверяет симуляцию глазами и руками, а не только тестами;
 *  - роль C пробует уровни и баланс, пока настоящий экран игры не готов;
 *  - роль B видит рабочий образец того, как водить ISimulation: цикл step → snapshot → рисуем,
 *    ввод в репетиции, правка программ, покупки.
 *
 * Страница debug.html не входит в сборку (vite собирает только index.html).
 */
import {
  DIR_DX,
  DIR_DY,
  ROBOT_COLORS,
  type Block,
  type BottleneckReason,
  type FailReason,
  type ItemType,
  type MachineState,
  type MachineType,
  type MachineView,
  type RobotState,
  type RobotView,
  type SimEvent,
  type SimMode,
  type SimSnapshot,
  type TeachInput,
} from '../../types';
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../examples';
import { isActionOp } from '../program';
import { Simulation } from '../simulation';

// ───────────────────────── Словари ─────────────────────────

const FAIL: Record<FailReason, string> = {
  badMode: 'Сейчас так нельзя',
  badDock: 'Нет такого дока',
  noRobot: 'Нет такого робота',
  noMachine: 'Перед тобой нет машины',
  noEnergy: 'Не хватает энергии',
  empty: 'Программа пуста',
  tooLong: 'Программа слишком длинная',
  opNotAllowed: 'Этот блок на уровне запрещён',
  badBlock: 'Некорректный блок',
  notClosed: 'Петля не замкнута: робот должен вернуться на док',
  senseNeedsAction: 'После ДАТЧИКА должен идти ВЗЯТЬ или ПОЛОЖИТЬ',
  outOfBounds: 'За пределами поля',
  occupied: 'Клетка занята',
  onPath: 'По этой клетке ходит робот',
  notBuildable: 'Эту машину купить нельзя',
  notBought: 'Продать можно только купленную машину',
  bump: 'Дальше хода нет',
  nothingToTake: 'Пока нечего брать — подожди (Пробел)',
  cannotPut: 'Сюда сейчас положить нельзя',
};

const BOTTLENECK: Record<BottleneckReason, string> = {
  saturated: 'занята почти всё время — нужна вторая',
  blocked: 'готовое не успевают забирать',
  misses: 'промахивается — выровняй такт или поставь ДАТЧИК',
  slowLoop: 'самый длинный круг — сократи путь или добавь копию',
};

const MACHINE_NAME: Record<MachineType, string> = {
  depot: 'РУДА',
  tank: 'ТОПЛИВО',
  press: 'ПРЕСС',
  assembler: 'СБОРКА',
  pad: 'СТАРТ',
  shelf: 'ПОЛКА',
};
const ITEM_NAME: Record<ItemType, string> = { ore: 'руда', plate: 'пластины', fuel: 'топливо', cell: 'ячейки' };
const ITEM_LETTER: Record<ItemType, string> = { ore: 'Р', plate: 'П', fuel: 'Т', cell: 'Я' };
const ITEM_COLOR: Record<ItemType, string> = { ore: '#c98a5a', plate: '#b8c4d6', fuel: '#ff7a2f', cell: '#7cf07a' };
const LAMP: Record<MachineState, string> = { idle: '#5b6b85', working: '#7cf07a', ready: '#ffd23f', full: '#3ec1ff' };
const STATE_COLOR: Record<RobotState, string> = {
  idle: '#3a4b68',
  move: '#5b7bb0',
  carry: '#7cf07a',
  act: '#ffffff',
  wait: '#8a6d1f',
  sense: '#ffe066',
  miss: '#ff3b3b',
};
const LEVEL_TITLE = ['1 · Первый урок', '2 · Пресс', '3 · Слепой робот', '4 · Такт', '5 · Окно запуска'];
const HINT: Record<SimMode, string> = {
  plan: 'Нажми на док (пунктирный круг) и покажи роботу работу. Потом — <kbd>СТАРТ</kbd>.',
  teach:
    '<kbd>стрелки</kbd> или <kbd>WASD</kbd> — шаг · <kbd>E</kbd> — взять / положить · <kbd>Пробел</kbd> — подождать · ' +
    '<kbd>Enter</kbd> — готово (когда вернулся на док) · <kbd>Esc</kbd> — отмена',
  running:
    'Линия работает сама. Нажми на док, чтобы показать ещё одного робота, или правь программы справа. ' +
    '<kbd>Пробел</kbd> — пауза, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> — скорость.',
  won: 'План выполнен — ракета стартовала. Нажми «Заново» или выбери другой уровень.',
  lost: 'Не успели. Нажми «Заново» и попробуй другую расстановку.',
};
const TEACH_KEYS: Record<string, TeachInput> = {
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

// ───────────────────────── Состояние страницы ─────────────────────────

/** Размер клетки в песочнице, px. */
const T = 56;
const TAU = Math.PI * 2;

function el<E extends HTMLElement>(id: string): E {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Нет элемента #${id}`);
  return found as E;
}

const sim = new Simulation();
const canvas = el<HTMLCanvasElement>('view');
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let paused = false;
let speed = 1;
/** Выбранный робот и выбранный блок его программы. */
let selected: number | null = null;
let pick = -1;
let buyType: MachineType | null = null;
let saved: string | null = null;
let toastTimer = 0;
let shownMode: SimMode | null = null;
/** По этой строке понятно, пора ли перестраивать список роботов справа. */
let sideKey = '';
const logLines: string[] = [];

interface Card {
  blocks: HTMLElement[];
  stats: HTMLElement;
  bar: HTMLElement;
  timeline: RobotView['timeline'] | null;
}
const cards = new Map<number, Card>();

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
const robotColor = (r: RobotView): string => cssColor(ROBOT_COLORS[r.colorIndex]);
const mid = (cell: number): number => cell * T + T / 2;

function toast(text: string): void {
  const box = el('toast');
  box.textContent = text;
  box.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box.classList.remove('show'), 1500);
}

function blockLabel(block: Block): string {
  switch (block.op) {
    case 'up':
      return '↑';
    case 'right':
      return '→';
    case 'down':
      return '↓';
    case 'left':
      return '←';
    case 'take':
      return 'ВЗЯТЬ';
    case 'put':
      return 'ПОЛОЖИТЬ';
    case 'wait':
      return `ЖДАТЬ×${block.n ?? 1}`;
    case 'sense':
      return 'ДАТЧИК';
  }
}

// ───────────────────────── Уровень ─────────────────────────

function loadLevel(index: number): void {
  sim.loadLevel(EXAMPLE_LEVELS[index], EXAMPLE_DEFS);
  selected = null;
  pick = -1;
  buyType = null;
  paused = false;
  sideKey = '';
  logLines.length = 0;

  const level = sim.getLevel();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = level.width * T * dpr;
  canvas.height = level.height * T * dpr;
  canvas.style.width = `${level.width * T}px`;
  canvas.style.height = `${level.height * T}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Кнопки покупки — только то, что разрешено на уровне.
  const shop = el('shop');
  shop.replaceChildren();
  for (const type of level.buildable) {
    const cost = EXAMPLE_DEFS.find((d) => d.type === type)?.cost ?? 0;
    const button = document.createElement('button');
    button.textContent = `Купить: ${MACHINE_NAME[type]} (${cost})`;
    button.dataset.buy = type;
    button.addEventListener('click', () => {
      buyType = buyType === type ? null : type;
    });
    shop.append(button);
  }
  if (level.buildable.length === 0) shop.textContent = 'Покупок на уровне нет';
}

// ───────────────────────── Правка программ ─────────────────────────

/** Применить правку к программе робота. Симуляция сама проверит её и скажет, если так нельзя. */
function edit(robot: RobotView, change: (program: Block[]) => Block[]): void {
  const base = (robot.pendingProgram ?? robot.program).map((b) => ({ ...b }));
  const result = sim.setProgram(robot.id, change(base));
  if (!result.ok) toast(FAIL[result.reason]);
  pick = -1;
  sideKey = '';
}

function deleteBlock(program: Block[], index: number): Block[] {
  // Удаляя ВЗЯТЬ/ПОЛОЖИТЬ, убираем и ДАТЧИК перед ним: сам по себе датчик не имеет смысла.
  const withSensor = isActionOp(program[index].op) && index > 0 && program[index - 1].op === 'sense';
  return program.filter((_, i) => i !== index && !(withSensor && i === index - 1));
}

function toggleSensor(program: Block[], index: number): Block[] {
  const block = program[index];
  if (block.op === 'sense') return program.filter((_, i) => i !== index);
  if (!isActionOp(block.op)) return program;
  if (index > 0 && program[index - 1].op === 'sense') return program.filter((_, i) => i !== index - 1);
  return [...program.slice(0, index), { op: 'sense' }, ...program.slice(index)];
}

function changeWait(program: Block[], index: number, delta: number): Block[] {
  const block = program[index];
  if (block.op !== 'wait') {
    // На обычном блоке «+» вставляет новое ожидание после него.
    return delta > 0 ? [...program.slice(0, index + 1), { op: 'wait', n: 1 }, ...program.slice(index + 1)] : program;
  }
  const n = (block.n ?? 1) + delta;
  if (n < 1) return program.filter((_, i) => i !== index);
  return program.map((b, i) => (i === index ? { op: 'wait', n } : b));
}

function sensorsEverywhere(program: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of program) {
    if (block.op === 'sense') continue;
    if (isActionOp(block.op)) out.push({ op: 'sense' });
    out.push(block);
  }
  return out;
}

// ───────────────────────── Список роботов справа ─────────────────────────

function tool(label: string, title: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    action();
    button.blur();
  });
  return button;
}

function buildSide(snap: SimSnapshot): void {
  const side = el('side');
  side.replaceChildren();
  cards.clear();

  if (snap.mode === 'teach') {
    const box = document.createElement('div');
    box.className = 'robot';
    box.style.setProperty('--c', '#3ec1ff');
    const head = document.createElement('div');
    head.className = 'head';
    head.innerHTML = `<strong>Запись показа</strong><span>блоков: ${snap.recording.length} из ${sim.getLevel().maxProgram}</span>`;
    const blocks = document.createElement('div');
    blocks.className = 'blocks';
    for (const block of snap.recording) {
      const chip = document.createElement('span');
      chip.className = 'blk';
      chip.textContent = blockLabel(block);
      blocks.append(chip);
    }
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = snap.canFinishTeach
      ? 'Ты на доке — петля замкнута. Enter — готово.'
      : 'Вернись на док, чтобы замкнуть петлю.';
    box.append(head, blocks, note);
    side.append(box);
    return;
  }

  if (snap.robots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Роботов пока нет. Нажми на док на карте и покажи работу.';
    side.append(empty);
    return;
  }

  for (const robot of snap.robots) {
    const isSelected = robot.id === selected;
    const root = document.createElement('div');
    root.className = isSelected ? 'robot sel' : 'robot';
    root.style.setProperty('--c', robotColor(robot));
    root.addEventListener('click', () => {
      selected = robot.id;
      pick = -1;
      sideKey = '';
    });

    const head = document.createElement('div');
    head.className = 'head';
    const name = document.createElement('strong');
    name.textContent = `Робот ${robot.id}${robot.hasSensor ? ' · с датчиком' : ''}`;
    const stats = document.createElement('span');
    head.append(name, stats);

    const shown = robot.pendingProgram ?? robot.program;
    const blocks = document.createElement('div');
    blocks.className = 'blocks';
    const chips = shown.map((block, i) => {
      const chip = document.createElement('span');
      chip.className = block.op === 'sense' ? 'blk sense' : 'blk';
      if (isSelected && i === pick) chip.classList.add('pick');
      chip.textContent = blockLabel(block);
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        selected = robot.id;
        pick = i;
        sideKey = '';
      });
      blocks.append(chip);
      return chip;
    });

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.title = 'Последний круг: синий — идёт, зелёный — несёт, белый — действует, тёмно-жёлтый — ждёт, жёлтый — датчик, красный — промах';

    root.append(head, blocks, bar);

    if (robot.pendingProgram !== null) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Правка вступит в силу со следующего круга.';
      root.append(note);
    }

    if (isSelected) {
      const tools = document.createElement('div');
      tools.className = 'tools';
      const hasPick = pick >= 0 && pick < shown.length;
      const steps = sim.checkProgram(robot.id, shown.map((b) => ({ ...b })));
      const half = steps.ok ? Math.max(1, Math.round(steps.steps / 2)) : 1;
      tools.append(
        tool('Удалить блок', 'Убрать выбранный блок', () => hasPick && edit(robot, (p) => deleteBlock(p, pick))),
        tool('Датчик', 'Поставить или снять ДАТЧИК перед выбранным ВЗЯТЬ / ПОЛОЖИТЬ', () =>
          hasPick ? edit(robot, (p) => toggleSensor(p, pick)) : toast('Сначала выбери блок ВЗЯТЬ или ПОЛОЖИТЬ'),
        ),
        tool('Ждать +', 'Увеличить ожидание или вставить его после выбранного блока', () =>
          hasPick ? edit(robot, (p) => changeWait(p, pick, 1)) : toast('Сначала выбери блок'),
        ),
        tool('Ждать −', 'Уменьшить выбранное ожидание', () => hasPick && edit(robot, (p) => changeWait(p, pick, -1))),
        tool('Датчики везде', 'ДАТЧИК перед каждым ВЗЯТЬ и ПОЛОЖИТЬ', () => edit(robot, sensorsEverywhere)),
        tool('Без датчиков', 'Убрать все датчики', () => edit(robot, (p) => p.filter((b) => b.op !== 'sense'))),
        tool(`Копия (+${half} шаг.)`, 'Ещё один робот по той же петле со сдвигом на полкруга', () => {
          const result = sim.copyRobot(robot.id, half);
          if (!result.ok) toast(FAIL[result.reason]);
        }),
        tool('Перезаписать', 'Показать работу заново вместо этого робота', () => {
          const result = sim.beginTeach(robot.dock, robot.id);
          if (!result.ok) toast(FAIL[result.reason]);
        }),
        tool('Убрать', 'Убрать робота и вернуть энергию', () => {
          sim.removeRobot(robot.id);
          selected = null;
        }),
      );
      root.append(tools);
    }

    side.append(root);
    cards.set(robot.id, { blocks: chips, stats, bar, timeline: null });
  }
}

/** Обновить то, что меняется каждый кадр, не перестраивая список (иначе клики по блокам терялись бы). */
function refreshSide(snap: SimSnapshot): void {
  for (const robot of snap.robots) {
    const card = cards.get(robot.id);
    if (card === undefined) continue;
    card.blocks.forEach((chip, i) => chip.classList.toggle('now', robot.pendingProgram === null && i === robot.pc));
    card.stats.textContent =
      robot.cycleTime > 0
        ? `круг ${robot.cycleTime.toFixed(2)} с · полезно ${Math.round(robot.usefulShare * 100)}% · промахов ${robot.cycleMisses}`
        : 'первый круг ещё идёт';
    if (card.timeline !== robot.timeline) {
      card.timeline = robot.timeline;
      card.bar.replaceChildren();
      for (const segment of robot.timeline) {
        const part = document.createElement('span');
        part.style.flex = String(segment.to - segment.from);
        part.style.background = STATE_COLOR[segment.state];
        card.bar.append(part);
      }
    }
  }
}

// ───────────────────────── Рисование ─────────────────────────

function drawItem(item: ItemType, x: number, y: number, size: number): void {
  ctx.fillStyle = ITEM_COLOR[item];
  ctx.beginPath();
  ctx.roundRect(x - size / 2, y - size / 2, size, size, 3);
  ctx.fill();
  ctx.fillStyle = '#0b1422';
  ctx.font = `700 ${Math.round(size * 0.7)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ITEM_LETTER[item], x, y + 1);
}

function drawMachine(m: MachineView, highlighted: boolean, pulse: number): void {
  const x = m.x * T;
  const y = m.y * T;
  ctx.fillStyle = '#24395a';
  ctx.strokeStyle = m.bought ? '#ff7a2f' : '#3a5484';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, T - 8, T - 8, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e7edf6';
  ctx.font = '700 9px Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(MACHINE_NAME[m.type], x + 9, y + 9);

  // Лампочка состояния
  ctx.fillStyle = LAMP[m.state];
  ctx.beginPath();
  ctx.arc(x + T - 12, y + 13, 4, 0, TAU);
  ctx.fill();

  // Содержимое: слева — что лежит на входе, справа — что можно забрать
  m.input.slice(0, 3).forEach((item, i) => drawItem(item, x + 15 + i * 9, y + T / 2 + 4, 12));
  if (m.output !== null) drawItem(m.output, x + T - 17, y + T / 2 + 4, 16);
  if (m.kind === 'source' || m.kind === 'storage' || m.kind === 'sink') {
    ctx.fillStyle = '#93a4c0';
    ctx.font = '600 10px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(m.kind === 'sink' ? `принято ${m.stock}` : `${m.stock}/${m.capacity}`, x + 9, y + T - 12);
  }

  // Полоска прогресса
  if (m.kind === 'processor' || m.kind === 'source') {
    ctx.fillStyle = '#0b1422';
    ctx.fillRect(x + 8, y + T - 10, T - 16, 3);
    ctx.fillStyle = LAMP.working;
    ctx.fillRect(x + 8, y + T - 10, (T - 16) * m.progress, 3);
  }

  if (highlighted) {
    ctx.strokeStyle = `rgba(255, 59, 59, ${0.4 + 0.6 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, T - 3, T - 3, 9);
    ctx.stroke();
  }
}

function drawPath(robot: RobotView): void {
  if (robot.path.length < 2) return;
  const shift = (robot.colorIndex - 3.5) * 1.6; // чтобы петли на одних клетках не сливались
  ctx.strokeStyle = robotColor(robot);
  ctx.globalAlpha = robot.id === selected ? 0.95 : 0.45;
  ctx.lineWidth = robot.id === selected ? 5 : 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  robot.path.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(mid(x) + shift, mid(y) + shift);
    else ctx.lineTo(mid(x) + shift, mid(y) + shift);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawActor(
  x: number,
  y: number,
  dir: 0 | 1 | 2 | 3,
  fill: string,
  ring: string,
  ringWidth: number,
  carrying: ItemType | null,
  label: string,
): void {
  const cx = mid(x);
  const cy = mid(y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = ring;
  ctx.lineWidth = ringWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, T * 0.27, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // «Глаз» показывает, куда смотрит: взять и положить действуют на машину в этой стороне.
  ctx.fillStyle = '#0b1422';
  ctx.beginPath();
  ctx.arc(cx + DIR_DX[dir] * T * 0.16, cy + DIR_DY[dir] * T * 0.16, 3.5, 0, TAU);
  ctx.fill();
  ctx.font = '700 9px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx - DIR_DX[dir] * T * 0.08, cy - DIR_DY[dir] * T * 0.08 + 0.5);
  if (carrying !== null) drawItem(carrying, cx + T * 0.24, cy - T * 0.24, 15);
}

function draw(snap: SimSnapshot, now: number): void {
  const level = sim.getLevel();
  const w = level.width * T;
  const h = level.height * T;
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);

  ctx.fillStyle = '#0f1b2d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1c2c44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < level.width; x++) {
    ctx.moveTo(x * T + 0.5, 0);
    ctx.lineTo(x * T + 0.5, h);
  }
  for (let y = 1; y < level.height; y++) {
    ctx.moveTo(0, y * T + 0.5);
    ctx.lineTo(w, y * T + 0.5);
  }
  ctx.stroke();

  ctx.fillStyle = '#2b3a55';
  for (const [x, y] of level.walls ?? []) ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#6f84a8';
  ctx.lineWidth = 2;
  for (const dock of level.docks) {
    ctx.beginPath();
    ctx.arc(mid(dock.x), mid(dock.y), T * 0.38, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const robot of snap.robots) drawPath(robot);

  const hot = snap.bottleneck;
  for (const machine of snap.machines) {
    drawMachine(machine, hot !== null && hot.kind === 'machine' && hot.id === machine.id, pulse);
  }

  for (const robot of snap.robots) {
    // Плавность: между тиками рисуем робота между прошлой и текущей позицией.
    const x = robot.px + (robot.x - robot.px) * snap.alpha;
    const y = robot.py + (robot.y - robot.py) * snap.alpha;
    const isHot = hot !== null && hot.kind === 'robot' && hot.id === robot.id;
    const ring = robot.state === 'miss' ? '#ff3b3b' : robot.state === 'sense' ? '#ffe066' : isHot ? '#ff3b3b' : '#0b1422';
    const width = robot.state === 'miss' || robot.state === 'sense' ? 4 : isHot ? 2 + 2 * pulse : 2;
    ctx.globalAlpha = robot.state === 'idle' ? 0.55 : 1;
    drawActor(x, y, robot.dir, robotColor(robot), ring, width, robot.carrying, String(robot.id));
    ctx.globalAlpha = 1;
  }

  if (snap.operator !== null) {
    const o = snap.operator;
    drawActor(o.x, o.y, o.dir, '#ffffff', '#3ec1ff', 3, o.carrying, 'ТЫ');
  }

  if (snap.mode === 'teach') {
    ctx.fillStyle = 'rgba(62, 193, 255, 0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3ec1ff';
    ctx.font = '700 12px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('РЕЖИМ ОБУЧЕНИЯ — настоящий мир на паузе', 10, h - 20);
  }
}

// ───────────────────────── Панель сверху и журнал ─────────────────────────

function clock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function refreshHud(snap: SimSnapshot): void {
  const endless = sim.getLevel().endless !== undefined;
  const parts = [
    `<span><b>T−${clock(snap.timeLeft)}</b>${endless ? ' до запуска' : ''}</span>`,
    `<span>План: <b>${snap.delivered}/${snap.target}</b> ${ITEM_NAME[snap.targetItem]}</span>`,
    `<span>Энергия: <b>${snap.energyLeft}</b> из ${snap.energy} (робот — ${snap.robotCost})</span>`,
    `<span>Промахи: ${snap.misses}</span>`,
    `<span>Темп ${snap.throughput.toFixed(1)} / нужно ${snap.requiredRate.toFixed(1)} в минуту</span>`,
  ];
  if (endless) parts.push(`<span>Запусков: ${snap.launches}</span>`);
  if (snap.mode === 'won') parts.push(`<span><b>${'★'.repeat(snap.stars)}${'☆'.repeat(3 - snap.stars)}</b></span>`);
  if (snap.bottleneck !== null) {
    const who = snap.bottleneck.kind === 'robot' ? `робот ${snap.bottleneck.id}` : 'машина в красной рамке';
    parts.push(`<span>Узкое место: ${who} — ${BOTTLENECK[snap.bottleneck.reason]}</span>`);
  }
  el('hud').innerHTML = parts.join('');

  el<HTMLButtonElement>('start').disabled = snap.mode !== 'plan';
  el('pause').classList.toggle('on', paused);
  for (const [id, value] of [['s1', 1], ['s2', 2], ['s4', 4]] as const) el(id).classList.toggle('on', speed === value);
  for (const button of el('shop').querySelectorAll('button')) {
    button.classList.toggle('on', button.dataset.buy === buyType);
  }
  if (shownMode !== snap.mode) {
    shownMode = snap.mode;
    el('hint').innerHTML = HINT[snap.mode];
  }
}

function report(events: readonly SimEvent[]): void {
  for (const event of events) {
    let line: string | null = null;
    if (event.type === 'miss') line = `робот ${event.robotId}: промах`;
    else if (event.type === 'delivered') line = `доставлено ${event.value}`;
    else if (event.type === 'launch') line = `ракета стартовала (№${event.value})`;
    else if (event.type === 'won') line = `план выполнен, звёзд: ${event.value}`;
    else if (event.type === 'lost') line = 'время вышло — старт отменён';
    else if (event.type === 'deployed') line = `робот ${event.robotId} готов к работе`;
    else if (event.type === 'bought') line = 'машина куплена';
    else if (event.type === 'sold') line = 'машина продана';
    if (line !== null) logLines.push(line);
  }
  while (logLines.length > 7) logLines.shift();
  el('log').textContent = logLines.length > 0 ? `Журнал: ${logLines.join(' · ')}` : 'Журнал событий пуст.';
}

// ───────────────────────── Управление ─────────────────────────

function cellOf(event: MouseEvent): [number, number] {
  return [Math.floor(event.offsetX / T), Math.floor(event.offsetY / T)];
}

canvas.addEventListener('click', (event) => {
  if (sim.snapshot().mode === 'teach') return;
  const [x, y] = cellOf(event);
  if (buyType !== null) {
    const result = sim.buy(buyType, x, y);
    if (!result.ok) toast(FAIL[result.reason]);
    return;
  }
  const dock = sim.getLevel().docks.findIndex((d) => d.x === x && d.y === y);
  if (dock >= 0) {
    const result = sim.beginTeach(dock);
    if (!result.ok) toast(FAIL[result.reason]);
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const [x, y] = cellOf(event);
  const machine = sim.snapshot().machines.find((m) => m.x === x && m.y === y);
  if (machine === undefined) return;
  const result = sim.sell(machine.id);
  if (!result.ok) toast(FAIL[result.reason]);
});

window.addEventListener('keydown', (event) => {
  if (sim.snapshot().mode === 'teach') {
    if (event.code === 'Enter') {
      const result = sim.finishTeach();
      if (result.ok) selected = result.id;
      else toast(FAIL[result.reason]);
    } else if (event.code === 'Escape') {
      sim.cancelTeach();
    } else {
      const input = TEACH_KEYS[event.code];
      if (input === undefined) return;
      const result = sim.teachInput(input);
      if (!result.ok && result.reason !== undefined) toast(FAIL[result.reason]);
      report(result.events);
    }
    event.preventDefault();
    return;
  }
  if (event.code === 'Space') {
    paused = !paused;
    event.preventDefault();
  } else if (event.code === 'Escape') {
    buyType = null;
  } else if (event.code === 'Digit1') {
    speed = 1;
  } else if (event.code === 'Digit2') {
    speed = 2;
  } else if (event.code === 'Digit3') {
    speed = 4;
  }
});

function onClick(id: string, action: () => void): void {
  const button = el<HTMLButtonElement>(id);
  button.addEventListener('click', () => {
    action();
    button.blur(); // чтобы Пробел не «нажимал» кнопку, а ставил паузу
  });
}

const levelSelect = el<HTMLSelectElement>('level');
EXAMPLE_LEVELS.forEach((_, i) => levelSelect.add(new Option(LEVEL_TITLE[i] ?? `Уровень ${i + 1}`, String(i))));
levelSelect.addEventListener('change', () => {
  loadLevel(Number(levelSelect.value));
  levelSelect.blur();
});

onClick('restart', () => loadLevel(Number(levelSelect.value)));
onClick('start', () => sim.start());
onClick('pause', () => {
  paused = !paused;
});
onClick('s1', () => {
  speed = 1;
});
onClick('s2', () => {
  speed = 2;
});
onClick('s4', () => {
  speed = 4;
});
onClick('save', () => {
  saved = sim.serialize();
  el<HTMLButtonElement>('load').disabled = false;
  toast('Сохранено');
});
onClick('load', () => {
  if (saved === null) return;
  sim.deserialize(saved);
  selected = null;
  pick = -1;
  sideKey = '';
});

// ───────────────────────── Главный цикл ─────────────────────────

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  // 1. Продвинуть мир. На паузе step() не вызываем — мир просто стоит.
  if (!paused) report(sim.step(dt * speed));

  // 2. Взять снимок и нарисовать всё только из него.
  const snap = sim.snapshot();
  draw(snap, now);
  refreshHud(snap);

  const key = JSON.stringify([
    snap.mode,
    selected,
    pick,
    snap.mode === 'teach' ? [snap.recording, snap.canFinishTeach] : snap.robots.map((r) => [r.id, r.program, r.pendingProgram]),
  ]);
  if (key !== sideKey) {
    sideKey = key;
    buildSide(snap);
  }
  refreshSide(snap);

  requestAnimationFrame(frame);
}

loadLevel(0);
requestAnimationFrame(frame);
