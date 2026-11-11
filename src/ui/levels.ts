// Уровни и баланс машин — данные роли C: src/data/levels/*.json и src/data/machines.json.
// Пока их нет, игра берёт примеры из симуляции (src/sim/examples.ts), поэтому работает с первого дня.
// Новый levelN.json появится в игре сам, без правок кода.
import { EXAMPLE_DEFS, EXAMPLE_LEVELS } from '../sim/examples';
import type { LevelData, MachineDef, MachineType } from '../types';

const levelFiles = import.meta.glob('../data/levels/*.json', { eager: true, import: 'default' }) as Record<string, LevelData>;
const defFiles = import.meta.glob('../data/machines.json', { eager: true, import: 'default' }) as Record<string, MachineDef[]>;

const fromData = Object.keys(levelFiles)
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .map((path) => levelFiles[path]);
const dataDefs = Object.values(defFiles)[0];

/** true — в игре уровни-примеры симуляции (роль C ещё не положила свои). */
export const usingExamples = fromData.length === 0;

const all: readonly LevelData[] = usingExamples ? EXAMPLE_LEVELS : fromData;
const defs: readonly MachineDef[] = Array.isArray(dataDefs) && dataDefs.length > 0 ? dataDefs : EXAMPLE_DEFS;

export const levels = (): readonly LevelData[] => all;

export const levelById = (id: string): LevelData | null => all.find((l) => l.id === id) ?? null;

export const levelIndex = (id: string): number => all.findIndex((l) => l.id === id);

export function nextLevel(id: string): LevelData | null {
  const i = levelIndex(id);
  return i >= 0 && i + 1 < all.length ? all[i + 1] : null;
}

/** Описания машин для loadLevel. Поправки уровня (defOverrides) симуляция накладывает сама. */
export const machineDefs = (): MachineDef[] => defs.map((d) => ({ ...d }));

/** Цена покупки машины в энергии с учётом поправок уровня. */
export function machineCost(level: LevelData, type: MachineType): number {
  return level.defOverrides?.[type]?.cost ?? defs.find((d) => d.type === type)?.cost ?? 0;
}
