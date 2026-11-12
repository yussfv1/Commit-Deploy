// Резервная сборка: вся игра в одном HTML-файле — build/web/index.html. Открывается двойным щелчком
// (с диска или флешки) без интернета, сервера и установки. Обычную сборку из dist/ так открыть нельзя:
// браузер не загружает JS-модули по file://, поэтому код и картинки встроены прямо в страницу.
//
// Запуск из корня репозитория:  node scripts/make-offline.mjs  [путь к файлу, по умолчанию build/web/index.html]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(repo, 'build/web/index.html'));
const MIME = { '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };

execSync('npm run build', { cwd: repo, stdio: 'inherit' });
const dist = join(repo, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const tag = html.match(/<script type="module" crossorigin src="\.\/assets\/([^"]+\.js)"><\/script>/);
if (!tag) throw new Error('В dist/index.html не найден скрипт сборки');
let js = readFileSync(join(dist, 'assets', tag[1]), 'utf8');

// Картинки, звуки и шрифт из сборки — внутрь кода как data: адреса (по file:// их иначе не загрузить).
let inlined = 0;
js = js.replace(/new URL\((["'`])([\w.-]+\.(?:png|wav|mp3|woff2))\1,\s*import\.meta\.url\)/g, (whole, _q, file) => {
  const path = join(dist, 'assets', file);
  if (!existsSync(path)) return whole;
  inlined++;
  return `new URL(${JSON.stringify(`data:${MIME[extname(file)]};base64,${readFileSync(path).toString('base64')}`)})`;
});
// Внутри <script> не должно встречаться «</script» — экранируем.
js = js.replace(/<\/script/gi, '<\\/script');
html = html.replace(tag[0], () => `<script type="module">${js}</script>`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Готово: ${out}\nРазмер: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} МБ, встроено файлов: ${inlined}`);
