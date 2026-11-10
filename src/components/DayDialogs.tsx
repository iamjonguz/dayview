"use client";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { addDays, formatLong, formatMonthYear, monthGrid, WEEKDAY_SHORT } from "@/lib/domain/dates";
import { uid } from "@/lib/domain/factory";
import type { DateStr, DayLayout, Section } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import clsx from "clsx";
import { Button, Confirm, Field, IconButton, Sheet, inputCls } from "./ui";

export function DatePickerSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const date = useApp((s) => s.date);
  const setDate = useApp((s) => s.setDate);
  const planner = useApp((s) => s.planner);
  const [month, setMonth] = useState(date);
  const today = planner?.today() ?? date;
  const days = monthGrid(month);
  const shiftMonth = (n: number) => setMonth(addDays(`${month.slice(0, 7)}-15`, n * 30));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick a day" description="Browse earlier days or plan ahead.">
      <div className="mx-auto max-w-sm">
        <div className="mb-2 flex items-center justify-between">
          <IconButton label="Previous month" variant="ghost" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></IconButton>
          <p className="font-semibold text-xl" aria-live="polite">{formatMonthYear(month)}</p>
          <IconButton label="Next month" variant="ghost" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></IconButton>
        </div>
        <div role="grid" aria-label={formatMonthYear(month)} className="grid grid-cols-7 gap-1 text-center">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d} role="columnheader" className="py-1 text-xs text-muted">{WEEKDAY_SHORT[d]}</div>)}
          {days.map((d) => {
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            const sel = d === date;
            return (
              <button
                key={d}
                role="gridcell"
                aria-selected={sel}
                aria-current={d === today ? "date" : undefined}
                aria-label={formatLong(d)}
                onClick={() => { void setDate(d); onOpenChange(false); }}
                className={clsx("grid min-h-11 place-items-center rounded-xl text-[15px]", sel ? "bg-accent font-semibold text-accent-ink" : "hover:bg-surface-2", !inMonth && !sel && "text-muted/50", d === today && !sel && "ring-1 ring-accent")}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <Button className="mt-4 w-full" onClick={() => { void setDate(today); onOpenChange(false); }}>Go to today</Button>
      </div>
    </Sheet>
  );
}

export function SectionsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ws = useApp((s) => s.ws)!;
  const act = useApp((s) => s.act);
  const [rows, setRows] = useState<Section[]>(ws.sections);
  const [removing, setRemoving] = useState<Section | null>(null);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const r = [...rows];
    [r[i], r[j]] = [r[j], r[i]];
    setRows(r);
  };
  const upd = (id: string, p: Partial<Section>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Sections"
        description="Group your day however you like. The start time only decides where new timed cards land."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" disabled={rows.some((r) => !r.name.trim())} onClick={async () => { const r = await act((p) => p.saveSections(rows.map((x) => ({ ...x, name: x.name.trim() }))), { done: "Sections saved" }); if (r.ok) onOpenChange(false); }}>Save</Button>
          </>
        }
      >
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="rounded-2xl border border-line bg-bg/60 p-3">
              <div className="flex items-center gap-1">
                <input aria-label={`Section ${i + 1} name`} className={inputCls} value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} />
                <IconButton label="Move up" variant="ghost"  disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></IconButton>
                <IconButton label="Move down" variant="ghost"  disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></IconButton>
                <IconButton label={`Delete section ${r.name}`} variant="ghost" className="text-danger" onClick={() => setRemoving(r)}><Trash2 size={16} /></IconButton>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-sm text-muted">Icon
                  <select className={clsx(inputCls, "mt-1")} value={r.icon} onChange={(e) => upd(r.id, { icon: e.target.value as Section["icon"] })}>
                    {["sunrise", "sun", "moon", "star", "none"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">Starts around
                  <input type="time" className={clsx(inputCls, "mt-1")} value={r.from ?? ""} onChange={(e) => upd(r.id, { from: e.target.value || undefined })} />
                </label>
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-3" onClick={() => setRows([...rows, { id: uid(), name: "New section", icon: "none", position: rows.length }])}><Plus size={16} aria-hidden /> Add section</Button>
      </Sheet>
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.name}”?`}
        description="Cards in this section aren’t deleted — they move to “Anytime”. Press Save to apply."
        onConfirm={() => setRows(rows.filter((r) => r.id !== removing!.id))}
      />
    </>
  );
}

export function SaveLayoutSheet({ open, onOpenChange, date }: { open: boolean; onOpenChange: (o: boolean) => void; date: DateStr }) {
  const act = useApp((s) => s.act);
  const [name, setName] = useState("");
  const [auto, setAuto] = useState<number[]>([]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Save this day as a layout"
      description={`Captures the cards you own on ${formatLong(date)}, with their sections and order. Progress isn’t copied.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={async () => { const r = await act((p) => p.saveDayAsLayout(date, name, auto), { done: "Layout saved" }); if (r.ok) onOpenChange(false); }}>Save layout</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="ln"><input id="ln" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekday setup" /></Field>
        <AutoApplyPicker value={auto} onChange={setAuto} />
      </div>
    </Sheet>
  );
}

export function AutoApplyPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-muted">Apply automatically on (optional)</p>
      <div role="group" aria-label="Weekdays to apply the layout to" className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const on = value.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])} className={clsx("min-h-11 min-w-12 rounded-xl border px-2 text-sm", on ? "border-accent bg-accent font-semibold text-accent-ink" : "border-line hover:bg-surface-2")}>
              {WEEKDAY_SHORT[d]}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted">Auto-applied layouts add their cards once to today and future days only — never to past days — and never twice.</p>
    </div>
  );
}

export function ApplyLayoutSheet({ open, onOpenChange, date }: { open: boolean; onOpenChange: (o: boolean) => void; date: DateStr }) {
  const ws = useApp((s) => s.ws)!;
  const act = useApp((s) => s.act);
  const toast = useApp((s) => s.toast);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Apply a day layout" description={`Adds the layout’s cards to ${formatLong(date)}. Each layout can be applied once per day.`}>
      {ws.layouts.length === 0 ? (
        <p className="text-muted">No saved layouts yet. Arrange a day, then use “Save this day as layout”.</p>
      ) : (
        <ul className="space-y-2">
          {ws.layouts.map((l: DayLayout) => (
            <li key={l.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-3">
              <div>
                <p className="font-medium">{l.name}</p>
                <p className="text-sm text-muted">{l.entries.length} cards{l.autoApply.length ? ` · auto on ${l.autoApply.map((d) => WEEKDAY_SHORT[d]).join(", ")}` : ""}</p>
              </div>
              <Button variant="primary" small onClick={async () => { const r = await act((p) => p.applyLayout(l, date)); if (r.ok) { toast(r.value ? `Added ${l.entries.length} cards` : "That layout was already applied to this day."); onOpenChange(false); } }}>Apply</Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
