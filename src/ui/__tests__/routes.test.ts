import { describe, expect, it } from 'vitest';
import { Simulation } from '../../sim';
import { deploy, must } from '../../sim/__tests__/helpers';
import { levels, machineDefs } from '../levels';
import { TutorialFlow, routeCount } from '../tutorialModel';

describe('свой путь у второго робота (уровень 3 «Пресс»)', () => {
  const lv = levels()[2];
  const make = () => {
    const sim = new Simulation();
    sim.loadLevel(lv, machineDefs());
    const flow = new TutorialFlow(['tutorial.l3.secondRobot', 'tutorial.l3.start']);
    const ctx = () => ({ snap: sim.snapshot(), level: lv, canFinish: sim.canFinishTeach(), telemetryOpen: false });
    const step = () => {
      flow.update(ctx());
      return flow.current()?.kind ?? null;
    };
    return { sim, step, target: () => flow.target(ctx()) };
  };

  it('копия на R ходит той же петлёй — это всё ещё один маршрут', () => {
    const { sim, step } = make();
    const feeder = deploy(sim, 'L U T D2 R2 P U2 L W1', 0);
    must(sim.copyRobot(feeder, 6));
    expect(sim.snapshot().robots).toHaveLength(2);
    expect(routeCount(sim.snapshot())).toBe(1);
    expect(step()).toBe('secondRobot');
  });

  it('робот со своим маршрутом засчитывает шаг; обучение показывает на кнопку «Свой путь (N)»', () => {
    const { sim, step, target } = make();
    deploy(sim, 'L U T D2 R2 P U2 L W1', 0);
    expect(step()).toBe('secondRobot');
    expect(target()).toEqual({ kind: 'ui', id: 'route' });
    deploy(sim, 'U2 L W1 T D2 R2 D P L', 1);
    expect(routeCount(sim.snapshot())).toBe(2);
    expect(step()).toBe('start');
  });

  it('второй маршрут можно начать и с занятого дока — симуляция это разрешает', () => {
    const { sim } = make();
    deploy(sim, 'L U T D2 R2 P U2 L W1', 0);
    expect(sim.beginTeach(0).ok).toBe(true);
    sim.cancelTeach();
  });
});
