import { describe, expect, it } from 'vitest';
import { OPERATOR_ID } from '../../types';
import { deploy, inputs, level, makeSim, must, pressLine, prog, teach } from './helpers';

// Круг «руда со склада на стол» на базовом уровне: 13 шагов = 65 тиков, доставка на тике 35.
const CARRY = 'L T R5 P L5';
// Линия с прессом, один робот: положил руду на тике 30, пластина готова к тику 70, доставка на тике 90.
const PRESS_OK = 'L T R3 U P W7 T R3 P L6';
const PRESS_EARLY = 'L T R3 U P W6 T R3 P L6';
const PRESS_SENSE = 'L T R3 U P S T R3 P L6';

describe('робот выполняет программу по кругу', () => {
  it('носит руду строго по тикам', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(35);
    expect(sim.snapshot().delivered).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot().delivered).toBe(1);
    sim.advanceTicks(65);
    expect(sim.snapshot().delivered).toBe(2);
    expect(sim.snapshot().misses).toBe(0);
  });

  it('до старта стоит на доке и ничего не делает', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    sim.step(5);
    const robot = sim.snapshot().robots[0];
    expect(sim.snapshot().tick).toBe(0);
    expect(robot).toMatchObject({ x: 1, y: 1, pc: -1, state: 'idle' });
  });

  it('плавно движется между клетками', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(11); // на тике 10 начался шаг вправо из (1,1) в (2,1)
    const robot = sim.snapshot().robots[0];
    expect(robot.x).toBeCloseTo(1.2);
    expect(robot.px).toBeCloseTo(1);
    expect(robot.state).toBe('carry');
    expect(robot.carrying).toBe('ore');
  });

  it('каждый круг начинает лицом в исходную сторону', () => {
    const sim = makeSim();
    deploy(sim, `W1 ${CARRY}`);
    sim.start();
    sim.advanceTicks(72); // второй круг начался на тике 70, идёт блок ЖДАТЬ
    expect(sim.snapshot().robots[0]).toMatchObject({ pc: 0, dir: 2, state: 'wait' });
  });

  it('блок ЖДАТЬ ×N длится N шагов', () => {
    const sim = makeSim();
    deploy(sim, 'W4 R L');
    sim.start();
    sim.advanceTicks(20);
    expect(sim.snapshot().robots[0].pc).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot().robots[0].pc).toBe(1);
  });

  it('роботы проходят друг сквозь друга', () => {
    const sim = makeSim();
    deploy(sim, 'R3 L3');
    deploy(sim, 'W1 R3 L3');
    sim.start();
    sim.advanceTicks(200);
    expect(sim.snapshot().misses).toBe(0);
    expect(sim.snapshot().robots.map((r) => r.cycleTime)).toEqual([1.5, 1.75]);
  });
});

