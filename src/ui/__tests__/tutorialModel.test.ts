import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim';
import { EXAMPLE_DEFS } from '../../sim/examples';
import type { Block, LevelData, Result } from '../../types';
import { TutorialFlow, parseStep } from '../tutorialModel';
import { levels, machineDefs } from '../levels';

const KEYS = [
  'tutorial.clickDock',
  'tutorial.goTo_depot',
  'tutorial.take',
  'tutorial.goTo_pad',
  'tutorial.put',
  'tutorial.returnDock',
  'tutorial.finish',
  'tutorial.copy',
  'tutorial.start',
];

const level = (over: Partial<LevelData> = {}): LevelData => ({
  id: 'l1',
  titleKey: 'level.l1.title',
  width: 16,
  height: 9,
  timeLimit: 90,
  target: 4,
  targetItem: 'ore',
  energy: 6,
  robotCost: 3,
  sensorCost: 1,
  maxProgram: 40,
  allowedOps: ['up', 'down', 'left', 'right', 'take', 'put', 'wait', 'sense'],
  buildable: [],
  machines: [
    { type: 'depot', x: 3, y: 4 },
    { type: 'pad', x: 12, y: 4 },
  ],
  docks: [{ x: 7, y: 4 }],
  tutorial: KEYS,
  seed: 1,
  ...over,
});

const id = (r: Result): number => (r.ok ? r.id : -1);

function setup(over: Partial<LevelData> = {}) {
  const lv = level(over);
  const sim = new Simulation();
  sim.loadLevel(lv, EXAMPLE_DEFS);
  const flow = new TutorialFlow(lv.tutorial ?? []);
  const ctx = () => ({ snap: sim.snapshot(), level: lv, canFinish: sim.canFinishTeach(), telemetryOpen: false });
  const now = () => {
    flow.update(ctx());
    return flow.current()?.kind ?? null;
  };
  const press = (keys: string) => {
    const map = { U: 'up', D: 'down', L: 'left', R: 'right', T: 'act', W: 'wait' } as const;
    for (const k of keys) {
      const r = sim.teachInput(map[k as keyof typeof map]);
      if (!r.ok) throw new Error(`Шаг ${k} отклонён: ${r.reason}`);
    }
  };
  return { sim, flow, ctx, now, press };
}

describe('разбор шага', () => {
  it('берёт вид шага из последней части ключа', () => {
    expect(parseStep('tutorial.clickDock')).toEqual({ key: 'tutorial.clickDock', kind: 'clickDock' });
    expect(parseStep('tutorial.l2.waitPress').kind).toBe('waitPress');
  });

  it('узнаёт машину в шаге «дойди до»', () => {
    expect(parseStep('tutorial.goTo_depot')).toEqual({ key: 'tutorial.goTo_depot', kind: 'goTo', machine: 'depot' });
  });

  it('незнакомый ключ показывает как простую подсказку', () => {
    expect(parseStep('tutorial.hello').kind).toBe('info');
    expect(parseStep('tutorial.goTo_moon').kind).toBe('info');
  });
});

describe('обучение первого уровня', () => {
  it('ведёт игрока от дока до старта', () => {
    const { sim, flow, ctx, now, press } = setup();
    expect(now()).toBe('clickDock');
    expect(flow.target(ctx())).toEqual({ kind: 'cell', x: 7, y: 4 });

    expect(sim.beginTeach(0).ok).toBe(true);
    expect(now()).toBe('goTo');
    expect(flow.target(ctx())).toEqual({ kind: 'cell', x: 3, y: 4 });

    press('LLL');
    expect(now()).toBe('take');
    press('T');
    expect(now()).toBe('goTo');
    expect(flow.target(ctx())).toEqual({ kind: 'cell', x: 12, y: 4 });

    press('RRRRRRR');
    expect(now()).toBe('put');
    press('T');
    expect(now()).toBe('returnDock');
    expect(flow.target(ctx())).toEqual({ kind: 'cell', x: 7, y: 4 });

    press('LLLL');
    expect(now()).toBe('finish');
    expect(flow.target(ctx())).toEqual({ kind: 'ui', id: 'finish' });

    const robot = id(sim.finishTeach());
    expect(now()).toBe('copy');
    expect(flow.target(ctx())).toEqual({ kind: 'ui', id: 'copy' });
    expect(sim.copyRobot(robot, 8).ok).toBe(true);
    expect(now()).toBe('start');
    expect(flow.target(ctx())).toEqual({ kind: 'ui', id: 'start' });

    sim.start();
    expect(now()).toBeNull();
    expect(flow.finished()).toBe(true);
  });

  it('после отмены репетиции возвращает к первому шагу', () => {
    const { sim, now, press } = setup();
    sim.beginTeach(0);
    press('LLLT');
    expect(now()).toBe('goTo');
    sim.cancelTeach();
    expect(now()).toBe('clickDock');
  });

  it('пропускает копирование, когда на второго робота нет энергии', () => {
    const { sim, now, press } = setup({ energy: 4 });
    sim.beginTeach(0);
    press('LLLTRRRRRRRTLLLL');
    sim.finishTeach();
    expect(now()).toBe('start');
  });

  it('если робота убрали до старта, снова просит нажать на док', () => {
    const { sim, now, press } = setup();
    sim.beginTeach(0);
    press('LLLTRRRRRRRTLLLL');
    const robot = id(sim.finishTeach());
    expect(now()).toBe('copy');
    sim.removeRobot(robot);
    expect(now()).toBe('clickDock');
    sim.beginTeach(0);
    expect(now()).toBe('goTo');
  });

  it('не возвращает назад шаг, который игрок уже прошёл', () => {
    const { now, press, sim } = setup();
    sim.beginTeach(0);
    press('LLL');
    expect(now()).toBe('take');
    press('R');
    expect(now()).toBe('take');
  });
});

