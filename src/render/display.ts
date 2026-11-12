// Чёткая картинка на любом экране: внутреннее разрешение холста подстраивается под окно,
// а камера каждой сцены приближает мир так, чтобы логический размер оставался 1280×720.
import type Phaser from 'phaser';
import { FrameGovernor } from './frameGovernor';
import { H, W } from './layout';

const RESCALE = 'tminus-rescale';
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
let renderScale = 1;
let scaleCap = MAX_SCALE;
let reapply: (() => void) | null = null;

export const getRenderScale = (): number => renderScale;

/**
 * Во сколько раз холст плотнее логических 1280×720: от 0,5 до 2.
 * Ширина холста совпадает с числом настоящих пикселей экрана под игрой (W × scale — целое число),
 * поэтому браузеру не нужно растягивать или сжимать картинку: нет ни мыла, ни ряби на тонких линиях.
 * Раньше масштаб округлялся до 0,05, и холст на десяток пикселей не совпадал с экраном — отсюда было мыло.
 * cap — потолок: его опускают, когда компьютер не держит кадры на большом холсте.
 */
export function computeScale(displayWidth: number, devicePixelRatio: number, cap = MAX_SCALE): number {
  const raw = (displayWidth * devicePixelRatio) / W;
  if (!Number.isFinite(raw)) return 1;
  const top = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cap));
  return Math.round(Math.min(top, Math.max(MIN_SCALE, raw)) * W) / W;
}

/** Сменить потолок чёткости и сразу пересчитать размер холста. */
export function setScaleCap(cap: number): void {
  scaleCap = cap;
  reapply?.();
}

export function installDisplay(game: Phaser.Game): void {
  const apply = (): void => {
    const scale = computeScale(game.scale.displaySize.width, window.devicePixelRatio || 1, scaleCap);
    const w = Math.round(W * scale);
    const h = Math.round(H * scale);
    if (w === game.scale.gameSize.width && h === game.scale.gameSize.height) return;
    renderScale = w / W;
    game.scale.setGameSize(w, h);
    game.events.emit(RESCALE, renderScale);
  };
  reapply = apply;
  game.scale.on('resize', apply);
  apply();
  // Слабый компьютер не держит кадры на большом холсте — понижаем чёткость, пока не станет плавно.
  const governor = new FrameGovernor();
  game.events.on('step', (time: number, delta: number) => {
    const cap = governor.sample(delta, time, renderScale);
    if (cap !== null) setScaleCap(cap);
  });
}

/** Камера сцены всегда показывает ровно 1280×720 логических пикселей. */
export function fitCamera(scene: Phaser.Scene): void {
  const refit = (): void => {
    const cam = scene.cameras.main;
    cam.setZoom(renderScale);
    cam.centerOn(W / 2, H / 2);
  };
  refit();
  scene.game.events.on(RESCALE, refit);
  scene.events.once('shutdown', () => scene.game.events.off(RESCALE, refit));
}

/** Подписка на смену масштаба — для слоёв, которые рисуют в свою текстуру. */
export function onRescale(scene: Phaser.Scene, fn: (scale: number) => void): void {
  scene.game.events.on(RESCALE, fn);
  scene.events.once('shutdown', () => scene.game.events.off(RESCALE, fn));
}
