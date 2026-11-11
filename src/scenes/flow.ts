// Общее для всех сцен: камера на 1280×720, чёткий текст и плавные переходы затемнением.
import Phaser from 'phaser';
import { fitCamera, onRescale } from '../render/display';
import { refreshTexts, textRes } from '../ui/widgets';

const FADE = { r: 9, g: 17, b: 27 };

/** Вызывается первой строкой в create() каждой сцены. */
export function enter(scene: Phaser.Scene, fade = true): void {
  fitCamera(scene);
  onRescale(scene, () => refreshTexts(scene.children.list, textRes()));
  scene.input.enabled = true;
  if (fade) scene.cameras.main.fadeIn(220, FADE.r, FADE.g, FADE.b);
}

/** Перейти в другую сцену через затемнение. Повторный вызов во время перехода ничего не делает. */
export function go(scene: Phaser.Scene, key: string, data?: object): void {
  if (!scene.input.enabled) return;
  scene.input.enabled = false;
  const cam = scene.cameras.main;
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
  cam.fadeOut(170, FADE.r, FADE.g, FADE.b);
}

/** Идёт ли сейчас переход из этой сцены (клавиши в это время не слушаем). */
export const leaving = (scene: Phaser.Scene): boolean => !scene.input.enabled;
