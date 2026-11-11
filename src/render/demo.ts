// Живая линия для меню: настоящая симуляция на уровне-примере «Такт» и три робота с готовыми программами
// (те же, что в тестах симуляции). Меню показывает ровно то, что игрок потом построит сам.
import type Phaser from 'phaser';
import { Simulation } from '../sim';
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../sim/examples';
import type { LevelData } from '../types';
import { parseProgram } from '../ui/programModel';
import { FieldView } from './field';

/** Короткая запись программы: L2 — два шага влево, T — взять, P — положить, S — датчик. */
const PROGRAMS: readonly [string, number][] = [
  ['L S T R3 U S P L2', 0],
  ['L2 U S T R4 D S P L2', 1],
  ['L2 U S T D S P S T R4 S P L2', 2],
];

export class DemoLine {
  readonly view: FieldView;
  private readonly sim: Simulation;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number) {
    const level: LevelData = { ...EXAMPLE_LEVELS[3], id: 'menu', timeLimit: 100000, target: 100000, energy: 100, tutorial: undefined };
    this.sim = new Simulation();
    this.sim.loadLevel(level, EXAMPLE_DEFS);
    for (const [text, dock] of PROGRAMS) {
      if (!this.sim.beginTeach(dock).ok) continue;
      this.sim.teachInput('wait');
      const made = this.sim.finishTeach();
      if (made.ok) this.sim.setProgram(made.id, parseProgram(text));
    }
    this.sim.start();
    // Несколько секунд «прогрева»: меню открывается, когда линия уже работает.
    for (let i = 0; i < 160; i++) this.sim.step(0.05);
    this.view = new FieldView(scene, level, x, y, scale);
    this.view.render(this.sim.snapshot(), 0, { dim: 0.85 });
  }

  /** dt — секунды с прошлого кадра. */
  update(dt: number): void {
    const events = this.sim.step(dt);
    this.view.play(events);
    this.view.render(this.sim.snapshot(), dt, { dim: 0.85 });
  }
}
