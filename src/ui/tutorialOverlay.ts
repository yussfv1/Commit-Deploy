// Обучение на экране: карточка с текстом шага в левом нижнем углу карты, стрелка над нужной клеткой или роботом
// и мягко пульсирующая рамка вокруг нужной кнопки. Какой шаг сейчас и куда он указывает, решает TutorialFlow
// (ui/tutorialModel.ts); этот класс только рисует. Вынесен из GameScene, чтобы сцена оставалась дирижёром.
import type Phaser from 'phaser';
import { BOTTOM, DEPTH, FIELD } from '../render/layout';
import type { LevelData, SimSnapshot } from '../types';
import { t } from './i18n';
import { COLOR, SIZE } from './theme';
import type { Target, TutorialCtx, TutorialFlow } from './tutorialModel';
import { plateKey, txt } from './widgets';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Где на экране то, на что показывает шаг обучения. */
export interface TutorialAnchors {
  /** Точка над клеткой карты (там встаёт стрелка). */
  aboveCell(x: number, y: number): { x: number; y: number };
  /** Точка над роботом или null, если его не видно. */
  aboveRobot(id: number): { x: number; y: number } | null;
  /** Блок программы на панели. */
  block(index: number): Box | null;
  /** Кнопка интерфейса: «Готово», «Копия», «Свой путь», «Старт», «Датчик», телеметрия. */
  ui(id: Extract<Target, { kind: 'ui' }>['id']): Box | null;
}

export class TutorialOverlay {
  private readonly scene: Phaser.Scene;
  private readonly card: Phaser.GameObjects.Container;
  private readonly text: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.text = txt(scene, 16, 34, '', { size: SIZE.body, wrap: 360, lineSpacing: 4 });
    this.bg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
    const label = txt(scene, 16, 14, t('tutorial.label'), { size: SIZE.micro, color: COLOR.dim, caps: true });
    this.card = scene.add.container(FIELD.x + 16, 0, [this.bg, label, this.text]).setDepth(DEPTH.marker).setVisible(false);
    // Стрелка показывает клетку на карте; кнопку («Готово», «Копия», «Старт») обучение обводит рамкой —
    // стрелка над кнопкой налезала бы на соседнюю.
    this.arrow = scene.add.image(0, 0, 'tut_arrow').setDisplaySize(30, 36).setDepth(DEPTH.uiTop).setVisible(false);
    this.frame = scene.add.graphics().setDepth(DEPTH.uiTop).setVisible(false);
  }

  hide(): void {
    this.card.setVisible(false);
    this.arrow.setVisible(false);
    this.frame.setVisible(false);
  }

  /** Показать текущий шаг. show = false — спрятать всё (шага нет, идёт финал или на экране авария). */
  update(flow: TutorialFlow, ctx: TutorialCtx, show: boolean, anchors: TutorialAnchors, s: SimSnapshot, level: LevelData): void {
    const step = flow.current();
    if (!show || !step) {
      this.hide();
      return;
    }
    this.card.setVisible(true);
    const text = t(flow.textKey(ctx) ?? step.key);
    if (this.text.text !== text) {
      this.text.setText(text);
      const w = Math.ceil(Math.max(this.text.width, 120) + 32);
      const h = Math.ceil(this.text.height + 50);
      this.bg.setTexture(plateKey(this.scene, w, h, { fill: COLOR.chrome, stroke: COLOR.rule })).setDisplaySize(w, h);
      this.card.setY(BOTTOM.y - 16 - h);
    }
    const target = flow.target(ctx);
    let at: { x: number; y: number } | null = null;
    let box: Box | null = null;
    if (target?.kind === 'cell') {
      at = anchors.aboveCell(target.x, target.y);
    } else if (target?.kind === 'robot') {
      at = anchors.aboveRobot(target.id);
    } else if (target?.kind === 'block') {
      box = anchors.block(target.index);
    } else if (target?.kind === 'ui') {
      box = anchors.ui(target.id);
      // Кнопки копии не видно (робот не выбран) — стрелка показывает на робота: R или клик по нему.
      if (!box && target.id === 'copy') {
        const r = s.robots[s.robots.length - 1];
        if (r) at = anchors.aboveCell(level.docks[r.dock].x, level.docks[r.dock].y);
      }
      // Кнопки «Свой путь (N)» не видно — стрелка на свободный док: нажать на него тоже значит «новый маршрут».
      if (!box && target.id === 'route') {
        const free = level.docks.findIndex((_, i) => !s.robots.some((r) => r.dock === i));
        if (free >= 0) at = anchors.aboveCell(level.docks[free].x, level.docks[free].y);
      }
    }
    const now = this.scene.time.now;
    this.arrow.setVisible(at !== null);
    if (at) this.arrow.setPosition(at.x, at.y - 18 + Math.sin(now / 180) * 5);
    // Рамка вокруг нужной кнопки: светлая, мягко пульсирует, на соседние кнопки не залезает.
    this.frame.setVisible(box !== null);
    if (box) {
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 220));
      this.frame.clear().lineStyle(2, COLOR.text, pulse).strokeRoundedRect(box.x - box.w / 2 - 3, box.y - box.h / 2 - 3, box.w + 6, box.h + 6, 6);
    }
  }
}
