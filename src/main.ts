// Точка входа: создаёт игру Phaser и перечисляет сцены. Вся логика мира — в src/sim, экран её только рисует.
import Phaser from 'phaser';
import { installDisplay } from './render/display';
import { H, W } from './render/layout';
import { BootScene } from './scenes/BootScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameScene } from './scenes/GameScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultsScene } from './scenes/ResultsScene';
import { SettingsScene } from './scenes/SettingsScene';
import { COLOR, css } from './ui/theme';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: css(COLOR.page),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  render: { antialias: true, powerPreference: 'high-performance' },
  // Звук игра делает сама через Web Audio (src/ui/audio.ts), встроенный звук Phaser не нужен.
  audio: { noAudio: true },
  disableContextMenu: true,
  banner: false,
  // Порядок важен: сцены ниже по списку рисуются поверх (пауза, итоги и настройки — поверх игры).
  scene: [BootScene, MenuScene, LevelSelectScene, CreditsScene, GameScene, PauseScene, ResultsScene, SettingsScene],
});

game.events.once(Phaser.Core.Events.READY, () => installDisplay(game));

// Только в режиме разработки: доступ к игре из консоли браузера. В сборку для жюри этот код не попадает.
if (import.meta.env.DEV) (window as unknown as { __tminus?: unknown }).__tminus = { game };
