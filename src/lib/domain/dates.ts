import { localeTag, t } from "../i18n";
import type { DateStr, TimeStr } from "./types";

/** Date arithmetic on "YYYY-MM-DD" strings via UTC, so DST and the host timezone never shift a calendar day. */
const toUTC = (d: DateStr) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number): DateStr => new Date(ms).toISOString().slice(0, 10);

export const isDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));
export const addDays = (d: DateStr, n: number): DateStr => fromUTC(toUTC(d) + n * 86_400_000);
export const diffDays = (a: DateStr, b: DateStr) => Math.round((toUTC(a) - toUTC(b)) / 86_400_000);
export const weekdayOf = (d: DateStr) => new Date(toUTC(d)).getUTCDay();
export const compareDates = (a: DateStr, b: DateStr) => (a < b ? -1 : a > b ? 1 : 0);

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): DateStr {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return isDateStr(parts) ? parts : fromUTC(now.getTime());
  } catch {
    return fromUTC(now.getTime());
  }
}

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const fmt = (d: DateStr, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(localeTag(), { timeZone: "UTC", ...opts }).format(new Date(toUTC(d)));

export const formatShort = (d: DateStr) => fmt(d, { weekday: "short", month: "short", day: "numeric" });
export const formatLong = (d: DateStr) => fmt(d, { weekday: "long", month: "long", day: "numeric" });
export const formatMonthYear = (d: DateStr) => fmt(d, { month: "long", year: "numeric" });
/** Localized weekday names, indexed 0 = Sunday. Call at render time so they follow the current language. */
export const weekdayShort = (i: number) => fmt(addDays("2026-11-08", i), { weekday: "short" }); // 2026-11-08 is a Sunday
export const weekdayLabel = (i: number) => fmt(addDays("2026-11-08", i), { weekday: "long" });
/** Short numeric-free day, e.g. "Nov 10" / "10 nov". */
export const formatDayMonth = (d: DateStr) => fmt(d, { month: "short", day: "numeric" });

export type RelativeKind = "today" | "tomorrow" | "yesterday" | "upcoming" | "earlier";
/** Language-independent bucket for a date; compare this, never the translated label. */
export function relativeKind(d: DateStr, today: DateStr): RelativeKind {
  const n = diffDays(d, today);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? "upcoming" : "earlier";
}
export function relativeLabel(d: DateStr, today: DateStr): string {
  switch (relativeKind(d, today)) {
    case "today": return t("Today");
    case "tomorrow": return t("Tomorrow");
    case "yesterday": return t("Yesterday");
    case "upcoming": return t("Upcoming");
    default: return t("Earlier");
  }
}

export const formatTimeRange = (t?: TimeStr, end?: TimeStr) => (t ? (end ? `${t}–${end}` : t) : "");
export const compareTimes = (a?: TimeStr, b?: TimeStr) => {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  if (a) return -1;
  if (b) return 1;
  return 0;
};
export const monthGrid = (d: DateStr): DateStr[] => {
  const first = `${d.slice(0, 7)}-01`;
  const start = addDays(first, -((weekdayOf(first) + 6) % 7)); // Monday first
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
