"use client";
import * as Menu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleHelp,
  Clock,
  Copy,
  EyeOff,
  Trash2,
  FastForward,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Users,
  Minus,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DayCard } from "@/lib/domain/dayview";
import { formatTimeRange } from "@/lib/domain/dates";
import { frontText, peopleLine } from "@/lib/domain/front";
import { newBlock, uid } from "@/lib/domain/factory";
import { fmtNum, isTracking, blockFraction, blockComplete, relevantBlocks } from "@/lib/domain/progress";
import type { ChecklistBlock, ID, ProgressBlock, ResponsibilityBlock, Section, Workspace } from "@/lib/domain/types";
import { useApp } from "@/store/app";
import { activityStyle } from "@/lib/ui/activity";
import { useUi } from "@/store/ui";
import { ActivityPanel, ActivityVisual, CoverBackground, CoverBanner, hasImage, PROGRESS_FILL, ProgressBar, RichText } from "./bits";
import { IconButton, inputCls } from "./ui";

export type MoveRequest = { dir?: -1 | 1; sectionId?: ID | null };

interface Props {
  card: DayCard;
  ws: Workspace;
  sections: Section[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (c: DayCard) => void;
  onDelete: (c: DayCard) => void;
  onMove: (c: DayCard, m: MoveRequest) => void;
  onReschedule: (c: DayCard, mode: "move" | "copy") => void;
}

const FLIP_OUT_MS = 150;

type FlipOpts = { tracking?: boolean };

export function ActivityCard(props: Props) {
  const [face, setFace] = useState<"front" | "back">("front");
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const flipBtnRef = useRef<HTMLButtonElement>(null);
  const topBefore = useRef<number | null>(null);
  const refocus = useRef(false);
  const toTracking = useRef(false);
  const arrive = useRef(false);
  const id = props.card.instance.id;

  const flip = useCallback(
    (opts?: FlipOpts) => {
      if (phase !== "idle") return;
      toTracking.current = !!opts?.tracking;
      topBefore.current = rootRef.current?.getBoundingClientRect().top ?? null;
      setPhase("out");
    },
    [phase],
  );

  // phase machine: out → swap face → in → idle. Only one face is ever in the DOM, so the hidden face
  // can't be focused or read by assistive tech.
  useEffect(() => {
    if (phase === "out") {
      const t = setTimeout(() => {
        refocus.current = true;
        setFace((f) => (f === "front" ? "back" : "front"));
        setPhase("in");
      }, FLIP_OUT_MS);
      return () => clearTimeout(t);
    }
    if (phase === "in") {
      const t = setTimeout(() => setPhase("idle"), 200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // keep the user's place: the card's top edge stays where it was; move focus to the control that replaced the one they used
  useLayoutEffect(() => {
    if (phase !== "in" || !refocus.current) return;
    refocus.current = false;
    const el = rootRef.current;
    if (el && topBefore.current !== null) {
      const delta = el.getBoundingClientRect().top - topBefore.current;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
      const r = el.getBoundingClientRect();
      if (face === "back" && r.top < 56) window.scrollBy({ top: r.top - 72, behavior: "instant" as ScrollBehavior });
    }
    const track = face === "back" && toTracking.current ? (el?.querySelector("[data-track-first]:not(:disabled)") as HTMLElement | null) : null;
    toTracking.current = false;
    (track ?? flipBtnRef.current)?.focus({ preventScroll: true });
  }, [phase, face]);

  // Deep link ("show me this activity"): open the card's details, scroll it into view once, then move focus to its close control.
  useEffect(
    () =>
      useUi.subscribe((st) => {
        const t = st.openTarget;
        if (!t || t.id !== id) return;
        arrive.current = true;
        setFace("back");
        useUi.getState().consumeTarget(t.nonce);
      }),
    [id],
  );
  useEffect(() => {
    if (face !== "back" || !arrive.current) return;
    arrive.current = false;
    const el = rootRef.current;
    if (!el) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    flipBtnRef.current?.focus({ preventScroll: true });
  }, [face]);

  return (
    <div ref={rootRef} id={`card-${id}`} data-card-id={id} className={clsx("scroll-mt-24 [transform-style:flat]", phase === "out" && "flip-out", phase === "in" && "flip-in")}>
      {face === "front" ? <Front {...props} flipRef={flipBtnRef} onFlip={flip} /> : <Back {...props} flipRef={flipBtnRef} onFlip={flip} />}
    </div>
  );
}

/* ------------------------------------------------------------------ completion control */
/** Manual completion: a square checkbox. Always means "you decide". */
function Checkbox({ checked, disabled, onToggle, label }: { checked: boolean; disabled?: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-disabled={disabled || undefined} aria-label={label} title={disabled ? "Only editors can change this shared card’s completion" : undefined} onClick={() => !disabled && onToggle()} className={clsx("relative z-10 grid size-11 shrink-0 place-items-center rounded-full", disabled ? "cursor-not-allowed opacity-60" : "hover:bg-white/5")}>
      <span className={clsx("grid size-6 place-items-center rounded-md border-2", checked ? "border-done bg-done" : "border-muted")}>
        {checked && <Check size={16} strokeWidth={3.5} className="text-done-ink" aria-hidden />}
      </span>
    </button>
  );
}

/** Automatic completion: a progress ring. It reports progress and opens the tracking controls; it can't be ticked. */
function Ring({ fraction, complete, size = 28, accent }: { fraction: number; complete: boolean; size?: number; accent: string }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const frac = complete ? 1 : fraction;
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
        {frac > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={complete ? "var(--color-done)" : accent} strokeWidth="3.5" strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round" />}
      </svg>
      {complete && <Check size={size * 0.5} strokeWidth={3.5} className="absolute inset-0 m-auto text-done" aria-hidden />}
    </span>
  );
}

/** Completion is its own control — never part of the "open details" target. */
function CompletionControl({ card, title, onOpenTracking }: { card: DayCard; title: string; onOpenTracking: () => void }) {
  const patch = useApp((s) => s.patchProgress);
  const derived = card.instance.spec.completion.mode === "derived";
  const { complete, fraction, label } = card.progress;
  if (derived)
    return (
      <button
        type="button"
        onClick={onOpenTracking}
        aria-label={`${title}: ${complete ? "complete" : label || "not complete"}. Completes automatically. Open tracking`}
        title={`Completes automatically from ${label || "its tracking"} — select to open tracking`}
        className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/5"
      >
        <Ring fraction={fraction} complete={complete} accent={PROGRESS_FILL} />
      </button>
    );
  return <Checkbox checked={complete} disabled={!card.canProgress} label={`Mark ${title} as done`} onToggle={() => void patch(card, { completed: !complete })} />;
}

/* ------------------------------------------------------------------ front */
/** Short, plain-language relationship between the checklist/target progress and a manual card's own completion. */
function progressNote(card: DayCard): string | null {
  const manual = card.instance.spec.completion.mode === "manual";
  if (!manual || !card.progress.hasTracking) return null;
  if (card.progress.fraction >= 1 && !card.progress.complete) return "Ready to mark done";
  if (card.progress.complete && card.progress.fraction < 1) return "Marked done";
  return null;
}

type FrontProps = { card: DayCard; ws: Workspace; onFlip: (o?: FlipOpts) => void; flipRef: React.RefObject<HTMLButtonElement | null> };

/** Small "·"-separated pieces of metadata, each of which can shrink or stay whole. */
function MetaLine({ pieces, className }: { pieces: { key: string; node: React.ReactNode; grow?: boolean }[]; className?: string }) {
  return (
    <p className={clsx("flex min-w-0 items-center gap-x-1.5 text-[14px] leading-snug text-muted tabular-nums", className)}>
      {pieces.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 && <span aria-hidden className="shrink-0">·</span>}
          <span className={clsx("inline-flex items-center gap-1", p.grow ? "min-w-0 shrink" : "shrink-0 whitespace-nowrap")}>{p.node}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** The front of a card. Also used (inert) by the editor's live preview. */
export function CardFront({ card, ws, onFlip, flipRef }: FrontProps) {
  const { spec } = card.instance;
  const mode = card.presentation;
  const compact = mode === "compact";
  const cover = mode === "cover";
  const img = hasImage(spec.cover);
  const { color } = activityStyle(spec);
  const done = card.progress.complete;
  const derived = spec.completion.mode === "derived";
  const time = spec.front.showTime ? formatTimeRange(spec.time, spec.endTime) : "";
  const fp = card.progress.front;
  const showProg = spec.front.showProgress && fp.has;
  const note = showProg ? progressNote(card) : null;
  const text = spec.front.showSummary ? frontText(spec, card.summary, [time, fp.label]) : { context: "", summary: "" };
  // the progress label is dropped when the summary already says the same thing (e.g. "12 of 20 pages")
  const progText = showProg && card.summary !== fp.label ? (note === "Ready to mark done" && compact ? note : fp.label) : "";
  const people = peopleLine(spec, card.instance.groupId, ws);
  const peopleNode = people && (
    <>
      <Users size={12} aria-hidden className="shrink-0" />
      <span className="sr-only">Shared with </span>
      {people.person && <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg">{people.person.initials}</span>}
      <span className="min-w-0 truncate">{people.text}</span>
    </>
  );
  const status = done ? "Done" : derived ? "auto" : "";
  const pieces = [
    time && { key: "t", node: time },
    people && { key: "p", node: peopleNode, grow: true },
    progText && { key: "g", node: progText },
    status && { key: "s", node: done ? <span className="text-done">{status}</span> : status },
  ].filter(Boolean) as { key: string; node: React.ReactNode; grow?: boolean }[];

  const tint = { backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 9%, transparent), transparent 46%)` };
  const showBigCover = mode === "comfortable" && img;
  const panel = compact || (mode === "comfortable" && !img);

  return (
    <article aria-label={spec.title} style={showBigCover ? undefined : tint} className={clsx("relative isolate overflow-hidden rounded-2xl border bg-surface transition-colors", done ? "border-done/25" : "border-line hover:border-muted/50", done && !showBigCover && "bg-surface/80")}>
      {cover && <CoverBanner spec={spec} dim={done} className="h-[120px]" />}
      {showBigCover && (
        <>
          <div aria-hidden className={clsx("absolute inset-0", done && "opacity-60")}>
            <CoverBackground cover={spec.cover} accent={color} focus={spec.focus} />
          </div>
          <div aria-hidden className="cover-fade absolute inset-0" />
        </>
      )}
      <div className="relative flex items-stretch">
        {panel && <ActivityPanel spec={spec} dim={done} className={compact ? "w-[88px]" : "w-[104px]"} />}
        <div className={clsx("relative flex min-w-0 flex-1 items-center gap-1 pr-2", panel ? "pl-0.5" : "pl-2", compact || cover ? "min-h-[84px] py-1.5" : "min-h-[112px] py-3")}>
        {/* personal colour for cards without a leading panel: a small fixed detail, independent of progress and completion */}
        {!panel && <span aria-hidden className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full" style={{ background: color }} />}
        <CompletionControl card={card} title={spec.title} onOpenTracking={() => onFlip({ tracking: true })} />
        <div className="min-w-0 flex-1 py-1 pl-0.5">
          {/* the title is the real "open details" button; its ::after stretches over the whole card */}
          <h3 className="min-w-0">
            <button
              ref={flipRef}
              type="button"
              aria-expanded={false}
              onClick={() => onFlip()}
              className={clsx("block w-full truncate rounded-md text-left font-semibold leading-snug after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-2xl focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-focus", compact || cover ? "text-[17px]" : "text-lg", done ? "text-muted" : "text-fg")}
            >
              {spec.title || "Untitled"}
              <span className="sr-only">{done ? ", complete" : ""}. Open details</span>
            </button>
          </h3>
          {(text.context || text.summary) &&
            (compact || cover ? (
              // one line when it fits; a second line only when a detail and a summary are both worth showing
              <p className="line-clamp-2 text-[15px] leading-snug">
                {text.context && <span className="font-medium text-fg">{text.context}</span>}
                {text.context && text.summary && <span aria-hidden className="text-muted"> · </span>}
                {text.summary && <span className="text-fg/90">{text.summary}</span>}
              </p>
            ) : (
              <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-fg/90">{[text.context, text.summary].filter(Boolean).join(" · ")}</p>
            ))}
          {compact || cover ? (
            pieces.length > 0 && <MetaLine pieces={pieces} />
          ) : (
            <>
              {pieces.length > 0 && <MetaLine pieces={pieces} className="mt-1 text-[15px]" />}
              {showProg && (
                <div className="mt-2.5 flex items-center gap-3">
                  <ProgressBar fraction={fp.fraction} label={`${spec.title} progress`} accent={PROGRESS_FILL} className="min-w-24 max-w-[220px] flex-1" />
                </div>
              )}
            </>
          )}
        </div>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full text-muted"><ChevronDown size={20} /></span>
        </div>
      </div>
      {(compact || cover) && showProg && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-line/70">
          <div className="h-full" style={{ width: `${Math.round(fp.fraction * 100)}%`, background: fp.fraction >= 1 ? "var(--color-done)" : PROGRESS_FILL }} />
        </div>
      )}
    </article>
  );
}

function Front(p: Props & { onFlip: (o?: FlipOpts) => void; flipRef: React.RefObject<HTMLButtonElement | null> }) {
  return <CardFront card={p.card} ws={p.ws} onFlip={p.onFlip} flipRef={p.flipRef} />;
}

/* ------------------------------------------------------------------ back */
const Label = ({ children }: { children: React.ReactNode }) => <h4 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h4>;

const normText = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

function Back({ card, ws, sections, canMoveUp, canMoveDown, onEdit, onDelete, onMove, onReschedule, onFlip, flipRef }: Props & { onFlip: (o?: FlipOpts) => void; flipRef: React.RefObject<HTMLButtonElement | null> }) {
  const { instance: inst } = card;
  const { spec } = inst;
  const act = useApp((s) => s.act);
  const patch = useApp((s) => s.patchProgress);
  const saveCard = useApp((s) => s.saveCard);
  const [help, setHelp] = useState(false);
  const time = formatTimeRange(spec.time, spec.endTime);
  const group = ws.groups.find((g) => g.id === inst.groupId);
  const derived = spec.completion.mode === "derived";
  const nameOf = (id: ID | null) => ws.profiles.find((p) => p.id === id)?.name ?? "Unassigned";
  const rule = ws.series.find((s) => s.id === inst.seriesId);
  const counted = relevantBlocks(spec);
  const countedNames = counted.map((b) => b.title || (b.type === "checklist" ? "Checklist" : "Target"));
  const firstTracking = spec.blocks.find(isTracking)?.id;

  // never say the same thing twice: the written summary is dropped when a note already carries it
  const notes = spec.blocks.flatMap((b) => (b.type === "note" ? [normText(b.text)] : []));
  const sum = normText(spec.summary);
  const showSummary = !!sum && (!spec.summarySource || spec.summarySource.kind === "text") && !notes.some((n) => n && n.includes(sum));
  const firstNote = spec.blocks.find((b) => b.type === "note")?.id;

  const editSpec = (fn: (blocks: typeof spec.blocks) => typeof spec.blocks) => saveCard(inst, { spec: { ...spec, blocks: fn(spec.blocks) } }, "this");

  return (
    <article aria-label={`${spec.title} details`} className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4">
      {/* the photo carries over to the back as a full-bleed header, so flipping keeps the card recognisable */}
      {hasImage(spec.cover) && (
        <div className="relative -mx-4 -mt-4 mb-3">
          <CoverBanner spec={spec} className="h-36" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
        </div>
      )}
      <header className="flex items-start gap-3">
        {!hasImage(spec.cover) && <ActivityVisual spec={spec} size={44} />}
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold leading-snug">{spec.title || "Untitled"}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted">
            {time && <span className="inline-flex items-center gap-1.5"><Clock size={14} aria-hidden /> {time}</span>}
            {group && <span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden /> {group.name} · {inst.completionMode === "together" ? "complete together" : "each person completes"}</span>}
            {rule && <span className="inline-flex items-center gap-1.5"><Repeat2 size={14} aria-hidden /> Routine</span>}
          </p>
        </div>
        <IconButton ref={flipRef} label={`Close details for ${spec.title || "card"}`} aria-expanded={true} variant="outline" className="-mr-1 -mt-1" onClick={() => onFlip()}>
          <ChevronUp size={20} />
        </IconButton>
      </header>

      {derived && (
        <div className="mt-3 rounded-xl bg-bg/50 px-3 py-2">
          <div className="flex items-center gap-3">
            <Ring fraction={card.progress.fraction} complete={card.progress.complete} accent={PROGRESS_FILL} />
            <p className="min-w-0 flex-1 text-[15px]">
              <span className="font-medium">{card.progress.complete ? "Complete" : "In progress"}</span>
              {card.progress.label && <span className="text-muted"> · {card.progress.label}</span>}
              <span className="block text-sm text-muted">Completes automatically</span>
            </p>
            <button type="button" aria-label="How automatic completion works" aria-expanded={help} onClick={() => setHelp(!help)} className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:text-fg"><CircleHelp size={18} aria-hidden /></button>
          </div>
          {help && <p role="note" className="mt-1 pb-1 text-[15px] leading-snug text-muted">{counted.length ? `Done when ${countedNames.join(" and ")} ${counted.length === 1 ? "is" : "are"} complete. Update the tracking below — the card can’t be ticked by hand. Bars stop at 100%.` : "Add a checklist or target in Edit — until then this card can’t complete."}</p>}
        </div>
      )}

      {showSummary && <p className="mt-3 text-[15px] leading-snug text-fg/90">{spec.summary}</p>}

      <div className="mt-4 space-y-5">
        {spec.blocks.length === 0 && <p className="text-[15px] text-muted">Nothing here yet. Use Edit to add notes, a checklist or a target.</p>}
        {spec.blocks.map((b) => {
          if (b.type === "note")
            return <NoteView key={b.id} lead={b.id === firstNote} title={b.title} text={b.text} canEdit={card.canEdit} onSave={(text) => saveCard(inst, { spec: { ...spec, blocks: spec.blocks.map((x) => (x.id === b.id && x.type === "note" ? { ...x, text } : x)) } }, "this")} />;
          if (b.type === "checklist")
            return (
              <ChecklistView key={b.id} block={b} card={card} first={b.id === firstTracking} onToggle={(itemId, v) => void patch(card, { checks: { [itemId]: v } })} onAdd={card.canEdit ? (text) => void editSpec((bl) => bl.map((x) => (x.id === b.id && x.type === "checklist" ? { ...x, items: [...x.items, { id: uid(), text }] } : x))) : undefined} />
            );
          if (b.type === "progress") return <ProgressView key={b.id} block={b} card={card} first={b.id === firstTracking} onSet={(v) => void patch(card, { values: { [b.id]: Math.max(0, v) } })} />;
          return <ResponsibilityView key={b.id} block={b} card={card} ws={ws} nameOf={nameOf} onAssign={(aid, uidv) => void editSpec((bl) => bl.map((x) => (x.id === b.id && x.type === "responsibility" ? { ...x, assignments: x.assignments.map((a) => (a.id === aid ? { ...a, userId: uidv } : a)) } : x)))} />;
        })}
      </div>

      {card.others.length > 0 && (
        <section className="mt-5">
          <Label>Everyone’s progress</Label>
          <ul className="flex flex-wrap gap-2 text-sm">
            {card.others.map((o) => (
              <li key={o.userId} className="rounded-full border border-line px-3 py-1">{nameOf(o.userId)}: {o.complete ? "done" : "not yet"}</li>
            ))}
          </ul>
        </section>
      )}
      {!card.canProgress && group && <p className="mt-4 text-sm text-muted">Only editors can update this shared card’s completion.</p>}

      <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {!derived && card.canProgress && (
          <button
            type="button"
            aria-pressed={card.progress.complete}
            onClick={() => void patch(card, { completed: !card.progress.complete })}
            className={clsx("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold", card.progress.complete ? "border border-done/60 text-done hover:bg-done/10" : "bg-accent text-accent-ink hover:brightness-105")}
          >
            <Check size={16} aria-hidden /> {card.progress.complete ? "Done · undo" : "Mark done"}
          </button>
        )}
        {!derived && card.progress.hasTracking && (
          <button type="button" aria-label="How completion works" aria-expanded={help} onClick={() => setHelp(!help)} className="grid size-11 place-items-center rounded-full text-muted hover:text-fg"><CircleHelp size={18} aria-hidden /></button>
        )}
        {card.canEdit && (
          <button type="button" onClick={() => onEdit(card)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-medium hover:bg-surface-2">
            <Pencil size={16} aria-hidden /> Edit
          </button>
        )}
        <div className="ml-auto">
          <Menu.Root>
            <Menu.Trigger asChild>
              <IconButton label={`More actions for ${spec.title}`} variant="outline"><MoreHorizontal size={20} /></IconButton>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-2xl border border-line bg-surface-2 p-1.5 text-[15px] shadow-lg">
                {card.canEdit && <Item icon={<Pencil size={16} />} onSelect={() => onEdit(card)}>Edit…</Item>}
                <Item icon={<Copy size={16} />} onSelect={() => void act((p) => p.duplicateCard(inst), { done: "Card duplicated" })}>Duplicate</Item>
                {card.canEdit && (
                  <Item icon={<FastForward size={16} />} onSelect={() => void act((p) => p.setSkipped(inst.id, inst.date, true), { done: `Skipped “${spec.title}” for this day`, undo: () => useApp.getState().planner!.setSkipped(inst.id, inst.date, false) })}>Skip this day</Item>
                )}
                {card.canEdit && <Item icon={<CalendarClock size={16} />} onSelect={() => onReschedule(card, "move")}>Move to another day…</Item>}
                <Item icon={<CalendarPlus size={16} />} onSelect={() => onReschedule(card, "copy")}>Copy to another day…</Item>
                <Menu.Separator className="my-1 h-px bg-line" />
                <Item icon={<ArrowUp size={16} />} disabled={!canMoveUp} onSelect={() => onMove(card, { dir: -1 })}>Move up</Item>
                <Item icon={<ArrowDown size={16} />} disabled={!canMoveDown} onSelect={() => onMove(card, { dir: 1 })}>Move down</Item>
                <Menu.Sub>
                  <Menu.SubTrigger className="flex min-h-11 cursor-default items-center gap-2 rounded-xl px-3 outline-none data-[highlighted]:bg-white/10"><span className="size-4" /> Move to section…</Menu.SubTrigger>
                  <Menu.Portal>
                    <Menu.SubContent className="z-50 min-w-44 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-lg">
                      <Item onSelect={() => onMove(card, { sectionId: null })} disabled={card.placement.sectionId === null}>Anytime</Item>
                      {sections.map((s) => <Item key={s.id} onSelect={() => onMove(card, { sectionId: s.id })} disabled={card.placement.sectionId === s.id}>{s.name}</Item>)}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>
                <Menu.Separator className="my-1 h-px bg-line" />
                <Item icon={card.density === "compact" ? <Maximize2 size={16} /> : <Minimize2 size={16} />} onSelect={() => void act((p) => p.setPlacementFlags(inst, { density: card.density === "compact" ? "comfortable" : "compact" }))}>
                  {card.density === "compact" ? "Show comfortable (just this card)" : "Show compact (just this card)"}
                </Item>
                <Item icon={<EyeOff size={16} />} onSelect={() => void act((p) => p.setPlacementFlags(inst, { hidden: true }), { done: "Hidden from your day", undo: () => useApp.getState().planner!.setPlacementFlags(inst, { hidden: false }) })}>Hide from my day</Item>
                {card.canEdit && (
                  <>
                    <Menu.Separator className="my-1 h-px bg-line" />
                    <Item danger icon={<Trash2 size={16} />} onSelect={() => onDelete(card)}>Delete…</Item>
                  </>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
        {help && !derived && <p role="note" className="basis-full rounded-lg bg-surface-2 px-3 py-2 text-[15px] leading-snug text-muted">You mark this card done yourself. The lists and targets above track progress but never complete it.</p>}
      </footer>
    </article>
  );
}

function Item({ children, icon, onSelect, disabled, danger }: { children: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Menu.Item disabled={disabled} onSelect={onSelect} className={clsx("flex min-h-11 cursor-default items-center gap-2 rounded-xl px-3 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-white/10", danger && "text-danger")}>
      <span className="grid size-4 place-items-center" aria-hidden>{icon}</span>
      {children}
    </Menu.Item>
  );
}

/** A note you can edit in place; structural changes (adding/removing blocks) stay in the editor. */
function NoteView({ lead, title, text, canEdit, onSave }: { lead?: boolean; title: string; text: string; canEdit: boolean; onSave: (t: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <Label>{title || "Notes"}</Label>
        {canEdit && !editing && (
          <button type="button" onClick={() => { setDraft(text); setEditing(true); }} aria-label={`Edit ${title || "notes"}`} className="-mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={13} aria-hidden /> Edit</button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea autoFocus rows={4} aria-label={title || "Notes"} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} className={clsx(inputCls, "py-2")} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSave(draft); setBusy(false); setEditing(false); }} className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-line px-4">Cancel</button>
          </div>
        </div>
      ) : text.trim() ? (
        <RichText text={text} className={lead ? "text-[17px] text-fg" : undefined} />
      ) : (
        <p className="text-sm text-muted">Empty note</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ blocks */
function ChecklistView({ block, card, first, onToggle, onAdd }: { block: ChecklistBlock; card: DayCard; first?: boolean; onToggle: (id: ID, v: boolean) => void; onAdd?: (text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const done = block.items.filter((i) => card.state.checks[i.id]).length;
  const submit = () => {
    if (text.trim()) onAdd?.(text.trim());
    setText("");
    setAdding(false);
  };
  return (
    <section>
      <Label>
        {block.title || "Checklist"} <span className="ml-1 font-normal normal-case tracking-normal text-muted">{done}/{block.items.length}</span>
      </Label>
      <ul>
        {block.items.map((it) => {
          const on = !!card.state.checks[it.id];
          return (
            <li key={it.id} className="border-b border-line/70 last:border-0">
              <label className={clsx("flex min-h-11 items-center gap-3 py-1", card.canProgress ? "cursor-pointer" : "opacity-80")}>
                <input type="checkbox" checked={on} disabled={!card.canProgress} onChange={(e) => onToggle(it.id, e.target.checked)} {...(first && it.id === block.items[0]?.id ? { "data-track-first": "" } : {})} className="peer sr-only" />
                <span className="grid size-6 shrink-0 place-items-center rounded-md border-2 border-muted peer-checked:border-done peer-checked:bg-done peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus">
                  {on && <Check size={16} strokeWidth={3.5} className="text-done-ink" />}
                </span>
                <span className={clsx("text-[16px]", on && "text-muted line-through decoration-muted/60")}>{it.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {onAdd &&
        (adding ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder="New item" aria-label={`New item for ${block.title}`} className={inputCls} />
            <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink">Add</button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] hover:bg-surface-2">
            <Plus size={16} aria-hidden /> Add {block.noun ? block.noun.replace(/s$/, "") : "item"}
          </button>
        ))}
    </section>
  );
}

function ProgressView({ block, card, first, onSet }: { block: ProgressBlock; card: DayCard; first?: boolean; onSet: (v: number) => void }) {
  const value = card.state.values[block.id] ?? 0;
  const [draft, setDraft] = useState<string | null>(null);
  const accent = PROGRESS_FILL;
  const complete = blockComplete(block, card.state);
  return (
    <section>
      <Label>{block.title || "Progress"}</Label>
      <div className="flex items-center gap-2">
        <IconButton label={`Decrease ${block.title} by ${fmtNum(block.step)}`} disabled={!card.canProgress || value <= 0} onClick={() => onSet(value - block.step)}>
          <Minus size={18} />
        </IconButton>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-lg">
          <input
            {...(first ? { "data-track-first": "" } : {})}
            aria-label={`${block.title} value`}
            inputMode="decimal"
            disabled={!card.canProgress}
            value={draft ?? fmtNum(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null) {
                const n = Number(draft.replace(",", "."));
                if (Number.isFinite(n)) onSet(n);
                setDraft(null);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-20 rounded-lg border border-line bg-bg px-2 py-1.5 text-center"
          />
          <span className="text-muted">of {fmtNum(block.target)} {block.unit}</span>
        </div>
        <button type="button" disabled={!card.canProgress} onClick={() => onSet(value + block.step)} aria-label={`Increase ${block.title} by ${fmtNum(block.step)}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40">
          <Plus size={16} aria-hidden /> {fmtNum(block.step)}
        </button>
      </div>
      <ProgressBar className="mt-2" fraction={blockFraction(block, card.state)} label={`${block.title} progress`} accent={accent} />
      {complete && <p className="mt-1 text-sm text-muted">Target reached{value > block.target ? ` — ${fmtNum(value)} ${block.unit} so far` : ""}.</p>}
    </section>
  );
}

function ResponsibilityView({ block, card, ws, nameOf, onAssign }: { block: ResponsibilityBlock; card: DayCard; ws: Workspace; nameOf: (id: ID | null) => string; onAssign: (aid: ID, userId: ID | null) => void }) {
  const members = ws.members.filter((m) => m.groupId === card.instance.groupId);
  const canAssign = card.canEdit && !!card.instance.groupId;
  return (
    <section>
      <Label>{block.title || "Responsibilities"}</Label>
      <ul className="space-y-1">
        {block.assignments.map((a) => (
          <li key={a.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 last:border-0">
            <span>{a.label}</span>
            {canAssign ? (
              <select aria-label={`Who: ${a.label}`} value={a.userId ?? ""} onChange={(e) => onAssign(a.id, e.target.value || null)} className="min-h-11 rounded-lg border border-line bg-bg px-2 text-[15px]">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{nameOf(m.userId)}</option>
                ))}
              </select>
            ) : (
              <span className="font-medium text-accent">{nameOf(a.userId)}</span>
            )}
          </li>
        ))}
      </ul>
      {!card.instance.groupId && <p className="mt-1 text-xs text-muted">Share this card with a group to assign people.</p>}
    </section>
  );
}

void newBlock;
void isTracking;
