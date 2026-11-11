// Настройки и прогресс в localStorage. Любое обращение к хранилищу может упасть
// (приватный режим, запрет в браузере), поэтому всё в try/catch, а копия живёт в памяти.
// Персональных данных нет: только числа.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  lang: string;
}

export interface LevelRecord {
  stars: number;
  timeLeft: number;
  energySpent: number;
  misses: number;
  launches: number;
}

export interface Store {
  settings(): Settings;
  setSettings(patch: Partial<Settings>): void;
  record(levelId: string): LevelRecord | null;
  /** Запоминает лучший результат. Возвращает true, если это первый проход или рекорд по звёздам или запускам. */
  saveResult(levelId: string, result: LevelRecord): boolean;
  totalStars(): number;
  reset(): void;
}

const SETTINGS_KEY = 'tminus.settings.v1';
const PROGRESS_KEY = 'tminus.progress.v1';
const DEFAULTS: Settings = { master: 0.8, music: 0.5, sfx: 0.8, lang: 'ru' };

const volume = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function read(backend: StorageLike | null, key: string): unknown {
  if (!backend) return null;
  try {
    const raw = backend.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(backend: StorageLike | null, key: string, value: unknown): void {
  if (!backend) return;
  try {
    backend.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно — значения остаются в памяти до конца сессии.
  }
}

export function createStore(backend: StorageLike | null): Store {
  const savedSettings = read(backend, SETTINGS_KEY);
  const s = isRecord(savedSettings) ? savedSettings : {};
  const settings: Settings = {
    master: volume(s.master, DEFAULTS.master),
    music: volume(s.music, DEFAULTS.music),
    sfx: volume(s.sfx, DEFAULTS.sfx),
    lang: typeof s.lang === 'string' ? s.lang : DEFAULTS.lang,
  };

  let progress: Record<string, LevelRecord> = {};
  const savedProgress = read(backend, PROGRESS_KEY);
  if (isRecord(savedProgress)) {
    for (const [id, raw] of Object.entries(savedProgress)) {
      if (!isRecord(raw)) continue;
      progress[id] = {
        stars: Math.min(3, Math.max(0, Math.round(count(raw.stars)))),
        timeLeft: count(raw.timeLeft),
        energySpent: count(raw.energySpent),
        misses: count(raw.misses),
        launches: count(raw.launches),
      };
    }
  }

  return {
    settings: () => ({ ...settings }),
    setSettings(patch) {
      if (patch.master !== undefined) settings.master = volume(patch.master, settings.master);
      if (patch.music !== undefined) settings.music = volume(patch.music, settings.music);
      if (patch.sfx !== undefined) settings.sfx = volume(patch.sfx, settings.sfx);
      if (patch.lang !== undefined) settings.lang = patch.lang;
      write(backend, SETTINGS_KEY, settings);
    },
    record: (levelId) => (progress[levelId] ? { ...progress[levelId] } : null),
    saveResult(levelId, r) {
      const old = progress[levelId];
      const better = !old || r.stars > old.stars || r.launches > old.launches;
      progress[levelId] = old
        ? {
            stars: Math.max(old.stars, r.stars),
            timeLeft: Math.max(old.timeLeft, r.timeLeft),
            energySpent: Math.min(old.energySpent, r.energySpent),
            misses: Math.min(old.misses, r.misses),
            launches: Math.max(old.launches, r.launches),
          }
        : { ...r };
      write(backend, PROGRESS_KEY, progress);
      return better;
    },
    totalStars: () => Object.values(progress).reduce((n, r) => n + r.stars, 0),
    reset() {
      progress = {};
      if (!backend) return;
      try {
        backend.removeItem(PROGRESS_KEY);
      } catch {
        // Нечего удалять, если хранилище недоступно.
      }
    },
  };
}

/** localStorage браузера или null, если им нельзя пользоваться. */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = 'tminus.probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export const store = createStore(browserStorage());
