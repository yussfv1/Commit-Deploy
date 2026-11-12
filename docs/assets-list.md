# Список ассетов

Игра ищет файлы в `public/assets/`. Каждый файл необязателен: если его нет, картинку рисует код
(`src/render/textures.ts`), а звук синтезирует Web Audio (`src/ui/audio.ts`). Положили файл с точным именем —
он появляется в игре без правок кода. Имена — маленькие латинские буквы.

Исходники наших картинок (SVG) лежат в `docs/assets-src/`. PNG из них делается так (Edge есть в каждой Windows):

```
msedge --headless=new --force-device-scale-factor=2 --default-background-color=00000000 --window-size=<ширина>,<высота> --screenshot=<путь к png> file:///<путь к svg>
```

## Картинки — `public/assets/icons/`

PNG с прозрачным фоном, плоский стиль, цвета из палитры игры.

| Файл | Размер | Что на нём | Сейчас в игре |
|---|---|---|---|
| `logo.png` | 904 × 352 | Логотип Commit & Deploy в меню, две строки (вписывается в 400 × 120) | **PNG от C** |
| `rocket.png` | 128 × 256 | Ракета на стартовом столе, низ сопла на 7/8 высоты | **PNG от C** |
| `ore.png` `plate.png` `fuel.png` `cell.png` | 64 × 64 | Предметы: руда, пластина, топливо, ячейка | рисует код |
| `depot.png` `tank.png` `press.png` `assembler.png` `pad.png` `shelf.png` | 64 × 64 | Машины | рисует код |
| `robot.png` `sensor.png` `energy.png` `star.png` `star_empty.png` | 64 × 64 | Робот, датчик, энергия, звёзды | рисует код |

Иконки предметов и машин решили оставить кодовыми: они уже в едином стиле со всей графикой игры.

## Звуки — `public/assets/sfx/` (WAV или MP3)

`step` `take` `put` `miss` `sense` `produce` `deliver` `deploy` `click` `error` `countdown` `launch` `win` `lose` —
пока все синтезируются в `src/ui/audio.ts`.

## Музыка — `public/assets/music/` (MP3)

`menu.mp3`, `shift.mp3` — спокойные синтезаторные лупы. Пока нет. Только своя музыка (BeepBox), никакой из TikTok, YouTube, CapCut.

## Шрифт — `public/assets/fonts/`

Один шрифт OFL с кириллицей и буквами ә ғ қ ң ө ұ ү һ і. Пока нет, игра берёт системный.
