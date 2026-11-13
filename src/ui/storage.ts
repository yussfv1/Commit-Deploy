// Настройки и прогресс в localStorage. Любое обращение к хранилищу может упасть
// (приватный режим, запрет в браузере), поэтому всё в try/catch, а копия живёт в памяти.
// Персональных данных нет: только числа.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ThemeName = 'dark' | 'light';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  lang: string;
  /** Тёмная (по умолчанию) или светлая тема. Меняется в настройках, применяется при перезапуске игры. */
  theme: ThemeName;
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
  /** Think Award за уровень: игрок измерил линию телеметрией и исправил её на ходу. */
  award(levelId: string): void;
  hasAward(levelId: string): boolean;
  reset(): void;
  /** Незаконченный уровень (автосохранение): игра предложит «Продолжить» на этом уровне. */
  run(): SavedRun | null;
  saveRun(run: SavedRun): void;
  clearRun(): void;
}

/** Автосохранение уровня: мир целиком (ISimulation.serialize) и мир в момент «Старт» — для «Заново с роботами». */
export interface SavedRun {
  levelId: string;
  save: string;
  startSave: string | null;
  /** Когда сохранено (Date.now()). */
  at: number;
}

const SETTINGS_KEY = 'tminus.settings.v1';
const PROGRESS_KEY = 'tminus.progress.v1';
const AWARDS_KEY = 'tminus.awards.v1';
const RUN_KEY = 'tminus.run.v1';
const DEFAULTS: Settings = { master: 0.8, music: 0.5, sfx: 0.8, lang: 'ru', theme: 'dark' };
const themeName = (v: unknown): ThemeName => (v === 'light' ? 'light' : 'dark');

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
    theme: themeName(s.theme),
  };

  const savedAwards = read(backend, AWARDS_KEY);
  let awards = new Set<string>(Array.isArray(savedAwards) ? savedAwards.filter((x): x is string => typeof x === 'string') : []);

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

  const savedRun = read(backend, RUN_KEY);
  let run: SavedRun | null = isSavedRun(savedRun) ? savedRun : null;

  return {
    settings: () => ({ ...settings }),
    setSettings(patch) {
      if (patch.master !== undefined) settings.master = volume(patch.master, settings.master);
      if (patch.music !== undefined) settings.music = volume(patch.music, settings.music);
      if (patch.sfx !== undefined) settings.sfx = volume(patch.sfx, settings.sfx);
      if (patch.lang !== undefined) settings.lang = patch.lang;
      if (patch.theme !== undefined) settings.theme = themeName(patch.theme);
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
    award(levelId) {
      if (awards.has(levelId)) return;
      awards.add(levelId);
      write(backend, AWARDS_KEY, [...awards]);
    },
    hasAward: (levelId) => awards.has(levelId),
    reset() {
      progress = {};
      awards = new Set();
      run = null;
      if (!backend) return;
      try {
        backend.removeItem(PROGRESS_KEY);
        backend.removeItem(AWARDS_KEY);
        backend.removeItem(RUN_KEY);
      } catch {
        // Нечего удалять, если хранилище недоступно.
      }
    },
    run: () => (run ? { ...run } : null),
    saveRun(next) {
      run = { ...next };
      write(backend, RUN_KEY, run);
    },
    clearRun() {
      if (run === null) return;
      run = null;
      if (!backend) return;
      try {
        backend.removeItem(RUN_KEY);
      } catch {
        // Хранилище недоступно — сохранение и так живёт только в памяти.
      }
    },
  };
}

function isSavedRun(v: unknown): v is SavedRun {
  return (
    isRecord(v) &&
    typeof v.levelId === 'string' &&
    typeof v.save === 'string' &&
    (v.startSave === null || typeof v.startSave === 'string') &&
    typeof v.at === 'number'
  );
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
