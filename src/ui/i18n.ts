// Все тексты игры лежат в src/data/strings/<язык>.json. В коде — только вызов t с ключом строки.
// Если ключа нет, показываем сам ключ: игра не падает, а пропуск сразу виден.

export type Params = Record<string, string | number>;

export interface I18n {
  t(key: string, params?: Params): string;
  has(key: string): boolean;
  setLang(code: string): void;
  lang(): string;
  languages(): string[];
}

/** { menu: { play: '…' } } → { 'menu.play': '…' }. Плоские ключи остаются как есть. */
export function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v !== null && typeof v === 'object') Object.assign(out, flatten(v, key));
  }
  return out;
}

export function createI18n(dicts: Record<string, unknown>, initial = 'ru'): I18n {
  const flat: Record<string, Record<string, string>> = {};
  for (const code of Object.keys(dicts)) flat[code] = flatten(dicts[code]);
  let current = flat[initial] ? initial : (Object.keys(flat)[0] ?? initial);

  const find = (key: string): string | undefined => flat[current]?.[key] ?? flat.ru?.[key];

  return {
    t(key, params) {
      const raw = find(key);
      if (raw === undefined) return key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
    },
    has: (key) => find(key) !== undefined,
    setLang(code) {
      if (flat[code]) current = code;
    },
    lang: () => current,
    languages: () => Object.keys(flat).sort((a, b) => (a === 'ru' ? -1 : b === 'ru' ? 1 : a.localeCompare(b))),
  };
}

const files = import.meta.glob('../data/strings/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const loaded: Record<string, unknown> = {};
for (const path of Object.keys(files)) {
  const m = /([a-z]{2})\.json$/.exec(path);
  if (m) loaded[m[1]] = files[path];
}

export const i18n = createI18n(loaded);
export const t = i18n.t;

/** Дробное число по-русски: с запятой. */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Секунды как м:сс. Округляем вверх, чтобы 0:00 появлялось ровно в момент нуля. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
