import { create } from "zustand";
import { sv } from "./sv/index";

/**
 * Tiny dependency-free i18n. English text is the key: `t("Today")`. A locale only needs entries for strings
 * that differ; anything missing falls back to the English text, so a gap is never a blank label.
 * Placeholders use `{name}`: `t("Moved to {date}", { date })`.
 */
export type Locale = "en" | "sv";
export const LOCALES: { value: Locale; label: string; tag: string }[] = [
  { value: "en", label: "English", tag: "en-US" },
  { value: "sv", label: "Svenska", tag: "sv-SE" },
];
const DICTS: Record<Locale, Record<string, string>> = { en: {}, sv };
const KEY = "dayview.locale";

export type Vars = Record<string, string | number>;
export type TFn = (text: string, vars?: Vars) => string;

const isLocale = (s: unknown): s is Locale => s === "en" || s === "sv";

/** Saved choice, else the browser's language, else English. Only call in the browser. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLocale(saved)) return saved;
  } catch {}
  const langs = typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const l of langs) {
    const base = l?.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}

interface I18nState {
  locale: Locale;
  setLocale(l: Locale): void;
}
/** Starts as English on server and client alike (no hydration mismatch); `initLocale()` applies the real choice after mount. */
export const useI18n = create<I18nState>((set) => ({
  locale: "en",
  setLocale: (locale) => {
    try {
      localStorage.setItem(KEY, locale);
    } catch {}
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    set({ locale });
  },
}));

export function initLocale() {
  const locale = detectLocale();
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  useI18n.setState({ locale });
}

export const currentLocale = () => useI18n.getState().locale;
export const localeTag = (l: Locale = currentLocale()) => LOCALES.find((x) => x.value === l)!.tag;

export function translate(locale: Locale, text: string, vars?: Vars): string {
  const s = DICTS[locale][text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** For code outside React (store, data layer, date helpers). Reads the locale at call time. */
export const t: TFn = (text, vars) => translate(currentLocale(), text, vars);

/** For components: subscribes to the locale so the tree re-renders when it changes. */
export function useT(): TFn {
  const locale = useI18n((s) => s.locale);
  return (text, vars) => translate(locale, text, vars);
}
