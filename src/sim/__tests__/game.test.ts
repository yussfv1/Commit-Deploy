import { describe, expect, it } from 'vitest';
import type { LevelData } from '../../types';
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../examples';
import { Simulation } from '../simulation';
import { deploy, level, makeSim, must, pressLine, prog } from './helpers';

const CARRY = 'L T R5 P L5'; // круг 65 тиков, доставки на тиках 35, 100, 165…

/** Тесный цех 4×2: склад (0,1), пресс (1,0), стол (3,0); доки A (1,1) и B (2,0). Роботы работают не сходя с места. */
const tightShop = (): LevelData =>
  level({
    width: 4,
    height: 2,
    targetItem: 'plate',
    machines: [
      { type: 'depot', x: 0, y: 1 },
      { type: 'press', x: 1, y: 0 },
      { type: 'pad', x: 3, y: 0 },
    ],
    docks: [
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ],
  });

describe('энергия', () => {
  it('роботы и датчики стоят энергии, удаление её возвращает', () => {
    const sim = makeSim(level({ energy: 10 }));
    const id = deploy(sim, CARRY);
    expect(sim.snapshot().energyLeft).toBe(7);

    expect(sim.setProgram(id, prog('L S T R5 P L5')).ok).toBe(true);
    expect(sim.snapshot()).toMatchObject({ energyLeft: 6, robots: [{ hasSensor: true }] });

    const copy = must(sim.copyRobot(id));
    expect(sim.snapshot().energyLeft).toBe(2);
    expect(sim.copyRobot(id)).toEqual({ ok: false, reason: 'noEnergy' });

    must(sim.removeRobot(copy));
    expect(sim.snapshot().energyLeft).toBe(6);
    expect(sim.removeRobot(copy)).toEqual({ ok: false, reason: 'noRobot' });
  });

  it('на ДАТЧИК может не хватить энергии', () => {
    const sim = makeSim(level({ energy: 3 }));
    const id = deploy(sim, CARRY);
    expect(sim.setProgram(id, prog('L S T R5 P L5'))).toMatchObject({ ok: false, reason: 'noEnergy', at: 1 });
  });

  it('покупка и продажа машин', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    const shelf = must(sim.buy('shelf', 3, 0));
    expect(sim.snapshot().energyLeft).toBe(95);
    expect(sim.snapshot().machines.find((m) => m.id === shelf)).toMatchObject({ type: 'shelf', bought: true });

    expect(sim.canBuy('shelf', 3, 0)).toEqual({ ok: false, reason: 'occupied' });
    expect(sim.canBuy('shelf', 0, 1)).toEqual({ ok: false, reason: 'occupied' });
    expect(sim.canBuy('shelf', 1, 1)).toEqual({ ok: false, reason: 'occupied' }); // док
    expect(sim.canBuy('shelf', 3, 1)).toEqual({ ok: false, reason: 'onPath' });
    expect(sim.canBuy('shelf', 8, 0)).toEqual({ ok: false, reason: 'outOfBounds' });
    expect(sim.canBuy('pad', 4, 0)).toEqual({ ok: false, reason: 'notBuildable' });

    must(sim.sell(shelf));
    expect(sim.snapshot().energyLeft).toBe(97);
    expect(sim.sell(0)).toEqual({ ok: false, reason: 'notBought' });
    expect(sim.sell(99)).toEqual({ ok: false, reason: 'noMachine' });

    const broke = makeSim(level({ energy: 1 }));
    expect(broke.buy('shelf', 3, 0)).toEqual({ ok: false, reason: 'noEnergy' });
  });

  it('полка работает как буфер между роботами', () => {
    const sim = makeSim();
    must(sim.buy('shelf', 3, 0));
    deploy(sim, 'L T R2 U P L2'); // носит руду со склада на полку
    sim.start();
    sim.advanceTicks(400);
    const shelf = sim.snapshot().machines[2];
    expect(shelf).toMatchObject({ type: 'shelf', state: 'full', stock: 4, output: 'ore' });
  });
});