describe('подсказки по ситуации', () => {
  it('подсказка про датчик появляется после первого промаха и уходит, когда датчик стоит', () => {
    const { sim, flow, ctx, now } = setup({
      tutorial: ['tutorial.sensor'],
      machines: [
        { type: 'depot', x: 3, y: 4 },
        { type: 'press', x: 8, y: 3 },
        { type: 'pad', x: 12, y: 4 },
      ],
    });
    expect(now()).toBe('sensor');
    expect(flow.visible(ctx())).toBe(false);
    // Слепой робот: каждый круг пытается взять пластину из пустого пресса.
    sim.beginTeach(0);
    sim.teachInput('wait');
    const robot = id(sim.finishTeach());
    const blind: Block[] = [{ op: 'right' }, { op: 'up' }, { op: 'take' }, { op: 'left' }];
    expect(sim.setProgram(robot, blind).ok).toBe(true);
    sim.start();
    sim.step(2);
    expect(sim.snapshot().misses).toBeGreaterThan(0);
    expect(flow.visible(ctx())).toBe(true);
    expect(sim.setProgram(robot, [{ op: 'right' }, { op: 'up' }, { op: 'sense' }, { op: 'take' }, { op: 'left' }]).ok).toBe(true);
    sim.step(1);
    expect(now()).toBeNull();
  });

  it('подсказка про датчик уходит сразу, как датчик поставлен, даже если правка ждёт конца круга', () => {
    const { sim, now } = setup({
      tutorial: ['tutorial.sensor'],
      machines: [
        { type: 'depot', x: 3, y: 4 },
        { type: 'press', x: 8, y: 3 },
        { type: 'pad', x: 12, y: 4 },
      ],
    });
    sim.beginTeach(0);
    sim.teachInput('wait');
    const robot = id(sim.finishTeach());
    expect(sim.setProgram(robot, [{ op: 'right' }, { op: 'up' }, { op: 'take' }, { op: 'left' }]).ok).toBe(true);
    sim.start();
    sim.step(1.6);
    expect(sim.snapshot().misses).toBeGreaterThan(0);
    // Робот посреди круга: правка с датчиком пока только ждёт, но игрок уже сделал то, о чём просили.
    expect(sim.setProgram(robot, [{ op: 'right' }, { op: 'up' }, { op: 'sense' }, { op: 'take' }, { op: 'left' }]).ok).toBe(true);
    expect(sim.snapshot().robots[0].pendingProgram).not.toBeNull();
    expect(now()).toBeNull();
  });

  it('во время показа не просит того, что делается вне показа: копию, старт, датчик, телеметрию', () => {
    for (const key of ['tutorial.copy', 'tutorial.start', 'tutorial.sensor', 'tutorial.telemetry']) {
      const { sim, flow, ctx, press } = setup({ tutorial: [key] });
      sim.beginTeach(0);
      press('LLLT');
      flow.update(ctx());
      expect(flow.current()?.key).toBe(key);
      expect(flow.visible(ctx())).toBe(false);
    }
  });

  it('подсказка про датчик ведёт: робот, который промахнулся → его блок → кнопка «Датчик»', () => {
    const { sim, flow, ctx, now } = setup({
      tutorial: ['tutorial.sensor'],
      machines: [
        { type: 'depot', x: 3, y: 4 },
        { type: 'press', x: 8, y: 3 },
        { type: 'pad', x: 12, y: 4 },
      ],
    });
    sim.beginTeach(0);
    sim.teachInput('wait');
    const robot = id(sim.finishTeach());
    expect(sim.setProgram(robot, [{ op: 'right' }, { op: 'up' }, { op: 'take' }, { op: 'left' }]).ok).toBe(true);
    sim.start();
    sim.step(1.6);
    expect(now()).toBe('sensor');
    const miss = { robotId: robot, op: 'take' as const };
    // Где был промах, ещё не знаем — стрелку не ставим.
    expect(flow.target(ctx())).toBeNull();
    expect(flow.target({ ...ctx(), lastMiss: miss })).toEqual({ kind: 'robot', id: robot });
    expect(flow.target({ ...ctx(), lastMiss: miss, selectedRobot: robot })).toEqual({ kind: 'block', index: 2 });
    expect(flow.target({ ...ctx(), lastMiss: miss, selectedRobot: robot, picked: 'take' })).toEqual({ kind: 'ui', id: 'sense' });
    // Текст — про то действие, на котором промахнулись.
    expect(flow.textKey({ ...ctx(), lastMiss: miss })).toBe('tutorial.sensor');
    expect(flow.textKey({ ...ctx(), lastMiss: { robotId: robot, op: 'put' } })).toBe('tutorial.sensorPut');
  });

  it('подсказка про телеметрию уходит, когда панель открыли', () => {
    const { flow, ctx } = setup({ tutorial: ['tutorial.telemetry'] });
    flow.update({ ...ctx(), telemetryOpen: true });
    expect(flow.current()).toBeNull();
  });
});

