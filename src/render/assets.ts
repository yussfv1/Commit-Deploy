// Загрузка файлов роли C из public/assets/ (имена — в docs/assets-list.md). Каждый файл необязателен:
// нет картинки — её рисует код (textures.ts), нет звука — его синтезирует audio.ts.
// Список лежащих файлов Vite составляет при сборке (import.meta.glob), поэтому игра не запрашивает
// несуществующие файлы и в консоли браузера нет ошибок 404. Положили файл — он попадает в список сам.
import type Phaser from 'phaser';
import { MUSIC, SFX, audio } from '../ui/audio';
import { iconKey } from './textures';

const SHIPPED = import.meta.glob('/public/assets/**/*.{png,wav,mp3,woff2}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Адрес файла assets/<path> в сборке или null, если такого файла нет. */
export function assetUrl(path: string, files: Readonly<Record<string, string>> = SHIPPED): string | null {
  return files[`/public/assets/${path}`] ?? null;
}

/** Картинки: public/assets/icons/<имя>.png → текстура icon_<имя>. */
export const ICON_FILES = [
  'ore',
  'plate',
  'fuel',
  'cell',
  'depot',
  'tank',
  'press',
  'assembler',
  'pad',
  'shelf',
  'robot',
  'sensor',
  'energy',
  'star',
  'star_empty',
  'rocket',
  'logo',
] as const;

/** Звуки: public/assets/sfx/<имя>.wav или .mp3 (если лежат оба — берём WAV). */
const SFX_EXT = ['wav', 'mp3'] as const;
const FONT_FAMILY = 'TMinus';
const FONT_FILE = 'fonts/main.woff2';
const TIMEOUT_MS = 8000;

/**
 * Запросить файл рядом с игрой. null — файла нет (или вместо него пришла HTML-страница:
 * так отвечает dev-сервер Vite на любой несуществующий путь).
 */
function request(url: string, type: 'blob' | 'arraybuffer'): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = type;
      xhr.timeout = TIMEOUT_MS;
      xhr.onload = () => {
        const statusOk = xhr.status === 200 || xhr.status === 0;
        const mime = xhr.getResponseHeader('content-type') ?? '';
        resolve(statusOk && !mime.startsWith('text/html') ? (xhr.response as unknown) : null);
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);
      xhr.onabort = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

async function getBlob(url: string): Promise<Blob | null> {
  const r = await request(url, 'blob');
  return r instanceof Blob && r.size > 0 ? r : null;
}

async function getBuffer(url: string): Promise<ArrayBuffer | null> {
  const r = await request(url, 'arraybuffer');
  return r instanceof ArrayBuffer && r.byteLength > 0 ? r : null;
}

function decodeImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.width > 0 && img.height > 0 ? img : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function loadIcon(scene: Phaser.Scene, name: string): Promise<void> {
  const url = assetUrl(`icons/${name}.png`);
  if (!url) return;
  const blob = await getBlob(url);
  if (!blob) return;
  const img = await decodeImage(blob);
  const key = iconKey(name);
  if (img && !scene.textures.exists(key)) scene.textures.addImage(key, img);
}

async function loadSfx(name: string): Promise<void> {
  for (const ext of SFX_EXT) {
    const url = assetUrl(`sfx/${name}.${ext}`);
    if (!url) continue;
    const data = await getBuffer(url);
    if (data) {
      audio.addFile(`sfx_${name}`, data);
      return;
    }
  }
}

async function loadMusic(name: string): Promise<void> {
  const url = assetUrl(`music/${name}.mp3`);
  if (!url) return;
  const data = await getBuffer(url);
  if (data) audio.addFile(`music_${name}`, data);
}

/**
 * Шрифт роли C подключаем, только если файл есть в сборке, — иначе браузер его даже не запрашивает.
 * Ждём загрузку не дольше полутора секунд: дальше игра идёт на системном шрифте.
 */
async function loadFont(): Promise<void> {
  const url = assetUrl(FONT_FILE);
  if (!url || typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  try {
    const face = new FontFace(FONT_FAMILY, `url(${url})`);
    const loaded = face
      .load()
      .then((f) => {
        document.fonts.add(f);
      })
      .catch(() => undefined);
    await Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
  } catch {
    // Шрифт не подключился — останется системный.
  }
}

/** Загрузить всё, что есть. progress получает долю готового от 0 до 1. Никогда не падает. */
export async function loadAssets(scene: Phaser.Scene, progress: (done: number) => void): Promise<void> {
  const total = ICON_FILES.length + SFX.length + MUSIC.length + 1;
  let done = 0;
  const counted = (job: Promise<unknown>): Promise<void> =>
    job
      .catch(() => undefined)
      .then(() => {
        done++;
        progress(Math.min(1, done / total));
      });
  await Promise.all([
    ...ICON_FILES.map((name) => counted(loadIcon(scene, name))),
    ...SFX.map((name) => counted(loadSfx(name))),
    ...MUSIC.map((name) => counted(loadMusic(name))),
    counted(loadFont()),
  ]);
}
