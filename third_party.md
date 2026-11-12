# Сторонние компоненты

Всё, что команда сделала не сама. Новую строку дописывает тот, кто добавил компонент.

> Проверено 12.11.2026 по сборке (`npm ci && npm run build`). Версии взяты из `package-lock.json`, лицензии — из
> `package.json` и `LICENSE` каждого пакета, все ссылки открываются. Команды для перепроверки — в конце файла.

**Коротко.** Из чужого в игру (папку `dist/`, которую мы публикуем) попадает только движок Phaser 3.90.0 (MIT) вместе
с кодом, который Phaser вшивает в себя сам. Графику рисует код, логотип и ракета — наши PNG из наших SVG. Звук
синтезирует код, музыки нет. Файлов шрифтов нет: игра называет шрифты по имени, и браузер берёт системные.
ИИ-инструмент — Claude (Anthropic).

## Что попадает в сборку

`npm run build` кладёт в `dist/` только эти файлы. Это вся игра, которую мы публикуем:

| Файл | Что это | Откуда |
|---|---|---|
| `dist/index.html` | Страница игры | Наш `index.html` |
| `dist/assets/index-<хеш>.js` | Весь код одним файлом: наш `src/` и Phaser 3.90.0 вместе с тем, что он вшил в себя (ниже) | Собирает Vite |
| `dist/assets/icons/logo.png` и `dist/assets/logo-<хеш>.png` | Логотип | Копии `public/assets/icons/logo.png` |
| `dist/assets/icons/rocket.png` и `dist/assets/rocket-<хеш>.png` | Ракета | Копии `public/assets/icons/rocket.png` |

Копию с хешем в имени Vite кладёт, когда код подключает картинку через `import.meta.glob`. Байты у всех копий одинаковые.

Резервная сборка `build/web/index.html` (собирает `node scripts/make-offline.mjs`) — та же игра одним файлом для запуска
без интернета: код из `dist/assets/index-<хеш>.js` и обе PNG встроены в страницу как `data:`-адреса. Чужого в ней
ровно столько же, сколько в `dist/`: Phaser 3.90.0 и то, что он вшил в себя.

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
| GitHub Actions и GitHub Pages | — | Сервис GitHub, в сборку не входит | https://docs.github.com/en/pages | Тесты и сборка на каждый Pull Request, веб-версия игры https://yussfv1.github.io/t-minus/ |

## AI-инструменты

| Инструмент | Для чего | Ответственность |
|---|---|---|
| Claude (Claude Code), Anthropic | Помощь в написании кода, тестов и документации | Идея, архитектура, проверка и итоговые решения — команда |
| Claude Code, модель Claude Opus 5.5 | Жалгасхан: экран, управление, синтез звука, иконка вкладки. Ерсултан: уровни и баланс, тексты, меню паузы, SVG логотипа и ракеты. Асмир (12.11): карты шести уровней и тест их решений, пиксельные роботы, легенда машин, светлая тема | Идея, архитектура, проверка и итоговые решения — команда |
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
| `public/assets/icons/logo.png` | Команда (Ерсултан). Буквы нарисованы линиями в SVG без шрифтов, с помощью Claude Code; ответственность за контент — команда | Собственная работа | Исходник: `docs/assets-src/logo.svg` |
| `public/assets/icons/rocket.png` | Команда (Ерсултан). Нарисована в SVG с помощью Claude Code по образцу ракеты из кода игры; ответственность за контент — команда | Собственная работа | Исходник: `docs/assets-src/rocket.svg` |
| Остальная графика: поле, машины, роботы, предметы, линии петель, кнопки, панели, эффекты | Команда. Рисует код через Phaser Graphics, с помощью Claude Code; пиксельные роботы собираются кодом из карт пикселей 16×16, записанных в исходнике; ответственность за контент — команда | Собственная работа | Код: `src/render/` (`textures.ts`, `field.ts`, `robotSprites.ts`, `loopDraw.ts`, `fx.ts`), `src/ui/widgets.ts` |
| Иконка вкладки браузера (ракета) | Команда (Жалгасхан). SVG прямо в `index.html` (ссылка `data:`), с помощью Claude Code; ответственность за контент — команда | Собственная работа | Код: `index.html` |

В SVG-исходниках нет текста, шрифтов и вставленных картинок. В сборку PNG копируются без изменений: контрольные суммы
всех копий в `dist/` совпадают с файлами в `public/assets/icons/`.

### Звук и музыка

