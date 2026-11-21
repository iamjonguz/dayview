"use client";
import { dayHref } from "@/lib/ui/links";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addDays, formatLong, formatShort } from "@/lib/domain/dates";
import { useT } from "@/lib/i18n";
import type { CardInstance } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { useUi } from "@/store/ui";
import { Button, Field, Sheet, Spinner, inputCls } from "./ui";

/** Move or copy a card to another day. */
export function RescheduleSheet({ card, mode, onClose }: { card: CardInstance; mode: "move" | "copy"; onClose: () => void }) {
  const t = useT();
  const act = useApp((s) => s.act);
  const planner = useApp((s) => s.planner)!;
  const [date, setDate] = useState(addDays(card.date, 1));
  const routine = !!card.seriesId && !card.groupId;
  const go = async () => {
    const r = await act((p) => (mode === "move" ? p.moveCardToDate(card, date) : p.copyCardToDate(card, date)), { done: t(mode === "move" ? "Moved to {date}" : "Copied to {date}", { date: formatShort(date) }) });
    if (r.ok) onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={mode === "move" ? t("Move to another day") : t("Copy to another day")} description={t("“{title}” from {date}", { title: card.spec.title, date: formatLong(card.date) })}
      footer={<><Button onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" disabled={!date || date === card.date} onClick={go}>{mode === "move" ? t("Move") : t("Copy")}</Button></>}>
      <Field label={t("Day")} htmlFor="rd"><input id="rd" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="mt-3 flex gap-2">
        {([[t("Tomorrow"), 1], [t("In a week"), 7]] as const).map(([l, n]) => <Button key={n} small onClick={() => setDate(addDays(planner.today(), n))}>{l}</Button>)}
      </div>
      <p className="mt-4 text-sm text-muted">
        {mode === "copy"
          ? t("The copy is a separate personal card; progress isn’t copied.")
          : routine
            ? t("This day of the routine will be skipped and a one-off copy created on the new day. The routine itself is unchanged.")
            : card.groupId ? t("Shared cards move for everyone in the group.") : t("Progress stays with the card.")}
      </p>
    </Sheet>
  );
}

/** Gentle, opt-in carry-over: unfinished one-off cards from yesterday. Never framed as failure. */
export function CarryOver() {
  const t = useT();
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
        <p className="text-[15px]">{items.length === 1 ? t("1 thing from yesterday didn’t get done. Want to bring it along?") : t("{n} things from yesterday didn’t get done. Want to bring any along?", { n: items.length })}</p>
        <span className="flex gap-2">
          <Button small variant="primary" onClick={() => { setSel(items.map((i) => i.id)); setOpen(true); }}>{t("Review")}</Button>
          <Button small variant="ghost" onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setDismissed(true); }}>{t("Not now")}</Button>
        </span>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title={t("From yesterday")} description={t("Choose what to move to today. Anything you leave stays on yesterday.")}
        footer={<><Button onClick={() => setOpen(false)}>{t("Close")}</Button><Button variant="primary" disabled={sel.length === 0} onClick={async () => { const r = await act((p) => p.carryOver(sel, from, today!), { done: t("Moved {n} to today", { n: sel.length }) }); if (r.ok) setOpen(false); }}>{t("Move {n} to today", { n: sel.length })}</Button></>}>
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
  const t = useT();
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
    const timer = setTimeout(() => planner.search(q).then((r) => live && (setRes(r), setErr(null)), (e) => live && setErr(String(e?.message ?? e))), 200);
    return () => { live = false; clearTimeout(timer); };
  }, [q, planner]);

  return (
    <Sheet open={open} onOpenChange={setOpen} title={t("Search")} description={t("Titles, summaries, notes and checklist items, a year either way.")}>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-muted" aria-hidden />
        <input autoFocus type="search" aria-label={t("Search cards")} className={`${inputCls} pl-10`} placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-4" aria-live="polite">
        {err ? <p role="alert" className="text-danger">{err}</p> : q.trim().length < 2 ? <p className="text-muted">{t("Type at least two letters.")}</p> : res === null ? <Spinner /> : res.length === 0 ? <p className="text-muted">{t("No cards match “{q}”.", { q })}</p> : (
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
