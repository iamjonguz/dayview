"use client";
import { dayHref } from "@/lib/ui/links";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addDays, formatLong, formatShort } from "@/lib/domain/dates";
import type { CardInstance } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { useUi } from "@/store/ui";
import { Button, Field, Sheet, Spinner, inputCls } from "./ui";

/** Move or copy a card to another day. */
export function RescheduleSheet({ card, mode, onClose }: { card: CardInstance; mode: "move" | "copy"; onClose: () => void }) {
  const act = useApp((s) => s.act);
  const planner = useApp((s) => s.planner)!;
  const [date, setDate] = useState(addDays(card.date, 1));
  const routine = !!card.seriesId && !card.groupId;
  const go = async () => {
    const r = await act((p) => (mode === "move" ? p.moveCardToDate(card, date) : p.copyCardToDate(card, date)), { done: `${mode === "move" ? "Moved" : "Copied"} to ${formatShort(date)}` });
    if (r.ok) onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={mode === "move" ? "Move to another day" : "Copy to another day"} description={`“${card.spec.title}” from ${formatLong(card.date)}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!date || date === card.date} onClick={go}>{mode === "move" ? "Move" : "Copy"}</Button></>}>
      <Field label="Day" htmlFor="rd"><input id="rd" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="mt-3 flex gap-2">
        {[["Tomorrow", 1], ["In a week", 7]].map(([l, n]) => <Button key={l} small onClick={() => setDate(addDays(planner.today(), Number(n)))}>{l}</Button>)}
      </div>
      <p className="mt-4 text-sm text-muted">
        {mode === "copy"
          ? "The copy is a separate personal card; progress isn’t copied."
          : routine
            ? "This day of the routine will be skipped and a one-off copy created on the new day. The routine itself is unchanged."
            : card.groupId ? "Shared cards move for everyone in the group." : "Progress stays with the card."}
      </p>
    </Sheet>
  );
}

/** Gentle, opt-in carry-over: unfinished one-off cards from yesterday. Never framed as failure. */
export function CarryOver() {
  const planner = useApp((s) => s.planner);
  const date = useApp((s) => s.date);
  const dataVersion = useApp((s) => s.data);
  const act = useApp((s) => s.act);
  const [items, setItems] = useState<CardInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const today = planner?.today();
  const from = today ? addDays(today, -1) : "";
  const key = `dayview.carry.dismissed.${from}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!planner || date !== today) return;
    let live = true;
    planner.unfinishedFrom(from).then((l) => live && setItems(l), () => {});
    return () => void (live = false);
  }, [planner, date, today, from, key, dataVersion]);

  if (!planner || date !== today || dismissed || items.length === 0) return null;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <p className="text-[15px]">{items.length} {items.length === 1 ? "thing" : "things"} from yesterday didn’t get done. Want to bring {items.length === 1 ? "it" : "any"} along?</p>
        <span className="flex gap-2">
          <Button small variant="primary" onClick={() => { setSel(items.map((i) => i.id)); setOpen(true); }}>Review</Button>
          <Button small variant="ghost" onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setDismissed(true); }}>Not now</Button>
        </span>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="From yesterday" description="Choose what to move to today. Anything you leave stays on yesterday."
        footer={<><Button onClick={() => setOpen(false)}>Close</Button><Button variant="primary" disabled={sel.length === 0} onClick={async () => { const r = await act((p) => p.carryOver(sel, from, today!), { done: `Moved ${sel.length} to today` }); if (r.ok) setOpen(false); }}>Move {sel.length} to today</Button></>}>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-12 items-center gap-3 rounded-xl px-2 hover:bg-surface-2">
                <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={sel.includes(i.id)} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id))} />
                <span>{i.spec.title}</span>
                {i.spec.time && <span className="text-sm text-muted">{i.spec.time}</span>}
              </label>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

export function SearchSheet() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const planner = useApp((s) => s.planner);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<CardInstance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!planner || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => planner.search(q).then((r) => live && (setRes(r), setErr(null)), (e) => live && setErr(String(e?.message ?? e))), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, planner]);

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Search" description="Titles, summaries, notes and checklist items, a year either way.">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-muted" aria-hidden />
        <input autoFocus type="search" aria-label="Search cards" className={`${inputCls} pl-10`} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-4" aria-live="polite">
        {err ? <p role="alert" className="text-danger">{err}</p> : q.trim().length < 2 ? <p className="text-muted">Type at least two letters.</p> : res === null ? <Spinner /> : res.length === 0 ? <p className="text-muted">No cards match “{q}”.</p> : (
          <ul className="divide-y divide-line">
            {res.map((i) => (
              <li key={i.id}>
                <button className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-surface-2" onClick={() => { router.push(dayHref(i.date, i.id)); setOpen(false); }}>
                  <span>{i.spec.title}{i.spec.summary && <span className="ml-2 text-sm text-muted">{i.spec.summary}</span>}</span>
                  <span className="shrink-0 text-sm text-accent">{formatShort(i.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