| Файл | Автор / источник | Лицензия | Ссылка |
|---|---|---|---|
| 14 звуков без файлов: `step` `take` `put` `miss` `sense` `produce` `deliver` `deploy` `click` `error` `countdown` `launch` `win` `lose` | Команда (Жалгасхан). Синтезируются кодом через Web Audio API браузера из генераторов тона и шума, с помощью Claude Code; ответственность за контент — команда | Собственная работа | Код: `src/ui/audio.ts` |
| Музыка | Нет. Код умеет играть `menu.mp3` и `shift.mp3` из `public/assets/music/`, но этих файлов нет, а сам код музыку не синтезирует | — | — |

Аудиофайлов нет ни в `public/`, ни в `dist/`. Если звук или музыка появятся файлами, каждому файлу нужна строка:
автор, источник, лицензия (своя, CC0 или CC-BY) и ссылка. Музыку из TikTok, YouTube и с других платформ брать нельзя
(ТЗ, раздел 5).

### Шрифты

Файлов шрифтов нет ни в репозитории, ни в сборке, и мы шрифты не распространяем. Игра только называет шрифты по имени,
а браузер берёт первый из списка, который установлен у игрока. Списки — `FONT` и `MONO` в `src/ui/theme.ts`. Текст
«нужен JavaScript» в `index.html` использует короткий список: Bahnschrift, PT Sans, Segoe UI, Arial, `sans-serif`.

Первое имя в `FONT` — `TMinus`. Это место под файл шрифта `public/assets/fonts/main.woff2`, которого нет, поэтому
`TMinus` не загружается. Если файл появится, он должен быть под OFL или CC0 и получить здесь строку.

| Шрифт | Версия / откуда | Лицензия | Ссылка | Где используется | Входит в сборку |
|---|---|---|---|---|---|
| Bahnschrift (Microsoft) | Из Windows 10 и 11 | Проприетарная, Microsoft; входит в Windows | https://learn.microsoft.com/en-us/typography/font-list/bahnschrift | Основной шрифт всего текста на Windows (компьютер жюри) | нет |
| PT Sans (ParaType) | Из macOS | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/ptsans | Основной шрифт на macOS | нет |
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

## Что не используется

| Чего нет | Как проверено (номера команд — в конце файла) |
|---|---|
| Чужих картинок, спрайтов, тайлов и иконок | В репозитории 4 картинки: `logo.png`, `rocket.png` и их SVG-исходники (команда 3). В `dist/` из картинок только копии `logo.png` и `rocket.png` (команда 2) |
| Звуковых файлов и музыки | В `public/` и `dist/` нет `.mp3`, `.wav`, `.ogg`, `.m4a` (команды 2 и 3) |
| Файлов шрифтов | Нет `.woff`, `.woff2`, `.ttf`, `.otf` (команды 2 и 3); шрифты указаны только именами (команда 4) |
| Чужого кода, кроме Phaser | Карта исходников сборки: из `node_modules` в игру попадает один файл — `phaser/dist/phaser.js`, остальное — наши файлы из `src/` и `public/` (команда 7) |
| Внешних запросов, CDN, API, рекламы и аналитики | Адреса в коде и сборке (команда 5), других нет: пространства имён `www.w3.org` (SVG, XHTML); `phaser.io` внутри Phaser — это текст баннера в консоли браузера и значение по умолчанию поля `gameURL`, по нему ничего не загружается; в комментариях к коду может встречаться адрес нашей же игры `yussfv1.github.io/t-minus`. В сеть ходит только `src/render/assets.ts`, и только за своими файлами `assets/` рядом с игрой |
| Сбора персональных данных | `src/ui/storage.ts`: в `localStorage` браузера лежат только громкость, язык, тема оформления (тёмная или светлая) и рекорды уровней (числа). На сервер ничего не уходит |
| Чужих уровней, персонажей, логотипов и брендов | Уровни `src/data/levels/` и вся графика сделаны командой. Игры, которые нас вдохновили, названы на экране «Об игре»: The Last Clockwinder, The Farmer Was Replaced, игры Zachtronics. Их код, арт и уровни мы не использовали |

## Соответствие разделу 5 ТЗ

| Пункт ТЗ | Требование | Где ответ в этом файле |
|---|---|---|
| Спрайты, тайлы, анимации | Свои или CC0/CC-BY; автор и лицензия | «Графика»: всё своё, автор указан |
| Музыка и звук | Свои или CC0/CC-BY; автор и лицензия | «Звук и музыка»: звук свой, синтез кодом; музыки нет |
| Шрифты | OFL/CC0; лицензия | «Шрифты»: файлов шрифтов в игре нет, только системные по имени — у каждого владелец и лицензия |
| Библиотеки | Open source; версия и лицензия | «В сборке игры», «Инструменты разработки», «Инфраструктура и CI» |
| AI-ассеты | Инструмент и ответственность | «AI-инструменты»; логотип, ракета, звук и иконка вкладки — в разделах «Графика» и «Звук и музыка» |
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
