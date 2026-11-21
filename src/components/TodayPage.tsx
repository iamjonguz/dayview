"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { Check, ChevronDown, ChevronLeft, ChevronRight, EyeOff, LayoutTemplate, ListOrdered, MoreHorizontal, Plus, Search, Rows3, Settings, SlidersHorizontal, Sun, Sunrise, Moon, Star, FastForward } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DayCard } from "@/lib/domain/dayview";
import { formatDayMonth, formatLong, formatShort, relativeKind, relativeLabel, weekdayLabel, weekdayOf } from "@/lib/domain/dates";
import { t as tr, useT } from "@/lib/i18n";
import { ACTIVITY_PARAM, DATE_PARAM } from "@/lib/ui/links";
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
  const t = useT();
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
  const requestOpen = useUi((s) => s.requestOpen);
  const [doneOpen, setDoneOpen] = useState(false);

  // ---- deep links: /?date=YYYY-MM-DD&card=<instance id> → that day, that card, expanded and in view
  const params = useSearchParams();
  const wantDate = params.get(DATE_PARAM);
  const wantCard = params.get(ACTIVITY_PARAM);
  const handled = useRef<string | null>(null);
  const ready = !!ws && !!planner;
  useEffect(() => {
    if (!wantDate && !wantCard) {
      handled.current = null;
      return;
    }
    if (!ready) return;
    const key = `${wantDate}|${wantCard}`;
    if (handled.current === key) return;
    handled.current = key;
    // consume the parameters in place (no new history entry), so Back returns to wherever the link was followed from
    window.history.replaceState(window.history.state, "", window.location.pathname);
    void (async () => {
      const app = useApp.getState();
      const okDate = wantDate && /^\d{4}-\d{2}-\d{2}$/.test(wantDate) ? wantDate : null;
      if (okDate && app.date !== okDate) await app.setDate(okDate);
      else if (okDate) await app.refresh({ silent: true });
      if (!wantCard) return;
      const v = useApp.getState().view;
      const all = v ? v.sections.flatMap((g) => g.cards) : [];
      const hit = all.find((c) => c.instance.id === wantCard);
      const toast = useApp.getState().toast;
      if (hit) {
        setArrange(false);
        if (useUi.getState().collapseDone && hit.progress.complete) setDoneOpen(true);
        // let the (possibly just-opened) list mount before asking the card to open itself
        requestAnimationFrame(() => requestAnimationFrame(() => requestOpen(wantCard)));
        return;
      }
      const gone = v?.skipped.find((c) => c.instance.id === wantCard);
      const hidden = v?.hidden.find((c) => c.instance.id === wantCard);
      if (gone) toast(tr("“{title}” is skipped on this day. Restore it from “Skipped” below.", { title: gone.instance.spec.title }));
      else if (hidden) toast(tr("“{title}” is hidden from your day. Show it again from “Hidden from my day” below.", { title: hidden.instance.spec.title }));
      else toast(tr("That activity isn’t available any more. It may have been deleted or moved, or you may no longer have access."), { kind: "error" });
    })();
  }, [wantDate, wantCard, ready, requestOpen]);

  if (!ws || !planner) return null;
  const today = planner.today();
  const relKind = relativeKind(date, today);
  const title = relKind === "today" || relKind === "tomorrow" || relKind === "yesterday" ? relativeLabel(date, today) : weekdayLabel(weekdayOf(date));
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
    useApp.getState().toast(m.sectionId !== undefined ? t("Moved to {name}", { name: (m.sectionId ? ws.sections.find((s) => s.id === m.sectionId)?.name : t("Anytime")) ?? "" }) : t("Moved"), { action: { label: t("Undo"), run: () => reorder(prev) } });
  };

  const totalCards = view ? view.sections.reduce((n, g) => n + g.cards.length, 0) + view.hidden.length + view.skipped.length : 0;

  const doneCards = collapseDone && view ? view.sections.flatMap((g) => g.cards).filter((c) => c.progress.complete) : [];
  const doneIds = new Set(doneCards.map((c) => c.instance.id));
  const sectionsToShow = (view?.sections ?? []).map((g) => ({ ...g, cards: g.cards.filter((c) => !doneIds.has(c.instance.id)) })).filter((g) => g.cards.length > 0 || (g.section && !arrange && doneCards.length === 0));
  const density = ws.prefs.defaultDensity;
  // Sections become columns on wide screens. Column count follows the number of sections actually shown (any number),
  // tracks have a maximum width so cards stay readable, and the block is centred so no space is left stranded.
  const nSections = sectionsToShow.length;
  const sectionsGridCls = clsx(
    "grid justify-center gap-x-6 gap-y-6 items-start",
    nSections >= 2 && "md:grid-cols-[repeat(2,minmax(0,28rem))]",
    nSections >= 3 && "xl:grid-cols-[repeat(3,minmax(0,28rem))]",
  );
  const gridCls = nSections === 1 ? "grid items-start justify-center gap-2.5 grid-cols-[repeat(auto-fill,minmax(19rem,26rem))]" : "grid items-start gap-2.5 grid-cols-1";
  const doneGridCls = "grid items-start gap-2.5 grid-cols-[repeat(auto-fill,minmax(19rem,26rem))]";

  const renderCard = (c: DayCard, i: number, n: number) => (
    <li key={c.instance.id} className="min-w-0">
      <ActivityCard card={c} ws={ws} sections={ws.sections as Section[]} canMoveUp={i > 0} canMoveDown={i < n - 1} onEdit={(x) => openEdit(x.instance.id)} onDelete={setDeleting} onMove={move} onReschedule={(card, mode) => setResched({ card, mode })} />
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-3 md:px-8 md:pt-8">
      {/* header: the date and Add are the primary controls; progress and view options stay compact and secondary */}
      <header className="mb-3">
        <div className="flex items-center gap-1">
          <IconButton label={t("Previous day")} bare className="-ml-2.5 text-muted" onClick={() => void shiftDate(-1)}><ChevronLeft size={22} /></IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-[28px] leading-none md:text-4xl">{title}</h1>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPickerOpen(true)} aria-label={t("{date}. Choose a date", { date: formatLong(date) })} className="-my-1 inline-flex min-h-11 items-center gap-1 rounded-lg pr-1 text-[15px] text-muted hover:text-fg" aria-live="polite">
                <span className="md:hidden">{relKind === "upcoming" || relKind === "earlier" ? formatShort(date) : formatDayMonth(date)}</span>
                <span className="hidden md:inline">{formatLong(date)}</span>
                <ChevronDown size={14} aria-hidden />
              </button>
              {date !== today && <button type="button" onClick={() => void setDate(today)} className="-my-1 inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] font-medium text-accent hover:underline">{t("Today")}</button>}
            </div>
          </div>
          <IconButton label={t("Next day")} bare className="text-muted" onClick={() => void shiftDate(1)}><ChevronRight size={22} /></IconButton>
          <Button variant="primary" onClick={() => openCreate(date)} aria-label={t("Add card")} className="ml-1"><Plus size={20} aria-hidden /> <span className="md:hidden">{t("Add")}</span><span className="hidden md:inline">{t("Add card")}</span></Button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="shrink-0 text-sm text-muted" aria-live="polite">{summary ? (summary.total === 0 ? t("Nothing planned") : t("{done} of {total} done", { done: summary.done, total: summary.total })) : "\u00a0"}</p>
          <ProgressBar fraction={summary && summary.total ? summary.done / summary.total : 0} label={t("Day progress")} className="h-1 max-w-48 flex-1" />
          <div className="ml-auto flex items-center">
            <Menu.Root>
              <Menu.Trigger asChild>
                <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-medium text-fg hover:bg-surface-2 data-[state=open]:bg-surface-2"><SlidersHorizontal size={16} aria-hidden /> {t("View")} <span className="sr-only">{density === "compact" ? t("options: compact cards") : t("options: comfortable cards")}</span></button>
              </Menu.Trigger>
              <ViewMenu density={density} onDensity={(d) => void setViewDensity(d)} collapseDone={collapseDone} onCollapseDone={setCollapseDone} />
            </Menu.Root>
            <Menu.Root>
              <Menu.Trigger asChild><IconButton label={t("More day options")} bare className="-mr-2 text-muted"><MoreHorizontal size={20} /></IconButton></Menu.Trigger>
              <DayMenu onSearch={() => setSearchOpen(true)} onArrange={() => setArrange(true)} onSections={() => setSectionsOpen(true)} onApply={() => setApplyOpen(true)} onSave={() => setSaveOpen(true)} />
            </Menu.Root>
          </div>
        </div>
      </header>

      <CarryOver />

      {arrange && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
          <p className="text-[15px]">{t("Arranging: drag the handles, or use the arrows and section menus.")}</p>
          <Button small variant="primary" onClick={() => setArrange(false)}>{t("Done")}</Button>
        </div>
      )}

      {dayError ? (
        <div role="alert" className="rounded-2xl border border-danger/50 bg-surface p-6 text-center">
          <p className="font-medium">{t("Couldn’t load this day.")}</p>
          <p className="mt-1 text-[15px] text-muted">{dayError}</p>
          <Button className="mt-4" onClick={() => void refresh()}>{t("Try again")}</Button>
        </div>
      ) : !view ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : totalCards === 0 ? (
        <Empty date={date} onAdd={() => openCreate(date)} onApply={() => setApplyOpen(true)} />
      ) : arrange ? (
        <ArrangeView view={view} sections={ws.sections} onChange={(l) => void reorder(l)} />
      ) : (
        <div className={clsx("space-y-5 transition-opacity", dayLoading && "opacity-70")}>
          <div className={sectionsGridCls}>
          {sectionsToShow.map((g) => {
            const Icon = g.section ? ICONS[g.section.icon] : null;
            const hid = `sec-${g.section?.id ?? "none"}`;
            return (
              <section key={g.section?.id ?? "none"} aria-labelledby={hid} className="min-w-0">
                {(g.section || sectionsToShow.length > 1) && (
                  <div className="mb-1.5 flex items-center gap-2 px-0.5">
                    {Icon && <Icon size={17} className="text-accent" aria-hidden />}
                    <h2 id={hid} className="text-base font-semibold text-fg">{g.section?.name ?? t("Anytime")}</h2>
                    <span className="rounded-full bg-surface-2 px-2 text-sm tabular-nums text-muted">{g.cards.length}</span>
                    {g.section && <button className="ml-auto hidden min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:bg-surface hover:text-fg md:inline-flex" onClick={() => openCreate(date, { sectionId: g.section!.id })}>{t("+ Add")}</button>}
                  </div>
                )}
                {g.cards.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center text-[15px] text-muted">{t("Nothing here yet.")}</p>
                ) : (
                  <ul className={gridCls}>{g.cards.map((c, i) => renderCard(c, i, g.cards.length))}</ul>
                )}
              </section>
            );
          })}
          </div>

          {doneCards.length > 0 && (
            <details open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)} className="group mx-auto max-w-[56rem] rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] font-semibold text-muted"><Check size={16} aria-hidden /> {t("Done")} ({doneCards.length}) <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" aria-hidden /></summary>
              <ul className={clsx(doneGridCls, "p-2.5 pt-0")}>{doneCards.map((c, i) => renderCard(c, i, doneCards.length))}</ul>
            </details>
          )}

          {view.skipped.length > 0 && (
            <details className="mx-auto max-w-[56rem] rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><FastForward size={16} aria-hidden /> {t("Skipped")} ({view.skipped.length})</summary>
              <ul className="divide-y divide-line">
                {view.skipped.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">{c.instance.spec.title} <span className="text-sm text-muted">· {t("skipped, not failed")}</span></span>
                    {c.canEdit && <Button small onClick={() => void act((p) => p.setSkipped(c.instance.id, c.instance.date, false), { done: t("Restored") })}>{t("Restore")}</Button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.hidden.length > 0 && (
            <details className="mx-auto max-w-[56rem] rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] text-muted"><EyeOff size={16} aria-hidden /> {t("Hidden from my day")} ({view.hidden.length})</summary>
              <ul className="divide-y divide-line">
                {view.hidden.map((c) => (
                  <li key={c.instance.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">{c.instance.spec.title}</span>
                    <Button small onClick={() => void act((p) => p.setPlacementFlags(c.instance, { hidden: false }), { done: t("Shown again") })}>{t("Show")}</Button>
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

const menuItem = "flex min-h-11 cursor-default items-center gap-3 rounded-xl px-3 text-[15px] outline-none data-[highlighted]:bg-white/10";
const menuBox = "z-50 min-w-64 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-lg";

/** "View": how the day is displayed. Card size is a saved preference. */
function ViewMenu({ density, onDensity, collapseDone, onCollapseDone }: { density: "compact" | "comfortable"; onDensity: (d: "compact" | "comfortable") => void; collapseDone: boolean; onCollapseDone: (b: boolean) => void }) {
  const t = useT();
  return (
    <Menu.Portal>
      <Menu.Content align="end" sideOffset={6} className={menuBox}>
        <Menu.Label className="px-3 pb-1 pt-1.5 text-sm font-semibold text-muted">{t("Card size")}</Menu.Label>
        <Menu.RadioGroup value={density} onValueChange={(v) => onDensity(v as "compact" | "comfortable")}>
          {([["compact", t("Compact"), t("More activities on screen")], ["comfortable", t("Comfortable"), t("Larger photos and room to breathe")]] as const).map(([v, label, hint]) => (
            <Menu.RadioItem key={v} value={v} className={clsx(menuItem, "items-start py-2")}>
              <span className="mt-0.5 grid size-4 place-items-center text-accent" aria-hidden><Menu.ItemIndicator><Check size={16} /></Menu.ItemIndicator></span>
              <span><span className="block">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator className="my-1 h-px bg-line" />
        <Menu.CheckboxItem className={menuItem} checked={collapseDone} onCheckedChange={onCollapseDone}>
          <span className="grid size-4 place-items-center text-accent" aria-hidden><Menu.ItemIndicator><Check size={16} /></Menu.ItemIndicator></span> {t("Collapse done cards")}
        </Menu.CheckboxItem>
      </Menu.Content>
    </Menu.Portal>
  );
}

function DayMenu(p: { onSearch: () => void; onArrange: () => void; onSections: () => void; onApply: () => void; onSave: () => void }) {
  const t = useT();
  return (
    <Menu.Portal>
      <Menu.Content align="end" sideOffset={6} className={menuBox}>
        <Menu.Item className={menuItem} onSelect={p.onSearch}><Search size={16} aria-hidden /> {t("Search…")}</Menu.Item>
        <Menu.Item className={menuItem} onSelect={p.onArrange}><ListOrdered size={16} aria-hidden /> {t("Arrange cards")}</Menu.Item>
        <Menu.Item className={menuItem} onSelect={p.onSections}><Rows3 size={16} aria-hidden /> {t("Edit sections")}</Menu.Item>
        <Menu.Item className={menuItem} onSelect={p.onApply}><LayoutTemplate size={16} aria-hidden /> {t("Apply a day layout…")}</Menu.Item>
        <Menu.Item className={menuItem} onSelect={p.onSave}><LayoutTemplate size={16} aria-hidden /> {t("Save day as layout…")}</Menu.Item>
        <Menu.Separator className="my-1 h-px bg-line" />
        <Menu.Item asChild className={menuItem}><Link href="/settings"><Settings size={16} aria-hidden /> {t("Settings")}</Link></Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}

function Empty({ date, onAdd, onApply }: { date: string; onAdd: () => void; onApply: () => void }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <h2 className="text-xl font-semibold">{t("A clear day")}</h2>
      <p className="mx-auto mt-2 max-w-sm text-muted">{t("Nothing is planned for {date}. Add a card, or start from a saved day layout.", { date: formatLong(date) })}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onAdd}><Plus size={18} aria-hidden /> {t("Add card")}</Button>
        <Button onClick={onApply}>{t("Apply a layout")}</Button>
      </div>
    </div>
  );
}

void (null as unknown as ID);
