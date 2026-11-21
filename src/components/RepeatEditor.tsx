"use client";
import clsx from "clsx";
import { useId } from "react";
import { weekdayShort } from "@/lib/domain/dates";
import { useT } from "@/lib/i18n";
import type { Recurrence } from "@/lib/domain/types";
import { Field, Segmented, inputCls } from "./ui";

export interface RepeatValue {
  kind: "once" | "daily" | "weekdays";
  weekdays: number[];
  end?: string;
}
export const repeatToRule = (r: RepeatValue): Omit<Recurrence, "start"> | null => (r.kind === "once" ? null : { kind: r.kind, weekdays: r.kind === "daily" ? [] : r.weekdays, end: r.end || undefined });
export const ruleToRepeat = (r?: Recurrence | null): RepeatValue => (r ? { kind: r.kind, weekdays: r.weekdays, end: r.end } : { kind: "once", weekdays: [] });

export function RepeatEditor({ value, onChange, startLabel, allowOnce = true }: { value: RepeatValue; onChange: (v: RepeatValue) => void; startLabel?: string; allowOnce?: boolean }) {
  const t = useT();
  const id = useId();
  const options = [
    ...(allowOnce ? [{ value: "once" as const, label: t("Just once") }] : []),
    { value: "daily" as const, label: t("Every day") },
    { value: "weekdays" as const, label: t("Selected days") },
  ];
  return (
    <div className="space-y-3">
      <Segmented label={t("Repeat")} value={value.kind} onChange={(kind) => onChange({ ...value, kind, weekdays: kind === "weekdays" && value.weekdays.length === 0 ? [1, 2, 3, 4, 5] : value.weekdays })} options={options} />
      {value.kind === "weekdays" && (
        <div role="group" aria-label={t("Days of the week")} className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = value.weekdays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => onChange({ ...value, weekdays: on ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d] })} className={clsx("min-h-11 min-w-12 rounded-xl border px-2 text-sm", on ? "border-accent bg-accent text-accent-ink font-semibold" : "border-line hover:bg-surface-2")}>
                {weekdayShort(d)}
              </button>
            );
          })}
        </div>
      )}
      {value.kind !== "once" && (
        <>
          {startLabel && <p className="text-sm text-muted">{startLabel}</p>}
          <Field label={t("Ends (optional)")} htmlFor={`${id}-end`} hint={t("Leave empty to repeat until you stop it. Skipping a single day never ends the routine.")}>
            <input id={`${id}-end`} type="date" className={inputCls} value={value.end ?? ""} onChange={(e) => onChange({ ...value, end: e.target.value || undefined })} />
          </Field>
        </>
      )}
    </div>
  );
}