describe('пресс, промахи и ДАТЧИК', () => {
  it('ожидание ровно по времени пресса — промахов нет', () => {
    const sim = makeSim(pressLine());
    deploy(sim, PRESS_OK);
    sim.start();
    sim.advanceTicks(90);
    expect(sim.snapshot().delivered).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot()).toMatchObject({ delivered: 1, misses: 0 });
    sim.advanceTicks(1000);
    expect(sim.snapshot().misses).toBe(0);
    expect(sim.snapshot().delivered).toBe(9);
  });

  it('на шаг раньше — промах, и робот уходит с пустыми руками', () => {
    const sim = makeSim(pressLine());
    deploy(sim, PRESS_EARLY);
    sim.start();
    const events = sim.advanceTicks(66);
    expect(sim.snapshot().misses).toBe(1);
    expect(events.filter((e) => e.type === 'miss')).toHaveLength(1);
    sim.advanceTicks(20); // на тике 85 пытается положить на стол то, чего нет
    expect(sim.snapshot()).toMatchObject({ delivered: 0, misses: 2 });
  });

  it('слепой робот после промаха встаёт намертво: в руках руда, в прессе пластина', () => {
    const sim = makeSim(pressLine());
    deploy(sim, PRESS_EARLY);
    sim.start();
    sim.advanceTicks(2000);
    const snap = sim.snapshot();
    expect(snap.delivered).toBe(0);
    expect(snap.misses).toBeGreaterThan(30);
    expect(snap.robots[0].carrying).toBe('ore');
    expect(snap.machines[1]).toMatchObject({ type: 'press', state: 'ready', output: 'plate' });
  });

  it('ДАТЧИК ждёт ровно до готовности и не теряет время', () => {
    const sim = makeSim(pressLine());
    deploy(sim, PRESS_SENSE);
    sim.start();
    sim.advanceTicks(50);
    expect(sim.snapshot().robots[0].state).toBe('sense');
    const events = sim.advanceTicks(41);
    expect(events.some((e) => e.type === 'sensed')).toBe(true);
    expect(sim.snapshot()).toMatchObject({ delivered: 1, misses: 0 });
  });

  it('с ДАТЧИКОМ линия не сбивается, даже когда пресс работает то быстро, то медленно', () => {
    const random = pressLine({ defOverrides: { press: { workTimeRange: [1.5, 3.5] } } });

    const blind = makeSim(random);
    deploy(blind, PRESS_OK);
    blind.start();
    blind.advanceTicks(4000);

    const smart = makeSim(random);
    deploy(smart, PRESS_SENSE);
    smart.start();
    smart.advanceTicks(4000);

    expect(blind.snapshot().misses).toBeGreaterThan(0);
    expect(smart.snapshot().misses).toBe(0);
    expect(smart.snapshot().delivered).toBeGreaterThan(blind.snapshot().delivered);
    expect(smart.snapshot().delivered).toBeGreaterThan(25);
  });

  it('ДАТЧИК сдаётся через 10 секунд, если ждать нечего', () => {
    const sim = makeSim(pressLine());
    deploy(sim, 'R3 U S T L3'); // пресс пуст, пластины не будет
    sim.start();
    sim.advanceTicks(220);
    expect(sim.snapshot().misses).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot().misses).toBe(1);
  });
});

describe('правка программы', () => {
  it('новая программа вступает в силу с начала следующего круга', () => {
    const sim = makeSim();
    const id = deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(10);
    expect(sim.setProgram(id, prog('W4')).ok).toBe(true);
    sim.advanceTicks(55);
    expect(sim.snapshot().robots[0].program).toHaveLength(13);
    expect(sim.snapshot().robots[0].pendingProgram).toEqual([{ op: 'wait', n: 4 }]);
    sim.advanceTicks(1);
    expect(sim.snapshot().robots[0].program).toEqual([{ op: 'wait', n: 4 }]);
    expect(sim.snapshot().robots[0].pendingProgram).toBeNull();
  });

  it('некорректную программу не принимает и говорит почему', () => {
    const sim = makeSim();
    const id = deploy(sim, CARRY);
    expect(sim.setProgram(id, prog('R2'))).toMatchObject({ ok: false, reason: 'notClosed' });
    expect(sim.setProgram(id, [])).toMatchObject({ ok: false, reason: 'empty' });
    expect(sim.setProgram(99, prog('W1'))).toMatchObject({ ok: false, reason: 'noRobot' });
    expect(sim.checkProgram(id, prog('R L'))).toEqual({ ok: true, path: [[1, 1], [2, 1], [1, 1]], steps: 2 });
    expect(sim.snapshot().robots[0].program).toHaveLength(13);
  });

  it('копия стартует с задержкой и работает по той же программе', () => {
    const sim = makeSim();
    const id = deploy(sim, CARRY);
    const copy = must(sim.copyRobot(id, 3));
    sim.start();
    sim.advanceTicks(15);
    const [first, second] = sim.snapshot().robots;
    expect(first.pc).toBe(2);
    expect(second).toMatchObject({ id: copy, pc: -1, state: 'idle', colorIndex: 1 });
    sim.advanceTicks(1);
    expect(sim.snapshot().robots[1].pc).toBe(0);
  });
});

