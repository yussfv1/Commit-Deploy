# Сторонние компоненты

Всё, что команда сделала не сама. Новую строку дописывает тот, кто добавил компонент.

> Проверено 12.11.2026 и заново 14.11.2026 перед финалом по сборке (`npm ci && npm run build`). Версии взяты из `package-lock.json`, лицензии — из
> `package.json` и `LICENSE` каждого пакета, все ссылки открываются. Команды для перепроверки — в конце файла.

**Коротко.** Из чужого в игру (папку `dist/`, которую мы публикуем) попадает только движок Phaser 3.90.0 (MIT) вместе
с кодом, который Phaser вшивает в себя сам. Графику рисует код, логотип и ракета — наши PNG из наших SVG. Звук
и музыку синтезирует код. Шрифт — CD Sans: это PT Sans (ParaType, SIL OFL 1.1) без двух служебных таблиц, переименованный
по правилам OFL (подробно — в «Шрифтах»); два файла лежат в сборке, системные шрифты остались запасными.
ИИ-инструмент — Claude (Anthropic).

## Что попадает в сборку

`npm run build` кладёт в `dist/` только эти файлы. Это вся игра, которую мы публикуем:

| Файл | Что это | Откуда |
|---|---|---|
| `dist/index.html` | Страница игры | Наш `index.html` |
| `dist/assets/index-<хеш>.js` | Весь код одним файлом: наш `src/` и Phaser 3.90.0 вместе с тем, что он вшил в себя (ниже) | Собирает Vite |
| `dist/assets/icons/logo.png` и `dist/assets/logo-<хеш>.png` | Логотип | Копии `public/assets/icons/logo.png` |
| `dist/assets/icons/rocket.png` и `dist/assets/rocket-<хеш>.png` | Ракета | Копии `public/assets/icons/rocket.png` |
| `dist/assets/fonts/main.ttf` и `dist/assets/main-<хеш>.ttf` | Шрифт CD Sans Regular — изменённый PT Sans Regular (ParaType, SIL OFL 1.1) | Копии `public/assets/fonts/main.ttf` |
| `dist/assets/fonts/main-bold.ttf` и `dist/assets/main-bold-<хеш>.ttf` | Шрифт CD Sans Bold — изменённый PT Sans Bold (ParaType, SIL OFL 1.1) | Копии `public/assets/fonts/main-bold.ttf` |
| `dist/assets/fonts/ofl-ptsans.txt` | Текст лицензии SIL OFL 1.1 для PT Sans и CD Sans | Копия `public/assets/fonts/ofl-ptsans.txt` |

Копию с хешем в имени Vite кладёт, когда код подключает картинку или шрифт через `import.meta.glob`. Байты у всех копий одинаковые.

Резервная сборка `build/web/index.html` (собирает `node scripts/make-offline.mjs`) — та же игра одним файлом для запуска
без интернета: код из `dist/assets/index-<хеш>.js`, обе PNG и оба файла шрифта встроены в страницу как `data:`-адреса
(2,1 МБ). Чужого в ней ровно столько же, сколько в `dist/`: Phaser 3.90.0 с тем, что он вшил в себя, и шрифт CD Sans
(изменённый PT Sans).

## Библиотеки и инструменты

### В сборке игры

| Компонент | Версия | Лицензия | Ссылка | Где используется |
|---|---|---|---|---|
| Phaser | 3.90.0 | MIT | https://github.com/phaserjs/phaser | Игровой движок (входит в сборку): сцены, отрисовка WebGL/Canvas, ввод. В сборку попадает файл `phaser/dist/phaser.js` из `node_modules`. Физику игра не включает, встроенный звук Phaser выключен |

Внутри `phaser/dist/phaser.js` Phaser сам вшил чужой код, и он попадает в нашу сборку вместе с Phaser. Версии и
лицензии — из заголовков в этом файле и из репозиториев авторов:

| Компонент | Версия | Лицензия | Ссылка | Где используется |
|---|---|---|---|---|
| eventemitter3 (Arnout Kazemier) | Phaser требует `^5.0.1`, в `package-lock.json` — 5.0.4 | MIT | https://github.com/primus/eventemitter3 | События внутри Phaser |
| Matter.js (Liam Brummitt) | 0.20.0 | MIT | https://github.com/liabru/matter-js | Физический движок в составе Phaser. Игра физику не включает: код просто лежит в файле Phaser |
| earcut (Mapbox) | 2.2.4 | ISC | https://github.com/mapbox/earcut | Разбиение многоугольников на треугольники (`Phaser.Geom.Polygon.Earcut`) |
| Simplify.js (Vladimir Agafonkin) | не указана, в Phaser: «Based on Simplify.js» | BSD-2-Clause | https://github.com/mourner/simplify-js | Упрощение ломаных (`Phaser.Geom.Polygon.Simplify`) |

### Инструменты разработки (в сборку не входят)

| Компонент | Версия | Лицензия | Ссылка | Где используется |
|---|---|---|---|---|
| TypeScript | 7.0.2 | Apache-2.0 | https://www.typescriptlang.org | Язык, проверка типов (только при разработке) |
| Vite | 8.3.7 | MIT | https://vite.dev | Сборка и сервер разработки (только при разработке) |
| Vitest | 5.1.0 | MIT | https://vitest.dev | Тесты (только при разработке) |
| Node.js | `>=20.19` по `package.json`, в CI — 24 | MIT | https://nodejs.org | Среда для сборки и тестов (только при разработке) |
| npm | идёт вместе с Node.js | Artistic-2.0 | https://github.com/npm/cli | Установка пакетов строго по `package-lock.json` (`npm ci`) |

Всего в `package-lock.json` 83 пакета. Зависимостей у игры две: `phaser` и его `eventemitter3` (в сборку она попадает
копией внутри `phaser/dist/phaser.js`). Остальные 81 нужны только для разработки. 47 из них необязательные: сборки инструментов под разные ОС (ставится только своя) и `fsevents`
для macOS.

| Лицензия | Пакетов | Какие |
|---|---|---|
| MIT | 46 | phaser, eventemitter3, vite, vitest, rolldown и 15 его сборок под ОС, postcss, chai и другие |
| Apache-2.0 | 23 | typescript и 20 его сборок под ОС, detect-libc, expect-type |
| MPL-2.0 | 12 | lightningcss 1.33.0 и 11 его сборок под ОС (проверено вручную, см. ниже) |
| ISC | 1 | picocolors |
| BSD-3-Clause | 1 | source-map-js |

GPL, AGPL и LGPL нет. MPL-2.0 стоит у lightningcss: это инструмент для CSS и зависимость Vite (`^1.33.0`). Условия
MPL-2.0 касаются распространения файлов самой lightningcss. Мы её не меняем и не распространяем, в `dist/` её кода нет.

### Инфраструктура и CI

| Компонент | Версия | Лицензия | Ссылка | Где используется |
|---|---|---|---|---|
| actions/checkout | v7 | MIT | https://github.com/actions/checkout | `.github/workflows/ci.yml` и `.github/workflows/deploy.yml`: забрать код |
| actions/setup-node | v7 | MIT | https://github.com/actions/setup-node | Там же: поставить Node.js 24 и кэш npm |
| actions/upload-pages-artifact | v5 | MIT | https://github.com/actions/upload-pages-artifact | `.github/workflows/deploy.yml`: упаковать `dist/` |
| actions/deploy-pages | v5 | MIT | https://github.com/actions/deploy-pages | `.github/workflows/deploy.yml`: выложить сборку на GitHub Pages |
| GitHub Actions и GitHub Pages | — | Сервис GitHub, в сборку не входит | https://docs.github.com/en/pages | Тесты и сборка на каждый Pull Request, запасной адрес игры https://yussfv1.github.io/Commit-Deploy/ |
| Vercel | — | Сервис Vercel, в сборку не входит | https://vercel.com/docs | Основной адрес игры https://commit-deploy.vercel.app/: собирает `main` командой `npm run build`, на каждый Pull Request — отдельная ссылка |

## AI-инструменты