describe('победа и поражение', () => {
  const quick = (over: Partial<LevelData> = {}): Simulation => {
    const sim = makeSim(level({ target: 1, timeLimit: 60, starEnergy: 3, starTimeLeft: 50, ...over }));
    deploy(sim, CARRY);
    sim.start();
    return sim;
  };

  it('план выполнен — ракета стартует, три звезды', () => {
    const sim = quick();
    const events = sim.advanceTicks(100);
    const snap = sim.snapshot();
    expect(snap).toMatchObject({ mode: 'won', stars: 3, starEnergyOk: true, starTimeOk: true, launches: 1, tick: 36 });
    expect(snap.timeLeft).toBe(58.25);
    expect(events.map((e) => e.type).filter((t) => t === 'launch' || t === 'won')).toEqual(['launch', 'won']);
    expect(events.find((e) => e.type === 'won')?.value).toBe(3);
  });

  it('звёзды за экономию и скорость считаются отдельно', () => {
    const slow = quick({ starTimeLeft: 59 });
    slow.advanceTicks(100);
    expect(slow.snapshot()).toMatchObject({ stars: 2, starEnergyOk: true, starTimeOk: false });

    const costly = quick({ starEnergy: 2 });
    costly.advanceTicks(100);
    expect(costly.snapshot()).toMatchObject({ stars: 2, starEnergyOk: false, starTimeOk: true });
  });

  it('время вышло — старт отменён', () => {
    const sim = quick({ target: 5, timeLimit: 1 });
    const events = sim.advanceTicks(100);
    expect(sim.snapshot()).toMatchObject({ mode: 'lost', stars: 0, tick: 20, timeLeft: 0 });
    expect(events.some((e) => e.type === 'lost')).toBe(true);
  });

  it('после конца уровня мир замирает и ничего нельзя менять', () => {
    const sim = quick();
    sim.advanceTicks(100);
    expect(sim.step(1)).toHaveLength(0);
    expect(sim.snapshot().tick).toBe(36);
    expect(sim.beginTeach(0)).toEqual({ ok: false, reason: 'badMode' });
    expect(sim.buy('shelf', 3, 0)).toEqual({ ok: false, reason: 'badMode' });
    expect(sim.removeRobot(0)).toEqual({ ok: false, reason: 'badMode' });
  });

  it('бесконечный режим: заказ растёт, запуски дают энергию, первый срыв — конец', () => {
    const sim = makeSim(
      level({ timeLimit: 0, target: 2, endless: { launchEvery: 10, growBy: 1, energyPerLaunch: 2 } }),
    );
    deploy(sim, CARRY);
    sim.start();

    sim.advanceTicks(200); // окно 1: доставки на 35, 100, 165 → 3 при заказе 2
    expect(sim.snapshot()).toMatchObject({ mode: 'running', launches: 1, delivered: 1, target: 3, timeLeft: 10 });

    const events = sim.advanceTicks(700);
    expect(sim.snapshot()).toMatchObject({ mode: 'lost', launches: 3, target: 5, delivered: 3, energy: 106, tick: 800 });
    expect(events.filter((e) => e.type === 'launch')).toHaveLength(2);
  });
});

describe('шаг времени', () => {
  it('20 шагов по 0,05 с — ровно 20 тиков', () => {
    const sim = makeSim();
    sim.start();
    for (let i = 0; i < 20; i++) sim.step(0.05);
    expect(sim.snapshot().tick).toBe(20);
  });

  it('копит дробное время и отдаёт долю тика для плавной отрисовки', () => {
    const sim = makeSim();
    sim.start();
    sim.step(0.03);
    expect(sim.snapshot().tick).toBe(0);
    expect(sim.snapshot().alpha).toBeCloseTo(0.6);
    sim.step(0.03);
    expect(sim.snapshot().tick).toBe(1);
    expect(sim.snapshot().alpha).toBeCloseTo(0.2);
  });

  it('за один вызов проживает не больше секунды', () => {
    const sim = makeSim();
    sim.start();
    sim.step(30);
    expect(sim.snapshot().tick).toBe(20);
  });

  it('события от действий игрока приходят с ближайшим step()', () => {
    const sim = makeSim();
    const id = deploy(sim, CARRY);
    expect(sim.step(0)).toMatchObject([{ type: 'deployed', robotId: id, x: 1, y: 1 }]);
    expect(sim.step(0)).toHaveLength(0);
  });
});

