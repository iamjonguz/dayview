"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, EyeOff, LayoutList, LayoutTemplate, ListOrdered, MoreHorizontal, Plus, Search, Rows3, Settings, Sun, Sunrise, Moon, Star, FastForward } from "lucide-react";
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
import { CarryOver, RescheduleSheet } from "./FindAndCarry";
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
  const [resched, setResched] = useState<{ card: DayCard; mode: "move" | "copy" } | null>(null);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const collapseDone = useUi((s) => s.collapseDone);
  const setCollapseDone = useUi((s) => s.setCollapseDone);
  const setViewDensity = useApp((s) => s.setViewDensity);

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

  const totalCards = view ? view.sections.reduce((n, g) => n + g.cards.length, 0) + view.hidden.length + view.skipped.length : 0;

  const doneCards = collapseDone && view ? view.sections.flatMap((g) => g.cards).filter((c) => c.progress.complete) : [];
  const doneIds = new Set(doneCards.map((c) => c.instance.id));
  const sectionsToShow = (view?.sections ?? []).map((g) => ({ ...g, cards: g.cards.filter((c) => !doneIds.has(c.instance.id)) })).filter((g) => g.cards.length > 0 || (g.section && !arrange && doneCards.length === 0));
  const density = ws.prefs.defaultDensity;
  const gridCls = "grid items-start gap-2.5 grid-cols-[repeat(auto-fill,minmax(19rem,1fr))]";

  const renderCard = (c: DayCard, i: number, n: number) => (
    <li key={c.instance.id} className="min-w-0">
      <ActivityCard card={c} ws={ws} sections={ws.sections as Section[]} canMoveUp={i > 0} canMoveDown={i < n - 1} onEdit={(x) => openEdit(x.instance.id)} onDelete={setDeleting} onMove={move} onReschedule={(card, mode) => setResched({ card, mode })} />
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-3 md:px-8 md:pt-8">
      {/* compact header: the cards should dominate the screen */}
      <header className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate font-serif text-[32px] leading-none md:text-5xl">{title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="Choose a date" onClick={() => setPickerOpen(true)}><CalendarDays size={20} /></IconButton>
            <span className="hidden sm:block">
              <Menu.Root>
                <Menu.Trigger asChild><IconButton label="More day options"><MoreHorizontal size={20} /></IconButton></Menu.Trigger>
                <DayMenu collapseDone={collapseDone} onCollapseDone={setCollapseDone} onSearch={() => setSearchOpen(true)} onArrange={() => setArrange(true)} onSections={() => setSectionsOpen(true)} onApply={() => setApplyOpen(true)} onSave={() => setSaveOpen(true)} />
              </Menu.Root>
            </span>
            <Button variant="primary" onClick={() => openCreate(date)} aria-label="Add card"><Plus size={20} aria-hidden /> <span>Add<span className="hidden md:inline"> card</span></span></Button>
          </div>
        </div>
        <div className="mt-1 flex items-center">
          <IconButton label="Previous day" bare className="-ml-3 size-11 text-muted" onClick={() => void shiftDate(-1)}><ChevronLeft size={20} /></IconButton>
          <p className="min-w-[8.5rem] text-center text-[17px] md:min-w-[11rem] md:text-lg" aria-live="polite"><span className="md:hidden">{formatShort(date)}</span><span className="hidden md:inline">{formatLong(date)}</span></p>
          <IconButton label="Next day" bare className="size-11 text-muted" onClick={() => void shiftDate(1)}><ChevronRight size={20} /></IconButton>
          {date !== today && <Button small variant="ghost" className="ml-1 text-accent" onClick={() => void setDate(today)}>Today</Button>}
        </div>
        <div className="flex items-center gap-3">
          <p className="shrink-0 text-[15px] text-muted" aria-live="polite">{summary ? (summary.total === 0 ? "Nothing planned" : `${summary.done} of ${summary.total} complete`) : "\u00a0"}</p>
          <ProgressBar fraction={summary && summary.total ? summary.done / summary.total : 0} label="Day progress" className="flex-1" />
          <DensityToggle value={density} onChange={(d) => void setViewDensity(d)} />
          <span className="sm:hidden">
            <Menu.Root>
              <Menu.Trigger asChild><IconButton label="More day options" bare className="-mr-2 text-muted"><MoreHorizontal size={20} /></IconButton></Menu.Trigger>
              <DayMenu collapseDone={collapseDone} onCollapseDone={setCollapseDone} onSearch={() => setSearchOpen(true)} onArrange={() => setArrange(true)} onSections={() => setSectionsOpen(true)} onApply={() => setApplyOpen(true)} onSave={() => setSaveOpen(true)} />
            </Menu.Root>
          </span>
        </div>
      </header>

      <CarryOver />

      {arrange && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
          <p className="text-[15px]">Arranging: drag the handles, or use the arrows and section menus.</p>
          <Button small variant="primary" onClick={() => setArrange(false)}>Done</Button>
        </div>
      )}

      {dayError ? (
        <div role="alert" className="rounded-2xl border border-danger/50 bg-surface p-6 text-center">
          <p className="font-medium">Couldn’t load this day.</p>
          <p className="mt-1 text-[15px] text-muted">{dayError}</p>
          <Button className="mt-4" onClick={() => void refresh()}>Try again</Button>
        </div>
      ) : !view ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : totalCards === 0 ? (
        <Empty date={date} onAdd={() => openCreate(date)} onApply={() => setApplyOpen(true)} />
      ) : arrange ? (
        <ArrangeView view={view} sections={ws.sections} onChange={(l) => void reorder(l)} />
      ) : (
        <div className={clsx("space-y-5 transition-opacity", dayLoading && "opacity-70")}>
          {sectionsToShow.map((g) => {
            const Icon = g.section ? ICONS[g.section.icon] : null;
            const hid = `sec-${g.section?.id ?? "none"}`;
            return (
              <section key={g.section?.id ?? "none"} aria-labelledby={hid}>
                {(g.section || sectionsToShow.length > 1) && (
                  <div className="mb-1.5 flex items-center gap-2 px-0.5">
                    {Icon && <Icon size={16} className="text-muted" aria-hidden />}
                    <h2 id={hid} className="text-[15px] font-semibold text-muted">{g.section?.name ?? "Anytime"}</h2>
                    <span className="text-sm text-muted/80">{g.cards.length}</span>
                    {g.section && <button className="ml-auto hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface hover:text-fg md:inline-flex" onClick={() => openCreate(date, { sectionId: g.section!.id })}>+ Add</button>}
                  </div>
                )}
                {g.cards.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center text-[15px] text-muted">Nothing here yet.</p>
                ) : (
                  <ul className={gridCls}>{g.cards.map((c, i) => renderCard(c, i, g.cards.length))}</ul>
                )}
              </section>
            );
          })}

          {doneCards.length > 0 && (
            <details className="group rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] font-semibold text-muted"><Check size={16} aria-hidden /> Done ({doneCards.length}) <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden /></summary>
              <ul className={clsx(gridCls, "p-2.5 pt-0")}>{doneCards.map((c, i) => renderCard(c, i, doneCards.length))}</ul>
            </details>
          )}

          {view.skipped.length > 0 && (
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><FastForward size={16} aria-hidden /> Skipped ({view.skipped.length})</summary>
              <ul className="divide-y divide-line">
                {view.skipped.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">{c.instance.spec.title} <span className="text-sm text-muted">· skipped, not failed</span></span>
                    {c.canEdit && <Button small onClick={() => void act((p) => p.setSkipped(c.instance.id, c.instance.date, false), { done: "Restored" })}>Restore</Button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.hidden.length > 0 && (
            <details className="rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><EyeOff size={16} aria-hidden /> Hidden from my day ({view.hidden.length})</summary>
              <ul className="divide-y divide-line">
                {view.hidden.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">{c.instance.spec.title}</span>
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
      {resched && <RescheduleSheet card={resched.card.instance} mode={resched.mode} onClose={() => setResched(null)} />}
      {deleting && <DeleteCardDialog open onOpenChange={(o) => !o && setDeleting(null)} inst={deleting.instance} />}
    </div>
  );
}

/** Compact / Comfortable: a persistent preference, always visible next to the day's progress. */
function DensityToggle({ value, onChange }: { value: "compact" | "comfortable"; onChange: (d: "compact" | "comfortable") => void }) {
  const opt = (d: "compact" | "comfortable", label: string, Icon: typeof Rows3) => (
    <button type="button" aria-pressed={value === d} aria-label={`${label} cards`} title={`${label} cards`} onClick={() => onChange(d)} className={clsx("grid size-11 place-items-center rounded-lg", value === d ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}>
      <Icon size={18} aria-hidden />
    </button>
  );
  return (
    <div role="group" aria-label="Card size" className="-my-1 flex shrink-0 items-center rounded-xl border border-line">
      {opt("compact", "Compact", Rows3)}
      {opt("comfortable", "Comfortable", LayoutList)}
    </div>
  );
}

function DayMenu(p: { collapseDone: boolean; onCollapseDone: (b: boolean) => void; onSearch: () => void; onArrange: () => void; onSections: () => void; onApply: () => void; onSave: () => void }) {
  const item = "flex min-h-11 cursor-default items-center gap-3 rounded-xl px-3 text-[15px] outline-none data-[highlighted]:bg-white/10";
  return (
    <Menu.Portal>
      <Menu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-lg">
        <Menu.Item className={item} onSelect={p.onSearch}><Search size={16} aria-hidden /> Search…</Menu.Item>
        <Menu.CheckboxItem className={item} checked={p.collapseDone} onCheckedChange={p.onCollapseDone}><span className="grid size-4 place-items-center" aria-hidden>{p.collapseDone && <Check size={16} />}</span> Collapse done cards</Menu.CheckboxItem>
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
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <h2 className="text-xl font-semibold">A clear day</h2>
      <p className="mx-auto mt-2 max-w-sm text-muted">Nothing is planned for {formatLong(date)}. Add a card, or start from a saved day layout.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onAdd}><Plus size={18} aria-hidden /> Add card</Button>
        <Button onClick={onApply}>Apply a layout</Button>
      </div>
    </div>
  );
}

void (null as unknown as ID);
