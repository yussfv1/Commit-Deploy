// Подсказка для тех, кто застрял: после трёх поражений подряд на одном уровне
// итоги спрашивают «Вам нужна подсказка?», и по согласию показывают, как пройти уровень.
// Счётчик живёт в localStorage (только числа, без имён), а если хранилища нет — в памяти до конца сессии.
import type { StorageLike } from './storage';
import { browserStorage } from './storage';

/** Сколько поражений подряд нужно, чтобы предложить подсказку. */
export const LOSSES_FOR_HINT = 3;

const KEY = 'tminus.losses.v1';

export interface HintCounter {
  /** Уровень проигран. true — пора предложить подсказку (счётчик при этом начинается заново). */
  lost(levelId: string): boolean;
  /** Уровень пройден — счётчик поражений обнуляется. */
  won(levelId: string): void;
  /** Сколько поражений подряд сейчас на уровне. */
  losses(levelId: string): number;
}

export function createHintCounter(backend: StorageLike | null): HintCounter {
  let counts: Record<string, number> = {};
  try {
    const raw = backend?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [id, n] of Object.entries(parsed)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) counts[id] = Math.floor(n);
      }
    }
  } catch {
    counts = {};
  }

  const save = (): void => {
    try {
      backend?.setItem(KEY, JSON.stringify(counts));
    } catch {
      // Хранилище недоступно — счётчик остаётся в памяти.
    }
  };

  return {
    lost(levelId) {
      const n = (counts[levelId] ?? 0) + 1;
      const offer = n >= LOSSES_FOR_HINT;
      counts[levelId] = offer ? 0 : n;
      save();
      return offer;
    },
    won(levelId) {
      if (!counts[levelId]) return;
      delete counts[levelId];
      save();
    },
    losses: (levelId) => counts[levelId] ?? 0,
  };
}

/** Ключ текста подсказки по номеру уровня (0 — первый): hint.level1 … hint.level6. */
export const hintKey = (levelIndex: number): string => `hint.level${levelIndex + 1}`;

export const hints = createHintCounter(browserStorage());