| Инструмент | Для чего | Ответственность |
|---|---|---|
| Claude (Claude Code), Anthropic | Помощь в написании кода, тестов и документации | Идея, архитектура, проверка и итоговые решения — команда |
| Claude Code, модель Claude Opus 5.5 | Жалгасхан: экран, управление, синтез звука, иконка вкладки; 13–14.11 к финалу — авария «Линия встала» и «Заново с роботами», показ мышью, музыка кодом, «Продолжить», `DeployBot.java`, пересборка шрифта. Ерсултан: уровни и баланс, тексты, меню паузы, SVG логотипа и ракеты. Асмир (12.11): карты шести уровней и тест их решений, пиксельные роботы, легенда машин, светлая тема | Идея, архитектура, проверка и итоговые решения — команда |
| Claude Code, модель Claude Fable 5.2 | Асмир (11.11): каркас проекта, симуляция и её тесты, CI | Идея, архитектура, проверка и итоговые решения — команда |
| Claude (claude.ai), Anthropic | План работы команды | Идея, роли и решения в плане — команда |

Сайт Claude Code: https://claude.com/product/claude-code. В истории коммитов работа с Claude видна по подписям
`Co-Authored-By: Claude Opus 5.5` и `Co-Authored-By: Claude Fable 5.2`. Других ИИ-инструментов нет ни в истории
коммитов, ни в заметках `docs/notes-*.md`. Нейросетей, которые сами рисуют картинки или делают звук и музыку, мы не
использовали. Логотип и ракету Ерсултан сделал SVG-кодом вместе с Claude Code, это отмечено в их строках ниже.

## Графика, звук, музыка, шрифты

### Графика

| Файл | Автор / источник | Лицензия | Ссылка |
|---|---|---|---|
| `public/assets/icons/logo.png` | Команда (Ерсултан; 12.11 перерисован под новое название Commit & Deploy). Буквы нарисованы линиями в SVG без шрифтов, с помощью Claude Code; ответственность за контент — команда | Собственная работа | Исходник: `docs/assets-src/logo.svg` |
| `public/assets/icons/rocket.png` | Команда (Ерсултан). Нарисована в SVG с помощью Claude Code по образцу ракеты из кода игры; ответственность за контент — команда | Собственная работа | Исходник: `docs/assets-src/rocket.svg` |
| Остальная графика: поле, машины, роботы, предметы, линии петель, кнопки, панели, эффекты | Команда. Рисует код через Phaser Graphics, с помощью Claude Code; пиксельные роботы собираются кодом из карт пикселей 16×16, записанных в исходнике; ответственность за контент — команда | Собственная работа | Код: `src/render/` (`textures.ts`, `field.ts`, `robotSprites.ts`, `loopDraw.ts`, `fx.ts`), `src/ui/widgets.ts` |
| Иконка вкладки браузера (ракета) | Команда (Жалгасхан). SVG прямо в `index.html` (ссылка `data:`), с помощью Claude Code; ответственность за контент — команда | Собственная работа | Код: `index.html` |

В SVG-исходниках нет текста, шрифтов и вставленных картинок. В сборку PNG копируются без изменений: контрольные суммы
всех копий в `dist/` совпадают с файлами в `public/assets/icons/`.

### Звук и музыка

| Файл | Автор / источник | Лицензия | Ссылка |
|---|---|---|---|
| 15 звуков без файлов: `step` `take` `put` `miss` `sense` `produce` `deliver` `deploy` `click` `error` `countdown` `launch` `win` `lose` `alarm` | Команда (Жалгасхан). Синтезируются кодом через Web Audio API браузера из генераторов тона и шума, с помощью Claude Code; ответственность за контент — команда | Собственная работа | Код: `src/ui/audio.ts` |
| Две мелодии без файлов: `menu` (меню и выбор уровней) и `shift` (линия; восьмая нота — ровно шаг робота, 0,25 с) | Команда (Жалгасхан, 13.11). Синтезируются кодом через Web Audio API: аккорды ля минора, перебор, бас и ударные из генераторов тона и шума, с помощью Claude Code; ответственность за контент — команда | Собственная работа | Код: `src/ui/music.ts` |

Аудиофайлов нет ни в `public/`, ни в `dist/`. Если звук или музыка появятся файлами, каждому файлу нужна строка:
автор, источник, лицензия (своя, CC0 или CC-BY) и ссылка. Музыку из TikTok, YouTube и с других платформ брать нельзя
(ТЗ, раздел 5).

