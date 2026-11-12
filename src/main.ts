// Точка входа: создаёт игру Phaser и перечисляет сцены. Вся логика мира — в src/sim, экран её только рисует.
import Phaser from 'phaser';
import { installDisplay } from './render/display';
import { H, W } from './render/layout';
import { BootScene } from './scenes/BootScene';
import { CodeScene } from './scenes/CodeScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { COLOR, css } from './ui/theme';

// Фон страницы вокруг холста — в цвет выбранной темы (в index.html стоит тёмный по умолчанию).
document.body.style.background = css(COLOR.page);
document.body.style.color = css(COLOR.text);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: css(COLOR.page),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  // roundPixels: каждая картинка и надпись встаёт на целый пиксель экрана. Без этого текст с центровкой
  // попадал между пикселями, видеокарта смешивала соседние — и буквы мылились.
  render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
  // Звук игра делает сама через Web Audio (src/ui/audio.ts), встроенный звук Phaser не нужен.
  audio: { noAudio: true },
  disableContextMenu: true,
  banner: false,
  // Порядок важен: сцены ниже по списку рисуются поверх (пауза, итоги и настройки — поверх игры).
  scene: [BootScene, MenuScene, LevelSelectScene, CreditsScene, GameScene, PauseScene, ResultsScene, CodeScene, SettingsScene],
});

game.events.once(Phaser.Core.Events.READY, () => installDisplay(game));

// Только в режиме разработки: доступ к игре из консоли браузера. В сборку для жюри этот код не попадает.
if (import.meta.env.DEV) (window as unknown as { __tminus?: unknown }).__tminus = { game };
