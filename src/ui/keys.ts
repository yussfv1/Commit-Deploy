// Клавиши сцены — каждое нажатие ровно один раз.
//
// Phaser 3.90 обрабатывает клавиатуру сразу на каждое событие браузера: кладёт его в очередь кадра и заново
// прогоняет ВСЮ очередь (KeyboardManager.onKeyDown → MANAGER_PROCESS → KeyboardPlugin.update). Очередь чистится
// только в конце кадра. Если в один кадр пришли несколько событий — быстрое нажатие двух клавиш, клавиша отпущена
// после того, как нажата следующая, длинный кадр на слабом ноутбуке, — более раннее нажатие доходит до обработчика
// второй и третий раз. В показе это лишние шаги в программе робота: «влево, вверх» записывалось как
// «влево, влево, вверх, влево, вверх». Phaser отдаёт тот же объект события, поэтому достаточно помнить, какие события
// этот обработчик уже видел.
import type Phaser from 'phaser';

/** Обёртка обработчика: одно и то же событие клавиатуры второй раз не проходит. */
export function once(handler: (ev: KeyboardEvent) => void): (ev: KeyboardEvent) => void {
  const seen = new WeakSet<KeyboardEvent>();
  return (ev) => {
    if (seen.has(ev)) return;
    seen.add(ev);
    handler(ev);
  };
}

/** Нажатия клавиш в сцене: каждое событие — один вызов handler. */
export function onKeyDown(scene: Phaser.Scene, handler: (ev: KeyboardEvent) => void): void {
  scene.input.keyboard?.on('keydown', once(handler));
}