describe('телеметрия', () => {
  it('раскладывает круг робота по состояниям', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    sim.start();
    const events = sim.advanceTicks(66);
    expect(events.find((e) => e.type === 'cycle')?.value).toBe(65);
    expect(sim.snapshot().robots[0]).toMatchObject({
      cycleTime: 3.25,
      usefulShare: 1,
      cycleMisses: 0,
      timeline: [
        { state: 'move', from: 0, to: 5 },
        { state: 'act', from: 5, to: 10 },
        { state: 'carry', from: 10, to: 35 },
        { state: 'act', from: 35, to: 40 },
        { state: 'move', from: 40, to: 65 },
      ],
    });
  });

  it('считает долю ожиданий в круге и загрузку пресса', () => {
    const sim = makeSim(pressLine());
    deploy(sim, 'L T R3 U P S T R3 P L6'); // круг 125 тиков, из них 35 ждёт датчик, пресс работает 40
    sim.start();
    sim.advanceTicks(1300);
    const snap = sim.snapshot();
    expect(snap.robots[0].usefulShare).toBeCloseTo(1 - 35 / 125);
    expect(snap.machines[1].utilization).toBeGreaterThan(0.28);
    expect(snap.machines[1].utilization).toBeLessThan(0.36);
  });

  it('считает темп линии и нужный темп', () => {
    const sim = makeSim();
    deploy(sim, CARRY);
    expect(sim.snapshot().requiredRate).toBe(100); // 1000 предметов за 600 секунд
    sim.start();
    sim.advanceTicks(1300);
    const snap = sim.snapshot();
    expect(snap.throughput).toBeGreaterThanOrEqual(18);
    expect(snap.throughput).toBeLessThanOrEqual(20);
    expect(snap.requiredRate).toBeGreaterThan(100);
  });

  it('узкое место: самый длинный круг, когда машины свободны', () => {
    const sim = makeSim();
    const id = deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(100);
    expect(sim.snapshot().bottleneck).toBeNull(); // первые 10 секунд данных мало
    sim.advanceTicks(300);
    expect(sim.snapshot().bottleneck).toEqual({ kind: 'robot', id, reason: 'slowLoop' });
  });

  it('узкое место: робот, который промахивается', () => {
    const sim = makeSim(level({ targetItem: 'plate' })); // стол ждёт пластины, а робот несёт руду
    const id = deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(400);
    expect(sim.snapshot().bottleneck).toEqual({ kind: 'robot', id, reason: 'misses' });
  });

  it('узкое место: пресс на пределе', () => {
    const sim = makeSim(tightShop());
    deploy(sim, 'L T U P', 0);
    deploy(sim, 'L T R P', 1);
    sim.start();
    sim.advanceTicks(1200);
    const snap = sim.snapshot();
    expect(snap.machines[1].utilization).toBeGreaterThan(0.6);
    expect(snap.bottleneck).toEqual({ kind: 'machine', id: 1, reason: 'saturated' });
  });

  it('узкое место: готовое не успевают забирать', () => {
    const sim = makeSim(tightShop());
    deploy(sim, 'L T U P', 0);
    deploy(sim, 'L T R P W20', 1);
    sim.start();
    sim.advanceTicks(1200);
    expect(sim.snapshot().bottleneck).toEqual({ kind: 'machine', id: 1, reason: 'blocked' });
  });

  it('узкого места нет, когда линия успевает', () => {
    const sim = makeSim(level({ target: 20 }));
    deploy(sim, CARRY);
    sim.start();
    sim.advanceTicks(300);
    expect(sim.snapshot().bottleneck).toBeNull();
  });
});

describe('сохранение и повторяемость', () => {
  const lineLevel = pressLine({ defOverrides: { press: { workTimeRange: [1.5, 3.5] } } });
  const build = (): Simulation => {
    const sim = makeSim(lineLevel);
    deploy(sim, 'L S T R3 U S P S T R3 S P L6');
    must(sim.buy('shelf', 6, 0));
    sim.start();
    return sim;
  };

  it('одинаковые действия дают одинаковый мир', () => {
    const a = build();
    const b = build();
    a.advanceTicks(800);
    b.advanceTicks(800);
    expect(b.snapshot()).toEqual(a.snapshot());
    expect(a.snapshot().delivered).toBeGreaterThan(3);
  });

  it('загруженное сохранение продолжается так же, как непрерванная игра', () => {
    const original = build();
    original.advanceTicks(300);
    const save = original.serialize();
    original.advanceTicks(500);

    const loaded = new Simulation();
    loaded.deserialize(save);
    expect(loaded.getLevel().id).toBe('test');
    loaded.advanceTicks(500);

    expect(loaded.snapshot()).toEqual(original.snapshot());
  });

  it('сохранение посреди репетиции возвращает в режим до неё', () => {
    const sim = build();
    sim.advanceTicks(50);
    must(sim.beginTeach(1));
    sim.teachInput('left');
    const loaded = new Simulation();
    loaded.deserialize(sim.serialize());
    expect(loaded.snapshot()).toMatchObject({ mode: 'running', tick: 50, operator: null });
  });

  it('чужое или битое сохранение отклоняется', () => {
    const sim = new Simulation();
    expect(() => sim.deserialize('{"version":999}')).toThrow(/Сохранение/);
    expect(() => sim.deserialize('не json')).toThrow();
    expect(() => sim.snapshot()).toThrow(/loadLevel/);
  });
});

describe('стресс', () => {
  it('10 минут игры на 8 роботах: без сбоев и быстро', () => {
    const sim = new Simulation();
    sim.loadLevel({ ...EXAMPLE_LEVELS[3], id: 'stress', energy: 100, target: 100000, timeLimit: 100000 }, EXAMPLE_DEFS);
    const line = [
      deploy(sim, 'L S T R3 U S P L2', 0), // руда → пресс
      deploy(sim, 'L2 U S T R4 D S P L2', 1), // пластина → сборщик
      deploy(sim, 'R2 U S T D S P L2', 1), // топливо → сборщик
      deploy(sim, 'L2 D S T R4 S P L2', 2), // ячейка → стартовый стол
    ];
    line.forEach((id, i) => must(sim.copyRobot(id, 3 + i)));
    expect(sim.snapshot().robots).toHaveLength(8);

    sim.start();
    const started = performance.now();
    let events = 0;
    for (let second = 0; second < 600; second++) {
      events += sim.advanceTicks(20).length;
      sim.snapshot();
    }
    const elapsed = performance.now() - started;

    const snap = sim.snapshot();
    expect(snap.mode).toBe('running');
    expect(snap.tick).toBe(12000);
    expect(snap.delivered).toBeGreaterThan(100);
    expect(events).toBeGreaterThan(5000);
    expect(JSON.parse(sim.serialize()).world.tick).toBe(12000);
    expect(elapsed).toBeLessThan(3000);
  });
});