### Шрифты

Весь текст игры — шрифтом CD Sans: это PT Sans (ParaType), тот же шрифт, что в презентации (`docs/presentation/`).
Зачем свой файл: на холсте браузер рисует буквы без ClearType, и системный шрифт выглядел мыльным. Шрифт грузится с того
же адреса, что и игра (`src/render/assets.ts`, `FontFace`), запросов к Google Fonts и другим сайтам нет. `TMinus` — только
внутреннее имя шрифта в коде.

Почему изменён (13.11). В исходных файлах PT Sans есть устаревшая таблица кернинга `kern`: в ней больше 24 тысяч пар,
и её подтаблица не помещается в свой же 16-битный размер. Firefox такую таблицу отбрасывает и пишет в консоль красные
ошибки «downloadable font: kern: Too large subtable». Мы удалили из обоих файлов таблицы `kern` и `DSIG` (подпись,
которая после любой правки всё равно стала бы неверной). Буквы, их набор (717 символов) и кернинг не изменились:
кернинг в шрифте есть и в таблице `GPOS` (функция `kern`), её браузеры и используют. Изменённый шрифт по лицензии
SIL OFL 1.1 нельзя называть зарезервированными именами «PT Sans» и «ParaType», поэтому в таблице имён он называется
CD Sans; авторские права ParaType и текст лицензии сохранены. Правили один раз библиотекой fontTools 4.60.1 (MIT,
https://github.com/fonttools/fonttools) на компьютере Жалгасхана; в репозиторий и сборку она не входит.

| Шрифт | Версия / откуда | Лицензия | Ссылка | Где используется | Входит в сборку |
|---|---|---|---|---|---|
| CD Sans Regular — изменённый PT Sans Regular (ParaType) | Из `PT_Sans-Web-Regular.ttf` репозитория Google Fonts на GitHub (скачан 12.11, SHA-256 `9CC831490532009BAE2B3CE0D39C62ADFC889060BEB421593BFD9D2396D0F10A`); 13.11 удалены таблицы `kern` и `DSIG`, имя изменено; SHA-256 нашего файла `7E2B8127635461DB696ECCA7EE00C312B88A9F0622B30F746792327805B515CD` | SIL OFL 1.1, Reserved Font Names «PT Sans», «ParaType» (в имени изменённого шрифта не используются); текст лицензии: `public/assets/fonts/ofl-ptsans.txt` | https://github.com/google/fonts/tree/main/ofl/ptsans | Весь обычный текст игры (`FONT` и `MONO` → `TMinus`, толщина 400) | да, `public/assets/fonts/main.ttf` |
| CD Sans Bold — изменённый PT Sans Bold (ParaType) | Из `PT_Sans-Web-Bold.ttf` оттуда же (SHA-256 `3128BD5ECF01816E59A23D54C57A7A6B14615B07DB53FF277C77376010265B05`), изменён так же; SHA-256 нашего файла `61002C3BB0967C9740EBA8C9713E7FE3FDD25D263932859C39D8D16A5E3DAEA6` | SIL OFL 1.1, как выше | https://github.com/google/fonts/tree/main/ofl/ptsans | Жирный текст (толщина 700) | да, `public/assets/fonts/main-bold.ttf` |

Если файлы не загрузились (ждём не дольше полутора секунд), игра идёт на запасных системных шрифтах. Их мы не
распространяем: браузер берёт первый из списка `FONT` и `MONO` в `src/ui/theme.ts`, который установлен у игрока.
Текст «нужен JavaScript» в `index.html` использует короткий список: Bahnschrift, PT Sans, Segoe UI, Arial, `sans-serif`.

Запасные системные шрифты:

| Шрифт | Версия / откуда | Лицензия | Ссылка | Где используется | Входит в сборку |
|---|---|---|---|---|---|
| Bahnschrift (Microsoft) | Из Windows 10 и 11 | Проприетарная, Microsoft; входит в Windows | https://learn.microsoft.com/en-us/typography/font-list/bahnschrift | Запасной на Windows (компьютер жюри) | нет |
| PT Sans (ParaType) | Из macOS | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/ptsans | Запасной на macOS | нет |
| Segoe UI (Microsoft) | Из Windows 10 и 11 | Проприетарная, Microsoft; входит в Windows | https://learn.microsoft.com/en-us/typography/font-list/segoe-ui | Запасной | нет |
| Roboto (The Roboto Project Authors) | Если установлен у игрока | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/roboto | Запасной | нет |
| Helvetica Neue (Linotype) | Из macOS | Проприетарная, Linotype; входит в macOS | https://support.apple.com/en-us/120414 | Запасной | нет |
| Arial (Monotype) | Из Windows и macOS | Проприетарная, Monotype; входит в Windows и macOS | https://learn.microsoft.com/en-us/typography/font-list/arial | Запасной | нет |
| PT Mono (ParaType) | Из macOS | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/ptmono | Моноширинный (`MONO`) на macOS: код программы робота в боковой панели и подписи клавиш в меню | нет |
| Consolas (Microsoft) | Из Windows 10 и 11 | Проприетарная, Microsoft; входит в Windows | https://learn.microsoft.com/en-us/typography/font-list/consolas | Моноширинный на Windows | нет |
| Cascadia Mono (Microsoft) | Идёт с Windows Terminal | SIL OFL 1.1 | https://github.com/microsoft/cascadia-code | Запасной моноширинный | нет |
| Menlo (Apple) | Из macOS | Проприетарная, Apple; входит в macOS | https://support.apple.com/en-us/120414 | Запасной моноширинный | нет |
| DejaVu Sans Mono | Если установлен у игрока | Лицензия Bitstream Vera, изменения DejaVu — public domain | https://dejavu-fonts.github.io/License.html | Запасной моноширинный | нет |
| `sans-serif`, `monospace` | — | — | — | Последний запасной: шрифт браузера по умолчанию | нет |

### Презентация

`docs/presentation.pdf` собран из нашего `docs/presentation/presentation.html`; кадры игры в `docs/presentation/assets/screens/`
сняты с холста нашей игры. Чужих картинок в презентации нет.

| Что | Откуда | Лицензия | Ссылка | Где |
|---|---|---|---|---|
| PT Sans, PT Sans Narrow, PT Mono (ParaType) | Системные или Google Fonts (флаг `--web-fonts` в `tools/build.mjs`) | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl | Текст слайдов, встроены в PDF |
| Google Chrome | Установленный браузер | Проприетарная, Google | https://www.google.com/chrome/ | Печать PDF (`tools/build.mjs`), в репозиторий не входит |
| node-qrcode 1.5.4 | npm, ставился во временную папку, в репозиторий не входит | MIT | https://github.com/soldair/node-qrcode | QR-коды на слайдах 6 и 10 на адрес commit-deploy.vercel.app (13.11, уровень коррекции M, тихая зона 4 модуля) |
| jsQR 1.4.0 | npm, там же | Apache-2.0 | https://github.com/cozmo/jsQR | Проверка: каждый QR декодирован обратно в свой адрес |
| Core Image (Apple) | Из macOS | Проприетарная, Apple; входит в macOS | https://developer.apple.com/documentation/coreimage | Штатный генератор QR на Mac (`tools/make_qr.py`, `tools/qr_gen.swift`), адреса в нём те же |

## Что не используется

| Чего нет | Как проверено (номера команд — в конце файла) |
|---|---|
| Чужих картинок, спрайтов, тайлов и иконок | Картинки самой игры: `logo.png`, `rocket.png` и их SVG-исходники (команда 3; остальные картинки репозитория — скриншоты и графика презентации в `docs/presentation/`, в игру они не попадают). В `dist/` из картинок только копии `logo.png` и `rocket.png` (команда 2) |
| Звуковых и музыкальных файлов | В `public/` и `dist/` нет `.mp3`, `.wav`, `.ogg`, `.m4a` (команды 2 и 3): звук и музыку синтезирует код |
| Других файлов шрифтов | Кроме двух файлов CD Sans (`main.ttf`, `main-bold.ttf`) нет `.woff`, `.woff2`, `.ttf`, `.otf` (команды 2 и 3); запасные шрифты указаны только именами (команда 4) |
| Чужого кода, кроме Phaser | Карта исходников сборки: из `node_modules` в игру попадает один файл — `phaser/dist/phaser.js`, остальное — наши файлы из `src/` и `public/` (команда 7) |
| Внешних запросов, CDN, API, рекламы и аналитики | Адреса в коде и сборке (команда 5), других нет: пространства имён `www.w3.org` (SVG, XHTML); `phaser.io` внутри Phaser — это текст баннера в консоли браузера и значение по умолчанию поля `gameURL`, по нему ничего не загружается; в комментариях к коду может встречаться адрес нашей же игры `yussfv1.github.io/Commit-Deploy`. В сеть ходит только `src/render/assets.ts`, и только за своими файлами `assets/` рядом с игрой |
| Сбора персональных данных | `src/ui/storage.ts`: в `localStorage` браузера лежат только громкость, язык, тема оформления (тёмная или светлая), рекорды уровней (числа) и автосохранение незаконченного уровня (роботы, их программы, время). На сервер ничего не уходит |
| Чужих уровней, персонажей, логотипов и брендов | Уровни `src/data/levels/` и вся графика сделаны командой. Игры, которые нас вдохновили, названы на экране «Об игре»: The Last Clockwinder, The Farmer Was Replaced, игры Zachtronics. Их код, арт и уровни мы не использовали |

## Соответствие разделу 5 ТЗ

| Пункт ТЗ | Требование | Где ответ в этом файле |
|---|---|---|
| Спрайты, тайлы, анимации | Свои или CC0/CC-BY; автор и лицензия | «Графика»: всё своё, автор указан |
| Музыка и звук | Свои или CC0/CC-BY; автор и лицензия | «Звук и музыка»: звук и музыка свои, синтез кодом |
| Шрифты | OFL/CC0; лицензия | «Шрифты»: CD Sans — изменённый PT Sans, SIL OFL 1.1 (что изменено и почему — там же), текст лицензии лежит рядом с файлами; запасные системные шрифты не распространяем |
| Библиотеки | Open source; версия и лицензия | «В сборке игры», «Инструменты разработки», «Инфраструктура и CI» |
| AI-ассеты | Инструмент и ответственность | «AI-инструменты»; логотип, ракета, звук, музыка и иконка вкладки — в разделах «Графика» и «Звук и музыка» |
| Движок | Название и версия | Phaser 3.90.0, MIT — «В сборке игры» |
| Нельзя: ассеты с неизвестной лицензией, ripped assets, бренды, музыка с платформ, чужие уровни, код и арт без источника | — | «Что не используется» |
| Персональные данные, телеметрия, аналитика | Не собирать | «Что не используется». Панель «Телеметрия» в игре показывает работу роботов и машин внутри уровня, это не данные игрока |

## Как перепроверить

Из корня репозитория (на Windows — в Git Bash):

```bash
npm ci && npm run build                     # 1. установка строго по package-lock.json и сборка в dist/
find public dist -type f                    # 2. все файлы public/ и сборки
git ls-files | grep -i -E '\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|mp3|wav|ogg|m4a|mp4)$'   # 3. картинки, шрифты, звук в репозитории
grep -rn -E "font-family|fontFamily|FontFace|@font-face" index.html src   # 4. где названы шрифты
grep -rEoh "https?://[^\"'\` )]+" src index.html dist | sort -u            # 5. все адреса в коде и сборке
npm ls --omit=dev --all                     # 6. что идёт в игру: phaser@3.90.0 и eventemitter3@5.0.4
npx vite build --sourcemap --outDir /tmp/tm-map --emptyOutDir             # 7. сборка с картой исходников во временную папку...
node -e "const d='/tmp/tm-map/assets/',fs=require('fs');const m=JSON.parse(fs.readFileSync(d+fs.readdirSync(d).find(f=>f.endsWith('.map'))));console.log(m.sources.filter(s=>s.includes('node_modules')))"   # ...и чужие файлы в ней
git log --format=%B | grep -i co-authored | sort | uniq -c                # 8. подписи ИИ в коммитах
```
