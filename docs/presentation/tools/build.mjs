#!/usr/bin/env node
// Сборка presentation.pdf из presentation.html через Google Chrome по CDP — без npm-зависимостей.
//   node tools/build.mjs            PDF 1920 × 1080 pt + проверка вёрстки и самого PDF
//   node tools/build.mjs --web-fonts  не блокировать Google Fonts (на машине без PT Sans в системе)
// На Mac дополнительно: swift tools/pdf_render.swift … и swift tools/qr_decode.swift … (см. README.md)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'presentation.html');
// В репозитории исходник лежит в docs/presentation/, а PDF — в docs/presentation.pdf (структура из ТЗ).
const OUT = process.env.OUT ?? (basename(dirname(ROOT)) === 'docs' ? join(ROOT, '..', 'presentation.pdf') : join(ROOT, 'presentation.pdf'));
const args = new Set(process.argv.slice(2));
const CHROME = process.env.CHROME ?? {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  linux: 'google-chrome',
}[platform()];

const PORT = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'cd-deck-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
  '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws; let id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? 'eval failed');
  return m.result?.result?.value;
};

// Проверка вёрстки в самой странице: слова, поля, наезды, висячие короткие слова, контраст, оранжевый.
const AUDIT = String.raw`(() => {
  const SHORT = new Set('в во на с со к ко у о об от до по за из без для при про над под и а но не ни что как или ты он мы их это'.split(' '));
  const PUN = /^[—–·:;,.!?«»„“"()\-−→]+$/u;
  const words = (t) => t.split(/[\s\u00a0]+/u).filter((w) => w && !PUN.test(w));
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const BG = [9, 17, 27];
  const ORANGE = 'rgb(255, 122, 47)';
  const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  const res = [];
  document.querySelectorAll('.slide').forEach((s, i) => {
    const sr = s.getBoundingClientRect();
    const rel = (r) => ({ x: Math.round(r.left - sr.left), y: Math.round(r.top - sr.top), r: Math.round(r.right - sr.left), b: Math.round(r.bottom - sr.top) });
    const texts = [...s.querySelectorAll(':scope > p, :scope > h1, :scope > a.cap, :scope > a.lnk')].filter((el) => el.textContent.trim());
    const head = [], body = [], issues = [], lines = [];
    for (const el of texts) {
      const c = el.cloneNode(true); c.querySelectorAll('.need').forEach((n) => n.remove()); c.querySelectorAll('br').forEach((n) => n.replaceWith(' '));
      (el.hasAttribute('data-head') ? head : body).push(...words(c.textContent));
      // строки и висячие короткие слова
      const toks = []; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        if (n.parentElement.closest('.need')) continue;
        const re = /[^ \n\t]+/g; let m;
        while ((m = re.exec(n.nodeValue))) {
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          const rr = r.getClientRects(); if (rr.length) toks.push({ w: m[0], top: rr[0].top, bot: rr[0].bottom, n: rr.length });
        }
      }
      const brk = (t, u) => u.top >= t.bot - 2; let nl = toks.length ? 1 : 0; toks.forEach((t, k) => { if (k && brk(toks[k - 1], t)) nl++; });
      lines.push(nl + '×«' + el.textContent.trim().slice(0, 28) + '»');
      toks.forEach((t, k) => {
        if (t.n > 1) issues.push('слово разорвано: ' + t.w);
        if (k < toks.length - 1 && brk(t, toks[k + 1])) {
          const last = t.w.split('\u00a0').pop().toLowerCase().replace(/[^а-яёa-z-]/giu, '');
          if (SHORT.has(last)) issues.push('висит «' + t.w + '» в конце строки');
        }
      });
      // поля, переполнение
      const b = rel(el.getBoundingClientRect());
      if ((b.x < (el.hasAttribute('data-optical') ? 110 : 119)) || b.r > 1801 || b.y < 95 || b.b > 985) issues.push('вне полей: «' + el.textContent.trim().slice(0, 30) + '» ' + JSON.stringify(b));
      if (el.scrollWidth > el.clientWidth + 1) issues.push('переполнение: «' + el.textContent.trim().slice(0, 30) + '»');
      // контраст каждого цветного куска текста
      for (const part of [el, ...el.querySelectorAll('*')]) {
        if (part.closest('.need') && part !== el) continue;
        const own = [...part.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
        if (!own) continue;
        const cs = getComputedStyle(part); const k = ratio(rgb(cs.color), BG); const px = parseFloat(cs.fontSize);
        const need = px >= 24 ? 3 : 4.5;
        if (k < 4.5 && !(k >= need)) issues.push('контраст ' + k.toFixed(2) + ' при ' + px + ' px: «' + part.textContent.trim().slice(0, 24) + '»');
        if (cs.color === 'rgb(92, 110, 134)' && px < 24) issues.push('#5c6e86 мельче 24 px: «' + part.textContent.trim().slice(0, 24) + '»');
      }
    }
    // наезды: текст × текст, текст × кадр/QR/логотип
    const boxes = texts.map((el) => ({ b: rel(el.getBoundingClientRect()), t: el.textContent.trim().slice(0, 24) }))
      .concat([...s.querySelectorAll(':scope > figure.frame, :scope > a.qr, :scope > svg.logo')]
        .map((el) => ({ b: rel(el.getBoundingClientRect()), t: '[' + (el.tagName === 'svg' ? 'логотип' : el.className) + ']' })))
      .concat([...s.querySelectorAll(':scope > svg.nav .pet')].map((el) => ({ b: rel(el.getBoundingClientRect()), t: '[робот]' })));
    for (let a = 0; a < boxes.length; a++) for (let c = a + 1; c < boxes.length; c++)
      if (hit(boxes[a].b, boxes[c].b)) issues.push('наезжает: «' + boxes[a].t + '» × «' + boxes[c].t + '»');
    // кадры не должны залезать на линию метро внизу
    s.querySelectorAll(':scope > figure.frame').forEach((f) => { const b = rel(f.getBoundingClientRect()); if (b.b > 984) issues.push('кадр ниже поля: ' + JSON.stringify(b)); });
    // оранжевый: элементы с data-accent и всё оранжевое вне их (кадры игры не считаются)
    const accents = [...s.querySelectorAll('[data-accent]')].map((e) => e.dataset.accent);
    const stray = [...s.querySelectorAll('*')].filter((e) => e.tagName !== 'IMG' && !e.closest('[data-accent]') && (() => {
      const cs = getComputedStyle(e); return [cs.color, cs.fill, cs.stroke, cs.backgroundColor, cs.borderTopColor]
        .some((v) => v === ORANGE) && (e.tagName !== 'P' && e.tagName !== 'H1' && e.tagName !== 'SECTION' || cs.color === ORANGE);
    })()).map((e) => e.tagName.toLowerCase() + (e.className?.baseVal ?? e.className ?? ''));
    const needs = [...s.querySelectorAll('.need')].map((n) => n.textContent);
    const ink = [...s.querySelectorAll(':scope > h1, :scope > .timer, :scope > .num, :scope > .h')].map((el) => {
      const cs = getComputedStyle(el); const cv = document.createElement('canvas').getContext('2d'); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const m = cv.measureText(el.textContent.trim().split(/\s/)[0]); const b = rel(el.getBoundingClientRect());
      return Math.round((b.x - m.actualBoundingBoxLeft) * 10) / 10 + '«' + el.textContent.trim().slice(0, 8) + '»'; });
    res.push({ ink, slide: i + 1, head: head.length, body: body.length, headText: head.join(' '), bodyText: body.join(' '), lines, issues, accents, stray, needs });
  });
  const imgs = [...document.images].map((im) => ({ src: im.getAttribute('src'), ok: im.complete && im.naturalWidth === 2048 && im.naturalHeight === 1152 }));
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
  return { slides: res, badImages: imgs.filter((x) => !x.ok), images: imgs.length, links };
})()`;

