// Покупка машин на карте: кнопка внизу включает режим, призрак машины ездит за мышью — зелёный там,
// где ставить можно, красный — где нельзя; клик ставит, правый клик или повторная кнопка выключают режим.
import type Phaser from 'phaser';
import type { FieldView } from '../render/field';
import { DEPTH } from '../render/layout';
import { iconKey, tileKey } from '../render/textures';
import type { FailReason, ISimulation, MachineType } from '../types';
import { COLOR } from './theme';

export interface BuyHost {
  fail(reason: FailReason): void;
  /** Покупка удалась (для Think Award: «исправил на ходу»). */
  bought(): void;
  /** Режим включён — выбор робота или машины на панели снимается. */
  started(): void;
}

export class BuyMode {
  /** Что покупаем сейчас (null — режим выключен). */
  type: MachineType | null = null;
  private readonly scene: Phaser.Scene;
  private readonly field: FieldView;
  private readonly sim: ISimulation;
  private readonly host: BuyHost;
  private readonly ghost: Phaser.GameObjects.Container;
  private cell: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, field: FieldView, sim: ISimulation, host: BuyHost) {
    this.scene = scene;
    this.field = field;
    this.sim = sim;
    this.host = host;
    this.ghost = scene.add.container(0, 0).setDepth(DEPTH.marker).setVisible(false);
  }

  /** Включить покупку машины type (повторно — выключить), null — выключить. */
  toggle(type: MachineType | null): void {
    this.type = type === null || this.type === type ? null : type;
    this.ghost.removeAll(true);
    if (this.type) {
      const k = this.field.scale;
      this.ghost.add([
        this.scene.add.image(0, 0, tileKey(this.type)).setDisplaySize(56 * k, 56 * k),
        this.scene.add.image(0, -3 * k, iconKey(this.type)).setDisplaySize(34 * k, 34 * k),
      ]);
      this.host.started();
    }
    this.draw();
  }

  /** Клетка под мышью (null — мышь не над картой). */
  hover(cell: { x: number; y: number } | null): void {
    this.cell = cell;
    if (this.type) this.draw();
  }

  /** Перекрасить призрак: мир меняется и без движения мыши (правка петли, энергия). */
  draw(): void {
    const cell = this.cell;
    if (!this.type || !cell) {
      this.ghost.setVisible(false);
      return;
    }
    const ok = this.sim.canBuy(this.type, cell.x, cell.y).ok;
    const c = this.field.screenCenter(cell.x, cell.y);
    this.ghost.setPosition(c.x, c.y).setVisible(true).setAlpha(0.75);
    for (const o of this.ghost.list) (o as Phaser.GameObjects.Image).setTint(ok ? COLOR.ok : COLOR.miss);
  }

  /** Поставить выбранную машину в клетку. */
  buyAt(x: number, y: number): void {
    if (!this.type) return;
    const r = this.sim.buy(this.type, x, y);
    if (!r.ok) {
      this.host.fail(r.reason);
      return;
    }
    this.host.bought();
    this.toggle(null);
  }

  /** Продать купленную машину. true — продана. */
  sell(machineId: number): boolean {
    const r = this.sim.sell(machineId);
    if (!r.ok) this.host.fail(r.reason);
    return r.ok;
  }
}