describe('репетиция: показ → программа', () => {
  it('записывает шаги игрока и не трогает настоящий мир', () => {
    const sim = makeSim();
    must(sim.beginTeach(0));
    expect(sim.snapshot()).toMatchObject({ mode: 'teach', operator: { x: 1, y: 1, dir: 2, blocks: 0 } });

    expect(sim.teachInput('left').ok).toBe(true); // слева склад: поворот к нему
    expect(sim.teachInput('left')).toMatchObject({ ok: false, reason: 'bump' });
    const took = sim.teachInput('act');
    expect(took.events.find((e) => e.type === 'took')).toMatchObject({ robotId: OPERATOR_ID, item: 'ore' });
    expect(sim.teachInput('act')).toMatchObject({ ok: false, reason: 'cannotPut' });
    expect(sim.teachInput('up').ok).toBe(true);
    expect(sim.teachInput('act')).toMatchObject({ ok: false, reason: 'noMachine' });
    expect(sim.teachInput('down').ok).toBe(true);
    for (const input of inputs('R5 P')) expect(sim.teachInput(input).ok).toBe(true);

    expect(sim.snapshot().delivered).toBe(1); // доставка случилась в копии мира
    expect(sim.canFinishTeach()).toBe(false);
    expect(sim.finishTeach()).toMatchObject({ ok: false, reason: 'notClosed' });
    for (const input of inputs('L5')) sim.teachInput(input);
    expect(sim.canFinishTeach()).toBe(true);

    const id = must(sim.finishTeach());
    const snap = sim.snapshot();
    expect(snap).toMatchObject({ mode: 'plan', tick: 0, delivered: 0, energyLeft: 97, operator: null });
    expect(snap.robots).toHaveLength(1);
    expect(snap.robots[0]).toMatchObject({ id, pc: -1 });
    expect(snap.robots[0].program).toEqual(prog('L T U D R5 P L5'));
  });

  it('склеивает ожидания в один блок', () => {
    const sim = makeSim();
    teach(sim, 'W3');
    expect(sim.snapshot().robots[0].program).toEqual([{ op: 'wait', n: 3 }]);
  });

  it('робот повторяет показанное тик в тик', () => {
    const sim = makeSim();
    teach(sim, CARRY);
    sim.start();
    sim.advanceTicks(35);
    expect(sim.snapshot().delivered).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot().delivered).toBe(1);
  });

  it('второй робот, показанный на ходу, попадает в такт первого', () => {
    const sim = makeSim(pressLine());
    teach(sim, 'L T R3 U P L3'); // подающий: круг 50 тиков, кладёт руду на тиках 30, 80, 130…
    sim.start();
    sim.advanceTicks(55);

    // Забирающий показан, пока первый работает в копии мира: берёт пластину на 75-м тике.
    teach(sim, 'L3 U T R3 P W1', 1);
    expect(sim.snapshot()).toMatchObject({ mode: 'running', tick: 55, delivered: 0 });

    sim.advanceTicks(40);
    expect(sim.snapshot().delivered).toBe(0);
    sim.advanceTicks(1);
    expect(sim.snapshot().delivered).toBe(1); // тик 95 — ровно как в репетиции

    sim.advanceTicks(2000);
    expect(sim.snapshot().misses).toBe(0);
    expect(sim.snapshot().delivered).toBe(41);
  });

  it('отмена ничего не меняет', () => {
    const sim = makeSim();
    must(sim.beginTeach(0));
    sim.teachInput('right');
    sim.cancelTeach();
    expect(sim.snapshot()).toMatchObject({ mode: 'plan', energyLeft: 100, robots: [] });
  });

  it('следит за длиной программы, энергией и режимом', () => {
    const short = makeSim(level({ maxProgram: 2 }));
    must(short.beginTeach(0));
    short.teachInput('left');
    short.teachInput('act');
    expect(short.teachInput('right')).toMatchObject({ ok: false, reason: 'tooLong' });

    const poor = makeSim(level({ energy: 3 }));
    const id = teach(poor, 'W1');
    expect(poor.beginTeach(0)).toEqual({ ok: false, reason: 'noEnergy' });
    expect(poor.beginTeach(5)).toEqual({ ok: false, reason: 'badDock' });
    expect(poor.teachInput('wait')).toMatchObject({ ok: false, reason: 'badMode' });

    // Перезапись робота: старый возвращает энергию, поэтому её хватает.
    must(poor.beginTeach(0, id));
    expect(poor.snapshot().robots).toHaveLength(0); // в копии мира старого робота уже нет
    poor.teachInput('wait');
    const replaced = must(poor.finishTeach());
    expect(replaced).not.toBe(id);
    expect(poor.snapshot()).toMatchObject({ energyLeft: 0 });
    expect(poor.snapshot().robots).toHaveLength(1);
  });
});
