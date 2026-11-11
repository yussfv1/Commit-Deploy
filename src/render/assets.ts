// Загрузка файлов роли C из public/assets/. Имена — из docs/assets-list.md.
// Каждый файл необязателен: если его нет, вместо картинки рисуется заглушка кодом (textures.ts),
// вместо звука играет синтезированный (audio.ts). Положили файл — он появляется в игре без правок кода.
import type Phaser from 'phaser';
import { MUSIC, SFX, audio } from '../ui/audio';
import { iconKey } from './textures';

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

/** Звуки ищем сначала в WAV, потом в MP3: public/assets/sfx/<имя>.wav | .mp3. */
const SFX_EXT = ['wav', 'mp3'] as const;
const FONT_FAMILY = 'TMinus';
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
  const blob = await getBlob(`assets/icons/${name}.png`);
  if (!blob) return;
  const img = await decodeImage(blob);
  const key = iconKey(name);
  if (img && !scene.textures.exists(key)) scene.textures.addImage(key, img);
}

/** Возвращает расширение, с которым звук нашёлся, или null. */
async function loadSfx(name: string, order: readonly string[]): Promise<string | null> {
  for (const ext of order) {
    const data = await getBuffer(`assets/sfx/${name}.${ext}`);
    if (data) {
      audio.addFile(`sfx_${name}`, data);
      return ext;
    }
  }
  return null;
}

async function loadMusic(name: string): Promise<void> {
  const data = await getBuffer(`assets/music/${name}.mp3`);
  if (data) audio.addFile(`music_${name}`, data);
}

/** Шрифт подключён через @font-face в index.html; ждём его, но не дольше полутора секунд. */
async function loadFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const wait = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  const load = document.fonts
    .load(`16px ${FONT_FAMILY}`)
    .then(() => undefined)
    .catch(() => undefined);
  await Promise.race([load, wait]);
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

  // По первому звуку узнаём, в каком формате лежат остальные, чтобы не спрашивать сервер дважды про каждый файл.
  const sounds = (async (): Promise<void> => {
    const first = loadSfx(SFX[0], SFX_EXT).catch(() => null);
    await counted(first);
    const order = (await first) === 'mp3' ? ['mp3', 'wav'] : SFX_EXT;
    await Promise.all(SFX.slice(1).map((name) => counted(loadSfx(name, order))));
  })();

  await Promise.all([
    ...ICON_FILES.map((name) => counted(loadIcon(scene, name))),
    ...MUSIC.map((name) => counted(loadMusic(name))),
    counted(loadFont()),
    sounds,
  ]);
}