describe('подсказка «подожди пресс» (уровень 3 «Пресс»)', () => {
  // Первый уровень с прессом: подающий с верхнего дока берёт руду и кладёт её в пресс слева.
  const lv = levels()[2];
  const make = () => {
    const sim = new Simulation();
    sim.loadLevel(lv, machineDefs());
    const flow = new TutorialFlow(['tutorial.waitPress', 'tutorial.copy']);
    const ctx = () => ({ snap: sim.snapshot(), level: lv, canFinish: sim.canFinishTeach(), telemetryOpen: false });
    const step = () => {
      flow.update(ctx());
      return { kind: flow.current()?.kind ?? null, visible: flow.visible(ctx()) };
    };
    const press = (keys: string) => {
      const map = { U: 'up', D: 'down', L: 'left', R: 'right', T: 'act', W: 'wait' } as const;
      for (const k of keys) {
        const r = sim.teachInput(map[k as keyof typeof map]);
        if (!r.ok) throw new Error(`Шаг ${k} отклонён: ${r.reason}`);
      }
    };
    return { sim, step, press };
  };

  it('не мешает тому, кто загружает пресс, и видна, пока ждёшь у работающего пресса', () => {
    const { sim, step, press } = make();
    expect(sim.beginTeach(0).ok).toBe(true);
    press('LUTDDRRT');
    expect(step()).toEqual({ kind: 'waitPress', visible: false });
    press('W');
    expect(step()).toEqual({ kind: 'waitPress', visible: true });
  });

  it('уходит, как только пластину взяли, и дальше идёт «сделай копию»', () => {
    const { sim, step, press } = make();
    sim.beginTeach(0);
    press('LUTDDRRT');
    // Ждём, пока пресс сделает пластину (2 с = 8 шагов), потом берём её.
    for (let i = 0; i < 12 && sim.snapshot().machines.find((m) => m.type === 'press')?.state !== 'ready'; i++) press('W');
    press('T');
    expect(sim.snapshot().operator?.carrying).toBe('plate');
    // Следующий шаг — «сделай копию», но кнопка копии появится только у готового робота:
    // пока идёт показ, подсказка молчит, чтобы не сбивать игрока посреди записи.
    expect(step()).toEqual({ kind: 'copy', visible: false });
    // Карта уровня 3: вниз к нижнему ряду, вправо к ракете (7,6), потом вверх и влево на верхний док (2,1).
    press('DDDRRRT');
    press('UUUUULLLL');
    expect(sim.canFinishTeach()).toBe(true);
    expect(sim.finishTeach().ok).toBe(true);
    expect(step()).toEqual({ kind: 'copy', visible: true });
  });
});
