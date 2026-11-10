"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, EyeOff, LayoutTemplate, ListOrdered, MoreHorizontal, Plus, Rows3, Settings, Sun, Sunrise, Moon, Star, FastForward } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { DayCard } from "@/lib/domain/dayview";
import { formatLong, formatShort, relativeLabel, WEEKDAY_LABEL, weekdayOf } from "@/lib/domain/dates";
import type { ID, Section } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { useUi } from "@/store/ui";
import { ActivityCard, type MoveRequest } from "./ActivityCard";
import { ArrangeView } from "./ArrangeView";
import { ProgressBar } from "./bits";
import { DeleteCardDialog } from "./CardEditor";
import { ApplyLayoutSheet, DatePickerSheet, SaveLayoutSheet, SectionsSheet } from "./DayDialogs";
import { Button, IconButton, Spinner } from "./ui";

const ICONS = { sunrise: Sunrise, sun: Sun, moon: Moon, star: Star, none: null } as const;

export function TodayPage() {
  const { date, view, ws, dayLoading, dayError, planner } = useApp();
  const shiftDate = useApp((s) => s.shiftDate);
  const setDate = useApp((s) => s.setDate);
  const reorder = useApp((s) => s.reorder);
  const act = useApp((s) => s.act);
  const refresh = useApp((s) => s.refresh);
  const openCreate = useUi((s) => s.openCreate);
  const openEdit = useUi((s) => s.openEdit);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [arrange, setArrange] = useState(false);
  const [deleting, setDeleting] = useState<DayCard | null>(null);

  if (!ws || !planner) return null;
  const today = planner.today();
  const rel = relativeLabel(date, today);
  const title = rel === "Today" || rel === "Tomorrow" || rel === "Yesterday" ? rel : WEEKDAY_LABEL[weekdayOf(date)];
  const summary = view?.summary;

  const currentLayout = () => view!.sections.map((g) => ({ sectionId: g.section?.id ?? null, ids: g.cards.map((c) => c.instance.id) }));
  const move = (card: DayCard, m: MoveRequest) => {
    const prev = currentLayout();
    const layout = currentLayout();
    const id = card.instance.id;
    const g = layout.find((x) => x.ids.includes(id))!;
    if (m.dir) {
      const i = g.ids.indexOf(id);
      const j = i + m.dir;
      if (j < 0 || j >= g.ids.length) return;
      [g.ids[i], g.ids[j]] = [g.ids[j], g.ids[i]];
    } else if (m.sectionId !== undefined) {
      g.ids = g.ids.filter((x) => x !== id);
      layout.find((x) => x.sectionId === m.sectionId)?.ids.push(id);
    }
    void reorder(layout);
    useApp.getState().toast(m.sectionId !== undefined ? `Moved to ${m.sectionId ? ws.sections.find((s) => s.id === m.sectionId)?.name : "Anytime"}` : "Moved", { action: { label: "Undo", run: () => reorder(prev) } });
  };

  const visibleSections = view?.sections.filter((g) => g.cards.length > 0 || (g.section && !arrange)) ?? [];
  const totalCards = view ? view.sections.reduce((n, g) => n + g.cards.length, 0) + view.hidden.length + view.skipped.length : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-3 md:px-8 md:pt-8">
      {/* compact header: cards should dominate the screen */}
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-[34px] leading-none md:text-5xl">{title}</h1>
            <div className="mt-1 flex items-center gap-1">
              <IconButton label="Previous day" bare className="-ml-3 size-10 text-muted" onClick={() => void shiftDate(-1)}><ChevronLeft size={20} /></IconButton>
              <p className="min-w-[7.5rem] text-[17px] text-ivory/90 md:text-lg" aria-live="polite"><span className="md:hidden">{formatShort(date)}</span><span className="hidden md:inline">{formatLong(date)}</span></p>
              <IconButton label="Next day" bare className="size-10 text-muted" onClick={() => void shiftDate(1)}><ChevronRight size={20} /></IconButton>
              {date !== today && <Button small variant="ghost" className="text-amber" onClick={() => void setDate(today)}>Today</Button>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton label="Choose a date" onClick={() => setPickerOpen(true)}><CalendarDays size={20} /></IconButton>
            <Menu.Root>
              <span className="hidden sm:block"><Menu.Trigger asChild><IconButton label="More day options"><MoreHorizontal size={20} /></IconButton></Menu.Trigger></span>
              <DayMenu onArrange={() => setArrange(true)} onSections={() => setSectionsOpen(true)} onApply={() => setApplyOpen(true)} onSave={() => setSaveOpen(true)} />
            </Menu.Root>
            <span className="hidden md:block"><Button variant="primary" onClick={() => openCreate(date)}><Plus size={18} aria-hidden /> Add card</Button></span>
            <span className="md:hidden"><IconButton label="Add card" variant="outline" onClick={() => openCreate(date)}><Plus size={22} /></IconButton></span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <p className="shrink-0 text-[15px] text-ivory/90" aria-live="polite">
            {summary ? (summary.total === 0 ? "Nothing planned" : `${summary.done} of ${summary.total} complete`) : " "}
          </p>
          <ProgressBar fraction={summary && summary.total ? summary.done / summary.total : 0} label="Day progress" className="flex-1" />
          <Menu.Root>
            <span className="sm:hidden"><Menu.Trigger asChild><IconButton label="More day options" bare className="size-9 text-muted"><MoreHorizontal size={20} /></IconButton></Menu.Trigger></span>
            <DayMenu onArrange={() => setArrange(true)} onSections={() => setSectionsOpen(true)} onApply={() => setApplyOpen(true)} onSave={() => setSaveOpen(true)} />
          </Menu.Root>
        </div>
      </header>

      {arrange && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber/40 bg-amber/10 px-4 py-2">
          <p className="text-[15px]">Arranging — drag the handles, or use the arrows and section menus.</p>
          <Button small variant="primary" onClick={() => setArrange(false)}>Done</Button>
        </div>
      )}

      {dayError ? (
        <div role="alert" className="rounded-3xl border border-danger/50 bg-danger/10 p-6 text-center">
          <p className="font-medium">Couldn’t load this day.</p>
          <p className="mt-1 text-sm text-muted">{dayError}</p>
          <Button className="mt-4" onClick={() => void refresh()}>Try again</Button>
        </div>
      ) : !view ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : totalCards === 0 ? (
        <Empty date={date} onAdd={() => openCreate(date)} onApply={() => setApplyOpen(true)} />
      ) : arrange ? (
        <ArrangeView view={view} sections={ws.sections} onChange={(l) => void reorder(l)} />
      ) : (
        <div className={clsx("space-y-7 transition-opacity", dayLoading && "opacity-70")}>
          {visibleSections.map((g) => {
            const Icon = g.section ? ICONS[g.section.icon] : null;
            return (
              <section key={g.section?.id ?? "none"} aria-labelledby={`sec-${g.section?.id ?? "none"}`}>
                {(g.section || visibleSections.length > 1) && (
                  <div className="mb-2 flex items-center gap-2 px-1">
                    {Icon && <Icon size={22} className="text-amber" aria-hidden />}
                    <h2 id={`sec-${g.section?.id ?? "none"}`} className="font-serif text-2xl md:text-[28px]">{g.section?.name ?? "Anytime"}</h2>
                    <span className="text-sm text-muted">{g.cards.length}</span>
                    {g.section && <button className="ml-auto min-h-9 rounded-lg px-2 text-sm text-muted hover:bg-surface-2" onClick={() => openCreate(date, { sectionId: g.section!.id })}>+ Add</button>}
                  </div>
                )}
                {g.cards.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">Nothing here yet.</p>
                ) : (
                  <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {g.cards.map((c, i) => (
                      <li key={c.instance.id}>
                        <ActivityCard card={c} ws={ws} sections={ws.sections as Section[]} canMoveUp={i > 0} canMoveDown={i < g.cards.length - 1} onEdit={(x) => openEdit(x.instance.id)} onDelete={setDeleting} onMove={move} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {view.skipped.length > 0 && (
            <details className="rounded-2xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><FastForward size={16} aria-hidden /> Skipped today ({view.skipped.length})</summary>
              <ul className="divide-y divide-line">
                {view.skipped.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-ivory/80">{c.instance.spec.title} <span className="text-sm text-muted">· skipped, not failed</span></span>
                    {c.canEdit && <Button small onClick={() => void act((p) => p.setSkipped(c.instance.id, c.instance.date, false), { done: "Restored" })}>Restore</Button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.hidden.length > 0 && (
            <details className="rounded-2xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><EyeOff size={16} aria-hidden /> Hidden from my day ({view.hidden.length})</summary>
              <ul className="divide-y divide-line">
                {view.hidden.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-ivory/80">{c.instance.spec.title}</span>
                    <Button small onClick={() => void act((p) => p.setPlacementFlags(c.instance, { hidden: false }), { done: "Shown again" })}>Show</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <DatePickerSheet key={date + String(pickerOpen)} open={pickerOpen} onOpenChange={setPickerOpen} />
      {sectionsOpen && <SectionsSheet open onOpenChange={setSectionsOpen} />}
      <ApplyLayoutSheet open={applyOpen} onOpenChange={setApplyOpen} date={date} />
      {saveOpen && <SaveLayoutSheet open onOpenChange={setSaveOpen} date={date} />}
      {deleting && <DeleteCardDialog open onOpenChange={(o) => !o && setDeleting(null)} inst={deleting.instance} />}
    </div>
  );
}

function DayMenu(p: { onArrange: () => void; onSections: () => void; onApply: () => void; onSave: () => void }) {
  const item = "flex min-h-11 cursor-default items-center gap-3 rounded-xl px-3 text-[15px] outline-none data-[highlighted]:bg-white/10";
  return (
    <Menu.Portal>
      <Menu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-2xl">
        <Menu.Item className={item} onSelect={p.onArrange}><ListOrdered size={16} aria-hidden /> Arrange cards</Menu.Item>
        <Menu.Item className={item} onSelect={p.onSections}><Rows3 size={16} aria-hidden /> Edit sections</Menu.Item>
        <Menu.Item className={item} onSelect={p.onApply}><LayoutTemplate size={16} aria-hidden /> Apply a day layout…</Menu.Item>
        <Menu.Item className={item} onSelect={p.onSave}><LayoutTemplate size={16} aria-hidden /> Save day as layout…</Menu.Item>
        <Menu.Separator className="my-1 h-px bg-line" />
        <Menu.Item asChild className={item}><Link href="/settings"><Settings size={16} aria-hidden /> Settings</Link></Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}

function Empty({ date, onAdd, onApply }: { date: string; onAdd: () => void; onApply: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <h2 className="font-serif text-3xl">A clear day</h2>
      <p className="mx-auto mt-2 max-w-sm text-muted">Nothing is planned for {formatLong(date)}. Add a card, or start from a saved day layout.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onAdd}><Plus size={18} aria-hidden /> Add card</Button>
        <Button onClick={onApply}>Apply a layout</Button>
      </div>
    </div>
  );
}

void (null as unknown as ID);
