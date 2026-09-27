/**
 * Minimal i18n: English is the source of truth (key → text), every other
 * language is a partial override that falls back to English.
 *
 * Strings live in namespace files under ./strings (each exports `en` and `tr`)
 * and full translations for other languages under ./locales/<code>.ts.
 */
import * as app from './strings/app';
import * as cockpit from './strings/cockpit';
import * as views from './strings/views';
import * as car from './strings/car';
import * as laps from './strings/laps';
import * as sessions from './strings/sessions';
import * as settings from './strings/settings';
import * as platform from './strings/platform';

const EN = { ...app.en, ...cockpit.en, ...views.en, ...car.en, ...laps.en, ...sessions.en, ...settings.en, ...platform.en };
export type Key = keyof typeof EN;
export type Dict = Partial<Record<Key, string>>;

const TR: Dict = { ...app.tr, ...cockpit.tr, ...views.tr, ...car.tr, ...laps.tr, ...sessions.tr, ...settings.tr, ...platform.tr };

// other languages are generated files; each is optional and may be partial
const LOCALES = import.meta.glob<{ default: Dict }>('./locales/*.ts', { eager: true });
const extra: Record<string, Dict> = {};
for (const [path, mod] of Object.entries(LOCALES)) extra[path.replace(/^.*\/|\.ts$/g, '')] = mod.default;

export const LANGUAGES: { code: string; name: string; dir?: 'rtl' }[] = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
];

const DICTS: Record<string, Dict> = { en: EN, tr: TR, ...extra };

/** "auto" → best match of the system languages, else English */
export function resolveLanguage(pref: string | undefined): string {
  if (pref && pref !== 'auto' && DICTS[pref]) return pref;
  const wanted = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const w of wanted) {
    if (DICTS[w]) return w;
    const base = w.split('-')[0];
    const hit = Object.keys(DICTS).find((c) => c === base || c.split('-')[0] === base);
    if (hit) return hit;
  }
  return 'en';
}

let current = 'en';
let dict: Dict = EN;

export function setLanguage(code: string) {
  current = DICTS[code] ? code : 'en';
  dict = DICTS[current];
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = LANGUAGES.find((l) => l.code === current)?.dir ?? 'ltr';
  }
}

export const language = () => current;

/** BCP 47 locale for Intl / toLocaleString */
export const locale = () => current;

/** Translate a key; `{name}` placeholders are filled from vars. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = dict[key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** for tests / tooling */
export const _dicts = { EN, TR };
