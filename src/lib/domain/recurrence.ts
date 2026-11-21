import { t } from "../i18n";
import { addDays, compareDates, weekdayOf, weekdayShort } from "./dates";
import type { DateStr, Recurrence } from "./types";

/** Does the rule produce an occurrence on this calendar date? Pure and timezone-independent. */
export function occursOn(rule: Recurrence, date: DateStr): boolean {
  if (compareDates(date, rule.start) < 0) return false;
  if (rule.end && compareDates(date, rule.end) > 0) return false;
  if (rule.kind === "daily") return true;
  return rule.weekdays.includes(weekdayOf(date));
}

/** All occurrence dates within [from, to] inclusive, ascending, never duplicated. */
export function occurrencesBetween(rule: Recurrence, from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  let d = compareDates(from, rule.start) < 0 ? rule.start : from;
  const last = rule.end && compareDates(rule.end, to) < 0 ? rule.end : to;
  // bounded loop guards against bad input
  for (let i = 0; i < 3660 && compareDates(d, last) <= 0; i++) {
    if (occursOn(rule, d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function describeRule(rule: Recurrence): string {
  const days = [...rule.weekdays].sort();
  const key = days.join(",");
  let base: string;
  if (rule.kind === "daily") base = t("Every day");
  else if (key === "1,2,3,4,5") base = t("Weekdays");
  else if (key === "0,6") base = t("Weekends");
  else base = days.map((d) => weekdayShort(d)).join(", ") || t("No days selected");
  return rule.end ? t("{base} until {date}", { base, date: rule.end }) : base;
}

export const instanceKey = (seriesId: string, date: DateStr) => `${seriesId}@${date}`;
