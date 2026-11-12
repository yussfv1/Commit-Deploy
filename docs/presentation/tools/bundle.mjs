#!/usr/bin/env node
// Показ одним файлом: presentation-show.html — тот же presentation.html, но кадры игры и шрифты PT лежат внутри,
// поэтому файл открывается с флешки двойным щелчком на любом компьютере, без интернета и без папки assets.
//   node tools/bundle.mjs
// Шрифты берутся из системных PTSans.ttc / PTMono.ttc (macOS). Лицензия ParaType разрешает встраивать их
// в документы и веб-страницы; копирайт и текст лицензии остаются внутри шрифта (таблица name).
// На машине без этих файлов шрифты не встраиваются — тогда страница возьмёт их с Google Fonts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'presentation.html');
const OUT = join(ROOT, 'presentation-show.html');
const FONTS = '/System/Library/Fonts/Supplemental/';

// Один шрифт из коллекции .ttc → отдельный .ttf: копируем таблицы этого шрифта и пересчитываем смещения.
function ttcFace(file, index) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'ttcf') return b;
  const off = b.readUInt32BE(12 + 4 * index);
  const n = b.readUInt16BE(off + 4);
  const head = Buffer.alloc(12 + 16 * n);
  b.copy(head, 0, off, off + 12);
  const parts = [head];
  let pos = head.length;
  for (let i = 0; i < n; i++) {
    const r = off + 12 + 16 * i;
    const o = b.readUInt32BE(r + 8), l = b.readUInt32BE(r + 12), pad = (4 - (l % 4)) % 4;
    b.copy(head, 12 + 16 * i, r, r + 8);          // тег и контрольная сумма
    head.writeUInt32BE(pos, 12 + 16 * i + 8);
    head.writeUInt32BE(l, 12 + 16 * i + 12);
    parts.push(b.subarray(o, o + l), Buffer.alloc(pad));
    pos += l + pad;
  }
  return Buffer.concat(parts);
}

let html = readFileSync(SRC, 'utf8');
const fonts = [
  ['"CD Narrow"; font-weight: 700; src: local("PT Sans Narrow Bold"), local("PTSans-NarrowBold");', 'PTSans.ttc', 2],
  ['"CD Sans"; font-weight: 400; src: local("PT Sans"), local("PTSans-Regular");', 'PTSans.ttc', 0],
  ['"CD Sans"; font-weight: 700; src: local("PT Sans Bold"), local("PTSans-Bold");', 'PTSans.ttc', 7],
  ['"CD Mono"; font-weight: 400; src: local("PT Mono"), local("PTMono-Regular");', 'PTMono.ttc', 1],
];
let embedded = 0;
for (const [rule, file, index] of fonts) {
  if (!html.includes(rule)) throw new Error('не найдено правило шрифта: ' + rule);
  if (!existsSync(FONTS + file)) continue;
  const ttf = ttcFace(FONTS + file, index).toString('base64');
  html = html.replace(rule, rule.replace(/src: [^;]+;/, `src: url(data:font/ttf;base64,${ttf}) format("truetype");`));
  embedded++;
}
if (embedded === fonts.length) html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/, '');
let images = 0;
html = html.replace(/src="(assets\/screens\/[^"]+\.png)"/g, (m, rel) => {
  images++;
  return `src="data:image/png;base64,${readFileSync(join(ROOT, rel)).toString('base64')}"`;
});
writeFileSync(OUT, html);
console.log(`${basename(OUT)}: ${(html.length / 1048576).toFixed(2)} МиБ, шрифтов внутри ${embedded} из ${fonts.length}, кадров ${images}`);