// Переходы между страницами (/Trans): их показывает Adobe Acrobat в полноэкранном режиме (Ctrl+L); другие
// просмотрщики их просто не используют. Страницы не переписываются — новое описание страниц дописывается в конец
// файла с собственной таблицей xref (обычное инкрементальное обновление PDF).
function addTransitions(buf) {
  const s = buf.toString('latin1');
  const pages = [...s.matchAll(/(\d+) 0 obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*endobj/g)].filter((m) => /\/Type\s*\/Page(?![s\w])/.test(m[2]));
  const prev = s.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  const size = [...s.matchAll(/\/Size\s+(\d+)/g)].pop();
  const root = s.match(/\/Root\s+(\d+ \d+ R)/), info = s.match(/\/Info\s+(\d+ \d+ R)/);
  if (!pages.length || !prev || !size || !root || /\/Trans\s*<</.test(s)) return buf;
  let out = s.endsWith('\n') ? s : s + '\n';
  const offs = [];
  for (const m of pages) {
    offs.push([Number(m[1]), out.length]);
    out += `${m[1]} 0 obj\n<<${m[2]} /Trans <</Type /Trans /S /Push /Di 180 /D 0.6>> >>\nendobj\n`;
  }
  const xref = out.length;
  out += 'xref\n' + offs.sort((a, b) => a[0] - b[0]).map(([num, o]) => `${num} 1\n${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<</Size ${size[1]} /Root ${root[1]}${info ? ' /Info ' + info[1] : ''} /Prev ${prev[1]}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function pdfFacts(buf) {
  const s = buf.toString('latin1');
  return {
    pages: new Set([...s.matchAll(/(\d+) 0 obj\s*<<(?:(?!endobj)[\s\S])*?\/Type\s*\/Page(?![s\w])/g)].map((m) => m[1])).size,
    boxes: [...new Set([...s.matchAll(/\/MediaBox\s*\[\s*([-\d.\s]+)\]/g)].map((m) => m[1].trim().replace(/\s+/g, ' ')))],
    fonts: [...new Set([...s.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)].map((m) => m[1]))],
    fontFiles: (s.match(/\/FontFile[23]?(?=[\s/<])/g) || []).length,
    type3: (s.match(/\/Subtype\s*\/Type3/g) || []).length,
    rects: [...s.matchAll(/\/Rect\s*\[([^\]]*)\]/g)].map((m) => m[1].trim().split(/\s+/).map((v) => Math.round(+v)).join(' ')),
    uris: [...new Set([...s.matchAll(/\/URI\s*\(([^)]*)\)/g)].map((m) => m[1]))],
    objStm: /\/ObjStm/.test(s),
    trans: (s.match(/\/Trans\s*<</g) || []).length,
    title: (s.match(/\/Title\s*\(([^)]*)\)/) || s.match(/\/Title\s*<([0-9A-Fa-f]+)>/) || [])[1] ?? null,
  };
}

try {
  let page;
  for (let i = 0; i < 120 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* ждём */ }
    if (!page) await sleep(150);
  }
  if (!page) throw new Error('Chrome не ответил: проверьте путь CHROME=' + CHROME);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  for (const m of ['Page.enable', 'Network.enable', 'DOM.enable', 'CSS.enable']) await send(m);
  if (!args.has('--web-fonts')) await send('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await send('Page.navigate', { url: pathToFileURL(SRC).href });
  for (let i = 0; i < 100 && (await ev('document.readyState').catch(() => '')) !== 'complete'; i++) await sleep(100);
  await ev('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)');
  await sleep(300);

  // Шрифты, которыми Chrome на самом деле нарисовал каждый текстовый узел.
  await ev(`document.querySelectorAll('.slide').forEach((s, i) => s.querySelectorAll('p, h1, a, span, b').forEach((e, k) => e.setAttribute('data-aid', (i + 1) + '/' + k))); true`);
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelectorAll', { nodeId: doc.result.root.nodeId, selector: '[data-aid]' });
  const used = new Map(); const odd = [];
  for (const nodeId of q.result.nodeIds) {
    const f = await send('CSS.getPlatformFontsForNode', { nodeId });
    for (const x of f.result?.fonts ?? []) {
      const key = `${x.familyName} (${x.postScriptName})`;
      used.set(key, (used.get(key) ?? 0) + x.glyphCount);
      if (!/^PT (Sans|Sans Narrow|Mono)$/.test(x.familyName)) {
        const a = await send('DOM.getAttributes', { nodeId });
        const aid = a.result.attributes[a.result.attributes.indexOf('data-aid') + 1];
        const t = await send('DOM.resolveNode', { nodeId });
        const txt = await send('Runtime.callFunctionOn', { objectId: t.result.object.objectId, functionDeclaration: 'function(){return this.textContent.trim().slice(0,40)}', returnByValue: true });
        odd.push(`слайд ${aid.split('/')[0]}: ${key} в «${txt.result.result.value}»`);
      }
    }
  }
  await ev(`document.querySelectorAll('[data-aid]').forEach((e) => e.removeAttribute('data-aid')); true`);

  const a = await ev(AUDIT);
  console.log('Слайд | заголовок | остальное | оранжевый | замечания');
  let bad = 0;
  for (const s of a.slides) {
    const over = s.head > 8 || (s.slide !== 10 && s.body > 20);
    const orange = s.accents.length + s.stray.length;
    if (over || orange !== 1 || s.issues.length) bad++;
    console.log(`${String(s.slide).padStart(2)} | ${s.head} сл. | ${s.body} сл.${over ? ' ✗' : ''} | ${s.accents.join(', ') || '—'}${s.stray.length ? ' + лишний: ' + s.stray.join(', ') : ''} | ${s.issues.join('; ') || 'ок'}`);
    console.log(`     строки: ${s.lines.join('  ')}`);
    console.log(`     краска с x: ${s.ink.join('  ')}`);
  }
  console.log('Шрифты:', [...used].map(([k, v]) => `${k} — ${v} глифов`).join('; '));
  if (odd.length) console.log('Замены шрифта:\n  ' + odd.join('\n  '));
  console.log('Кадры:', a.images, a.badImages.length ? 'НЕ ЗАГРУЗИЛИСЬ: ' + JSON.stringify(a.badImages) : 'все 2048 × 1152');
  const needs = a.slides.flatMap((s) => s.needs.map((n) => `слайд ${s.slide}: ${n}`));
  if (needs.length) console.log('Метки ⟦нужно⟧:\n  ' + needs.join('\n  '));
  writeFileSync(join(ROOT, 'tools', 'audit.json'), JSON.stringify({ ...a, fonts: [...used], fontSubstitutions: odd }, null, 2));

  // PDF: страница 1920 × 1080 pt (26,667 × 15 in) = 2560 × 1440 CSS px. Вёрстку 1920 × 1080 px увеличиваем через
  // CSS zoom 4/3, а не параметром scale, — так области ссылок совпадают с текстом и QR.
  // Размер листа задаёт @page (иначе Chrome центрирует страницу @page на бумаге и не растягивает).
  await send('Emulation.clearDeviceMetricsOverride');
  await ev(`document.head.insertAdjacentHTML('beforeend', '<style id="pdf-size">@page { size: 1920pt 1080pt; margin: 0 } html { zoom: ' + 4 / 3 + ' }</style>'); true`);
  const pdf = await send('Page.printToPDF', { paperWidth: 1920 / 72, paperHeight: 1080 / 72, scale: 1,
    marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: false });
  if (!pdf.result?.data) throw new Error('printToPDF: ' + JSON.stringify(pdf.error ?? pdf));
  const buf = addTransitions(Buffer.from(pdf.result.data, 'base64'));
  writeFileSync(OUT, buf);
  const f = pdfFacts(buf);
  console.log(`PDF: ${OUT}\n  ${(buf.length / 1048576).toFixed(2)} МиБ, страниц ${f.pages}, MediaBox ${f.boxes.join(' / ')}`);
  console.log(`  шрифты (${f.fonts.length}, встроенных файлов ${f.fontFiles}, Type3 ${f.type3}): ${f.fonts.join(', ')}`);
  console.log(`  переходы страниц (/Trans): ${f.trans}`);
  console.log(`  области ссылок: ${f.rects.join(' | ')}`);
  console.log(`  ссылки: ${f.uris.join(' | ') || 'нет'}${f.objStm ? '  (есть ObjStm — часть объектов сжата)' : ''}`);
  if (f.pages !== 10) { console.log('  ✗ страниц не 10'); bad++; }
  if (bad) process.exitCode = 1;
} catch (e) {
  console.error('ОШИБКА:', e.message); process.exitCode = 2;
} finally {
  try { ws?.close(); } catch { /* закрыт */ }
  proc.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true });
}
